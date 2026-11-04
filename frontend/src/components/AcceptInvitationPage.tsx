import React, { useState, useEffect, useRef } from 'react';
import {
  UserPlus, Building2, Lock, Eye, EyeOff, CheckCircle2, AlertCircle,
  XCircle, ArrowRight, Mail, User as UserIcon
} from 'lucide-react';
import { apiService } from '../services/api';
import type { InvitationValidationResponse, LoginResponse } from '../types';
import { useAuthLinkToken } from '../utils/useAuthLinkToken';

interface AcceptInvitationPageProps {
  onLoginSuccess: (user: LoginResponse) => void;
  onNavigate: (path: string) => void;
}

export const AcceptInvitationPage: React.FC<AcceptInvitationPageProps> = ({
  onLoginSuccess,
  onNavigate,
}) => {
  const token = useAuthLinkToken('/accept-invitation');
  const validationRequest = useRef(0);
  const [isValidating, setIsValidating] = useState<boolean>(true);
  const [invitationData, setInvitationData] = useState<InvitationValidationResponse | null>(null);

  const [fullName, setFullName] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setPassword('');
    setConfirmPassword('');
    setAgreedToTerms(false);
    setSubmitError(null);
    setInvitationData(null);
    if (!token) {
      setIsValidating(false);
      setInvitationData({
        valid: false,
        status: 'NOT_FOUND',
        message: 'No invitation token was provided.',
      });
      return;
    }

    validateInvite(token);
    return () => { validationRequest.current += 1; };
  }, [token]);

  const validateInvite = async (tok: string) => {
    const requestId = ++validationRequest.current;
    setIsValidating(true);
    try {
      const res = await apiService.validateInvitation(tok);
      if (requestId !== validationRequest.current) return;
      setInvitationData(res);
      if (res.name) setFullName(res.name);
    } catch (err: any) {
      if (requestId !== validationRequest.current) return;
      setInvitationData({
        valid: false,
        status: 'NOT_FOUND',
        message: err.response?.data?.message || err.response?.data?.error || 'Unable to check this invitation right now. Please try again.',
      });
    } finally {
      if (requestId === validationRequest.current) setIsValidating(false);
    }
  };

  // Password rules validation
  const hasMinLength = [...password].length >= 10;
  const validCharacters = password.length <= 1024 && !/[\u0000-\u001f\u007f-\u009f]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  // Strength score
  const strengthScore = [10, 14, 20, 28].filter(length => [...password].length >= length).length;

  const getStrengthMeta = () => {
    if (password.length === 0) return { label: '', color: '#cbd5e1', width: '0%' };
    if (strengthScore === 0) return { label: 'Too short', color: '#b63a3a', width: '20%' };
    if (strengthScore === 1) return { label: 'Minimum length', color: '#997014', width: '40%' };
    if (strengthScore === 2) return { label: 'Good length', color: '#2563eb', width: '60%' };
    return { label: 'Long passphrase', color: '#298258', width: '100%' };
  };

  const strengthMeta = getStrengthMeta();
  const allRulesPassed = hasMinLength && validCharacters && passwordsMatch && agreedToTerms && fullName.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesPassed || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const loginRes = await apiService.acceptInvitation({
        token,
        name: fullName.trim(),
        password,
        agreedToTerms,
      });

      onLoginSuccess(loginRes);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'The invitation could not be accepted. Please try again.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="account-flow-page">
      <div className="account-flow-card">
        {/* Header Ribbon */}
        <div className="account-flow-header">
          <span className="account-flow-mark"><UserPlus size={23} /></span>
          <div><h1>Join your workspace</h1><p>{invitationData?.companyName || 'Accept your team invitation.'}</p></div>
        </div>

        <div className="card-body p-4 p-md-5">
          {/* 1. Loading State */}
          {isValidating && (
            <div className="text-center py-5">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Validating...</span>
              </div>
              <p className="text-muted fw-semibold">Checking invitation validity with workspace...</p>
            </div>
          )}

          {/* 2. Problem States (Screen 8b: Expired, Used, Revoked, Not Found) */}
          {!isValidating && invitationData && !invitationData.valid && (
            <div className="text-center py-3">
              <div className="d-inline-flex p-3 rounded-circle bg-danger bg-opacity-10 text-danger mb-3">
                <AlertCircle size={48} />
              </div>
              <h5 className="fw-bold text-dark mb-2">
                {invitationData.status === 'EXPIRED'
                  ? 'Invitation Expired'
                  : invitationData.status === 'USED'
                  ? 'Invitation Already Used'
                  : invitationData.status === 'REVOKED'
                  ? 'Invitation Revoked'
                  : 'Invalid Invitation Link'}
              </h5>
              <p className="text-muted small mb-4">
                {invitationData.message || 'This invitation link is not active. Please ask your administrator to send you a new link.'}
              </p>
              <div className="d-flex flex-column gap-2">
                <button
                  type="button"
                  className="btn btn-primary w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
                  onClick={() => onNavigate('/login')}
                >
                  <span>Go to Staff Sign In</span>
                  <ArrowRight size={18} />
                </button>
                <button
                  type="button"
                  className="btn btn-light border w-100 py-2 small"
                  onClick={() => onNavigate('/')}
                >
                  Return to Homepage
                </button>
              </div>
            </div>
          )}

          {/* 3. Valid State (Screen 8a: Accept Invitation Form) */}
          {!isValidating && invitationData && invitationData.valid && (
            <div>
              {/* Inviter Callout */}
              <div className="bg-light p-3 rounded-3 mb-4 border d-flex align-items-center gap-3">
                <div className="p-2.5 rounded-3 bg-primary bg-opacity-10 text-primary">
                  <Building2 size={24} />
                </div>
                <div>
                  <div className="fw-bold text-dark">
                    {invitationData.inviterName} has invited you
                  </div>
                  <small className="text-muted">
                    to join as <span className="badge bg-primary text-white">{invitationData.roleName}</span>
                  </small>
                </div>
              </div>

              {submitError && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-4" role="alert">
                  <AlertCircle size={18} className="text-danger flex-shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* Full Name */}
                <div className="mb-3">
                  <label className="form-label fw-semibold small text-muted">Your Full Name</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light border-end-0">
                      <UserIcon size={18} className="text-muted" />
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0"
                      placeholder="e.g. Alex Johnson"
                      aria-label="Your full name"
                      autoComplete="name"
                      maxLength={150}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Email (Read-Only) */}
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="form-label fw-semibold small text-muted mb-0">Staff Email Address</label>
                    <span className="badge bg-light text-secondary border" style={{ fontSize: '0.65rem' }}>Invited address</span>
                  </div>
                  <div className="input-group">
                    <span className="input-group-text bg-light border-end-0">
                      <Mail size={18} className="text-muted" />
                    </span>
                    <input
                      type="email"
                      aria-label="Invited email address"
                      className="form-control border-start-0 bg-light text-muted"
                      value={invitationData.email}
                      readOnly
                      disabled
                    />
                  </div>
                  <small className="text-muted" style={{ fontSize: '0.72rem' }}>
                    This address belongs to the invitation and cannot be changed here.
                  </small>
                </div>

                {/* Password */}
                <div className="mb-3">
                  <label className="form-label fw-semibold small text-muted">Create Account Password</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light border-end-0">
                      <Lock size={18} className="text-muted" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-control border-start-0 border-end-0"
                      placeholder="Set secure password"
                      aria-label="Create account password"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={1024}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-light border border-start-0"
                      aria-label={showPassword ? 'Hide account password' : 'Show account password'}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} className="text-muted" /> : <Eye size={18} className="text-muted" />}
                    </button>
                  </div>

                  {/* Password Strength Meter */}
                  {password.length > 0 && (
                    <div className="mt-2">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="small text-muted" style={{ fontSize: '0.75rem' }}>Length guide:</span>
                        <span className="small fw-bold" style={{ fontSize: '0.75rem', color: strengthMeta.color }}>
                          {strengthMeta.label}
                        </span>
                      </div>
                      <div className="progress" style={{ height: '6px' }}>
                        <div
                          className="progress-bar transition-all"
                          style={{
                            width: strengthMeta.width,
                            backgroundColor: strengthMeta.color,
                            transition: 'width 0.3s ease, background-color 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="mb-3">
                  <label className="form-label fw-semibold small text-muted">Confirm Password</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light border-end-0">
                      <Lock size={18} className="text-muted" />
                    </span>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="form-control border-start-0 border-end-0"
                      placeholder="Repeat password"
                      aria-label="Confirm account password"
                      autoComplete="new-password"
                      maxLength={1024}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-light border border-start-0"
                      aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff size={18} className="text-muted" /> : <Eye size={18} className="text-muted" />}
                    </button>
                  </div>
                </div>

                {/* Password Rules Checklist */}
                <div className="bg-light p-3 rounded-3 mb-4">
                  <div className="small fw-bold text-dark mb-2">Password Requirements:</div>
                  <ul className="list-unstyled mb-0 small">
                    <li className={`d-flex align-items-center gap-2 mb-1 ${hasMinLength ? 'text-success' : 'text-muted'}`}>
                      {hasMinLength ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      <span>Minimum 10 characters</span>
                    </li>
                    <li className={`d-flex align-items-center gap-2 ${passwordsMatch ? 'text-success' : 'text-muted'}`}>
                      {passwordsMatch ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      <span>Passwords match</span>
                    </li>
                  </ul>
                  <p className="text-muted small mt-2 mb-0">Use a unique, long passphrase. Symbols are optional; common passwords are rejected.</p>
                </div>

                {/* Terms and Privacy Agreement */}
                <div className="form-check mb-4">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="termsAgreementCheck"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    required
                  />
                  <label className="form-check-label small text-muted" htmlFor="termsAgreementCheck">
                    I agree to the <a href="/?legal=terms" target="_blank" rel="noopener noreferrer" className="text-primary text-decoration-none">Terms of Service</a>,{' '}
                    <a href="/?legal=privacy" target="_blank" rel="noopener noreferrer" className="text-primary text-decoration-none">Privacy Policy</a>, and acceptable usage guidelines of this workspace.
                  </label>
                </div>

                {/* Join Button */}
                <button
                  type="submit"
                  disabled={!allRulesPassed || isSubmitting}
                  className="btn btn-primary w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      <span>Joining Workspace...</span>
                    </>
                  ) : (
                    <>
                      <span>Join {invitationData.companyName}</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
