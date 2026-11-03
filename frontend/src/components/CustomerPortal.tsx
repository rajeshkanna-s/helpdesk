import React, { useState, useEffect } from 'react';
import {
  LifeBuoy, Send, Search, CheckCircle2,
  Paperclip, FileText, Image as ImageIcon, Download, Eye, File,
  ArrowLeft, Clock, ShieldCheck, LogOut, Sparkles, Building2,
  RefreshCw, RotateCcw
} from 'lucide-react';
import { apiService } from '../services/api';
import type { Company, Department, Ticket, TicketThread, TicketAttachment } from '../types';

interface CustomerPortalProps {
  companySlug: string;
  onNavigateToAdmin?: (slug: string) => void;
  onNavigateToSuperAdmin?: () => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  companySlug,
  onNavigateToAdmin,
  onNavigateToSuperAdmin,
}) => {
  const [company, setCompany] = useState<Company | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Customer Authentication State
  const [customerEmail, setCustomerEmail] = useState<string>(() => {
    return localStorage.getItem('kuwy_cust_email') || 'loan.applicant@gmail.com';
  });
  const [customerName, setCustomerName] = useState<string>(() => {
    return localStorage.getItem('kuwy_cust_name') || 'Rajesh Kannan';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem('kuwy_cust_email');
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authStep, setAuthStep] = useState<'input' | 'otp'>('input');
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  // Active View Tab: 'home' | 'submit' | 'tickets' | 'ticket-detail'
  const [activeTab, setActiveTab] = useState<'home' | 'submit' | 'tickets' | 'ticket-detail'>('home');
  const [searchQuery, setSearchQuery] = useState('');

  // Submit Ticket Form State
  const [subject, setSubject] = useState('');
  const [deptId, setDeptId] = useState<number>(1);
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<Ticket | null>(null);

  // My Tickets State
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketThreads, setTicketThreads] = useState<TicketThread[]>([]);
  const [customerReplyText, setCustomerReplyText] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [isReplying, setIsReplying] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<TicketAttachment | null>(null);

  // Load Portal Info
  useEffect(() => {
    loadPortalData();
  }, [companySlug]);

  const loadPortalData = async () => {
    setLoading(true);
    try {
      const data = await apiService.getPortalInfo(companySlug);
      setCompany({
        id: data.companyId,
        name: data.companyName,
        companyCode: data.companyCode,
        subdomain: data.subdomain,
        primaryColor: data.primaryColor || '#0d6efd',
        status: 'ACTIVE',
        planName: 'ENTERPRISE',
        logoUrl: data.logoUrl
      });
      setDepartments(data.departments || []);
      if (data.departments && data.departments.length > 0) {
        setDeptId(data.departments[0].id);
      }
    } catch {
      // Fallback
      setCompany({
        id: 1,
        name: companySlug.toUpperCase() + ' Customer Support',
        companyCode: companySlug.toUpperCase(),
        subdomain: companySlug,
        primaryColor: '#0d6efd',
        status: 'ACTIVE',
        planName: 'PRO'
      });
    } finally {
      setLoading(false);
    }
  };

  // Load Customer's Tickets
  useEffect(() => {
    if (isAuthenticated && customerEmail && (activeTab === 'tickets' || activeTab === 'home')) {
      loadCustomerTickets();
    }
  }, [isAuthenticated, customerEmail, activeTab]);

  const loadCustomerTickets = async () => {
    try {
      const list = await apiService.getCustomerPortalTickets(companySlug, customerEmail);
      setMyTickets(list);
    } catch {
      setMyTickets([]);
    }
  };

  // Open Ticket Details
  const handleOpenTicketDetail = async (t: Ticket) => {
    setSelectedTicket(t);
    setActiveTab('ticket-detail');
    try {
      const full = await apiService.getCustomerPortalTicketDetail(companySlug, t.ticketNumber, customerEmail);
      setSelectedTicket(full);
      setTicketThreads(full.threads || []);
    } catch {
      // fallback
      setTicketThreads(t.threads || []);
    }
  };

  // Handle OTP Request
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail.trim()) return;
    try {
      await apiService.requestPortalOtp(companySlug, customerEmail);
      setAuthStep('otp');
      setOtpNotice('Verification code 123456 sent to ' + customerEmail);
    } catch {
      setAuthStep('otp');
      setOtpNotice('Use testing code 123456');
    }
  };

  // Handle OTP Verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.verifyPortalOtp(companySlug, customerEmail, otpCode);
      localStorage.setItem('kuwy_cust_email', customerEmail);
      localStorage.setItem('kuwy_cust_name', customerName);
      setIsAuthenticated(true);
      setShowAuthModal(false);
      setAuthStep('input');
      loadCustomerTickets();
    } catch {
      alert('Invalid code. Please enter 123456.');
    }
  };

  // Social Login Mock
  const handleSocialLogin = (provider: 'Google' | 'Microsoft') => {
    const mockEmail = `user.${provider.toLowerCase()}@example.com`;
    const mockName = `${provider} Verified User`;
    setCustomerEmail(mockEmail);
    setCustomerName(mockName);
    localStorage.setItem('kuwy_cust_email', mockEmail);
    localStorage.setItem('kuwy_cust_name', mockName);
    setIsAuthenticated(true);
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('kuwy_cust_email');
    localStorage.removeItem('kuwy_cust_name');
    setIsAuthenticated(false);
    setMyTickets([]);
    if (activeTab === 'tickets' || activeTab === 'ticket-detail') {
      setActiveTab('home');
    }
  };

  // Handle Ticket Submit
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail.trim() || !subject.trim() || !description.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await apiService.submitPortalTicket(companySlug, {
        requesterName: customerName || customerEmail.split('@')[0],
        requesterEmail: customerEmail,
        departmentId: deptId,
        subject,
        description,
        priority
      });

      // Upload attachments if present
      if (created?.id && attachments.length > 0) {
        try {
          await apiService.uploadTicketAttachments(created.id, attachments);
        } catch (attErr) {
          console.error("Attachments upload error", attErr);
        }
      }

      setSubmitSuccess(created);
      setSubject('');
      setDescription('');
      setAttachments([]);
      loadCustomerTickets();
    } catch (err: any) {
      alert('Error creating ticket: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Customer Reply
  const handleSendCustomerReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerReplyText.trim() || !selectedTicket) return;

    setIsReplying(true);
    try {
      const replyThread = await apiService.sendCustomerPortalReply(
        companySlug,
        selectedTicket.ticketNumber,
        customerEmail,
        customerReplyText
      );

      // Upload attachments if present
      if (replyAttachments.length > 0) {
        try {
          const uploaded = await apiService.uploadTicketAttachments(selectedTicket.id, replyAttachments, replyThread.id);
          replyThread.attachments = uploaded;
        } catch (attErr) {
          console.error("Failed to upload reply attachments", attErr);
        }
      }

      setTicketThreads(prev => [...prev, replyThread]);
      setCustomerReplyText('');
      setReplyAttachments([]);
    } catch (err: any) {
      alert('Failed to send reply: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsReplying(false);
    }
  };

  // Handle Reopen
  const handleReopenTicket = async () => {
    if (!selectedTicket) return;
    try {
      const updated = await apiService.reopenCustomerPortalTicket(companySlug, selectedTicket.ticketNumber);
      setSelectedTicket(updated);
      alert(`Ticket #${selectedTicket.ticketNumber} reopened successfully.`);
    } catch (err: any) {
      alert('Failed to reopen ticket');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isImageFile = (fileName: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName);
  const isPdfFile = (fileName: string) => /\.pdf$/i.test(fileName);

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
        <div className="text-center">
          <RefreshCw size={28} className="spin text-primary mb-2" />
          <h6 className="text-muted">Loading Support Portal...</h6>
        </div>
      </div>
    );
  }

  const primaryColor = company?.primaryColor || '#0d6efd';

  return (
    <div className="min-vh-100 d-flex flex-column bg-light font-sans">

      {/* TOP NOTIFICATION / NAVIGATION SWITCHER BAR */}
      <div className="py-1 px-3 bg-dark text-white d-flex justify-content-between align-items-center" style={{ fontSize: '0.78rem' }}>
        <div className="d-flex align-items-center gap-2">
          <span className="badge bg-primary fw-bold" style={{ fontSize: '0.65rem' }}>PUBLIC PORTAL</span>
          <span className="text-white-50">Viewing customer support page for <strong>{company?.name}</strong></span>
        </div>
        <div className="d-flex align-items-center gap-2">
          {onNavigateToAdmin && (
            <button
              type="button"
              className="btn btn-sm btn-outline-light py-0 px-2 fw-semibold"
              style={{ fontSize: '0.72rem' }}
              onClick={() => onNavigateToAdmin(companySlug)}
            >
              <Building2 size={11} className="inline me-1" />
              Agent & Admin Login
            </button>
          )}
          {onNavigateToSuperAdmin && (
            <button
              type="button"
              className="btn btn-sm btn-outline-warning py-0 px-2 fw-semibold"
              style={{ fontSize: '0.72rem' }}
              onClick={onNavigateToSuperAdmin}
            >
              <ShieldCheck size={11} className="inline me-1" />
              Admin Console
            </button>
          )}
        </div>
      </div>

      {/* HEADER NAVBAR */}
      <header className="bg-white border-bottom sticky-top shadow-xs">
        <div className="container py-3 d-flex justify-content-between align-items-center">
          {/* Brand */}
          <div
            className="d-flex align-items-center gap-2.5 cursor-pointer"
            onClick={() => { setActiveTab('home'); setSubmitSuccess(null); }}
            style={{ cursor: 'pointer' }}
          >
            <div
              className="rounded-3 d-flex align-items-center justify-content-center text-white fw-bold shadow-xs"
              style={{ width: '40px', height: '40px', backgroundColor: primaryColor }}
            >
              <LifeBuoy size={22} />
            </div>
            <div>
              <h5 className="mb-0 fw-bold text-dark" style={{ letterSpacing: '-0.01em' }}>
                {company?.name}
              </h5>
              <small className="text-muted" style={{ fontSize: '0.76rem' }}>Customer Help & Resolution Desk</small>
            </div>
          </div>

          {/* Nav Links */}
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className={`btn btn-sm rounded-3 fw-semibold ${activeTab === 'home' ? 'btn-light text-dark fw-bold' : 'btn-link text-secondary text-decoration-none'}`}
              onClick={() => { setActiveTab('home'); setSubmitSuccess(null); }}
            >
              Home / KB
            </button>

            <button
              type="button"
              className={`btn btn-sm rounded-3 fw-semibold ${activeTab === 'submit' ? 'btn-primary shadow-xs' : 'btn-outline-primary'}`}
              onClick={() => { setActiveTab('submit'); setSubmitSuccess(null); }}
            >
              <Send size={13} className="inline me-1" />
              Submit a Ticket
            </button>

            <button
              type="button"
              className={`btn btn-sm rounded-3 fw-semibold position-relative ${activeTab === 'tickets' ? 'btn-light text-primary fw-bold' : 'btn-link text-secondary text-decoration-none'}`}
              onClick={() => {
                if (!isAuthenticated) {
                  setShowAuthModal(true);
                } else {
                  setActiveTab('tickets');
                  setSubmitSuccess(null);
                }
              }}
            >
              My Tickets
              {myTickets.length > 0 && (
                <span className="badge bg-primary rounded-pill ms-1.5" style={{ fontSize: '0.65rem' }}>
                  {myTickets.length}
                </span>
              )}
            </button>

            {/* Customer Session */}
            {isAuthenticated ? (
              <div className="dropdown">
                <button
                  type="button"
                  className="btn btn-sm btn-light border rounded-pill px-3 py-1 d-flex align-items-center gap-2"
                  onClick={handleLogout}
                  title="Click to sign out"
                >
                  <div className="rounded-circle bg-primary-subtle text-primary fw-bold" style={{ width: '22px', height: '22px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {customerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="small fw-semibold text-dark text-truncate" style={{ maxWidth: '120px' }}>
                    {customerName}
                  </span>
                  <LogOut size={13} className="text-muted" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold"
                onClick={() => setShowAuthModal(true)}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* HERO BANNER */}
      {activeTab === 'home' && (
        <section
          className="text-white py-5 text-center position-relative shadow-sm"
          style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #1e293b 100%)` }}
        >
          <div className="container" style={{ maxWidth: '720px' }}>
            <span className="badge bg-white text-dark fw-bold mb-2 shadow-xs" style={{ fontSize: '0.75rem' }}>
              Official Customer Support
            </span>
            <h2 className="fw-bolder mb-2 text-white" style={{ letterSpacing: '-0.02em' }}>
              How can we assist you today?
            </h2>
            <p className="text-white-50 mb-4" style={{ fontSize: '0.95rem' }}>
              Search knowledge solutions, track open inquiries, or submit a request directly to our verified engineers.
            </p>

            {/* Knowledge Base Search Box */}
            <div className="position-relative mx-auto" style={{ maxWidth: '560px' }}>
              <Search size={18} className="position-absolute text-muted" style={{ top: '14px', left: '16px' }} />
              <input
                type="text"
                className="form-control form-control-lg rounded-pill ps-5 pe-4 shadow-lg border-0"
                style={{ fontSize: '0.95rem' }}
                placeholder="Search solutions, CIBIL pull issues, loan disbursement FAQs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </section>
      )}

      {/* MAIN CONTAINER */}
      <main className="container py-4 flex-grow-1" style={{ maxWidth: '1100px' }}>

        {/* ==============================================================
            TAB 1: HOME & KNOWLEDGE BASE
            ============================================================== */}
        {activeTab === 'home' && (
          <div>
            <div className="row g-4 mb-4">
              <div className="col-md-6">
                <div
                  className="card border-0 shadow-sm rounded-4 p-4 h-100 cursor-pointer hover-shadow transition-all bg-white"
                  onClick={() => { setActiveTab('submit'); setSubmitSuccess(null); }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <div className="p-3 rounded-3 bg-primary-subtle text-primary">
                      <Send size={24} />
                    </div>
                    <div>
                      <h5 className="fw-bold mb-0 text-dark">Submit a New Ticket</h5>
                      <small className="text-muted">Direct intake to category-specific engineers</small>
                    </div>
                  </div>
                  <p className="text-secondary small mb-3">
                    Raise an inquiry with documents, loan contracts, proof receipts, or error logs. You will get an immediate ticket tracking number e.g. <code>#KUWY-1042</code>.
                  </p>
                  <span className="text-primary fw-bold small d-inline-flex align-items-center gap-1">
                    Open submission form →
                  </span>
                </div>
              </div>

              <div className="col-md-6">
                <div
                  className="card border-0 shadow-sm rounded-4 p-4 h-100 cursor-pointer hover-shadow transition-all bg-white"
                  onClick={() => {
                    if (!isAuthenticated) setShowAuthModal(true);
                    else setActiveTab('tickets');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <div className="p-3 rounded-3 bg-success-subtle text-success">
                      <Clock size={24} />
                    </div>
                    <div>
                      <h5 className="fw-bold mb-0 text-dark">Track Your Tickets</h5>
                      <small className="text-muted">Check live status, SLAs and engineer replies</small>
                    </div>
                  </div>
                  <p className="text-secondary small mb-3">
                    Access your conversation threads, download attachments sent by our team, reply with more details, or reopen resolved requests.
                  </p>
                  <span className="text-success fw-bold small d-inline-flex align-items-center gap-1">
                    {isAuthenticated ? `View your ${myTickets.length} ticket(s) →` : 'Sign in to track →'}
                  </span>
                </div>
              </div>
            </div>

            {/* Knowledge Base Articles */}
            <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                  <Sparkles size={16} className="text-warning" />
                  <span>Popular Solutions & Guides</span>
                </h6>
                <span className="badge bg-light text-secondary border">Self-Service</span>
              </div>

              <div className="row g-3">
                {[
                  {
                    title: 'How to resolve CIBIL score pull timeouts on Dealer Portal',
                    category: 'IT & Engineering Support',
                    desc: 'Step-by-step walkthrough to re-authenticate bureau API keys and check partner status.'
                  },
                  {
                    title: 'Required documents for same-day loan disbursal verification',
                    category: 'Loan Origination & Ops',
                    desc: 'List of accepted KYC proofs, bank statements, and digital sign contracts.'
                  },
                  {
                    title: 'Troubleshooting partner LMS webhook notifications',
                    category: 'IT & Engineering Support',
                    desc: 'Ensuring your endpoint returns HTTP 200 within 5 seconds to avoid retry pauses.'
                  },
                  {
                    title: 'Dealer commission settlement cycle & invoice guidelines',
                    category: 'Finance & Invoicing',
                    desc: 'Bi-monthly payout timelines, GST invoice uploads, and reconciliation statements.'
                  }
                ].filter(a => !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase())).map((item, idx) => (
                  <div key={idx} className="col-md-6">
                    <div className="p-3 border rounded-3 bg-light hover-bg-white transition-all h-100">
                      <span className="badge bg-white text-primary border mb-1.5" style={{ fontSize: '0.68rem' }}>
                        {item.category}
                      </span>
                      <h6 className="fw-semibold text-dark small mb-1">{item.title}</h6>
                      <p className="text-muted mb-0" style={{ fontSize: '0.78rem' }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==============================================================
            TAB 2: SUBMIT TICKET FORM
            ============================================================== */}
        {activeTab === 'submit' && (
          <div className="mx-auto" style={{ maxWidth: '780px' }}>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <button
                type="button"
                className="btn btn-sm btn-link text-secondary text-decoration-none p-0 d-flex align-items-center gap-1"
                onClick={() => { setActiveTab('home'); setSubmitSuccess(null); }}
              >
                <ArrowLeft size={15} /> Back to Home
              </button>
              <span className="small text-muted">All inquiries are logged with strict SLA timers</span>
            </div>

            {submitSuccess ? (
              <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white animate-fade-in">
                <div className="rounded-circle bg-success-subtle text-success mx-auto d-flex align-items-center justify-content-center mb-3" style={{ width: '64px', height: '64px' }}>
                  <CheckCircle2 size={36} />
                </div>
                <h4 className="fw-bolder text-dark mb-1">Ticket Submitted Successfully!</h4>
                <p className="text-muted small mb-3">
                  Your request has been registered and auto-assigned to our engineering team.
                </p>

                <div className="p-3 bg-light rounded-3 border mx-auto mb-4" style={{ maxWidth: '420px' }}>
                  <div className="small text-secondary mb-1">Your Unique Tracking Number</div>
                  <h3 className="fw-bolder text-primary mb-1">#{submitSuccess.ticketNumber}</h3>
                  <div className="small text-muted">Subject: "{submitSuccess.subject}"</div>
                </div>

                <div className="d-flex justify-content-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary px-4 fw-semibold rounded-3 shadow-sm"
                    onClick={() => handleOpenTicketDetail(submitSuccess)}
                  >
                    View Conversation & Status
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary px-4 fw-semibold rounded-3"
                    onClick={() => { setSubmitSuccess(null); setActiveTab('submit'); }}
                  >
                    Submit Another Request
                  </button>
                </div>
              </div>
            ) : (
              <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <div className="border-bottom pb-3 mb-4">
                  <h5 className="fw-bolder text-dark mb-1">Create Support Ticket</h5>
                  <p className="text-muted small mb-0">
                    Fill in the details below. Our support agents respond in accordance with your category SLA.
                  </p>
                </div>

                <form onSubmit={handleSubmitTicket}>
                  {/* Requester Identity */}
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-dark">Your Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. Rajesh Kannan"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-dark">Your Email Address *</label>
                      <input
                        type="email"
                        className="form-control"
                        required
                        placeholder="e.g. loan.applicant@gmail.com"
                        value={customerEmail}
                        onChange={e => setCustomerEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Category & Priority */}
                  <div className="row g-3 mb-3">
                    <div className="col-md-7">
                      <label className="form-label small fw-bold text-dark">Category / Department *</label>
                      <select
                        className="form-select"
                        value={deptId}
                        onChange={e => setDeptId(Number(e.target.value))}
                      >
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-5">
                      <label className="form-label small fw-bold text-dark">Priority *</label>
                      <select
                        className="form-select"
                        value={priority}
                        onChange={e => setPriority(e.target.value as any)}
                      >
                        <option value="LOW">Low (Standard Question)</option>
                        <option value="MEDIUM">Medium (General Support)</option>
                        <option value="HIGH">High (Urgent Escalation)</option>
                        <option value="URGENT">Critical (Service Outage)</option>
                      </select>
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-dark">Ticket Subject *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. Unable to complete biometric KYC verification for loan contract"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                    />
                  </div>

                  {/* Description */}
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-dark">Detailed Description *</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      required
                      placeholder="Please explain the steps leading to the issue, error codes, and contract or customer reference number..."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                    />
                  </div>

                  {/* Attachments Dropzone (PNG, PDF, JPG, JPEG, TXT) */}
                  <div className="mb-4">
                    <label className="form-label small fw-bold text-dark d-flex justify-content-between align-items-center mb-1">
                      <span className="d-flex align-items-center gap-1.5">
                        <Paperclip size={14} className="text-primary" />
                        <span>Attach Documents (PNG, PDF, JPG, JPEG, TXT)</span>
                      </span>
                      <span className="text-muted fw-normal" style={{ fontSize: '0.72rem' }}>
                        Max 25MB per file
                      </span>
                    </label>

                    <div
                      className="border border-dashed rounded-3 p-3 text-center bg-light cursor-pointer hover-bg-white transition-all"
                      style={{ borderColor: '#cbd5e1', cursor: 'pointer' }}
                      onClick={() => document.getElementById('public-portal-file-input')?.click()}
                    >
                      <Paperclip size={20} className="text-primary mb-1 inline" />
                      <div className="small fw-semibold text-dark">Click to browse or drop files here</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        Attach screenshots, PDF bank statements, or logs
                      </div>
                      <input
                        id="public-portal-file-input"
                        type="file"
                        multiple
                        accept=".png,.jpg,.jpeg,.pdf,.txt,.doc,.docx,.xls,.xlsx,.csv"
                        className="d-none"
                        onChange={e => {
                          if (e.target.files) {
                            setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                          }
                        }}
                      />
                    </div>

                    {attachments.length > 0 && (
                      <div className="d-flex flex-wrap gap-2 mt-2.5">
                        {attachments.map((f, idx) => (
                          <span
                            key={idx}
                            className="badge bg-white text-dark border px-2.5 py-1.5 rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs"
                            style={{ fontSize: '0.78rem' }}
                          >
                            {isImageFile(f.name) ? (
                              <ImageIcon size={13} className="text-info" />
                            ) : isPdfFile(f.name) ? (
                              <FileText size={13} className="text-danger" />
                            ) : (
                              <File size={13} className="text-primary" />
                            )}
                            <span className="text-truncate" style={{ maxWidth: '160px' }}>{f.name}</span>
                            <span className="text-muted" style={{ fontSize: '0.7rem' }}>({formatFileSize(f.size)})</span>
                            <button
                              type="button"
                              className="btn-close ms-1"
                              style={{ fontSize: '0.55rem' }}
                              onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="d-flex justify-content-between align-items-center pt-3 border-top">
                    <small className="text-muted">
                      🔒 Your data is protected by multi-tenant workspace isolation.
                    </small>
                    <button
                      type="submit"
                      className="btn btn-primary px-4 py-2 fw-semibold rounded-3 shadow-sm d-flex align-items-center gap-1.5"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? <RefreshCw size={14} className="spin" /> : <Send size={14} />}
                      <span>{isSubmitting ? 'Submitting Ticket...' : 'Submit Support Request'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ==============================================================
            TAB 3: MY TICKETS LIST
            ============================================================== */}
        {activeTab === 'tickets' && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 className="fw-bolder text-dark mb-0">Your Support Tickets</h5>
                <small className="text-muted">Inquiries registered for <code>{customerEmail}</code></small>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary rounded-3 fw-semibold shadow-xs"
                onClick={() => { setActiveTab('submit'); setSubmitSuccess(null); }}
              >
                + Raise New Request
              </button>
            </div>

            {myTickets.length === 0 ? (
              <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white">
                <Clock size={40} className="text-muted mx-auto mb-2" />
                <h6 className="fw-bold text-dark">No Tickets Found</h6>
                <p className="text-muted small mb-3">You have not submitted any inquiries under {customerEmail}.</p>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary mx-auto"
                  onClick={() => setActiveTab('submit')}
                >
                  Submit Your First Ticket
                </button>
              </div>
            ) : (
              <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light small text-secondary">
                      <tr>
                        <th className="ps-4">Ticket</th>
                        <th>Subject</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Created</th>
                        <th className="text-end pe-4">Action</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontSize: '0.86rem' }}>
                      {myTickets.map(t => (
                        <tr
                          key={t.id}
                          className="cursor-pointer"
                          onClick={() => handleOpenTicketDetail(t)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="ps-4 fw-bold text-primary">#{t.ticketNumber}</td>
                          <td>
                            <div className="fw-semibold text-dark text-truncate" style={{ maxWidth: '320px' }}>
                              {t.subject}
                            </div>
                          </td>
                          <td>
                            <span className="badge bg-light text-secondary border">
                              {t.department?.name || 'Support'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge-status badge-${t.status.toLowerCase()}`}>
                              {t.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td>
                            <span className={`badge-status badge-${t.priority.toLowerCase()}`}>
                              {t.priority}
                            </span>
                          </td>
                          <td className="text-muted small">
                            {new Date(t.createdAt).toLocaleDateString()}
                          </td>
                          <td className="text-end pe-4">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary py-1 px-2.5 rounded-3 fw-semibold small"
                              onClick={(e) => { e.stopPropagation(); handleOpenTicketDetail(t); }}
                            >
                              View Thread →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==============================================================
            TAB 4: TICKET DETAILS & CONVERSATION THREAD
            ============================================================== */}
        {activeTab === 'ticket-detail' && selectedTicket && (
          <div className="mx-auto" style={{ maxWidth: '850px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <button
                type="button"
                className="btn btn-sm btn-link text-secondary text-decoration-none p-0 d-flex align-items-center gap-1"
                onClick={() => setActiveTab('tickets')}
              >
                <ArrowLeft size={15} /> Back to My Tickets
              </button>

              <div className="d-flex align-items-center gap-2">
                <span className={`badge-status badge-${selectedTicket.status.toLowerCase()}`}>
                  {selectedTicket.status.replace(/_/g, ' ')}
                </span>
                {selectedTicket.status === 'RESOLVED' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-warning d-flex align-items-center gap-1 py-1 px-2.5 rounded-3 fw-semibold"
                    onClick={handleReopenTicket}
                  >
                    <RotateCcw size={12} />
                    <span>Reopen Ticket</span>
                  </button>
                )}
              </div>
            </div>

            {/* Ticket Header Card */}
            <div className="card border-0 shadow-sm rounded-4 p-4 bg-white mb-3">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span className="badge bg-primary text-white fw-bold mb-1.5" style={{ fontSize: '0.72rem' }}>
                    #{selectedTicket.ticketNumber}
                  </span>
                  <h5 className="fw-bolder text-dark mb-1">{selectedTicket.subject}</h5>
                  <div className="small text-muted">
                    Category: <strong>{selectedTicket.department?.name}</strong> • Priority: <strong>{selectedTicket.priority}</strong> • Submitted: {new Date(selectedTicket.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Conversation Stream */}
            <div className="d-flex flex-column gap-3 mb-4">
              {ticketThreads.map((th, idx) => (
                <div
                  key={th.id || idx}
                  className={`card border-0 shadow-xs rounded-4 p-3.5 ${th.senderType === 'CUSTOMER' ? 'bg-white border-start border-4 border-primary' : 'bg-white border-start border-4 border-success'}`}
                >
                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                    <div className="d-flex align-items-center gap-2">
                      <span className={`badge ${th.senderType === 'CUSTOMER' ? 'bg-primary-subtle text-primary' : 'bg-success-subtle text-success'}`}>
                        {th.senderType === 'CUSTOMER' ? 'You (Customer)' : 'Support Engineer'}
                      </span>
                      <strong className="text-dark small">{th.fromName}</strong>
                    </div>
                    <small className="text-muted">
                      {th.createdAt ? new Date(th.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recent'}
                    </small>
                  </div>

                  <div
                    className="text-dark small mb-2"
                    dangerouslySetInnerHTML={{ __html: th.bodyHtml || `<p>${th.bodyText}</p>` }}
                  />

                  {/* Thread Attachments */}
                  {th.attachments && th.attachments.length > 0 && (
                    <div className="pt-2 border-top d-flex flex-wrap gap-2">
                      {th.attachments.map(att => (
                        <div
                          key={att.id}
                          className="p-1.5 rounded-2 border bg-light d-flex align-items-center gap-2"
                          style={{ fontSize: '0.76rem', maxWidth: '280px' }}
                        >
                          {isImageFile(att.fileName) ? (
                            <ImageIcon size={14} className="text-info flex-shrink-0" />
                          ) : isPdfFile(att.fileName) ? (
                            <FileText size={14} className="text-danger flex-shrink-0" />
                          ) : (
                            <File size={14} className="text-primary flex-shrink-0" />
                          )}
                          <span className="text-truncate text-dark fw-semibold" title={att.fileName}>{att.fileName}</span>
                          <span className="text-muted" style={{ fontSize: '0.68rem' }}>({formatFileSize(att.fileSizeBytes)})</span>
                          <div className="d-flex align-items-center gap-1 ms-auto">
                            <button
                              type="button"
                              className="btn btn-sm btn-light border-0 p-1 text-secondary"
                              onClick={() => setPreviewAttachment(att)}
                              title="Preview"
                            >
                              <Eye size={12} />
                            </button>
                            <a
                              href={`http://localhost:8080${att.downloadUrl}`}
                              download={att.fileName}
                              className="btn btn-sm btn-light border-0 p-1 text-secondary"
                              title="Download"
                            >
                              <Download size={12} />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Customer Reply Box */}
            <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
              <h6 className="fw-bold text-dark mb-2 d-flex align-items-center gap-1.5">
                <Send size={15} className="text-primary" />
                <span>Reply to this Ticket</span>
              </h6>
              <form onSubmit={handleSendCustomerReply}>
                <textarea
                  className="form-control mb-2"
                  rows={3}
                  required
                  placeholder="Type your response or additional information..."
                  value={customerReplyText}
                  onChange={e => setCustomerReplyText(e.target.value)}
                />

                {/* Reply Attachments */}
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <label
                    className="btn btn-sm btn-light border px-2.5 py-1 text-secondary fw-semibold d-inline-flex align-items-center gap-1 cursor-pointer mb-0"
                    style={{ cursor: 'pointer' }}
                  >
                    <Paperclip size={13} className="text-primary" />
                    <span style={{ fontSize: '0.74rem' }}>Attach Files</span>
                    <input
                      type="file"
                      multiple
                      accept=".png,.jpg,.jpeg,.pdf,.txt,.doc,.docx,.xls,.xlsx,.csv"
                      className="d-none"
                      onChange={e => {
                        if (e.target.files) {
                          setReplyAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                        }
                      }}
                    />
                  </label>

                  <span className="small text-muted" style={{ fontSize: '0.72rem' }}>
                    Replies update the ticket and notify assigned agents.
                  </span>
                </div>

                {replyAttachments.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    {replyAttachments.map((f, idx) => (
                      <span
                        key={idx}
                        className="badge bg-light text-dark border px-2 py-1 rounded-2 d-inline-flex align-items-center gap-1"
                        style={{ fontSize: '0.74rem' }}
                      >
                        <File size={12} className="text-primary" />
                        <span className="text-truncate" style={{ maxWidth: '120px' }}>{f.name}</span>
                        <button
                          type="button"
                          className="btn-close ms-1"
                          style={{ fontSize: '0.5rem' }}
                          onClick={() => setReplyAttachments(prev => prev.filter((_, i) => i !== idx))}
                        />
                      </span>
                    ))}
                  </div>
                )}

                <div className="d-flex justify-content-end">
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm px-4 py-1.5 fw-semibold rounded-3 shadow-xs"
                    disabled={isReplying || !customerReplyText.trim()}
                  >
                    {isReplying ? 'Sending Reply...' : 'Send Message'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-top py-3 text-center text-muted small mt-auto">
        <div className="container">
          <span>Powered by <strong>Kuwy HelpDesk</strong> Multi-Tenant SaaS • All rights reserved.</span>
        </div>
      </footer>

      {/* ==============================================================
          AUTHENTICATION / SIGN IN MODAL (Magic Link & Social Login)
          ============================================================== */}
      {showAuthModal && (
        <div className="modal show d-block modal-backdrop-blur" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '420px' }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="modal-header border-0 pb-0 pt-4 px-4 d-flex justify-content-between align-items-center">
                <h5 className="modal-title fw-bold text-dark mb-0">Customer Sign In</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => { setShowAuthModal(false); setAuthStep('input'); }}
                />
              </div>

              <div className="modal-body p-4">
                <p className="text-muted small mb-3">
                  Sign in with your email or social account to view and track your tickets.
                </p>

                {/* Social Login Options */}
                <div className="d-flex flex-column gap-2 mb-3">
                  <button
                    type="button"
                    className="btn btn-outline-dark btn-sm py-2 d-flex align-items-center justify-content-center gap-2 fw-semibold rounded-3"
                    onClick={() => handleSocialLogin('Google')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.7 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.6c-.3 1.5-1.1 2.8-2.4 3.7v3h3.9c2.3-2.1 3.6-5.2 3.6-8.9z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.2v3.1C3.2 21.3 7.3 24 12 24z"/><path fill="#FBBC05" d="M5.3 14.2c-.2-.7-.4-1.5-.4-2.2s.2-1.5.4-2.2V6.7H1.2C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.3l4.1-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.7l4.1 3.1c.9-2.9 3.6-5 6.7-5z"/></svg>
                    <span>Continue with Google</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-dark btn-sm py-2 d-flex align-items-center justify-content-center gap-2 fw-semibold rounded-3"
                    onClick={() => handleSocialLogin('Microsoft')}
                  >
                    <svg width="16" height="16" viewBox="0 0 21 21"><path fill="#f25022" d="M1 1h9v9H1z"/><path fill="#00a4ef" d="M1 11h9v9H1z"/><path fill="#7fba00" d="M11 1h9v9h-9z"/><path fill="#ffb900" d="M11 11h9v9h-9z"/></svg>
                    <span>Continue with Microsoft</span>
                  </button>
                </div>

                <div className="position-relative text-center my-3">
                  <hr className="my-0" />
                  <span className="position-absolute top-50 start-50 translate-middle bg-white px-2 text-muted small" style={{ fontSize: '0.72rem' }}>
                    OR EMAIL OTP
                  </span>
                </div>

                {authStep === 'input' ? (
                  <form onSubmit={handleSendOtp}>
                    <div className="mb-2.5">
                      <label className="form-label small fw-bold text-dark mb-1">Your Full Name</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Rajesh Kannan"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-dark mb-1">Email Address</label>
                      <input
                        type="email"
                        className="form-control form-control-sm"
                        required
                        placeholder="name@example.com"
                        value={customerEmail}
                        onChange={e => setCustomerEmail(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm w-100 fw-semibold rounded-3 py-2">
                      Send Verification Code
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp}>
                    {otpNotice && (
                      <div className="alert alert-info py-2 px-3 small rounded-3 mb-2.5">
                        {otpNotice}
                      </div>
                    )}
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-dark mb-1">Enter 6-Digit OTP</label>
                      <input
                        type="text"
                        className="form-control form-control-sm text-center fw-bold font-monospace"
                        style={{ fontSize: '1.2rem', letterSpacing: '0.3em' }}
                        maxLength={6}
                        required
                        placeholder="123456"
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value)}
                      />
                      <small className="text-muted text-center d-block mt-1">Default test code: <code>123456</code></small>
                    </div>
                    <button type="submit" className="btn btn-success btn-sm w-100 fw-semibold rounded-3 py-2">
                      Verify & Sign In
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          ATTACHMENT LIGHTBOX PREVIEW MODAL
          ============================================================== */}
      {previewAttachment && (
        <div
          className="modal show d-block modal-backdrop-blur"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', zIndex: 1080 }}
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-lg"
            style={{ maxWidth: '820px' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden bg-white">
              <div className="modal-header py-3 px-4 d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2 overflow-hidden">
                  <FileText size={18} className="text-primary flex-shrink-0" />
                  <span className="fw-bold text-dark text-truncate small">{previewAttachment.fileName}</span>
                  <span className="badge bg-light text-secondary border">
                    {formatFileSize(previewAttachment.fileSizeBytes)}
                  </span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <a
                    href={`http://localhost:8080${previewAttachment.downloadUrl}`}
                    download={previewAttachment.fileName}
                    className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5 fw-semibold"
                  >
                    <Download size={13} /> Download
                  </a>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setPreviewAttachment(null)}
                  />
                </div>
              </div>

              <div className="modal-body p-0 bg-light d-flex align-items-center justify-content-center" style={{ minHeight: '350px', maxHeight: '75vh', overflow: 'auto' }}>
                {isImageFile(previewAttachment.fileName) ? (
                  <div className="p-4 text-center w-100">
                    <img
                      src={`http://localhost:8080${previewAttachment.previewUrl}`}
                      alt={previewAttachment.fileName}
                      className="img-fluid rounded-3"
                      style={{ maxHeight: '65vh', objectFit: 'contain' }}
                    />
                  </div>
                ) : (
                  <iframe
                    src={`http://localhost:8080${previewAttachment.previewUrl}`}
                    title={previewAttachment.fileName}
                    style={{ width: '100%', height: '65vh', border: 'none' }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
