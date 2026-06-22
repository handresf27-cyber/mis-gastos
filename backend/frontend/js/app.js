// ============ Estado global ============
const state = {
  user: null,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  months: [],          // [{year, month}] disponibles + mes actual
  transactions: [],
  categories: [],
  fixedPlans: [],
  editingTxId: null,
  activeView: "home",
  charts: {},
};

const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const cop = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}

// ============ Auth ============
const authError = document.getElementById("auth-error");

function setAuthError(msg) {
  if (!msg) { authError.classList.add("hidden"); return; }
  authError.textContent = msg;
  authError.classList.remove("hidden");
}

document.getElementById("auth-toggle-btn").addEventListener("click", () => {
  const loginForm = document.getElementById("form-login");
  const regForm = document.getElementById("form-register");
  const showingLogin = !loginForm.classList.contains("hidden");
  loginForm.classList.toggle("hidden");
  regForm.classList.toggle("hidden");
  document.getElementById("auth-toggle-text").textContent = showingLogin ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
  document.getElementById("auth-toggle-btn").textContent = showingLogin ? "Entrar" : "Crear una";
  setAuthError(null);
});

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthError(null);
  try {
    const data = await Api.login(
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value
    );
    onLoggedIn(data);
  } catch (err) { setAuthError(err.message); }
});

document.getElementById("form-register").addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthError(null);
  try {
    const data = await Api.register(
      document.getElementById("reg-email").value.trim(),
      document.getElementById("reg-password").value,
      document.getElementById("reg-name").value.trim() || null
    );
    onLoggedIn(data);
  } catch (err) { setAuthError(err.message); }
});

function onLoggedIn(data) {
  Api.setToken(data.access_token);
  state.user = data.user;
  document.getElementById("view-auth").classList.add("hidden");
  document.getElementById("shell").classList.remove("hidden");
  document.getElementById("sidebar-user").textContent = data.user.full_name || data.user.email;
  bootstrapApp();
}

function logout() {
  Api.setToken(null);
  state.user = null;
  document.getElementById("shell").classList.add("hidden");
  document.getElementById("view-auth").classList.remove("hidden");
}

document.getElementById("logout-btn-mobile").addEventListener("click", logout);
document.getElementById("logout-btn-desktop").addEventListener("click", logout);
window.addEventListener("gastos:unauthorized", logout);

