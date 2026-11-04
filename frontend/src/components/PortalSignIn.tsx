import { useEffect, useId, useRef } from 'react';
import { Mail } from 'lucide-react';

interface PortalSignInProps {
  step: 'input' | 'otp';
  email: string;
  code: string;
  notice: string | null;
  error: string | null;
  countdown: number;
  pending: 'request' | 'verify' | null;
  onEmailChange: (email: string) => void;
  onCodeChange: (code: string) => void;
  onRequestCode: () => Promise<void>;
  onVerifyCode: () => Promise<void>;
  onChangeEmail: () => void;
}

export function PortalSignIn({
  step, email, code, notice, error, countdown, pending,
  onEmailChange, onCodeChange, onRequestCode, onVerifyCode, onChangeEmail,
}: PortalSignInProps) {
  const id = useId();
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'otp') codeInput.current?.focus();
  }, [step]);

  return (
    <div>
      <form onSubmit={event => {
        event.preventDefault();
        void (step === 'input' ? onRequestCode() : onVerifyCode());
      }} aria-busy={pending !== null}>
        {notice && <div className="alert alert-info py-2 px-3 small" role="status">{notice}</div>}
        {error && <div id={`${id}-error`} className="alert alert-danger py-2 px-3 small" role="alert">{error}</div>}
        {step === 'input' ? (
          <div className="mb-3">
            <label htmlFor={`${id}-email`} className="form-label small fw-bold text-dark">Your Email Address</label>
            <div className="input-group">
              <span className="input-group-text bg-light text-muted"><Mail size={16} aria-hidden="true" /></span>
              <input
                id={`${id}-email`}
                name="email"
                type="email"
                className="form-control"
                autoComplete="email"
                maxLength={254}
                required
                placeholder="name@example.com"
                value={email}
                disabled={pending !== null}
                aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
                onChange={event => onEmailChange(event.target.value)}
              />
            </div>
            <small id={`${id}-help`} className="text-muted d-block mt-1">Request a six-digit sign-in code by email. No password is needed.</small>
          </div>
        ) : (
          <div className="mb-3">
            <p className="small text-muted mb-2" style={{ overflowWrap: 'anywhere' }}>Enter the code for <strong>{email}</strong>.</p>
            <label htmlFor={`${id}-otp`} className="form-label small fw-bold text-dark">Six-Digit Sign-in Code</label>
            <input
              ref={codeInput}
              id={`${id}-otp`}
              name="one-time-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              className="form-control form-control-lg text-center font-monospace fw-bold"
              value={code}
              disabled={pending !== null}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={event => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
        )}
        <button
          type="submit"
          className="btn btn-primary w-100 py-2 fw-semibold"
          disabled={pending !== null || (step === 'input' ? !email.trim() : !/^\d{6}$/.test(code))}
        >
          {pending === 'request' ? 'Requesting Code...' : pending === 'verify' ? 'Verifying...' : step === 'input' ? 'Send Sign-in Code' : 'Verify & Sign In'}
        </button>
        {step === 'otp' && (
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
            <button type="button" className="btn btn-link btn-sm text-decoration-none p-0" disabled={pending !== null} onClick={onChangeEmail}>Use Different Email</button>
            <button type="button" className="btn btn-link btn-sm text-decoration-none p-0" disabled={pending !== null || countdown > 0} onClick={() => void onRequestCode()}>
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
            </button>
          </div>
        )}
      </form>
      <div className="row g-2 mt-3" aria-describedby={`${id}-sso`}>
        {['Google', 'Microsoft'].map(provider => (
          <div className="col-12 col-sm-6" key={provider}>
            <button type="button" className="btn btn-light border w-100 py-2 small fw-semibold" disabled aria-describedby={`${id}-sso`}>
              {provider} SSO <span className="d-block small fw-normal">Not configured</span>
            </button>
          </div>
        ))}
      </div>
      <p id={`${id}-sso`} className="small text-muted mt-2 mb-0">Google and Microsoft sign-in are not configured for this portal. Use email verification instead.</p>
    </div>
  );
}
