import React, { useState } from 'react';
import {
  Building2, ShieldCheck, Lock, Mail, ArrowRight, KeyRound,
  Sparkles, ShieldAlert, CheckCircle2, Database, FileSpreadsheet
} from 'lucide-react';
import { apiService } from '../services/api';
import type { LoginResponse } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: LoginResponse) => void;
  targetMode?: 'admin' | 'company';
  companySlug?: string;
  onNavigate?: (path: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  targetMode = 'company',
  companySlug = 'kuwy',
  onNavigate,
}) => {
  const isSuperAdminRoute = targetMode === 'admin';

  const [email, setEmail] = useState(() => {
    if (isSuperAdminRoute) return 'testsuperadmin@kuwy.in';
    if (companySlug.toLowerCase() === 'acme') return 'testsupport@acme.com';
    return 'testadmin@kuwy.in';
  });

  const [password, setPassword] = useState('Password@123');
  const [companyCode, setCompanyCode] = useState(() => {
    if (isSuperAdminRoute) return '';
    if (companySlug.toLowerCase() === 'acme') return 'ACME';
    return 'KUWY';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const applyDemoAccount = (demoEmail: string, demoCompanyCode: string) => {
    setEmail(demoEmail);
    setPassword('Password@123');
    setCompanyCode(demoCompanyCode);
    setErrorMessage(null);
  };

  const currentCompanyName = companySlug.toLowerCase() === 'acme'
    ? 'Acme Global Logistics'
    : 'Kuwy Technology Services';

  const currentCompanyBadge = companySlug.toLowerCase() === 'acme' ? 'ACM' : 'KUWY';

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center py-4 px-3"
      style={{
        background: 'radial-gradient(ellipse at top left, #eef2ff 0%, #f8fafc 45%, #e2e8f0 100%)',
      }}
    >
      <div
        className="row g-0 rounded-4 overflow-hidden shadow-lg border bg-white"
        style={{ maxWidth: '1040px', width: '100%' }}
      >
        {/* Left Column: Enterprise Brand & Capability Showcase */}
        <div
          className="col-lg-5 d-none d-lg-flex flex-column justify-content-between p-5 text-white"
          style={{
            background: isSuperAdminRoute
              ? 'linear-gradient(160deg, #090d16 0%, #1e1b4b 60%, #4338ca 100%)'
              : 'linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #1d4ed8 100%)',
          }}
        >
          <div>
            {/* Branding Header */}
            <div className="d-flex align-items-center gap-2.5 mb-4">
              <div
                className="p-2.5 rounded-3 d-flex align-items-center justify-content-center"
                style={{
                  background: isSuperAdminRoute
                    ? 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)'
                    : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.25)',
                }}
              >
                {isSuperAdminRoute ? <ShieldCheck size={28} className="text-white" /> : <Building2 size={26} className="text-white" />}
              </div>
              <div>
                <div className="d-flex align-items-center gap-1.5">
                  <h4 className="fw-bolder text-white mb-0">
                    {isSuperAdminRoute ? 'Admin Console' : currentCompanyName}
                  </h4>
                  <span
                    className={`badge ${isSuperAdminRoute ? 'bg-warning text-dark' : 'bg-primary text-white'} fw-bold`}
                    style={{ fontSize: '0.62rem' }}
                  >
                    {isSuperAdminRoute ? 'OWNER' : currentCompanyBadge}
                  </span>
                </div>
                <small className={isSuperAdminRoute ? "text-warning fw-semibold" : "text-info fw-semibold"} style={{ fontSize: '0.75rem' }}>
                  {isSuperAdminRoute ? 'PLATFORM CONTROL CENTER' : 'ENTERPRISE HELPDESK WORKSPACE'}
                </small>
              </div>
            </div>

            <h3 className="fw-bold text-white mb-3" style={{ lineHeight: '1.3' }}>
              {isSuperAdminRoute
                ? 'Supervise Tenants & Multi-Company Governance'
                : 'Omnichannel Customer Support & SLA Resolution'}
            </h3>
            <p className="text-light opacity-75 small mb-4">
              {isSuperAdminRoute
                ? 'Master administration portal to manage enterprise tenants, provision support staff, review telemetry, and monitor cross-organization performance.'
                : `Dedicated support workspace for ${currentCompanyName}. Manage customer inquiries, Microsoft 365 Exchange email forwarding, and SLAs.`}
            </p>

            <div className="d-flex flex-column gap-3">
              <div className="d-flex align-items-start gap-2.5">
                <CheckCircle2 size={18} className="text-info flex-shrink-0 mt-0.5" />
                <div>
                  <div className="fw-bold small text-white">Multi-Tenant Organization Control</div>
                  <small className="text-light opacity-75" style={{ fontSize: '0.75rem' }}>
                    Isolated company queues, custom domains, and role-based permissions.
                  </small>
                </div>
              </div>

              <div className="d-flex align-items-start gap-2.5">
                <Sparkles size={18} className="text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <div className="fw-bold small text-white">Email Forwarding & M365 Ingestion</div>
                  <small className="text-light opacity-75" style={{ fontSize: '0.75rem' }}>
                    Automated email-to-ticket conversion with thread continuity tokens.
                  </small>
                </div>
              </div>

              <div className="d-flex align-items-start gap-2.5">
                <FileSpreadsheet size={18} className="text-success flex-shrink-0 mt-0.5" />
                <div>
                  <div className="fw-bold small text-white">100,000+ Row Streaming MIS</div>
                  <small className="text-light opacity-75" style={{ fontSize: '0.75rem' }}>
                    Memory-safe Apache POI Excel & CSV downloads.
                  </small>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-top border-secondary border-opacity-25">
            <div className="d-flex align-items-center justify-content-between small text-light opacity-75">
              <span className="d-flex align-items-center gap-1.5">
                <Database size={14} className="text-success" />
                <span>MySQL :3306 Connected</span>
              </span>
              <span className="badge bg-white bg-opacity-10 text-white">24 Tables Active</span>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Login & Credentials */}
        <div className="col-12 col-lg-7 p-4 p-md-5">
          {/* Top route switcher pill */}
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-light text-dark border px-2.5 py-1">
                Route: <code>{isSuperAdminRoute ? '/adminconsole' : `/${companySlug}/admin`}</code>
              </span>
            </div>

            {/* Quick cross-link between Admin Console and Company Workspace */}
            {isSuperAdminRoute ? (
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none text-muted small d-flex align-items-center gap-1"
                onClick={() => onNavigate && onNavigate('/kuwy/admin')}
              >
                <span>Company HelpDesk Login</span>
                <ArrowRight size={13} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none text-muted small d-flex align-items-center gap-1"
                onClick={() => onNavigate && onNavigate('/adminconsole')}
              >
                <span>Admin Console</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>

          <div className="mb-4">
            <div className="d-flex align-items-center gap-2 mb-1">
              <h4 className="fw-bolder text-dark mb-0">
                {isSuperAdminRoute ? 'Admin Console Sign In' : `${currentCompanyName} Sign In`}
              </h4>
              <span className={`badge ${isSuperAdminRoute ? 'bg-warning text-dark' : 'bg-primary text-white'} fw-bold`}>
                {isSuperAdminRoute ? 'OWNER' : currentCompanyBadge}
              </span>
            </div>
            <p className="text-muted small mb-0">
              {isSuperAdminRoute
                ? 'Supervise organizations, manage tenant quotas, and configure master settings.'
                : `Sign in to access the ${currentCompanyName} support queue and customer conversation dashboard.`}
            </p>
          </div>

          {errorMessage && (
            <div className="alert alert-danger d-flex align-items-center gap-2 py-2.5 px-3 rounded-3 small mb-3 border-0 shadow-sm" role="alert">
              <ShieldAlert size={18} className="text-danger flex-shrink-0" />
              <div>{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleLogin}>
            {!isSuperAdminRoute && (
              <div className="mb-3">
                <label className="form-label fw-bold small text-secondary">Company Code</label>
                <div className="input-group">
                  <span className="input-group-text bg-light text-muted border-end-0">
                    <Building2 size={16} />
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0 fw-bold font-monospace"
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
                  placeholder={isSuperAdminRoute ? "testsuperadmin@kuwy.in" : "testadmin@kuwy.in"}
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
              className={`btn ${isSuperAdminRoute ? 'btn-dark' : 'btn-primary'} w-100 py-2.5 fw-bold d-flex align-items-center justify-content-center gap-2 shadow-sm rounded-3`}
            >
              {isLoading ? (
                <div className="d-flex align-items-center gap-2">
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                  <span>Authenticating...</span>
                </div>
              ) : (
                <>
                  <span>Sign In to {isSuperAdminRoute ? 'Admin Console' : `${currentCompanyName}`}</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>

            <div className="d-flex justify-content-between align-items-center mt-3 pt-1">
              <button
                type="button"
                className="btn btn-sm btn-link p-0 text-decoration-none text-muted small"
                onClick={() => onNavigate && onNavigate('/signup')}
              >
                New company? <strong className="text-primary">Sign up workspace →</strong>
              </button>

              {!isSuperAdminRoute && (
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-decoration-none text-muted small"
                  onClick={() => onNavigate && onNavigate(`/${companySlug}`)}
                >
                  Need support? <strong className="text-success">Customer Portal →</strong>
                </button>
              )}
            </div>
          </form>

          {/* Quick 1-Click Seeded Test Accounts */}
          <div className="mt-4 pt-3 border-top">
            <div className="d-flex align-items-center gap-1.5 text-muted small fw-bold mb-2">
              <KeyRound size={14} />
              <span>1-Click Seeded Test Accounts:</span>
            </div>

            {isSuperAdminRoute ? (
              <div className="d-flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={`chip-btn ${email === 'testsuperadmin@kuwy.in' ? 'active' : ''}`}
                  onClick={() => applyDemoAccount('testsuperadmin@kuwy.in', '')}
                >
                  <span className="pulse-dot pulse-dot-warning"></span>
                  <span>👑 Platform Owner (testsuperadmin@kuwy.in)</span>
                </button>
              </div>
            ) : companySlug.toLowerCase() === 'acme' ? (
              <div className="d-flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={`chip-btn ${email === 'testsupport@acme.com' ? 'active' : ''}`}
                  onClick={() => applyDemoAccount('testsupport@acme.com', 'ACME')}
                >
                  🚚 Acme Admin (testsupport@acme.com)
                </button>
              </div>
            ) : (
              <div>
                <div className="d-flex flex-wrap gap-1.5 mb-2">
                  <button
                    type="button"
                    className={`chip-btn ${email === 'testadmin@kuwy.in' ? 'active' : ''}`}
                    onClick={() => applyDemoAccount('testadmin@kuwy.in', 'KUWY')}
                  >
                    🏢 Kuwy Admin (Seetha)
                  </button>
                  <button
                    type="button"
                    className={`chip-btn ${email === 'test.it@kuwy.in' ? 'active' : ''}`}
                    onClick={() => applyDemoAccount('test.it@kuwy.in', 'KUWY')}
                  >
                    💻 IT Support
                  </button>
                  <button
                    type="button"
                    className={`chip-btn ${email === 'test.finance@kuwy.in' ? 'active' : ''}`}
                    onClick={() => applyDemoAccount('test.finance@kuwy.in', 'KUWY')}
                  >
                    💰 Finance
                  </button>
                  <button
                    type="button"
                    className={`chip-btn ${email === 'test.operations@kuwy.in' ? 'active' : ''}`}
                    onClick={() => applyDemoAccount('test.operations@kuwy.in', 'KUWY')}
                  >
                    ⚙️ Operations
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