// ============ Navegación entre vistas ============
function switchView(view) {
  state.activeView = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(`view-${view}`).classList.remove("hidden");

  document.querySelectorAll(".nav-item[data-view], .bottom-nav button[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });

  const titles = { home: "Inicio", metrics: "Métricas", categories: "Categorías" };
  document.getElementById("topbar-title").firstChild.textContent = titles[view] + " ";

  if (view === "home") loadHome();
  if (view === "metrics") loadMetrics();
  if (view === "categories") loadCategories();
}

document.querySelectorAll(".nav-item[data-view], .bottom-nav button[data-view]").forEach((b) => {
  b.addEventListener("click", () => switchView(b.dataset.view));
});

// ============ Selector de mes ============
function monthLabel(year, month) {
  const txt = MONTH_NAMES[month - 1].slice(0, 3);
  return `${txt} ${String(year).slice(2)}`;
}

async function buildMonthScroller() {
  let available = [];
  try { available = await Api.availableMonths(); } catch (_) { /* nuevo usuario, sin datos aun */ }

  const now = new Date();
  const set = new Map();
  // Asegura que el mes actual y los 2 siguientes (para planear) esten disponibles
  for (let i = -1; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    set.set(key, { year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  available.forEach((m) => set.set(`${m.year}-${m.month}`, m));

  state.months = Array.from(set.values()).sort((a, b) => (b.year - a.year) || (b.month - a.month));

  const scroller = document.getElementById("month-scroller");
  scroller.innerHTML = "";
  state.months.forEach((m) => {
    const pill = document.createElement("button");
    pill.className = "month-pill" + (m.year === state.year && m.month === state.month ? " active" : "");
    pill.textContent = monthLabel(m.year, m.month);
    pill.addEventListener("click", () => {
      state.year = m.year; state.month = m.month;
      document.querySelectorAll(".month-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      refreshCurrentView();
    });
    scroller.appendChild(pill);
  });
}

function refreshCurrentView() {
  document.getElementById("topbar-sub").textContent = `${MONTH_NAMES[state.month - 1]} ${state.year}`;
  if (state.activeView === "home") loadHome();
  else if (state.activeView === "metrics") loadMetrics();
}

// ============ HOME / CONCILIACIÓN ============
async function loadHome() {
  const txList = document.getElementById("tx-list");
  txList.innerHTML = `<div class="loader">Cargando...</div>`;

  let [summary, txs, plans] = await Promise.all([
    Api.summary(state.year, state.month),
    Api.listTransactions(state.year, state.month),
    Api.listFixedPlans(state.year, state.month),
  ]);

  // Auto-cargar del mes anterior si el mes está vacío
  const hasPayroll = txs.some((t) => t.type === "income" || t.type === "deduction");
  let autoCopied = false;
  if (!hasPayroll) {
    try { await Api.copyPayroll(state.year, state.month); autoCopied = true; } catch (_) {}
  }
  if (plans.length === 0) {
    try { await Api.copyPreviousPlans(state.year, state.month); autoCopied = true; } catch (_) {}
  }
  if (autoCopied) {
    [summary, txs, plans] = await Promise.all([
      Api.summary(state.year, state.month),
      Api.listTransactions(state.year, state.month),
      Api.listFixedPlans(state.year, state.month),
    ]);
    if (!hasPayroll && txs.some((t) => t.type === "income")) showToast("Nómina y gastos fijos pre-cargados del mes anterior. Ajusta si cambiaron.");
  }

  state.fixedPlans = plans;
  state.transactions = txs;
  state.summary = summary;

  // --- Panel de conciliación ---
  const computedEl = document.getElementById("recon-computed");
  computedEl.textContent = cop(summary.computed_balance);
  computedEl.classList.toggle("negative", summary.computed_balance < 0);

  document.getElementById("val-opening").textContent = cop(summary.opening_balance);
  document.getElementById("val-net").textContent = cop(summary.net_income);
  document.getElementById("val-expenses").textContent = cop(summary.total_expenses);
  document.getElementById("val-computed").textContent = cop(summary.computed_balance);

  const statusEl = document.getElementById("recon-status");
  const diffEl = document.getElementById("recon-diff");
  const actualEl = document.getElementById("val-actual");

  if (summary.actual_bank_balance === null || summary.actual_bank_balance === undefined) {
    actualEl.textContent = "— sin ingresar —";
    actualEl.classList.add("empty");
    diffEl.textContent = "";
    diffEl.className = "recon-diff";
    statusEl.textContent = "Sin conciliar";
    statusEl.className = "recon-status pending";
    document.getElementById("recon-sub").textContent = "lo que debería quedarte este mes";
  } else {
    actualEl.textContent = cop(summary.actual_bank_balance);
    actualEl.classList.remove("empty");
    const diff = summary.reconciliation_diff;
    if (summary.is_reconciled) {
      statusEl.textContent = "✓ Conciliado";
      statusEl.className = "recon-status ok";
      diffEl.textContent = "Tu cuenta cuadra con el banco.";
      diffEl.className = "recon-diff ok";
    } else {
      statusEl.textContent = "⚠ Descuadrado";
      statusEl.className = "recon-status off";
      const signo = diff > 0 ? "más" : "menos";
      diffEl.textContent = `Tienes ${cop(Math.abs(diff))} ${signo} en el banco que lo calculado. Revisa si falta registrar algún movimiento.`;
      diffEl.className = "recon-diff off";
    }
  }

  // --- Nómina ---
  renderPayroll(txs, summary);

  // --- Gastos fijos planificados ---
  renderFixedPlans(plans);

  // --- Stats ---
  document.getElementById("stat-fixed").textContent = cop(summary.total_fixed);
  document.getElementById("stat-variable").textContent = cop(summary.total_variable);
  document.getElementById("tx-count").textContent = `${summary.transaction_count} en total`;

  // --- Movimientos (solo gastos en el listado principal) ---
  renderTxList(txs, summary);
}

// ============ GASTOS FIJOS PLANIFICADOS ============
function renderFixedPlans(plans) {
  const list = document.getElementById("fixed-plans-list");
  const total = plans.reduce((s, p) => s + p.amount, 0);
  const executed = plans.filter((p) => p.is_executed);
  const executedTotal = executed.reduce((s, p) => s + p.amount, 0);

  document.getElementById("fp-total").textContent = cop(total);
  document.getElementById("fp-progress").textContent =
    plans.length ? `${executed.length}/${plans.length} ejecutados · ${cop(executedTotal)} pagado` : "";

  if (!plans.length) {
    list.innerHTML = `<div class="fp-empty">Sin gastos fijos este mes. Agrégalos abajo o copia del mes anterior.</div>`;
    return;
  }

  list.innerHTML = plans.map((p) => `
    <div class="fp-item ${p.is_executed ? "fp-done" : ""}" data-id="${p.id}">
      <button class="fp-check" data-id="${p.id}" title="${p.is_executed ? "Marcar pendiente" : "Marcar ejecutado"}">
        ${p.is_executed ? "✓" : ""}
      </button>
      <span class="fp-name">${escapeHtml(p.name)}</span>
      <span class="fp-amount tabular">${cop(p.amount)}</span>
      <button class="fp-edit" data-id="${p.id}" title="Editar">✎</button>
      <button class="fp-del" data-id="${p.id}" title="Eliminar">✕</button>
    </div>
  `).join("");

  list.querySelectorAll(".fp-check").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await Api.toggleFixedPlan(parseInt(btn.dataset.id));
        const plans = await Api.listFixedPlans(state.year, state.month);
        state.fixedPlans = plans;
        renderFixedPlans(plans);
        loadHome(); // refresca conciliación
      } catch (err) { showToast(err.message); }
    });
  });

  list.querySelectorAll(".fp-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este gasto fijo?")) return;
      try {
        await Api.deleteFixedPlan(parseInt(btn.dataset.id));
        const plans = await Api.listFixedPlans(state.year, state.month);
        state.fixedPlans = plans;
        renderFixedPlans(plans);
        loadHome();
      } catch (err) { showToast(err.message); }
    });
  });

  list.querySelectorAll(".fp-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const plan = state.fixedPlans.find((p) => p.id === parseInt(btn.dataset.id));
      if (!plan) return;
      const newName = prompt("Nombre:", plan.name);
      if (newName === null) return;
      const newAmt = prompt("Valor (COP):", Math.round(plan.amount));
      if (newAmt === null) return;
      Api.updateFixedPlan(plan.id, { name: newName.trim() || plan.name, amount: parseFloat(newAmt) || plan.amount })
        .then(async () => {
          const plans = await Api.listFixedPlans(state.year, state.month);
          state.fixedPlans = plans;
          renderFixedPlans(plans);
          if (plan.is_executed) loadHome();
        })
        .catch((err) => showToast(err.message));
    });
  });
}

