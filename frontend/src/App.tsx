import { useState, useEffect } from 'react';
import { apiService, setApiTenantId, setAuthToken } from './services/api';
import type { Company, AuthUser, LoginResponse } from './types';
import { LoginPage } from './components/LoginPage';
import { SuperAdminPortal } from './components/SuperAdminPortal';
import { CompanyWorkspace } from './components/CompanyWorkspace';
import { CustomerPortal } from './components/CustomerPortal';
import { OnboardingModal } from './components/OnboardingModal';
import { ShieldCheck, Building2, LifeBuoy, Sparkles, ArrowRight } from 'lucide-react';

export default function App() {
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
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
      setPathname(path);
    }
  };

  // Load companies
  useEffect(() => {
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

  // Check company admin route match: e.g. /kuwy/admin or /acme/admin
  const companyAdminMatch = normalizedPath.match(/^\/([^/]+)\/admin$/);
  const companyAdminSlug = companyAdminMatch ? companyAdminMatch[1] : null;

  // Check customer portal route match: e.g. /kuwy or /kuwy/portal or /acme
  const isCustomerPortalRoute = !isAdminConsoleRoute && !isSignupRoute && !companyAdminSlug && normalizedPath !== '/';
  const customerPortalMatch = isCustomerPortalRoute ? normalizedPath.match(/^\/([^/]+)(\/portal)?$/) : null;
  const customerPortalSlug = customerPortalMatch ? customerPortalMatch[1] : null;

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

  const handleLoginSuccess = (res: LoginResponse) => {
    setAuthToken(res.token);
    localStorage.setItem('kuwy_user', JSON.stringify(res));
    setCurrentUser(res);

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
        onNavigateToAdmin={(slug) => navigate(`/${slug}/admin`)}
        onNavigateToSuperAdmin={() => navigate('/adminconsole')}
      />
    );
  }

  // =========================================================================
  // 4. ONBOARDING SIGNUP ROUTE: http://localhost:5174/signup
  // =========================================================================
  if (isSignupRoute || showOnboarding) {
    return (
      <div className="min-vh-100 bg-slate-900 d-flex flex-column justify-content-center align-items-center p-4" style={{ backgroundColor: '#0f172a' }}>
        <OnboardingModal
          isOpen={true}
          onClose={() => {
            setShowOnboarding(false);
            navigate('/kuwy/admin');
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
  // 5. ROOT LANDING & PORTAL DIRECTORY: http://localhost:5174/
  // =========================================================================
  return (
    <div className="min-vh-100 d-flex flex-column" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
      {/* Top Navbar */}
      <header className="px-4 py-3 border-bottom d-flex align-items-center justify-content-between" style={{ borderColor: '#334155' }}>
        <div className="d-flex align-items-center gap-2">
          <div className="p-2 bg-primary rounded-3 text-white">
            <LifeBuoy size={22} />
          </div>
          <div>
            <span className="fw-bolder fs-5 text-white">Kuwy HelpDesk Suite</span>
            <span className="badge bg-primary ms-2">Multi-Tenant SaaS</span>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-sm btn-outline-light d-flex align-items-center gap-1.5"
            onClick={() => navigate('/adminconsole')}
          >
            <ShieldCheck size={16} />
            <span>Admin Console</span>
          </button>
          <button
            className="btn btn-sm btn-primary fw-bold d-flex align-items-center gap-1.5"
            onClick={() => navigate('/signup')}
          >
            <Sparkles size={16} />
            <span>Create Workspace</span>
          </button>
        </div>
      </header>

      {/* Main Hero & Directory */}
      <main className="container my-auto py-5" style={{ maxWidth: '1000px' }}>
        <div className="text-center mb-5">
          <h1 className="fw-extrabold display-5 mb-3 text-white">
            Enterprise Multi-Tenant Customer Support
          </h1>
          <p className="lead text-slate-400 mx-auto" style={{ maxWidth: '640px', color: '#94a3b8' }}>
            Direct URL architecture separating Platform Administration, Company Support Workspaces, and Public Customer Support Portals.
          </p>
        </div>

        <div className="row g-4">
          {/* Card 1: Super Admin Console */}
          <div className="col-12 col-md-4">
            <div
              className="card h-100 p-4 rounded-4 border-0 shadow-lg text-white cursor-pointer hover-card"
              style={{ backgroundColor: '#1e293b', border: '1px solid #334155', cursor: 'pointer' }}
              onClick={() => navigate('/adminconsole')}
            >
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="p-3 rounded-3 bg-warning text-dark">
                  <ShieldCheck size={24} />
                </div>
                <span className="badge bg-warning text-dark fw-bold">Platform Owner</span>
              </div>
              <h4 className="fw-bold mb-2">Admin Console</h4>
              <p className="small text-slate-400 mb-4" style={{ color: '#94a3b8' }}>
                Dedicated platform control center for tenant telemetry, tenant locking, plan management, and cross-organization telemetry.
              </p>
              <div className="mt-auto d-flex align-items-center justify-content-between text-warning fw-semibold small">
                <code>/adminconsole</code>
                <ArrowRight size={16} />
              </div>
            </div>
          </div>

          {/* Card 2: Company Admin Workspace */}
          <div className="col-12 col-md-4">
            <div
              className="card h-100 p-4 rounded-4 border-0 shadow-lg text-white cursor-pointer hover-card"
              style={{ backgroundColor: '#1e293b', border: '1px solid #334155', cursor: 'pointer' }}
              onClick={() => navigate('/kuwy/admin')}
            >
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="p-3 rounded-3 bg-primary text-white">
                  <Building2 size={24} />
                </div>
                <span className="badge bg-primary text-white fw-bold">Company Staff</span>
              </div>
              <h4 className="fw-bold mb-2">Company Admin</h4>
              <p className="small text-slate-400 mb-4" style={{ color: '#94a3b8' }}>
                Dedicated support engineer workspace with HelpDesk.com 3-pane layout, email forwarding wizard, macros, and SLA automations.
              </p>
              <div className="mt-auto d-flex align-items-center justify-content-between text-primary fw-semibold small">
                <code>/&#123;company&#125;/admin</code>
                <ArrowRight size={16} />
              </div>
            </div>
          </div>

          {/* Card 3: Public Customer Portal */}
          <div className="col-12 col-md-4">
            <div
              className="card h-100 p-4 rounded-4 border-0 shadow-lg text-white cursor-pointer hover-card"
              style={{ backgroundColor: '#1e293b', border: '1px solid #334155', cursor: 'pointer' }}
              onClick={() => navigate('/kuwy')}
            >
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="p-3 rounded-3 bg-success text-white">
                  <LifeBuoy size={24} />
                </div>
                <span className="badge bg-success text-white fw-bold">Public Portal</span>
              </div>
              <h4 className="fw-bold mb-2">Customer Portal</h4>
              <p className="small text-slate-400 mb-4" style={{ color: '#94a3b8' }}>
                Public self-service hub. Customers submit tickets with documents (PNG, PDF, TXT), verify via Email OTP, and track status.
              </p>
              <div className="mt-auto d-flex align-items-center justify-content-between text-success fw-semibold small">
                <code>/&#123;company&#125;</code>
                <ArrowRight size={16} />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Tenant Switcher Bar */}
        <div className="mt-5 p-3 rounded-4 border d-flex flex-wrap align-items-center justify-content-between gap-3" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
          <div className="d-flex align-items-center gap-2">
            <span className="small text-slate-400" style={{ color: '#94a3b8' }}>Active Seeded Tenants:</span>
            {companies.map(c => (
              <span key={c.id} className="badge bg-slate-800 border text-white px-2.5 py-1.5" style={{ borderColor: '#475569' }}>
                {c.name} (<code>{c.subdomain}</code>)
              </span>
            ))}
          </div>

          <div className="d-flex align-items-center gap-2">
            <button
              className="btn btn-sm btn-outline-light"
              onClick={() => navigate('/kuwy')}
            >
              Visit Kuwy Portal
            </button>
            <button
              className="btn btn-sm btn-outline-light"
              onClick={() => navigate('/acme')}
            >
              Visit Acme Portal
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => navigate('/kuwy/admin')}
            >
              Enter Support Desk
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 text-center small border-top" style={{ borderColor: '#334155', color: '#64748b' }}>
        Kuwy HelpDesk Suite • Multi-Tenant Architecture & Email Forwarding Engine
      </footer>
    </div>
  );
}
