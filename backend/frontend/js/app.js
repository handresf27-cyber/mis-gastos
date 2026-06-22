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

  const titles = { home: "Inicio", metrics: "Métricas", cards: "Tarjetas de Crédito", categories: "Categorías" };
  document.getElementById("topbar-title").firstChild.textContent = (titles[view] || view) + " ";

  // El navegador de meses solo aplica a vistas de home/metrics
  const monthDependentViews = ["home", "metrics"];
  document.getElementById("month-nav").style.display = monthDependentViews.includes(view) ? "" : "none";

  if (view === "home") loadHome();
  if (view === "metrics") loadMetrics();
  if (view === "cards") loadCards();
  if (view === "categories") loadCategories();
}

document.querySelectorAll(".nav-item[data-view], .bottom-nav button[data-view]").forEach((b) => {
  b.addEventListener("click", () => switchView(b.dataset.view));
});

// ============ Navegación de meses (año + grid de 12 meses) ============
const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

async function initMonthNav() {
  let available = [];
  try { available = await Api.availableMonths(); } catch (_) {}
  state.availableMonthSet = new Set(available.map((m) => `${m.year}-${m.month}`));
  if (!state.navYear) state.navYear = new Date().getFullYear();
  renderMonthGrid();
}

function renderMonthGrid() {
  document.getElementById("nav-year-label").textContent = state.navYear;
  const grid = document.getElementById("month-grid");
  grid.innerHTML = MONTH_SHORT.map((name, i) => {
    const m = i + 1;
    const hasData = state.availableMonthSet && state.availableMonthSet.has(`${state.navYear}-${m}`);
    const isActive = state.year === state.navYear && state.month === m;
    return `<button class="month-pill${isActive ? " active" : ""}${!hasData ? " empty" : ""}"
      data-year="${state.navYear}" data-month="${m}">${name}</button>`;
  }).join("");
  grid.querySelectorAll(".month-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      state.year = parseInt(pill.dataset.year);
      state.month = parseInt(pill.dataset.month);
      renderMonthGrid();
      refreshCurrentView();
    });
  });
}

document.getElementById("year-prev").addEventListener("click", () => {
  state.navYear = (state.navYear || new Date().getFullYear()) - 1;
  renderMonthGrid();
});
document.getElementById("year-next").addEventListener("click", () => {
  const max = new Date().getFullYear() + 1;
  if ((state.navYear || new Date().getFullYear()) < max) {
    state.navYear = (state.navYear || new Date().getFullYear()) + 1;
    renderMonthGrid();
  }
});

// ============ Tabs de gastos (fijos / variables) ============
function setExpenseTab(tab) {
  const same = state.activeExpenseTab === tab;
  state.activeExpenseTab = same ? null : tab;
  document.getElementById("tab-fixed").classList.toggle("active", state.activeExpenseTab === "fixed");
  document.getElementById("tab-variable").classList.toggle("active", state.activeExpenseTab === "variable");
  document.getElementById("panel-fixed").style.display = state.activeExpenseTab === "fixed" ? "block" : "none";
  document.getElementById("panel-variable").style.display = state.activeExpenseTab === "variable" ? "block" : "none";
}
document.getElementById("tab-fixed").addEventListener("click", () => setExpenseTab("fixed"));
document.getElementById("tab-variable").addEventListener("click", () => setExpenseTab("variable"));

function refreshCurrentView() {
  document.getElementById("topbar-sub").textContent = `${MONTH_NAMES[state.month - 1]} ${state.year}`;
  renderMonthGrid();
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
  renderPayroll(txs);

  // --- Gastos fijos planificados ---
  renderFixedPlans(plans);

  // --- Stats ---
  document.getElementById("stat-fixed").textContent = cop(summary.total_fixed);
  document.getElementById("stat-variable").textContent = cop(summary.total_variable);

  // --- Movimientos (solo gastos variables en columna derecha) ---
  renderTxList(txs, summary);
}