document.getElementById("fixed-plans-toggle").addEventListener("click", () => {
  document.getElementById("fixed-plans-panel").classList.toggle("open");
});

document.getElementById("add-plan-btn").addEventListener("click", async () => {
  const nameEl = document.getElementById("new-plan-name");
  const amtEl = document.getElementById("new-plan-amount");
  const name = nameEl.value.trim();
  const amount = parseFloat(amtEl.value);
  if (!name || !amount || amount <= 0) { showToast("Escribe nombre y valor"); return; }
  try {
    await Api.createFixedPlan({ name, amount, month: state.month, year: state.year });
    nameEl.value = ""; amtEl.value = "";
    const plans = await Api.listFixedPlans(state.year, state.month);
    state.fixedPlans = plans;
    renderFixedPlans(plans);
  } catch (err) { showToast(err.message); }
});

document.getElementById("copy-prev-plans-btn").addEventListener("click", async () => {
  try {
    await Api.copyPreviousPlans(state.year, state.month);
    const plans = await Api.listFixedPlans(state.year, state.month);
    state.fixedPlans = plans;
    renderFixedPlans(plans);
    showToast("Gastos fijos copiados del mes anterior");
  } catch (err) { showToast(err.message); }
});

function renderPayroll(txs, summary) {
  const salaryIncomes = txs.filter((t) => t.type === "income" && t.category === "Ingreso");
  const extraIncomes = txs.filter((t) => t.type === "income" && t.category !== "Ingreso");
  const deductions = txs.filter((t) => t.type === "deduction");

  const line = (t) => `
    <div class="payroll-line" data-id="${t.id}" style="cursor:pointer" title="Clic para editar">
      <span class="pl-name">${escapeHtml(t.description)}</span>
      <span class="pl-val tabular">${cop(t.amount)}</span>
    </div>`;

  const empty = (msg) => `<div class="pl-name" style="font-size:13px;color:var(--text-faint);padding:4px 0">${msg}</div>`;

  document.getElementById("income-list").innerHTML =
    salaryIncomes.length ? salaryIncomes.map(line).join("") : empty("Sin ingresos de nómina");
  document.getElementById("extra-income-list").innerHTML =
    extraIncomes.length ? extraIncomes.map(line).join("") : empty("—");
  document.getElementById("deduction-list").innerHTML =
    deductions.length ? deductions.map(line).join("") : empty("Sin deducciones registradas");

  document.getElementById("ps-income").textContent = cop(summary.total_income);
  document.getElementById("ps-deduction").textContent = cop(summary.total_deduction);
  document.getElementById("ps-net").textContent = cop(summary.net_income);
  document.getElementById("payroll-net").textContent = cop(summary.net_income);

  document.querySelectorAll(".payroll-line").forEach((row) => {
    row.addEventListener("click", () => openTxModal(parseInt(row.dataset.id)));
  });
}

