import axios from "axios";
import useStore from "../store";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  // Abort hung requests (e.g. serverless/Neon cold start) instead of spinning
  // forever — the caller's catch can then show an error and stop the spinner.
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const { auth } = useStore.getState();
    if (auth?.accessToken) {
      config.headers.Authorization = `Bearer ${auth.accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Optional: Global error handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Example: auto logout if token expired (401)
    if (error.response?.status === 401) {
      useStore.getState().logout();
    }
    // No response = timeout or network error. Give a friendly message so the UI
    // shows something useful instead of "timeout of 30000ms exceeded".
    if (!error.response) {
      error.message =
        error.code === "ECONNABORTED"
          ? "El servidor tardó demasiado en responder. Inténtalo de nuevo en unos segundos."
          : "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
    }
    return Promise.reject(error);
  }
);

export default api;