// ============ GASTOS FIJOS PLANIFICADOS ============
function renderFixedPlans(plans) {
  const list = document.getElementById("fixed-plans-list");
  const executed = plans.filter((p) => p.is_executed);

  document.getElementById("fp-progress").textContent =
    plans.length ? `${executed.length}/${plans.length} ejecutados` : "";

  const filterQ = (document.getElementById("filter-fixed")?.value || "").toLowerCase();

  // Transacciones fijas reales (importadas o manuales, no del checklist)
  const fixedTxs = (state.transactions || []).filter(
    (t) => t.type === "fixed" && t.notes !== "[plan-fijo]"
  );

  const visiblePlans = filterQ ? plans.filter((p) => p.name.toLowerCase().includes(filterQ)) : plans;
  const visibleTxs = filterQ ? fixedTxs.filter((t) => t.description.toLowerCase().includes(filterQ)) : fixedTxs;

  if (!visiblePlans.length && !visibleTxs.length) {
    list.innerHTML = filterQ
      ? `<div class="fp-empty">Sin resultados para "${escapeHtml(filterQ)}".</div>`
      : `<div class="fp-empty">Sin gastos fijos este mes.<br>Agrégalos abajo o copia del mes anterior.</div>`;
    return;
  }

  // Checklist de planes (con checkboxes)
  let html = visiblePlans.map((p) => `
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

  // Transacciones fijas (grupos por fecha, clicables para editar)
  if (visibleTxs.length) {
    const groups = {};
    visibleTxs.forEach((t) => { (groups[t.date] = groups[t.date] || []).push(t); });
    const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    html += dates.map((d) => `
      <div class="tx-group">
        <div class="tx-date-label">${dateLabel(d)}</div>
        ${groups[d].sort((a, b) => b.id - a.id).map((t) => `
          <div class="tx-row type-fixed" data-txid="${t.id}">
            <div class="tx-icon">📌</div>
            <div class="tx-info">
              <div class="tx-desc">${escapeHtml(t.description)}</div>
              <div class="tx-meta">${escapeHtml(t.category || "Gasto fijo")}</div>
            </div>
            <div class="tx-amount tabular" style="color:var(--fixed-color)">−${cop(t.amount)}</div>
          </div>
        `).join("")}
      </div>
    `).join("");
  }

  list.innerHTML = html;

  list.querySelectorAll(".fp-check").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await Api.toggleFixedPlan(parseInt(btn.dataset.id));
        const plans = await Api.listFixedPlans(state.year, state.month);
        state.fixedPlans = plans;
        renderFixedPlans(plans);
        loadHome();
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

  // Transacciones fijas: clic abre modal de edición
  list.querySelectorAll("[data-txid]").forEach((row) => {
    row.addEventListener("click", () => openTxModal(parseInt(row.dataset.txid)));
  });
}

// Filtro en tiempo real para gastos fijos
document.getElementById("filter-fixed").addEventListener("input", () => {
  renderFixedPlans(state.fixedPlans);
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

// Filtro de categoría para gastos variables
document.getElementById("filter-variable-cat").addEventListener("change", () => {
  renderTxList(state.transactions, state.summary);
});

function renderPayroll(txs) {
  const salaryIncomes = txs.filter((t) => t.type === "income" && t.category === "Ingreso");
  const deductions = txs.filter((t) => t.type === "deduction");

  const line = (t) => `
    <div class="payroll-line" data-id="${t.id}" style="cursor:pointer" title="Clic para editar">
      <span class="pl-name">${escapeHtml(t.description)}</span>
      <span class="pl-val tabular">${cop(t.amount)}</span>
    </div>`;

  const empty = (msg) => `<div class="pl-name" style="font-size:13px;color:var(--text-faint);padding:4px 0">${msg}</div>`;

  document.getElementById("income-list").innerHTML =
    salaryIncomes.length ? salaryIncomes.map(line).join("") : empty("Sin ingresos de nómina");
  document.getElementById("deduction-list").innerHTML =
    deductions.length ? deductions.map(line).join("") : empty("Sin deducciones registradas");

  const salaryTotal = salaryIncomes.reduce((s, t) => s + t.amount, 0);
  const deductionTotal = deductions.reduce((s, t) => s + t.amount, 0);
  const salaryNet = salaryTotal - deductionTotal;
  document.getElementById("ps-income").textContent = cop(salaryTotal);
  document.getElementById("ps-deduction").textContent = cop(deductionTotal);
  document.getElementById("ps-net").textContent = cop(salaryNet);
  document.getElementById("payroll-net").textContent = cop(salaryNet);

  document.querySelectorAll(".payroll-line").forEach((row) => {
    row.addEventListener("click", () => openTxModal(parseInt(row.dataset.id)));
  });
}


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
  const catSel = document.getElementById("filter-variable-cat");

  // Gastos variables + ingresos extra (no salario) en esta columna
  const allVars = txs.filter((t) =>
    t.type === "variable" ||
    (t.type === "income" && t.category !== "Ingreso")
  );

  // Poblar el selector de categorías conservando la selección actual
  const prevCat = catSel.value;
  const cats = [...new Set(allVars.map((t) => t.category || "Otros"))].sort();
  catSel.innerHTML = `<option value="">Todas las categorías</option>` +
    cats.map((c) => `<option value="${escapeHtml(c)}"${c === prevCat ? " selected" : ""}>${escapeHtml(c)}</option>`).join("");

  const activeCat = catSel.value;
  const expenses = activeCat ? allVars.filter((t) => (t.category || "Otros") === activeCat) : allVars;

  document.getElementById("tx-count").textContent = `${expenses.length} movimiento${expenses.length !== 1 ? "s" : ""}`;

  if (!expenses.length) {
    txList.innerHTML = `
      <div class="empty-state">
        <span class="ic">🗒️</span>
        <p><strong>${activeCat ? "Sin movimientos en esta categoría" : "Sin movimientos este mes"}</strong></p>
        <p>Toca "+" para registrar un gasto o ingreso extra.</p>
      </div>`;
    return;
  }

  // Saldo corrido: parte de (saldo anterior + nómina neta - fijos pagados - ingresos extra ya en net_income)
  // los ingresos extra se suman cronológicamente para no duplicar
  const extraIncomePre = txs.filter((t) => t.type === "income" && t.category !== "Ingreso").reduce((s, t) => s + t.amount, 0);
  const startBalance = (summary.opening_balance || 0) + (summary.net_income || 0) - (summary.total_fixed || 0) - extraIncomePre;
  const chrono = [...expenses].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const runningMap = {};
  let running = startBalance;
  chrono.forEach((t) => {
    running = t.type === "income" ? running + t.amount : running - t.amount;
    runningMap[t.id] = running;
  });

  const groups = {};
  expenses.forEach((t) => { (groups[t.date] = groups[t.date] || []).push(t); });
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  txList.innerHTML = dates.map((d) => `
    <div class="tx-group">
      <div class="tx-date-label">${dateLabel(d)}</div>
      ${groups[d].sort((a, b) => b.id - a.id).map((t) => `
        <div class="tx-row type-${t.type}" data-id="${t.id}">
          <div class="tx-icon">${TYPE_ICON[t.type]}</div>
          <div class="tx-info">
            <div class="tx-desc">${escapeHtml(t.description)}</div>
            <div class="tx-meta">${escapeHtml(t.category || "Otros")}</div>
            <div class="tx-running">Saldo: ${cop(runningMap[t.id])}</div>
          </div>
          <div class="tx-amount tabular${t.type === "income" ? " positive" : ""}">
            ${t.type === "income" ? "+" : "−"}${cop(t.amount)}
          </div>
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

  // Mostrar botones ocultos (fijo/deducción) solo al editar esos tipos
  ["fixed", "deduction"].forEach((t) => {
    const btn = document.querySelector(`#type-toggle button[data-type="${t}"]`);
    if (btn) btn.style.display = (tx?.type === t) ? "" : "none";
  });

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
  // La categoría solo aplica a gastos variables
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
  const editingTx = state.editingTxId ? state.transactions.find((t) => t.id === state.editingTxId) : null;
  const incomeCategory = (editingTx?.type === "income" && editingTx?.category === "Ingreso") ? "Ingreso" : "Otros ingresos";
  const catByType = { variable: document.getElementById("tx-category").value || "Otros", fixed: "Gasto fijo", income: incomeCategory, deduction: "Deducción nómina" };
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
    await initMonthNav();
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
    await initMonthNav();
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


// ============================================================
// TARJETAS DE CRÉDITO
// ============================================================

const CARD_COLORS = ["#8b5cf6","#e2685a","#5fb87a","#d4a843","#6c8fc7","#f472b6"];

function purchaseStatus(p) {
  const now = new Date();
  const refYear = now.getFullYear();
  const refMonth = now.getMonth() + 1;
  const monthlyFee = p.total_amount / p.installments;
  // cuotas transcurridas desde la primera cuota hasta hoy (inclusive)
  const elapsed = (refYear - p.first_payment_year) * 12 + (refMonth - p.first_payment_month) + 1;
  const paid = Math.max(0, Math.min(p.installments, elapsed));
  const remaining = p.installments - paid;
  return {
    monthlyFee,
    paid,
    remaining,
    remainingAmount: remaining * monthlyFee,
    pct: Math.round((paid / p.installments) * 100),
    finished: paid >= p.installments,
  };
}

function renderCards(cards) {
  const list = document.getElementById("cards-list");

  // total cuota mensual de todas las tarjetas (solo compras activas)
  let grandTotal = 0;
  cards.forEach((card) => {
    card.purchases.forEach((p) => {
      const s = purchaseStatus(p);
      if (!s.finished) grandTotal += s.monthlyFee;
    });
  });
  document.getElementById("cards-total-monthly").textContent = cop(grandTotal);

  if (!cards.length) {
    list.innerHTML = `<div class="fp-empty" style="margin-top:24px;">No tienes tarjetas registradas.<br>Agrega tu primera con el botón arriba.</div>`;
    return;
  }

  list.innerHTML = cards.map((card) => {
    const activePurchases = card.purchases.filter((p) => !purchaseStatus(p).finished);
    const cardMonthly = activePurchases.reduce((s, p) => s + purchaseStatus(p).monthlyFee, 0);

    const purchasesHtml = card.purchases.length
      ? card.purchases.map((p) => {
          const s = purchaseStatus(p);
          const MONTH_NAMES_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
          const startLabel = `${MONTH_NAMES_SHORT[p.first_payment_month - 1]} ${p.first_payment_year}`;
          return `
            <div class="purchase-row${s.finished ? " purchase-done" : ""}" data-purchase-id="${p.id}" data-card-id="${card.id}">
              <div class="purchase-top">
                <div class="purchase-desc">${escapeHtml(p.description)}</div>
                <div class="purchase-fee tabular" style="color:${s.finished ? "var(--text-faint)" : card.color}">${s.finished ? "Terminada" : cop(s.monthlyFee) + "/mes"}</div>
              </div>
              <div class="purchase-meta">
                ${cop(p.total_amount)} · ${p.installments} cuota${p.installments > 1 ? "s" : ""} · desde ${startLabel}
              </div>
              <div class="purchase-progress">
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${s.pct}%;background:${card.color}"></div>
                </div>
                <div class="progress-label">${s.paid}/${p.installments} · ${s.finished ? "Pagada" : "Falta " + cop(s.remainingAmount)}</div>
              </div>
            </div>`;
        }).join("")
      : `<div class="fp-empty">Sin compras registradas.</div>`;

    return `
      <div class="credit-card-block" id="card-block-${card.id}">
        <div class="credit-card-head">
          <div class="cc-chip" style="background:${card.color}"></div>
          <div class="cc-info">
            <div class="cc-name">${escapeHtml(card.name)}</div>
            <div class="cc-monthly tabular">${cop(cardMonthly)}<span class="cc-monthly-label">/mes · ${activePurchases.length} compra${activePurchases.length !== 1 ? "s" : ""} activa${activePurchases.length !== 1 ? "s" : ""}</span></div>
          </div>
          <div class="cc-actions">
            <button class="btn-icon add-purchase-btn" data-card-id="${card.id}" title="Agregar compra">+</button>
            <button class="btn-icon edit-card-btn" data-card-id="${card.id}" title="Editar tarjeta">✎</button>
          </div>
        </div>
        <div class="purchases-list">${purchasesHtml}</div>
      </div>`;
  }).join("");

  // Listeners: agregar compra
  list.querySelectorAll(".add-purchase-btn").forEach((btn) => {
    btn.addEventListener("click", () => openPurchaseModal(parseInt(btn.dataset.cardId)));
  });
  // Listeners: editar tarjeta
  list.querySelectorAll(".edit-card-btn").forEach((btn) => {
    btn.addEventListener("click", () => openCardModal(parseInt(btn.dataset.cardId)));
  });
  // Listeners: editar compra
  list.querySelectorAll(".purchase-row").forEach((row) => {
    row.addEventListener("click", () => openPurchaseModal(parseInt(row.dataset.cardId), parseInt(row.dataset.purchaseId)));
  });
}

async function loadCards() {
  try {
    const cards = await Api.listCreditCards();
    state.creditCards = cards;
    renderCards(cards);
  } catch (err) {
    showToast(err.message);
  }
}

// ---- Modal de tarjeta ----
let _editingCardId = null;

function openCardModal(cardId = null) {
  _editingCardId = cardId;
  const card = cardId ? (state.creditCards || []).find((c) => c.id === cardId) : null;
  document.getElementById("card-modal-title").textContent = card ? "Editar tarjeta" : "Nueva tarjeta";
  document.getElementById("card-name").value = card ? card.name : "";
  document.getElementById("card-modal-delete").classList.toggle("hidden", !card);

  // color picker
  const selectedColor = card ? card.color : CARD_COLORS[0];
  document.querySelectorAll(".color-dot").forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.color === selectedColor);
  });

  document.getElementById("modal-card").classList.remove("hidden");
  document.getElementById("card-name").focus();
}

