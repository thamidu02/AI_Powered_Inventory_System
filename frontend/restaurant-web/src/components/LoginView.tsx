import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Lock,
  Mail,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import './LoginView.css';

export const LoginView: React.FC = () => {
  const { login, loading, error, clearError } = useAuth();
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
    <div className="acumatica-login-root">
      {/* Left Pane - Restaurant Inventory Hero Image */}
      <div className="acumatica-hero-pane">
        <img
          src="/login-hero.jpg"
          alt="Restaurant Stock Inspection"
          className="acumatica-hero-img"
        />
        <div className="acumatica-hero-overlay" />
      </div>

      {/* Right Pane - Acumatica-style Enterprise Login Form */}
      <div className="acumatica-form-pane">
        <div className="acumatica-form-content">
          {/* Brand Header */}
          <div className="acumatica-brand">
            <div className="acumatica-logo-sphere">
              <div className="acumatica-logo-inner-ring" />
            </div>
            <div className="acumatica-brand-text">
              <div className="acumatica-brand-title">
                Savory<span>Inventory</span>
              </div>
              <div className="acumatica-brand-tagline">
                AI-Assisted Operations & FEFO Traceability
              </div>
            </div>
          </div>

          {/* Form Header */}
          <div className="acumatica-header">
            <h2>Enter credentials</h2>
            <p>Sign in to access your inventory and procurement console</p>
          </div>

          {error && (
            <div className="acumatica-alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Credentials Form */}
          <form onSubmit={handleSubmit} className="acumatica-form">
            <div className="acumatica-field">
              <label htmlFor="acumatica-email">Username / Email</label>
              <div className="acumatica-input-wrapper">
                <Mail size={16} className="acumatica-input-icon" />
                <input
                  id="acumatica-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  placeholder="name@restaurant.com"
                  className="acumatica-input"
                  required
                />
              </div>
            </div>

            <div className="acumatica-field">
              <label htmlFor="acumatica-password">Password</label>
              <div className="acumatica-input-wrapper">
                <Lock size={16} className="acumatica-input-icon" />
                <input
                  id="acumatica-password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  placeholder="••••••••••••"
                  className="acumatica-input"
                  required
                />
              </div>
            </div>

            <div className="acumatica-actions-row">
              <button
                type="submit"
                className="acumatica-btn-signin"
                disabled={loading}
              >
                {loading ? (
                  <span>Signing In...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <span
                className="acumatica-link-forgot"
                style={{ fontSize: '0.8rem', color: '#64748b' }}
              >
                Need access? Contact your administrator.
              </span>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="acumatica-footer">
          <p className="acumatica-footer-copy">
            Copyright &copy; 2026 Savory Inventory System. All rights reserved.
          </p>
          <p className="acumatica-footer-version">
            Restaurant Operations &bull; Release 2026.2
          </p>
        </div>
      </div>
    </div>
  );
};
