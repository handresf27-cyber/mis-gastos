const API_BASE = (() => {
  // Mismo origen cuando el backend sirve el frontend (despliegue normal).
  // Si abres el frontend suelto (file:// o un puerto distinto en desarrollo),
  // ajusta esta URL a donde corre tu backend.
  if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
  return window.location.origin;
})();

const Api = {
  token: localStorage.getItem("gastos_token") || null,

  setToken(t) {
    this.token = t;
    if (t) localStorage.setItem("gastos_token", t);
    else localStorage.removeItem("gastos_token");
  },

  async request(path, { method = "GET", body = null } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    if (res.status === 401) {
      this.setToken(null);
      window.dispatchEvent(new Event("gastos:unauthorized"));
      throw new Error("Sesión expirada");
    }

    let data = null;
    try { data = await res.json(); } catch (_) { /* sin contenido */ }

    if (!res.ok) {
      const msg = (data && data.detail) || "Algo salió mal, intenta de nuevo";
      throw new Error(msg);
    }
    return data;
  },

  register(email, password, full_name) {
    return this.request("/api/auth/register", { method: "POST", body: { email, password, full_name } });
  },
  login(email, password) {
    return this.request("/api/auth/login", { method: "POST", body: { email, password } });
  },
  me() {
    return this.request("/api/auth/me");
  },

  listTransactions(year, month) {
    return this.request(`/api/transactions?year=${year}&month=${month}`);
  },
  createTransaction(tx) {
    return this.request("/api/transactions", { method: "POST", body: tx });
  },
  updateTransaction(id, tx) {
    return this.request(`/api/transactions/${id}`, { method: "PUT", body: tx });
  },
  deleteTransaction(id) {
    return this.request(`/api/transactions/${id}`, { method: "DELETE" });
  },
  availableMonths() {
    return this.request("/api/transactions/months/available");
  },

  summary(year, month) {
    return this.request(`/api/metrics/summary?year=${year}&month=${month}`);
  },
  categoryBreakdown(year, month) {
    return this.request(`/api/metrics/categories?year=${year}&month=${month}`);
  },
  yearlyTrend(year) {
    return this.request(`/api/metrics/trend?year=${year}`);
  },

  getStatement(year, month) {
    return this.request(`/api/statement?year=${year}&month=${month}`);
  },
  updateStatement(year, month, data) {
    return this.request(`/api/statement?year=${year}&month=${month}`, { method: "PUT", body: data });
  },
  previousClosing(year, month) {
    return this.request(`/api/statement/previous-closing?year=${year}&month=${month}`);
  },

  listFixedPlans(year, month) {
    return this.request(`/api/fixed-plans?year=${year}&month=${month}`);
  },
  createFixedPlan(body) {
    return this.request("/api/fixed-plans", { method: "POST", body });
  },
  updateFixedPlan(id, body) {
    return this.request(`/api/fixed-plans/${id}`, { method: "PATCH", body });
  },
  toggleFixedPlan(id) {
    return this.request(`/api/fixed-plans/${id}/toggle`, { method: "PATCH" });
  },
  deleteFixedPlan(id) {
    return this.request(`/api/fixed-plans/${id}`, { method: "DELETE" });
  },
  copyPreviousPlans(year, month) {
    return this.request(`/api/fixed-plans/copy-previous?year=${year}&month=${month}`, { method: "POST" });
  },

  listCategories() {
    return this.request("/api/categories");
  },
  createCategory(name) {
    return this.request("/api/categories", { method: "POST", body: { name } });
  },
  deleteCategory(id) {
    return this.request(`/api/categories/${id}`, { method: "DELETE" });
  },
};
