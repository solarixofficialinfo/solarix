import axios from "axios";

let BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

// Safety check: If running in browser on a production domain (not localhost) and BACKEND_URL points to localhost/127.0.0.1 or is empty, use the Render production backend
if (
  typeof window !== "undefined" &&
  window.location &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1" &&
  (!BACKEND_URL || BACKEND_URL.includes("localhost") || BACKEND_URL.includes("127.0.0.1"))
) {
  BACKEND_URL = "https://solarix.onrender.com";
}

export const API = BACKEND_URL ? `${BACKEND_URL.replace(/\/$/, "")}/api` : "/api";

// ─── JWT helpers ────────────────────────────────────────────────────────────

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

const isTokenExpired = (token) => {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return true;
  // Treat token as expired 30s before actual expiry for safety
  return Date.now() / 1000 + 30 > payload.exp;
};

// ─── Auth-only routes that must NEVER trigger a redirect to /login ─────────
const AUTH_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/verify-otp",
  "/auth/reset-password",
  "/auth/request-access",
];

const isAuthRoute = (url = "") =>
  AUTH_ROUTES.some((r) => url.includes(r));

// ─── Axios instance ──────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: API,
  withCredentials: true,
  timeout: 45000,  // 45 second timeout — accommodates Render cold-starts
});

// ─── Request interceptor: proactive token refresh ───────────────────────────

