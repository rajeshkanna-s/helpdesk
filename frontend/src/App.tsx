import { useState, useEffect, lazy, Suspense } from 'react';
import { apiService, setApiTenantId, setAuthToken } from './services/api';
import type { Company, AuthUser, LoginResponse } from './types';
import { LoginPage } from './components/LoginPage';
import { MarketingLandingPage } from './components/MarketingLandingPage';

const SuperAdminPortal = lazy(() => import('./components/SuperAdminPortal').then(module => ({ default: module.SuperAdminPortal })));
const CompanyWorkspace = lazy(() => import('./components/CompanyWorkspace').then(module => ({ default: module.CompanyWorkspace })));
const CustomerPortal = lazy(() => import('./components/CustomerPortal').then(module => ({ default: module.CustomerPortal })));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage').then(module => ({ default: module.ResetPasswordPage })));
const AcceptInvitationPage = lazy(() => import('./components/AcceptInvitationPage').then(module => ({ default: module.AcceptInvitationPage })));
const OnboardingModal = lazy(() => import('./components/OnboardingModal').then(module => ({ default: module.OnboardingModal })));
const PricingPage = lazy(() => import('./components/PricingPage').then(module => ({ default: module.PricingPage })));
const CheckoutModal = lazy(() => import('./components/CheckoutModal').then(module => ({ default: module.CheckoutModal })));

export default function App() {
  return <Suspense fallback={<div className="app-route-loading" role="status"><span className="spinner-border spinner-border-sm" aria-hidden="true" />Loading your workspace...</div>}><AppRoutes /></Suspense>;
}

