import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { setAccessToken } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const response = await api.get('/auth/me');
        const rawUser = response.data;
        const safeUser = {
          id: rawUser.id || rawUser.Id || '',
          name: rawUser.name || rawUser.Name || '',
          role: (rawUser.role || rawUser.Role || '').toLowerCase().trim(),
          avatar: rawUser.avatar || rawUser.Avatar || '',
        };
        setUser(safeUser);
      } catch {
        setUser(null);
        setAccessToken(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (userId, password) => {
    try {
      const response = await api.post('/auth/login', { userId, password });
      const rawUser = response.data;
      const safeUser = {
        id: rawUser.id || rawUser.Id || '',
        name: rawUser.name || rawUser.Name || '',
        role: (rawUser.role || rawUser.Role || '').toLowerCase().trim(),
        avatar: rawUser.avatar || rawUser.Avatar || '',
      };
      if (rawUser.accessToken) {
        setAccessToken(rawUser.accessToken);
      }
      setUser(safeUser);
      return safeUser;
    } catch (err) {
      throw new Error(err.response?.data?.message || 'Invalid User ID or password');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const isAuthenticated = user !== null;

  const value = useMemo(
    () => ({ user, login, logout, isAuthenticated, loading }),
    [user, login, logout, isAuthenticated, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
