import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  LifeBuoy, Send, Search, CheckCircle2,
  Paperclip, FileText, Download,
  ArrowLeft, Clock, LogOut, Sparkles, Building2,
  RotateCcw, ThumbsUp, ThumbsDown, Star, Printer, Copy,
  ChevronRight, AlertCircle, Phone, Mail, Lock, User,
  Menu, X
} from 'lucide-react';
import { apiService } from '../services/api';
import type { Company, Department, Ticket, TicketThread, KbArticle } from '../types';

interface CustomerPortalProps {
  companySlug: string;
  subView?: 'home' | 'ticket' | 'ticketstatus';
  onNavigate?: (path: string) => void;
  onNavigateToAdmin?: (slug: string) => void;
  onNavigateToSuperAdmin?: () => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  companySlug,
  subView,
  onNavigate,
  onNavigateToAdmin,
  onNavigateToSuperAdmin,
}) => {
  const [company, setCompany] = useState<Company | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoFailed, setLogoFailed] = useState(false);
  const [portalMetadata, setPortalMetadata] = useState<{
    supportEmail?: string;
    supportPhone?: string;
    businessHours?: string;
    announcementBanner?: string;
  }>({});

  // Customer Authentication State (Screen 10)
  const [customerEmail, setCustomerEmail] = useState<string>(() => {
    return localStorage.getItem('kuwy_cust_email') || '';
  });
  const [customerName, setCustomerName] = useState<string>(() => {
    return localStorage.getItem('kuwy_cust_name') || '';
  });
  const [customerPhone, setCustomerPhone] = useState<string>('+91 98765 43210');
  const [customerOrg, setCustomerOrg] = useState<string>('Apex Auto Dealers Ltd');

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem('kuwy_cust_email') && !!localStorage.getItem('kuwy_cust_token');
  });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authStep, setAuthStep] = useState<'input' | 'otp'>('input');
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState<number>(60);
  const [isRequestingOtp, setIsRequestingOtp] = useState<boolean>(false);

  // Active View Tab: 'home' | 'submit' | 'tickets' | 'ticket-detail' | 'kb' | 'article' | 'profile'
  const [activeTab, setActiveTab] = useState<'home' | 'submit' | 'tickets' | 'ticket-detail' | 'kb' | 'article' | 'profile'>(() => {
    if (subView === 'ticket') return 'submit';
    if (subView === 'ticketstatus') return 'tickets';
    return 'home';
  });

  // Sync activeTab with incoming subView prop
  useEffect(() => {
    if (subView === 'ticket') {
      setActiveTab('submit');
      setSubmitSuccess(null);
    } else if (subView === 'ticketstatus') {
      setActiveTab('tickets');
    } else if (subView === 'home') {
      setActiveTab('home');
    }
    setMobileMenuOpen(false);
    setShowUserMenu(false);
  }, [subView]);

  // Reset logo failure on company change
  useEffect(() => {
    setLogoFailed(false);
  }, [companySlug, company?.logoUrl]);
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
    } catch (err: any) {
      if (err.response?.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem('kuwy_cust_token');
      }
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

  const handleQuickCustomerLogin = async (email: string, name: string) => {
    try {
      const res = await apiService.demoCustomerLogin(companySlug, email);
      const token = res.token || ('cust_token_' + Date.now());
      localStorage.setItem('kuwy_cust_email', email);
      localStorage.setItem('kuwy_cust_name', name);
      localStorage.setItem('kuwy_cust_token', token);
      setCustomerEmail(email);
      setCustomerName(name);
      setIsAuthenticated(true);
      setShowAuthModal(false);
      setTimeout(() => loadCustomerTickets(), 50);
    } catch {
      localStorage.setItem('kuwy_cust_email', email);
      localStorage.setItem('kuwy_cust_name', name);
      localStorage.setItem('kuwy_cust_token', 'cust_demo_' + Date.now());
      setCustomerEmail(email);
      setCustomerName(name);
      setIsAuthenticated(true);
      setShowAuthModal(false);
      loadCustomerTickets();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiService.verifyPortalOtp(companySlug, authEmailInput.trim(), otpCode.trim());
      const verifiedEmail = res.email || authEmailInput.trim();
      const verifiedName = customerName || authEmailInput.split('@')[0];
      localStorage.setItem('kuwy_cust_email', verifiedEmail);
      localStorage.setItem('kuwy_cust_name', verifiedName);
      localStorage.setItem('kuwy_cust_token', res.token || 'cust_token');

      setCustomerEmail(verifiedEmail);
      setCustomerName(verifiedName);
      setIsAuthenticated(true);
      setShowAuthModal(false);
      setAuthStep('input');
      setOtpCode('');
      setOtpNotice(null);
      loadCustomerTickets();
    } catch (err: any) {
      setOtpNotice(err.response?.data?.error || 'Invalid OTP code. Use test code 123456');
    }
  };

  const handleOAuthLogin = async (provider: 'Google' | 'Microsoft') => {
    const demoEmail = provider === 'Google' ? 'priya.customer@gmail.com' : 'loan.applicant@gmail.com';
    const demoName = provider === 'Google' ? 'Priya Sharma' : 'Rajesh Kannan';
    try {
      const res = await apiService.demoCustomerLogin(companySlug, demoEmail);
      const token = res.token || ('cust_token_' + Date.now());
      localStorage.setItem('kuwy_cust_email', demoEmail);
      localStorage.setItem('kuwy_cust_name', demoName);
      localStorage.setItem('kuwy_cust_token', token);
      setCustomerEmail(demoEmail);
      setCustomerName(demoName);
      setIsAuthenticated(true);
      setShowAuthModal(false);
      setTimeout(() => loadCustomerTickets(), 50);
    } catch {
      localStorage.setItem('kuwy_cust_email', demoEmail);
      localStorage.setItem('kuwy_cust_name', demoName);
      localStorage.setItem('kuwy_cust_token', 'cust_oauth_' + Date.now());
      setCustomerEmail(demoEmail);
      setCustomerName(demoName);
      setIsAuthenticated(true);
      setShowAuthModal(false);
      loadCustomerTickets();
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('kuwy_cust_email');
    localStorage.removeItem('kuwy_cust_name');
    localStorage.removeItem('kuwy_cust_token');
    setIsAuthenticated(false);
    setCustomerEmail('');
    setCustomerName('');
    setMyTickets([]);
    setShowUserMenu(false);
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

  // Dedicated Authentication Barrier for /ticket and /ticketstatus
  const renderAuthBarrier = (target: 'ticket' | 'ticketstatus') => {
    const isTicket = target === 'ticket';
    return (
      <div className="card border-0 shadow-sm rounded-4 p-3.5 p-sm-4 p-md-5 bg-white mx-auto animate-fade-in my-2 my-md-3 w-100" style={{ maxWidth: '580px' }}>
        <div className="text-center mb-3 mb-md-4">
          <div
            className="p-3 rounded-circle d-inline-flex align-items-center justify-content-center mb-2.5 mb-md-3 shadow-xs"
            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
          >
            <Lock size={28} />
          </div>
          <div>
            <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-3 py-1 mb-2 fw-semibold" style={{ fontSize: '0.72rem' }}>
              Authentication Required • Access Protected
            </span>
          </div>
          <h4 className="fw-bolder text-dark mb-1 fs-5 fs-md-4">
            {isTicket ? 'Sign In to Submit Support Ticket' : 'Sign In to Track Tickets & Status'}
          </h4>
          <p className="text-muted small mb-0 px-2" style={{ maxWidth: '460px', margin: '0 auto', fontSize: '0.84rem' }}>
            {isTicket
              ? 'Without sign-in, ticket creation cannot be granted. Whichever email ID you sign in with becomes the locked default "from" email for SLA tracking and notifications.'
              : 'Without sign-in, access cannot be granted. Sign in with your customer email to view your open requests, SLA countdowns, and engineer replies.'}
          </p>
        </div>

        {/* 1. Quick One-Click Demo Logins */}
        <div className="p-2.5 p-sm-3 rounded-3 bg-light border mb-3 mb-md-4">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <small className="text-secondary fw-bold text-uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.04em' }}>
              One-Click Demo Customer Access
            </small>
            <span className="badge bg-primary-subtle text-primary" style={{ fontSize: '0.62rem' }}>Instant Sign-in</span>
          </div>
          <div className="d-grid gap-2">
            <button
              type="button"
              className="btn btn-sm btn-white bg-white border text-start d-flex align-items-center justify-content-between py-2 px-2.5 px-sm-3 rounded-3 hover-shadow transition-all"
              onClick={() => handleQuickCustomerLogin('loan.applicant@gmail.com', 'Rajesh Kannan')}
            >
              <div className="text-truncate me-2">
                <div className="fw-bold text-dark small text-truncate">Rajesh Kannan</div>
                <div className="text-muted text-truncate" style={{ fontSize: '0.72rem' }}>loan.applicant@gmail.com • Loan Customer</div>
              </div>
              <span className="btn btn-xs btn-primary rounded-pill px-2.5 py-1 fw-bold flex-shrink-0" style={{ fontSize: '0.68rem' }}>
                Sign In →
              </span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-white bg-white border text-start d-flex align-items-center justify-content-between py-2 px-2.5 px-sm-3 rounded-3 hover-shadow transition-all"
              onClick={() => handleQuickCustomerLogin('priya.customer@gmail.com', 'Priya Sharma')}
            >
              <div className="text-truncate me-2">
                <div className="fw-bold text-dark small text-truncate">Priya Sharma</div>
                <div className="text-muted text-truncate" style={{ fontSize: '0.72rem' }}>priya.customer@gmail.com • KYC Applicant</div>
              </div>
              <span className="btn btn-xs btn-outline-primary rounded-pill px-2.5 py-1 fw-bold flex-shrink-0" style={{ fontSize: '0.68rem' }}>
                Sign In →
              </span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="position-relative text-center my-3">
          <hr className="border-secondary-subtle" />
          <span className="position-absolute top-50 start-50 translate-middle bg-white px-2 small text-muted" style={{ fontSize: '0.72rem' }}>
            OR VERIFY YOUR EMAIL
          </span>
        </div>

        {/* 2. Email OTP Verification */}
        {authStep === 'input' ? (
          <form onSubmit={handleRequestOtp} className="mb-3">
            <label className="form-label small fw-bold text-dark">Your Email Address *</label>
            <div className="input-group mb-1">
              <span className="input-group-text bg-light text-muted">
                <Mail size={16} />
              </span>
              <input
                type="email"
                className="form-control"
                placeholder="name@example.com"
                required
                value={authEmailInput}
                onChange={e => setAuthEmailInput(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary fw-semibold px-3"
                disabled={isRequestingOtp || !authEmailInput.trim()}
              >
                {isRequestingOtp ? 'Sending...' : 'Send OTP'}
              </button>
            </div>
            {otpNotice && (
              <div className="small text-danger mt-1">{otpNotice}</div>
            )}
            <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>
              We'll send a 6-digit verification code. Test OTP: <code>123456</code>
            </small>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="p-3 bg-light rounded-3 border mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="small fw-bold text-dark">Enter OTP Code sent to:</span>
              <button
                type="button"
                className="btn btn-link btn-xs p-0 text-primary text-decoration-none"
                onClick={() => setAuthStep('input')}
              >
                Change Email
              </button>
            </div>
            <div className="badge bg-info-subtle text-info mb-2 text-wrap text-start w-100">
              {authEmailInput}
            </div>
            <div className="input-group mb-2">
              <input
                type="text"
                className="form-control text-center fw-bold fs-5"
                maxLength={6}
                placeholder="123456"
                required
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
              />
              <button type="submit" className="btn btn-success fw-bold px-3">
                Verify & Sign In
              </button>
            </div>
            {otpNotice && (
              <div className="small text-danger mb-1">{otpNotice}</div>
            )}
            <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>
              For test verification, enter default OTP: <strong>123456</strong>
            </small>
          </form>
        )}

        {/* 3. Social SSO */}
        <div className="row g-2 mb-3">
          <div className="col-12 col-sm-6">
            <button
              type="button"
              className="btn btn-light border w-100 py-2 d-flex align-items-center justify-content-center gap-2 small fw-semibold"
              onClick={() => handleOAuthLogin('Google')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.27 21.43 7.33 24 12 24z" />
                <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.13z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.57 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z" />
              </svg>
              <span>Google SSO</span>
            </button>
          </div>
          <div className="col-12 col-sm-6">
            <button
              type="button"
              className="btn btn-light border w-100 py-2 d-flex align-items-center justify-content-center gap-2 small fw-semibold"
              onClick={() => handleOAuthLogin('Microsoft')}
            >
              <svg width="15" height="15" viewBox="0 0 23 23">
                <path fill="#f35325" d="M1 1h10v10H1z" />
                <path fill="#81bc06" d="M12 1h10v10H12z" />
                <path fill="#05a6f0" d="M1 12h10v10H1z" />
                <path fill="#ffba08" d="M12 12h10v10H12z" />
              </svg>
              <span>Microsoft SSO</span>
            </button>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center pt-2 border-top">
          <button
            type="button"
            className="btn btn-link btn-sm text-secondary text-decoration-none"
            onClick={() => {
              setActiveTab('home');
              onNavigate?.('/' + companySlug);
            }}
          >
            ← Back to Help Center Home
          </button>
        </div>
      </div>
    );
  };

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
        <div className="container d-flex justify-content-between align-items-center py-2 px-3" style={{ maxWidth: '1200px' }}>
          {/* Company Brand */}
          <div
            className="d-flex align-items-center gap-2 cursor-pointer"
            onClick={() => {
              setActiveTab('home');
              setMobileMenuOpen(false);
              onNavigate?.('/' + companySlug);
            }}
            style={{ cursor: 'pointer', maxWidth: 'calc(100% - 95px)' }}
          >
            {companySlug === 'kuwy' ? (
              <div
                className="rounded-3 text-white d-flex align-items-center justify-content-center shadow-xs flex-shrink-0 fw-bold"
                style={{
                  width: '34px',
                  height: '34px',
                  background: 'linear-gradient(135deg, #0d6efd 0%, #004ecc 100%)',
                  boxShadow: '0 2px 8px rgba(13, 110, 253, 0.25)',
                }}
              >
                <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.03em' }}>K</span>
              </div>
            ) : company?.logoUrl && !logoFailed ? (
              <img
                src={company.logoUrl}
                alt=""
                onError={() => setLogoFailed(true)}
                style={{ height: '30px', maxWidth: '110px', objectFit: 'contain' }}
              />
            ) : (
              <div
                className="rounded-3 text-white d-flex align-items-center justify-content-center shadow-xs flex-shrink-0 fw-bold"
                style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: primaryColor,
                  fontSize: '0.95rem',
                  letterSpacing: '-0.02em',
                }}
              >
                {company?.name ? company.name.charAt(0).toUpperCase() : 'K'}
              </div>
            )}
            <div className="text-truncate">
              <h5 className="fw-bolder mb-0 text-dark text-truncate" style={{ letterSpacing: '-0.02em', fontSize: '0.96rem' }}>
                {company?.name || (companySlug === 'kuwy' ? 'Kuwy Technology Services Pvt Ltd' : 'Customer Support')}
              </h5>
              <small className="text-muted d-none d-sm-block text-truncate" style={{ fontSize: '0.7rem', marginTop: '-2px' }}>
                Official Help Center & Support Portal
              </small>
            </div>
          </div>

          {/* Desktop Navigation Items (Hidden on mobile) */}
          <div className="d-none d-md-flex align-items-center gap-1.5">
            <button
              type="button"
              className={`btn btn-sm rounded-3 fw-semibold ${activeTab === 'home' ? 'btn-light text-primary fw-bold' : 'btn-link text-secondary text-decoration-none'}`}
              onClick={() => {
                setActiveTab('home');
                onNavigate?.('/' + companySlug);
              }}
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
              onClick={() => {
                setActiveTab('submit');
                setSubmitSuccess(null);
                onNavigate?.('/' + companySlug + '/ticket');
              }}
            >
              Submit Ticket
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-3 fw-semibold position-relative ${activeTab === 'tickets' ? 'btn-light text-primary fw-bold' : 'btn-link text-secondary text-decoration-none'}`}
              onClick={() => {
                setActiveTab('tickets');
                onNavigate?.('/' + companySlug + '/ticketstatus');
              }}
            >
              My Tickets
              {myTickets.length > 0 && (
                <span className="badge rounded-pill bg-primary ms-1.5" style={{ fontSize: '0.65rem' }}>
                  {myTickets.length}
                </span>
              )}
            </button>

            {/* Desktop Customer Account Dropdown */}
            {isAuthenticated ? (
              <div className="position-relative ms-2">
                <button
                  type="button"
                  className="btn btn-sm btn-light border rounded-pill d-flex align-items-center gap-2 py-1 px-2.5 shadow-xs"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                >
                  <div
                    className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold"
                    style={{ width: '24px', height: '24px', backgroundColor: primaryColor, fontSize: '0.75rem' }}
                  >
                    {customerName ? customerName.charAt(0).toUpperCase() : (customerEmail ? customerEmail.charAt(0).toUpperCase() : 'C')}
                  </div>
                  <span className="small fw-semibold text-dark text-truncate" style={{ maxWidth: '120px' }}>
                    {customerName || customerEmail.split('@')[0]}
                  </span>
                </button>

                {showUserMenu && (
                  <div
                    className="position-absolute end-0 mt-2 bg-white rounded-3 shadow-lg border p-2 animate-fade-in"
                    style={{ minWidth: '230px', zIndex: 1070 }}
                  >
                    <div className="px-3 py-2 border-bottom">
                      <div className="fw-bold small text-dark text-truncate">{customerName || 'Verified Customer'}</div>
                      <div className="text-muted text-truncate" style={{ fontSize: '0.72rem' }}>{customerEmail}</div>
                      <span className="badge bg-success-subtle text-success border border-success-subtle mt-1" style={{ fontSize: '0.65rem' }}>
                        Authenticated
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-light w-100 text-start mt-1 d-flex align-items-center gap-2"
                      onClick={() => {
                        setShowUserMenu(false);
                        setActiveTab('tickets');
                        onNavigate?.('/' + companySlug + '/ticketstatus');
                      }}
                    >
                      <Clock size={14} /> My Tickets ({myTickets.length})
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-light w-100 text-start d-flex align-items-center gap-2"
                      onClick={() => {
                        setShowUserMenu(false);
                        setActiveTab('submit');
                        setSubmitSuccess(null);
                        onNavigate?.('/' + companySlug + '/ticket');
                      }}
                    >
                      <Send size={14} /> Submit New Ticket
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-light w-100 text-start d-flex align-items-center gap-2"
                      onClick={() => {
                        setShowUserMenu(false);
                        setActiveTab('profile');
                      }}
                    >
                      <User size={14} /> Profile & Settings
                    </button>
                    <hr className="my-1" />
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger w-100 text-start d-flex align-items-center gap-2 text-danger"
                      onClick={() => {
                        setShowUserMenu(false);
                        handleSignOut();
                      }}
                    >
                      <LogOut size={14} /> Sign Out
                    </button>
                  </div>
                )}
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

          {/* Mobile Right Controls: Avatar/Sign-in + Hamburger Toggle (Mobile only) */}
          <div className="d-flex d-md-none align-items-center gap-1.5">
            {isAuthenticated ? (
              <button
                type="button"
                className="btn btn-sm btn-light border rounded-circle p-0 d-flex align-items-center justify-content-center"
                style={{ width: '30px', height: '30px' }}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="User Account Menu"
              >
                <div
                  className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold"
                  style={{ width: '24px', height: '24px', backgroundColor: primaryColor, fontSize: '0.72rem' }}
                >
                  {customerName ? customerName.charAt(0).toUpperCase() : 'C'}
                </div>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-xs btn-outline-primary rounded-pill px-2.5 py-1 fw-semibold"
                style={{ fontSize: '0.74rem' }}
                onClick={() => { setAuthStep('input'); setShowAuthModal(true); }}
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              className="btn btn-sm btn-light border rounded-3 p-1 d-flex align-items-center justify-content-center"
              style={{ width: '32px', height: '32px' }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="d-md-none bg-white border-top shadow-lg p-3 animate-fade-in">
            {isAuthenticated ? (
              <div className="p-2.5 rounded-3 bg-light border mb-2.5 d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-2 text-truncate me-2">
                  <div
                    className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                    style={{ width: '30px', height: '30px', backgroundColor: primaryColor, fontSize: '0.75rem' }}
                  >
                    {customerName ? customerName.charAt(0).toUpperCase() : 'C'}
                  </div>
                  <div className="text-truncate">
                    <div className="fw-bold small text-dark text-truncate">{customerName}</div>
                    <div className="text-muted text-truncate" style={{ fontSize: '0.7rem' }}>{customerEmail}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-outline-danger rounded-pill px-2 py-0.5 flex-shrink-0"
                  style={{ fontSize: '0.7rem' }}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="mb-2.5">
                <button
                  type="button"
                  className="btn btn-primary w-100 py-2 fw-semibold rounded-3 d-flex align-items-center justify-content-center gap-2 shadow-xs"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setAuthStep('input');
                    setShowAuthModal(true);
                  }}
                >
                  <User size={16} /> Sign In to Your Account
                </button>
              </div>
            )}

            <div className="d-grid gap-1">
              <button
                type="button"
                className={`btn btn-sm text-start py-2 px-3 rounded-3 d-flex align-items-center justify-content-between ${activeTab === 'home' ? 'btn-primary text-white' : 'btn-light text-dark'}`}
                onClick={() => {
                  setActiveTab('home');
                  setMobileMenuOpen(false);
                  onNavigate?.('/' + companySlug);
                }}
              >
                <div className="d-flex align-items-center gap-2">
                  <Building2 size={16} />
                  <span className="fw-semibold">Portal Home</span>
                </div>
                <span className="small opacity-75">/{companySlug}</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm text-start py-2 px-3 rounded-3 d-flex align-items-center justify-content-between ${activeTab === 'submit' ? 'btn-primary text-white' : 'btn-light text-dark'}`}
                onClick={() => {
                  setActiveTab('submit');
                  setSubmitSuccess(null);
                  setMobileMenuOpen(false);
                  onNavigate?.('/' + companySlug + '/ticket');
                }}
              >
                <div className="d-flex align-items-center gap-2">
                  <Send size={16} />
                  <span className="fw-semibold">Submit Support Ticket</span>
                </div>
                <span className="badge bg-primary-subtle text-primary border border-primary-subtle" style={{ fontSize: '0.65rem' }}>
                  /ticket
                </span>
              </button>

              <button
                type="button"
                className={`btn btn-sm text-start py-2 px-3 rounded-3 d-flex align-items-center justify-content-between ${activeTab === 'tickets' || activeTab === 'ticket-detail' ? 'btn-primary text-white' : 'btn-light text-dark'}`}
                onClick={() => {
                  setActiveTab('tickets');
                  setMobileMenuOpen(false);
                  onNavigate?.('/' + companySlug + '/ticketstatus');
                }}
              >
                <div className="d-flex align-items-center gap-2">
                  <Clock size={16} />
                  <span className="fw-semibold">Track Tickets & Status</span>
                </div>
                <div className="d-flex align-items-center gap-1.5">
                  {myTickets.length > 0 && (
                    <span className="badge rounded-pill bg-danger" style={{ fontSize: '0.68rem' }}>
                      {myTickets.length}
                    </span>
                  )}
                  <span className="small opacity-75">/ticketstatus</span>
                </div>
              </button>

              <button
                type="button"
                className={`btn btn-sm text-start py-2 px-3 rounded-3 d-flex align-items-center gap-2 ${activeTab === 'kb' || activeTab === 'article' ? 'btn-primary text-white' : 'btn-light text-dark'}`}
                onClick={() => {
                  setActiveTab('kb');
                  setSelectedKbCategory(null);
                  setMobileMenuOpen(false);
                }}
              >
                <FileText size={16} />
                <span className="fw-semibold">Help Center & Knowledge Base</span>
              </button>

              {isAuthenticated && (
                <button
                  type="button"
                  className={`btn btn-sm text-start py-2 px-3 rounded-3 d-flex align-items-center gap-2 ${activeTab === 'profile' ? 'btn-primary text-white' : 'btn-light text-dark'}`}
                  onClick={() => {
                    setActiveTab('profile');
                    setMobileMenuOpen(false);
                  }}
                >
                  <User size={16} />
                  <span className="fw-semibold">Account Preferences</span>
                </button>
              )}
            </div>
          </div>
        )}
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
          className="text-white py-4 py-md-5 text-center position-relative shadow-sm px-3"
          style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #0f172a 100%)` }}
        >
          <div className="container" style={{ maxWidth: '720px' }}>
            <span className="badge bg-white text-dark fw-bold mb-2 shadow-xs" style={{ fontSize: '0.72rem' }}>
              Screen 9 • Public Customer Portal
            </span>
            <h2 className="fw-bolder mb-2 text-white fs-3 fs-md-2" style={{ letterSpacing: '-0.02em' }}>
              How can we assist you today?
            </h2>
            <p className="text-white-50 mb-3 mb-md-4 small px-2" style={{ fontSize: '0.9rem' }}>
              Search help articles, check ticket status, or submit a request directly to our verified engineers.
            </p>

            {/* Knowledge Base Instant Search Box */}
            <div className="position-relative mx-auto" style={{ maxWidth: '580px' }}>
              <Search size={18} className="position-absolute text-muted" style={{ top: '14px', left: '16px' }} />
              <input
                type="text"
                className="form-control form-control-lg rounded-pill ps-5 pe-4 shadow-lg border-0"
                style={{ fontSize: '0.92rem' }}
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
                      <div className="text-truncate me-2">
                        <div className="fw-semibold text-dark small mb-0.5 text-truncate">{art.title}</div>
                        <small className="text-muted">{art.categoryName}</small>
                      </div>
                      <ChevronRight size={16} className="text-muted flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* MAIN CONTENT CONTAINER */}
      <main className="container py-3 py-md-4 flex-grow-1 pb-5 mb-5 mb-md-0 px-2 px-sm-3" style={{ maxWidth: '1100px' }}>

        {/* ==============================================================
            SCREEN 9: PORTAL HOME BODY
            ============================================================== */}
        {activeTab === 'home' && (
          <div>
            {/* Authenticated Customer Welcome Card */}
            {isAuthenticated && (
              <div className="card border-0 shadow-sm rounded-4 p-3 p-md-4 mb-3 mb-md-4 bg-white border-start border-4 border-primary">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                  <div>
                    <h5 className="fw-bold text-dark mb-1 fs-6 fs-md-5">Welcome back, {customerName}!</h5>
                    <p className="text-muted small mb-0">
                      Logged in as <code>{customerEmail}</code> • {myTickets.length} ticket(s) recorded in {company?.name}.
                    </p>
                  </div>
                  <div className="d-flex flex-wrap align-items-center gap-1.5 gap-md-2 mt-1 mt-sm-0">
                    <span className="badge bg-primary-subtle text-primary px-2.5 py-1 rounded-pill" style={{ fontSize: '0.75rem' }}>
                      {myTickets.filter(t => t.status === 'OPEN').length} Open
                    </span>
                    <span className="badge bg-warning-subtle text-warning-emphasis px-2.5 py-1 rounded-pill" style={{ fontSize: '0.75rem' }}>
                      {myTickets.filter(t => t.status === 'WAITING_ON_CUSTOMER').length} Waiting on you
                    </span>
                    <span className="badge bg-success-subtle text-success px-2.5 py-1 rounded-pill" style={{ fontSize: '0.75rem' }}>
                      {myTickets.filter(t => t.status === 'RESOLVED').length} Resolved
                    </span>
                    <button
                      className="btn btn-sm btn-outline-primary fw-semibold rounded-pill ms-auto ms-sm-2 px-3 py-1"
                      onClick={() => {
                        setActiveTab('tickets');
                        onNavigate?.('/' + companySlug + '/ticketstatus');
                      }}
                    >
                      View All Tickets →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Two Action Cards */}
            <div className="row g-3 g-md-4 mb-3 mb-md-4">
              <div className="col-12 col-md-6">
                <div
                  className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 h-100 cursor-pointer hover-shadow transition-all bg-white"
                  onClick={() => {
                    setActiveTab('submit');
                    setSubmitSuccess(null);
                    onNavigate?.('/' + companySlug + '/ticket');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="d-flex align-items-center gap-3 mb-2.5 mb-md-3">
                    <div className="p-2.5 p-md-3 rounded-3 bg-primary-subtle text-primary flex-shrink-0">
                      <Send size={22} />
                    </div>
                    <div>
                      <h5 className="fw-bold mb-0 text-dark fs-6 fs-md-5">Submit a New Ticket</h5>
                      <small className="text-muted" style={{ fontSize: '0.75rem' }}>Intake routed to dedicated category engineers</small>
                    </div>
                  </div>
                  <p className="text-secondary small mb-3" style={{ fontSize: '0.82rem' }}>
                    Raise an inquiry with documents, loan contracts, proof receipts, or error logs. You receive an immediate tracking ticket number e.g. <code>#KUWY-1042</code>.
                  </p>
                  <span className="text-primary fw-bold small d-inline-flex align-items-center gap-1">
                    Open submission form →
                  </span>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div
                  className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 h-100 cursor-pointer hover-shadow transition-all bg-white"
                  onClick={() => {
                    setActiveTab('tickets');
                    onNavigate?.('/' + companySlug + '/ticketstatus');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="d-flex align-items-center gap-3 mb-2.5 mb-md-3">
                    <div className="p-2.5 p-md-3 rounded-3 bg-success-subtle text-success flex-shrink-0">
                      <Clock size={22} />
                    </div>
                    <div>
                      <h5 className="fw-bold mb-0 text-dark fs-6 fs-md-5">Track Your Tickets</h5>
                      <small className="text-muted" style={{ fontSize: '0.75rem' }}>Check live status, SLAs and engineer replies</small>
                    </div>
                  </div>
                  <p className="text-secondary small mb-3" style={{ fontSize: '0.82rem' }}>
                    Access conversation threads, download attachments sent by our team, reply with more details, or reopen resolved requests.
                  </p>
                  <span className="text-success fw-bold small d-inline-flex align-items-center gap-1">
                    {isAuthenticated ? `View your ${myTickets.length} ticket(s) →` : 'Sign in to track →'}
                  </span>
                </div>
              </div>
            </div>

            {/* Popular Topics / Category Cards */}
            <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 bg-white mb-3 mb-md-4">
              <h6 className="fw-bold text-dark mb-3">Popular Categories</h6>
              <div className="row g-2.5 g-md-3">
                {departments.slice(0, 4).map(d => (
                  <div key={d.id} className="col-6 col-md-3">
                    <div
                      className="p-2.5 p-sm-3 border rounded-3 bg-light hover-bg-white cursor-pointer transition-all h-100 text-center"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedKbCategory(d.name);
                        setActiveTab('kb');
                      }}
                    >
                      <div className="p-2 rounded-circle bg-white d-inline-flex text-primary mb-1.5 shadow-xs">
                        <Building2 size={18} />
                      </div>
                      <div className="fw-bold small text-dark mb-1 text-truncate">{d.name}</div>
                      <small className="text-muted d-block text-truncate" style={{ fontSize: '0.7rem' }}>
                        {d.description || 'Guides and answers'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Popular Solutions & Guides List */}
            <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 bg-white mb-3 mb-md-4">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
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

              <div className="row g-2.5 g-md-3">
                {kbArticles.slice(0, 4).map(art => (
                  <div key={art.id} className="col-12 col-md-6">
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
                      <p className="text-muted mb-0 text-truncate" style={{ fontSize: '0.76rem' }}>
                        Click to view complete troubleshooting steps and resolution guide.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact Details & Hours Card */}
            <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 bg-white">
              <div className="row g-3 align-items-center">
                <div className="col-12 col-md-4">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-primary-subtle text-primary flex-shrink-0">
                      <Mail size={18} />
                    </div>
                    <div className="text-truncate">
                      <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>Support Email</small>
                      <span className="fw-bold text-dark small text-truncate d-block">{portalMetadata.supportEmail}</span>
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-success-subtle text-success flex-shrink-0">
                      <Phone size={18} />
                    </div>
                    <div>
                      <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>Helpline Phone</small>
                      <span className="fw-bold text-dark small d-block">{portalMetadata.supportPhone}</span>
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-warning-subtle text-warning flex-shrink-0">
                      <Clock size={18} />
                    </div>
                    <div>
                      <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>Business Hours</small>
                      <span className="fw-bold text-dark small d-block">{portalMetadata.businessHours}</span>
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
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <button
                type="button"
                className="btn btn-sm btn-link text-secondary text-decoration-none p-0 d-flex align-items-center gap-1"
                onClick={() => {
                  setActiveTab('home');
                  setSubmitSuccess(null);
                  onNavigate?.('/' + companySlug);
                }}
              >
                <ArrowLeft size={15} /> Back to Home
              </button>
              <span className="small text-muted">Screen 11 • Public Ticket Submission</span>
            </div>

            {!isAuthenticated ? (
              renderAuthBarrier('ticket')
            ) : submitSuccess ? (
              <div className="card border-0 shadow-sm rounded-4 p-4 p-md-5 text-center bg-white animate-fade-in mx-auto" style={{ maxWidth: '640px' }}>
                <div className="rounded-circle bg-success-subtle text-success mx-auto d-flex align-items-center justify-content-center mb-3" style={{ width: '56px', height: '56px' }}>
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="fw-bolder text-dark mb-1 fs-5 fs-md-4">Ticket Submitted Successfully!</h4>
                <p className="text-muted small mb-3">
                  We've emailed a confirmation receipt to <strong>{customerEmail}</strong>.
                </p>

                <div className="p-3 bg-light rounded-3 border mx-auto mb-4 w-100" style={{ maxWidth: '420px' }}>
                  <div className="small text-secondary mb-1">Your Tracking Number</div>
                  <h3 className="fw-bolder text-primary mb-1 fs-4 fs-md-3">#{submitSuccess.ticketNumber}</h3>
                  <div className="small text-muted text-truncate">Subject: "{submitSuccess.subject}"</div>
                  <div className="badge bg-info-subtle text-info mt-2">Expected Response: Under 15 Minutes</div>
                </div>

                <div className="d-flex flex-column flex-sm-row justify-content-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary px-3 px-sm-4 py-2 fw-semibold rounded-3 shadow-sm"
                    onClick={() => {
                      handleOpenTicketDetail(submitSuccess);
                      onNavigate?.('/' + companySlug + '/ticketstatus');
                    }}
                  >
                    View Ticket & Conversation
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary px-3 px-sm-4 py-2 fw-semibold rounded-3"
                    onClick={() => {
                      setSubmitSuccess(null);
                      setActiveTab('submit');
                      onNavigate?.('/' + companySlug + '/ticket');
                    }}
                  >
                    Submit Another Request
                  </button>
                </div>
              </div>
            ) : (
              <div className="row g-3 g-md-4">
                {/* Form Column */}
                <div className={suggestedArticles.length > 0 ? "col-12 col-lg-8" : "col-12 mx-auto"} style={{ maxWidth: suggestedArticles.length > 0 ? undefined : '780px' }}>
                  <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 bg-white">
                    <div className="border-bottom pb-3 mb-3 mb-md-4">
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-1 mb-1">
                        <h5 className="fw-bolder text-dark mb-0 fs-6 fs-md-5">Create Support Ticket</h5>
                        <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1" style={{ fontSize: '0.7rem' }}>
                          <CheckCircle2 size={11} /> Verified Customer
                        </span>
                      </div>
                      <p className="text-muted small mb-0" style={{ fontSize: '0.82rem' }}>
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
                      <div className="row g-2.5 g-md-3 mb-3">
                        <div className="col-12 col-md-6">
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
                        <div className="col-12 col-md-6">
                          <div className="d-flex flex-wrap justify-content-between align-items-center gap-1 mb-1">
                            <label className="form-label small fw-bold text-dark mb-0">Your Email Address *</label>
                            <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1" style={{ fontSize: '0.66rem' }}>
                              <CheckCircle2 size={10} /> Verified Sign-in
                            </span>
                          </div>
                          <div className="input-group">
                            <span className="input-group-text bg-light text-muted">
                              <Lock size={15} />
                            </span>
                            <input
                              type="email"
                              className="form-control bg-light text-dark fw-semibold"
                              required
                              value={customerEmail}
                              readOnly
                              title="Locked to signed-in customer email"
                            />
                          </div>
                          <small className="text-muted d-block mt-1" style={{ fontSize: '0.72rem' }}>
                            Default from email: <strong>{customerEmail}</strong>. SLA responses will be delivered here.
                          </small>
                        </div>
                      </div>

                      {/* Category & Priority */}
                      <div className="row g-2.5 g-md-3 mb-3">
                        <div className="col-12 col-md-7">
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
                        <div className="col-12 col-md-5">
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
            {!isAuthenticated ? (
              renderAuthBarrier('ticketstatus')
            ) : (
              <div>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 mb-md-4">
                  <div>
                    <h4 className="fw-bolder text-dark mb-1 fs-5 fs-md-4">My Support Tickets</h4>
                    <p className="text-muted small mb-0" style={{ fontSize: '0.82rem' }}>
                      Showing inquiries associated with <strong>{customerEmail}</strong> in {company?.name}.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm fw-semibold d-flex align-items-center justify-content-center gap-1.5 px-3 py-2 shadow-xs w-100 w-sm-auto"
                    onClick={() => {
                      setActiveTab('submit');
                      setSubmitSuccess(null);
                      onNavigate?.('/' + companySlug + '/ticket');
                    }}
                  >
                    <Send size={15} />
                    <span>Submit a New Ticket</span>
                  </button>
                </div>

                {/* Filter Chips & Search Bar (Mobile Responsive) */}
                <div className="card border-0 shadow-sm rounded-4 p-2.5 p-sm-3 mb-3 mb-md-4 bg-white">
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-stretch align-items-md-center gap-2.5">
                    <div className="d-flex align-items-center gap-1.5 overflow-x-auto text-nowrap pb-1 pb-md-0 w-100" style={{ WebkitOverflowScrolling: 'touch' }}>
                      {(['ALL', 'OPEN', 'WAITING', 'RESOLVED', 'CLOSED'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold flex-shrink-0 ${ticketFilter === f ? 'btn-primary shadow-xs' : 'btn-light text-muted border-0'}`}
                          onClick={() => setTicketFilter(f)}
                          style={{ fontSize: '0.78rem' }}
                        >
                          {f === 'WAITING' ? 'Waiting on You' : f}
                        </button>
                      ))}
                    </div>

                    <div className="input-group input-group-sm w-100 flex-shrink-0" style={{ maxWidth: '280px' }}>
                      <span className="input-group-text bg-light border-end-0">
                        <Search size={14} className="text-muted" />
                      </span>
                      <input
                        type="text"
                        className="form-control bg-light border-start-0"
                        placeholder="Search ticket # or subject..."
                        value={ticketSearchTerm}
                        onChange={e => setTicketSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Desktop Tickets Table (Hidden on mobile) */}
                <div className="d-none d-md-block card border-0 shadow-sm rounded-4 bg-white overflow-hidden">
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
                                <span className={`badge px-2.5 py-1 ${t.status === 'OPEN' ? 'bg-primary-subtle text-primary border border-primary-subtle' :
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

                {/* Mobile Ticket Cards Stack (Screen 12 Mobile - Hidden on desktop) */}
                <div className="d-md-none d-flex flex-column gap-2.5">
                  {filteredTickets.length === 0 ? (
                    <div className="card border-0 shadow-sm rounded-4 p-4 text-center text-muted bg-white">
                      <LifeBuoy size={36} className="text-muted opacity-50 mb-2 mx-auto" />
                      <div className="fw-semibold">No tickets found in this view</div>
                      <small className="text-muted">Submit an inquiry or change the filter tab.</small>
                    </div>
                  ) : (
                    filteredTickets.map(t => (
                      <div
                        key={t.id}
                        className="card border-0 shadow-sm rounded-3 p-3 bg-white cursor-pointer hover-shadow transition-all"
                        onClick={() => handleOpenTicketDetail(t)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace fw-bold" style={{ fontSize: '0.75rem' }}>
                            #{t.ticketNumber}
                          </span>
                          <span className={`badge px-2 py-0.5 ${
                            t.status === 'OPEN' ? 'bg-primary-subtle text-primary border border-primary-subtle' :
                            t.status === 'RESOLVED' ? 'bg-success-subtle text-success border border-success-subtle' :
                            t.status === 'WAITING_ON_CUSTOMER' ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' :
                            'bg-secondary-subtle text-secondary'
                          }`} style={{ fontSize: '0.68rem' }}>
                            {t.status}
                          </span>
                        </div>

                        <div className="fw-bold text-dark mb-1.5" style={{ fontSize: '0.92rem', lineHeight: '1.35' }}>
                          {t.subject}
                        </div>

                        {t.status === 'WAITING_ON_CUSTOMER' && (
                          <div className="alert alert-warning py-1 px-2 mb-2 d-flex align-items-center gap-1.5" style={{ fontSize: '0.72rem' }}>
                            <AlertCircle size={13} className="text-warning-emphasis flex-shrink-0" />
                            <span>Agent waiting for your reply</span>
                          </div>
                        )}

                        <div className="d-flex align-items-center justify-content-between pt-2 border-top mt-1">
                          <div className="d-flex align-items-center gap-1.5 text-truncate me-2">
                            <span className="badge bg-light text-secondary border text-truncate" style={{ fontSize: '0.68rem', maxWidth: '140px' }}>
                              {t.department?.name || 'General'}
                            </span>
                            <span className="badge bg-light text-muted border" style={{ fontSize: '0.65rem' }}>
                              {t.priority}
                            </span>
                          </div>
                          <div className="d-flex align-items-center gap-1 text-muted flex-shrink-0" style={{ fontSize: '0.72rem' }}>
                            <span>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Today'}</span>
                            <ChevronRight size={14} className="text-muted" />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==============================================================
            SCREEN 13: TICKET DETAIL & REPLY CONVERSATION VIEW
            ============================================================== */}
        {activeTab === 'ticket-detail' && (
          <div>
            {!isAuthenticated ? (
              renderAuthBarrier('ticketstatus')
            ) : selectedTicket ? (
              <div>
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-secondary text-decoration-none p-0 d-flex align-items-center gap-1"
                    onClick={() => {
                      setSelectedTicket(null);
                      setActiveTab('tickets');
                      onNavigate?.('/' + companySlug + '/ticketstatus');
                    }}
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
                <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 mb-3 mb-md-4 bg-white">
                  <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start gap-2.5">
                    <div>
                      <div className="d-flex flex-wrap align-items-center gap-1.5 mb-1.5">
                        <span className="badge bg-primary text-white font-monospace">#{selectedTicket.ticketNumber}</span>
                        <span className="badge bg-light text-dark border">{selectedTicket.department?.name || 'Support'}</span>
                        <span className={`badge ${
                          selectedTicket.status === 'OPEN' ? 'bg-primary-subtle text-primary border border-primary-subtle' :
                          selectedTicket.status === 'RESOLVED' ? 'bg-success-subtle text-success border border-success-subtle' :
                          selectedTicket.status === 'WAITING_ON_CUSTOMER' ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' :
                          'bg-secondary-subtle text-secondary'
                        }`}>{selectedTicket.status}</span>
                      </div>
                      <h4 className="fw-bolder text-dark mb-0 fs-5 fs-md-4">{selectedTicket.subject}</h4>
                    </div>
                    <div className="text-start text-sm-end text-muted small mt-1 mt-sm-0 flex-shrink-0">
                      <div>Opened: {selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleDateString() : 'Today'}</div>
                      <div>SLA Status: <span className="text-success fw-bold">Within SLA</span></div>
                    </div>
                  </div>
                </div>

                {/* Conversation Thread (Screen 13: Oldest to Newest Timeline) */}
                <div className="d-flex flex-column gap-2.5 gap-md-3 mb-3 mb-md-4">
                  {/* Initial Ticket Description Message */}
                  <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 bg-white border-start border-4 border-primary">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold" style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                          {selectedTicket.contact?.firstName?.charAt(0) || 'C'}
                        </div>
                        <div>
                          <div className="fw-bold text-dark small">{selectedTicket.contact?.firstName || 'You'}</div>
                          <small className="text-muted" style={{ fontSize: '0.7rem' }}>Requester</small>
                        </div>
                      </div>
                      <small className="text-muted">{selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00 AM'}</small>
                    </div>
                    <div className="text-secondary small mt-2 lh-base" style={{ wordBreak: 'break-word' }}>
                      {selectedTicket.descriptionText || selectedTicket.descriptionHtml || 'Original ticket description provided during intake.'}
                    </div>
                  </div>

                  {/* Dynamic Conversation Threads */}
                  {ticketThreads.map(th => {
                    const isCustomer = th.senderType === 'CUSTOMER';
                    return (
                      <div
                        key={th.id}
                        className={`card border-0 shadow-sm rounded-4 p-3.5 p-md-4 ${isCustomer ? 'bg-white border-start border-4 border-info' : 'bg-light border-start border-4 border-success'}`}
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
                              <small className="text-muted" style={{ fontSize: '0.7rem' }}>{isCustomer ? 'Customer' : 'Certified Support Engineer'}</small>
                            </div>
                          </div>
                          <small className="text-muted">
                            {th.createdAt ? new Date(th.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                          </small>
                        </div>
                        <div
                          className="text-secondary small mt-2 lh-base"
                          style={{ wordBreak: 'break-word' }}
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(th.bodyHtml || th.bodyText || '') }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* CSAT Satisfaction Widget when ticket is RESOLVED or CLOSED */}
                {(selectedTicket.status === 'RESOLVED' || selectedTicket.status === 'CLOSED') && (
                  <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 mb-3 mb-md-4 bg-white border-top border-4 border-warning">
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
                        <p className="text-muted small mb-2.5">Rate your experience with our engineering support:</p>
                        <div className="d-flex flex-wrap gap-2 mb-3">
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
                        <button type="submit" className="btn btn-warning btn-sm fw-bold w-100 w-sm-auto">
                          Submit Feedback
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* Reply Box */}
                <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 bg-white">
                  <h6 className="fw-bold text-dark mb-2.5">Post a Reply to this Thread</h6>
                  <form onSubmit={handleSendReply}>
                    <textarea
                      className="form-control mb-3"
                      rows={3}
                      required
                      placeholder="Type your response here... Replying automatically marks this ticket Open."
                      value={customerReplyText}
                      onChange={e => setCustomerReplyText(e.target.value)}
                    />
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-stretch align-items-sm-center gap-2">
                      <span className="small text-muted" style={{ fontSize: '0.78rem' }}>
                        Your message will be sent to the assigned engineer.
                      </span>
                      <button
                        type="submit"
                        disabled={isReplying || !customerReplyText.trim()}
                        className="btn btn-primary btn-sm px-4 py-2 fw-semibold d-flex align-items-center justify-content-center gap-2 w-100 w-sm-auto"
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
            ) : null}
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
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedArticle.contentHtml) }}
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
                onClick={() => {
                  setActiveTab('home');
                  onNavigate?.('/' + companySlug);
                }}
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
      <footer className="bg-white border-top py-3.5 text-center text-muted small mt-auto mb-5 mb-md-0 pb-4 pb-md-3">
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

      {/* Mobile Fixed Bottom Navigation Bar (Screens 9, 11, 12, 13, 14, 15) */}
      <nav
        className="d-md-none fixed-bottom bg-white border-top shadow-lg py-1 px-2 z-3"
        style={{
          boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
          zIndex: 1040,
        }}
      >
        <div className="d-flex align-items-center justify-content-around">
          <button
            type="button"
            className={`btn btn-link text-decoration-none py-1 px-1 d-flex flex-column align-items-center justify-content-center flex-grow-1 ${activeTab === 'home' ? 'text-primary fw-bold' : 'text-secondary'}`}
            style={{ fontSize: '0.68rem', minWidth: 0 }}
            onClick={() => {
              setActiveTab('home');
              setMobileMenuOpen(false);
              onNavigate?.('/' + companySlug);
            }}
          >
            <Building2 size={19} className="mb-0.5" />
            <span className="text-truncate">Home</span>
          </button>

          <button
            type="button"
            className={`btn btn-link text-decoration-none py-1 px-1 d-flex flex-column align-items-center justify-content-center flex-grow-1 ${activeTab === 'submit' ? 'text-primary fw-bold' : 'text-secondary'}`}
            style={{ fontSize: '0.68rem', minWidth: 0 }}
            onClick={() => {
              setActiveTab('submit');
              setSubmitSuccess(null);
              setMobileMenuOpen(false);
              onNavigate?.('/' + companySlug + '/ticket');
            }}
          >
            <Send size={19} className="mb-0.5" />
            <span className="text-truncate">New Ticket</span>
          </button>

          <button
            type="button"
            className={`btn btn-link text-decoration-none py-1 px-1 d-flex flex-column align-items-center justify-content-center flex-grow-1 position-relative ${activeTab === 'tickets' || activeTab === 'ticket-detail' ? 'text-primary fw-bold' : 'text-secondary'}`}
            style={{ fontSize: '0.68rem', minWidth: 0 }}
            onClick={() => {
              setActiveTab('tickets');
              setMobileMenuOpen(false);
              onNavigate?.('/' + companySlug + '/ticketstatus');
            }}
          >
            <div className="position-relative">
              <Clock size={19} className="mb-0.5" />
              {myTickets.length > 0 && (
                <span
                  className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-white"
                  style={{ fontSize: '0.55rem', padding: '0.15em 0.35em' }}
                >
                  {myTickets.length}
                </span>
              )}
            </div>
            <span className="text-truncate">My Tickets</span>
          </button>

          <button
            type="button"
            className={`btn btn-link text-decoration-none py-1 px-1 d-flex flex-column align-items-center justify-content-center flex-grow-1 ${activeTab === 'kb' || activeTab === 'article' ? 'text-primary fw-bold' : 'text-secondary'}`}
            style={{ fontSize: '0.68rem', minWidth: 0 }}
            onClick={() => {
              setActiveTab('kb');
              setSelectedKbCategory(null);
              setMobileMenuOpen(false);
            }}
          >
            <FileText size={19} className="mb-0.5" />
            <span className="text-truncate">Help / KB</span>
          </button>

          {isAuthenticated ? (
            <button
              type="button"
              className={`btn btn-link text-decoration-none py-1 px-1 d-flex flex-column align-items-center justify-content-center flex-grow-1 ${activeTab === 'profile' ? 'text-primary fw-bold' : 'text-secondary'}`}
              style={{ fontSize: '0.68rem', minWidth: 0 }}
              onClick={() => {
                setActiveTab('profile');
                setMobileMenuOpen(false);
              }}
            >
              <div
                className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold mb-0.5"
                style={{ width: '19px', height: '19px', backgroundColor: primaryColor, fontSize: '0.65rem' }}
              >
                {customerName ? customerName.charAt(0).toUpperCase() : 'C'}
              </div>
              <span className="text-truncate">Account</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-link text-decoration-none py-1 px-1 d-flex flex-column align-items-center justify-content-center flex-grow-1 text-primary fw-semibold"
              style={{ fontSize: '0.68rem', minWidth: 0 }}
              onClick={() => {
                setAuthStep('input');
                setShowAuthModal(true);
                setMobileMenuOpen(false);
              }}
            >
              <Lock size={19} className="mb-0.5" />
              <span className="text-truncate">Sign In</span>
            </button>
          )}
        </div>
      </nav>

      {/* ==============================================================
          SCREEN 10: CUSTOMER LOGIN MODAL (OTP & OAUTH)
          ============================================================== */}
      {showAuthModal && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', zIndex: 1060 }}
        >
          <div className="modal-dialog modal-dialog-centered mx-3 mx-sm-auto" style={{ maxWidth: '440px' }}>
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
                {/* Quick 1-Click Demo Logins */}
                <div className="p-2.5 rounded-3 bg-light border mb-3">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <small className="text-secondary fw-bold text-uppercase" style={{ fontSize: '0.66rem' }}>
                      One-Click Demo Customer
                    </small>
                    <span className="badge bg-primary-subtle text-primary" style={{ fontSize: '0.62rem' }}>Instant</span>
                  </div>
                  <div className="d-grid gap-1.5">
                    <button
                      type="button"
                      className="btn btn-xs btn-white bg-white border text-start d-flex align-items-center justify-content-between py-1.5 px-2.5 rounded-2"
                      onClick={() => handleQuickCustomerLogin('loan.applicant@gmail.com', 'Rajesh Kannan')}
                    >
                      <div className="small fw-semibold text-dark text-truncate">Rajesh Kannan (loan.applicant@gmail.com)</div>
                      <span className="text-primary fw-bold small">Sign In →</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs btn-white bg-white border text-start d-flex align-items-center justify-content-between py-1.5 px-2.5 rounded-2"
                      onClick={() => handleQuickCustomerLogin('priya.customer@gmail.com', 'Priya Sharma')}
                    >
                      <div className="small fw-semibold text-dark text-truncate">Priya Sharma (priya.customer@gmail.com)</div>
                      <span className="text-primary fw-bold small">Sign In →</span>
                    </button>
                  </div>
                </div>

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
