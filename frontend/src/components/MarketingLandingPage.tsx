import React, { useState } from 'react';
import {
  LifeBuoy, Mail, Zap, CheckCircle2,
  ArrowRight, Building2, ChevronDown,
  ChevronUp, Check, Laptop, Globe, Shield, X
} from 'lucide-react';

interface MarketingLandingPageProps {
  onStartTrial: (planTier?: string) => void;
  onNavigateToPricing: () => void;
  onNavigateToLogin: (companySlug?: string) => void;
  onNavigateToAdminConsole: () => void;
  onOpenPortalDemo: (slug: string) => void;
}

export const MarketingLandingPage: React.FC<MarketingLandingPageProps> = ({
  onStartTrial,
  onNavigateToPricing,
  onNavigateToLogin,
  onNavigateToAdminConsole,
  onOpenPortalDemo
}) => {
  const [activeFeatureTab, setActiveFeatureTab] = useState<'email' | 'inbox' | 'portal' | 'automation' | 'sla' | 'admin'>('email');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [cookieAccepted, setCookieAccepted] = useState<boolean>(() => {
    return localStorage.getItem('kuwy_cookie_consent') === 'true';
  });
  const [activeLegalModal, setActiveLegalModal] = useState<'terms' | 'privacy' | 'refund' | null>(() => {
    const document = new URLSearchParams(window.location.search).get('legal');
    return document === 'terms' || document === 'privacy' || document === 'refund' ? document : null;
  });

  const toggleFaq = (idx: number) => {
    setOpenFaq(prev => prev === idx ? null : idx);
  };

  const handleAcceptCookies = () => {
    localStorage.setItem('kuwy_cookie_consent', 'true');
    setCookieAccepted(true);
  };

  return (
    <div className="marketing-page-wrapper" style={{ backgroundColor: '#0b132b', color: '#f8fafc', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* =====================================================================
          1. TOP STICKY NAVBAR (Screen 1.1)
          ===================================================================== */}
      <header
        className="sticky-top px-3 px-md-5 py-3 border-bottom d-flex align-items-center justify-content-between"
        style={{
          backgroundColor: 'rgba(11, 19, 43, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderColor: '#1e293b',
          zIndex: 1040
        }}
      >
        <div className="d-flex align-items-center gap-3">
          <div className="p-2 rounded-3 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)' }}>
            <LifeBuoy size={24} />
          </div>
          <div>
            <span className="fw-bolder fs-5 text-white tracking-tight" style={{ letterSpacing: '-0.5px' }}>
              Kuwy HelpDesk
            </span>
            <span className="badge ms-2 bg-primary-subtle text-primary border border-primary-subtle fw-bold" style={{ fontSize: '0.65rem' }}>
              SaaS Suite
            </span>
          </div>
        </div>

        {/* Center Nav Links (Desktop) */}
        <nav className="d-none d-lg-flex align-items-center gap-4 text-slate-300 small fw-semibold">
          <a href="#how-it-works" className="nav-link-custom">How It Works</a>
          <a href="#features" className="nav-link-custom">Features</a>
          <button type="button" onClick={onNavigateToPricing} className="btn btn-link p-0 nav-link-custom text-decoration-none">
            Pricing
          </button>
          <a href="#faq" className="nav-link-custom">FAQ</a>
          <a href="#who-its-for" className="nav-link-custom">Who It's For</a>
        </nav>

        {/* Right Actions */}
        <div className="d-flex align-items-center gap-2.5">
          <button
            type="button"
            className="btn btn-sm btn-link text-slate-300 text-decoration-none fw-semibold px-2 hover-text-white"
            onClick={() => onNavigateToLogin('kuwy')}
          >
            Sign In
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary fw-bold px-3.5 py-1.5 rounded-3 d-flex align-items-center gap-1.5 shadow-sm"
            onClick={() => onStartTrial('STARTER')}
          >
            <span>Start Free Trial</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* =====================================================================
          2. HERO SECTION (Screen 1.2)
          ===================================================================== */}
      <section className="px-3 px-md-5 pt-5 pb-4 text-center position-relative overflow-hidden">
        {/* Ambient glow backgrounds */}
        <div
          style={{
            position: 'absolute',
            top: '-150px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '650px',
            height: '450px',
            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.22) 0%, rgba(11, 19, 43, 0) 70%)',
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <div className="container position-relative" style={{ zIndex: 1, maxWidth: '980px' }}>
          {/* Release Chip */}
          <div className="d-inline-flex align-items-center gap-2 px-3 py-1.5 rounded-pill mb-3.5 border shadow-sm" style={{ backgroundColor: 'rgba(30, 41, 59, 0.8)', borderColor: '#334155' }}>
            <span className="badge bg-primary text-white rounded-pill px-2 py-0.5" style={{ fontSize: '0.7rem' }}>NEW</span>
            <span className="small text-slate-300 fw-medium" style={{ fontSize: '0.82rem' }}>
              Multi-tenant Gmail, Outlook & M365 Email Forwarding Engine
            </span>
          </div>

          {/* Hero Promise */}
          <h1 className="display-4 fw-bolder text-white mb-3.5 tracking-tight" style={{ letterSpacing: '-1.2px', lineHeight: '1.18' }}>
            Support tickets from your own Gmail or Outlook,{' '}
            <span style={{ background: 'linear-gradient(135deg, #60a5fa, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              set up in 10 minutes.
            </span>
          </h1>

          <p className="lead text-slate-300 mx-auto mb-4" style={{ maxWidth: '720px', fontSize: '1.18rem', lineHeight: '1.6' }}>
            The simple, modern multi-tenant helpdesk alternative to Zendesk and Zoho Desk.
            Connect your mailbox, automate SLAs, and delight customers without the enterprise complexity.
          </p>

          {/* CTA Group */}
          <div className="d-flex flex-wrap align-items-center justify-content-center gap-3 mb-4">
            <button
              type="button"
              className="btn btn-lg btn-primary fw-bold px-4 py-2.5 rounded-3 d-flex align-items-center gap-2 shadow-lg"
              style={{ fontSize: '1.02rem' }}
              onClick={() => onStartTrial('STARTER')}
            >
              <span>Start 14-Day Free Trial</span>
              <ArrowRight size={18} />
            </button>
            <a
              href="#how-it-works"
              className="btn btn-lg btn-outline-secondary text-slate-200 fw-semibold px-4 py-2.5 rounded-3 border-slate-700"
              style={{ fontSize: '1.02rem', backgroundColor: 'rgba(30, 41, 59, 0.6)' }}
            >
              See How It Works
            </a>
          </div>

          {/* Trust Line */}
          <div className="d-flex flex-wrap align-items-center justify-content-center gap-4 text-slate-400 small mb-5">
            <span className="d-flex align-items-center gap-1.5">
              <CheckCircle2 size={16} className="text-emerald-400 text-success" />
              <span>No credit card required</span>
            </span>
            <span className="d-flex align-items-center gap-1.5">
              <CheckCircle2 size={16} className="text-emerald-400 text-success" />
              <span>14-day full feature trial</span>
            </span>
            <span className="d-flex align-items-center gap-1.5">
              <CheckCircle2 size={16} className="text-emerald-400 text-success" />
              <span>Works with Gmail, Outlook & M365</span>
            </span>
            <span className="d-flex align-items-center gap-1.5">
              <CheckCircle2 size={16} className="text-emerald-400 text-success" />
              <span>Strict Multi-Tenant Isolation</span>
            </span>
          </div>

          {/* Product UI Interactive Simulation Preview */}
          <div
            className="card border-0 rounded-4 overflow-hidden shadow-2xl mx-auto text-start"
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              maxWidth: '920px',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)'
            }}
          >
            {/* Top Bar Window Chrome */}
            <div className="px-4 py-2.5 d-flex align-items-center justify-content-between border-bottom" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
              <div className="d-flex align-items-center gap-2">
                <span className="rounded-circle d-inline-block" style={{ width: '10px', height: '10px', backgroundColor: '#ef4444' }}></span>
                <span className="rounded-circle d-inline-block" style={{ width: '10px', height: '10px', backgroundColor: '#eab308' }}></span>
                <span className="rounded-circle d-inline-block" style={{ width: '10px', height: '10px', backgroundColor: '#22c55e' }}></span>
                <span className="small text-slate-400 ms-2 font-monospace" style={{ fontSize: '0.75rem' }}>
                  https://acme.helpdesk.kuwy.in/admin
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: '0.68rem' }}>
                  Forwarding Live: acme@tickets.helpdesk.com
                </span>
              </div>
            </div>

            {/* Window Content Graphic */}
            <div className="p-3 p-md-4">
              <div className="row g-3">
                {/* Metric 1 */}
                <div className="col-12 col-md-3">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <div className="text-slate-400 small mb-1" style={{ fontSize: '0.75rem' }}>Open Tickets</div>
                    <div className="h4 fw-bold text-white mb-0">18</div>
                    <div className="text-emerald-400 text-success small mt-1" style={{ fontSize: '0.72rem' }}>↑ 100% within SLA</div>
                  </div>
                </div>
                {/* Metric 2 */}
                <div className="col-12 col-md-3">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <div className="text-slate-400 small mb-1" style={{ fontSize: '0.75rem' }}>Avg First Response</div>
                    <div className="h4 fw-bold text-white mb-0">8m 42s</div>
                    <div className="text-info small mt-1" style={{ fontSize: '0.72rem' }}>Target: &lt; 15 mins</div>
                  </div>
                </div>
                {/* Metric 3 */}
                <div className="col-12 col-md-3">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <div className="text-slate-400 small mb-1" style={{ fontSize: '0.75rem' }}>Resolution Rate</div>
                    <div className="h4 fw-bold text-white mb-0">96.4%</div>
                    <div className="text-emerald-400 text-success small mt-1" style={{ fontSize: '0.72rem' }}>CSAT: 4.9 / 5.0</div>
                  </div>
                </div>
                {/* Metric 4 */}
                <div className="col-12 col-md-3">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <div className="text-slate-400 small mb-1" style={{ fontSize: '0.75rem' }}>Active Workspace</div>
                    <div className="h4 fw-bold text-white mb-0">Acme Logistics</div>
                    <div className="text-warning small mt-1" style={{ fontSize: '0.72rem' }}>Starter Plan (5 Agents)</div>
                  </div>
                </div>
              </div>

              {/* Sample Ticket Row */}
              <div className="mt-3 p-3 rounded-3 d-flex flex-wrap align-items-center justify-content-between gap-2" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                <div className="d-flex align-items-center gap-3">
                  <div className="p-2 rounded bg-primary text-white">
                    <Mail size={16} />
                  </div>
                  <div>
                    <div className="fw-bold text-white small">
                      [#ACME-1042] Re: Urgent API webhook timeout in production
                    </div>
                    <div className="text-slate-400" style={{ fontSize: '0.75rem' }}>
                      From: dev@client.com • Forwarded via Gmail • Auto-assigned to Support Team
                    </div>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-danger-subtle text-danger border border-danger-subtle" style={{ fontSize: '0.7rem' }}>
                    HIGH PRIORITY
                  </span>
                  <span className="badge bg-primary-subtle text-primary border border-primary-subtle" style={{ fontSize: '0.7rem' }}>
                    OPEN
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-light py-1 px-2.5 fw-semibold"
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => onOpenPortalDemo('acme')}
                  >
                    View Ticket Detail
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. HOW IT WORKS: 3 STEPS (Screen 1.4)
          ===================================================================== */}
      <section id="how-it-works" className="px-3 px-md-5 py-5 border-top" style={{ borderColor: '#1e293b', backgroundColor: '#0f172a' }}>
        <div className="container" style={{ maxWidth: '980px' }}>
          <div className="text-center mb-5">
            <span className="badge bg-primary-subtle text-primary px-3 py-1 rounded-pill fw-bold mb-2">
              SIMPLE 3-STEP ARCHITECTURE
            </span>
            <h2 className="fw-bolder text-white">How Kuwy HelpDesk Works</h2>
            <p className="text-slate-400 small mx-auto" style={{ maxWidth: '600px' }}>
              Your customers keep emailing your normal support address. We take care of tickets, SLA tracking, and threading automatically.
            </p>
          </div>

          <div className="row g-4">
            {/* Step 1 */}
            <div className="col-12 col-md-4">
              <div className="card h-100 p-4 rounded-4 border-0 text-white" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div className="p-3 rounded-3 bg-primary text-white">
                    <Mail size={22} />
                  </div>
                  <span className="badge bg-secondary text-white fw-bold">STEP 1</span>
                </div>
                <h5 className="fw-bold mb-2">Forward Your Support Email</h5>
                <p className="small text-slate-300 mb-0" style={{ lineHeight: '1.6' }}>
                  Enable automatic forwarding in Gmail, Microsoft Outlook, or Microsoft 365 to your unique company forwarding address (e.g. <code>acme@tickets.helpdesk.com</code>).
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="col-12 col-md-4">
              <div className="card h-100 p-4 rounded-4 border-0 text-white" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div className="p-3 rounded-3 bg-info text-dark">
                    <Zap size={22} />
                  </div>
                  <span className="badge bg-secondary text-white fw-bold">STEP 2</span>
                </div>
                <h5 className="fw-bold mb-2">Tickets Appear in Real Time</h5>
                <p className="small text-slate-300 mb-0" style={{ lineHeight: '1.6' }}>
                  Inbound emails are immediately parsed into conversation threads, tagged with unique ticket numbers (#ACME-1001), and auto-assigned by category or round-robin.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="col-12 col-md-4">
              <div className="card h-100 p-4 rounded-4 border-0 text-white" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div className="p-3 rounded-3 bg-success text-white">
                    <CheckCircle2 size={22} />
                  </div>
                  <span className="badge bg-secondary text-white fw-bold">STEP 3</span>
                </div>
                <h5 className="fw-bold mb-2">Reply from Dashboard</h5>
                <p className="small text-slate-300 mb-0" style={{ lineHeight: '1.6' }}>
                  Agents reply from the HelpDesk 3-pane workspace with canned responses. The customer receives a normal, branded email and can reply directly from their phone.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. 6 CORE FEATURE SHOWCASES (Screen 1.5)
          ===================================================================== */}
      <section id="features" className="px-3 px-md-5 py-5 border-top" style={{ borderColor: '#1e293b', backgroundColor: '#0b132b' }}>
        <div className="container" style={{ maxWidth: '1020px' }}>
          <div className="text-center mb-5">
            <span className="badge bg-primary-subtle text-primary px-3 py-1 rounded-pill fw-bold mb-2">
              BUILT FOR SPEED & ACCURACY
            </span>
            <h2 className="fw-bolder text-white">Enterprise HelpDesk Features, Zero Clutter</h2>
            <p className="text-slate-400 small mx-auto" style={{ maxWidth: '640px' }}>
              Everything your customer service and IT support engineers need to resolve tickets 3x faster.
            </p>
          </div>

          {/* Feature Navigation Tabs */}
          <div className="d-flex flex-wrap align-items-center justify-content-center gap-2 mb-4">
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-3 py-2 fw-semibold ${activeFeatureTab === 'email' ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary text-slate-300'}`}
              onClick={() => setActiveFeatureTab('email')}
            >
              Email-to-Ticket
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-3 py-2 fw-semibold ${activeFeatureTab === 'inbox' ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary text-slate-300'}`}
              onClick={() => setActiveFeatureTab('inbox')}
            >
              Shared Inbox & Routing
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-3 py-2 fw-semibold ${activeFeatureTab === 'portal' ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary text-slate-300'}`}
              onClick={() => setActiveFeatureTab('portal')}
            >
              Customer Portal
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-3 py-2 fw-semibold ${activeFeatureTab === 'automation' ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary text-slate-300'}`}
              onClick={() => setActiveFeatureTab('automation')}
            >
              Canned Responses & Macros
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-3 py-2 fw-semibold ${activeFeatureTab === 'sla' ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary text-slate-300'}`}
              onClick={() => setActiveFeatureTab('sla')}
            >
              SLA Policies & Telemetry
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-3 py-2 fw-semibold ${activeFeatureTab === 'admin' ? 'btn-primary text-white shadow-sm' : 'btn-outline-secondary text-slate-300'}`}
              onClick={() => setActiveFeatureTab('admin')}
            >
              Multi-Tenant Governance
            </button>
          </div>

          {/* Feature Tab Details */}
          <div className="card p-4 p-md-5 rounded-4 border-0 text-white shadow-lg" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
            {activeFeatureTab === 'email' && (
              <div className="row align-items-center g-4">
                <div className="col-12 col-md-6">
                  <div className="badge bg-primary mb-2">EMAIL-TO-TICKET</div>
                  <h3 className="fw-bold mb-3">Forward messages from Gmail, Outlook or Microsoft 365</h3>
                  <p className="text-slate-300 small mb-4" style={{ lineHeight: '1.7' }}>
                    Keep your professional <code>support@yourcompany.com</code> email address. Forward directly into your HelpDesk queue without complex mail server administration.
                  </p>
                  <ul className="list-unstyled d-flex flex-column gap-2.5 small text-slate-200">
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-primary" />
                      <span>Automatic message threading via Message-ID & In-Reply-To headers</span>
                    </li>
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-primary" />
                      <span>Anti-loop suppression for daemon bounces and out-of-office autoreplies</span>
                    </li>
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-primary" />
                      <span>Document attachments support (PNG, JPG, PDF, TXT up to 25MB)</span>
                    </li>
                  </ul>
                </div>
                <div className="col-12 col-md-6">
                  <div className="p-3.5 rounded-3" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <div className="small fw-bold text-slate-400 mb-2 font-monospace">EMAIL THREADING PREVIEW</div>
                    <div className="p-2.5 bg-dark rounded border border-secondary mb-2 small">
                      <span className="text-slate-400">Subject:</span> [#ACME-1042] Re: Order delivery inquiry<br />
                      <span className="text-slate-400">Sender:</span> client@business.com<br />
                      <span className="text-success small">✓ Verified Contact • In-Reply-To Verified</span>
                    </div>
                    <div className="p-2.5 bg-primary-subtle text-primary rounded small fw-medium">
                      Agent replied from dashboard → Sent to customer inbox instantly.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'inbox' && (
              <div className="row align-items-center g-4">
                <div className="col-12 col-md-6">
                  <div className="badge bg-info text-dark mb-2">SHARED INBOX & AUTO-ASSIGNMENT</div>
                  <h3 className="fw-bold mb-3">HelpDesk.com 3-Pane Layout with Bulk Actions</h3>
                  <p className="text-slate-300 small mb-4" style={{ lineHeight: '1.7' }}>
                    Clear left sidebar navigation for Views (Unassigned, My Tickets, Pending, Resolved), ticket list in middle, and conversation thread with customer context on the right.
                  </p>
                  <ul className="list-unstyled d-flex flex-column gap-2.5 small text-slate-200">
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-info" />
                      <span>One-click bulk actions (assign agent, change status, set priority)</span>
                    </li>
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-info" />
                      <span>Private internal notes invisible to customer</span>
                    </li>
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-info" />
                      <span>Department routing for Technical Support, IT, and Billing</span>
                    </li>
                  </ul>
                </div>
                <div className="col-12 col-md-6">
                  <div className="p-3.5 rounded-3" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                      <span className="small fw-bold text-white">Tickets Dashboard</span>
                      <span className="badge bg-primary">3-Pane Flow</span>
                    </div>
                    <div className="d-flex gap-2">
                      <div className="p-2 rounded bg-secondary-subtle text-dark small w-25">Views</div>
                      <div className="p-2 rounded bg-dark border text-white small w-50">Ticket List</div>
                      <div className="p-2 rounded bg-primary-subtle text-primary small w-50">Thread & Reply</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'portal' && (
              <div className="row align-items-center g-4">
                <div className="col-12 col-md-6">
                  <div className="badge bg-success mb-2">CUSTOMER PORTAL</div>
                  <h3 className="fw-bold mb-3">Self-Serve Support for Every Company</h3>
                  <p className="text-slate-300 small mb-4" style={{ lineHeight: '1.7' }}>
                    Each tenant gets their dedicated public portal (e.g. <code>/kuwy</code> or <code>/acme</code>). Customers can raise tickets, check status, and log in with email OTP.
                  </p>
                  <ul className="list-unstyled d-flex flex-column gap-2.5 small text-slate-200">
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-success" />
                      <span>Passwordless Email OTP authentication</span>
                    </li>
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-success" />
                      <span>Anti-spam honeypot traps & sliding-window rate limiting</span>
                    </li>
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-success" />
                      <span>Document file attachment upload (PDF, PNG, JPG)</span>
                    </li>
                  </ul>
                </div>
                <div className="col-12 col-md-6 text-center">
                  <div className="p-4 rounded-3" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <LifeBuoy size={42} className="text-primary mb-3" />
                    <h5 className="fw-bold text-white">Kuwy Help Center</h5>
                    <p className="text-slate-400 small mb-3">Track your tickets & get answers fast</p>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => onOpenPortalDemo('kuwy')}
                    >
                      Preview Public Portal (/kuwy)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'automation' && (
              <div className="row align-items-center g-4">
                <div className="col-12 col-md-6">
                  <div className="badge bg-warning text-dark mb-2">CANNED RESPONSES & MACROS</div>
                  <h3 className="fw-bold mb-3">Reply in Seconds with Reusable Templates</h3>
                  <p className="text-slate-300 small mb-4" style={{ lineHeight: '1.7' }}>
                    Save pre-approved snippets with shortcuts like <code>#welcome</code> or <code>#moreinfo</code>. Auto-inject customer names and dynamic ticket properties.
                  </p>
                  <ul className="list-unstyled d-flex flex-column gap-2.5 small text-slate-200">
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-warning" />
                      <span>One-click scenario execution (reply + set pending + assign agent)</span>
                    </li>
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-warning" />
                      <span>Variable placeholders: contact.name, ticket.number, company.name</span>
                    </li>
                  </ul>
                </div>
                <div className="col-12 col-md-6">
                  <div className="p-3.5 rounded-3 font-monospace small" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <div className="text-warning mb-1">Shortcut: #welcome</div>
                    <div className="text-slate-300">
                      "Hi &#123;&#123;contact.name&#125;&#125;, thank you for reaching out to &#123;&#123;company.name&#125;&#125;. Our team is actively reviewing your request."
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'sla' && (
              <div className="row align-items-center g-4">
                <div className="col-12 col-md-6">
                  <div className="badge bg-danger mb-2">SLA & KPI TELEMETRY</div>
                  <h3 className="fw-bold mb-3">Never Miss a Resolution Target</h3>
                  <p className="text-slate-300 small mb-4" style={{ lineHeight: '1.7' }}>
                    Set custom business hours, first response SLA timers (e.g. &lt; 15 mins for Urgent), and resolution targets. Track agent breaches and CSAT in real time.
                  </p>
                  <ul className="list-unstyled d-flex flex-column gap-2.5 small text-slate-200">
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-danger" />
                      <span>Live breach warning indicators and automated escalation</span>
                    </li>
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-danger" />
                      <span>MIS Tracking reports with engineer workload and response telemetry</span>
                    </li>
                  </ul>
                </div>
                <div className="col-12 col-md-6">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <div className="d-flex justify-content-between text-slate-400 small mb-2">
                      <span>URGENT SLA Target</span>
                      <span className="text-success fw-bold">12m Left</span>
                    </div>
                    <div className="progress" style={{ height: '8px' }}>
                      <div className="progress-bar bg-success" style={{ width: '45%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'admin' && (
              <div className="row align-items-center g-4">
                <div className="col-12 col-md-6">
                  <div className="badge bg-secondary mb-2">PLATFORM GOVERNANCE</div>
                  <h3 className="fw-bold mb-3">Dedicated Admin Console for Multi-Tenant Control</h3>
                  <p className="text-slate-300 small mb-4" style={{ lineHeight: '1.7' }}>
                    Manage all customer workspaces, track platform-wide telemetry, enforce subscription quotas, and configure global security at <code>/adminconsole</code>.
                  </p>
                  <ul className="list-unstyled d-flex flex-column gap-2.5 small text-slate-200">
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-primary" />
                      <span>Tenant isolation: zero possibility of cross-company ticket leaks</span>
                    </li>
                    <li className="d-flex align-items-center gap-2">
                      <Check size={16} className="text-primary" />
                      <span>Audit logging & role-based permissions (Super Admin, Company Admin, Agent)</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-warning mt-2"
                    onClick={onNavigateToAdminConsole}
                  >
                    Open Platform Admin Console (/adminconsole)
                  </button>
                </div>
                <div className="col-12 col-md-6">
                  <div className="p-3.5 rounded-3" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                    <div className="text-slate-400 small mb-2 fw-bold">Active Tenants Monitored:</div>
                    <div className="p-2 bg-dark rounded border mb-1.5 d-flex justify-content-between small">
                      <span>Kuwy Technology Services</span>
                      <span className="badge bg-success">ACTIVE • ENTERPRISE</span>
                    </div>
                    <div className="p-2 bg-dark rounded border d-flex justify-content-between small">
                      <span>Acme Global Logistics</span>
                      <span className="badge bg-primary">ACTIVE • PROFESSIONAL</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          5. "WHO IT'S FOR" AUDIENCE SEGMENTS (Screen 1.6)
          ===================================================================== */}
      <section id="who-its-for" className="px-3 px-md-5 py-5 border-top" style={{ borderColor: '#1e293b', backgroundColor: '#0f172a' }}>
        <div className="container" style={{ maxWidth: '980px' }}>
          <div className="text-center mb-5">
            <span className="badge bg-primary-subtle text-primary px-3 py-1 rounded-pill fw-bold mb-2">
              DESIGNED FOR REAL TEAMS
            </span>
            <h2 className="fw-bolder text-white">Who Uses Kuwy HelpDesk?</h2>
            <p className="text-slate-400 small mx-auto" style={{ maxWidth: '600px' }}>
              Whether you are an engineering team, high-growth logistics provider, or digital agency, Kuwy HelpDesk scales with your volume.
            </p>
          </div>

          <div className="row g-4">
            <div className="col-12 col-md-6 col-lg-3">
              <div className="card h-100 p-3.5 rounded-3 border-0 text-white" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <Laptop size={24} className="text-primary mb-2.5" />
                <h6 className="fw-bold mb-1.5">IT & SaaS Startups</h6>
                <p className="small text-slate-400 mb-0" style={{ fontSize: '0.84rem', lineHeight: '1.5' }}>
                  Manage bug reports, developer API inquiries, and release requests with clean GitHub-style threading.
                </p>
              </div>
            </div>

            <div className="col-12 col-md-6 col-lg-3">
              <div className="card h-100 p-3.5 rounded-3 border-0 text-white" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <Building2 size={24} className="text-info mb-2.5" />
                <h6 className="fw-bold mb-1.5">B2B Agencies & IT Services</h6>
                <p className="small text-slate-400 mb-0" style={{ fontSize: '0.84rem', lineHeight: '1.5' }}>
                  Track client SLAs with precision timers, automated escalations, and dedicated customer portals.
                </p>
              </div>
            </div>

            <div className="col-12 col-md-6 col-lg-3">
              <div className="card h-100 p-3.5 rounded-3 border-0 text-white" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <Globe size={24} className="text-success mb-2.5" />
                <h6 className="fw-bold mb-1.5">Logistics & E-Commerce</h6>
                <p className="small text-slate-400 mb-0" style={{ fontSize: '0.84rem', lineHeight: '1.5' }}>
                  Handle delivery status questions, address changes, and refund requests with canned responses.
                </p>
              </div>
            </div>

            <div className="col-12 col-md-6 col-lg-3">
              <div className="card h-100 p-3.5 rounded-3 border-0 text-white" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <Shield size={24} className="text-warning mb-2.5" />
                <h6 className="fw-bold mb-1.5">Fintech & Banking Tech</h6>
                <p className="small text-slate-400 mb-0" style={{ fontSize: '0.84rem', lineHeight: '1.5' }}>
                  Enterprise multi-tenant isolation, audit logs, and verified email ingestion for regulatory compliance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          6. PRICING PREVIEW (Screen 1.7)
          ===================================================================== */}
      <section className="px-3 px-md-5 py-5 border-top" style={{ borderColor: '#1e293b', backgroundColor: '#0b132b' }}>
        <div className="container" style={{ maxWidth: '980px' }}>
          <div className="text-center mb-4">
            <span className="badge bg-primary-subtle text-primary px-3 py-1 rounded-pill fw-bold mb-2">
              TRANSPARENT PRICING
            </span>
            <h2 className="fw-bolder text-white">Simple Plans, No Hidden Fees</h2>
            <p className="text-slate-400 small mx-auto mb-3" style={{ maxWidth: '600px' }}>
              All plans include 14-day free trial, email forwarding, and customer portals.
            </p>

            {/* Monthly / Annual Toggle */}
            <div className="d-inline-flex align-items-center p-1 rounded-pill border bg-dark" style={{ borderColor: '#334155' }}>
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-3 py-1 fw-bold ${billingCycle === 'monthly' ? 'btn-primary text-white' : 'text-slate-400'}`}
                onClick={() => setBillingCycle('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-3 py-1 fw-bold ${billingCycle === 'annual' ? 'btn-primary text-white' : 'text-slate-400'}`}
                onClick={() => setBillingCycle('annual')}
              >
                Yearly <span className="badge bg-warning text-dark ms-1">Save 20%</span>
              </button>
            </div>
          </div>

          <div className="row g-4 justify-content-center">
            {/* Free Plan */}
            <div className="col-12 col-md-4">
              <div className="card h-100 p-4 rounded-4 border-0 text-white d-flex flex-column" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <h5 className="fw-bold mb-1">Free</h5>
                <p className="text-slate-400 small mb-3">For micro-teams starting out</p>
                <div className="display-6 fw-bolder mb-3">₹0</div>
                <ul className="list-unstyled small text-slate-300 d-flex flex-column gap-2 mb-4 flex-grow-1">
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-primary" /> Up to 2 Agents
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-primary" /> 100 Tickets / month
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-primary" /> Email Forwarding
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-primary" /> Public Customer Portal
                  </li>
                </ul>
                <button
                  type="button"
                  className="btn btn-outline-light w-100 fw-bold py-2 rounded-3"
                  onClick={() => onStartTrial('FREE')}
                >
                  Start Free
                </button>
              </div>
            </div>

            {/* Starter Plan (Most Popular) */}
            <div className="col-12 col-md-4">
              <div
                className="card h-100 p-4 rounded-4 border-0 text-white d-flex flex-column position-relative shadow-lg"
                style={{
                  backgroundColor: '#1e293b',
                  border: '2px solid #3b82f6',
                  transform: 'scale(1.02)'
                }}
              >
                <span
                  className="position-absolute top-0 start-50 translate-middle badge bg-primary text-white px-3 py-1 rounded-pill fw-bold shadow-sm"
                  style={{ fontSize: '0.72rem' }}
                >
                  MOST POPULAR
                </span>
                <h5 className="fw-bold mb-1">Starter</h5>
                <p className="text-slate-400 small mb-3">For growing companies</p>
                <div className="display-6 fw-bolder mb-0">
                  {billingCycle === 'annual' ? '₹1,999' : '₹2,499'}
                  <span className="fs-6 text-slate-400 fw-normal"> / mo</span>
                </div>
                <small className="text-info mb-3 d-block" style={{ fontSize: '0.75rem' }}>
                  {billingCycle === 'annual' ? 'Billed annually (Save ₹6,000/yr)' : 'Billed monthly'}
                </small>
                <ul className="list-unstyled small text-slate-300 d-flex flex-column gap-2 mb-4 flex-grow-1">
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-emerald-400 text-success" /> Up to 5 Support Agents
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-emerald-400 text-success" /> 1,500 Tickets / month
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-emerald-400 text-success" /> Gmail, Outlook & M365 Forwarding
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-emerald-400 text-success" /> Custom Subdomain & Brand Logo
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-emerald-400 text-success" /> Automated SLA & Breach Reminders
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-emerald-400 text-success" /> Canned Responses & Macros
                  </li>
                </ul>
                <button
                  type="button"
                  className="btn btn-primary w-100 fw-bold py-2 rounded-3 shadow-sm"
                  onClick={() => onStartTrial('STARTER')}
                >
                  Start 14-Day Free Trial
                </button>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="col-12 col-md-4">
              <div className="card h-100 p-4 rounded-4 border-0 text-white d-flex flex-column" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <h5 className="fw-bold mb-1">Pro</h5>
                <p className="text-slate-400 small mb-3">Omnichannel scale & security</p>
                <div className="display-6 fw-bolder mb-0">
                  {billingCycle === 'annual' ? '₹4,799' : '₹5,999'}
                  <span className="fs-6 text-slate-400 fw-normal"> / mo</span>
                </div>
                <small className="text-info mb-3 d-block" style={{ fontSize: '0.75rem' }}>
                  {billingCycle === 'annual' ? 'Billed annually (Save ₹14,400/yr)' : 'Billed monthly'}
                </small>
                <ul className="list-unstyled small text-slate-300 d-flex flex-column gap-2 mb-4 flex-grow-1">
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-primary" /> Up to 25 Support Agents
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-primary" /> Unlimited Tickets (fair use 10k/mo)
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-primary" /> Microsoft 365 & Gmail OAuth Direct
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-primary" /> Multi-Tier SLA Escalation Rules
                  </li>
                  <li className="d-flex align-items-center gap-2">
                    <Check size={14} className="text-primary" /> Advanced MIS & Export Telemetry
                  </li>
                </ul>
                <button
                  type="button"
                  className="btn btn-outline-light w-100 fw-bold py-2 rounded-3"
                  onClick={() => onStartTrial('PRO')}
                >
                  Start Pro Trial
                </button>
              </div>
            </div>
          </div>

          <div className="text-center mt-4">
            <button
              type="button"
              className="btn btn-link text-slate-300 fw-semibold text-decoration-underline"
              onClick={onNavigateToPricing}
            >
              View Full Feature Comparison Table & Indian GST Breakdown →
            </button>
          </div>
        </div>
      </section>

      {/* =====================================================================
          7. FAQ ACCORDION (Screen 1.8)
          ===================================================================== */}
      <section id="faq" className="px-3 px-md-5 py-5 border-top" style={{ borderColor: '#1e293b', backgroundColor: '#0f172a' }}>
        <div className="container" style={{ maxWidth: '820px' }}>
          <div className="text-center mb-5">
            <span className="badge bg-primary-subtle text-primary px-3 py-1 rounded-pill fw-bold mb-2">
              FREQUENTLY ASKED QUESTIONS
            </span>
            <h2 className="fw-bolder text-white">Got Questions? We Have Answers.</h2>
          </div>

          <div className="d-flex flex-column gap-3">
            {[
              {
                q: "How does email forwarding work with our existing support email?",
                a: "You keep your existing support@yourcompany.com address. In Gmail, Google Workspace, Outlook, or Microsoft 365, you set up a forwarding rule to your unique Kuwy HelpDesk address (e.g. yourcompany@tickets.helpdesk.com). All incoming emails instantly become tickets, and when your agents reply, customers receive emails from your address."
              },
              {
                q: "Is our company's data kept strictly separate from other tenants?",
                a: "Yes. Kuwy HelpDesk is built with strict multi-tenant isolation. Every database query enforces tenant verification via JWT claims and server-side assertions. No tenant can ever view, search, or access another company's tickets, attachments, canned responses, or telemetry."
              },
              {
                q: "Can I cancel or change plans anytime?",
                a: "Absolutely. You can upgrade, downgrade, or cancel your subscription at any time with one click from the billing dashboard. There are no lock-in contracts."
              },
              {
                q: "Do I need a credit card to start the trial?",
                a: "No credit card is required. You get 14 days of full feature access immediately upon signing up."
              },
              {
                q: "Are prices in INR, and do they include GST?",
                a: "All displayed prices are in Indian Rupees (INR) for Indian companies. Prices exclude 18% GST, which is calculated transparently during checkout with full GST tax invoice generation."
              }
            ].map((faq, idx) => (
              <div
                key={idx}
                className="card rounded-3 border-0 overflow-hidden text-white"
                style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
              >
                <div
                  className="p-3.5 d-flex align-items-center justify-content-between cursor-pointer"
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleFaq(idx)}
                >
                  <span className="fw-semibold text-white small" style={{ fontSize: '0.96rem' }}>{faq.q}</span>
                  {openFaq === idx ? <ChevronUp size={18} className="text-primary flex-shrink-0" /> : <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />}
                </div>
                {openFaq === idx && (
                  <div className="px-3.5 pb-3.5 pt-0 small text-slate-300 border-top pt-3" style={{ borderColor: '#334155', lineHeight: '1.6' }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================================
          8. FINAL CALL TO ACTION (Screen 1.9)
          ===================================================================== */}
      <section className="px-3 px-md-5 py-5 border-top text-center" style={{ borderColor: '#1e293b', backgroundColor: '#0b132b' }}>
        <div className="container" style={{ maxWidth: '720px' }}>
          <h2 className="display-6 fw-bolder text-white mb-3">
            Start delivering 10x better support today.
          </h2>
          <p className="text-slate-300 small mb-4" style={{ fontSize: '1.05rem', lineHeight: '1.6' }}>
            Set up your company workspace in under 60 seconds. No credit card required.
          </p>
          <button
            type="button"
            className="btn btn-lg btn-primary fw-bold px-4 py-2.5 rounded-3 d-inline-flex align-items-center gap-2 shadow-lg"
            onClick={() => onStartTrial('STARTER')}
          >
            <span>Create Your Free Workspace</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* =====================================================================
          9. FOOTER (Screen 1.10)
          ===================================================================== */}
      <footer className="px-3 px-md-5 py-5 border-top text-slate-400 small" style={{ borderColor: '#1e293b', backgroundColor: '#070d1e' }}>
        <div className="container" style={{ maxWidth: '1020px' }}>
          <div className="row g-4 mb-4">
            <div className="col-12 col-md-4">
              <div className="d-flex align-items-center gap-2 mb-2 text-white fw-bold">
                <LifeBuoy size={20} className="text-primary" />
                <span>Kuwy HelpDesk Suite</span>
              </div>
              <p className="small mb-3" style={{ lineHeight: '1.6' }}>
                Modern multi-tenant SaaS HelpDesk platform with Gmail & Outlook forwarding, automated SLA policies, and dedicated customer portals.
              </p>
              <div className="small text-slate-500">
                © {new Date().getFullYear()} Kuwy Technology Services Pvt Ltd.<br />
                SP Infocity, MGR Salai, Perungudi, Chennai 600096, India.
              </div>
            </div>

            <div className="col-6 col-md-2">
              <h6 className="text-white fw-bold small mb-2.5">Product</h6>
              <ul className="list-unstyled d-flex flex-column gap-1.5 small">
                <li><a href="#features" className="footer-link">Features</a></li>
                <li><button type="button" onClick={onNavigateToPricing} className="btn btn-link p-0 footer-link">Pricing</button></li>
                <li><a href="#how-it-works" className="footer-link">Email Forwarding</a></li>
                <li><button type="button" onClick={() => onOpenPortalDemo('kuwy')} className="btn btn-link p-0 footer-link">Customer Portal</button></li>
              </ul>
            </div>

            <div className="col-6 col-md-2">
              <h6 className="text-white fw-bold small mb-2.5">Portals</h6>
              <ul className="list-unstyled d-flex flex-column gap-1.5 small">
                <li><button type="button" onClick={() => onNavigateToLogin('kuwy')} className="btn btn-link p-0 footer-link">Kuwy Support Login</button></li>
                <li><button type="button" onClick={() => onNavigateToLogin('acme')} className="btn btn-link p-0 footer-link">Acme Logistics Login</button></li>
                <li><button type="button" onClick={onNavigateToAdminConsole} className="btn btn-link p-0 footer-link">Admin Console</button></li>
              </ul>
            </div>

            <div className="col-12 col-md-4">
              <h6 className="text-white fw-bold small mb-2.5">Legal & Compliance</h6>
              <ul className="list-unstyled d-flex flex-column gap-1.5 small">
                <li>
                  <button type="button" onClick={() => setActiveLegalModal('terms')} className="btn btn-link p-0 footer-link">
                    Terms of Service
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveLegalModal('privacy')} className="btn btn-link p-0 footer-link">
                    Privacy Policy (India DPDP & GDPR)
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveLegalModal('refund')} className="btn btn-link p-0 footer-link">
                    Refund & Cancellation Policy
                  </button>
                </li>
                <li className="text-slate-500 pt-1">
                  ISO 27001 Certified • PCI-DSS Level 1 Gateway Partnered
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* =====================================================================
          10. COOKIE CONSENT BANNER (India DPDP Act & EU Compliance)
          ===================================================================== */}
      {!cookieAccepted && (
        <div
          className="fixed-bottom p-3 m-3 rounded-4 shadow-2xl d-flex flex-wrap align-items-center justify-content-between gap-3 text-white border"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.96)',
            borderColor: '#334155',
            backdropFilter: 'blur(10px)',
            maxWidth: '820px',
            zIndex: 1080
          }}
        >
          <div className="small" style={{ maxWidth: '580px', lineHeight: '1.5' }}>
            <strong>Cookie & Privacy Consent:</strong> We use essential session cookies to authenticate your account and ensure secure multi-tenant data isolation under the Digital Personal Data Protection Act (DPDPA).
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-light px-3 py-1.5 fw-semibold"
              onClick={() => handleAcceptCookies()}
            >
              Essential Only
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary px-3 py-1.5 fw-bold"
              onClick={() => handleAcceptCookies()}
            >
              Accept All
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          11. LEGAL MODALS (Terms, Privacy, Refund)
          ===================================================================== */}
      {activeLegalModal && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)', zIndex: 1090 }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden bg-slate-900 text-white" style={{ backgroundColor: '#1e293b' }}>
              <div className="modal-header border-bottom px-4 py-3" style={{ borderColor: '#334155' }}>
                <h5 className="modal-title fw-bold text-white mb-0">
                  {activeLegalModal === 'terms' && 'Terms of Service'}
                  {activeLegalModal === 'privacy' && 'Privacy Policy'}
                  {activeLegalModal === 'refund' && 'Refund & Cancellation Policy'}
                </h5>
                <button
                  type="button"
                  className="btn btn-sm btn-light p-1 rounded-circle"
                  onClick={() => setActiveLegalModal(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="modal-body p-4 small text-slate-300" style={{ maxHeight: '70vh', overflowY: 'auto', lineHeight: '1.7' }}>
                {activeLegalModal === 'terms' && (
                  <div>
                    <h6 className="text-white fw-bold">1. Agreement to Terms</h6>
                    <p>By accessing Kuwy HelpDesk SaaS platform, you agree to be bound by these Terms of Service and all applicable multi-tenant data governance regulations.</p>
                    <h6 className="text-white fw-bold mt-3">2. Tenant Isolation & Security</h6>
                    <p>Kuwy guarantees logical data isolation between customer workspaces. Your company data, tickets, and user credentials will never be shared with or visible to other tenants.</p>
                    <h6 className="text-white fw-bold mt-3">3. Acceptable Use</h6>
                    <p>You agree not to use the email forwarding engine for sending spam, phishing, or distributing malicious executable code.</p>
                  </div>
                )}
                {activeLegalModal === 'privacy' && (
                  <div>
                    <h6 className="text-white fw-bold">1. Information We Collect</h6>
                    <p>We collect work email addresses, company names, and email correspondence solely for providing ticketing, SLA escalation, and multi-tenant workspace routing.</p>
                    <h6 className="text-white fw-bold mt-3">2. Digital Personal Data Protection Act (DPDPA) Compliance</h6>
                    <p>We do not sell personal data. All customer inquiries forwarded through Microsoft 365, Outlook, or Google Workspace are encrypted in transit via TLS 1.3 and at rest with AES-256.</p>
                  </div>
                )}
                {activeLegalModal === 'refund' && (
                  <div>
                    <h6 className="text-white fw-bold">1. 14-Day Free Trial</h6>
                    <p>Every workspace begins with a 14-day risk-free trial. You are never billed during this period.</p>
                    <h6 className="text-white fw-bold mt-3">2. Cancellation & Refunds</h6>
                    <p>You may cancel your monthly or annual subscription at any time. For annual subscriptions cancelled within 7 days of renewal, prorated refunds are processed within 5 to 7 business days.</p>
                    <h6 className="text-white fw-bold mt-3">3. GST Compliance</h6>
                    <p>All transactions in India are issued with valid GST tax invoices with sequential serial numbers.</p>
                  </div>
                )}
              </div>
              <div className="modal-footer border-top px-4 py-2.5" style={{ borderColor: '#334155' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary fw-bold px-3 py-1.5"
                  onClick={() => setActiveLegalModal(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Component Styles */}
      <style>{`
        .nav-link-custom {
          color: #94a3b8;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .nav-link-custom:hover, .hover-text-white:hover {
          color: #ffffff !important;
        }
        .footer-link {
          color: #94a3b8;
          text-decoration: none;
          font-size: 0.85rem;
          transition: color 0.15s ease;
        }
        .footer-link:hover {
          color: #ffffff;
        }
      `}</style>
    </div>
  );
};
