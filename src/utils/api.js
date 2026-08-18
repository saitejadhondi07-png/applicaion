import axios from 'axios';
import { API_BASE_URL } from '../config';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('accessToken') : null;

if (accessToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
}

export const setAccessToken = (token) => {
  accessToken = token;
  if (token) {
    sessionStorage.setItem('accessToken', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    sessionStorage.removeItem('accessToken');
    delete api.defaults.headers.common['Authorization'];
  }
};

export const getAccessToken = () => accessToken;

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest.url || '';

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (url.includes('/auth/refresh')) {
        setAccessToken(null);
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            originalRequest.headers['Authorization'] = `Bearer ${getAccessToken()}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          if (data.accessToken) {
            setAccessToken(data.accessToken);
            originalRequest.headers['Authorization'] = `Bearer ${data.accessToken}`;
          }
          isRefreshing = false;
          processQueue(null);
          return api(originalRequest);
        } else {
          setAccessToken(null);
          isRefreshing = false;
          processQueue(error);
          return Promise.reject(error);
        }
      } catch (err) {
        setAccessToken(null);
        isRefreshing = false;
        processQueue(err);
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