function closeCardModal() {
  document.getElementById("modal-card").classList.add("hidden");
}

document.getElementById("card-modal-close").addEventListener("click", closeCardModal);
document.getElementById("card-modal-cancel").addEventListener("click", closeCardModal);

document.querySelectorAll(".color-dot").forEach((dot) => {
  dot.addEventListener("click", () => {
    document.querySelectorAll(".color-dot").forEach((d) => d.classList.remove("active"));
    dot.classList.add("active");
  });
});

document.getElementById("add-card-btn").addEventListener("click", () => openCardModal());

document.getElementById("card-modal-save").addEventListener("click", async () => {
  const name = document.getElementById("card-name").value.trim();
  if (!name) { showToast("Escribe el nombre de la tarjeta"); return; }
  const activeDot = document.querySelector(".color-dot.active");
  const color = activeDot ? activeDot.dataset.color : CARD_COLORS[0];
  try {
    if (_editingCardId) {
      await Api.updateCreditCard(_editingCardId, { name, color });
    } else {
      await Api.createCreditCard({ name, color });
    }
    closeCardModal();
    loadCards();
  } catch (err) { showToast(err.message); }
});

document.getElementById("card-modal-delete").addEventListener("click", async () => {
  if (!_editingCardId) return;
  const card = (state.creditCards || []).find((c) => c.id === _editingCardId);
  if (!confirm(`¿Eliminar la tarjeta "${card?.name}"? Se borrarán todas sus compras.`)) return;
  try {
    await Api.deleteCreditCard(_editingCardId);
    closeCardModal();
    loadCards();
  } catch (err) { showToast(err.message); }
});