document.getElementById("add-extra-income-btn").addEventListener("click", async () => {
  const descEl = document.getElementById("extra-income-desc");
  const amtEl = document.getElementById("extra-income-amount");
  const desc = descEl.value.trim();
  const amount = parseFloat(amtEl.value);
  if (!desc || !amount || amount <= 0) { showToast("Escribe descripción y valor"); return; }
  try {
    await Api.createTransaction({
      description: desc,
      amount,
      type: "income",
      category: "Otros ingresos",
      date: `${state.year}-${String(state.month).padStart(2, "0")}-01`,
    });
    descEl.value = ""; amtEl.value = "";
    showToast("Ingreso adicional agregado");
    loadHome();
  } catch (err) { showToast(err.message); }
});

function dateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime()) return "Hoy";
  if (d.getTime() === yesterday.getTime()) return "Ayer";
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(d);
}

const TYPE_ICON = { income: "💰", deduction: "📉", fixed: "📌", variable: "🧾" };

function renderTxList(txs, summary) {
  const txList = document.getElementById("tx-list");
  // En el listado principal mostramos solo GASTOS (nómina va en su panel).
  const expenses = txs.filter((t) => t.type === "fixed" || t.type === "variable");

  if (!expenses.length) {
    txList.innerHTML = `
      <div class="empty-state">
        <span class="ic">🗒️</span>
        <p><strong>Sin gastos este mes</strong></p>
        <p>Toca el botón "+" para registrar tu primer gasto.</p>
      </div>`;
    return;
  }

  // Saldo corrido: arranca en saldo inicial + neto, y va bajando con cada gasto
  // (ordenado de más reciente a más antiguo para mostrar el saldo después de cada uno).
  const startBalance = (summary.opening_balance || 0) + (summary.net_income || 0);
  const chrono = [...expenses].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const runningMap = {};
  let running = startBalance;
  chrono.forEach((t) => { running -= t.amount; runningMap[t.id] = running; });

  const groups = {};
  expenses.forEach((t) => { (groups[t.date] = groups[t.date] || []).push(t); });
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  txList.innerHTML = dates.map((date) => `
    <div class="tx-group">
      <div class="tx-date-label">${dateLabel(date)}</div>
      ${groups[date].sort((a,b)=>b.id-a.id).map((t) => `
        <div class="tx-row type-${t.type}" data-id="${t.id}">
          <div class="tx-icon">${TYPE_ICON[t.type]}</div>
          <div class="tx-info">
            <div class="tx-desc">${escapeHtml(t.description)}</div>
            <div class="tx-meta">${t.type === "fixed" ? "Gasto fijo" : escapeHtml(t.category || "Otros")}</div>
            <div class="tx-running">Saldo: ${cop(runningMap[t.id])}</div>
          </div>
          <div class="tx-amount tabular">${t.amount < 0 ? "+" : "−"}${cop(Math.abs(t.amount))}</div>
        </div>
      `).join("")}
    </div>
  `).join("");

  txList.querySelectorAll(".tx-row").forEach((row) => {
    row.addEventListener("click", () => openTxModal(parseInt(row.dataset.id)));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============ MÉTRICAS ============
const CHART_PALETTE = ["#d4a843", "#6c8fc7", "#5fb87a", "#e2685a", "#a47bc7", "#5fb8b0", "#c78a5f", "#8d97a7"];

async function loadMetrics() {
  const [cats, summary, trend] = await Promise.all([
    Api.categoryBreakdown(state.year, state.month),
    Api.summary(state.year, state.month),
    Api.yearlyTrend(state.year),
  ]);

  renderCategoryChart(cats);
  renderMonthChart(summary);
  renderTrendChart(trend);
}

function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
}

function renderCategoryChart(cats) {
  destroyChart("categories");
  const legend = document.getElementById("cat-legend");
  if (!cats.length) {
    legend.innerHTML = `<div class="empty-state"><p>Sin gastos variables registrados este mes.</p></div>`;
    return;
  }
  const ctx = document.getElementById("chart-categories");
  state.charts.categories = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: cats.map((c) => c.category),
      datasets: [{ data: cats.map((c) => c.total), backgroundColor: CHART_PALETTE, borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      cutout: "68%",
      maintainAspectRatio: false,
    },
  });

  legend.innerHTML = cats.map((c, i) => `
    <div class="cat-legend-row">
      <span class="sw" style="background:${CHART_PALETTE[i % CHART_PALETTE.length]}"></span>
      <span class="name">${escapeHtml(c.category)}</span>
      <span class="amt tabular">${cop(c.total)}</span>
    </div>
  `).join("");
}

function renderMonthChart(summary) {
  destroyChart("month");
  const ctx = document.getElementById("chart-month");
  state.charts.month = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Ingresos", "Fijos", "Variables"],
      datasets: [{
        data: [summary.total_income, summary.total_fixed, summary.total_variable],
        backgroundColor: ["#5fb87a", "#6c8fc7", "#e2685a"],
        borderRadius: 8,
        maxBarThickness: 60,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#8d97a7" } },
        y: { grid: { color: "#2a3342" }, ticks: { color: "#8d97a7", callback: (v) => cop(v) } },
      },
    },
  });
}

