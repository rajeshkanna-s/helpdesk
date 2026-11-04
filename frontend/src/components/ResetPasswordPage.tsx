import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound, Lock, Eye, EyeOff, CheckCircle2, XCircle, AlertCircle,
  ShieldCheck, ArrowRight, ArrowLeft
} from 'lucide-react';
import { apiService } from '../services/api';
import { useAuthLinkToken } from '../utils/useAuthLinkToken';

interface ResetPasswordPageProps {
  onNavigate: (path: string) => void;
  onResetComplete?: () => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onNavigate, onResetComplete }) => {
  const token = useAuthLinkToken('/reset-password');
  const validationRequest = useRef(0);
  const [isValidating, setIsValidating] = useState<boolean>(true);
  const [tokenStatus, setTokenStatus] = useState<'VALID' | 'EXPIRED' | 'USED' | 'NOT_FOUND' | 'UNAVAILABLE' | null>(null);
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
    setIsSuccess(false);
    setNewPassword('');
    setConfirmPassword('');
    setSubmitError(null);
    setMaskedEmail('');
    if (!token) {
      setIsValidating(false);
      setTokenStatus('NOT_FOUND');
      setValidationError('Open the complete reset link from your email to continue.');
      return;
    }

    validateToken(token);
    return () => { validationRequest.current += 1; };
  }, [token]);

  const validateToken = async (tok: string) => {
    const requestId = ++validationRequest.current;
    setIsValidating(true);
    setValidationError('');
    try {
      const res = await apiService.validateResetToken(tok);
      if (requestId !== validationRequest.current) return;
      if (res.valid) {
        setTokenStatus('VALID');
        if (res.email) setMaskedEmail(res.email);
      } else {
        setTokenStatus((res.status as any) || 'NOT_FOUND');
        setValidationError(res.message || 'This reset link is either invalid or expired.');
      }
    } catch (err: any) {
      if (requestId !== validationRequest.current) return;
      setTokenStatus('UNAVAILABLE');
      setValidationError(err.response?.data?.message || err.response?.data?.error || 'We could not check this link right now. Please try again.');
    } finally {
      if (requestId === validationRequest.current) setIsValidating(false);
    }
  };

  // Password rules validation
  const hasMinLength = [...newPassword].length >= 10;
  const validCharacters = newPassword.length <= 1024 && !/[\u0000-\u001f\u007f-\u009f]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  // Strength score
  const strengthScore = [10, 14, 20, 28].filter(length => [...newPassword].length >= length).length;

  const getStrengthMeta = () => {
    if (newPassword.length === 0) return { label: '', color: '#cbd5e1', width: '0%' };
    if (strengthScore === 0) return { label: 'Too short', color: '#b63a3a', width: '20%' };
    if (strengthScore === 1) return { label: 'Minimum length', color: '#997014', width: '40%' };
    if (strengthScore === 2) return { label: 'Good length', color: '#2563eb', width: '60%' };
    return { label: 'Long passphrase', color: '#298258', width: '100%' };
  };

  const strengthMeta = getStrengthMeta();
  const allRulesPassed = hasMinLength && validCharacters && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesPassed || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await apiService.resetPassword({
        token,
        newPassword,
      });
      onResetComplete?.();
      setNewPassword('');
      setConfirmPassword('');
      setIsSuccess(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Your password could not be updated. Please try again.';
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
          <span className="account-flow-mark"><KeyRound size={23} /></span>
          <div><h1>Set a new password</h1><p>Restore access to your workspace.</p></div>
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
                Your password has changed and previous sign-in tokens are no longer valid. Sign in again to continue.
              </p>
              <button
                type="button"
                className="btn btn-primary w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
                onClick={() => onNavigate('/login')}
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
                {tokenStatus === 'UNAVAILABLE' ? 'Unable to check this link' : tokenStatus === 'EXPIRED'
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
                onClick={() => tokenStatus === 'UNAVAILABLE' ? validateToken(token) : onNavigate('/login')}
              >
                <ArrowLeft size={18} />
                <span>{tokenStatus === 'UNAVAILABLE' ? 'Try again' : 'Back to sign in'}</span>
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
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-4" role="alert">
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
                    aria-label="New password"
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={1024}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-light border border-start-0"
                    aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} className="text-muted" /> : <Eye size={18} className="text-muted" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {newPassword.length > 0 && (
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
                    aria-label="Confirm new password"
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!allRulesPassed || isSubmitting}
                className="btn btn-primary w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    <span>Updating password...</span>
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
              onClick={() => onNavigate('/login')}
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