// ---- Modal de compra ----
let _editingPurchaseCardId = null;
let _editingPurchaseId = null;

function openPurchaseModal(cardId, purchaseId = null) {
  _editingPurchaseCardId = cardId;
  _editingPurchaseId = purchaseId;

  const purchase = purchaseId
    ? (state.creditCards || []).flatMap((c) => c.purchases).find((p) => p.id === purchaseId)
    : null;

  document.getElementById("purchase-modal-title").textContent = purchase ? "Editar compra" : "Nueva compra / avance";
  document.getElementById("purchase-desc").value = purchase ? purchase.description : "";
  document.getElementById("purchase-amount").value = purchase ? purchase.total_amount : "";
  document.getElementById("purchase-installments").value = purchase ? purchase.installments : 1;
  document.getElementById("purchase-notes").value = purchase ? (purchase.notes || "") : "";

  const now = new Date();
  document.getElementById("purchase-month").value = purchase ? purchase.first_payment_month : (now.getMonth() + 1);
  document.getElementById("purchase-year").value = purchase ? purchase.first_payment_year : now.getFullYear();

  document.getElementById("purchase-modal-delete").classList.toggle("hidden", !purchase);
  updateFeePreview();

  document.getElementById("modal-purchase").classList.remove("hidden");
  document.getElementById("purchase-desc").focus();
}