function renderTrendChart(trend) {
  destroyChart("trend");
  const ctx = document.getElementById("chart-trend");
  state.charts.trend = new Chart(ctx, {
    type: "line",
    data: {
      labels: trend.map((p) => MONTH_NAMES[p.month - 1].slice(0, 3)),
      datasets: [
        { label: "Ingresos", data: trend.map((p) => p.total_income), borderColor: "#5fb87a", backgroundColor: "rgba(95,184,122,0.12)", tension: 0.35, fill: true },
        { label: "Gastos", data: trend.map((p) => p.total_expenses), borderColor: "#e2685a", backgroundColor: "rgba(226,104,90,0.10)", tension: 0.35, fill: true },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#8d97a7" } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#8d97a7" } },
        y: { grid: { color: "#2a3342" }, ticks: { color: "#8d97a7", callback: (v) => cop(v) } },
      },
    },
  });
}

// ============ CATEGORÍAS ============
async function loadCategories() {
  state.categories = await Api.listCategories();
  renderCategoryList();
}

function renderCategoryList() {
  const list = document.getElementById("cat-list");
  list.innerHTML = state.categories.map((c) => `
    <div class="cat-manage-row">
      <span>${escapeHtml(c.name)}</span>
      <button class="del-btn" data-id="${c.id}">✕</button>
    </div>
  `).join("");
  list.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await Api.deleteCategory(parseInt(btn.dataset.id));
      loadCategories();
    });
  });
}