function AppRoutes() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname || '/');

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('kuwy_user');
    const token = localStorage.getItem('kuwy_auth_token');
    if (saved && token) {
      try {
        setAuthToken(token);
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedOnboardPlan, setSelectedOnboardPlan] = useState<string>('STARTER');

  // Checkout modal state
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutPlanTier, setCheckoutPlanTier] = useState<string>('STARTER');
  const [checkoutBillingCycle, setCheckoutBillingCycle] = useState<'monthly' | 'annual'>('annual');

  // Listen to browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigate helper that updates browser address bar and triggers component rerender
  const navigate = (path: string) => {
    const target = new URL(path, window.location.origin);
    if (target.origin !== window.location.origin) return;
    if (window.location.href !== target.href) {
      window.history.pushState(null, '', target.pathname + target.search + target.hash);
      setPathname(target.pathname);
    }
  };

  // Load companies
  useEffect(() => {
    if (['/reset-password', '/accept-invitation'].includes(window.location.pathname.toLowerCase().replace(/\/+$/, ''))) return;
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const list = await apiService.getCompanies();
      setCompanies(list);
    } catch {
      // Fallback companies
    }
  };

  // Normalized path
  const normalizedPath = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const isAdminConsoleRoute = normalizedPath === '/adminconsole';
  const isSignupRoute = normalizedPath === '/signup';
  const isPricingRoute = normalizedPath === '/pricing';
  const isLoginRoute = normalizedPath === '/login';
  const isResetPasswordRoute = normalizedPath === '/reset-password';
  const isAcceptInvitationRoute = normalizedPath === '/accept-invitation';

  // Check company admin route match: e.g. /kuwy/admin or /acme/admin
  const companyAdminMatch = normalizedPath.match(/^\/([^/]+)\/admin$/);
  const companyAdminSlug = companyAdminMatch ? companyAdminMatch[1] : null;

  // Check customer portal route match: e.g. /kuwy, /kuwy/ticket, /kuwy/ticketstatus, /kuwy/portal
  const isCustomerPortalRoute = !isAdminConsoleRoute && !isSignupRoute && !isPricingRoute && !isLoginRoute && !isResetPasswordRoute && !isAcceptInvitationRoute && !companyAdminSlug && normalizedPath !== '/';
  const customerPortalMatch = isCustomerPortalRoute
    ? normalizedPath.match(/^\/([^/]+)(?:\/(ticketstatus|ticket|portal))?$/)
    : null;
  const customerPortalSlug = customerPortalMatch ? customerPortalMatch[1] : null;
  const customerPortalSubView = (customerPortalMatch && customerPortalMatch[2]) || 'home';

  // Sync activeCompany based on URL or current user
  useEffect(() => {
    if (companies.length === 0) return;
    const targetSlug = companyAdminSlug || customerPortalSlug;
    if (targetSlug) {
      const found = companies.find(c => c.subdomain.toLowerCase() === targetSlug.toLowerCase());
      if (found) {
        setActiveCompany(found);
        setApiTenantId(found.id);
        return;
      }
    }
    if (currentUser && currentUser.roleType !== 'SUPER_ADMIN' && currentUser.company?.id) {
      const userComp = companies.find(c => c.id === currentUser.company?.id);
      if (userComp) {
        setActiveCompany(userComp);
        setApiTenantId(userComp.id);
        return;
      }
    }
    if (!activeCompany && companies.length > 0) {
      setActiveCompany(companies[0]);
      setApiTenantId(companies[0].id);
    }
  }, [companies, companyAdminSlug, customerPortalSlug, currentUser]);

  // Dynamic Browser Tab Title based on Route
  useEffect(() => {
    if (isResetPasswordRoute) {
      document.title = 'Reset password | Kuwy HelpDesk';
    } else if (isAcceptInvitationRoute) {
      document.title = 'Join your workspace | Kuwy HelpDesk';
    } else if (isLoginRoute) {
      document.title = 'Staff sign in | Kuwy HelpDesk';
    } else if (isAdminConsoleRoute) {
      document.title = 'Admin Console — Multi-Tenant Governance';
    } else if (companyAdminSlug) {
      const compName = activeCompany?.name || (companyAdminSlug.toUpperCase() + ' HelpDesk');
      document.title = `${compName} — Staff Workspace`;
    } else if (isCustomerPortalRoute && customerPortalSlug) {
      const compName = activeCompany?.name || (customerPortalSlug.toUpperCase() + ' Support');
      if (customerPortalSubView === 'ticket') {
        document.title = `${compName} — Submit Support Ticket`;
      } else if (customerPortalSubView === 'ticketstatus') {
        document.title = `${compName} — Track Tickets & Status`;
      } else {
        document.title = `${compName} — Customer Portal`;
      }
    } else if (isPricingRoute) {
      document.title = 'Plans & Pricing — Kuwy HelpDesk SaaS';
    } else if (isSignupRoute) {
      document.title = 'Create Company Workspace — Kuwy HelpDesk';
    } else {
      document.title = 'Kuwy HelpDesk — Enterprise Multi-Tenant Customer Support Platform';
    }
  }, [isAdminConsoleRoute, companyAdminSlug, isCustomerPortalRoute, customerPortalSlug, isPricingRoute, isSignupRoute, isLoginRoute, isResetPasswordRoute, isAcceptInvitationRoute, activeCompany]);

  const handleLoginSuccess = (res: LoginResponse) => {
    if (!res.token || res.twoFactorRequired) {
      setAuthToken(null);
      localStorage.removeItem('kuwy_user');
      setCurrentUser(null);
      navigate('/login');
      return;
    }
    setAuthToken(res.token || null);
    localStorage.setItem('kuwy_user', JSON.stringify(res));
    setCurrentUser(res as unknown as AuthUser);
    if (res.company) {
      const authenticatedCompany = { ...res.company, planName: res.company.planName || 'Not reported' } as Company;
      setActiveCompany(authenticatedCompany);
      setApiTenantId(authenticatedCompany.id);
      setCompanies(previous => previous.some(company => company.id === authenticatedCompany.id)
        ? previous.map(company => company.id === authenticatedCompany.id ? { ...company, ...authenticatedCompany } : company)
        : [...previous, authenticatedCompany]);
    }
    void loadCompanies();

    if (res.roleType === 'SUPER_ADMIN') {
      if (isAdminConsoleRoute) {
        // Stay on /adminconsole
      } else if (companyAdminSlug) {
        navigate(`/${companyAdminSlug}/admin`);
      } else {
        navigate('/adminconsole');
      }
    } else {
      const slug = res.company?.subdomain || companyAdminSlug || 'kuwy';
      navigate(`/${slug}/admin`);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    localStorage.removeItem('kuwy_user');
    setCurrentUser(null);
    if (isAdminConsoleRoute) {
      navigate('/adminconsole');
    } else if (companyAdminSlug) {
      navigate(`/${companyAdminSlug}/admin`);
    } else {
      navigate('/kuwy/admin');
    }
  };

  // Fallback active company
  const effectiveCompany: Company = activeCompany || companies[0] || {
    id: 1,
    companyCode: 'KUWY',
    name: 'Kuwy Technology Services Pvt Ltd',
    subdomain: 'kuwy',
    customDomain: 'helpdesk.kuwy.in',
    primaryColor: '#0d6efd',
    status: 'ACTIVE',
    planName: 'ENTERPRISE',
  };

  if (isResetPasswordRoute) {
    return <ResetPasswordPage onNavigate={navigate} onResetComplete={() => {
      setAuthToken(null);
      localStorage.removeItem('kuwy_user');
      setCurrentUser(null);
    }} />;
  }
  if (isAcceptInvitationRoute) return <AcceptInvitationPage onNavigate={navigate} onLoginSuccess={handleLoginSuccess} />;
  if (isLoginRoute) return <LoginPage onLoginSuccess={handleLoginSuccess} targetMode="company" onNavigate={navigate} />;

  // =========================================================================
  // 1. DEDICATED ROUTE: http://localhost:5174/adminconsole (Admin Console)
  // =========================================================================
  if (isAdminConsoleRoute) {
    if (!currentUser || currentUser.roleType !== 'SUPER_ADMIN') {
      return (
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          targetMode="admin"
          onNavigate={navigate}
        />
      );
    }

    return (
      <SuperAdminPortal
        currentUser={currentUser}
        onLogout={handleLogout}
        onSwitchToCompany={(targetCompanyId: number) => {
          const targetComp = companies.find(c => c.id === targetCompanyId);
          const slug = targetComp?.subdomain || 'kuwy';
          if (targetComp) setActiveCompany(targetComp);
          navigate(`/${slug}/admin`);
        }}
      />
    );
  }

  // =========================================================================
  // 2. DEDICATED ROUTE: http://localhost:5174/{company user name}/admin
  // =========================================================================
  if (companyAdminSlug) {
    if (!currentUser) {
      return (
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          targetMode="company"
          companySlug={companyAdminSlug}
          onNavigate={navigate}
        />
      );
    }

    return (
      <CompanyWorkspace
        currentUser={currentUser}
        activeCompany={effectiveCompany}
        companies={companies}
        onSwitchCompany={(c) => {
          setActiveCompany(c);
          setApiTenantId(c.id);
          navigate(`/${c.subdomain}/admin`);
        }}
        onSwitchToAdmin={() => navigate('/adminconsole')}
        onLogout={handleLogout}
      />
    );
  }

  // =========================================================================
  // 3. DEDICATED ROUTE: http://localhost:5174/{companySlug} (Customer Portal)
  // =========================================================================
  if (isCustomerPortalRoute && customerPortalSlug) {
    return (
      <CustomerPortal
        companySlug={customerPortalSlug}
        subView={customerPortalSubView === 'portal' ? 'home' : (customerPortalSubView as 'home' | 'ticket' | 'ticketstatus')}
        onNavigate={navigate}
        onNavigateToAdmin={(slug) => navigate(`/${slug}/admin`)}
        onNavigateToSuperAdmin={() => navigate('/adminconsole')}
      />
    );
  }

  // =========================================================================
  // 4. DEDICATED PRICING & PLANS ROUTE: http://localhost:5174/pricing
  // =========================================================================
  if (isPricingRoute) {
    return (
      <>
        <PricingPage
          onBack={() => navigate('/')}
          onSelectPlan={(plan, cycle) => {
            setCheckoutPlanTier(plan);
            setCheckoutBillingCycle(cycle);
            setShowCheckout(true);
          }}
          onNavigateToLogin={() => navigate('/kuwy/admin')}
        />
        {showCheckout && <CheckoutModal
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          initialPlanTier={checkoutPlanTier}
          initialBillingCycle={checkoutBillingCycle}
          activeCompany={effectiveCompany}
          onPaymentSuccess={() => {
            setShowCheckout(false);
            navigate(`/${effectiveCompany.subdomain}/admin`);
          }}
        />}
      </>
    );
  }

  // =========================================================================
  // 5. ONBOARDING SIGNUP ROUTE: http://localhost:5174/signup
  // =========================================================================
  if (isSignupRoute || showOnboarding) {
    return (
      <div className="min-vh-100 bg-slate-900 d-flex flex-column justify-content-center align-items-center p-3 p-md-4" style={{ backgroundColor: '#0b132b' }}>
        <OnboardingModal
          isOpen={true}
          defaultPlan={selectedOnboardPlan}
          onClose={() => {
            setShowOnboarding(false);
            navigate('/');
          }}
          onSuccess={(res) => {
            handleLoginSuccess(res);
            navigate(`/${res.company?.subdomain || 'kuwy'}/admin`);
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // 6. PUBLIC MARKETING LANDING PAGE: http://localhost:5174/
  // =========================================================================
  return (
    <>
      <MarketingLandingPage
        onStartTrial={(planTier = 'STARTER') => {
          setSelectedOnboardPlan(planTier);
          setShowOnboarding(true);
          navigate('/signup');
        }}
        onNavigateToPricing={() => navigate('/pricing')}
        onNavigateToLogin={(slug = 'kuwy') => navigate(`/${slug}/admin`)}
        onNavigateToAdminConsole={() => navigate('/adminconsole')}
        onOpenPortalDemo={(slug = 'kuwy') => navigate(`/${slug}`)}
      />
      {showCheckout && <CheckoutModal
        isOpen={showCheckout}
        onClose={() => setShowCheckout(false)}
        initialPlanTier={checkoutPlanTier}
        initialBillingCycle={checkoutBillingCycle}
        activeCompany={effectiveCompany}
        onPaymentSuccess={() => {
          setShowCheckout(false);
          navigate(`/${effectiveCompany.subdomain}/admin`);
        }}
      />}
    </>
  );
}
