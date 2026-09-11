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

// Battery pack model tested at this plant, as printed in the Model No. cell of the
// controlled report template (BTR/TL/03 Rev 03) and every signed report to date.
// This is NOT the Test Report ID: "ENE5160-BTR-PP-CDC01-DDM2601" was previously sent as
// the model number, but that string is the template's fill-in placeholder for the Test
// Report ID ("DD" = day, "M" = month letter, e.g. 25E2601 = 25 May). It was overwriting
// the correct model in the Model No. cell of every report the system generated.
// The pack rating that goes with it ("51.2V 60Ah 3.0 kWh (LFP)") is likewise fixed in the
// template. Add a picker if a second model is ever introduced.
export const MODEL_NUMBER = 'ENE-5160-15A';
