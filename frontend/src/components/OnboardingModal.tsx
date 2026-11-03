import React, { useState } from 'react';
import {
  Building2, CheckCircle2, ShieldCheck, ArrowRight,
  CreditCard, Sparkles, X, Check, Mail, Lock, User as UserIcon
} from 'lucide-react';
import { apiService } from '../services/api';
import type { LoginResponse } from '../types';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (res: LoginResponse) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('Password@123');
  const [selectedPlan, setSelectedPlan] = useState<'FREE' | 'STARTER' | 'PRO'>('STARTER');
  const [selectedGateway, setSelectedGateway] = useState<'RAZORPAY' | 'STRIPE'>('RAZORPAY');

  // Payment Sim State
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvv, setCardCvv] = useState('888');

  // Loading & Error State
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubdomainChange = (val: string) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(sanitized);
  };

  const handleCompanyNameChange = (val: string) => {
    setCompanyName(val);
    if (!subdomain || subdomain === companyName.toLowerCase().replace(/[^a-z0-9-]/g, '')) {
      const autoSlug = val.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
      setSubdomain(autoSlug);
    }
  };

  const handleCompleteSignup = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await apiService.onboardCompany({
        companyName: companyName.trim(),
        subdomain: subdomain.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword: adminPassword,
        adminName: adminName.trim(),
        planTier: selectedPlan,
      });

      onSuccess(response);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message ||
        'Unable to create company workspace. Subdomain might already be taken.'
      );
      setIsLoading(false);
    }
  };

  return (
    <div
      className="modal show d-block"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 1070,
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden bg-white">
          
          {/* Header */}
          <div className="modal-header border-0 bg-light px-4 py-3 d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2.5">
              <div className="p-2 bg-primary text-white rounded-3 shadow-xs">
                <Building2 size={20} />
              </div>
              <div>
                <h5 className="modal-title fw-bold text-dark mb-0" style={{ fontSize: '1.2rem' }}>
                  Create Your HelpDesk Workspace
                </h5>
                <small className="text-secondary">Self-serve multi-tenant onboarding with instant provisioning</small>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-light border-0 rounded-circle text-secondary p-1"
              onClick={onClose}
              disabled={isLoading}
            >
              <X size={20} />
            </button>
          </div>

          {/* Stepper Indicator */}
          <div className="px-4 py-2 bg-light border-top border-bottom d-flex align-items-center justify-content-center gap-4">
            <div className={`d-flex align-items-center gap-2 small fw-bold ${step >= 1 ? 'text-primary' : 'text-muted'}`}>
              <span className={`badge rounded-pill ${step >= 1 ? 'bg-primary text-white' : 'bg-secondary text-white'}`}>1</span>
              <span>Workspace Info</span>
            </div>
            <ArrowRight size={14} className="text-muted" />
            <div className={`d-flex align-items-center gap-2 small fw-bold ${step >= 2 ? 'text-primary' : 'text-muted'}`}>
              <span className={`badge rounded-pill ${step >= 2 ? 'bg-primary text-white' : 'bg-secondary text-white'}`}>2</span>
              <span>Choose Plan</span>
            </div>
            <ArrowRight size={14} className="text-muted" />
            <div className={`d-flex align-items-center gap-2 small fw-bold ${step >= 3 ? 'text-primary' : 'text-muted'}`}>
              <span className={`badge rounded-pill ${step >= 3 ? 'bg-primary text-white' : 'bg-secondary text-white'}`}>3</span>
              <span>Checkout & Activate</span>
            </div>
          </div>

          {/* Body */}
          <div className="modal-body p-4">
            {errorMessage && (
              <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3">
                {errorMessage}
              </div>
            )}

            {/* STEP 1: Workspace Details */}
            {step === 1 && (
              <form onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold text-secondary">Company / Organization Name *</label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0 text-muted"><Building2 size={16} /></span>
                      <input
                        type="text"
                        className="form-control border-start-0"
                        placeholder="e.g. Acme Corp"
                        required
                        value={companyName}
                        onChange={(e) => handleCompanyNameChange(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold text-secondary">Workspace Subdomain *</label>
                    <div className="input-group">
                      <input
                        type="text"
                        className="form-control text-end pe-1 fw-bold text-primary"
                        placeholder="acme"
                        required
                        value={subdomain}
                        onChange={(e) => handleSubdomainChange(e.target.value)}
                      />
                      <span className="input-group-text bg-light ps-1 text-muted small">.yourhelpdesk.com</span>
                    </div>
                    <small className="text-muted" style={{ fontSize: '0.74rem' }}>
                      Access route: http://localhost:5174/{subdomain || 'acme'}/admin
                    </small>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold text-secondary">Admin Full Name *</label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0 text-muted"><UserIcon size={16} /></span>
                      <input
                        type="text"
                        className="form-control border-start-0"
                        placeholder="e.g. Seetha Raman"
                        required
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold text-secondary">Admin Email Address *</label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0 text-muted"><Mail size={16} /></span>
                      <input
                        type="email"
                        className="form-control border-start-0"
                        placeholder="admin@acme.com"
                        required
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold text-secondary">Admin Password *</label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0 text-muted"><Lock size={16} /></span>
                      <input
                        type="password"
                        className="form-control border-start-0"
                        placeholder="••••••••••••"
                        required
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                      />
                    </div>
                    <small className="text-muted" style={{ fontSize: '0.74rem' }}>
                      Default test password: Password@123
                    </small>
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-4 pt-2 border-top">
                  <button type="button" className="btn btn-light px-3" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary px-4 fw-semibold d-flex align-items-center gap-1.5"
                    disabled={!companyName.trim() || !subdomain.trim() || !adminEmail.trim()}
                  >
                    <span>Continue to Plan Selection</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: Choose Plan */}
            {step === 2 && (
              <div>
                <div className="row g-3">
                  {/* Plan: FREE */}
                  <div className="col-12 col-md-4">
                    <div
                      className={`card h-100 p-3 rounded-4 cursor-pointer border-2 transition-all ${selectedPlan === 'FREE' ? 'border-primary bg-primary-subtle shadow-sm' : 'border-light-subtle bg-white'}`}
                      onClick={() => setSelectedPlan('FREE')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-secondary">Free Tier</span>
                        {selectedPlan === 'FREE' && <CheckCircle2 size={18} className="text-primary" />}
                      </div>
                      <h4 className="fw-bold mb-0 text-dark">₹0</h4>
                      <small className="text-muted">Forever free</small>
                      <hr className="my-2" />
                      <ul className="list-unstyled small text-secondary d-flex flex-column gap-1.5 mb-0">
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> 2 Support Agents
                        </li>
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> 100 Tickets / month
                        </li>
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> Email Forwarding
                        </li>
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> Public Customer Portal
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Plan: STARTER */}
                  <div className="col-12 col-md-4">
                    <div
                      className={`card h-100 p-3 rounded-4 cursor-pointer border-2 transition-all position-relative ${selectedPlan === 'STARTER' ? 'border-primary bg-primary-subtle shadow-sm' : 'border-light-subtle bg-white'}`}
                      onClick={() => setSelectedPlan('STARTER')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="position-absolute top-0 end-0 mt-2 me-2">
                        <span className="badge bg-primary text-white">Most Popular</span>
                      </div>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-info text-dark">Starter</span>
                        {selectedPlan === 'STARTER' && <CheckCircle2 size={18} className="text-primary" />}
                      </div>
                      <h4 className="fw-bold mb-0 text-dark">₹2,499</h4>
                      <small className="text-muted">Billed monthly</small>
                      <hr className="my-2" />
                      <ul className="list-unstyled small text-secondary d-flex flex-column gap-1.5 mb-0">
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> 5 Support Agents
                        </li>
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> 1,000 Tickets / month
                        </li>
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> SLA & Auto-Assignment
                        </li>
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> Canned Responses (#)
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Plan: PRO */}
                  <div className="col-12 col-md-4">
                    <div
                      className={`card h-100 p-3 rounded-4 cursor-pointer border-2 transition-all ${selectedPlan === 'PRO' ? 'border-primary bg-primary-subtle shadow-sm' : 'border-light-subtle bg-white'}`}
                      onClick={() => setSelectedPlan('PRO')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-warning text-dark">Enterprise Pro</span>
                        {selectedPlan === 'PRO' && <CheckCircle2 size={18} className="text-primary" />}
                      </div>
                      <h4 className="fw-bold mb-0 text-dark">₹5,999</h4>
                      <small className="text-muted">Billed monthly</small>
                      <hr className="my-2" />
                      <ul className="list-unstyled small text-secondary d-flex flex-column gap-1.5 mb-0">
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> 25 Support Agents
                        </li>
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> 5,000 Tickets / month
                        </li>
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> MS 365 / Google OAuth
                        </li>
                        <li className="d-flex align-items-center gap-1.5">
                          <Check size={14} className="text-success" /> Custom SLA & Dedicated DB
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="d-flex justify-content-between gap-2 mt-4 pt-2 border-top">
                  <button type="button" className="btn btn-light px-3" onClick={() => setStep(1)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary px-4 fw-semibold d-flex align-items-center gap-1.5"
                    onClick={() => {
                      if (selectedPlan === 'FREE') {
                        handleCompleteSignup();
                      } else {
                        setStep(3);
                      }
                    }}
                  >
                    <span>{selectedPlan === 'FREE' ? 'Activate Free Workspace' : 'Continue to Payment'}</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Payment Checkout Simulator */}
            {step === 3 && (
              <div>
                <div className="row g-3">
                  <div className="col-12 col-md-5">
                    <div className="p-3 bg-light rounded-4 border">
                      <span className="small text-muted text-uppercase fw-bold">Plan Summary</span>
                      <h5 className="fw-bold text-dark mt-1">{selectedPlan === 'PRO' ? 'Enterprise Pro Tier' : 'Starter Tier'}</h5>
                      <div className="d-flex justify-content-between small text-secondary py-1 border-bottom">
                        <span>Workspace:</span>
                        <strong className="text-dark">{subdomain}.yourhelpdesk.com</strong>
                      </div>
                      <div className="d-flex justify-content-between small text-secondary py-1 border-bottom">
                        <span>Billing Cycle:</span>
                        <strong className="text-dark">Monthly Recurring</strong>
                      </div>
                      <div className="d-flex justify-content-between small text-secondary py-1 border-bottom">
                        <span>Support Seats:</span>
                        <strong className="text-dark">{selectedPlan === 'PRO' ? '25 Agents' : '5 Agents'}</strong>
                      </div>
                      <div className="d-flex justify-content-between align-items-center mt-3 pt-2">
                        <span className="fw-bold text-dark">Total Due Now:</span>
                        <span className="fs-5 fw-extrabold text-primary">
                          {selectedPlan === 'PRO' ? '₹5,999' : '₹2,499'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="col-12 col-md-7">
                    <label className="form-label small fw-semibold text-secondary">Choose Payment Gateway</label>
                    <div className="d-flex gap-2 mb-3">
                      <button
                        type="button"
                        className={`btn flex-fill py-2 text-start border-2 ${selectedGateway === 'RAZORPAY' ? 'btn-outline-primary border-primary bg-primary-subtle' : 'btn-outline-secondary'}`}
                        onClick={() => setSelectedGateway('RAZORPAY')}
                      >
                        <div className="fw-bold text-dark" style={{ fontSize: '0.88rem' }}>Razorpay (India)</div>
                        <small className="text-muted">UPI, Netbanking, Rupay/Visa</small>
                      </button>

                      <button
                        type="button"
                        className={`btn flex-fill py-2 text-start border-2 ${selectedGateway === 'STRIPE' ? 'btn-outline-primary border-primary bg-primary-subtle' : 'btn-outline-secondary'}`}
                        onClick={() => setSelectedGateway('STRIPE')}
                      >
                        <div className="fw-bold text-dark" style={{ fontSize: '0.88rem' }}>Stripe (Global)</div>
                        <small className="text-muted">Cards, Apple Pay, Int'l Wire</small>
                      </button>
                    </div>

                    <div className="p-3 border rounded-3 bg-white">
                      <label className="form-label small fw-semibold text-muted mb-1">Simulated Card Details</label>
                      <div className="input-group mb-2">
                        <span className="input-group-text bg-light text-muted"><CreditCard size={16} /></span>
                        <input
                          type="text"
                          className="form-control"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                        />
                      </div>
                      <div className="row g-2">
                        <div className="col-6">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="MM/YY"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                          />
                        </div>
                        <div className="col-6">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="CVV"
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="small text-success mt-2 d-flex align-items-center gap-1">
                        <ShieldCheck size={14} /> 256-bit SSL encrypted sandbox transaction
                      </div>
                    </div>
                  </div>
                </div>

                <div className="d-flex justify-content-between gap-2 mt-4 pt-2 border-top">
                  <button type="button" className="btn btn-light px-3" onClick={() => setStep(2)} disabled={isLoading}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-success px-4 fw-bold shadow-sm d-flex align-items-center gap-2"
                    onClick={handleCompleteSignup}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        <span>Provisioning Workspace...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Pay & Launch Workspace</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
