import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { setTokens } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = sessionStorage.getItem('endurance_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(false); // We don't block render if we have user in sessionStorage

  const handleSetUser = (newUser) => {
    setUser(newUser);
    if (newUser) {
      sessionStorage.setItem('endurance_user', JSON.stringify(newUser));
    } else {
      sessionStorage.removeItem('endurance_user');
    }
  };

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
        handleSetUser(safeUser);
      } catch {
        handleSetUser(null);
        setTokens(null);
      } finally {
        setLoading(false);
      }
    };

    if (sessionStorage.getItem('accessToken')) {
       initAuth();
    } else {
       setLoading(false);
       handleSetUser(null);
    }
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
        setTokens(rawUser.accessToken, rawUser.refreshToken);
      }
      handleSetUser(safeUser);
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
      setTokens(null);
      handleSetUser(null);
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