api.interceptors.request.use(
  async (config) => {
    // Never intercept auth calls themselves to avoid recursion
    if (isAuthRoute(config.url)) return config;

    let token = localStorage.getItem("solarix_token");
    const refreshToken = localStorage.getItem("solarix_refresh_token");

    if (token && isTokenExpired(token) && refreshToken) {
      try {
        const res = await axios.post(
          `${API}/auth/refresh`,
          { refresh_token: refreshToken },
          { timeout: 15000 }
        );
        if (res.status === 200 && res.data.token) {
          token = res.data.token;
          localStorage.setItem("solarix_token", token);
          if (res.data.refresh_token) {
            localStorage.setItem("solarix_refresh_token", res.data.refresh_token);
          }
          window.dispatchEvent(new Event("solarix:auth-refresh"));
        }
      } catch (err) {
        // Refresh failed — clear tokens and redirect if not on a public page
        localStorage.removeItem("solarix_token");
        localStorage.removeItem("solarix_refresh_token");
        const isPublicPage =
          window.location.pathname === "/login" ||
          window.location.pathname === "/register" ||
          window.location.pathname === "/forgot-password";
        if (!isPublicPage) {
          window.location.href = "/login";
        }
        return Promise.reject(buildNetworkError(err));
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(buildNetworkError(error))
);

// ─── Response interceptor: reactive 401 refresh + uniform error shaping ────

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    // If it is NOT an Axios error, pass it through directly (e.g. JS runtime error)
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;

    // ── Auto-retry once for idempotent GET requests on cold start or network hiccup ──
    if (
      originalRequest &&
      !originalRequest._retryNetwork &&
      (!originalRequest.method || originalRequest.method.toLowerCase() === "get") &&
      (error.code === "ECONNABORTED" || !error.response || (status && [502, 503, 504].includes(status)))
    ) {
      originalRequest._retryNetwork = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return api(originalRequest);
    }

    // ── Timeout or no-response → give a clear message ───────────────────────
    if (error.code === "ECONNABORTED" || !error.response) {
      const msg =
        error.code === "ECONNABORTED"
          ? "Request timed out. Please check your internet connection and try again."
          : `Cannot reach the server (${error.message || "Connection refused"}). Please make sure the backend is running and try again.`;
      return Promise.reject(new Error(msg));
    }

    // ── 401: try token refresh once, then redirect if still failing ─────────
    if (status === 401 && !originalRequest._retry && !isAuthRoute(originalRequest.url)) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem("solarix_refresh_token");

      if (refreshToken) {
        try {
          const res = await axios.post(
            `${API}/auth/refresh`,
            { refresh_token: refreshToken },
            { timeout: 15000 }
          );
          if (res.status === 200 && res.data.token) {
            const newToken = res.data.token;
            localStorage.setItem("solarix_token", newToken);
            if (res.data.refresh_token) {
              localStorage.setItem("solarix_refresh_token", res.data.refresh_token);
            }
            window.dispatchEvent(new Event("solarix:auth-refresh"));
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        } catch {
          // Refresh failed — fall through to redirect
        }
      }

      // Clear session and redirect (only if not already on a public page)
      localStorage.removeItem("solarix_token");
      localStorage.removeItem("solarix_refresh_token");
      const isPublicPage =
        window.location.pathname === "/login" ||
        window.location.pathname === "/register" ||
        window.location.pathname === "/forgot-password";
      if (!isPublicPage) {
        window.location.href = "/login";
      }
    }

    // ── 403: Check for Subscription / Plan Expiration or Limit ──────────────
    if (status === 403) {
      const detail = error.response?.data?.detail;
      const detailStr = typeof detail === "string" ? detail : JSON.stringify(detail || {});
      if (
        detailStr.includes("SUBSCRIPTION_EXPIRED") ||
        detailStr.includes("SUBSCRIPTION_REQUIRED") ||
        detailStr.includes("PLAN_LIMIT_REACHED") ||
        detailStr.includes("trial has expired") ||
        detailStr.includes("subscription has expired")
      ) {
        window.dispatchEvent(
          new CustomEvent("solarix:subscription-required", {
            detail: {
              message: typeof detail === "string" ? detail : detail?.message || "Subscription upgrade required",
              planId: detail?.plan_id,
              status: detail?.subscription_status
            }
          })
        );
      }
    }

    return Promise.reject(error);
  }
);

// ─── Build a clean Error from a network-level failure ───────────────────────

function buildNetworkError(err) {
  if (err instanceof Error) return err;
  return new Error("Unexpected network error. Please try again.");
}

export default api;

// ─── Error message extractor used throughout the app ────────────────────────

export function formatApiError(err) {
  // Log the exact response during development (Requirement 6)
  if (process.env.NODE_ENV !== "production") {
    console.log("[API Error Response Log]", err?.response || err);
  }

  // If it's not an Axios error, it's a frontend runtime/JS error or custom string
  if (!axios.isAxiosError(err)) {
    if (err instanceof Error) return err.message || String(err);
    if (typeof err === "string") return err;
    return err?.message || err?.error || JSON.stringify(err) || "An unexpected error occurred.";
  }

  // Timeout or no response (Requirement 5)
  if (!err?.response) {
    if (err?.code === "ECONNABORTED") {
      return "Request timed out. Please check your connection and try again.";
    }
    const reason = err?.message || "Connection refused";
    return `Cannot reach the server (${reason}). Please make sure the backend is running.`;
  }

  const data = err.response.data;
  const status = err.response.status;

  // HTTP 400: Show actual validation message (Requirement 2)
  if (status === 400) {
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.message === "string") return data.message;
    if (typeof data?.error === "string") return data.error;
    if (Array.isArray(data?.detail)) {
      return data.detail
        .map((e) => {
          const field = e?.loc?.slice(1).join(" → ") || "";
          return field ? `${field}: ${e?.msg}` : e?.msg || JSON.stringify(e);
        })
        .join("; ");
    }
    if (typeof data === "string" && data.length < 300) return data;
    return data?.detail || data?.message || data?.error || "Bad request. Please check your input and try again.";
  }

  // HTTP 401: Show specific invalid credentials message (Requirement 3)
  if (status === 401) {
    return "Invalid email or password.";
  }

  // HTTP 409: Show specific email already exists message (Requirement 4)
  if (status === 409) {
    return "Email already exists.";
  }

  // FastAPI validation errors (422) come as {detail: [{msg, loc, type}, ...]}
  if (Array.isArray(data?.detail)) {
    return data.detail
      .map((e) => {
        const field = e?.loc?.slice(1).join(" → ") || "";
        return field ? `${field}: ${e?.msg}` : e?.msg || JSON.stringify(e);
      })
      .join("; ");
  }

  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  if (typeof data === "string" && data.length < 300) return data;

  // HTTP status fallbacks
  switch (status) {
    case 403: return "You do not have permission to perform this action.";
    case 404: return "The requested resource was not found.";
    case 422: return "Validation error. Please review the form and try again.";
    case 500: return "Server error. Please try again in a moment.";
    case 502: return "Bad gateway. The server is temporarily unavailable.";
    case 503: return "Service unavailable. Please try again later.";
    default:  return `Unexpected error (HTTP ${status}). Please try again.`;
  }
}

