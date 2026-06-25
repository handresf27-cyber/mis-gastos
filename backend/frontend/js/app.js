// ============ Estado global ============
const state = {
  user: null,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  months: [],
  transactions: [],
  categories: [],
  fixedPlans: [],
  editingTxId: null,
  activeView: "home",
  charts: {},
  analyticsYear: new Date().getFullYear(),
  analyticsMonth: new Date().getMonth() + 1,
};

const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const cop = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

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
  // Mostrar botones de admin solo si el usuario es admin
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !data.user.is_admin);
  });
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

  const titles = { home: "Inicio", metrics: "Analítica", cards: "Tarjetas de Crédito", funds: "Fondos administrados", categories: "Categorías", admin: "Administración" };
  document.getElementById("topbar-title").firstChild.textContent = (titles[view] || view) + " ";

  // El navegador de meses solo aplica a home
  const monthDependentViews = ["home"];
  document.getElementById("month-nav").style.display = monthDependentViews.includes(view) ? "" : "none";

  if (view === "home") loadHome();
  if (view === "metrics") loadAnalytics();
  if (view === "cards") loadCards();
  if (view === "funds") loadFunds();
  if (view === "admin") loadAdmin();
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
  else if (state.activeView === "metrics") loadAnalytics();
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
            <div class="tx-meta">${escapeHtml(t.category || "Otros")}${t.receipt_url ? ' <span class="receipt-badge">📎</span>' : ''}</div>
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

const COMP_START_YEAR = 2026;
const HORMIGA_THRESHOLD = 30000;
const DONUT_COLORS = ["#6c8fc7","#e2685a","#5bbf8a","#f0a44b","#9b7ed4","#4bb8cc","#e8784d","#7dba5e","#c46faa","#8d97a7"];

function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
}