function closePurchaseModal() {
  document.getElementById("modal-purchase").classList.add("hidden");
}

function updateFeePreview() {
  const amount = parseFloat(document.getElementById("purchase-amount").value) || 0;
  const installments = parseInt(document.getElementById("purchase-installments").value) || 1;
  document.getElementById("purchase-fee-preview").textContent = cop(installments > 0 ? amount / installments : 0);
}

document.getElementById("purchase-modal-close").addEventListener("click", closePurchaseModal);
document.getElementById("purchase-modal-cancel").addEventListener("click", closePurchaseModal);

["purchase-amount", "purchase-installments"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateFeePreview);
});

document.getElementById("purchase-modal-save").addEventListener("click", async () => {
  const description = document.getElementById("purchase-desc").value.trim();
  const total_amount = parseFloat(document.getElementById("purchase-amount").value);
  const installments = parseInt(document.getElementById("purchase-installments").value) || 1;
  const first_payment_month = parseInt(document.getElementById("purchase-month").value);
  const first_payment_year = parseInt(document.getElementById("purchase-year").value);
  const notes = document.getElementById("purchase-notes").value.trim() || null;

  if (!description) { showToast("Escribe una descripción"); return; }
  if (!total_amount || total_amount <= 0) { showToast("Ingresa un valor mayor a 0"); return; }

  const body = { description, total_amount, installments, first_payment_month, first_payment_year, notes };
  try {
    if (_editingPurchaseId) {
      await Api.updatePurchase(_editingPurchaseCardId, _editingPurchaseId, body);
    } else {
      await Api.createPurchase(_editingPurchaseCardId, body);
    }
    closePurchaseModal();
    loadCards();
  } catch (err) { showToast(err.message); }
});

document.getElementById("purchase-modal-delete").addEventListener("click", async () => {
  if (!_editingPurchaseId) return;
  if (!confirm("¿Eliminar esta compra?")) return;
  try {
    await Api.deletePurchase(_editingPurchaseCardId, _editingPurchaseId);
    closePurchaseModal();
    loadCards();
  } catch (err) { showToast(err.message); }
});

async function bootstrapApp() {
  state.categories = await Api.listCategories().catch(() => []);
  await initMonthNav();
  document.getElementById("topbar-sub").textContent = `${MONTH_NAMES[state.month - 1]} ${state.year}`;
  setExpenseTab("variable"); // abrir gastos variables por defecto
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