export function fileUrl(fileId, download = false) {
  if (!fileId) return null;
  if (typeof fileId !== "string") return null;

  const trimmed = fileId.trim();
  if (!trimmed) return null;

  const isProduction =
    typeof window !== "undefined" &&
    window.location &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  // If a full HTTP/HTTPS URL is provided
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    if (
      trimmed.includes("localhost") ||
      trimmed.includes("127.0.0.1") ||
      trimmed.includes(":7071")
    ) {
      if (isProduction) {
        // In production, check if the URL contains a file ID pattern like /files/{id}
        const fileMatch = trimmed.match(/\/files\/([a-zA-Z0-9_-]+)/);
        if (fileMatch && fileMatch[1]) {
          const token = localStorage.getItem("solarix_token") || localStorage.getItem("token") || localStorage.getItem("access_token");
          const q = [];
          if (token) q.push(`auth=${encodeURIComponent(token)}`);
          if (download) q.push("download=1");
          return `${API}/files/${fileMatch[1]}${q.length > 0 ? `?${q.join("&")}` : ""}`;
        }
        // Dead local URL - prevent broken browser request
        return null;
      }
    } else {
      // Valid remote external URL (e.g. Supabase, CDN)
      return trimmed;
    }
  }

  // If storage path was passed (e.g. "solrix_work/.../b191ae8e-54cc-4773-a0a5-6a6b22b32a1c.png")
  let resolvedId = trimmed;
  if (trimmed.includes("/")) {
    const filename = trimmed.split("/").pop();
    const uuidMatch = filename?.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
    if (uuidMatch && uuidMatch[1]) {
      resolvedId = uuidMatch[1];
    }
  }

  const token = localStorage.getItem("solarix_token") || localStorage.getItem("token") || localStorage.getItem("access_token");
  const q = [];
  if (token) q.push(`auth=${encodeURIComponent(token)}`);
  if (download) q.push("download=1");
  return `${API}/files/${resolvedId}${q.length > 0 ? `?${q.join("&")}` : ""}`;
}

export async function downloadFile(fileId, defaultFilename = "document.pdf") {
  if (!fileId) {
    toast.error("File identifier is missing.");
    return false;
  }
  let resolvedId = String(fileId).trim();
  const uuidMatch = resolvedId.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
  if (uuidMatch && uuidMatch[1]) {
    resolvedId = uuidMatch[1];
  } else if (resolvedId.startsWith("/")) {
    resolvedId = resolvedId.replace(/^\/+/, "");
  }

  try {
    const res = await api.get(`/files/${resolvedId}`, {
      params: { download: 1 },
      responseType: "blob",
    });

    if (res.data && res.data.type === "application/json") {
      const text = await res.data.text();
      let errorMsg = "Failed to download file.";
      try {
        const json = JSON.parse(text);
        errorMsg = json.detail || json.message || errorMsg;
      } catch {
        errorMsg = text || errorMsg;
      }
      toast.error(errorMsg);
      return false;
    }

    let filename = defaultFilename;
    const disposition = res.headers ? res.headers["content-disposition"] : null;
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    const contentType = (res.headers && res.headers["content-type"]) || "application/octet-stream";
    const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.setAttribute("download", filename);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      window.URL.revokeObjectURL(blobUrl);
    }, 2000);
    return true;
  } catch (err) {
    let errorDetail = "";
    if (err.response?.data && typeof err.response.data.text === "function") {
      try {
        const txt = await err.response.data.text();
        const parsed = JSON.parse(txt);
        errorDetail = parsed.detail || parsed.message || txt;
      } catch {}
    }
    // Fallback: direct browser navigation to authenticated download URL
    try {
      const fallbackUrl = fileUrl(fileId, true);
      if (fallbackUrl) {
        window.open(fallbackUrl, "_blank");
        return true;
      }
    } catch {}
    const errMsg = errorDetail || formatApiError(err);
    toast.error(errMsg);
    return false;
  }
}