function prevMonthOf(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

// ============================================================
// ANALÍTICA
// ============================================================

async function loadAnalytics(year, month) {
  if (year !== undefined) state.analyticsYear = year;
  if (month !== undefined) state.analyticsMonth = month;
  const y = state.analyticsYear, m = state.analyticsMonth;

  // Actualizar nav de mes
  document.getElementById("analytics-month-label").textContent =
    `${MONTH_NAMES[m - 1].charAt(0).toUpperCase() + MONTH_NAMES[m - 1].slice(1)} ${y}`;

  const prev = prevMonthOf(y, m);

  const [summary, prevSummary, categories, txs, plans] = await Promise.all([
    Api.summary(y, m).catch(() => null),
    Api.summary(prev.year, prev.month).catch(() => null),
    Api.categoryBreakdown(y, m).catch(() => []),
    Api.listTransactions(y, m).catch(() => []),
    Api.listFixedPlans(y, m).catch(() => []),
  ]);

  if (summary) {
    renderKPIs(summary, prevSummary, categories);
    renderAlerts(summary, prevSummary, txs);
    renderDonut(categories);
    renderHormiga(txs);
    renderFixedCommitments(plans, summary);
  }

  // Histórico anual
  loadMetrics(state.compYear || y);
}

// Mes anterior / siguiente en analítica
document.getElementById("analytics-prev-month").addEventListener("click", () => {
  const p = prevMonthOf(state.analyticsYear, state.analyticsMonth);
  loadAnalytics(p.year, p.month);
});
document.getElementById("analytics-next-month").addEventListener("click", () => {
  let { analyticsYear: y, analyticsMonth: m } = state;
  m === 12 ? (y += 1, m = 1) : m++;
  loadAnalytics(y, m);
});

function renderKPIs(summary, prevSummary, categories) {
  const net = summary.net_income || 0;
  const expenses = summary.total_expenses || 0;
  const saved = net - expenses;
  const savingsRate = net > 0 ? (saved / net * 100) : 0;
  const srColor = savingsRate >= 20 ? "kpi-green" : savingsRate >= 10 ? "kpi-yellow" : "kpi-red";

  const today = new Date();
  const isCurrentMonth = state.analyticsYear === today.getFullYear() && state.analyticsMonth === (today.getMonth() + 1);
  const daysElapsed = isCurrentMonth ? today.getDate() : 30;
  const dailyAvg = summary.total_variable / daysElapsed;

  let varChange = null, varClass = "";
  if (prevSummary && prevSummary.total_expenses > 0) {
    varChange = ((expenses - prevSummary.total_expenses) / prevSummary.total_expenses * 100);
    varClass = varChange > 0 ? "kpi-red" : "kpi-green";
  }

  const topCat = categories.length > 0
    ? categories.reduce((a, b) => b.total > a.total ? b : a)
    : null;

  document.getElementById("kpi-grid").innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Tasa de ahorro</div>
      <div class="kpi-value ${srColor}">${savingsRate.toFixed(1)}%</div>
      <div class="kpi-sub">${saved >= 0 ? cop(saved) + " ahorrado" : cop(Math.abs(saved)) + " en déficit"}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Gasto diario promedio</div>
      <div class="kpi-value">${cop(dailyAvg)}</div>
      <div class="kpi-sub">en ${daysElapsed} días</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">vs mes anterior</div>
      <div class="kpi-value ${varClass}">${varChange !== null ? (varChange > 0 ? "+" : "") + varChange.toFixed(1) + "%" : "—"}</div>
      <div class="kpi-sub">${varChange !== null ? cop(expenses) + " este mes" : "sin datos previos"}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Categoría top</div>
      <div class="kpi-value kpi-text">${topCat ? escapeHtml(topCat.category) : "—"}</div>
      <div class="kpi-sub">${topCat ? cop(topCat.total) : ""}</div>
    </div>
  `;
}

function renderAlerts(summary, prevSummary, txs) {
  const net = summary.net_income || 0;
  const expenses = summary.total_expenses || 0;
  const savingsRate = net > 0 ? ((net - expenses) / net * 100) : 0;
  const alerts = [];

  if (net > 0 && expenses > net) {
    alerts.push({ cls: "alert-danger", icon: "🚨", text: `Gastaste ${cop(expenses - net)} más de lo que ganaste este mes.` });
  } else if (savingsRate < 10 && net > 0) {
    alerts.push({ cls: "alert-warning", icon: "⚠️", text: `Tasa de ahorro muy baja: ${savingsRate.toFixed(0)}%. Lo recomendado es al menos 20%.` });
  } else if (savingsRate >= 30) {
    alerts.push({ cls: "alert-success", icon: "✅", text: `Excelente tasa de ahorro: ${savingsRate.toFixed(0)}%.` });
  }

  if (prevSummary && prevSummary.total_expenses > 0) {
    const chg = ((expenses - prevSummary.total_expenses) / prevSummary.total_expenses * 100);
    if (chg > 25) alerts.push({ cls: "alert-warning", icon: "📈", text: `Los gastos totales subieron ${chg.toFixed(0)}% vs el mes anterior.` });
    else if (chg < -15) alerts.push({ cls: "alert-success", icon: "📉", text: `Los gastos totales bajaron ${Math.abs(chg).toFixed(0)}% vs el mes anterior. ¡Buen trabajo!` });
  }

  const hormigaTx = txs.filter(t => t.type === "variable" && t.amount > 0 && t.amount < HORMIGA_THRESHOLD);
  const hormigaTotal = hormigaTx.reduce((s, t) => s + t.amount, 0);
  if (hormigaTx.length >= 5) {
    const pct = net > 0 ? (hormigaTotal / net * 100).toFixed(1) : "?";
    alerts.push({ cls: "alert-warning", icon: "🐜", text: `${hormigaTx.length} gastos hormiga suman ${cop(hormigaTotal)} — ${pct}% de tu ingreso neto.` });
  }

  const fixedPct = net > 0 ? (summary.total_fixed / net * 100) : 0;
  if (fixedPct > 65) alerts.push({ cls: "alert-warning", icon: "🔒", text: `Los compromisos fijos consumen el ${fixedPct.toFixed(0)}% de tu ingreso neto.` });

  const el = document.getElementById("analytics-alerts");
  el.innerHTML = alerts.length
    ? alerts.map(a => `<div class="alert-item ${a.cls}"><span class="alert-icon">${a.icon}</span><span>${a.text}</span></div>`).join("")
    : "";
}

function renderDonut(categories) {
  destroyChart("donut");
  const varCats = categories.filter(c => c.total > 0);
  const el = document.getElementById("chart-donut");
  if (!varCats.length) { el.parentElement.innerHTML += `<div class="hormiga-empty">Sin gastos variables este mes</div>`; return; }
  const total = varCats.reduce((s, c) => s + c.total, 0);
  state.charts.donut = new Chart(el, {
    type: "doughnut",
    data: {
      labels: varCats.map(c => c.category),
      datasets: [{
        data: varCats.map(c => c.total),
        backgroundColor: DONUT_COLORS.slice(0, varCats.length),
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      cutout: "62%",
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#8d97a7", font: { size: 11 }, boxWidth: 12, padding: 10 } },
        tooltip: { callbacks: { label: (ctx) => ` ${cop(ctx.parsed)} · ${(ctx.parsed / total * 100).toFixed(1)}%` } },
      },
    },
  });
}

function renderHormiga(txs) {
  const hormiga = txs.filter(t => t.type === "variable" && t.amount > 0 && t.amount < HORMIGA_THRESHOLD);
  const total = hormiga.reduce((s, t) => s + t.amount, 0);
  const byCategory = {};
  hormiga.forEach(t => { const c = t.category || "Otros"; byCategory[c] = (byCategory[c] || 0) + t.amount; });
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  const el = document.getElementById("hormiga-list");
  if (!hormiga.length) {
    el.innerHTML = `<div class="hormiga-empty">Sin gastos hormiga este mes 🎉<br><small>Gastos menores a ${cop(HORMIGA_THRESHOLD)}</small></div>`;
    return;
  }
  el.innerHTML = `
    <div class="hormiga-summary">${hormiga.length} gastos · <strong>${cop(total)}</strong> en total</div>
    ${sorted.map(([cat, amt]) => `
      <div class="hormiga-row">
        <span class="hormiga-cat">${escapeHtml(cat)}</span>
        <span class="hormiga-amt">${cop(amt)}</span>
      </div>`).join("")}
    <div class="hormiga-note">Gastos menores a ${cop(HORMIGA_THRESHOLD)}</div>
  `;
}

function renderFixedCommitments(plans, summary) {
  const net = summary.net_income || 1;
  const total = plans.reduce((s, p) => s + p.amount, 0);
  const pct = net > 0 ? Math.round(total / net * 100) : 0;
  const executed = plans.filter(p => p.is_executed).length;
  const el = document.getElementById("fixed-commitments-list");

  if (!plans.length) {
    el.innerHTML = `<div class="hormiga-empty">Sin gastos fijos registrados este mes</div>`;
    return;
  }
  el.innerHTML = `
    <div class="commitments-header">
      <span>${cop(total)} comprometidos — <strong>${pct}%</strong> del ingreso neto</span>
      <span class="commitments-progress">${executed}/${plans.length} ejecutados</span>
    </div>
    ${[...plans].sort((a, b) => b.amount - a.amount).map(p => {
      const itemPct = net > 0 ? Math.round(p.amount / net * 100) : 0;
      return `<div class="commitment-row${p.is_executed ? " done" : ""}">
        <span class="commitment-name">${escapeHtml(p.name)}</span>
        <div class="commitment-bar-wrap"><div class="commitment-bar" style="width:${Math.min(itemPct * 1.5, 100)}%"></div></div>
        <span class="commitment-pct">${itemPct}%</span>
        <span class="commitment-amt">${cop(p.amount)}</span>
        <span class="commitment-check">${p.is_executed ? "✓" : ""}</span>
      </div>`;
    }).join("")}
  `;
}

function renderCompYearTabs(selectedYear) {
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + 1;
  const tabs = document.getElementById("comp-year-tabs");
  tabs.innerHTML = "";
  for (let y = COMP_START_YEAR; y <= maxYear; y++) {
    const btn = document.createElement("button");
    btn.className = "comp-year-tab" + (y === selectedYear ? " active" : "");
    btn.textContent = y;
    btn.addEventListener("click", () => loadMetrics(y));
    tabs.appendChild(btn);
  }
}

async function loadMetrics(year) {
  year = year || state.compYear || COMP_START_YEAR;
  state.compYear = year;
  renderCompYearTabs(year);
  document.getElementById("comp-chart-title").textContent = `Fijos vs Variables — ${year}`;

  let trend = [];
  try { trend = await Api.yearlyTrend(year); } catch (_) {}

  renderComparisonChart(trend);
  renderComparisonTable(trend);
}

function renderComparisonChart(trend) {
  destroyChart("comparison");

  // Armar los 12 meses con ceros por defecto
  const fixedData    = Array(12).fill(0);
  const variableData = Array(12).fill(0);
  trend.forEach((p) => {
    fixedData[p.month - 1]    = p.total_fixed    || 0;
    variableData[p.month - 1] = p.total_variable || 0;
  });

  const ctx = document.getElementById("chart-comparison");
  state.charts.comparison = new Chart(ctx, {
    type: "bar",
    data: {
      labels: MONTH_SHORT,
      datasets: [
        {
          label: "Gastos Fijos",
          data: fixedData,
          backgroundColor: "rgba(108,143,199,0.85)",
          borderRadius: 5,
          maxBarThickness: 28,
        },
        {
          label: "Gastos Variables",
          data: variableData,
          backgroundColor: "rgba(226,104,90,0.85)",
          borderRadius: 5,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#8d97a7", font: { size: 11 } },
        },
        y: {
          grid: { color: "#2a3342" },
          ticks: { color: "#8d97a7", callback: (v) => {
            if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
            if (v >= 1_000) return "$" + (v / 1_000).toFixed(0) + "K";
            return "$" + v;
          }},
        },
      },
    },
  });
}

function renderComparisonTable(trend) {
  const byMonth = {};
  trend.forEach((p) => { byMonth[p.month] = p; });

  let totalFixed = 0, totalVariable = 0;
  const tbody = document.getElementById("comp-table-body");

  tbody.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const p = byMonth[m];
    if (!p) {
      return `<tr class="comp-row-empty">
        <td>${MONTH_NAMES[i].charAt(0).toUpperCase() + MONTH_NAMES[i].slice(1)}</td>
        <td class="num" colspan="3" style="color:var(--text-faint)">Sin datos</td>
      </tr>`;
    }
    totalFixed    += p.total_fixed    || 0;
    totalVariable += p.total_variable || 0;
    const total = (p.total_fixed || 0) + (p.total_variable || 0);
    const fixedPct = total > 0 ? Math.round(((p.total_fixed || 0) / total) * 100) : 0;
    return `<tr>
      <td>${MONTH_NAMES[i].charAt(0).toUpperCase() + MONTH_NAMES[i].slice(1)}</td>
      <td class="num" style="color:var(--fixed-color)">${cop(p.total_fixed || 0)}</td>
      <td class="num" style="color:var(--negative)">${cop(p.total_variable || 0)}</td>
      <td class="num">
        ${cop(total)}
        <div class="comp-bar-mini">
          <div class="comp-bar-fixed" style="width:${fixedPct}%"></div>
        </div>
      </td>
    </tr>`;
  }).join("");

  const grandTotal = totalFixed + totalVariable;
  document.getElementById("comp-table-foot").innerHTML = `
    <tr class="comp-total-row">
      <td><strong>Total año</strong></td>
      <td class="num" style="color:var(--fixed-color)"><strong>${cop(totalFixed)}</strong></td>
      <td class="num" style="color:var(--negative)"><strong>${cop(totalVariable)}</strong></td>
      <td class="num"><strong>${cop(grandTotal)}</strong></td>
    </tr>`;
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

  // Soporte: visible solo al editar
  document.getElementById("receipt-section").style.display = tx ? "" : "none";
  if (tx) renderReceiptPreview(tx);

  modal.classList.remove("hidden");
}

function closeTxModal() {
  modal.classList.add("hidden");
  formTx.reset();
  state.editingTxId = null;
  document.getElementById("receipt-preview-area").innerHTML = "";
  document.getElementById("receipt-upload-label").style.display = "";
  document.getElementById("receipt-upload-text").textContent = "📎 Subir imagen o PDF (máx. 10 MB)";
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
// SOPORTE / COMPROBANTE (receipt)
// ============================================================

function renderReceiptPreview(tx) {
  const area = document.getElementById("receipt-preview-area");
  const uploadLabel = document.getElementById("receipt-upload-label");
  const uploadText = document.getElementById("receipt-upload-text");

  if (!tx || !tx.receipt_url) {
    area.innerHTML = "";
    uploadLabel.style.display = "";
    uploadText.textContent = "📎 Subir imagen o PDF (máx. 10 MB)";
    return;
  }

  const url = tx.receipt_url;
  const isPdf = /\.pdf(\?|$)/i.test(url) || url.includes("application/pdf");

  if (isPdf) {
    area.innerHTML = `
      <div class="receipt-file-row">
        <span class="receipt-icon">📄</span>
        <span class="receipt-name">Comprobante PDF</span>
        <a href="${url}" target="_blank" rel="noopener" class="btn-text receipt-view-btn">Ver PDF</a>
        <button class="receipt-delete-btn" type="button">🗑 Eliminar</button>
      </div>`;
  } else {
    area.innerHTML = `
      <div class="receipt-file-row receipt-image-row">
        <img src="${url}" class="receipt-thumb" alt="Soporte" />
        <div class="receipt-image-actions">
          <button class="btn-text receipt-view-btn" type="button">🔍 Ver imagen</button>
          <button class="receipt-delete-btn" type="button">🗑 Eliminar</button>
        </div>
      </div>`;
    area.querySelector(".receipt-thumb").addEventListener("click", () => openLightbox(url));
    area.querySelector(".receipt-view-btn").addEventListener("click", () => openLightbox(url));
  }

  uploadLabel.style.display = "none";

  area.querySelector(".receipt-delete-btn").addEventListener("click", async () => {
    if (!state.editingTxId) return;
    if (!confirm("¿Eliminar el soporte adjunto?")) return;
    try {
      const updated = await Api.deleteReceipt(state.editingTxId);
      const idx = state.transactions.findIndex((t) => t.id === updated.id);
      if (idx >= 0) state.transactions[idx] = updated;
      renderReceiptPreview(updated);
      showToast("Soporte eliminado");
    } catch (err) { showToast(err.message); }
  });
}

document.getElementById("receipt-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !state.editingTxId) return;

  const textEl = document.getElementById("receipt-upload-text");
  textEl.textContent = "Subiendo...";

  try {
    const updated = await Api.uploadReceipt(state.editingTxId, file);
    const idx = state.transactions.findIndex((t) => t.id === updated.id);
    if (idx >= 0) state.transactions[idx] = updated;
    renderReceiptPreview(updated);
    showToast("Soporte subido correctamente");
  } catch (err) {
    showToast(err.message);
    textEl.textContent = "📎 Subir imagen o PDF (máx. 10 MB)";
  }
});

// Lightbox para previsualizar imágenes
function openLightbox(url) {
  document.getElementById("lightbox-img").src = url;
  document.getElementById("lightbox").classList.remove("hidden");
}

function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden");
  document.getElementById("lightbox-img").src = "";
}

document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
document.getElementById("lightbox-backdrop").addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });

// ============================================================
// FONDOS ADMINISTRADOS
// ============================================================

const FUND_MOVE_TYPES = {
  "Ingreso":             { icon: "💰", dir: "in",  color: "var(--positive)" },
  "Retiro":              { icon: "💸", dir: "out", color: "var(--negative)" },
  "Préstamo otorgado":   { icon: "🤝", dir: "out", color: "#d4a843" },
  "Cobro préstamo":      { icon: "↩️", dir: "in",  color: "var(--positive)" },
  "CDT apertura":        { icon: "🏦", dir: "out", color: "var(--fixed-color)" },
  "CDT rendimiento":     { icon: "📈", dir: "in",  color: "var(--positive)" },
  "Intereses":           { icon: "📈", dir: "in",  color: "var(--positive)" },
  "Otros":               { icon: "📋", dir: "in",  color: "var(--text-muted)" },
};

function fundMoveDir(amount) { return amount >= 0 ? "in" : "out"; }

async function loadFunds() {
  try {
    const funds = await Api.listFunds();
    state.funds = funds;
    renderFunds(funds);
  } catch (err) { showToast(err.message); }
}

function renderFunds(funds) {
  const container = document.getElementById("funds-list");
  if (!funds.length) {
    container.innerHTML = `<div class="fp-empty" style="margin-top:24px;">No tienes fondos registrados.<br>Crea uno con el botón de arriba.</div>`;
    return;
  }

  container.innerHTML = funds.map((fund) => {
    const totalIn  = fund.movements.filter(m => m.amount > 0).reduce((s, m) => s + m.amount, 0);
    const totalOut = fund.movements.filter(m => m.amount < 0).reduce((s, m) => s + Math.abs(m.amount), 0);

    // Movimientos ordenados por fecha desc para mostrar los más recientes primero
    const sorted = [...fund.movements].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    // Saldo corrido (cronológico asc)
    let running = 0;
    const balanceMap = {};
    [...fund.movements].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).forEach(m => {
      running += m.amount;
      balanceMap[m.id] = running;
    });

    const movsHtml = sorted.length ? sorted.map((m) => {
      const meta = FUND_MOVE_TYPES[m.move_type] || FUND_MOVE_TYPES["Otros"];
      const isIn = m.amount >= 0;
      const sign = isIn ? "+" : "−";
      const color = isIn ? "var(--positive)" : "var(--negative)";
      return `
        <div class="fund-mov-row" data-fund-id="${fund.id}" data-mov-id="${m.id}">
          <div class="fund-mov-icon">${meta.icon}</div>
          <div class="fund-mov-info">
            <div class="fund-mov-desc">${escapeHtml(m.description)}</div>
            <div class="fund-mov-meta">
              <span class="fund-type-badge">${escapeHtml(m.move_type)}</span>
              ${dateLabel(m.date)}
              ${m.notes ? `· <em>${escapeHtml(m.notes)}</em>` : ""}
            </div>
          </div>
          <div class="fund-mov-right">
            <div class="fund-mov-amount tabular" style="color:${color}">${sign}${cop(Math.abs(m.amount))}</div>
            <div class="fund-mov-balance tabular">= ${cop(balanceMap[m.id])}</div>
          </div>
        </div>`;
    }).join("") : `<div class="fp-empty">Sin movimientos. Registra el primero con el botón +.</div>`;

    return `
      <div class="fund-block" id="fund-block-${fund.id}">
        <div class="fund-head">
          <div class="fund-head-info">
            <div class="fund-name">🏦 ${escapeHtml(fund.name)}</div>
            ${fund.description ? `<div class="fund-desc-text">${escapeHtml(fund.description)}</div>` : ""}
          </div>
          <div class="fund-head-actions">
            <button class="btn-icon fund-add-mov-btn" data-fund-id="${fund.id}" title="Agregar movimiento">+</button>
            <button class="btn-icon fund-edit-btn" data-fund-id="${fund.id}" title="Editar fondo">✎</button>
          </div>
        </div>
        <div class="fund-summary">
          <div class="fund-summary-item">
            <div class="fund-summary-label">Saldo actual</div>
            <div class="fund-summary-val tabular ${fund.balance >= 0 ? "positive" : "negative"}">${cop(fund.balance)}</div>
          </div>
          <div class="fund-summary-item">
            <div class="fund-summary-label">Total entradas</div>
            <div class="fund-summary-val tabular positive">+${cop(totalIn)}</div>
          </div>
          <div class="fund-summary-item">
            <div class="fund-summary-label">Total salidas</div>
            <div class="fund-summary-val tabular negative">−${cop(totalOut)}</div>
          </div>
        </div>
        <div class="fund-movs">${movsHtml}</div>
      </div>`;
  }).join("");

  // Listeners
  container.querySelectorAll(".fund-add-mov-btn").forEach(btn =>
    btn.addEventListener("click", () => openFundMovModal(parseInt(btn.dataset.fundId)))
  );
  container.querySelectorAll(".fund-edit-btn").forEach(btn =>
    btn.addEventListener("click", () => openFundModal(parseInt(btn.dataset.fundId)))
  );
  container.querySelectorAll(".fund-mov-row").forEach(row =>
    row.addEventListener("click", () => openFundMovModal(
      parseInt(row.dataset.fundId), parseInt(row.dataset.movId)
    ))
  );
}

// ---- Modal de fondo ----
let _editingFundId = null;

function openFundModal(fundId = null) {
  _editingFundId = fundId;
  const fund = fundId ? (state.funds || []).find(f => f.id === fundId) : null;
  document.getElementById("fund-modal-title").textContent = fund ? "Editar fondo" : "Nuevo fondo";
  document.getElementById("fund-name").value = fund ? fund.name : "";
  document.getElementById("fund-desc").value = fund ? (fund.description || "") : "";
  document.getElementById("fund-modal-delete").classList.toggle("hidden", !fund);
  document.getElementById("modal-fund").classList.remove("hidden");
  document.getElementById("fund-name").focus();
}

function closeFundModal() { document.getElementById("modal-fund").classList.add("hidden"); }

document.getElementById("fund-modal-close").addEventListener("click", closeFundModal);
document.getElementById("fund-modal-cancel").addEventListener("click", closeFundModal);
document.getElementById("add-fund-btn").addEventListener("click", () => openFundModal());

document.getElementById("fund-modal-save").addEventListener("click", async () => {
  const name = document.getElementById("fund-name").value.trim();
  if (!name) { showToast("Escribe el nombre del fondo"); return; }
  const description = document.getElementById("fund-desc").value.trim() || null;
  try {
    if (_editingFundId) {
      await Api.updateFund(_editingFundId, { name, description });
    } else {
      await Api.createFund({ name, description });
    }
    closeFundModal();
    loadFunds();
  } catch (err) { showToast(err.message); }
});

document.getElementById("fund-modal-delete").addEventListener("click", async () => {
  if (!_editingFundId) return;
  const fund = (state.funds || []).find(f => f.id === _editingFundId);
  if (!confirm(`¿Eliminar el fondo "${fund?.name}"?\nSe borrarán todos sus movimientos.`)) return;
  try {
    await Api.deleteFund(_editingFundId);
    closeFundModal();
    loadFunds();
  } catch (err) { showToast(err.message); }
});

// ---- Modal de movimiento ----
let _movFundId = null;
let _editingMovId = null;

function openFundMovModal(fundId, movId = null) {
  _movFundId = fundId;
  _editingMovId = movId;

  const fund = (state.funds || []).find(f => f.id === fundId);
  const mov = movId ? (fund?.movements || []).find(m => m.id === movId) : null;

  document.getElementById("fund-mov-title").textContent = mov ? "Editar movimiento" : "Nuevo movimiento";
  document.getElementById("fund-mov-amount").value = mov ? Math.abs(mov.amount) : "";
  document.getElementById("fund-mov-desc").value = mov ? mov.description : "";
  document.getElementById("fund-mov-notes").value = mov ? (mov.notes || "") : "";
  document.getElementById("fund-mov-type").value = mov ? mov.move_type : "Ingreso";

  // fecha: hoy o la del movimiento
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("fund-mov-date").value = mov ? mov.date : today;

  // dirección
  const dir = mov ? (mov.amount >= 0 ? "in" : "out") : "in";
  document.querySelectorAll("#fund-direction-toggle button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.dir === dir);
  });

  document.getElementById("fund-mov-delete").classList.toggle("hidden", !mov);
  document.getElementById("modal-fund-mov").classList.remove("hidden");
  document.getElementById("fund-mov-desc").focus();
}

function closeFundMovModal() { document.getElementById("modal-fund-mov").classList.add("hidden"); }

document.getElementById("fund-mov-close").addEventListener("click", closeFundMovModal);
document.getElementById("fund-mov-cancel").addEventListener("click", closeFundMovModal);

document.querySelectorAll("#fund-direction-toggle button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#fund-direction-toggle button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// Al cambiar el tipo, sugiere la dirección automáticamente
document.getElementById("fund-mov-type").addEventListener("change", () => {
  const type = document.getElementById("fund-mov-type").value;
  const meta = FUND_MOVE_TYPES[type];
  if (!meta) return;
  const dir = meta.dir;
  document.querySelectorAll("#fund-direction-toggle button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.dir === dir);
  });
});

document.getElementById("fund-mov-save").addEventListener("click", async () => {
  const absAmount = parseFloat(document.getElementById("fund-mov-amount").value);
  const description = document.getElementById("fund-mov-desc").value.trim();
  const move_type = document.getElementById("fund-mov-type").value;
  const date = document.getElementById("fund-mov-date").value;
  const notes = document.getElementById("fund-mov-notes").value.trim() || null;

  if (!description) { showToast("Escribe una descripción"); return; }
  if (!absAmount || absAmount <= 0) { showToast("Ingresa un valor mayor a 0"); return; }
  if (!date) { showToast("Selecciona una fecha"); return; }

  const activeDir = document.querySelector("#fund-direction-toggle button.active")?.dataset.dir;
  const amount = activeDir === "out" ? -absAmount : absAmount;

  const body = { date, amount, move_type, description, notes };
  try {
    if (_editingMovId) {
      await Api.updateFundMovement(_movFundId, _editingMovId, body);
    } else {
      await Api.addFundMovement(_movFundId, body);
    }
    closeFundMovModal();
    loadFunds();
  } catch (err) { showToast(err.message); }
});

document.getElementById("fund-mov-delete").addEventListener("click", async () => {
  if (!_editingMovId) return;
  if (!confirm("¿Eliminar este movimiento?")) return;
  try {
    await Api.deleteFundMovement(_movFundId, _editingMovId);
    closeFundMovModal();
    loadFunds();
  } catch (err) { showToast(err.message); }
});

// ============================================================
// ADMINISTRACIÓN DE USUARIOS
// ============================================================

async function loadAdmin() {
  if (!state.user?.is_admin) { switchView("home"); return; }
  try {
    const users = await Api.adminListUsers();
    renderAdminUsers(users);
  } catch (err) { showToast(err.message); }
}

function renderAdminUsers(users) {
  const MONTH_NAMES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  document.getElementById("admin-subtitle").textContent = `${users.length} usuario${users.length !== 1 ? "s" : ""} registrado${users.length !== 1 ? "s" : ""}`;

  document.getElementById("admin-users-list").innerHTML = users.map((u) => {
    const d = new Date(u.created_at);
    const dateStr = `${d.getDate()} ${MONTH_NAMES_ES[d.getMonth()]} ${d.getFullYear()}`;
    return `
      <div class="admin-user-row ${u.is_admin ? "admin-user-me" : ""}">
        <div class="admin-user-info">
          <div class="admin-user-name">${escapeHtml(u.full_name || "—")} ${u.is_admin ? '<span class="admin-badge">Admin</span>' : ""}</div>
          <div class="admin-user-email">${escapeHtml(u.email)}</div>
          <div class="admin-user-meta">${u.transaction_count} movimientos · registrado ${dateStr}</div>
        </div>
        ${!u.is_admin ? `<button class="btn-danger admin-del-btn" data-uid="${u.id}" data-email="${escapeHtml(u.email)}">Eliminar</button>` : ""}
      </div>`;
  }).join("") || `<div class="fp-empty">Sin usuarios.</div>`;

  document.querySelectorAll(".admin-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = parseInt(btn.dataset.uid);
      const email = btn.dataset.email;
      if (!confirm(`¿Eliminar la cuenta de "${email}"?\nSe borrarán todos sus datos (movimientos, planes, tarjetas).`)) return;
      try {
        await Api.adminDeleteUser(uid);
        showToast("Usuario eliminado");
        loadAdmin();
      } catch (err) { showToast(err.message); }
    });
  });
}

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

  // totales globales
  let grandMonthly = 0, grandDebt = 0;
  cards.forEach((card) => {
    const totalPurchases = card.purchases.reduce((s, p) => s + p.total_amount, 0);
    const totalPaid = (card.payments || []).reduce((s, p) => s + p.amount, 0);
    const cardBalance = Math.max(0, totalPurchases - totalPaid);
    grandDebt += cardBalance;
    const cardFees = card.purchases
      .filter((p) => !purchaseStatus(p).finished)
      .reduce((s, p) => s + purchaseStatus(p).monthlyFee, 0);
    grandMonthly += Math.min(cardFees, cardBalance);
  });
  document.getElementById("cards-total-monthly").textContent = cop(grandMonthly);
  document.getElementById("cards-total-debt").textContent = cop(grandDebt);

  if (!cards.length) {
    list.innerHTML = `<div class="fp-empty" style="margin-top:24px;">No tienes tarjetas registradas.<br>Agrega tu primera con el botón arriba.</div>`;
    return;
  }

  const MONTH_NAMES_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  list.innerHTML = cards.map((card) => {
    const payments = card.payments || [];
    const totalPurchases = card.purchases.reduce((s, p) => s + p.total_amount, 0);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const balanceDue = totalPurchases - totalPaid;
    const activePurchases = card.purchases.filter((p) => !purchaseStatus(p).finished);
    const cardMonthly = Math.min(
      activePurchases.reduce((s, p) => s + purchaseStatus(p).monthlyFee, 0),
      Math.max(0, balanceDue)
    );

    const purchasesHtml = card.purchases.length
      ? card.purchases.map((p) => {
          const s = purchaseStatus(p);
          const startLabel = `${MONTH_NAMES_SHORT[p.first_payment_month - 1]} ${p.first_payment_year}`;
          return `
            <div class="purchase-row${s.finished ? " purchase-done" : ""}" data-purchase-id="${p.id}" data-card-id="${card.id}">
              <div class="purchase-top">
                <div class="purchase-desc">${escapeHtml(p.description)}</div>
                <div class="purchase-fee tabular" style="color:${s.finished ? "var(--text-faint)" : card.color}">${s.finished ? "Pagada" : cop(s.monthlyFee) + "/mes"}</div>
              </div>
              <div class="purchase-meta">${p.purchase_date ? `<span class="purchase-date-badge">${fmtDate(p.purchase_date)}</span> · ` : ""}${cop(p.total_amount)} · ${p.installments} cuota${p.installments > 1 ? "s" : ""} · desde ${startLabel}</div>
              <div class="purchase-progress">
                <div class="progress-bar"><div class="progress-fill" style="width:${s.pct}%;background:${card.color}"></div></div>
                <div class="progress-label">${s.paid}/${p.installments} cuotas · ${s.finished ? "Terminada" : "Falta " + cop(s.remainingAmount)}</div>
              </div>
            </div>`;
        }).join("")
      : `<div class="fp-empty" style="padding:12px 16px;">Sin compras registradas.</div>`;

    const paymentsHtml = payments.length
      ? [...payments].sort((a, b) => b.date.localeCompare(a.date)).map((p) => `
          <div class="payment-row" data-payment-id="${p.id}" data-card-id="${card.id}">
            <div class="payment-icon">💳</div>
            <div class="payment-info">
              <div class="payment-desc">${p.notes ? escapeHtml(p.notes) : "Pago a tarjeta"}</div>
              <div class="payment-date">${dateLabel(p.date)}</div>
            </div>
            <div class="payment-amount tabular positive">−${cop(p.amount)}</div>
          </div>`).join("")
      : "";

    const debtColor = balanceDue > 0 ? "var(--negative)" : "var(--positive)";

    return `
      <div class="credit-card-block" id="card-block-${card.id}">
        <div class="credit-card-head">
          <div class="cc-chip" style="background:${card.color}"></div>
          <div class="cc-info">
            <div class="cc-name">${escapeHtml(card.name)}</div>
            <div class="cc-monthly tabular">${cop(cardMonthly)}<span class="cc-monthly-label">/mes estimado</span></div>
          </div>
          <div class="cc-actions">
            <button class="btn-icon pay-card-btn" data-card-id="${card.id}" title="Registrar pago">💳</button>
            <button class="btn-icon add-purchase-btn" data-card-id="${card.id}" title="Agregar compra">+</button>
            <button class="btn-icon edit-card-btn" data-card-id="${card.id}" title="Editar tarjeta">✎</button>
            <button class="btn-icon cc-toggle-btn" data-card-id="${card.id}" title="Expandir / colapsar">▾</button>
          </div>
        </div>

        <div class="card-balance-bar">
          <div class="card-balance-item">
            <div class="card-balance-label">Total compras</div>
            <div class="card-balance-val tabular">${cop(totalPurchases)}</div>
          </div>
          <div class="card-balance-item">
            <div class="card-balance-label">Total pagado</div>
            <div class="card-balance-val tabular positive">−${cop(totalPaid)}</div>
          </div>
          <div class="card-balance-item card-balance-debt">
            <div class="card-balance-label">Saldo que debes</div>
            <div class="card-balance-val tabular" style="color:${debtColor}">${cop(Math.abs(balanceDue))}${balanceDue <= 0 ? " ✓" : ""}</div>
          </div>
        </div>

        <div class="cc-section-label">Compras / cuotas</div>
        <div class="purchases-list">${purchasesHtml}</div>

        ${payments.length ? `<div class="cc-section-label">Pagos realizados</div><div class="payments-list">${paymentsHtml}</div>` : ""}
      </div>`;
  }).join("");

  // Listeners
  list.querySelectorAll(".pay-card-btn").forEach((btn) =>
    btn.addEventListener("click", () => openPaymentModal(parseInt(btn.dataset.cardId)))
  );
  list.querySelectorAll(".add-purchase-btn").forEach((btn) =>
    btn.addEventListener("click", () => openPurchaseModal(parseInt(btn.dataset.cardId)))
  );
  list.querySelectorAll(".edit-card-btn").forEach((btn) =>
    btn.addEventListener("click", () => openCardModal(parseInt(btn.dataset.cardId)))
  );
  list.querySelectorAll(".purchase-row").forEach((row) =>
    row.addEventListener("click", () => openPurchaseModal(parseInt(row.dataset.cardId), parseInt(row.dataset.purchaseId)))
  );
  list.querySelectorAll(".payment-row").forEach((row) =>
    row.addEventListener("click", () => openPaymentModal(parseInt(row.dataset.cardId), parseInt(row.dataset.paymentId)))
  );
  list.querySelectorAll(".cc-toggle-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const block = document.getElementById(`card-block-${btn.dataset.cardId}`);
      const collapsed = block.classList.toggle("cc-collapsed");
      btn.textContent = collapsed ? "▸" : "▾";
    })
  );
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

// ---- Modal de pago ----
let _paymentCardId = null;
let _editingPaymentId = null;

function openPaymentModal(cardId, paymentId = null) {
  _paymentCardId = cardId;
  _editingPaymentId = paymentId;
  const card = (state.creditCards || []).find(c => c.id === cardId);
  const payment = paymentId ? (card?.payments || []).find(p => p.id === paymentId) : null;
  document.getElementById("payment-modal-title").textContent =
    payment ? `Editar pago — ${card?.name}` : `Registrar pago — ${card?.name}`;
  document.getElementById("payment-amount").value = payment ? payment.amount : "";
  document.getElementById("payment-date").value = payment ? payment.date : new Date().toISOString().slice(0, 10);
  document.getElementById("payment-notes").value = payment ? (payment.notes || "") : "";
  document.getElementById("payment-modal-delete").classList.toggle("hidden", !payment);
  document.getElementById("modal-payment").classList.remove("hidden");
  document.getElementById("payment-amount").focus();
}

function closePaymentModal() { document.getElementById("modal-payment").classList.add("hidden"); }

document.getElementById("payment-modal-close").addEventListener("click", closePaymentModal);
document.getElementById("payment-modal-cancel").addEventListener("click", closePaymentModal);

document.getElementById("payment-modal-save").addEventListener("click", async () => {
  const amount = parseFloat(document.getElementById("payment-amount").value);
  const date = document.getElementById("payment-date").value;
  const notes = document.getElementById("payment-notes").value.trim() || null;
  if (!amount || amount <= 0) { showToast("Ingresa un valor mayor a 0"); return; }
  if (!date) { showToast("Selecciona una fecha"); return; }
  const body = { amount, date, notes };
  try {
    if (_editingPaymentId) {
      await Api.updatePayment(_paymentCardId, _editingPaymentId, body);
    } else {
      await Api.createPayment(_paymentCardId, body);
    }
    closePaymentModal();
    loadCards();
  } catch (err) { showToast(err.message); }
});

document.getElementById("payment-modal-delete").addEventListener("click", async () => {
  if (!_editingPaymentId) return;
  if (!confirm("¿Eliminar este pago?")) return;
  try {
    await Api.deletePayment(_paymentCardId, _editingPaymentId);
    closePaymentModal();
    loadCards();
  } catch (err) { showToast(err.message); }
});

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
  document.getElementById("purchase-date").value = purchase ? (purchase.purchase_date || "") : new Date().toISOString().slice(0, 10);
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
  const purchase_date = document.getElementById("purchase-date").value || null;
  const notes = document.getElementById("purchase-notes").value.trim() || null;

  if (!description) { showToast("Escribe una descripción"); return; }
  if (!total_amount || total_amount <= 0) { showToast("Ingresa un valor mayor a 0"); return; }

  const body = { description, purchase_date, total_amount, installments, first_payment_month, first_payment_year, notes };
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
  state.compYear = new Date().getFullYear() < COMP_START_YEAR ? COMP_START_YEAR : new Date().getFullYear();
  await initMonthNav();
  state.analyticsYear = state.year;
  state.analyticsMonth = state.month;
  document.getElementById("topbar-sub").textContent = `${MONTH_NAMES[state.month - 1]} ${state.year}`;
  setExpenseTab("variable");
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
