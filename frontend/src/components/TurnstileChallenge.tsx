import { useEffect, useEffectEvent, useRef, useState } from 'react';
import './onboarding.css';

interface TurnstileApi {
  ready(callback: () => void): void;
  render(container: HTMLElement, options: {
    sitekey: string; action: 'signup'; theme: 'light'; size: 'compact' | 'flexible';
    retry: 'never'; 'refresh-expired': 'manual'; callback: (token: string) => void;
    'expired-callback': () => void; 'error-callback': () => boolean;
    'timeout-callback': () => void; 'unsupported-callback': () => void;
  }): string;
  reset(id: string): void;
  remove(id: string): void;
}

let loader: Promise<TurnstileApi> | undefined;
function loadTurnstile() {
  if (loader) return loader;
  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Security check could not load. Check your connection and retry.'));
    };
    const timeout = window.setTimeout(fail, 20_000);
    const ready = () => {
      const api = (window as Window & { turnstile?: TurnstileApi }).turnstile;
      if (!api) return fail();
      try {
        api.ready(() => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve(api);
        });
      } catch { fail(); }
    };
    if ((window as Window & { turnstile?: TurnstileApi }).turnstile) return ready();
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = ready;
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { loader = undefined; throw error; });
  return loader;
}

interface TurnstileChallengeProps {
  siteKey: string;
  action: 'signup';
  onToken: (token: string | null) => void;
  onError?: (message: string) => void;
}

export function TurnstileChallenge({ siteKey, action, onToken, onError }: TurnstileChallengeProps) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const notifyToken = useEffectEvent(onToken);
  const notifyError = useEffectEvent((message: string) => onError?.(message));

  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const resize = () => setCompact(media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

  useEffect(() => {
    let active = true;
    let api: TurnstileApi | undefined;
    let widget: string | undefined;
    const fail = (message: string) => {
      if (!active) return;
      notifyToken(null); setError(message); setLoading(false); notifyError(message);
    };
    notifyToken(null); setError(''); setLoading(true);
    if (!siteKey.trim()) { fail('Security check is not configured.'); return; }
    loadTurnstile().then(provider => {
      if (!active || !container.current) return;
      api = provider;
      widget = api.render(container.current, {
        sitekey: siteKey.trim(), action, theme: 'light', size: compact ? 'compact' : 'flexible',
        retry: 'never', 'refresh-expired': 'manual',
        callback: token => { if (active) { setError(''); notifyToken(token || null); } },
        'expired-callback': () => {
          fail('Security check expired. Complete the new check.');
          if (active && widget !== undefined) { try { api?.reset(widget); } catch { /* Retry remains available. */ } }
        },
        'error-callback': () => { fail('Security check failed. Please retry.'); return true; },
        'timeout-callback': () => fail('Security check timed out. Please retry.'),
        'unsupported-callback': () => fail('Security check is unavailable in this browser. Try an updated browser.'),
      });
      setLoading(false);
    }).catch(() => fail('Security check could not load. Check your connection and retry.'));
    return () => {
      active = false;
      if (widget !== undefined) { try { api?.remove(widget); } catch { /* The provider may have removed it already. */ } }
    };
  }, [siteKey, action, attempt, compact]);

  return <div className="signup-captcha onboarding-ui" data-testid="signup-captcha">
    <div ref={container} />
    {loading && <small role="status">Loading security check...</small>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="onboarding-button" onClick={() => setAttempt(value => value + 1)}>Retry security check</button></div>}
  </div>;
}
