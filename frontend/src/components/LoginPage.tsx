import React, { useState } from 'react';
import {
  Building2, ShieldCheck, Lock, Mail, ArrowRight, KeyRound,
  Sparkles, ShieldAlert, Cpu
} from 'lucide-react';
import { apiService } from '../services/api';
import type { LoginResponse } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: LoginResponse) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('testsuperadmin@kuwy.in');
  const [password, setPassword] = useState('Password@123');
  const [companyCode, setCompanyCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<'super_admin' | 'company'>('super_admin');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiService.login({
        email: email.trim(),
        password,
        companyCode: companyCode.trim() ? companyCode.trim() : undefined,
      });
      onLoginSuccess(res);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Login failed. Please check your credentials.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const applyDemoAccount = (demoEmail: string, demoCompanyCode: string, mode: 'super_admin' | 'company') => {
    setEmail(demoEmail);
    setPassword('Password@123');
    setCompanyCode(demoCompanyCode);
    setLoginMode(mode);
    setErrorMessage(null);
  };

  return (
    <div
      className="min-vh-100 d-flex flex-column justify-content-center align-items-center py-5 px-3"
      style={{
        background: 'radial-gradient(ellipse at top, #f0f7ff 0%, #f8fafc 50%, #e2e8f0 100%)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background Decorative Ambient Circles */}
      <div
        style={{
          position: 'absolute',
          top: '-120px',
          left: '-80px',
          width: '420px',
          height: '420px',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.12) 0%, rgba(37, 99, 235, 0) 70%)',
          borderRadius: '50%',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-140px',
          right: '-80px',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(14, 165, 233, 0.10) 0%, rgba(14, 165, 233, 0) 70%)',
          borderRadius: '50%',
          pointerEvents: 'none'
        }}
      />

      {/* Brand Header */}
      <div className="text-center mb-4" style={{ zIndex: 1 }}>
        <div
          className="d-inline-flex p-3 rounded-4 shadow-sm mb-2"
          style={{
            background: 'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)',
            color: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.35)'
          }}
        >
          <Building2 size={38} />
        </div>
        <h2 className="fw-bolder mb-1 brand-badge" style={{ fontSize: '2rem' }}>Kuwy HelpDesk</h2>
        <p className="text-muted mb-0 small fw-medium">
          Enterprise Multi-Tenant Customer Support Platform & Platform Administration
        </p>
      </div>

      {/* Main Glass Card */}
      <div
        className="card border-0 rounded-4 overflow-hidden"
        style={{
          maxWidth: '520px',
          width: '100%',
          zIndex: 1,
          boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          background: '#ffffff'
        }}
      >
        {/* Segmented Mode Switcher */}
        <div className="p-2 bg-light border-bottom">
          <div className="row g-1 text-center">
            <div className="col-6">
              <button
                type="button"
                className={`btn w-100 py-2.5 rounded-3 border-0 fw-bold d-flex align-items-center justify-content-center gap-2 transition-all ${
                  loginMode === 'super_admin'
                    ? 'btn-primary text-white shadow-sm'
                    : 'text-muted bg-transparent'
                }`}
                style={{ fontSize: '0.875rem' }}
                onClick={() => {
                  setLoginMode('super_admin');
                  setEmail('testsuperadmin@kuwy.in');
                  setCompanyCode('');
                  setErrorMessage(null);
                }}
              >
                <ShieldCheck size={17} />
                <span>Platform Owner</span>
              </button>
            </div>
            <div className="col-6">
              <button
                type="button"
                className={`btn w-100 py-2.5 rounded-3 border-0 fw-bold d-flex align-items-center justify-content-center gap-2 transition-all ${
                  loginMode === 'company'
                    ? 'btn-primary text-white shadow-sm'
                    : 'text-muted bg-transparent'
                }`}
                style={{ fontSize: '0.875rem' }}
                onClick={() => {
                  setLoginMode('company');
                  setEmail('testadmin@kuwy.in');
                  setCompanyCode('KUWY');
                  setErrorMessage(null);
                }}
              >
                <Building2 size={17} />
                <span>Company Workspace</span>
              </button>
            </div>
          </div>
        </div>

        <div className="card-body p-4 p-md-5">
          {loginMode === 'super_admin' ? (
            <div className="mb-4 text-center">
              <span className="badge bg-warning-subtle text-warning-emphasis border border-warning px-3 py-1.5 rounded-pill fw-bold">
                👑 Project Owner Super Admin
              </span>
              <p className="small text-muted mt-2 mb-0">
                Full platform supervision: onboard companies, toggle active status, and generate login credentials.
              </p>
            </div>
          ) : (
            <div className="mb-4 text-center">
              <span className="badge bg-primary-subtle text-primary border border-primary px-3 py-1.5 rounded-pill fw-bold">
                🏢 Company Workspace Access
              </span>
              <p className="small text-muted mt-2 mb-0">
                Sign in as a Company Administrator or specialized Technical Support Engineer.
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="alert alert-danger d-flex align-items-center gap-2 py-2.5 px-3 rounded-3 small mb-4 border-0 shadow-sm" role="alert">
              <ShieldAlert size={18} className="text-danger flex-shrink-0" />
              <div>{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleLogin}>
            {loginMode === 'company' && (
              <div className="mb-3">
                <label className="form-label fw-bold small text-secondary">
                  Company Code <span className="text-muted fw-normal">(Optional if email is unique)</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light text-muted border-end-0">
                    <Building2 size={16} />
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0"
                    placeholder="e.g. KUWY or ACME"
                    value={companyCode}
                    onChange={e => setCompanyCode(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            )}

            <div className="mb-3">
              <label className="form-label fw-bold small text-secondary">Work Email Address</label>
              <div className="input-group">
                <span className="input-group-text bg-light text-muted border-end-0">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  className="form-control border-start-0"
                  required
                  placeholder="testadmin@kuwy.in"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label fw-bold small text-secondary mb-0">Password</label>
                <small className="text-muted">Default: <code>Password@123</code></small>
              </div>
              <div className="input-group">
                <span className="input-group-text bg-light text-muted border-end-0">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  className="form-control border-start-0"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-100 py-2.5 fw-bold d-flex align-items-center justify-content-center gap-2 shadow-sm rounded-3"
            >
              {isLoading ? (
                <div className="d-flex align-items-center gap-2">
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                  <span>Verifying Credentials...</span>
                </div>
              ) : (
                <>
                  <span>Sign In to {loginMode === 'super_admin' ? 'Super Admin Portal' : 'HelpDesk Workspace'}</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          {/* Quick 1-Click Demo Accounts */}
          <div className="mt-4 pt-4 border-top">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="d-flex align-items-center gap-1.5 text-muted small fw-bold">
                <KeyRound size={14} />
                <span>1-Click Test Credentials:</span>
              </div>
            </div>

            {loginMode === 'super_admin' ? (
              <div className="d-flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="chip-btn active"
                  onClick={() => applyDemoAccount('testsuperadmin@kuwy.in', '', 'super_admin')}
                >
                  <span className="pulse-dot pulse-dot-warning"></span>
                  <span>👑 Platform Owner (Super Admin)</span>
                </button>
              </div>
            ) : (
              <div>
                <div className="text-muted mb-1.5 d-flex align-items-center gap-1" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                  <Cpu size={12} />
                  <span>TECHNICAL SUPPORT ENGINEERS (CATEGORY-WISE):</span>
                </div>
                <div className="d-flex flex-wrap gap-1.5 mb-2.5">
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyDemoAccount('test.it@kuwy.in', 'KUWY', 'company')}
                    title="IT & Technical Infrastructure Support Engineer"
                  >
                    <span className="pulse-dot pulse-dot-success"></span>
                    <span>💻 IT Support (Sanjay)</span>
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyDemoAccount('test.finance@kuwy.in', 'KUWY', 'company')}
                    title="Finance, Accounts & Invoicing Lead"
                  >
                    <span className="pulse-dot pulse-dot-success"></span>
                    <span>💰 Finance Support (Meenakshi)</span>
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyDemoAccount('test.operations@kuwy.in', 'KUWY', 'company')}
                    title="Operations & Verification Officer"
                  >
                    <span className="pulse-dot pulse-dot-success"></span>
                    <span>⚙️ Operations (Rajesh)</span>
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyDemoAccount('test.hr@kuwy.in', 'KUWY', 'company')}
                    title="HR & People Operations Desk"
                  >
                    <span className="pulse-dot pulse-dot-success"></span>
                    <span>👥 HR Desk (Ananya)</span>
                  </button>
                </div>

                <div className="text-muted mb-1.5 d-flex align-items-center gap-1" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                  <Building2 size={12} />
                  <span>COMPANY ADMINISTRATORS:</span>
                </div>
                <div className="d-flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyDemoAccount('testadmin@kuwy.in', 'KUWY', 'company')}
                  >
                    🏢 Kuwy Admin (Seetha)
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyDemoAccount('testsupport@acme.com', 'ACME', 'company')}
                  >
                    🚚 Acme Admin (John)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Platform Security Pill */}
      <div className="mt-4 text-center text-muted small d-flex align-items-center gap-3">
        <span className="d-flex align-items-center gap-1.5">
          <span className="pulse-dot pulse-dot-success"></span>
          <span>MySQL 8.4 Multi-Tenant Engine</span>
        </span>
        <span className="text-secondary">•</span>
        <span className="d-flex align-items-center gap-1.5">
          <Sparkles size={14} className="text-primary" />
          <span>Microsoft 365 Graph Sync</span>
        </span>
      </div>
    </div>
  );
};
