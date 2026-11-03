import React, { useState, useEffect } from 'react';
import {
  KeyRound, Mail, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Clock, ExternalLink
} from 'lucide-react';
import { apiService } from '../services/api';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
  companyCode?: string;
  onNavigateToReset?: (token: string) => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
  companyCode = '',
  onNavigateToReset,
}) => {
  const [email, setEmail] = useState(defaultEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  useEffect(() => {
    if (defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail]);

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
    if (!email.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiService.forgotPassword({
        email: email.trim(),
        companyCode: companyCode.trim() || undefined,
      });

      setIsSent(true);
      setCountdown(60);
      if (res.devResetUrl) {
        setDevResetUrl(res.devResetUrl);
      }
    } catch (err: any) {
      // Per Section B security specifications, we still display the generic blind confirmation
      setIsSent(true);
      setCountdown(60);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = () => {
    if (countdown > 0) return;
    handleSubmit({ preventDefault: () => {} } as any);
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', zIndex: 1060 }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '480px' }}>
        <div className="modal-content rounded-4 border-0 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-primary p-4 text-white position-relative">
            <button
              type="button"
              className="btn-close btn-close-white position-absolute top-0 end-0 m-3"
              onClick={onClose}
              aria-label="Close"
            />
            <div className="d-flex align-items-center gap-3">
              <div className="p-2.5 rounded-3 bg-white bg-opacity-20">
                <KeyRound size={26} className="text-white" />
              </div>
              <div>
                <h5 className="modal-title fw-bold mb-0">Reset Your Password</h5>
                <small className="text-white text-opacity-80">Screen 7a • Password Recovery</small>
              </div>
            </div>
          </div>

          <div className="modal-body p-4">
            {!isSent ? (
              <form onSubmit={handleSubmit}>
                <p className="text-muted small mb-4">
                  Enter your email address and we will send you a secure, single-use link to reset your password. The link will remain valid for <strong>1 hour</strong>.
                </p>

                {errorMessage && (
                  <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                    <AlertCircle size={16} />
                    <span>{errorMessage}</span>
                  </div>
                )}

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
                  If an account exists for <strong>{email}</strong>, we’ve dispatched a password reset link. Please check your inbox and spam folder.
                </p>

                {/* Dev Simulator helper card */}
                {devResetUrl && (
                  <div className="alert alert-warning text-start p-3 mb-3 border-warning">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="badge bg-warning text-dark fw-bold">LOCAL DEV SIMULATOR</span>
                      <small className="text-muted">1-hour token</small>
                    </div>
                    <p className="small mb-2 text-dark">
                      In production, this link is delivered via transactional email. For immediate testing, click below:
                    </p>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-dark w-100 d-flex align-items-center justify-content-center gap-1.5 fw-semibold"
                      onClick={() => {
                        onClose();
                        const tokenMatch = devResetUrl.match(/token=([^&]+)/);
                        if (tokenMatch && onNavigateToReset) {
                          onNavigateToReset(tokenMatch[1]);
                        } else {
                          window.location.href = devResetUrl;
                        }
                      }}
                    >
                      <span>Open Reset Password Link</span>
                      <ExternalLink size={14} />
                    </button>
                  </div>
                )}

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
    </div>
  );
};