document.getElementById("add-cat-btn").addEventListener("click", async () => {
  const input = document.getElementById("new-cat-name");
  const name = input.value.trim();
  if (!name) return;
  await Api.createCategory(name);
  input.value = "";
  loadCategories();
});

// ============ MODAL: agregar/editar movimiento ============
const modal = document.getElementById("modal-tx");
const formTx = document.getElementById("form-tx");

function openTxModal(txId = null) {
  state.editingTxId = txId;
  const tx = txId ? state.transactions.find((t) => t.id === txId) : null;

  document.getElementById("modal-title").textContent = tx ? "Editar movimiento" : "Nuevo movimiento";
  document.getElementById("modal-delete").classList.toggle("hidden", !tx);

  setTxType(tx ? tx.type : "variable");
  document.getElementById("tx-desc").value = tx ? tx.description : "";
  document.getElementById("tx-amount").value = tx ? Math.abs(tx.amount) : "";
  document.getElementById("tx-date").value = tx ? tx.date : `${state.year}-${String(state.month).padStart(2, "0")}-${String(new Date().getDate()).padStart(2,"0")}`;
  document.getElementById("tx-notes").value = (tx && tx.notes) || "";
  populateCategorySelect(tx ? tx.category : null);

  modal.classList.remove("hidden");
}

function closeTxModal() {
  modal.classList.add("hidden");
  formTx.reset();
  state.editingTxId = null;
}

function setTxType(type) {
  document.querySelectorAll("#type-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
  // La categoría solo aplica a gastos variables.
  document.getElementById("cat-field").classList.toggle("hidden", type !== "variable");
}

document.querySelectorAll("#type-toggle button").forEach((btn) => {
  btn.addEventListener("click", () => setTxType(btn.dataset.type));
});

function populateCategorySelect(selected) {
  const sel = document.getElementById("tx-category");
  sel.innerHTML = state.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
  if (selected) sel.value = selected;
}

document.getElementById("fab-add").addEventListener("click", () => openTxModal(null));
document.getElementById("modal-close").addEventListener("click", closeTxModal);
document.getElementById("modal-cancel").addEventListener("click", closeTxModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeTxModal(); });

formTx.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = document.querySelector("#type-toggle button.active").dataset.type;
  const catByType = { variable: document.getElementById("tx-category").value, fixed: "Gasto fijo", income: "Ingreso", deduction: "Deducción nómina" };
  const payload = {
    description: document.getElementById("tx-desc").value.trim(),
    amount: parseFloat(document.getElementById("tx-amount").value),
    date: document.getElementById("tx-date").value,
    type,
    category: catByType[type] || "Otros",
    notes: document.getElementById("tx-notes").value.trim() || null,
  };

  try {
    if (state.editingTxId) await Api.updateTransaction(state.editingTxId, payload);
    else await Api.createTransaction(payload);
    closeTxModal();
    showToast("Movimiento guardado");
    await buildMonthScroller();
    refreshCurrentView();
  } catch (err) { showToast(err.message); }
});

