import React, { useState } from 'react';
import {
  LifeBuoy, Check, X as CloseIcon, PhoneCall, ArrowLeft
} from 'lucide-react';

interface PricingPageProps {
  onBack: () => void;
  onSelectPlan: (planTier: string, billingCycle: 'monthly' | 'annual') => void;
  onNavigateToLogin: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({
  onBack,
  onSelectPlan,
  onNavigateToLogin
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');

  return (
    <div style={{ backgroundColor: '#0b132b', color: '#f8fafc', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Header */}
      <header
        className="px-4 px-md-5 py-3 border-bottom d-flex align-items-center justify-content-between sticky-top"
        style={{ backgroundColor: 'rgba(11, 19, 43, 0.95)', backdropFilter: 'blur(10px)', borderColor: '#1e293b', zIndex: 1040 }}
      >
        <div className="d-flex align-items-center gap-3">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary text-slate-300 d-flex align-items-center gap-1.5"
            onClick={onBack}
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div className="d-flex align-items-center gap-2">
            <div className="p-1.5 rounded-3 bg-primary text-white">
              <LifeBuoy size={20} />
            </div>
            <span className="fw-bold fs-6 text-white">Kuwy HelpDesk Pricing</span>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-link text-slate-300 text-decoration-none fw-semibold"
            onClick={onNavigateToLogin}
          >
            Sign In
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary fw-bold px-3 py-1.5 rounded-3"
            onClick={() => onSelectPlan('STARTER', billingCycle)}
          >
            Start Free Trial
          </button>
        </div>
      </header>

      {/* Hero Header */}
      <div className="container py-5 text-center" style={{ maxWidth: '980px' }}>
        <span className="badge bg-primary-subtle text-primary px-3 py-1 rounded-pill fw-bold mb-2">
          PLANS & PRICING
        </span>
        <h1 className="display-5 fw-bolder text-white mb-2 tracking-tight">
          Find the right plan for your support team
        </h1>
        <p className="lead text-slate-400 small mx-auto mb-4" style={{ maxWidth: '640px', fontSize: '1.05rem' }}>
          All plans include full 14-day risk-free trial, unlimited customer portal access, and verified email forwarding.
        </p>

        {/* Controls: Monthly/Yearly and Currency */}
        <div className="d-flex flex-wrap align-items-center justify-content-center gap-3 mb-5">
          {/* Billing Cycle Toggle */}
          <div className="p-1 rounded-pill border bg-dark d-inline-flex align-items-center" style={{ borderColor: '#334155' }}>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-3 py-1 fw-bold ${billingCycle === 'monthly' ? 'btn-primary text-white' : 'text-slate-400'}`}
              onClick={() => setBillingCycle('monthly')}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-3 py-1 fw-bold ${billingCycle === 'annual' ? 'btn-primary text-white' : 'text-slate-400'}`}
              onClick={() => setBillingCycle('annual')}
            >
              Annual Billing <span className="badge bg-warning text-dark ms-1">Save 20%</span>
            </button>
          </div>

          {/* Currency Switcher */}
          <div className="p-1 rounded-pill border bg-dark d-inline-flex align-items-center" style={{ borderColor: '#334155' }}>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-2.5 py-1 fw-bold ${currency === 'INR' ? 'btn-secondary text-white' : 'text-slate-400'}`}
              onClick={() => setCurrency('INR')}
            >
              ₹ INR
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-2.5 py-1 fw-bold ${currency === 'USD' ? 'btn-secondary text-white' : 'text-slate-400'}`}
              onClick={() => setCurrency('USD')}
            >
              $ USD
            </button>
          </div>
        </div>

        <small className="text-slate-400 d-block mb-4" style={{ fontSize: '0.8rem' }}>
          * Prices exclusive of 18% Indian GST for domestic businesses. B2B tax invoice provided with valid GSTIN.
        </small>

        {/* 3 Plan Cards */}
        <div className="row g-4 text-start justify-content-center mb-5">
          {/* FREE */}
          <div className="col-12 col-md-4">
            <div className="card h-100 p-4 rounded-4 border-0 text-white d-flex flex-column" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
              <div className="fw-bold fs-5 mb-1">Free</div>
              <p className="text-slate-400 small mb-3">For micro-teams & evaluation</p>
              <div className="display-6 fw-bolder mb-3">
                {currency === 'INR' ? '₹0' : '$0'}
              </div>
              <ul className="list-unstyled small text-slate-300 d-flex flex-column gap-2 mb-4 flex-grow-1">
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> Up to 2 Support Agents</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> 100 Tickets / month</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> Email Forwarding (Gmail & Outlook)</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> Dedicated Customer Portal</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> 1 Department (Support)</li>
              </ul>
              <button
                type="button"
                className="btn btn-outline-light w-100 fw-bold py-2 rounded-3"
                onClick={() => onSelectPlan('FREE', billingCycle)}
              >
                Start Free
              </button>
            </div>
          </div>

          {/* STARTER (Most Popular) */}
          <div className="col-12 col-md-4">
            <div
              className="card h-100 p-4 rounded-4 border-0 text-white d-flex flex-column position-relative shadow-xl"
              style={{ backgroundColor: '#1e293b', border: '2px solid #3b82f6', transform: 'scale(1.02)' }}
            >
              <span className="position-absolute top-0 start-50 translate-middle badge bg-primary text-white px-3 py-1 rounded-pill fw-bold" style={{ fontSize: '0.72rem' }}>
                MOST POPULAR
              </span>
              <div className="fw-bold fs-5 mb-1">Starter</div>
              <p className="text-slate-400 small mb-3">For growing customer support teams</p>
              <div className="display-6 fw-bolder mb-0">
                {currency === 'INR' ? (billingCycle === 'annual' ? '₹1,999' : '₹2,499') : (billingCycle === 'annual' ? '$24' : '$29')}
                <span className="fs-6 text-slate-400 fw-normal"> / mo</span>
              </div>
              <small className="text-info mb-3 d-block" style={{ fontSize: '0.75rem' }}>
                {billingCycle === 'annual' ? (currency === 'INR' ? 'Billed ₹23,988 annually (Save ₹6,000)' : 'Billed $288 annually') : 'Billed monthly'}
              </small>
              <ul className="list-unstyled small text-slate-300 d-flex flex-column gap-2 mb-4 flex-grow-1">
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-emerald-400 text-success" /> Up to 5 Support Agents</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-emerald-400 text-success" /> 1,500 Tickets / month</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-emerald-400 text-success" /> Forwarding (Gmail, Outlook & M365)</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-emerald-400 text-success" /> Custom Subdomain & Logo Branding</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-emerald-400 text-success" /> Automated SLA Policies & Breach Alerts</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-emerald-400 text-success" /> Canned Responses & Macros</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-emerald-400 text-success" /> Attachments up to 25MB</li>
              </ul>
              <button
                type="button"
                className="btn btn-primary w-100 fw-bold py-2 rounded-3 shadow-sm"
                onClick={() => onSelectPlan('STARTER', billingCycle)}
              >
                Start 14-Day Free Trial
              </button>
            </div>
          </div>

          {/* PRO */}
          <div className="col-12 col-md-4">
            <div className="card h-100 p-4 rounded-4 border-0 text-white d-flex flex-column" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
              <div className="fw-bold fs-5 mb-1">Pro</div>
              <p className="text-slate-400 small mb-3">Enterprise scale, security & API</p>
              <div className="display-6 fw-bolder mb-0">
                {currency === 'INR' ? (billingCycle === 'annual' ? '₹4,799' : '₹5,999') : (billingCycle === 'annual' ? '$59' : '$75')}
                <span className="fs-6 text-slate-400 fw-normal"> / mo</span>
              </div>
              <small className="text-info mb-3 d-block" style={{ fontSize: '0.75rem' }}>
                {billingCycle === 'annual' ? (currency === 'INR' ? 'Billed ₹57,588 annually (Save ₹14,400)' : 'Billed $708 annually') : 'Billed monthly'}
              </small>
              <ul className="list-unstyled small text-slate-300 d-flex flex-column gap-2 mb-4 flex-grow-1">
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> Up to 25 Support Agents</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> Unlimited Tickets (fair use 10,000/mo)</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> Direct M365 & Gmail OAuth Integration</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> Multi-Tier SLA Escalation Rules</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> Advanced MIS & KPI Telemetry</li>
                <li className="d-flex align-items-center gap-2"><Check size={14} className="text-primary" /> Role-Based Access & Audit Logging</li>
              </ul>
              <button
                type="button"
                className="btn btn-outline-light w-100 fw-bold py-2 rounded-3"
                onClick={() => onSelectPlan('PRO', billingCycle)}
              >
                Start Pro Trial
              </button>
            </div>
          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="text-start mt-5">
          <h3 className="fw-bold text-white mb-3 text-center">Detailed Feature Comparison</h3>
          <div className="table-responsive rounded-4 border overflow-hidden" style={{ borderColor: '#334155', backgroundColor: '#1e293b' }}>
            <table className="table table-dark table-striped table-hover mb-0 small" style={{ backgroundColor: '#1e293b' }}>
              <thead>
                <tr className="border-bottom" style={{ borderColor: '#334155' }}>
                  <th className="py-3 px-4 text-white" style={{ width: '40%' }}>Feature</th>
                  <th className="py-3 px-3 text-center text-white" style={{ width: '20%' }}>Free</th>
                  <th className="py-3 px-3 text-center text-primary fw-bold" style={{ width: '20%' }}>Starter</th>
                  <th className="py-3 px-3 text-center text-white" style={{ width: '20%' }}>Pro</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Support Agents Included</td>
                  <td className="text-center">2</td>
                  <td className="text-center text-primary fw-bold">5</td>
                  <td className="text-center">25</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Monthly Ticket Limit</td>
                  <td className="text-center">100</td>
                  <td className="text-center text-primary fw-bold">1,500</td>
                  <td className="text-center">10,000 (Fair Use)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Email Forwarding (Gmail, Outlook, M365)</td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Direct Gmail / M365 OAuth Ingestion</td>
                  <td className="text-center"><CloseIcon size={16} className="text-slate-500" /></td>
                  <td className="text-center"><CloseIcon size={16} className="text-slate-500" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Dedicated Customer Portal & OTP Login</td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Custom Subdomain (acme.helpdesk.kuwy.in)</td>
                  <td className="text-center"><CloseIcon size={16} className="text-slate-500" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">SLA Policies & Breach Warnings</td>
                  <td className="text-center"><CloseIcon size={16} className="text-slate-500" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Canned Responses & Macros</td>
                  <td className="text-center"><CloseIcon size={16} className="text-slate-500" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Multi-Department Ticket Routing</td>
                  <td className="text-center">1 Dept</td>
                  <td className="text-center text-primary fw-bold">Up to 5 Depts</td>
                  <td className="text-center">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Document Attachments (PNG, PDF, JPG)</td>
                  <td className="text-center">5MB</td>
                  <td className="text-center text-primary fw-bold">25MB</td>
                  <td className="text-center">25MB</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Anti-Spam Honeypots & Rate Limiting</td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 fw-semibold text-slate-200">Multi-Tenant Isolation & Audit Logs</td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                  <td className="text-center"><Check size={16} className="text-success" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Custom Plan Callout */}
        <div className="card mt-5 p-4 rounded-4 border-0 text-white d-flex flex-wrap flex-md-row align-items-center justify-content-between gap-3 text-start" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
          <div>
            <h5 className="fw-bold mb-1">Need more than 25 agents or custom integration?</h5>
            <p className="text-slate-400 small mb-0">
              We offer dedicated private cloud deployments, SSO SAML authentication, and custom SLAs.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline-light d-flex align-items-center gap-2 fw-semibold px-4 py-2"
            onClick={() => alert("Please email sales@kuwy.in or call our enterprise team.")}
          >
            <PhoneCall size={16} />
            <span>Contact Enterprise Sales</span>
          </button>
        </div>
      </div>
    </div>
  );
};
