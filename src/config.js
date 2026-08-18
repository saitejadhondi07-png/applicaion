// Determine API_BASE_URL dynamically to support both local development and IIS/remote Server deployment:
const getApiBaseUrl = () => {
  // Priority 1: Check runtime configuration file (public/runtime-config.js edited directly on the server)
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__ && window.__RUNTIME_CONFIG__.API_BASE_URL) {
    return window.__RUNTIME_CONFIG__.API_BASE_URL;
  }

  // Priority 2: If running in local development (Vite dev server: npm run dev), use http://localhost:5191
  if (import.meta.env && import.meta.env.DEV) {
    return 'http://localhost:5191/api';
  }

  // Priority 3: Check build-time environment variable
  if (import.meta.env && import.meta.env.VITE_API_BASE_URL && !import.meta.env.VITE_API_BASE_URL.includes('0.0.0.0') && !import.meta.env.VITE_API_BASE_URL.includes('localhost')) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // Priority 4: In production (IIS or standalone server deployment), assume backend is running on the same machine on port 5191
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    return `http://${window.location.hostname}:5191/api`;
  }

  return '/api/__UNCONFIGURED__';
};

export const API_BASE_URL = getApiBaseUrl();
