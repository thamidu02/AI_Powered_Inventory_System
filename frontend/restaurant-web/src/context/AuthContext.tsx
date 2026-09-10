import React, { useEffect, useState } from 'react';
import { api, getStoredUser } from '../services/api';
import { AuthContext } from './authContextDef';
import type { LoginResponse } from '../types';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<LoginResponse | null>(() => getStoredUser());
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setError('Your session has expired. Please log in again.');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.login({ email, password });
      setUser(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (email: string) => {
    await login(email, 'Restaurant@123');
  };

  const logout = () => {
    api.logout();
    setUser(null);
    setError(null);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        quickLogin,
        logout,
        loading,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
