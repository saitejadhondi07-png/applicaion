// Runtime configuration for IIS / Server deployments
// You can edit this file directly on the IIS server (inside the published frontend folder / wwwroot) 
// anytime AFTER deployment without needing to rebuild the React application!
window.__RUNTIME_CONFIG__ = {
  // Uncomment and set your backend API URL explicitly if needed:
  // Example 1 (Backend running on port 5191 on the server IP/Domain):
  // API_BASE_URL: "http://192.168.1.100:5191/api",
  
  // Example 2 (Backend hosted as an IIS sub-application under the website e.g. http://domain/api):
  // API_BASE_URL: "/api",

  // Example 3 (Backend on HTTPS domain):
  // API_BASE_URL: "https://api.yourcompany.com/api",

  // If commented out or null, the application will automatically fall back to:
  // 1. Build-time environment variable (VITE_API_BASE_URL) if specified when running npm run build
  // 2. Automatic host detection (e.g., http://<current-server-hostname>:5191/api) in production
  API_BASE_URL: null
};
