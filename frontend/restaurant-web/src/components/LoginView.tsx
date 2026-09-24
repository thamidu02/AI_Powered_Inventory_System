import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Clock,
  ShieldCheck,
  Lock,
  Mail,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { TEST_ACCOUNTS } from '../types';
import { SavoryLogo } from './Navbar';

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
    <div className="login-split-page">
      {/* ─── Left Column: Warm Brand & Purpose ───────────────────────────── */}
      <div className="login-brand-panel">
        <div className="brand-panel-content">
          <div className="brand-header-badge">
            <SavoryLogo size={40} />
            <div className="brand-header-text">
              <span className="brand-name">Savory<span>Inventory</span></span>
              <span className="brand-tag">RESTAURANT OPERATIONS</span>
            </div>
          </div>

          <div className="brand-hero-block">
            <h1 className="brand-headline">
              Fresh inventory &amp; kitchen operations made simple.
            </h1>
            <p className="brand-statement">
              Keep stock fresh, eliminate food waste with first-expired first-out (FEFO), and run a smoother kitchen every day.
            </p>
          </div>

          {/* Friendly Value Highlights */}
          <div className="brand-features-list">
            <div className="brand-feature-item">
              <Clock size={18} className="feature-icon" />
              <div>
                <strong>Use oldest batches first</strong>
                <p className="text-sm" style={{ color: '#dbe5e0' }}>Automatic FEFO ensures nothing sits in storage past its prime.</p>
              </div>
            </div>

            <div className="brand-feature-item">
              <Boxes size={18} className="feature-icon" />
              <div>
                <strong>Know your stock in seconds</strong>
                <p className="text-sm" style={{ color: '#dbe5e0' }}>Live stock counts, batch locations, and low-stock alerts.</p>
              </div>
            </div>

            <div className="brand-feature-item">
              <Trash2 size={18} className="feature-icon" />
              <div>
                <strong>Cut food waste &amp; costs</strong>
                <p className="text-sm" style={{ color: '#dbe5e0' }}>Smart suggestions help you reorder at the right time.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Right Column: Clean, Familiar Sign In ───────────────────────── */}
      <div className="login-form-panel">
        <div className="login-card-inner">
          <div className="login-card-header">
            <h2>Sign in to your restaurant</h2>
            <p>Enter your email and password to access your inventory.</p>
          </div>

          {error && (
            <div className="alert-error mb-3">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <div className="input-with-icon">
                <Mail size={16} className="input-icon" />
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
                <Lock size={16} className="input-icon" />
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
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Quick 1-Click Role Login */}
          <div className="test-roles-section">
            <div className="divider-text">
              <span>OR SIGN IN WITH A TEST ROLE</span>
            </div>

            <div className="demo-roles-chips-grid">
              {TEST_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  className="demo-role-btn"
                  onClick={() => quickLogin(acc.email)}
                  disabled={loading}
                  title={`Sign in as ${acc.name}`}
                >
                  <ShieldCheck size={14} className="role-icon" />
                  <div className="role-btn-text">
                    <strong>{acc.name.split(' ')[0]}</strong>
                    <span className="role-btn-role">{acc.role.replace(/_/g, ' ')}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
