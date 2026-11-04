import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound, Mail, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Clock
} from 'lucide-react';
import { apiService } from '../services/api';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
  companyCode?: string;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
  companyCode = '',
  returnFocusRef,
}) => {
  const [email, setEmail] = useState(defaultEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(defaultEmail);
    setIsSent(false);
    setCountdown(0);
    setErrorMessage(null);
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      dialog?.close();
      window.requestAnimationFrame(() => returnFocusRef?.current?.focus());
    };
  }, [isOpen, defaultEmail, returnFocusRef]);

  useEffect(() => {
    let timer: any = null;
    if (isSent && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => c - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isSent, countdown]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendLink();
  };

  const sendLink = async () => {
    if (!email.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await apiService.forgotPassword({
        email: email.trim(),
        companyCode: companyCode.trim() || undefined,
      });

      setIsSent(true);
      setCountdown(60);
    } catch (err: any) {
      const message = err.response?.data?.message || err.response?.data?.error;
      setErrorMessage(message === 'ACCOUNT_EMAIL_NOT_READY'
        ? 'Password recovery email is not available yet. Contact your administrator.'
        : message || 'We could not request a reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = () => {
    if (countdown > 0 || isLoading) return;
    void sendLink();
  };

  return (
    <dialog ref={dialogRef} className="account-flow-dialog" aria-labelledby="forgot-password-title" onCancel={event => { event.preventDefault(); if (!isLoading) onClose(); }} onClick={event => { if (!isLoading && event.target === event.currentTarget) onClose(); }}>
      <div className="modal-dialog">
        <div className="modal-content">
          {/* Header */}
          <div className="account-flow-header position-relative">
            <button
              type="button"
              className="btn-close position-absolute top-0 end-0 m-3"
              onClick={onClose}
              aria-label="Close"
              disabled={isLoading}
            />
            <div className="d-flex align-items-center gap-3">
              <span className="account-flow-mark"><KeyRound size={23} /></span>
              <div><h2 id="forgot-password-title">Reset your password</h2><p>We will help you get back to work.</p></div>
            </div>
          </div>

          <div className="modal-body p-4">
            {errorMessage && <div className="alert alert-danger small" role="alert"><AlertCircle size={16} className="me-2" />{errorMessage}</div>}
            {!isSent ? (
              <form onSubmit={handleSubmit}>
                <p className="text-muted small mb-4">
                  Enter your email address and we will send you a secure, single-use link to reset your password. The link will remain valid for <strong>1 hour</strong>.
                </p>

                <div className="mb-4">
                  <label className="form-label fw-semibold small text-muted">Email Address</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light border-end-0">
                      <Mail size={18} className="text-muted" />
                    </span>
                    <input
                      type="email"
                      className="form-control border-start-0"
                      placeholder="name@company.com"
                      aria-label="Recovery email address"
                      autoComplete="email"
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <button
                    type="button"
                      className="btn btn-light border w-50 py-2.5 fw-semibold"
                      disabled={isLoading}
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="btn btn-primary w-50 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Link</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-2">
                <div className="d-inline-flex p-3 rounded-circle bg-success bg-opacity-10 text-success mb-3">
                  <CheckCircle2 size={40} />
                </div>
                <h5 className="fw-bold text-dark mb-2">Check Your Email</h5>
                <p className="text-muted small mb-3">
                  If an active account matches <strong>{email}</strong>, a reset email has been queued. Please check your inbox and spam folder shortly.
                </p>

                {/* Resend Countdown */}
                <div className="bg-light p-3 rounded-3 mb-4 d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2 small text-muted">
                    <Clock size={16} />
                    <span>Didn't get the email?</span>
                  </div>
                  {countdown > 0 ? (
                    <span className="badge bg-secondary">Resend in {countdown}s</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-primary text-decoration-none fw-semibold"
                      disabled={isLoading}
                      onClick={handleResend}
                    >
                      Resend link
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-outline-secondary w-100 py-2 fw-semibold d-flex align-items-center justify-content-center gap-2"
                  onClick={onClose}
                >
                  <ArrowLeft size={16} />
                  <span>Back to Sign In</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
};