document.getElementById("modal-delete").addEventListener("click", async () => {
  if (!state.editingTxId) return;
  if (!confirm("¿Eliminar este movimiento?")) return;
  try {
    await Api.deleteTransaction(state.editingTxId);
    closeTxModal();
    showToast("Movimiento eliminado");
    await buildMonthScroller();
    refreshCurrentView();
  } catch (err) { showToast(err.message); }
});

// ============ Panel de nómina (colapsable) ============
document.getElementById("payroll-toggle").addEventListener("click", () => {
  document.querySelector(".panel").classList.toggle("open");
});

// ============ Modal de saldos (conciliación) ============
const balanceModal = document.getElementById("modal-balance");
let balanceMode = "opening"; // "opening" o "actual"

function openBalanceModal(mode) {
  balanceMode = mode;
  const s = state.summary || {};
  if (mode === "opening") {
    document.getElementById("balance-modal-title").textContent = "Saldo anterior en cuenta";
    document.getElementById("balance-hint").textContent = "¿Cuánto tenías en la cuenta al empezar este mes? Normalmente es el saldo con el que cerraste el mes anterior.";
    document.getElementById("balance-label").textContent = "Saldo inicial (COP)";
    document.getElementById("balance-input").value = s.opening_balance || "";
    document.getElementById("use-prev-btn").style.display = "block";
  } else {
    document.getElementById("balance-modal-title").textContent = "Saldo real en tu banco";
    document.getElementById("balance-hint").textContent = "Mira tu app del banco y escribe el saldo actual de la cuenta. La app comparará con el saldo calculado para decirte si estás conciliado.";
    document.getElementById("balance-label").textContent = "Saldo en el banco (COP)";
    document.getElementById("balance-input").value = (s.actual_bank_balance !== null && s.actual_bank_balance !== undefined) ? s.actual_bank_balance : "";
    document.getElementById("use-prev-btn").style.display = "none";
  }
  balanceModal.classList.remove("hidden");
  setTimeout(() => document.getElementById("balance-input").focus(), 50);
}

function closeBalanceModal() { balanceModal.classList.add("hidden"); }

document.getElementById("row-opening").addEventListener("click", () => openBalanceModal("opening"));
document.getElementById("edit-actual-btn").addEventListener("click", () => openBalanceModal("actual"));
document.getElementById("balance-close").addEventListener("click", closeBalanceModal);
document.getElementById("balance-cancel").addEventListener("click", closeBalanceModal);
balanceModal.addEventListener("click", (e) => { if (e.target === balanceModal) closeBalanceModal(); });

document.getElementById("use-prev-btn").addEventListener("click", async () => {
  try {
    const prev = await Api.previousClosing(state.year, state.month);
    document.getElementById("balance-input").value = Math.round(prev.closing_balance);
    showToast("Saldo del mes anterior cargado");
  } catch (err) { showToast(err.message); }
});

document.getElementById("balance-save").addEventListener("click", async () => {
  const val = parseFloat(document.getElementById("balance-input").value);
  if (isNaN(val)) { showToast("Escribe un valor válido"); return; }
  const data = balanceMode === "opening" ? { opening_balance: val } : { actual_bank_balance: val };
  try {
    await Api.updateStatement(state.year, state.month, data);
    closeBalanceModal();
    showToast("Saldo guardado");
    loadHome();
  } catch (err) { showToast(err.message); }
});


async function bootstrapApp() {
  state.categories = await Api.listCategories().catch(() => []);
  await buildMonthScroller();
  document.getElementById("topbar-sub").textContent = `${MONTH_NAMES[state.month - 1]} ${state.year}`;
  switchView("home");
}

(async function init() {
  if (Api.token) {
    try {
      const user = await Api.me();
      onLoggedIn({ access_token: Api.token, user });
    } catch (_) { logout(); }
  }
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
