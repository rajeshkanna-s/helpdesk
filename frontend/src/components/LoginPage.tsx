import React, { useState } from 'react';
import {
  Building2, ShieldCheck, Lock, Mail, ArrowRight, KeyRound,
  ShieldAlert, CheckCircle2, Eye, EyeOff, Smartphone, Shield, ArrowLeft
} from 'lucide-react';
import { apiService } from '../services/api';
import type { LoginResponse } from '../types';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface LoginPageProps {
  onLoginSuccess: (user: LoginResponse) => void;
  targetMode?: 'admin' | 'company' | 'generic';
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
  const isGenericLogin = targetMode === 'generic';

  const [email, setEmail] = useState(() => {
    if (isSuperAdminRoute) return 'testsuperadmin@kuwy.in';
    if (companySlug.toLowerCase() === 'acme') return 'testsupport@acme.com';
    return 'testadmin@kuwy.in';
  });

  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);

  const [companyCode, setCompanyCode] = useState(() => {
    if (isSuperAdminRoute) return '';
    if (companySlug.toLowerCase() === 'acme') return 'ACME';
    return 'KUWY';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Two-Factor Authentication (2FA) Challenge State
  const [is2FaStep, setIs2FaStep] = useState(false);
  const [temp2FaToken, setTemp2FaToken] = useState<string>('');
  const [maskedUserEmail, setMaskedUserEmail] = useState<string>('');
  const [totpCode, setTotpCode] = useState('');
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [trustDevice30Days, setTrustDevice30Days] = useState(false);
  const [isVerifying2Fa, setIsVerifying2Fa] = useState(false);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);

  // Generic workspace lookup state
  const [isLookingUpWorkspace, setIsLookingUpWorkspace] = useState(false);

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

      // Check if server challenged for 2FA
      if (res.twoFactorRequired && res.tempToken) {
        setTemp2FaToken(res.tempToken);
        setMaskedUserEmail(res.maskedEmail || email);
        setIs2FaStep(true);
        setIsLoading(false);
        return;
      }

      onLoginSuccess(res);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Email or password is incorrect.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2Fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode.trim()) return;

    setIsVerifying2Fa(true);
    setTwoFaError(null);

    try {
      const res = await apiService.verify2Fa({
        tempToken: temp2FaToken,
        code: totpCode.trim(),
        isBackupCode,
        trustDevice30Days,
      });

      onLoginSuccess(res);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Invalid two-factor code.';
      setTwoFaError(msg);
    } finally {
      setIsVerifying2Fa(false);
    }
  };

  const handleEmailBlur = async () => {
    if (isGenericLogin && email.includes('@')) {
      setIsLookingUpWorkspace(true);
      try {
        const lookup = await apiService.lookupWorkspace(email.trim());
        if (lookup.found && lookup.companyCode) {
          setCompanyCode(lookup.companyCode);
        }
      } catch {
        // Silent catch
      } finally {
        setIsLookingUpWorkspace(false);
      }
    }
  };

  const handleOAuthLogin = (provider: 'Google' | 'Microsoft') => {
    // Standard OAuth simulation flow with domain validation
    alert(`Connecting to ${provider} Identity Provider...\n\nOnly pre-registered staff accounts within this workspace are authorized to sign in. New accounts cannot be created via OAuth.`);
  };

  const applyDemoAccount = (demoEmail: string, demoCompanyCode: string) => {
    setEmail(demoEmail);
    setPassword('Password@123');
    setCompanyCode(demoCompanyCode);
    setErrorMessage(null);
    setIs2FaStep(false);
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
                <h4 className="fw-bolder text-white mb-0">
                  {isSuperAdminRoute ? 'Admin Console' : currentCompanyName}
                </h4>
                <small className={isSuperAdminRoute ? "text-slate-300 fw-semibold" : "text-info fw-semibold"} style={{ fontSize: '0.75rem', color: isSuperAdminRoute ? '#cbd5e1' : undefined }}>
                  {isSuperAdminRoute ? 'PLATFORM ADMINISTRATION' : 'ENTERPRISE HELPDESK WORKSPACE'}
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
                  <div className="fw-bold small text-white">Strict Multi-Tenant Isolation</div>
                  <small className="text-light opacity-75" style={{ fontSize: '0.75rem' }}>
                    Every company operates inside an isolated logical database scope.
                  </small>
                </div>
              </div>

              <div className="d-flex align-items-start gap-2.5">
                <Shield size={18} className="text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <div className="fw-bold small text-white">Two-Factor Authentication (TOTP)</div>
                  <small className="text-light opacity-75" style={{ fontSize: '0.75rem' }}>
                    Google & Microsoft Authenticator verification with backup codes.
                  </small>
                </div>
              </div>

              <div className="d-flex align-items-start gap-2.5">
                <KeyRound size={18} className="text-success flex-shrink-0 mt-0.5" />
                <div>
                  <div className="fw-bold small text-white">Brute-Force & Credential Protection</div>
                  <small className="text-light opacity-75" style={{ fontSize: '0.75rem' }}>
                    Uniform response timing, progressive delays, and account lockouts.
                  </small>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-top border-secondary border-opacity-25">
            <div className="d-flex align-items-center justify-content-between small text-light opacity-75">
              <span>Section B: Login & Access</span>
              <span className="badge bg-white bg-opacity-10 text-white">Screens 6, 7 & 8</span>
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

          {/* ========================================================= */}
          {/* STEP 2: TWO-FACTOR AUTHENTICATION CHALLENGE               */}
          {/* ========================================================= */}
          {is2FaStep ? (
            <div>
              <div className="mb-4">
                <div className="d-inline-flex p-3 rounded-circle bg-primary bg-opacity-10 text-primary mb-3">
                  <Smartphone size={32} />
                </div>
                <h4 className="fw-bolder text-dark mb-1">Two-Factor Verification</h4>
                <p className="text-muted small mb-0">
                  Enter the 6-digit verification code from your authenticator app (Google Authenticator or Microsoft Authenticator) for <strong>{maskedUserEmail}</strong>.
                </p>
              </div>

              {twoFaError && (
                <div className="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 rounded-3 small mb-3 border-0 shadow-sm">
                  <ShieldAlert size={18} className="text-danger flex-shrink-0" />
                  <div>{twoFaError}</div>
                </div>
              )}

              <form onSubmit={handleVerify2Fa}>
                <div className="mb-3">
                  <label className="form-label fw-bold small text-secondary">
                    {isBackupCode ? 'One-Time Backup Code' : '6-Digit Authenticator Code'}
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-lg text-center font-monospace fw-bold letter-spacing-2"
                    placeholder={isBackupCode ? 'e.g. 8492-4019' : '000000'}
                    maxLength={isBackupCode ? 12 : 6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    required
                    autoFocus
                  />
                  <small className="text-muted d-block mt-1" style={{ fontSize: '0.75rem' }}>
                    Dev test code: <code>123456</code> or <code>BACKUP-9999</code>
                  </small>
                </div>

                <div className="form-check mb-4">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="trustDeviceCheck"
                    checked={trustDevice30Days}
                    onChange={(e) => setTrustDevice30Days(e.target.checked)}
                  />
                  <label className="form-check-label small text-muted" htmlFor="trustDeviceCheck">
                    Trust this device for 30 days
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isVerifying2Fa || !totpCode.trim()}
                  className="btn btn-primary w-100 py-2.5 fw-bold d-flex align-items-center justify-content-center gap-2 mb-3"
                >
                  {isVerifying2Fa ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      <span>Verifying Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify & Access Workspace</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

                <div className="d-flex justify-content-between align-items-center pt-2 border-top">
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-decoration-none text-muted p-0"
                    onClick={() => {
                      setIsBackupCode(!isBackupCode);
                      setTotpCode('');
                      setTwoFaError(null);
                    }}
                  >
                    {isBackupCode ? 'Use Authenticator Code instead' : 'Use a backup recovery code'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-link btn-sm text-decoration-none text-muted p-0 d-flex align-items-center gap-1"
                    onClick={() => {
                      setIs2FaStep(false);
                      setTotpCode('');
                      setTwoFaError(null);
                    }}
                  >
                    <ArrowLeft size={13} />
                    <span>Back to password</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ========================================================= */
            /* STEP 1: PRIMARY LOGIN FORM (SCREEN 6)                     */
            /* ========================================================= */
            <div>
              <div className="mb-4">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <h4 className="fw-bolder text-dark mb-0">
                    {isSuperAdminRoute ? 'Sign In to Admin Console' : `Sign In to ${currentCompanyName}`}
                  </h4>
                  {!isSuperAdminRoute && (
                    <span className="badge bg-primary text-white fw-bold">
                      {currentCompanyBadge}
                    </span>
                  )}
                </div>
                <p className="text-muted small mb-0">
                  {isSuperAdminRoute
                    ? 'Master governance portal for platform owners and system administrators.'
                    : `Enter your credentials to enter the ${currentCompanyName} helpdesk dashboard.`}
                </p>
              </div>

              {/* OAuth Buttons (Google & Microsoft) */}
              <div className="row g-2 mb-3">
                <div className="col-6">
                  <button
                    type="button"
                    className="btn btn-light border w-100 py-2 d-flex align-items-center justify-content-center gap-2 small fw-semibold"
                    onClick={() => handleOAuthLogin('Google')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.27 21.43 7.33 24 12 24z" />
                      <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.13z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.57 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z" />
                    </svg>
                    <span>Google</span>
                  </button>
                </div>
                <div className="col-6">
                  <button
                    type="button"
                    className="btn btn-light border w-100 py-2 d-flex align-items-center justify-content-center gap-2 small fw-semibold"
                    onClick={() => handleOAuthLogin('Microsoft')}
                  >
                    <svg width="18" height="18" viewBox="0 0 23 23">
                      <path fill="#f35325" d="M1 1h10v10H1z" />
                      <path fill="#81bc06" d="M12 1h10v10H12z" />
                      <path fill="#05a6f0" d="M1 12h10v10H1z" />
                      <path fill="#ffba08" d="M12 12h10v10H12z" />
                    </svg>
                    <span>Microsoft</span>
                  </button>
                </div>
              </div>

              <div className="d-flex align-items-center my-3 text-muted">
                <hr className="flex-grow-1 my-0" />
                <span className="px-3 small text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                  or sign in with password
                </span>
                <hr className="flex-grow-1 my-0" />
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
                      placeholder="name@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onBlur={handleEmailBlur}
                      required
                      autoFocus
                    />
                  </div>
                  {isLookingUpWorkspace && (
                    <small className="text-muted" style={{ fontSize: '0.72rem' }}>
                      Detecting company workspace...
                    </small>
                  )}
                </div>

                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="form-label fw-bold small text-secondary mb-0">Password</label>
                    <button
                      type="button"
                      className="btn btn-link btn-sm text-decoration-none text-primary p-0 small fw-semibold"
                      onClick={() => setShowForgotModal(true)}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="input-group">
                    <span className="input-group-text bg-light text-muted border-end-0">
                      <Lock size={16} />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-control border-start-0 border-end-0"
                      placeholder="Enter password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-light border border-start-0 text-muted"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="rememberDeviceCheck"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                  />
                  <label className="form-check-label small text-muted" htmlFor="rememberDeviceCheck">
                    Remember this device for 30 days
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary w-100 py-2.5 fw-bold d-flex align-items-center justify-content-center gap-2 shadow-sm"
                  style={{
                    background: isSuperAdminRoute
                      ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)'
                      : 'linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%)',
                    borderColor: 'transparent',
                  }}
                >
                  {isLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>

              {/* Fast 1-Click Demo Accounts Switcher */}
              <div className="mt-4 pt-3 border-top">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="small text-muted fw-bold text-uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.05em' }}>
                    Quick 1-Click Demo Accounts
                  </span>
                  <span className="badge bg-light text-secondary border">Dev Verified</span>
                </div>

                <div className="d-flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-primary py-1 px-2 small rounded-pill"
                    onClick={() => applyDemoAccount('testadmin@kuwy.in', 'KUWY')}
                  >
                    Kuwy Admin
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-secondary py-1 px-2 small rounded-pill"
                    onClick={() => applyDemoAccount('testsupport@kuwy.in', 'KUWY')}
                  >
                    Kuwy Agent
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-success py-1 px-2 small rounded-pill"
                    onClick={() => applyDemoAccount('testsupport@acme.com', 'ACME')}
                  >
                    Acme Admin
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-dark py-1 px-2 small rounded-pill"
                    onClick={() => applyDemoAccount('testsuperadmin@kuwy.in', '')}
                  >
                    Super Admin
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-4 text-center">
                <small className="text-muted d-block mb-1" style={{ fontSize: '0.72rem' }}>
                  By signing in, you agree to the <a href="#terms" className="text-primary text-decoration-none">Terms</a> and <a href="#privacy" className="text-primary text-decoration-none">Privacy Policy</a>.
                </small>
                <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                  Powered by <strong>YourHelpdesk SaaS Engine</strong>
                </small>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Screen 7a: Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        defaultEmail={email}
        companyCode={companyCode}
        onNavigateToReset={(tok) => {
          if (onNavigate) {
            onNavigate(`/reset-password?token=${tok}`);
          } else {
            window.location.href = `/reset-password?token=${tok}`;
          }
        }}
      />
    </div>
  );
};
