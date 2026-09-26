import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  Utensils,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { TEST_ACCOUNTS } from '../types';

export const LoginView: React.FC = () => {
  const { login, quickLogin, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      await login(email, password);
    } catch {
      // Error handled in AuthContext
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-container">
        {/* Brand Header */}
        <div className="login-brand">
          <div className="login-icon-box">
            <Utensils size={36} />
          </div>
          <h1>
            Savory<span>Inventory</span>
          </h1>
          <p className="login-subtitle">
            Enterprise Restaurant Inventory Management with FEFO Depletion & RBAC
          </p>
        </div>

        {/* Login Form Box */}
        <div className="login-card">
          <h2 className="login-card-title">Sign In to Dashboard</h2>
          <p className="login-card-desc">
            Enter your credentials or choose a pre-configured role below to test.
          </p>

          {error && (
            <div className="alert-error mb-4">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-with-icon">
                <Mail size={18} className="input-icon" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  placeholder="name@restaurant.com"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  placeholder="••••••••••••"
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-primary btn-submit" disabled={loading}>
              {loading ? (
                <span className="spinner">Connecting...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* 1-Click Role Testing Cards */}
          <div className="test-roles-section">
            <div className="divider-text">
              <span>OR 1-CLICK TEST LOGIN</span>
            </div>

            <div className="role-cards-grid">
              {TEST_ACCOUNTS.map((acc) => (
                <div
                  key={acc.role}
                  className="test-role-card"
                  onClick={() => quickLogin(acc.email)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="role-card-header">
                    <span className="role-card-name">{acc.name}</span>
                    <span className="role-badge-small">{acc.role.replace('_', ' ')}</span>
                  </div>
                  <p className="role-card-desc">{acc.description}</p>
                  <button
                    type="button"
                    className="btn-quick-login"
                    disabled={loading}
                    onClick={(e) => {
                      e.stopPropagation();
                      quickLogin(acc.email);
                    }}
                  >
                    Login as {acc.name.split(' ')[0]} &rarr;
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature Highlights Footer */}
        <div className="features-ribbon">
          <div className="feature-pill">
            <CheckCircle2 size={16} className="text-emerald" />
            <span>FEFO Batch Depletion</span>
          </div>
          <div className="feature-pill">
            <CheckCircle2 size={16} className="text-emerald" />
            <span>Threshold-Governed Adjustments</span>
          </div>
          <div className="feature-pill">
            <CheckCircle2 size={16} className="text-emerald" />
            <span>Multi-Location Tracking</span>
          </div>
          <div className="feature-pill">
            <CheckCircle2 size={16} className="text-emerald" />
            <span>5 Strict RBAC Roles</span>
          </div>
        </div>
      </div>
    </div>
  );
};
