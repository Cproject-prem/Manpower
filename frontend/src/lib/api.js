import axios from "axios";

export function getBaseApiUrl() {
  const envUrl = (
    (typeof window !== "undefined" && window.__API_BASE__ && !window.__API_BASE__.startsWith("%"))
      ? window.__API_BASE__
      : (process.env.REACT_APP_BACKEND_URL || "")
  ).trim();

  if (envUrl) {
    return `${envUrl.replace(/\/$/, "")}/api`;
  }
  return "/api";
}

export const API = getBaseApiUrl();

const TOKEN_KEY = "cmes_token";

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
};
export const setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};
export const clearToken = () => setToken(null);

// URL helper for <img>/<a> tags — appends ?token=... so cross-origin requests work
// (localhost dev with backend on a different port, etc.)
export const docUrl = (docId) => {
  const t = getToken();
  return t ? `${API}/documents/${docId}?token=${encodeURIComponent(t)}` : `${API}/documents/${docId}`;
};

export const contractorDocUrl = (cid, docId) => {
  const t = getToken();
  return t ? `${API}/contractors/${cid}/compliance-documents/${docId}?token=${encodeURIComponent(t)}` : `${API}/contractors/${cid}/compliance-documents/${docId}`;
};

export const api = axios.create({
  baseURL: API,
  // NOTE: we intentionally do NOT set `withCredentials: true`. The backend echoes
  // `Access-Control-Allow-Origin: *` from the ingress; combining `*` with
  // credentials is invalid per spec and causes iOS Safari / Chrome Android to
  // fail login with "Network Error". Auth is carried in the Authorization
  // Bearer header from localStorage (see interceptor below).
});

// Attach Bearer token for cross-origin (localhost dev) or general robustness
api.interceptors.request.use((cfg) => {
  cfg.baseURL = getBaseApiUrl();
  const t = getToken();
  if (t) {
    cfg.headers = cfg.headers || {};
    if (!cfg.headers.Authorization) cfg.headers.Authorization = `Bearer ${t}`;
  }
  return cfg;
});

// Auto-logout on 401 so ProtectedRoute sends user to /login instead of showing a broken page
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err?.config?.url || "";
    if (err?.response?.status === 401 && !url.includes("/auth/login")) {
      clearToken();
    }
    return Promise.reject(err);
  }
);

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (detail == null) return err?.message || "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  return String(detail);
}
