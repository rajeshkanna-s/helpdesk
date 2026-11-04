import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, LogOut, Monitor, ShieldCheck, X } from 'lucide-react';
import { apiService, clearStaffSession } from '../services/api';

type Account = Awaited<ReturnType<typeof apiService.getStaffAccount>>;
type Session = Awaited<ReturnType<typeof apiService.getStaffSessions>>[number];
interface Props { open: boolean; onClose: () => void; required?: boolean; }

export function AccountSecurityDialog({ open, onClose, required = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tab, setTab] = useState<'security' | 'password' | 'sessions'>('security');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<Awaited<ReturnType<typeof apiService.setup2Fa>> | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [credentialsChanged, setCredentialsChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const previous = document.activeElement as HTMLElement | null;
    if (!required) dialog.current?.showModal();
    setLoading(true);
    setPassword(''); setNewPassword(''); setConfirmation(''); setCode('');
    setEnrollment(null); setBackupCodes([]); setSavedCodes(false); setCredentialsChanged(false); setError(null); setNotice(null);
    Promise.all([apiService.getStaffAccount(), apiService.getStaffSessions()]).then(([profile, devices]) => {
      if (active) { setAccount(profile); setSessions(devices); }
    }).catch(() => { if (active) setError('Account security could not be loaded. Close this panel and try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      dialog.current?.close();
      if (previous?.isConnected && !required) window.requestAnimationFrame(() => previous.focus());
    };
  }, [open, required]);

  function expireLocalSession() {
    clearStaffSession();
    window.dispatchEvent(new CustomEvent('kuwy-session-expired', { detail: 'STAFF' }));
  }

  function close() {
    if (busy) return;
    if (backupCodes.length && !savedCodes && !window.confirm('Recovery codes are shown only once. Close without confirming that you saved them?')) return;
    if (credentialsChanged) expireLocalSession();
    onClose();
  }

  async function execute(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try { await action(); }
    catch (failure: unknown) {
      const response = (failure as { response?: { data?: { message?: string; error?: string } } }).response?.data;
      setError(response?.message || response?.error || 'This change could not be completed. Please try again.');
    } finally { setBusy(false); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Copied to clipboard.'); }
    catch { setError('Clipboard access is unavailable. Select the text to copy it manually.'); }
  }

  if (!open) return null;
  const content = <>
    <header className="account-flow-header">
      <span className="account-flow-mark"><ShieldCheck size={24} /></span>
      <div><h1 id="account-security-title">{required ? 'Secure your account' : 'Account security'}</h1><p>{required ? 'Your workspace requires an authenticator before you continue.' : 'Your sign-in methods and active devices.'}</p></div>
      {!required && <button type="button" className="workspace-icon-button ms-auto" aria-label="Close account security" onClick={close} disabled={busy}><X size={19} /></button>}
    </header>
    <div className="account-security-body">
      {error && <div className="alert alert-danger small" role="alert">{error}</div>}
      {notice && <div className="alert alert-info small" role="status">{notice}</div>}
      {loading ? <p className="text-muted small" role="status">Loading your security settings...</p> : account && <>
        {!required && !backupCodes.length && <nav className="account-security-tabs" aria-label="Account security sections">
          {(['security', 'password', 'sessions'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} className={tab === value ? 'active' : ''} disabled={busy} onClick={() => { setTab(value); setError(null); setPassword(''); setCode(''); }}>{value === 'security' ? 'Authenticator' : value === 'password' ? 'Password' : 'Devices'}</button>)}
        </nav>}
        {!!backupCodes.length ? <section>
          <CheckCircle2 size={28} className="text-success mb-3" /><h2 className="h5">Keep your recovery codes safe</h2>
          <p className="text-muted small">Each code works once if you lose access to your authenticator. These codes will not be shown again.</p>
          <div className="account-recovery-codes">{backupCodes.map(value => <code key={value}>{value}</code>)}</div>
          <button type="button" className="btn btn-light btn-sm mt-3" onClick={() => copy(backupCodes.join('\n'))}><Copy size={14} /> Copy recovery codes</button>
          <label className="d-flex gap-2 align-items-start small my-4"><input type="checkbox" className="form-check-input" checked={savedCodes} onChange={event => setSavedCodes(event.target.checked)} />I have saved my recovery codes in a safe place.</label>
          <button type="button" className="btn btn-primary w-100" disabled={!savedCodes} onClick={close}>Sign in with your authenticator</button>
        </section> : tab === 'security' || required ? <section>
          <div className="account-security-status"><ShieldCheck size={18} /><div><strong>{account.twoFactorEnabled ? 'Authenticator enabled' : 'Add an authenticator'}</strong><span>{account.twoFactorRequired ? 'Required by your account policy' : 'Recommended for account protection'}</span></div></div>
          {enrollment ? <form onSubmit={event => { event.preventDefault(); void execute(async () => {
            const response = await apiService.enable2Fa(code);
            setBackupCodes(response.backupCodes); setCredentialsChanged(true); setEnrollment(null); setCode('');
          }); }}>
            <p className="text-muted small">Add a time-based account in Google Authenticator, Microsoft Authenticator, or another compatible app using this setup key.</p>
            <div className="account-setup-key"><code>{enrollment.secret}</code><button type="button" className="workspace-icon-button" aria-label="Copy authenticator setup key" onClick={() => copy(enrollment.secret)}><Copy size={16} /></button></div>
            <a className="d-inline-block small my-3" href={enrollment.otpAuthUrl}>Open a compatible authenticator app</a>
            <p className="text-muted small">Setup expires {new Date(enrollment.expiresAt).toLocaleTimeString()}. The setup key is never sent to a third-party QR service.</p>
            <label htmlFor="account-enroll-code" className="form-label">Authenticator code</label>
            <input id="account-enroll-code" className="form-control mb-3" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required pattern="[0-9]{6}" />
            <button type="submit" className="btn btn-primary w-100" disabled={busy || code.length !== 6}>{busy ? 'Verifying...' : 'Enable authenticator'}</button>
          </form> : <form onSubmit={event => { event.preventDefault(); void execute(async () => { setEnrollment(await apiService.setup2Fa(password, account.twoFactorEnabled ? code : undefined)); setPassword(''); setCode(''); }); }}>
            <p className="text-muted small">{account.twoFactorEnabled ? 'To replace your authenticator, verify your password and current code.' : 'Use an authenticator app to add a second sign-in step.'}</p>
            <label htmlFor="account-mfa-password" className="form-label">Current password</label>
            <input id="account-mfa-password" type="password" autoComplete="current-password" className="form-control mb-3" value={password} onChange={event => setPassword(event.target.value)} maxLength={1024} required />
            {account.twoFactorEnabled && <><label htmlFor="account-current-code" className="form-label">Current authenticator code</label><input id="account-current-code" className="form-control mb-3" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required pattern="[0-9]{6}" /></>}
            <button type="submit" className="btn btn-primary w-100" disabled={busy || !password || account.twoFactorEnabled && code.length !== 6}>{busy ? 'Preparing...' : account.twoFactorEnabled ? 'Replace authenticator' : 'Set up authenticator'}</button>
            {account.twoFactorEnabled && !account.twoFactorRequired && <button type="button" className="btn btn-link text-danger w-100 mt-2" disabled={busy || !password || code.length !== 6} onClick={() => {
              if (!window.confirm('Disable your authenticator? Your existing sessions will be signed out.')) return;
              void execute(async () => { await apiService.disable2Fa(password, code); expireLocalSession(); onClose(); });
            }}>Disable authenticator</button>}
          </form>}
        </section> : tab === 'password' ? <form onSubmit={event => { event.preventDefault(); void execute(async () => {
          await apiService.changeOwnPassword(password, newPassword, account.twoFactorEnabled ? code : undefined); expireLocalSession(); onClose();
        }); }}>
          <h2 className="h5"><KeyRound size={18} className="me-2" />Change your password</h2><p className="text-muted small">Use a unique passphrase of at least 10 characters. All existing sign-in tokens will be invalidated.</p>
          <label htmlFor="account-old-password" className="form-label">Current password</label><input id="account-old-password" type="password" className="form-control mb-3" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={1024} required />
          <label htmlFor="account-new-password" className="form-label">New password</label><input id="account-new-password" type="password" className="form-control mb-3" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={10} maxLength={1024} required />
          <label htmlFor="account-confirm-password" className="form-label">Confirm new password</label><input id="account-confirm-password" type="password" className="form-control mb-3" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} maxLength={1024} required />
          {account.twoFactorEnabled && <><label htmlFor="password-change-code" className="form-label">Authenticator code</label><input id="password-change-code" className="form-control mb-3" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required maxLength={6} pattern="[0-9]{6}" /></>}
          <button type="submit" className="btn btn-primary w-100" disabled={busy || !password || [...newPassword].length < 10 || newPassword !== confirmation || account.twoFactorEnabled && code.length !== 6}>{busy ? 'Updating...' : 'Update password and sign out'}</button>
        </form> : <section>
          <h2 className="h5">Your active devices</h2><p className="text-muted small">Only your own browser sessions are shown. End any session you do not recognize.</p>
          {sessions.map(session => <div key={session.sessionId} className="account-device-row"><Monitor size={19} /><div><strong>{session.current ? 'This device' : 'Browser session'}</strong><span title={session.deviceLabel}>{session.deviceLabel}</span><small>Last active {new Date(session.lastSeenAt).toLocaleString()}</small></div><button type="button" className="btn btn-sm btn-light" disabled={busy} onClick={() => void execute(async () => {
            await apiService.revokeStaffSession(session.sessionId);
            if (session.current) { expireLocalSession(); onClose(); } else setSessions(previous => previous.filter(item => item.sessionId !== session.sessionId));
          })}>Sign out</button></div>)}
          {!sessions.length && <p className="text-muted small">No active browser sessions are listed.</p>}
          <button type="button" className="btn btn-outline-danger w-100 mt-3" disabled={busy} onClick={() => {
            if (window.confirm('Sign out of every device, including this one?')) void execute(async () => { await apiService.logoutAllStaffSessions(); expireLocalSession(); onClose(); });
          }}><LogOut size={14} /> Sign out of all devices</button>
        </section>}
      </>}
      {required && !backupCodes.length && <button type="button" className="btn btn-link w-100 mt-3" disabled={busy} onClick={() => void execute(async () => { await apiService.logoutStaff(); expireLocalSession(); onClose(); })}>Sign out</button>}
    </div>
  </>;
  return required ? <div className="account-flow-page"><section className="account-flow-card">{content}</section></div>
    : <dialog ref={dialog} className="account-flow-dialog account-security-dialog" aria-labelledby="account-security-title" onCancel={event => { event.preventDefault(); close(); }}>{content}</dialog>;
}
