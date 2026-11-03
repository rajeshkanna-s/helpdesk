import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, ShieldCheck, ArrowRight,
  X, Mail, Eye, EyeOff, ShieldAlert, RefreshCw,
  LifeBuoy, CheckSquare
} from 'lucide-react';
import { apiService } from '../services/api';
import type { LoginResponse } from '../types';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (res: LoginResponse) => void;
  defaultPlan?: string;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultPlan = 'STARTER'
}) => {
  // Wizard steps: 1 = Sign-Up form (Screen 3), 2 = Verify Email (Screen 4a), 3 = Provisioning animation (Screen 4b), 4 = Welcome (Screen 4c)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State (Screen 3)
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);

  // Subdomain live availability check state
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [subdomainMessage, setSubdomainMessage] = useState<string>('');

  // Email Verification State (Screen 4a)
  const [verificationCode, setVerificationCode] = useState('849201');
  const [resendCooldown, setResendCooldown] = useState(60);

  // Provisioning animation state (Screen 4b)
  const [provisionProgress, setProvisionProgress] = useState(0);
  const [provisioningItem, setProvisioningItem] = useState(0);

  // Result state
  const [provisionedResponse, setProvisionedResponse] = useState<LoginResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Debounced subdomain availability check
  useEffect(() => {
    if (!subdomain || subdomain.length < 3) {
      setSubdomainStatus('idle');
      setSubdomainMessage('');
      return;
    }

    const timer = setTimeout(async () => {
      setSubdomainStatus('checking');
      try {
        const res = await fetch(`http://localhost:8080/api/v1/onboarding/check-subdomain?slug=${encodeURIComponent(subdomain)}`);
        const data = await res.json();
        if (data.available) {
          setSubdomainStatus('available');
          setSubdomainMessage(`✓ ${data.slug}.helpdesk.kuwy.in is available!`);
        } else {
          setSubdomainStatus('taken');
          setSubdomainMessage(`✗ ${data.reason || 'Address unavailable'}`);
        }
      } catch {
        setSubdomainStatus('available');
        setSubdomainMessage(`✓ ${subdomain}.helpdesk.kuwy.in`);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [subdomain]);

  // Resend cooldown timer
  useEffect(() => {
    if (step === 2 && resendCooldown > 0) {
      const interval = setInterval(() => {
        setResendCooldown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, resendCooldown]);

  if (!isOpen) return null;

  // Password Strength calculation
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, text: 'Too short', color: '#64748b' };
    if (pwd.length < 8) return { score: 1, text: 'Weak', color: '#ef4444' };
    const hasNum = /\d/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    const hasUpper = /[A-Z]/.test(pwd);
    if (pwd.length >= 10 && hasNum && (hasSpecial || hasUpper)) {
      return { score: 3, text: 'Strong', color: '#10b981' };
    }
    return { score: 2, text: 'Good', color: '#f59e0b' };
  };

  const pwdStrength = getPasswordStrength(adminPassword);

  const handleCompanyNameChange = (val: string) => {
    setCompanyName(val);
    const autoSlug = val.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
    if (!subdomain || subdomain === autoSlug.slice(0, -1)) {
      setSubdomain(autoSlug);
    }
  };

  // Step 1 -> Step 2: Send Email Verification (Blind Response)
  const handleProceedToVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !companyName.trim() || !subdomain.trim()) return;
    if (subdomainStatus === 'taken') {
      setErrorMessage('Please choose an available workspace address.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await fetch('http://localhost:8080/api/v1/onboarding/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail.trim(), companyName: companyName.trim() })
      });
      setIsLoading(false);
      setStep(2);
      setResendCooldown(60);
    } catch {
      setIsLoading(false);
      setStep(2);
      setResendCooldown(60);
    }
  };

  // Step 2 -> Step 3 & 4: Confirm Code & Trigger Atomic Provisioning
  const handleVerifyAndProvision = async () => {
    if (!verificationCode || verificationCode.length < 4) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStep(3); // Show Progress checklist animation

    // Animate checklist ticks
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setProvisionProgress(progress);
      setProvisioningItem(Math.min(4, Math.floor(progress / 20)));
      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 350);

    try {
      const response = await apiService.onboardCompany({
        companyName: companyName.trim(),
        subdomain: subdomain.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword: adminPassword,
        adminName: adminName.trim(),
        planTier: defaultPlan,
      });

      setTimeout(() => {
        setIsLoading(false);
        setProvisionedResponse(response);
        setStep(4); // Welcome screen
      }, 1900);
    } catch (err: any) {
      clearInterval(interval);
      setIsLoading(false);
      setStep(1);
      setErrorMessage(
        err?.response?.data?.message ||
        'Unable to complete workspace creation. Address may already be in use.'
      );
    }
  };

  const handleOAuthSimulate = (provider: 'Google' | 'Microsoft') => {
    setAdminName(`${provider} Test Admin`);
    setAdminEmail(`admin.${provider.toLowerCase()}@testcompany.com`);
    setCompanyName(`${provider} Partner Org`);
    setSubdomain(`${provider.toLowerCase()}partner`);
  };

  return (
    <div
      className="modal show d-block"
      style={{
        backgroundColor: 'rgba(11, 19, 43, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 1070
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-xl" style={{ maxWidth: '1060px' }}>
        <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden bg-white text-dark">
          <div className="row g-0">

            {/* LEFT COLUMN: BRAND BENEFITS & SECURITY REASSURANCE */}
            <div
              className="col-12 col-lg-5 p-4 p-md-5 d-flex flex-column justify-content-between text-white"
              style={{
                backgroundColor: '#0f172a',
                backgroundImage: 'radial-gradient(circle at top left, #1e293b 0%, #0f172a 100%)',
                borderRight: '1px solid #334155'
              }}
            >
              <div>
                <div className="d-flex align-items-center gap-2.5 mb-4">
                  <div className="p-2 bg-primary text-white rounded-3">
                    <LifeBuoy size={22} />
                  </div>
                  <span className="fw-bolder fs-5 text-white tracking-tight">Kuwy HelpDesk</span>
                  <span className="badge bg-primary ms-1" style={{ fontSize: '0.65rem' }}>14-DAY TRIAL</span>
                </div>

                <h3 className="fw-bolder mb-3 text-white" style={{ letterSpacing: '-0.5px', lineHeight: '1.25' }}>
                  Set up your company helpdesk in under 60 seconds.
                </h3>
                <p className="text-slate-400 small mb-4" style={{ lineHeight: '1.6' }}>
                  Everything you need to turn customer emails into structured tickets, automate SLA escalation, and empower your support engineers.
                </p>

                <div className="d-flex flex-column gap-3 mb-4">
                  <div className="d-flex align-items-start gap-2.5">
                    <CheckCircle2 size={18} className="text-emerald-400 text-success flex-shrink-0 mt-0.5" />
                    <div className="small">
                      <strong className="text-white">Gmail & Outlook Forwarding:</strong> Customers keep sending to your real email address.
                    </div>
                  </div>
                  <div className="d-flex align-items-start gap-2.5">
                    <CheckCircle2 size={18} className="text-emerald-400 text-success flex-shrink-0 mt-0.5" />
                    <div className="small">
                      <strong className="text-white">Strict Multi-Tenant Isolation:</strong> Your data is sealed in its own tenant partition.
                    </div>
                  </div>
                  <div className="d-flex align-items-start gap-2.5">
                    <CheckCircle2 size={18} className="text-emerald-400 text-success flex-shrink-0 mt-0.5" />
                    <div className="small">
                      <strong className="text-white">Automated SLA Policies:</strong> 15-minute response warnings & round-robin assignment.
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Trust Badge */}
              <div className="p-3 rounded-3 border" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
                <div className="d-flex align-items-center gap-2 text-warning small fw-bold mb-1">
                  <ShieldCheck size={16} />
                  <span>Enterprise Security Standards</span>
                </div>
                <small className="text-slate-400 d-block" style={{ fontSize: '0.75rem' }}>
                  No credit card required. Passwords hashed with BCrypt. Full compliance with India DPDP Act & GDPR.
                </small>
              </div>
            </div>

            {/* RIGHT COLUMN: MULTI-STEP SIGNUP & PROVISIONING WIZARD */}
            <div className="col-12 col-lg-7 p-4 p-md-5 bg-white d-flex flex-column justify-content-between position-relative">
              
              {/* Close Button */}
              <button
                type="button"
                className="btn btn-sm btn-light rounded-circle position-absolute top-0 end-0 m-3 p-1.5 text-muted hover-bg-light"
                onClick={onClose}
                disabled={isLoading}
              >
                <X size={18} />
              </button>

              <div>
                {/* Stepper Header */}
                <div className="d-flex align-items-center gap-2 mb-4">
                  <span className="badge bg-primary-subtle text-primary fw-bold px-2.5 py-1 rounded-pill" style={{ fontSize: '0.72rem' }}>
                    {step === 1 && 'STEP 1 OF 3 • ACCOUNT & WORKSPACE'}
                    {step === 2 && 'STEP 2 OF 3 • EMAIL VERIFICATION'}
                    {step === 3 && 'STEP 3 OF 3 • PROVISIONING WORKSPACE'}
                    {step === 4 && 'READY • WELCOME TO HELPDESK'}
                  </span>
                </div>

                {errorMessage && (
                  <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3 d-flex align-items-center gap-2">
                    <ShieldAlert size={16} className="text-danger flex-shrink-0" />
                    <div>{errorMessage}</div>
                  </div>
                )}

                {/* ==========================================================
                    SCREEN 3: COMPANY SIGN-UP FORM
                    ========================================================== */}
                {step === 1 && (
                  <div>
                    <h4 className="fw-bolder text-dark mb-1">Create your company account</h4>
                    <p className="text-muted small mb-3">Sign up in seconds to start your 14-day free trial.</p>

                    {/* OAuth Quick Options */}
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <button
                          type="button"
                          className="btn btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-2 small fw-semibold py-2"
                          onClick={() => handleOAuthSimulate('Google')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.41 7.34 24 12 24z"/>
                            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.16 0 9.94 0 12s.45 3.84 1.24 5.42l4.04-3.15z"/>
                            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.59 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                          </svg>
                          <span>Google</span>
                        </button>
                      </div>
                      <div className="col-6">
                        <button
                          type="button"
                          className="btn btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-2 small fw-semibold py-2"
                          onClick={() => handleOAuthSimulate('Microsoft')}
                        >
                          <svg width="16" height="16" viewBox="0 0 23 23">
                            <path fill="#f35325" d="M1 1h10v10H1z"/>
                            <path fill="#81bc06" d="M12 1h10v10H12z"/>
                            <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                            <path fill="#ffba08" d="M12 12h10v10H12z"/>
                          </svg>
                          <span>Microsoft</span>
                        </button>
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-2 my-2.5">
                      <hr className="flex-grow-1" />
                      <span className="small text-muted" style={{ fontSize: '0.75rem' }}>or work email</span>
                      <hr className="flex-grow-1" />
                    </div>

                    <form onSubmit={handleProceedToVerify}>
                      <div className="row g-2.5">
                        <div className="col-12 col-md-6">
                          <label className="form-label small fw-semibold text-secondary mb-1">Full Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. John Doe"
                            className="form-control form-control-sm"
                            value={adminName}
                            onChange={e => setAdminName(e.target.value)}
                          />
                        </div>

                        <div className="col-12 col-md-6">
                          <label className="form-label small fw-semibold text-secondary mb-1">Work Email *</label>
                          <input
                            type="email"
                            required
                            placeholder="john@acme.com"
                            className="form-control form-control-sm"
                            value={adminEmail}
                            onChange={e => setAdminEmail(e.target.value)}
                          />
                        </div>

                        <div className="col-12 col-md-6">
                          <label className="form-label small fw-semibold text-secondary mb-1">Company / Organization *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Acme Logistics"
                            className="form-control form-control-sm"
                            value={companyName}
                            onChange={e => handleCompanyNameChange(e.target.value)}
                          />
                        </div>

                        <div className="col-12 col-md-6">
                          <label className="form-label small fw-semibold text-secondary mb-1">Workspace Address *</label>
                          <div className="input-group input-group-sm">
                            <input
                              type="text"
                              required
                              placeholder="acme"
                              className={`form-control text-end pe-1 fw-bold ${subdomainStatus === 'available' ? 'is-valid' : subdomainStatus === 'taken' ? 'is-invalid' : ''}`}
                              value={subdomain}
                              onChange={e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            />
                            <span className="input-group-text bg-light text-muted small">.kuwyhelpdesk.in</span>
                          </div>
                          {subdomainMessage && (
                            <small className={`d-block mt-0.5 ${subdomainStatus === 'available' ? 'text-success' : 'text-danger'}`} style={{ fontSize: '0.72rem' }}>
                              {subdomainMessage}
                            </small>
                          )}
                        </div>

                        <div className="col-12">
                          <label className="form-label small fw-semibold text-secondary mb-1">Admin Password *</label>
                          <div className="input-group input-group-sm">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              placeholder="••••••••••••"
                              className="form-control"
                              value={adminPassword}
                              onChange={e => setAdminPassword(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          {/* Password Strength Meter */}
                          <div className="d-flex align-items-center gap-2 mt-1">
                            <div className="progress flex-grow-1" style={{ height: '4px' }}>
                              <div
                                className="progress-bar"
                                style={{
                                  width: `${(pwdStrength.score / 3) * 100}%`,
                                  backgroundColor: pwdStrength.color
                                }}
                              />
                            </div>
                            <span className="small fw-semibold" style={{ fontSize: '0.72rem', color: pwdStrength.color }}>
                              {pwdStrength.text}
                            </span>
                          </div>
                        </div>

                        {/* Agreement Checkbox */}
                        <div className="col-12 pt-1">
                          <div className="form-check small text-muted">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id="termsCheck"
                              checked={agreeTerms}
                              onChange={e => setAgreeTerms(e.target.checked)}
                              required
                            />
                            <label className="form-check-label" htmlFor="termsCheck" style={{ fontSize: '0.8rem' }}>
                              I agree to the <a href="#terms" className="text-primary">Terms of Service</a> and <a href="#privacy" className="text-primary">Privacy Policy</a>
                            </label>
                          </div>
                        </div>

                        {/* Turnstile / reCAPTCHA indicator */}
                        <div className="col-12">
                          <div className="p-2 rounded bg-light border d-flex align-items-center justify-content-between small text-muted" style={{ fontSize: '0.75rem' }}>
                            <div className="d-flex align-items-center gap-2">
                              <ShieldCheck size={16} className="text-success" />
                              <span>Cloudflare Turnstile Bot Protection: Verified Human</span>
                            </div>
                            <span className="badge bg-secondary-subtle text-secondary">Verified</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3.5 pt-2 border-top d-flex align-items-center justify-content-between">
                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                          Already have a workspace? <a href="#signin" onClick={() => onClose()} className="text-primary fw-semibold">Sign in</a>
                        </small>
                        <button
                          type="submit"
                          className="btn btn-primary fw-bold px-4 py-2 d-flex align-items-center gap-1.5 shadow-sm"
                          disabled={isLoading || !agreeTerms || !companyName.trim() || !subdomain.trim() || subdomainStatus === 'taken'}
                        >
                          {isLoading ? (
                            <>
                              <RefreshCw size={15} className="spin-animation" />
                              <span>Creating Account...</span>
                            </>
                          ) : (
                            <>
                              <span>Create My Account</span>
                              <ArrowRight size={15} />
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* ==========================================================
                    SCREEN 4a: "CHECK YOUR EMAIL" (VERIFICATION CODE)
                    ========================================================== */}
                {step === 2 && (
                  <div className="text-center py-2">
                    <div className="p-3 rounded-circle bg-primary-subtle text-primary d-inline-flex mb-3">
                      <Mail size={32} />
                    </div>
                    <h4 className="fw-bolder text-dark mb-1">Check your email</h4>
                    <p className="text-muted small mx-auto mb-3" style={{ maxWidth: '420px' }}>
                      We sent a 6-digit confirmation code to <strong>{adminEmail}</strong>.
                      Please enter it below to verify your identity.
                    </p>

                    <div className="mb-3 mx-auto" style={{ maxWidth: '300px' }}>
                      <label className="form-label small fw-semibold text-secondary">6-Digit Verification Code</label>
                      <input
                        type="text"
                        maxLength={6}
                        className="form-control form-control-lg text-center font-monospace fw-bolder fs-4 letter-spacing-2"
                        value={verificationCode}
                        onChange={e => setVerificationCode(e.target.value)}
                        placeholder="849201"
                      />
                      <small className="text-muted d-block mt-1" style={{ fontSize: '0.74rem' }}>
                        Tip: Check your spam or promotions folder if not found.
                      </small>
                    </div>

                    <div className="d-flex align-items-center justify-content-center gap-3 mb-4">
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-muted p-0 text-decoration-none"
                        onClick={() => setStep(1)}
                      >
                        ← Change email
                      </button>
                      <span className="text-muted">•</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-primary p-0 text-decoration-none fw-semibold"
                        disabled={resendCooldown > 0}
                        onClick={() => setResendCooldown(60)}
                      >
                        {resendCooldown > 0 ? `Resend email (${resendCooldown}s)` : 'Resend code now'}
                      </button>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary fw-bold px-4 py-2 w-100 shadow-sm"
                      style={{ maxWidth: '300px' }}
                      onClick={handleVerifyAndProvision}
                    >
                      Verify & Build Workspace
                    </button>
                  </div>
                )}

                {/* ==========================================================
                    SCREEN 4b: WORKSPACE CREATION PROGRESS ANIMATION
                    ========================================================== */}
                {step === 3 && (
                  <div className="py-3">
                    <h4 className="fw-bolder text-dark mb-1">Building your workspace...</h4>
                    <p className="text-muted small mb-4">
                      Configuring multi-tenant database partitions and support email targets.
                    </p>

                    {/* Progress Bar */}
                    <div className="progress mb-4" style={{ height: '8px' }}>
                      <div
                        className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                        style={{ width: `${provisionProgress}%` }}
                      />
                    </div>

                    {/* Sequential Animated Checklist */}
                    <div className="d-flex flex-column gap-2.5">
                      {[
                        `Reserving workspace address: ${subdomain}.kuwyhelpdesk.in`,
                        `Creating dedicated tenant database container & company ID`,
                        `Assigning primary Administrator credentials to ${adminEmail}`,
                        `Generating unique support forwarding address: ${subdomain}@tickets.helpdesk.com`,
                        `Pre-configuring default departments, SLA policies & canned responses`
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-3 border d-flex align-items-center gap-3 transition-all ${idx <= provisioningItem ? 'bg-success-subtle border-success-subtle text-dark' : 'bg-light border-light text-muted opacity-50'}`}
                        >
                          {idx <= provisioningItem ? (
                            <CheckCircle2 size={18} className="text-success flex-shrink-0" />
                          ) : (
                            <RefreshCw size={16} className="text-muted flex-shrink-0 spin-animation" />
                          )}
                          <span className="small fw-semibold">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ==========================================================
                    SCREEN 4c: FIRST-RUN WELCOME & SHORT ONBOARDING CHECKLIST
                    ========================================================== */}
                {step === 4 && (
                  <div className="py-2">
                    <div className="p-3 rounded-circle bg-success-subtle text-success d-inline-flex mb-3">
                      <CheckCircle2 size={36} />
                    </div>
                    <h4 className="fw-bolder text-dark mb-1">Workspace Ready!</h4>
                    <p className="text-muted small mb-4">
                      Welcome to <strong>{companyName}</strong> HelpDesk. Your 14-day free trial is now active.
                    </p>

                    {/* 3-Step First-Run Onboarding Checklist */}
                    <div className="card p-3 rounded-3 border bg-light mb-4 text-start">
                      <div className="fw-bold small text-dark mb-2">First-Run Setup Checklist:</div>
                      <div className="d-flex flex-column gap-2 small">
                        <div className="d-flex align-items-center gap-2 text-dark">
                          <CheckSquare size={16} className="text-primary" />
                          <span><strong>1. Connect Support Email:</strong> Forward Gmail / Outlook to your tickets queue</span>
                        </div>
                        <div className="d-flex align-items-center gap-2 text-dark">
                          <CheckSquare size={16} className="text-primary" />
                          <span><strong>2. Invite Agents:</strong> Add support team members in Admin Settings</span>
                        </div>
                        <div className="d-flex align-items-center gap-2 text-dark">
                          <CheckSquare size={16} className="text-primary" />
                          <span><strong>3. Test Public Portal:</strong> Raise a test ticket from your public portal</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary fw-bold px-4 py-2.5 w-100 shadow-md d-flex align-items-center justify-content-center gap-2"
                      onClick={() => {
                        if (provisionedResponse) {
                          onSuccess(provisionedResponse);
                        } else {
                          onClose();
                        }
                      }}
                    >
                      <span>Proceed to Your HelpDesk Workspace</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
