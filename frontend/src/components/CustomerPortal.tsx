import React, { useState, useEffect } from 'react';
import {
  LifeBuoy, Send, Search, CheckCircle2,
  Paperclip, FileText, Download,
  ArrowLeft, Clock, LogOut, Sparkles, Building2,
  RotateCcw, ThumbsUp, ThumbsDown, Star, Printer, Copy,
  ChevronRight, AlertCircle, Phone, Mail
} from 'lucide-react';
import { apiService } from '../services/api';
import type { Company, Department, Ticket, TicketThread, KbArticle } from '../types';

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
  const [portalMetadata, setPortalMetadata] = useState<{
    supportEmail?: string;
    supportPhone?: string;
    businessHours?: string;
    announcementBanner?: string;
  }>({});

  // Customer Authentication State (Screen 10)
  const [customerEmail, setCustomerEmail] = useState<string>(() => {
    return localStorage.getItem('kuwy_cust_email') || 'loan.applicant@gmail.com';
  });
  const [customerName, setCustomerName] = useState<string>(() => {
    return localStorage.getItem('kuwy_cust_name') || 'Rajesh Kannan';
  });
  const [customerPhone, setCustomerPhone] = useState<string>('+91 98765 43210');
  const [customerOrg, setCustomerOrg] = useState<string>('Apex Auto Dealers Ltd');

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem('kuwy_cust_email');
  });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authStep, setAuthStep] = useState<'input' | 'otp'>('input');
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState<number>(60);
  const [isRequestingOtp, setIsRequestingOtp] = useState<boolean>(false);

  // Active View Tab: 'home' | 'submit' | 'tickets' | 'ticket-detail' | 'kb' | 'article' | 'profile'
  const [activeTab, setActiveTab] = useState<'home' | 'submit' | 'tickets' | 'ticket-detail' | 'kb' | 'article' | 'profile'>('home');
  const [searchQuery, setSearchQuery] = useState('');

  // Knowledge Base State (Screen 14)
  const [kbArticles, setKbArticles] = useState<KbArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<KbArticle | null>(null);
  const [selectedKbCategory, setSelectedKbCategory] = useState<string | null>(null);
  const [articleVoted, setArticleVoted] = useState<{ [id: number]: 'yes' | 'no' }>({});
  const [copiedLink, setCopiedLink] = useState(false);

  // Submit Ticket Form State (Screen 11)
  const [subject, setSubject] = useState('');
  const [deptId, setDeptId] = useState<number>(1);
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [honeypot, setHoneypot] = useState('');
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<Ticket | null>(null);

  // My Tickets State (Screen 12)
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<'ALL' | 'OPEN' | 'WAITING' | 'RESOLVED' | 'CLOSED'>('ALL');
  const [ticketSearchTerm, setTicketSearchTerm] = useState('');

  // Ticket Detail & Conversation View State (Screen 13)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketThreads, setTicketThreads] = useState<TicketThread[]>([]);
  const [customerReplyText, setCustomerReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  // CSAT Rating State
  const [csatRating, setCsatRating] = useState<number>(5);
  const [csatComment, setCsatComment] = useState<string>('');
  const [csatSubmitted, setCsatSubmitted] = useState<boolean>(false);

  // Customer Profile & Privacy Preferences (Screen 15)
  const [notifReply, setNotifReply] = useState(true);
  const [notifResolved, setNotifResolved] = useState(true);
  const [notifCsat, setNotifCsat] = useState(true);
  const [profileSaved, setProfileSaved] = useState(false);

  // Load Portal Info & KB
  useEffect(() => {
    loadPortalData();
    loadKbArticles();
  }, [companySlug]);

  // Load Customer Tickets when authenticated
  useEffect(() => {
    if (isAuthenticated && customerEmail) {
      loadCustomerTickets();
    }
  }, [isAuthenticated, customerEmail, companySlug]);

  // OTP Countdown Timer
  useEffect(() => {
    let timer: any = null;
    if (authStep === 'otp' && otpCountdown > 0) {
      timer = setInterval(() => setOtpCountdown(c => c - 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [authStep, otpCountdown]);

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
      setPortalMetadata({
        supportEmail: (data as any).supportEmail || `support@${companySlug}.kuwy.in`,
        supportPhone: (data as any).supportPhone || '+91 44 6612 8000',
        businessHours: (data as any).businessHours || 'Mon - Sat: 09:00 AM - 07:00 PM IST',
        announcementBanner: (data as any).announcementBanner || 'Helpdesk Advisory: All systems operating normally. Average first response under 15 minutes.'
      });
      if (data.departments && data.departments.length > 0) {
        setDeptId(data.departments[0].id);
      }
    } catch {
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

  const loadKbArticles = async (query?: string) => {
    try {
      const articles = await apiService.getPublicKbArticles(companySlug, query);
      setKbArticles(articles);
    } catch {
      setKbArticles([]);
    }
  };

  const loadCustomerTickets = async () => {
    try {
      const tickets = await apiService.getCustomerPortalTickets(companySlug, customerEmail);
      setMyTickets(tickets);
    } catch {
      setMyTickets([]);
    }
  };

  // Auth Handlers (Screen 10)
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmailInput.trim()) return;

    setIsRequestingOtp(true);
    setOtpNotice(null);
    try {
      const res = await apiService.requestPortalOtp(companySlug, authEmailInput.trim());
      setAuthStep('otp');
      setOtpCountdown(60);
      setOtpNotice(res.message || 'One-Time sign-in code dispatched to your email.');
    } catch (err: any) {
      setOtpNotice(err.response?.data?.error || 'Failed to dispatch code. Please try again.');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiService.verifyPortalOtp(companySlug, authEmailInput.trim(), otpCode.trim());
      localStorage.setItem('kuwy_cust_email', res.email || authEmailInput.trim());
      localStorage.setItem('kuwy_cust_name', customerName || authEmailInput.split('@')[0]);
      localStorage.setItem('kuwy_cust_token', res.token || 'cust_token');

      setCustomerEmail(res.email || authEmailInput.trim());
      setIsAuthenticated(true);
      setShowAuthModal(false);
      setAuthStep('input');
      setOtpCode('');
      loadCustomerTickets();
    } catch (err: any) {
      setOtpNotice(err.response?.data?.error || 'Invalid OTP code. Use test code 123456');
    }
  };

  const handleOAuthLogin = (provider: 'Google' | 'Microsoft') => {
    const demoEmail = provider === 'Google' ? 'priya.customer@gmail.com' : 'priya.customer@outlook.com';
    const demoName = 'Priya Natarajan';
    localStorage.setItem('kuwy_cust_email', demoEmail);
    localStorage.setItem('kuwy_cust_name', demoName);
    localStorage.setItem('kuwy_cust_token', 'cust_oauth_token');
    setCustomerEmail(demoEmail);
    setCustomerName(demoName);
    setIsAuthenticated(true);
    setShowAuthModal(false);
    loadCustomerTickets();
  };

  const handleSignOut = () => {
    localStorage.removeItem('kuwy_cust_email');
    localStorage.removeItem('kuwy_cust_name');
    localStorage.removeItem('kuwy_cust_token');
    setIsAuthenticated(false);
    setActiveTab('home');
  };

  // Submit Ticket Handler (Screen 11)
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setIsSubmitting(true);
    try {
      const ticket = await apiService.submitPortalTicket(companySlug, {
        requesterName: customerName,
        requesterEmail: customerEmail,
        departmentId: deptId,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        websiteUrl: honeypot || undefined,
      });

      setSubmitSuccess(ticket);
      loadCustomerTickets();
      setSubject('');
      setDescription('');
      setAttachments([]);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to submit ticket. Please verify inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Ticket Detail (Screen 13)
  const handleOpenTicketDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setActiveTab('ticket-detail');
    setCsatSubmitted(false);
    try {
      const detail = await apiService.getCustomerPortalTicketDetail(companySlug, ticket.ticketNumber, customerEmail);
      setTicketThreads(detail.threads || []);
      setSelectedTicket(detail);
    } catch {
      // Fallback
    }
  };

  // Reply Handler (Screen 13)
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !customerReplyText.trim()) return;

    setIsReplying(true);
    try {
      const savedThread = await apiService.sendCustomerPortalReply(
        companySlug,
        selectedTicket.ticketNumber,
        customerEmail,
        customerReplyText.trim()
      );

      setTicketThreads(prev => [...prev, savedThread]);
      setCustomerReplyText('');
      // Update ticket status locally to OPEN
      setSelectedTicket(prev => prev ? { ...prev, status: 'OPEN' } : null);
      loadCustomerTickets();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to send reply.');
    } finally {
      setIsReplying(false);
    }
  };

  // Close / Mark as Resolved Handler (Screen 13)
  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    try {
      const updated = await apiService.closeTicketByCustomer(companySlug, selectedTicket.ticketNumber, customerEmail);
      setSelectedTicket(updated);
      loadCustomerTickets();
    } catch {
      alert('Failed to resolve ticket.');
    }
  };

  // Reopen Handler (Screen 13)
  const handleReopenTicket = async () => {
    if (!selectedTicket) return;
    try {
      const updated = await apiService.reopenCustomerPortalTicket(companySlug, selectedTicket.ticketNumber);
      setSelectedTicket(updated);
      loadCustomerTickets();
    } catch {
      alert('Failed to reopen ticket.');
    }
  };

  // CSAT Feedback Handler (Screen 13)
  const handleSubmitCsat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    try {
      await apiService.submitCsat(companySlug, selectedTicket.ticketNumber, csatRating, csatComment);
      setCsatSubmitted(true);
    } catch {
      alert('Failed to submit satisfaction rating.');
    }
  };

  // KB Voting Handler (Screen 14c)
  const handleVoteArticle = async (articleId: number, helpful: boolean) => {
    try {
      await apiService.voteKbArticle(companySlug, articleId, helpful);
      setArticleVoted(prev => ({ ...prev, [articleId]: helpful ? 'yes' : 'no' }));
      setKbArticles(prev => prev.map(a => {
        if (a.id === articleId) {
          return {
            ...a,
            helpfulVotes: helpful ? a.helpfulVotes + 1 : a.helpfulVotes,
          };
        }
        return a;
      }));
    } catch {
      // Silent catch
    }
  };

  // Export Data Handler (Screen 15)
  const handleExportData = async () => {
    try {
      const data = await apiService.exportCustomerData(companySlug, customerEmail);
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${companySlug}_ticket_history_${customerEmail}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch {
      alert('Failed to export ticket history.');
    }
  };

  // Filtered tickets
  const filteredTickets = myTickets.filter(t => {
    const matchesFilter =
      ticketFilter === 'ALL' ||
      (ticketFilter === 'OPEN' && (t.status === 'OPEN' || t.status === 'IN_PROGRESS')) ||
      (ticketFilter === 'WAITING' && t.status === 'WAITING_ON_CUSTOMER') ||
      (ticketFilter === 'RESOLVED' && t.status === 'RESOLVED') ||
      (ticketFilter === 'CLOSED' && t.status === 'CLOSED');

    const matchesSearch =
      !ticketSearchTerm.trim() ||
      t.ticketNumber.toLowerCase().includes(ticketSearchTerm.toLowerCase()) ||
      t.subject.toLowerCase().includes(ticketSearchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Suggested KB articles for deflection on Screen 11
  const suggestedArticles = subject.trim().length > 3
    ? kbArticles.filter(a =>
        a.title.toLowerCase().includes(subject.toLowerCase()) ||
        a.categoryName.toLowerCase().includes(subject.toLowerCase())
      ).slice(0, 3)
    : [];

  const primaryColor = company?.primaryColor || '#0d6efd';

  return (
    <div className="min-vh-100 d-flex flex-column bg-slate-50" style={{ backgroundColor: '#f8fafc' }}>
      {/* 0. Top Operational Announcement Banner (Screen 9) */}
      {portalMetadata.announcementBanner && (
        <div
          className="py-1.5 px-3 text-center small text-white fw-medium d-flex align-items-center justify-content-center gap-2"
          style={{ background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)', fontSize: '0.8rem' }}
        >
          <span className="badge bg-success rounded-pill px-2 py-0.5" style={{ fontSize: '0.68rem' }}>LIVE ADVISORY</span>
          <span>{portalMetadata.announcementBanner}</span>
        </div>
      )}

      {/* HEADER & NAVIGATION */}
      <header className="bg-white border-bottom sticky-top shadow-xs">
        <div className="container d-flex justify-content-between align-items-center py-2.5 px-3" style={{ maxWidth: '1200px' }}>
          {/* Company Brand */}
          <div
            className="d-flex align-items-center gap-2.5 cursor-pointer"
            onClick={() => setActiveTab('home')}
            style={{ cursor: 'pointer' }}
          >
            {company?.logoUrl ? (
              <img src={company.logoUrl} alt={company.name} style={{ height: '32px' }} />
            ) : (
              <div
                className="p-2 rounded-3 text-white d-flex align-items-center justify-content-center shadow-xs"
                style={{ backgroundColor: primaryColor }}
              >
                <Building2 size={20} />
              </div>
            )}
            <div>
              <h5 className="fw-bolder mb-0 text-dark" style={{ letterSpacing: '-0.02em', fontSize: '1.05rem' }}>
                {company?.name || 'Customer Support'}
              </h5>
              <small className="text-muted d-block" style={{ fontSize: '0.72rem', marginTop: '-2px' }}>
                Official Help Center & Support Portal
              </small>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="d-flex align-items-center gap-1.5">
            <button
              type="button"
              className={`btn btn-sm rounded-3 fw-semibold ${activeTab === 'home' ? 'btn-light text-primary fw-bold' : 'btn-link text-secondary text-decoration-none'}`}
              onClick={() => setActiveTab('home')}
            >
              Home
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-3 fw-semibold ${activeTab === 'kb' || activeTab === 'article' ? 'btn-light text-primary fw-bold' : 'btn-link text-secondary text-decoration-none'}`}
              onClick={() => { setActiveTab('kb'); setSelectedKbCategory(null); }}
            >
              Knowledge Base
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-3 fw-semibold ${activeTab === 'submit' ? 'btn-primary shadow-xs' : 'btn-outline-primary'}`}
              onClick={() => { setActiveTab('submit'); setSubmitSuccess(null); }}
            >
              Submit Ticket
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-3 fw-semibold position-relative ${activeTab === 'tickets' ? 'btn-light text-primary fw-bold' : 'btn-link text-secondary text-decoration-none'}`}
              onClick={() => {
                if (!isAuthenticated) setShowAuthModal(true);
                else setActiveTab('tickets');
              }}
            >
              My Tickets
              {myTickets.length > 0 && (
                <span className="badge rounded-pill bg-primary ms-1.5" style={{ fontSize: '0.65rem' }}>
                  {myTickets.length}
                </span>
              )}
            </button>

            {/* Customer Account / Sign In Dropdown */}
            {isAuthenticated ? (
              <div className="dropdown ms-2">
                <button
                  type="button"
                  className="btn btn-sm btn-light border rounded-pill d-flex align-items-center gap-2 py-1 px-2.5"
                  data-bs-toggle="dropdown"
                  onClick={() => setActiveTab('profile')}
                >
                  <div
                    className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold"
                    style={{ width: '24px', height: '24px', backgroundColor: primaryColor, fontSize: '0.75rem' }}
                  >
                    {customerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="small fw-semibold text-dark text-truncate" style={{ maxWidth: '110px' }}>
                    {customerName}
                  </span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold ms-2"
                onClick={() => { setAuthStep('input'); setShowAuthModal(true); }}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {loading && (
        <div className="progress" style={{ height: '3px', borderRadius: 0 }}>
          <div className="progress-bar progress-bar-striped progress-bar-animated bg-primary w-100" />
        </div>
      )}

      {/* ==============================================================
          SCREEN 9: PORTAL HOME (HERO & INTRO)
          ============================================================== */}
      {activeTab === 'home' && (
        <section
          className="text-white py-5 text-center position-relative shadow-sm"
          style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #0f172a 100%)` }}
        >
          <div className="container" style={{ maxWidth: '720px' }}>
            <span className="badge bg-white text-dark fw-bold mb-2 shadow-xs" style={{ fontSize: '0.75rem' }}>
              Screen 9 • Public Customer Portal
            </span>
            <h2 className="fw-bolder mb-2 text-white" style={{ letterSpacing: '-0.02em' }}>
              How can we assist you today?
            </h2>
            <p className="text-white-50 mb-4" style={{ fontSize: '0.95rem' }}>
              Search help articles, check ticket status, or submit a request directly to our verified engineers.
            </p>

            {/* Knowledge Base Instant Search Box */}
            <div className="position-relative mx-auto" style={{ maxWidth: '580px' }}>
              <Search size={18} className="position-absolute text-muted" style={{ top: '14px', left: '16px' }} />
              <input
                type="text"
                className="form-control form-control-lg rounded-pill ps-5 pe-4 shadow-lg border-0"
                style={{ fontSize: '0.95rem' }}
                placeholder="Search solutions, loan disbursals, KYC, or error codes..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  loadKbArticles(e.target.value);
                }}
              />

              {/* Instant Search Dropdown Suggestions */}
              {searchQuery.trim().length > 1 && kbArticles.length > 0 && (
                <div
                  className="position-absolute w-100 bg-white rounded-4 shadow-2xl border text-start mt-2 p-2"
                  style={{ zIndex: 1050 }}
                >
                  <small className="text-muted fw-bold px-3 py-1 d-block text-uppercase" style={{ fontSize: '0.68rem' }}>
                    Matching Help Articles
                  </small>
                  {kbArticles.slice(0, 5).map(art => (
                    <div
                      key={art.id}
                      className="p-2.5 rounded-3 hover-bg-light cursor-pointer transition-all d-flex align-items-center justify-content-between"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedArticle(art);
                        setActiveTab('article');
                        setSearchQuery('');
                      }}
                    >
                      <div>
                        <div className="fw-semibold text-dark small mb-0.5">{art.title}</div>
                        <small className="text-muted">{art.categoryName}</small>
                      </div>
                      <ChevronRight size={16} className="text-muted" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* MAIN CONTENT CONTAINER */}
      <main className="container py-4 flex-grow-1" style={{ maxWidth: '1100px' }}>

        {/* ==============================================================
            SCREEN 9: PORTAL HOME BODY
            ============================================================== */}
        {activeTab === 'home' && (
          <div>
            {/* Authenticated Customer Welcome Card */}
            {isAuthenticated && (
              <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-white border-start border-4 border-primary">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                  <div>
                    <h5 className="fw-bold text-dark mb-1">Welcome back, {customerName}!</h5>
                    <p className="text-muted small mb-0">
                      Logged in as <code>{customerEmail}</code> • {myTickets.length} ticket(s) recorded in {company?.name}.
                    </p>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-primary-subtle text-primary px-3 py-1.5 rounded-pill">
                      {myTickets.filter(t => t.status === 'OPEN').length} Open
                    </span>
                    <span className="badge bg-warning-subtle text-warning-emphasis px-3 py-1.5 rounded-pill">
                      {myTickets.filter(t => t.status === 'WAITING_ON_CUSTOMER').length} Waiting on you
                    </span>
                    <span className="badge bg-success-subtle text-success px-3 py-1.5 rounded-pill">
                      {myTickets.filter(t => t.status === 'RESOLVED').length} Resolved
                    </span>
                    <button
                      className="btn btn-sm btn-outline-primary fw-semibold rounded-pill ms-2"
                      onClick={() => setActiveTab('tickets')}
                    >
                      View All Tickets →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Two Action Cards */}
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
                      <small className="text-muted">Intake routed to dedicated category engineers</small>
                    </div>
                  </div>
                  <p className="text-secondary small mb-3">
                    Raise an inquiry with documents, loan contracts, proof receipts, or error logs. You receive an immediate tracking ticket number e.g. <code>#KUWY-1042</code>.
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
                    Access conversation threads, download attachments sent by our team, reply with more details, or reopen resolved requests.
                  </p>
                  <span className="text-success fw-bold small d-inline-flex align-items-center gap-1">
                    {isAuthenticated ? `View your ${myTickets.length} ticket(s) →` : 'Sign in to track →'}
                  </span>
                </div>
              </div>
            </div>

            {/* Popular Topics / Category Cards */}
            <div className="card border-0 shadow-sm rounded-4 p-4 bg-white mb-4">
              <h6 className="fw-bold text-dark mb-3">Popular Categories</h6>
              <div className="row g-3">
                {departments.slice(0, 4).map(d => (
                  <div key={d.id} className="col-6 col-md-3">
                    <div
                      className="p-3 border rounded-3 bg-light hover-bg-white cursor-pointer transition-all h-100 text-center"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedKbCategory(d.name);
                        setActiveTab('kb');
                      }}
                    >
                      <div className="p-2.5 rounded-circle bg-white d-inline-flex text-primary mb-2 shadow-xs">
                        <Building2 size={20} />
                      </div>
                      <div className="fw-bold small text-dark mb-1">{d.name}</div>
                      <small className="text-muted d-block text-truncate" style={{ fontSize: '0.72rem' }}>
                        {d.description || 'Guides and answers'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Popular Solutions & Guides List */}
            <div className="card border-0 shadow-sm rounded-4 p-4 bg-white mb-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                  <Sparkles size={16} className="text-warning" />
                  <span>Popular Solutions & Guides</span>
                </h6>
                <button
                  type="button"
                  className="btn btn-sm btn-link text-primary text-decoration-none fw-semibold p-0"
                  onClick={() => { setActiveTab('kb'); setSelectedKbCategory(null); }}
                >
                  View All Knowledge Base →
                </button>
              </div>

              <div className="row g-3">
                {kbArticles.slice(0, 4).map(art => (
                  <div key={art.id} className="col-md-6">
                    <div
                      className="p-3 border rounded-3 bg-light hover-bg-white cursor-pointer transition-all h-100"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedArticle(art);
                        setActiveTab('article');
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-1.5">
                        <span className="badge bg-white text-primary border" style={{ fontSize: '0.68rem' }}>
                          {art.categoryName}
                        </span>
                        <small className="text-muted d-flex align-items-center gap-1" style={{ fontSize: '0.72rem' }}>
                          <ThumbsUp size={11} className="text-success" />
                          <span>{art.helpfulVotes}</span>
                        </small>
                      </div>
                      <h6 className="fw-semibold text-dark small mb-1">{art.title}</h6>
                      <p className="text-muted mb-0 text-truncate" style={{ fontSize: '0.78rem' }}>
                        Click to view complete troubleshooting steps and resolution guide.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact Details & Hours Card */}
            <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
              <div className="row g-3 align-items-center">
                <div className="col-md-4">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-primary-subtle text-primary">
                      <Mail size={20} />
                    </div>
                    <div>
                      <small className="text-muted d-block">Support Email</small>
                      <span className="fw-bold text-dark small">{portalMetadata.supportEmail}</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-success-subtle text-success">
                      <Phone size={20} />
                    </div>
                    <div>
                      <small className="text-muted d-block">Helpline Phone</small>
                      <span className="fw-bold text-dark small">{portalMetadata.supportPhone}</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-warning-subtle text-warning">
                      <Clock size={20} />
                    </div>
                    <div>
                      <small className="text-muted d-block">Business Hours</small>
                      <span className="fw-bold text-dark small">{portalMetadata.businessHours}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==============================================================
            SCREEN 11: CREATE TICKET FORM (WITH DEFLECTION PANEL)
            ============================================================== */}
        {activeTab === 'submit' && (
          <div>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <button
                type="button"
                className="btn btn-sm btn-link text-secondary text-decoration-none p-0 d-flex align-items-center gap-1"
                onClick={() => { setActiveTab('home'); setSubmitSuccess(null); }}
              >
                <ArrowLeft size={15} /> Back to Home
              </button>
              <span className="small text-muted">Screen 11 • Public Ticket Submission</span>
            </div>

            {submitSuccess ? (
              <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white animate-fade-in mx-auto" style={{ maxWidth: '640px' }}>
                <div className="rounded-circle bg-success-subtle text-success mx-auto d-flex align-items-center justify-content-center mb-3" style={{ width: '64px', height: '64px' }}>
                  <CheckCircle2 size={36} />
                </div>
                <h4 className="fw-bolder text-dark mb-1">Ticket Submitted Successfully!</h4>
                <p className="text-muted small mb-3">
                  We've emailed a confirmation receipt to <strong>{customerEmail}</strong>.
                </p>

                <div className="p-3 bg-light rounded-3 border mx-auto mb-4" style={{ maxWidth: '420px' }}>
                  <div className="small text-secondary mb-1">Your Tracking Number</div>
                  <h3 className="fw-bolder text-primary mb-1">#{submitSuccess.ticketNumber}</h3>
                  <div className="small text-muted">Subject: "{submitSuccess.subject}"</div>
                  <div className="badge bg-info-subtle text-info mt-2">Expected Response: Under 15 Minutes</div>
                </div>

                <div className="d-flex justify-content-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary px-4 fw-semibold rounded-3 shadow-sm"
                    onClick={() => handleOpenTicketDetail(submitSuccess)}
                  >
                    View Ticket & Conversation
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
              <div className="row g-4">
                {/* Form Column */}
                <div className={suggestedArticles.length > 0 ? "col-lg-8" : "col-12 mx-auto"} style={{ maxWidth: suggestedArticles.length > 0 ? undefined : '780px' }}>
                  <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
                    <div className="border-bottom pb-3 mb-4">
                      <h5 className="fw-bolder text-dark mb-1">Create Support Ticket</h5>
                      <p className="text-muted small mb-0">
                        Fill in details below. Our support agents respond in accordance with your category SLA.
                      </p>
                    </div>

                    <form onSubmit={handleSubmitTicket}>
                      {/* Honeypot field */}
                      <div style={{ display: 'none', position: 'absolute', left: '-9999px' }} aria-hidden="true">
                        <input
                          type="text"
                          name="websiteUrl"
                          tabIndex={-1}
                          autoComplete="off"
                          value={honeypot}
                          onChange={(e) => setHoneypot(e.target.value)}
                        />
                      </div>

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
                            placeholder="name@example.com"
                            value={customerEmail}
                            onChange={e => setCustomerEmail(e.target.value)}
                            readOnly={isAuthenticated}
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
                          className="form-control font-sans"
                          rows={5}
                          required
                          placeholder="Provide details: applicant PAN, contract ID, step where error occurred, screenshots..."
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                        />
                      </div>

                      {/* Attachments Dropzone */}
                      <div className="mb-4">
                        <label className="form-label small fw-bold text-dark d-flex justify-content-between">
                          <span>Supporting Attachments</span>
                          <span className="text-muted fw-normal">PNG, PDF, JPG, JPEG, TXT up to 25MB</span>
                        </label>

                        <div className="p-3 border-2 border-dashed rounded-3 text-center bg-light">
                          <Paperclip size={20} className="text-muted mb-1" />
                          <div className="small text-muted mb-2">Drag files here or select from device</div>
                          <input
                            type="file"
                            multiple
                            accept=".png,.pdf,.jpg,.jpeg,.txt"
                            className="form-control form-control-sm mx-auto"
                            style={{ maxWidth: '280px' }}
                            onChange={e => {
                              if (e.target.files) {
                                setAttachments(Array.from(e.target.files));
                              }
                            }}
                          />
                        </div>

                        {attachments.length > 0 && (
                          <div className="d-flex flex-wrap gap-2 mt-2">
                            {attachments.map((file, idx) => (
                              <span key={idx} className="badge bg-white text-dark border p-2 d-inline-flex align-items-center gap-1.5">
                                <FileText size={14} className="text-primary" />
                                <span>{file.name}</span>
                                <small className="text-muted">({(file.size / 1024).toFixed(0)} KB)</small>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Consent Checkbox */}
                      <div className="form-check mb-4">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="portalPrivacyConsent"
                          checked={agreedToPrivacy}
                          onChange={e => setAgreedToPrivacy(e.target.checked)}
                          required
                        />
                        <label className="form-check-label small text-muted" htmlFor="portalPrivacyConsent">
                          I consent to processing these details for customer support resolution.
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting || !agreedToPrivacy}
                        className="btn btn-primary w-100 py-2.5 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
                        style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                      >
                        {isSubmitting ? (
                          <>
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                            <span>Submitting Inquiry...</span>
                          </>
                        ) : (
                          <>
                            <span>Submit Support Ticket</span>
                            <Send size={16} />
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Search-before-Submit Deflection Side Panel */}
                {suggestedArticles.length > 0 && (
                  <div className="col-lg-4">
                    <div className="card border-0 shadow-sm rounded-4 p-4 bg-white sticky-top" style={{ top: '80px' }}>
                      <div className="d-flex align-items-center gap-2 mb-2 text-warning">
                        <Sparkles size={18} />
                        <h6 className="fw-bold mb-0 text-dark">Suggested Solutions</h6>
                      </div>
                      <p className="text-muted small mb-3">
                        These articles match your subject. You might get an instant answer!
                      </p>

                      <div className="d-flex flex-column gap-2.5">
                        {suggestedArticles.map(art => (
                          <div key={art.id} className="p-3 bg-light rounded-3 border">
                            <div className="fw-bold text-dark small mb-1">{art.title}</div>
                            <small className="text-muted d-block mb-2">{art.categoryName}</small>
                            <div className="d-flex gap-2">
                              <button
                                type="button"
                                className="btn btn-xs btn-outline-primary py-1 px-2"
                                onClick={() => {
                                  setSelectedArticle(art);
                                  setActiveTab('article');
                                }}
                              >
                                Read Article
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-outline-success py-1 px-2"
                                onClick={() => {
                                  alert('Glad we could help! Ticket submission cancelled.');
                                  setActiveTab('home');
                                }}
                              >
                                Solved my issue!
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==============================================================
            SCREEN 12: MY TICKETS LIST
            ============================================================== */}
        {activeTab === 'tickets' && (
          <div>
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
              <div>
                <h4 className="fw-bold text-dark mb-1">My Support Tickets</h4>
                <p className="text-muted small mb-0">
                  Showing inquiries associated with <strong>{customerEmail}</strong> in {company?.name}.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm fw-semibold d-flex align-items-center gap-1.5 px-3 py-2 shadow-xs"
                onClick={() => { setActiveTab('submit'); setSubmitSuccess(null); }}
              >
                <Send size={15} />
                <span>Submit a New Ticket</span>
              </button>
            </div>

            {/* Filter Chips & Search Bar */}
            <div className="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                <div className="d-flex flex-wrap gap-1.5">
                  {(['ALL', 'OPEN', 'WAITING', 'RESOLVED', 'CLOSED'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold ${ticketFilter === f ? 'btn-primary' : 'btn-light text-muted'}`}
                      onClick={() => setTicketFilter(f)}
                    >
                      {f === 'WAITING' ? 'Waiting on You' : f}
                    </button>
                  ))}
                </div>

                <div className="input-group input-group-sm" style={{ maxWidth: '280px' }}>
                  <span className="input-group-text bg-white border-end-0">
                    <Search size={14} className="text-muted" />
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0"
                    placeholder="Search by ticket # or subject..."
                    value={ticketSearchTerm}
                    onChange={e => setTicketSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Tickets Table */}
            <div className="card border-0 shadow-sm rounded-4 bg-white overflow-hidden">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light text-secondary text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                    <tr>
                      <th className="ps-4 py-3">Ticket #</th>
                      <th>Subject</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th className="pe-4 text-end">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-5 text-muted">
                          <LifeBuoy size={36} className="text-muted opacity-50 mb-2 d-block mx-auto" />
                          <div className="fw-semibold">No tickets found in this view</div>
                          <small className="text-muted">Submit an inquiry or change the filter tab.</small>
                        </td>
                      </tr>
                    ) : (
                      filteredTickets.map(t => (
                        <tr
                          key={t.id}
                          className="cursor-pointer"
                          onClick={() => handleOpenTicketDetail(t)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="ps-4">
                            <span className="fw-bolder font-monospace text-primary">#{t.ticketNumber}</span>
                          </td>
                          <td>
                            <div className="fw-semibold text-dark">{t.subject}</div>
                            {t.status === 'WAITING_ON_CUSTOMER' && (
                              <span className="badge bg-warning text-dark mt-1" style={{ fontSize: '0.65rem' }}>
                                Agent waiting for your reply
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="badge bg-light text-dark border">
                              {t.department?.name || 'General'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge px-2.5 py-1 ${
                              t.status === 'OPEN' ? 'bg-primary-subtle text-primary border border-primary-subtle' :
                              t.status === 'RESOLVED' ? 'bg-success-subtle text-success border border-success-subtle' :
                              t.status === 'WAITING_ON_CUSTOMER' ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' :
                              'bg-secondary-subtle text-secondary'
                            }`}>
                              {t.status}
                            </span>
                          </td>
                          <td>
                            <span className="badge bg-light text-secondary border">
                              {t.priority}
                            </span>
                          </td>
                          <td className="pe-4 text-end text-muted small">
                            {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Today'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==============================================================
            SCREEN 13: TICKET DETAIL & REPLY CONVERSATION VIEW
            ============================================================== */}
        {activeTab === 'ticket-detail' && selectedTicket && (
          <div>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <button
                type="button"
                className="btn btn-sm btn-link text-secondary text-decoration-none p-0 d-flex align-items-center gap-1"
                onClick={() => setActiveTab('tickets')}
              >
                <ArrowLeft size={15} /> Back to My Tickets
              </button>
              <div className="d-flex align-items-center gap-2">
                {selectedTicket.status === 'OPEN' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success fw-semibold"
                    onClick={handleCloseTicket}
                  >
                    Mark as Resolved
                  </button>
                )}
                {(selectedTicket.status === 'RESOLVED' || selectedTicket.status === 'CLOSED') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary fw-semibold d-flex align-items-center gap-1"
                    onClick={handleReopenTicket}
                  >
                    <RotateCcw size={14} /> Reopen Ticket
                  </button>
                )}
              </div>
            </div>

            {/* Ticket Header Card */}
            <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-white">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span className="badge bg-primary text-white font-monospace">#{selectedTicket.ticketNumber}</span>
                    <span className="badge bg-light text-dark border">{selectedTicket.department?.name || 'Support'}</span>
                    <span className="badge bg-success-subtle text-success">{selectedTicket.status}</span>
                  </div>
                  <h4 className="fw-bolder text-dark mb-0">{selectedTicket.subject}</h4>
                </div>
                <div className="text-end text-muted small">
                  <div>Opened on: {selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleDateString() : 'Today'}</div>
                  <div>SLA Status: <span className="text-success fw-bold">Within SLA</span></div>
                </div>
              </div>
            </div>

            {/* Conversation Thread (Screen 13: Oldest to Newest Timeline) */}
            <div className="d-flex flex-column gap-3 mb-4">
              {/* Initial Ticket Description Message */}
              <div className="card border-0 shadow-sm rounded-4 p-4 bg-white border-start border-4 border-primary">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold" style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                      {selectedTicket.contact?.firstName?.charAt(0) || 'C'}
                    </div>
                    <div>
                      <div className="fw-bold text-dark small">{selectedTicket.contact?.firstName || 'You'}</div>
                      <small className="text-muted">Requester</small>
                    </div>
                  </div>
                  <small className="text-muted">{selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00 AM'}</small>
                </div>
                <div className="text-secondary small mt-2">
                  {selectedTicket.descriptionText || selectedTicket.descriptionHtml || 'Original ticket description provided during intake.'}
                </div>
              </div>

              {/* Dynamic Conversation Threads */}
              {ticketThreads.map(th => {
                const isCustomer = th.senderType === 'CUSTOMER';
                return (
                  <div
                    key={th.id}
                    className={`card border-0 shadow-sm rounded-4 p-4 ${isCustomer ? 'bg-white border-start border-4 border-info' : 'bg-light border-start border-4 border-success'}`}
                  >
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <div
                          className={`rounded-circle text-white d-flex align-items-center justify-content-center fw-bold ${isCustomer ? 'bg-info' : 'bg-success'}`}
                          style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}
                        >
                          {isCustomer ? 'You' : 'Staff'}
                        </div>
                        <div>
                          <div className="fw-bold text-dark small">
                            {isCustomer ? 'You' : `${th.fromName || 'Support Team'}`}
                          </div>
                          <small className="text-muted">{isCustomer ? 'Customer' : 'Certified Support Engineer'}</small>
                        </div>
                      </div>
                      <small className="text-muted">
                        {th.createdAt ? new Date(th.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                      </small>
                    </div>
                    <div
                      className="text-secondary small mt-2"
                      dangerouslySetInnerHTML={{ __html: th.bodyHtml || th.bodyText || '' }}
                    />
                  </div>
                );
              })}
            </div>

            {/* CSAT Satisfaction Widget when ticket is RESOLVED or CLOSED */}
            {(selectedTicket.status === 'RESOLVED' || selectedTicket.status === 'CLOSED') && (
              <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-white border-top border-4 border-warning">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <Star size={20} className="text-warning fill-warning" />
                  <h6 className="fw-bold text-dark mb-0">How satisfied were you with this resolution?</h6>
                </div>
                {csatSubmitted ? (
                  <div className="alert alert-success py-2 px-3 small d-flex align-items-center gap-2 mb-0">
                    <CheckCircle2 size={16} />
                    <span>Thank you for rating our support team! Your feedback helps us maintain strict SLAs.</span>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitCsat}>
                    <p className="text-muted small mb-3">Rate your experience with our engineering support:</p>
                    <div className="d-flex gap-2 mb-3">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          className={`btn btn-sm ${csatRating >= star ? 'btn-warning text-dark' : 'btn-outline-secondary'}`}
                          onClick={() => setCsatRating(star)}
                        >
                          ★ {star}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="form-control form-control-sm mb-3"
                      rows={2}
                      placeholder="Optional feedback comment on agent helpfulness and response speed..."
                      value={csatComment}
                      onChange={e => setCsatComment(e.target.value)}
                    />
                    <button type="submit" className="btn btn-warning btn-sm fw-bold">
                      Submit Feedback
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Reply Box */}
            <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
              <h6 className="fw-bold text-dark mb-3">Post a Reply to this Thread</h6>
              <form onSubmit={handleSendReply}>
                <textarea
                  className="form-control mb-3"
                  rows={4}
                  required
                  placeholder="Type your response here... Replying automatically marks this ticket Open."
                  value={customerReplyText}
                  onChange={e => setCustomerReplyText(e.target.value)}
                />
                <div className="d-flex justify-content-between align-items-center">
                  <span className="small text-muted">
                    Your message will be sent to the assigned engineer.
                  </span>
                  <button
                    type="submit"
                    disabled={isReplying || !customerReplyText.trim()}
                    className="btn btn-primary btn-sm px-4 fw-semibold d-flex align-items-center gap-2"
                  >
                    {isReplying ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Reply</span>
                        <Send size={15} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==============================================================
            SCREEN 14: HELP CENTRE AND KNOWLEDGE BASE
            ============================================================== */}
        {activeTab === 'kb' && (
          <div>
            <div className="d-flex align-items-center justify-content-between mb-4">
              <div>
                <nav aria-label="breadcrumb">
                  <ol className="breadcrumb small mb-1">
                    <li className="breadcrumb-item cursor-pointer text-primary" onClick={() => setActiveTab('home')}>Home</li>
                    <li className="breadcrumb-item active">Knowledge Base</li>
                  </ol>
                </nav>
                <h4 className="fw-bold text-dark mb-0">Help Centre & Troubleshooting Solutions</h4>
              </div>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm rounded-pill fw-semibold"
                onClick={() => { setActiveTab('submit'); setSubmitSuccess(null); }}
              >
                Still stuck? Submit a ticket
              </button>
            </div>

            {/* Category Filter Chips */}
            <div className="d-flex flex-wrap gap-2 mb-4">
              <button
                className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold ${!selectedKbCategory ? 'btn-primary' : 'btn-light text-muted'}`}
                onClick={() => setSelectedKbCategory(null)}
              >
                All Articles ({kbArticles.length})
              </button>
              {Array.from(new Set(kbArticles.map(a => a.categoryName))).map(cat => (
                <button
                  key={cat}
                  className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold ${selectedKbCategory === cat ? 'btn-primary' : 'btn-light text-muted'}`}
                  onClick={() => setSelectedKbCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Articles Grid */}
            <div className="row g-3">
              {kbArticles
                .filter(a => !selectedKbCategory || a.categoryName === selectedKbCategory)
                .map(art => (
                  <div key={art.id} className="col-md-6">
                    <div
                      className="card border-0 shadow-sm rounded-4 p-4 bg-white hover-shadow transition-all h-100 cursor-pointer"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedArticle(art);
                        setActiveTab('article');
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-light text-primary border" style={{ fontSize: '0.7rem' }}>
                          {art.categoryName}
                        </span>
                        <small className="text-muted d-flex align-items-center gap-1">
                          <ThumbsUp size={12} className="text-success" />
                          <span>{art.helpfulVotes} found helpful</span>
                        </small>
                      </div>
                      <h6 className="fw-bold text-dark mb-2">{art.title}</h6>
                      <p className="text-muted small mb-0">
                        Detailed guide and resolution walkthrough. Click to read full solution.
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ==============================================================
            SCREEN 14c: FULL KNOWLEDGE BASE ARTICLE VIEW
            ============================================================== */}
        {activeTab === 'article' && selectedArticle && (
          <div className="mx-auto" style={{ maxWidth: '820px' }}>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <button
                type="button"
                className="btn btn-sm btn-link text-secondary text-decoration-none p-0 d-flex align-items-center gap-1"
                onClick={() => setActiveTab('kb')}
              >
                <ArrowLeft size={15} /> Back to Knowledge Base
              </button>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-light border d-flex align-items-center gap-1"
                  onClick={() => window.print()}
                >
                  <Printer size={14} /> Print
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-light border d-flex align-items-center gap-1"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 3000);
                  }}
                >
                  <Copy size={14} /> {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 p-4 p-md-5 bg-white mb-4">
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle d-inline-block mb-2 px-2.5 py-1">
                {selectedArticle.categoryName}
              </span>
              <h3 className="fw-bolder text-dark mb-3">{selectedArticle.title}</h3>
              <div className="d-flex align-items-center gap-3 text-muted small pb-3 mb-4 border-bottom">
                <span>Views: {selectedArticle.viewCount || 100}</span>
                <span>•</span>
                <span>Helpful votes: {selectedArticle.helpfulVotes}</span>
              </div>

              {/* Formatted Article HTML */}
              <div
                className="article-content text-dark lh-lg"
                dangerouslySetInnerHTML={{ __html: selectedArticle.contentHtml }}
              />

              {/* Feedback Thumbs */}
              <div className="mt-5 pt-4 border-top text-center bg-light p-4 rounded-3">
                <h6 className="fw-bold text-dark mb-2">Was this article helpful?</h6>
                <div className="d-flex justify-content-center gap-2 mb-2">
                  <button
                    type="button"
                    className={`btn btn-sm d-flex align-items-center gap-1.5 px-3 py-1.5 ${articleVoted[selectedArticle.id] === 'yes' ? 'btn-success' : 'btn-outline-secondary'}`}
                    onClick={() => handleVoteArticle(selectedArticle.id, true)}
                  >
                    <ThumbsUp size={15} /> Yes
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm d-flex align-items-center gap-1.5 px-3 py-1.5 ${articleVoted[selectedArticle.id] === 'no' ? 'btn-danger' : 'btn-outline-secondary'}`}
                    onClick={() => handleVoteArticle(selectedArticle.id, false)}
                  >
                    <ThumbsDown size={15} /> No
                  </button>
                </div>
                {articleVoted[selectedArticle.id] && (
                  <small className="text-success fw-semibold">Thank you for your feedback!</small>
                )}
              </div>

              {/* Carries Context into Ticket Submit */}
              <div className="mt-4 text-center">
                <span className="small text-muted me-2">Still need assistance?</span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary fw-semibold"
                  onClick={() => {
                    setSubject(`Inquiry regarding: ${selectedArticle.title}`);
                    setActiveTab('submit');
                  }}
                >
                  Submit a Ticket on this Topic →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==============================================================
            SCREEN 15: CUSTOMER PROFILE & DATA PRIVACY
            ============================================================== */}
        {activeTab === 'profile' && (
          <div className="mx-auto" style={{ maxWidth: '720px' }}>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <button
                type="button"
                className="btn btn-sm btn-link text-secondary text-decoration-none p-0 d-flex align-items-center gap-1"
                onClick={() => setActiveTab('home')}
              >
                <ArrowLeft size={15} /> Back to Home
              </button>
              <span className="small text-muted">Screen 15 • Customer Profile & Privacy</span>
            </div>

            <div className="card border-0 shadow-sm rounded-4 p-4 p-md-5 bg-white mb-4">
              <div className="d-flex align-items-center gap-3 mb-4 pb-3 border-bottom">
                <div
                  className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold"
                  style={{ width: '56px', height: '56px', backgroundColor: primaryColor, fontSize: '1.4rem' }}
                >
                  {customerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h5 className="fw-bolder text-dark mb-0">{customerName}</h5>
                  <span className="text-muted small">{customerEmail}</span>
                  <span className="badge bg-success-subtle text-success ms-2" style={{ fontSize: '0.65rem' }}>VERIFIED CUSTOMER</span>
                </div>
              </div>

              {profileSaved && (
                <div className="alert alert-success py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                  <CheckCircle2 size={16} /> Preferences successfully updated.
                </div>
              )}

              {/* Profile Details */}
              <h6 className="fw-bold text-dark mb-3">Contact Details</h6>
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-secondary">Full Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-secondary">Registered Email (Read-Only)</label>
                  <input
                    type="email"
                    className="form-control form-control-sm bg-light"
                    value={customerEmail}
                    readOnly
                    disabled
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-secondary">Phone Number</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-secondary">Company / Organization</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={customerOrg}
                    onChange={e => setCustomerOrg(e.target.value)}
                  />
                </div>
              </div>

              {/* Notification Preferences */}
              <h6 className="fw-bold text-dark mb-3">Notification Preferences</h6>
              <div className="mb-4 d-flex flex-column gap-2 bg-light p-3 rounded-3">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="notifReplyCheck"
                    checked={notifReply}
                    onChange={e => setNotifReply(e.target.checked)}
                  />
                  <label className="form-check-label small text-dark" htmlFor="notifReplyCheck">
                    Email me when an engineer replies to my ticket
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="notifResolvedCheck"
                    checked={notifResolved}
                    onChange={e => setNotifResolved(e.target.checked)}
                  />
                  <label className="form-check-label small text-dark" htmlFor="notifResolvedCheck">
                    Email me when a ticket status moves to Resolved or Closed
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="notifCsatCheck"
                    checked={notifCsat}
                    onChange={e => setNotifCsat(e.target.checked)}
                  />
                  <label className="form-check-label small text-dark" htmlFor="notifCsatCheck">
                    Send me CSAT service satisfaction surveys upon resolution
                  </label>
                </div>
              </div>

              {/* Data & Privacy Actions */}
              <h6 className="fw-bold text-dark mb-2">My Data & Privacy (DPDPA / GDPR Compliance)</h6>
              <p className="text-muted small mb-3">
                Under data privacy principles, you have the right to download all ticket records or request deletion.
              </p>
              <div className="d-flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5"
                  onClick={handleExportData}
                >
                  <Download size={14} />
                  <span>Download My Ticket History (JSON)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => alert('Deletion request logged. Your account tickets will be scrubbed after the statutory audit retention window.')}
                >
                  Request Account Deletion
                </button>
              </div>

              <div className="d-flex justify-content-between pt-3 border-top">
                <button
                  type="button"
                  className="btn btn-primary btn-sm px-4 fw-semibold"
                  onClick={() => {
                    setProfileSaved(true);
                    setTimeout(() => setProfileSaved(false), 3000);
                  }}
                >
                  Save Profile Preferences
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                  onClick={handleSignOut}
                >
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-top py-3.5 text-center text-muted small mt-auto">
        <div className="container d-flex flex-wrap justify-content-between align-items-center" style={{ maxWidth: '1200px' }}>
          <div>
            © 2026 <strong>{company?.name}</strong>. All rights reserved.
          </div>
          <div className="d-flex align-items-center gap-3">
            <a href="#terms" className="text-decoration-none text-muted">Terms of Service</a>
            <a href="#privacy" className="text-decoration-none text-muted">Privacy Policy</a>
            {onNavigateToAdmin && (
              <button
                type="button"
                className="btn btn-link btn-sm text-decoration-none text-muted p-0"
                onClick={() => onNavigateToAdmin(companySlug)}
              >
                Staff Portal
              </button>
            )}
            {onNavigateToSuperAdmin && (
              <button
                type="button"
                className="btn btn-link btn-sm text-decoration-none text-muted p-0"
                onClick={onNavigateToSuperAdmin}
              >
                Admin Console
              </button>
            )}
            <span>•</span>
            <span>Powered by <strong>YourHelpdesk SaaS Engine</strong></span>
          </div>
        </div>
      </footer>

      {/* ==============================================================
          SCREEN 10: CUSTOMER LOGIN MODAL (OTP & OAUTH)
          ============================================================== */}
      {showAuthModal && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', zIndex: 1060 }}
        >
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '440px' }}>
            <div className="modal-content rounded-4 border-0 shadow-2xl overflow-hidden">
              <div className="bg-primary p-4 text-white text-center position-relative">
                <button
                  type="button"
                  className="btn-close btn-close-white position-absolute top-0 end-0 m-3"
                  onClick={() => setShowAuthModal(false)}
                />
                <div className="d-inline-flex p-3 rounded-circle bg-white bg-opacity-20 mb-2">
                  <LifeBuoy size={28} className="text-white" />
                </div>
                <h5 className="modal-title fw-bold mb-0">Sign In to Customer Portal</h5>
                <small className="text-white text-opacity-80">Screen 10 • Track your {company?.name} tickets</small>
              </div>

              <div className="modal-body p-4">
                {/* Social OAuth Buttons */}
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <button
                      type="button"
                      className="btn btn-light border w-100 py-2 d-flex align-items-center justify-content-center gap-2 small fw-semibold"
                      onClick={() => handleOAuthLogin('Google')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.27 21.43 7.33 24 12 24z" />
                        <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.13z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.57 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z" />
                      </svg>
                      <span>Google</span>
                    </button>
                  </div>
                  <div className="col-6">
                    <button
                      type="button"
                      className="btn btn-light border w-100 py-2 d-flex align-items-center justify-content-center gap-2 small fw-semibold"
                      onClick={() => handleOAuthLogin('Microsoft')}
                    >
                      <svg width="16" height="16" viewBox="0 0 23 23">
                        <path fill="#f35325" d="M1 1h10v10H1z" />
                        <path fill="#81bc06" d="M12 1h10v10H12z" />
                        <path fill="#05a6f0" d="M1 12h10v10H1z" />
                        <path fill="#ffba08" d="M12 12h10v10H12z" />
                      </svg>
                      <span>Microsoft</span>
                    </button>
                  </div>
                </div>

                <div className="d-flex align-items-center my-3 text-muted">
                  <hr className="flex-grow-1 my-0" />
                  <span className="px-3 small text-uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.05em' }}>
                    or email sign-in code
                  </span>
                  <hr className="flex-grow-1 my-0" />
                </div>

                {otpNotice && (
                  <div className="alert alert-info py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                    <AlertCircle size={16} />
                    <span>{otpNotice}</span>
                  </div>
                )}

                {authStep === 'input' ? (
                  <form onSubmit={handleRequestOtp}>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-dark">Your Email Address</label>
                      <input
                        type="email"
                        className="form-control"
                        required
                        placeholder="name@example.com"
                        value={authEmailInput}
                        onChange={e => setAuthEmailInput(e.target.value)}
                        autoFocus
                      />
                      <small className="text-muted" style={{ fontSize: '0.72rem' }}>
                        No password needed! We will email you a secure 6-digit verification code.
                      </small>
                    </div>

                    <button
                      type="submit"
                      disabled={isRequestingOtp || !authEmailInput.trim()}
                      className="btn btn-primary w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
                    >
                      {isRequestingOtp ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                          <span>Sending Code...</span>
                        </>
                      ) : (
                        <span>Send Sign-in Code</span>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp}>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-dark">Enter 6-Digit Code</label>
                      <input
                        type="text"
                        className="form-control form-control-lg text-center font-monospace fw-bold letter-spacing-2"
                        placeholder="000000"
                        maxLength={6}
                        required
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value)}
                        autoFocus
                      />
                      <small className="text-muted d-block mt-1 text-center" style={{ fontSize: '0.75rem' }}>
                        Dev test code: <code>123456</code>
                      </small>
                    </div>

                    <button
                      type="submit"
                      disabled={!otpCode.trim()}
                      className="btn btn-primary w-100 py-2.5 fw-semibold mb-3"
                    >
                      Verify & Sign In
                    </button>

                    <div className="d-flex justify-content-between align-items-center small">
                      <button
                        type="button"
                        className="btn btn-link btn-sm text-decoration-none p-0 text-muted"
                        onClick={() => { setAuthStep('input'); setOtpCode(''); }}
                      >
                        Use different email
                      </button>
                      <span className="text-muted">
                        Resend in {otpCountdown}s
                      </span>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
