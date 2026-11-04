import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { CheckCircle2, Eye, EyeOff, LifeBuoy, X } from 'lucide-react';
import { apiService } from '../services/api';
import type { PublicPlan } from '../services/api';
import type { LoginResponse } from '../types';
import { TurnstileChallenge } from './TurnstileChallenge';
import './onboarding.css';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (res: LoginResponse) => void;
  defaultPlan?: string;
}
type AccountDetails = Omit<Parameters<typeof apiService.onboardCompany>[0], 'challengeId' | 'verificationCode'>;
type Proof = { account: AccountDetails; challengeId: string; expiresAt: number; resendAt: number };
const slugPattern = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
function errorText(error: unknown, fallback: string) {
  const message = isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : error instanceof Error ? error.message : '';
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export function OnboardingModal({ isOpen, ...props }: OnboardingModalProps) {
  return isOpen ? <SignupDialog {...props} /> : null;
}

function SignupDialog({ onClose, onSuccess, defaultPlan = 'STARTER' }: Omit<OnboardingModalProps, 'isOpen'>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(false);
  const busy = useRef(false);
  const editedSlug = useRef(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<AccountDetails>({ adminName: '', adminEmail: '', adminPassword: '', companyName: '', subdomain: '', planTier: defaultPlan, agreedToTerms: false });
  const [showPassword, setShowPassword] = useState(false);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof apiService.getSignupConfiguration>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState('');
  const [reload, setReload] = useState(0);
  const [address, setAddress] = useState({ slug: '', state: 'idle', message: '' });
  const [addressRetry, setAddressRetry] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [proof, setProof] = useState<Proof | null>(null);
  const [code, setCode] = useState('');
  const [now, setNow] = useState(Date.now);
  const [pending, setPending] = useState<'send' | 'resend' | 'create' | null>(null);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<LoginResponse | null>(null);
  const siteKey = config?.captchaSiteKey?.trim() || '';
  const ready = !loading && !configError && config?.signupEnabled && !!siteKey && plans.length > 0;
  const selectedPlan = plans.find(plan => plan.code === form.planTier);
  const available = address.slug === form.subdomain && address.state === 'available';
  const expiresIn = proof ? Math.max(0, Math.ceil((proof.expiresAt - now) / 1000)) : 0;
  const resendIn = proof ? Math.max(0, Math.ceil((proof.resendAt - now) / 1000)) : 0;
  const company = response?.company as (NonNullable<LoginResponse['company']> & { logoUrl?: string }) | undefined;
  const createdPlan = plans.find(plan => plan.code === company?.planName);
  const change = (key: keyof AccountDetails, value: string | boolean) => setForm(previous => ({ ...previous, [key]: value }));

  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    alive.current = true;
    element.showModal();
    return () => {
      alive.current = false;
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);

  useEffect(() => {
    let current = true;
    setLoading(true); setConfigError(''); setCaptchaToken(null);
    Promise.all([apiService.getSignupConfiguration(), apiService.getPublicPlans()]).then(([settings, catalog]) => {
      if (!current) return;
      const publicPlans = catalog.filter(plan => plan.status === 'PUBLIC' && plan.currency === 'INR' && plan.gstExclusive);
      setConfig(settings); setPlans(publicPlans);
      setForm(previous => ({ ...previous, planTier: publicPlans.some(plan => plan.code === previous.planTier) ? previous.planTier : '' }));
      setConfigError(!settings.signupEnabled ? 'Signup is unavailable: email verification or bot protection is not configured.'
        : !settings.captchaSiteKey?.trim() ? 'Signup is unavailable: the security check is not configured.'
          : !publicPlans.length ? 'Signup is unavailable: no public plans are configured.' : '');
    }).catch(() => { if (current) setConfigError('Signup settings and plans could not be loaded. Please retry.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [reload]);

  useEffect(() => {
    let current = true;
    const slug = form.subdomain;
    if (step !== 1 || !ready || !slugPattern.test(slug)) {
      setAddress({ slug, state: 'idle', message: slug && !slugPattern.test(slug) ? 'Use 3-30 letters, numbers or hyphens; start and end with a letter or number.' : '' });
      return;
    }
    setAddress({ slug, state: 'checking', message: 'Checking workspace address...' });
    const timer = window.setTimeout(async () => {
      try {
        const result = await apiService.checkWorkspaceAddress(slug);
        if (current) setAddress({ slug, state: result.available === true && result.slug === slug ? 'available' : 'unavailable',
          message: result.available === true && result.slug === slug ? 'This workspace address is available.' : result.reason || 'This workspace address is not available.' });
      } catch { if (current) setAddress({ slug, state: 'error', message: 'Could not check this address. Retry before continuing.' }); }
    }, 400);
    return () => { current = false; window.clearTimeout(timer); };
  }, [form.subdomain, step, ready, addressRetry]);

  useEffect(() => {
    if (!proof || step !== 2) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [proof, step]);

  function changeCompany(value: string) {
    let slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '');
    if (slug && slug.length < 3) slug += '-team';
    setForm(previous => ({ ...previous, companyName: value, subdomain: editedSlug.current ? previous.subdomain : slug }));
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (busy.current || !ready) return;
    const account = step === 2 ? proof?.account : { ...form, adminName: form.adminName.trim(), adminEmail: form.adminEmail.trim(), companyName: form.companyName.trim() };
    if (!account || !account.adminName || !account.companyName || !account.agreedToTerms || !selectedPlan || (step === 1 && !available)) {
      setError('Complete your details, accept the terms, and choose an available workspace and plan.'); return;
    }
    if (!captchaToken) { setError('Complete the security check before requesting a code.'); return; }
    if (step === 2 && proof && Date.now() < proof.resendAt) return;
    const token = captchaToken;
    const requestedAt = Date.now();
    busy.current = true; setPending(step === 2 ? 'resend' : 'send'); setError(''); setCaptchaToken(null);
    try {
      const result = await apiService.sendSignupVerification(account.adminEmail, token);
      if (!alive.current) return;
      if (!result.success || !result.challengeId?.trim() || !Number.isFinite(result.expiresInSeconds) || result.expiresInSeconds <= 0 || !Number.isFinite(result.resendAfterSeconds) || result.resendAfterSeconds < 0) {
        throw new Error('Verification could not be started. Please retry the security check.');
      }
      // Keep the proof bound to the submitted details, never to later edits or browser storage.
      setProof({ account, challengeId: result.challengeId, expiresAt: requestedAt + result.expiresInSeconds * 1000, resendAt: requestedAt + result.resendAfterSeconds * 1000 });
      setCode(''); setNow(Date.now()); setStep(2);
    } catch (failure) { if (alive.current) setError(errorText(failure, 'Verification could not be queued. Please try again.')); }
    finally {
      if (alive.current) { busy.current = false; setPending(null); setCaptchaToken(null); setCaptchaKey(value => value + 1); }
    }
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !ready || !proof) return;
    if (!/^[0-9]{6}$/.test(code) || Date.now() >= proof.expiresAt) { setError('Enter a current six-digit code, or request a new one if it has expired.'); return; }
    busy.current = true; setPending('create'); setError('');
    try {
      const result = await apiService.onboardCompany({ ...proof.account, agreedToTerms: true, challengeId: proof.challengeId, verificationCode: code });
      if (!alive.current) return;
      setResponse(result); setProof(null); setCode(''); setCaptchaToken(null);
      setForm(previous => ({ ...previous, adminPassword: '' })); setStep(3);
    } catch (failure) { if (alive.current) setError(errorText(failure, 'Workspace creation could not be completed. Your details have been kept.')); }
    finally { if (alive.current) { busy.current = false; setPending(null); } }
  }

  function editDetails() {
    if (busy.current) return;
    setProof(null); setCode(''); setCaptchaToken(null); setCaptchaKey(value => value + 1); setError(''); setStep(1);
  }

  return <dialog ref={dialog} className="signup-dialog onboarding-ui" aria-labelledby="signup-title" data-step={step}
    onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }}>
    <div className="signup-layout">
      <aside className="signup-brand">
        <div className="onboarding-brand"><LifeBuoy aria-hidden="true" size={28} /><span>Kuwy HelpDesk</span></div>
        <h2>A workspace for your support team.</h2>
        <p>Start with your company details. Verify your email before your workspace is created.</p>
        <ol className="signup-steps" aria-label="Signup progress">
          {['Account', 'Verify email', 'Ready'].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}
        </ol>
      </aside>
      <section className="signup-content">
        <button type="button" className="onboarding-button signup-close" aria-label="Close signup" disabled={!!pending} onClick={() => { if (!busy.current) onClose(); }}><X size={20} aria-hidden="true" /></button>
        <p className="onboarding-eyebrow">{step === 3 ? 'YOUR WORKSPACE' : `STEP ${step} OF 2`}</p>
        <h1 id="signup-title" ref={heading} tabIndex={-1}>{step === 1 ? 'Create your company account' : step === 2 ? 'Verify your email' : 'Your workspace is ready'}</h1>
        {loading && <p role="status">Loading signup settings and current plans...</p>}
        {configError && <div className="onboarding-error" role="alert"><p>{configError}</p><button className="onboarding-button" type="button" disabled={loading || !!pending} onClick={() => setReload(value => value + 1)}>Retry signup settings</button></div>}
        {error && <p className="onboarding-error" role="alert">{error}</p>}
        {pending && <p className="onboarding-pending" role="status"><span className="onboarding-spinner" aria-hidden="true" />{pending === 'create' ? 'Creating workspace...' : 'Requesting a verification email...'}</p>}

        {step === 1 && <form onSubmit={sendCode} aria-busy={!!pending}>
          <p className="onboarding-muted">All fields are required. Your workspace is created only after email verification.</p>
          <fieldset disabled={!!pending} inert={!!pending} className="signup-fields">
            <div className="signup-grid">
              <div><label htmlFor="signup-name">Full name</label><input id="signup-name" name="adminName" autoComplete="name" required maxLength={100} value={form.adminName} onChange={event => change('adminName', event.target.value)} /></div>
              <div><label htmlFor="signup-email">Work email</label><input id="signup-email" name="adminEmail" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={form.adminEmail} onChange={event => change('adminEmail', event.target.value)} /></div>
              <div><label htmlFor="signup-company">Company name</label><input id="signup-company" name="companyName" autoComplete="organization" required maxLength={150} value={form.companyName} onChange={event => changeCompany(event.target.value)} /></div>
              <div><label htmlFor="signup-slug">Workspace address</label><input id="signup-slug" name="subdomain" autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" aria-describedby="signup-address-status" value={form.subdomain}
                onChange={event => { editedSlug.current = true; change('subdomain', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} />
                <small id="signup-address-status" role="status" className={available ? 'onboarding-positive' : 'onboarding-muted'}>{address.slug === form.subdomain ? address.message || 'Choose a unique 3-30 character workspace identifier.' : 'Waiting to check address...'}</small>
                {address.state === 'error' && <button type="button" className="onboarding-text-button" onClick={() => { setAddress(previous => ({ ...previous, state: 'checking' })); setAddressRetry(value => value + 1); }}>Retry address check</button>}
              </div>
            </div>
            <div><label htmlFor="signup-password">Admin password</label><div className="signup-password"><input id="signup-password" name="adminPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} required minLength={10} maxLength={1024} aria-describedby="signup-password-hint" value={form.adminPassword} onChange={event => change('adminPassword', event.target.value)} />
              <button type="button" className="onboarding-button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} aria-controls="signup-password" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></div>
              <small id="signup-password-hint">Use 10-1024 characters. A long passphrase works; no special character mix is required.</small>
            </div>
            <div><label htmlFor="signup-plan">Plan</label><select id="signup-plan" name="planTier" required disabled={!ready} value={form.planTier} onChange={event => change('planTier', event.target.value)}>
              <option value="">Choose an available plan</option>{plans.map(plan => <option key={plan.code} value={plan.code}>{plan.displayName}</option>)}
            </select>{selectedPlan && <small>{selectedPlan.description} {selectedPlan.trialDays > 0 ? `${selectedPlan.trialDays}-day trial listed.` : 'No trial listed.'}</small>}</div>
            <div className="signup-agreement"><input id="signup-terms" name="agreedToTerms" type="checkbox" required checked={form.agreedToTerms} onChange={event => change('agreedToTerms', event.target.checked)} /><label htmlFor="signup-terms">I agree to the <a href="/?legal=terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/?legal=privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> (open in new tabs).</label></div>
            {ready && <TurnstileChallenge key={captchaKey} siteKey={siteKey} action="signup" onToken={setCaptchaToken} />}
            <button type="submit" className="onboarding-button onboarding-primary" disabled={!ready || !selectedPlan || !available || !captchaToken || !form.agreedToTerms}>{pending ? 'Requesting verification...' : 'Send verification code'}</button>
          </fieldset>
        </form>}

        {step === 2 && proof && <form onSubmit={createWorkspace} aria-busy={!!pending}>
          <p>A verification email has been queued for <strong>{proof.account.adminEmail}</strong>. Enter the code when it arrives; check your spam folder if needed.</p>
          <fieldset disabled={!!pending} inert={!!pending} className="signup-fields">
            <div><label htmlFor="signup-code">Six-digit verification code</label><input id="signup-code" className="signup-code" name="verificationCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))} aria-describedby="signup-code-time" /></div>
            <p id="signup-code-time" role="timer" aria-live="off" className="onboarding-muted">{expiresIn ? `Code expires in ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, '0')}.` : 'This code has expired. Request a new code below.'}</p>
            <button type="submit" className="onboarding-button onboarding-primary" disabled={!ready || !/^[0-9]{6}$/.test(code) || !expiresIn}>{pending === 'create' ? 'Creating workspace...' : 'Verify and create workspace'}</button>
            <button type="button" className="onboarding-text-button" onClick={editDetails}>Change email or account details</button>
            <div className="signup-resend"><h2>Need another code?</h2>
              {resendIn > 0 ? <p role="timer" aria-live="off">You can request another code in {resendIn}s.</p> : <><p>Complete a fresh security check to request another email.</p>{ready && <TurnstileChallenge key={captchaKey} siteKey={siteKey} action="signup" onToken={setCaptchaToken} />}</>}
              <button type="button" className="onboarding-button" disabled={!ready || resendIn > 0 || !captchaToken} onClick={() => void sendCode()}>{pending === 'resend' ? 'Requesting another code...' : 'Resend verification code'}</button>
            </div>
          </fieldset>
        </form>}

        {step === 3 && response && <div className="signup-success">
          {company?.logoUrl ? <img className="signup-logo" src={company.logoUrl} alt={`${company.name} logo`} referrerPolicy="no-referrer" /> : <CheckCircle2 size={36} className="onboarding-positive" aria-hidden="true" />}
          {company && <><h2>{company.name}</h2><dl><div><dt>Workspace</dt><dd>{company.subdomain}</dd></div><div><dt>Company code</dt><dd>{company.companyCode}</dd></div><div><dt>Plan</dt><dd>{createdPlan?.displayName || company.planName || 'See workspace settings'}</dd></div><div><dt>Status</dt><dd>{company.status}</dd></div></dl></>}
          {company?.status === 'TRIAL' && <p>{createdPlan && createdPlan.trialDays > 0 ? `Your ${createdPlan.trialDays}-day trial is active.` : 'Your trial is active.'}</p>}
          {response.mfaSetupRequired && <p>Next, set up an authenticator to secure your administrator account.</p>}
          <button type="button" className="onboarding-button onboarding-primary" onClick={() => { if (!busy.current) { busy.current = true; onSuccess(response); } }}>Continue to workspace</button>
        </div>}
      </section>
    </div>
  </dialog>;
}
