import React, { useState, useEffect } from 'react';
import {
  KeyRound, Lock, Eye, EyeOff, CheckCircle2, XCircle, AlertCircle,
  ShieldCheck, ArrowRight, ArrowLeft
} from 'lucide-react';
import { apiService } from '../services/api';

interface ResetPasswordPageProps {
  onNavigate: (path: string) => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onNavigate }) => {
  const [token, setToken] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(true);
  const [tokenStatus, setTokenStatus] = useState<'VALID' | 'EXPIRED' | 'USED' | 'NOT_FOUND' | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (!tokenParam) {
      setIsValidating(false);
      setTokenStatus('NOT_FOUND');
      setValidationError('No reset token was provided in the URL.');
      return;
    }

    setToken(tokenParam);
    validateToken(tokenParam);
  }, []);

  const validateToken = async (tok: string) => {
    setIsValidating(true);
    setValidationError('');
    try {
      const res = await apiService.validateResetToken(tok);
      if (res.valid) {
        setTokenStatus('VALID');
        if (res.email) setMaskedEmail(res.email);
      } else {
        setTokenStatus((res.status as any) || 'NOT_FOUND');
        setValidationError(res.message || 'This reset link is either invalid or expired.');
      }
    } catch (err: any) {
      setTokenStatus('NOT_FOUND');
      setValidationError(err.response?.data?.error || 'Failed to validate reset link.');
    } finally {
      setIsValidating(false);
    }
  };

  // Password rules validation
  const hasMinLength = newPassword.length >= 10;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{}|;':",.<>?]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  // Strength score
  let strengthScore = 0;
  if (hasMinLength) strengthScore += 1;
  if (hasUpper && hasLower) strengthScore += 1;
  if (hasNumber) strengthScore += 1;
  if (hasSpecial) strengthScore += 1;

  const getStrengthMeta = () => {
    if (newPassword.length === 0) return { label: '', color: '#cbd5e1', width: '0%' };
    if (strengthScore <= 1) return { label: 'Weak', color: '#ef4444', width: '25%' };
    if (strengthScore === 2) return { label: 'Fair', color: '#f59e0b', width: '50%' };
    if (strengthScore === 3) return { label: 'Good', color: '#3b82f6', width: '75%' };
    return { label: 'Strong & Secure', color: '#10b981', width: '100%' };
  };

  const strengthMeta = getStrengthMeta();
  const allRulesPassed = hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesPassed) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await apiService.resetPassword({
        token,
        newPassword,
      });
      setIsSuccess(true);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to update password.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center py-5 px-3"
      style={{
        background: 'radial-gradient(ellipse at top left, #eef2ff 0%, #f8fafc 45%, #e2e8f0 100%)',
      }}
    >
      <div className="card shadow-lg border-0 rounded-4 overflow-hidden" style={{ maxWidth: '520px', width: '100%' }}>
        {/* Header Ribbon */}
        <div className="bg-primary bg-gradient p-4 text-white text-center">
          <div
            className="d-inline-flex p-3 rounded-circle bg-white bg-opacity-20 mb-3 shadow-sm"
          >
            <KeyRound size={32} className="text-white" />
          </div>
          <h4 className="fw-bold mb-1">Set New Password</h4>
          <p className="text-white text-opacity-80 small mb-0">
            Screen 7b • Enterprise Access Recovery
          </p>
        </div>

        <div className="card-body p-4 p-md-5">
          {/* Loading state */}
          {isValidating && (
            <div className="text-center py-5">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Validating...</span>
              </div>
              <p className="text-muted fw-semibold">Verifying secure token validity...</p>
            </div>
          )}

          {/* Success state */}
          {!isValidating && isSuccess && (
            <div className="text-center py-3">
              <div className="d-inline-flex p-3 rounded-circle bg-success bg-opacity-10 text-success mb-3">
                <CheckCircle2 size={48} />
              </div>
              <h5 className="fw-bold text-dark mb-2">Password Successfully Updated</h5>
              <p className="text-muted small mb-4">
                Your credentials have been securely refreshed. For your security, all previous active sessions have been terminated.
              </p>
              <button
                type="button"
                className="btn btn-primary w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
                onClick={() => onNavigate('/kuwy/admin')}
              >
                <span>Proceed to Sign In</span>
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {/* Problem states (Expired, Used, Not Found) */}
          {!isValidating && !isSuccess && tokenStatus !== 'VALID' && (
            <div className="text-center py-3">
              <div className="d-inline-flex p-3 rounded-circle bg-danger bg-opacity-10 text-danger mb-3">
                <AlertCircle size={48} />
              </div>
              <h5 className="fw-bold text-dark mb-2">
                {tokenStatus === 'EXPIRED'
                  ? 'Reset Link Expired'
                  : tokenStatus === 'USED'
                  ? 'Link Already Consumed'
                  : 'Invalid Reset Link'}
              </h5>
              <p className="text-muted small mb-4">
                {validationError || 'This password reset link is no longer valid. Reset links expire after 1 hour or upon use.'}
              </p>
              <button
                type="button"
                className="btn btn-primary w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
                onClick={() => onNavigate('/login')}
              >
                <ArrowLeft size={18} />
                <span>Request a New Reset Link</span>
              </button>
            </div>
          )}

          {/* Valid Token -> Set Password Form */}
          {!isValidating && !isSuccess && tokenStatus === 'VALID' && (
            <form onSubmit={handleSubmit}>
              {maskedEmail && (
                <div className="alert alert-info py-2 px-3 small d-flex align-items-center gap-2 mb-4">
                  <ShieldCheck size={18} className="text-info flex-shrink-0" />
                  <span>Updating password for account: <strong>{maskedEmail}</strong></span>
                </div>
              )}

              {submitError && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-4">
                  <AlertCircle size={18} className="text-danger flex-shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* New Password */}
              <div className="mb-3">
                <label className="form-label fw-semibold small text-muted">New Password</label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-end-0">
                    <Lock size={18} className="text-muted" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-control border-start-0 border-end-0"
                    placeholder="Enter new secure password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-light border border-start-0"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} className="text-muted" /> : <Eye size={18} className="text-muted" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {newPassword.length > 0 && (
                  <div className="mt-2">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="small text-muted" style={{ fontSize: '0.75rem' }}>Strength:</span>
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
              <div className="mb-4">
                <label className="form-label fw-semibold small text-muted">Confirm New Password</label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-end-0">
                    <Lock size={18} className="text-muted" />
                  </span>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="form-control border-start-0 border-end-0"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-light border border-start-0"
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
                  <li className={`d-flex align-items-center gap-2 mb-1 ${hasUpper && hasLower ? 'text-success' : 'text-muted'}`}>
                    {hasUpper && hasLower ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    <span>Uppercase (A-Z) and lowercase (a-z) letters</span>
                  </li>
                  <li className={`d-flex align-items-center gap-2 mb-1 ${hasNumber ? 'text-success' : 'text-muted'}`}>
                    {hasNumber ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    <span>At least one number (0-9)</span>
                  </li>
                  <li className={`d-flex align-items-center gap-2 mb-1 ${hasSpecial ? 'text-success' : 'text-muted'}`}>
                    {hasSpecial ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    <span>At least one special symbol (!@#$%^&*)</span>
                  </li>
                  <li className={`d-flex align-items-center gap-2 ${passwordsMatch ? 'text-success' : 'text-muted'}`}>
                    {passwordsMatch ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    <span>Passwords match</span>
                  </li>
                </ul>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!allRulesPassed || isSubmitting}
                className="btn btn-primary w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    <span>Updating Security Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Update Password</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Back Link */}
          <div className="text-center mt-4">
            <button
              type="button"
              className="btn btn-link text-decoration-none text-muted small p-0 d-inline-flex align-items-center gap-1"
              onClick={() => onNavigate('/kuwy/admin')}
            >
              <ArrowLeft size={14} />
              <span>Back to Sign In</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
