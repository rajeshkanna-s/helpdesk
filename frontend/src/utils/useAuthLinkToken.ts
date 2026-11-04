import { useEffect, useState } from 'react';

function readToken() {
  if (window.location.search.length + window.location.hash.length > 4096) return '';
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token')
    || new URLSearchParams(window.location.search).get('token') || '';
  return token.length <= 256 ? token : '';
}

export function useAuthLinkToken(route: string) {
  const [token, setToken] = useState(readToken);
  useEffect(() => {
    const capture = () => {
      if (window.location.pathname.toLowerCase().replace(/\/+$/, '') !== route) return;
      const value = readToken();
      if (!value) return;
      setToken(value);
      window.history.replaceState(window.history.state, '', window.location.pathname);
    };
    capture();
    window.addEventListener('hashchange', capture);
    window.addEventListener('popstate', capture);
    return () => {
      window.removeEventListener('hashchange', capture);
      window.removeEventListener('popstate', capture);
    };
  }, [route]);
  return token;
}
