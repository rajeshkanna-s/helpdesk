import React, { useState, useEffect, useRef } from 'react';
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
import { PortalSignIn } from './PortalSignIn';
import type { Company, Department, Ticket, TicketAttachment, KbArticle } from '../types';

interface CustomerPortalProps {
  companySlug: string;
  subView?: 'home' | 'ticket' | 'ticketstatus';
  onNavigate?: (path: string) => void;
  onNavigateToAdmin?: (slug: string) => void;
  onNavigateToSuperAdmin?: () => void;
}

type CustomerSession = Awaited<ReturnType<typeof apiService.getCustomerSession>>;
type CustomerProfile = Awaited<ReturnType<typeof apiService.getCustomerProfile>>;
type PortalCompany = Pick<Company, 'id' | 'name' | 'companyCode' | 'subdomain' | 'primaryColor' | 'logoUrl'>;
type ReplyDraft = { text: string; files: File[]; saved?: boolean; threadId?: number; error?: string; notice?: string };

function errorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response;
  const message = response?.data?.error || response?.data?.message;
  if (typeof message === 'string') return message;
  if ((error as { isAxiosError?: boolean })?.isAxiosError) return fallback;
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value?: string) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function verifiedProfile(value: CustomerProfile, email: string) {
  if (!value || ![value.firstName, value.lastName, value.email, value.phone, value.organizationName, value.timeZone, value.language].every(field => typeof field === 'string')
    || value.email.trim().toLowerCase() !== email.trim().toLowerCase()
    || !value.notifications || ![value.notifications.replies, value.notifications.resolved, value.notifications.surveys].every(field => typeof field === 'boolean')) {
    throw new Error('The profile response could not be verified for your signed-in account. Please retry.');
  }
  return value;
}

const CustomerProfileForm: React.FC<{
  companySlug: string; customerEmail: string; active: boolean; disabled: boolean; onNameChange: (name: string) => void;
  sessionGeneration: React.RefObject<number>;
}> = ({ companySlug, customerEmail, active, disabled, onNameChange, sessionGeneration }) => {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [draft, setDraft] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(false);
  const saveBusy = useRef(false);
  const dirty = profile !== null && draft !== null && JSON.stringify(profile) !== JSON.stringify(draft);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!active || profile) return;
    let cancelled = false;
    const generation = sessionGeneration.current;
    setLoading(true);
    setError(null);
    apiService.getCustomerProfile(companySlug).then(value => {
      if (cancelled || generation !== sessionGeneration.current) return;
      const current = verifiedProfile(value, customerEmail);
      setProfile(current);
      setDraft(current);
      setLoading(false);
      onNameChange(`${current.firstName} ${current.lastName}`.trim());
    }).catch(failure => {
      if (!cancelled && generation === sessionGeneration.current) {
        setError(errorMessage(failure, 'Unable to load your profile. Please retry.'));
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [active, companySlug, customerEmail, profile, retry, onNameChange, sessionGeneration]);

  const updateDraft = (patch: Partial<Omit<CustomerProfile, 'email'>>) => {
    setDraft(current => current ? { ...current, ...patch } : current);
    setError(null);
    setSaved(false);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!active || disabled || !draft || !dirty || saveBusy.current) return;
    const generation = sessionGeneration.current;
    const currentSession = () => mounted.current && generation === sessionGeneration.current;
    saveBusy.current = true;
    setSaving(true);
    setSaved(false);
    setError(null);
    const { firstName, lastName, phone, organizationName, timeZone, language, notifications } = draft;
    try {
      const value = await apiService.updateCustomerProfile(companySlug, { firstName, lastName, phone, organizationName, timeZone, language, notifications });
      if (!currentSession()) return;
      const current = verifiedProfile(value, customerEmail);
      setProfile(current);
      setDraft(current);
      onNameChange(`${current.firstName} ${current.lastName}`.trim());
      setSaved(true);
    } catch (failure) {
      if (currentSession()) setError(`${errorMessage(failure, 'Unable to save your profile.')} Your unsaved changes have been kept.`);
    } finally {
      if (currentSession()) { saveBusy.current = false; setSaving(false); }
    }
  };

  return (
    <form onSubmit={save} className="mb-4" aria-label="Customer profile" aria-busy={loading || saving}>
      {loading && <p className="small text-muted" role="status">Loading your profile...</p>}
      {error && <div className="alert alert-danger small" role="alert">{error}</div>}
      {!loading && !profile && <button type="button" className="btn btn-sm btn-outline-primary" disabled={disabled} onClick={() => setRetry(value => value + 1)}>Retry Profile</button>}
      {draft && <>
        <fieldset disabled={loading || saving || disabled}>
          <legend className="h6 fw-bold text-dark mb-3">Contact Details</legend>
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6">
              <label htmlFor="portal-profile-first-name" className="form-label small fw-bold text-secondary">First Name *</label>
              <input id="portal-profile-first-name" name="given-name" type="text" autoComplete="given-name" className="form-control form-control-sm" required minLength={1} maxLength={100} value={draft.firstName} onChange={event => updateDraft({ firstName: event.target.value })} />
            </div>
            <div className="col-12 col-sm-6">
              <label htmlFor="portal-profile-last-name" className="form-label small fw-bold text-secondary">Last Name (Optional)</label>
              <input id="portal-profile-last-name" name="family-name" type="text" autoComplete="family-name" className="form-control form-control-sm" minLength={1} maxLength={100} value={draft.lastName} onChange={event => updateDraft({ lastName: event.target.value })} />
            </div>
            <div className="col-12">
              <label htmlFor="portal-profile-email" className="form-label small fw-bold text-secondary">Registered Email (Read-Only)</label>
              <input id="portal-profile-email" type="email" autoComplete="email" className="form-control form-control-sm bg-light" readOnly value={draft.email} aria-describedby="portal-profile-email-help" />
              <p id="portal-profile-email-help" className="small text-muted mt-1 mb-0">This verified email identifies your account and tickets. It cannot be changed here.</p>
            </div>
            <div className="col-12 col-sm-6">
              <label htmlFor="portal-profile-phone" className="form-label small fw-bold text-secondary">Phone Number (Optional)</label>
              <input id="portal-profile-phone" name="tel" type="tel" autoComplete="tel" className="form-control form-control-sm" minLength={1} maxLength={30} value={draft.phone} onChange={event => updateDraft({ phone: event.target.value })} />
            </div>
            <div className="col-12 col-sm-6">
              <label htmlFor="portal-profile-organization" className="form-label small fw-bold text-secondary">Organization (Optional)</label>
              <input id="portal-profile-organization" name="organization" type="text" autoComplete="organization" className="form-control form-control-sm" minLength={1} maxLength={150} value={draft.organizationName} onChange={event => updateDraft({ organizationName: event.target.value })} aria-describedby="portal-profile-organization-help" />
              <p id="portal-profile-organization-help" className="small text-muted mt-1 mb-0">A contact detail only. This does not change membership or ticket access.</p>
            </div>
            <div className="col-12 col-sm-6">
              <label htmlFor="portal-profile-time-zone" className="form-label small fw-bold text-secondary">Time Zone *</label>
              <input id="portal-profile-time-zone" type="text" autoComplete="off" className="form-control form-control-sm" list="portal-profile-time-zones" required minLength={1} maxLength={64} value={draft.timeZone} onChange={event => updateDraft({ timeZone: event.target.value })} aria-describedby="portal-profile-time-zone-help" />
              <datalist id="portal-profile-time-zones"><option value="UTC" /><option value="Asia/Kolkata" /><option value="Europe/London" /><option value="America/New_York" /></datalist>
              <p id="portal-profile-time-zone-help" className="small text-muted mt-1 mb-0">Use a time zone such as Asia/Kolkata. This preference is saved; ticket dates still use your browser settings.</p>
            </div>
            <div className="col-12 col-sm-6">
              <label htmlFor="portal-profile-language" className="form-label small fw-bold text-secondary">Language</label>
              <select id="portal-profile-language" autoComplete="language" className="form-select form-select-sm" value={draft.language} onChange={event => updateDraft({ language: event.target.value })} aria-describedby="portal-profile-language-help"><option value="en">English</option></select>
              <p id="portal-profile-language-help" className="small text-muted mt-1 mb-0">English is currently the only supported portal language.</p>
            </div>
          </div>
        </fieldset>
        <fieldset disabled={loading || saving || disabled} className="bg-light p-3 rounded-3 mb-3" aria-describedby="portal-profile-notifications-help">
          <legend className="h6 fw-bold text-dark">Communication Preferences</legend>
          <p id="portal-profile-notifications-help" className="small text-muted">These choices are saved to your profile. Delivery depends on the support team's configured notifications; not all notification types are available.</p>
          {(['replies', 'resolved', 'surveys'] as const).map(choice => <div className="form-check mb-2" key={choice}>
            <input id={`portal-profile-${choice}`} className="form-check-input" type="checkbox" checked={draft.notifications[choice]} onChange={event => updateDraft({ notifications: { ...draft.notifications, [choice]: event.target.checked } })} />
            <label className="form-check-label small text-dark" htmlFor={`portal-profile-${choice}`}>{choice === 'replies' ? 'Ticket reply emails' : choice === 'resolved' ? 'Ticket resolution emails' : 'Customer satisfaction surveys'}</label>
          </div>)}
        </fieldset>
        {saved && <p className="small text-success" role="status">Profile and communication preferences saved.</p>}
        {dirty && <p className="small text-muted">Unsaved changes stay here when you switch portal sections. Reloading or signing out clears them.</p>}
        <div className="d-flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary btn-sm px-4 fw-semibold" disabled={loading || saving || disabled || !dirty}>{saving ? 'Saving Profile...' : 'Save Profile Preferences'}</button>
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={loading || saving || disabled || !dirty} onClick={() => { setDraft(profile); setError(null); setSaved(false); }}>Discard Changes</button>
        </div>
      </>}
    </form>
  );
};

// A tenant switch unmounts every personal view and draft before its next session check.
export const CustomerPortal: React.FC<CustomerPortalProps> = props => <CustomerPortalContent key={props.companySlug} {...props} />;

const CustomerPortalContent: React.FC<CustomerPortalProps> = ({
  companySlug,
  subView,
  onNavigate,
  onNavigateToAdmin,
  onNavigateToSuperAdmin,
}) => {
  const [company, setCompany] = useState<PortalCompany | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const mounted = useRef(false);
  const sessionGeneration = useRef(0);
  const portalRequest = useRef(0);
  const kbRequest = useRef(0);
  const ticketRequest = useRef(0);
  const detailRequest = useRef(0);
  const authBusy = useRef(false);
  const submitBusy = useRef(false);
  const replyBusy = useRef(false);
  const actionBusy = useRef(false);
  const signOutBusy = useRef(false);
  const csatBusy = useRef(false);
  const exportBusy = useRef(false);
  const authDialog = useRef<HTMLDialogElement>(null);
  const authReturnFocus = useRef<HTMLElement | null>(null);
  const mainContent = useRef<HTMLElement>(null);
  const [portalMetadata, setPortalMetadata] = useState<{
    supportEmail?: string;
    supportPhone?: string;
    businessHours?: string;
    announcementBanner?: string;
  }>({});

  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [sessionStatus, setSessionStatus] = useState<'checking' | 'authenticated' | 'anonymous' | 'error'>('checking');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isAuthenticated = sessionStatus === 'authenticated';
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authStep, setAuthStep] = useState<'input' | 'otp'>('input');
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [authPending, setAuthPending] = useState<'request' | 'verify' | null>(null);

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
    } else if (subView === 'ticketstatus') {
      setActiveTab(current => current === 'ticket-detail' ? current : 'tickets');
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
  const [kbLoading, setKbLoading] = useState(true);
  const [kbError, setKbError] = useState<string | null>(null);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [votingArticle, setVotingArticle] = useState<number | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<KbArticle | null>(null);
  const [selectedKbCategory, setSelectedKbCategory] = useState<string | null>(null);
  const [articleVoted, setArticleVoted] = useState<{ [id: number]: 'yes' | 'no' }>({});
  const [copiedLink, setCopiedLink] = useState(false);

  // Submit Ticket Form State (Screen 11)
  const [subject, setSubject] = useState('');
  const [deptId, setDeptId] = useState<number | ''>('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [honeypot, setHoneypot] = useState('');
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<Ticket | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // My Tickets State (Screen 12)
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [ticketQuery, setTicketQuery] = useState({ page: 0, q: '', status: 'ALL' });
  const ticketFilter = ticketQuery.status;
  const ticketSearchTerm = ticketQuery.q;
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketPage, setTicketPage] = useState({ number: 0, size: 25, totalElements: 0, totalPages: 0 });
  const [allTicketTotal, setAllTicketTotal] = useState<number | null>(null);
  const [ticketRevision, setTicketRevision] = useState(0);

  // Ticket Detail & Conversation View State (Screen 13)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [ticketActionError, setTicketActionError] = useState<string | null>(null);
  const [isUpdatingTicket, setIsUpdatingTicket] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, ReplyDraft>>({});
  const replyDraft = selectedTicketNumber ? replyDrafts[selectedTicketNumber] : undefined;
  const customerReplyText = replyDraft?.text || '';
  const ticketThreads = selectedTicket?.threads || [];
  const [isReplying, setIsReplying] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<number | null>(null);

  // CSAT Rating State
  const [csatRating, setCsatRating] = useState(0);
  const [csatComment, setCsatComment] = useState<string>('');
  const [csatSubmitted, setCsatSubmitted] = useState<boolean>(false);
  const [csatError, setCsatError] = useState<string | null>(null);
  const [isSubmittingCsat, setIsSubmittingCsat] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const isCurrentSession = (generation: number) => mounted.current && generation === sessionGeneration.current;

  const clearPersonalState = () => {
    sessionGeneration.current += 1;
    ticketRequest.current += 1;
    detailRequest.current += 1;
    authBusy.current = submitBusy.current = replyBusy.current = actionBusy.current = signOutBusy.current = csatBusy.current = exportBusy.current = false;
    setCustomerEmail('');
    setCustomerName('');
    setSessionStatus('anonymous');
    setShowAuthModal(false);
    setShowUserMenu(false);
    setMobileMenuOpen(false);
    setAuthStep('input');
    setAuthEmailInput('');
    setOtpCode('');
    setOtpNotice(null);
    setOtpError(null);
    setOtpCountdown(0);
    setAuthPending(null);
    setIsSigningOut(false);
    setSubject('');
    setDescription('');
    setAttachments([]);
    setDeptId('');
    setPriority('MEDIUM');
    setHoneypot('');
    setAgreedToPrivacy(false);
    setSubmitSuccess(null);
    setSubmitError(null);
    setIsSubmitting(false);
    setMyTickets([]);
    setAllTicketTotal(null);
    setTicketQuery({ page: 0, q: '', status: 'ALL' });
    setTicketPage({ number: 0, size: 25, totalElements: 0, totalPages: 0 });
    setTicketsError(null);
    setTicketsLoading(false);
    setSelectedTicket(null);
    setSelectedTicketNumber(null);
    setDetailLoading(false);
    setDetailError(null);
    setTicketActionError(null);
    setReplyDrafts({});
    setIsReplying(false);
    setIsUpdatingTicket(false);
    setDownloadingAttachment(null);
    setCsatRating(0);
    setCsatComment('');
    setCsatSubmitted(false);
    setCsatError(null);
    setIsSubmittingCsat(false);
    setIsExporting(false);
    setExportError(null);
    setArticleVoted({});
    setArticleError(null);
    setVotingArticle(null);
    setCopiedLink(false);
  };

  const acceptSession = (session: CustomerSession) => {
    if (session.browserSession !== true || !session.email?.trim() || !session.companyId || !session.csrfToken || (company && session.companyId !== company.id)) {
      throw new Error('The customer session could not be verified for this portal. Please sign in again.');
    }
    setCustomerEmail(session.email);
    setCustomerName(session.name || '');
    setTicketsLoading(true);
    setSessionStatus('authenticated');
    setSessionError(null);
  };

  const checkSession = async () => {
    const generation = ++sessionGeneration.current;
    setSessionStatus('checking');
    setSessionError(null);
    try {
      const session = await apiService.getCustomerSession(companySlug);
      if (isCurrentSession(generation)) acceptSession(session);
    } catch (error) {
      if (!isCurrentSession(generation)) return;
      const status = (error as { response?: { status?: number } })?.response?.status;
      setSessionStatus(status === 401 ? 'anonymous' : 'error');
      if (status !== 401) setSessionError(errorMessage(error, 'Unable to check your customer session. Please retry.'));
    }
  };

  // Load Portal Info & KB
  useEffect(() => {
    mounted.current = true;
    void loadPortalData();
    void loadKbArticles();
    void checkSession();
    const handleSessionExpired = (event: Event) => {
      if ((event as CustomEvent).detail !== 'CUSTOMER') return;
      clearPersonalState();
      setSessionError('Your customer session has expired. Please sign in again.');
    };
    window.addEventListener('kuwy-session-expired', handleSessionExpired);
    return () => {
      mounted.current = false;
      sessionGeneration.current += 1;
      portalRequest.current += 1;
      kbRequest.current += 1;
      window.removeEventListener('kuwy-session-expired', handleSessionExpired);
    };
  }, [companySlug]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const request = ++ticketRequest.current;
    const generation = sessionGeneration.current;
    setTicketsLoading(true);
    setTicketsError(null);
    const timer = window.setTimeout(async () => {
      try {
        const page = await apiService.getCustomerPortalTicketPage(companySlug, {
          page: ticketQuery.page, size: 25,
          q: ticketQuery.q.trim() || undefined,
          status: ticketQuery.status === 'ALL' ? undefined : ticketQuery.status,
        });
        if (!isCurrentSession(generation) || request !== ticketRequest.current) return;
        if (!Array.isArray(page.content)) throw new Error('The ticket list response was incomplete. Please retry.');
        if (page.number > 0 && page.number >= Math.max(1, page.totalPages)) {
          ticketRequest.current += 1;
          setTicketQuery(current => ({ ...current, page: Math.max(0, page.totalPages - 1) }));
          return;
        }
        setMyTickets(page.content);
        setTicketPage(page);
      } catch (error) {
        if (isCurrentSession(generation) && request === ticketRequest.current) {
          setTicketsError(errorMessage(error, 'Unable to load your tickets. Please retry.'));
        }
      } finally {
        if (isCurrentSession(generation) && request === ticketRequest.current) setTicketsLoading(false);
      }
    }, 200);
    return () => { window.clearTimeout(timer); ticketRequest.current += 1; };
  }, [isAuthenticated, companySlug, ticketQuery, ticketRevision]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const generation = sessionGeneration.current;
    setAllTicketTotal(null);
    apiService.getCustomerPortalTicketPage(companySlug, { page: 0, size: 1 })
      .then(page => { if (!cancelled && isCurrentSession(generation)) setAllTicketTotal(page.totalElements); })
      .catch(() => { /* The ticket list exposes its own retryable error; do not invent a count. */ });
    return () => { cancelled = true; };
  }, [isAuthenticated, companySlug, ticketRevision]);

  // OTP Countdown Timer
  useEffect(() => {
    if (authStep !== 'otp' || otpCountdown <= 0) return;
    const timer = window.setTimeout(() => setOtpCountdown(count => Math.max(0, count - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [authStep, otpCountdown]);

  useEffect(() => {
    const dialog = authDialog.current;
    if (!showAuthModal || !dialog) return;
    const previousFocus = authReturnFocus.current;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      window.requestAnimationFrame(() => {
        if (!mounted.current || dialog.open) return;
        if (previousFocus?.isConnected && previousFocus.getClientRects().length && !previousFocus.matches(':disabled')) previousFocus.focus();
        else mainContent.current?.focus();
      });
    };
  }, [showAuthModal]);

  const loadPortalData = async () => {
    const request = ++portalRequest.current;
    setLoading(true);
    setPortalError(null);
    try {
      const data = await apiService.getPortalInfo(companySlug);
      if (!mounted.current || request !== portalRequest.current) return;
      if (!data.companyId || !data.companyName) throw new Error('This support portal is unavailable.');
      setCompany({
        id: data.companyId,
        name: data.companyName,
        companyCode: data.companyCode,
        subdomain: data.subdomain,
        primaryColor: data.primaryColor || '#0d6efd',
        logoUrl: data.logoUrl
      });
      setDepartments(data.departments || []);
      setPortalMetadata({
        supportEmail: data.supportEmail || undefined,
        supportPhone: data.supportPhone || undefined,
        businessHours: data.businessHours || undefined,
        announcementBanner: data.announcementBanner || undefined,
      });
      if (data.departments && data.departments.length > 0) {
        setDeptId(data.departments[0].id);
      }
    } catch (error) {
      if (!mounted.current || request !== portalRequest.current) return;
      setPortalError(errorMessage(error, 'Unable to load this support portal. Please retry.'));
    } finally {
      if (mounted.current && request === portalRequest.current) setLoading(false);
    }
  };

  const loadKbArticles = async (query?: string) => {
    const request = ++kbRequest.current;
    setKbLoading(true);
    setKbError(null);
    try {
      const articles = await apiService.getPublicKbArticles(companySlug, query);
      if (!mounted.current || request !== kbRequest.current) return;
      setKbArticles(articles);
    } catch (error) {
      if (mounted.current && request === kbRequest.current) setKbError(errorMessage(error, 'Unable to load help articles. Please retry.'));
    } finally {
      if (mounted.current && request === kbRequest.current) setKbLoading(false);
    }
  };

  const loadCustomerTickets = () => {
    ticketRequest.current += 1;
    setTicketsLoading(true);
    setTicketRevision(revision => revision + 1);
  };

  const openAuthModal = (event: React.MouseEvent<HTMLButtonElement>) => {
    authReturnFocus.current = event.currentTarget;
    setShowAuthModal(true);
  };

  const openTicketForm = () => {
    if (submitSuccess && attachments.length === 0 && !submitBusy.current) {
      setSubmitSuccess(null);
      setSubmitError(null);
      setSubject('');
      setDescription('');
      setAgreedToPrivacy(false);
    }
    setActiveTab('submit');
    setShowUserMenu(false);
    setMobileMenuOpen(false);
    onNavigate?.('/' + companySlug + '/ticket');
  };

  const updateTicketQuery = (patch: Partial<typeof ticketQuery>) => {
    ticketRequest.current += 1;
    setTicketsLoading(true);
    setTicketsError(null);
    setTicketQuery(current => ({ ...current, ...patch }));
  };

  const handleRequestOtp = async () => {
    if (authBusy.current || !authEmailInput.trim() || (authStep === 'otp' && otpCountdown > 0)) return;
    authBusy.current = true;
    const generation = sessionGeneration.current;
    setAuthPending('request');
    setOtpNotice(null);
    setOtpError(null);
    try {
      const res = await apiService.requestPortalOtp(companySlug, authEmailInput.trim());
      if (!isCurrentSession(generation)) return;
      setAuthEmailInput(authEmailInput.trim());
      setAuthStep('otp');
      setOtpCode('');
      setOtpCountdown(60);
      setOtpNotice(res.message || 'Your sign-in code request has been queued. Check your inbox and spam folder.');
    } catch (error) {
      if (isCurrentSession(generation)) setOtpError(errorMessage(error, 'Unable to request a sign-in code. Please try again.'));
    } finally {
      if (isCurrentSession(generation)) { authBusy.current = false; setAuthPending(null); }
    }
  };

  const handleVerifyOtp = async () => {
    if (authBusy.current || !/^\d{6}$/.test(otpCode)) return;
    authBusy.current = true;
    const generation = sessionGeneration.current;
    setAuthPending('verify');
    setOtpError(null);
    try {
      const res = await apiService.verifyPortalOtp(companySlug, authEmailInput.trim(), otpCode.trim());
      if (!isCurrentSession(generation)) return;
      acceptSession(res);
      setShowAuthModal(false);
      setAuthStep('input');
      setOtpCode('');
      setOtpNotice(null);
      setAuthEmailInput('');
    } catch (error) {
      if (isCurrentSession(generation)) setOtpError(errorMessage(error, 'That code could not be verified. Check the code or request a new one.'));
    } finally {
      if (isCurrentSession(generation)) { authBusy.current = false; setAuthPending(null); }
    }
  };

  const handleSignOut = async () => {
    if (!isAuthenticated || signOutBusy.current) return;
    const generation = sessionGeneration.current;
    signOutBusy.current = true;
    setIsSigningOut(true);
    setSessionError(null);
    try {
      await apiService.logoutCustomer(companySlug);
      if (isCurrentSession(generation)) clearPersonalState();
    } catch (error) {
      if (isCurrentSession(generation)) setSessionError(`Sign-out failed. ${errorMessage(error, 'Please retry. Your session has not been cleared.')}`);
    } finally {
      if (isCurrentSession(generation)) { signOutBusy.current = false; setIsSigningOut(false); }
    }
  };

  const validateFiles = (files: File[]) => {
    if (files.some(file => !/\.(png|pdf|jpe?g|txt)$/i.test(file.name) || file.size > 25 * 1024 * 1024)) {
      throw new Error('Choose PNG, PDF, JPG, JPEG or TXT files of 25 MB or less each. Your selected files have been kept.');
    }
  };

  // Track each successful file separately so a retry never re-creates a ticket or reply.
  const uploadFiles = async (ticketNumber: string, files: File[], generation: number, onUploaded: (file: File) => void, threadId?: number) => {
    for (const file of files) {
      if (!isCurrentSession(generation)) return;
      const uploaded = await apiService.uploadCustomerAttachments(companySlug, ticketNumber, [file], threadId);
      if (!isCurrentSession(generation)) return;
      if (!Array.isArray(uploaded) || uploaded.length !== 1 || !uploaded[0].id) throw new Error('The attachment upload was not confirmed. The selected file has been kept.');
      onUploaded(file);
    }
  };

  const handleSubmitTicket = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!isAuthenticated || signOutBusy.current || submitBusy.current || !company) return;
    if (!submitSuccess && (!subject.trim() || !description.trim() || !deptId || !agreedToPrivacy)) return;
    const generation = sessionGeneration.current;
    let savedTicket = submitSuccess;
    submitBusy.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      validateFiles(attachments);
      if (!savedTicket) {
        savedTicket = await apiService.submitPortalTicket(companySlug, {
          departmentId: deptId, subject: subject.trim(), description: description.trim(),
          priority, websiteUrl: honeypot || undefined,
        });
        if (!isCurrentSession(generation)) return;
        setSubmitSuccess(savedTicket);
        loadCustomerTickets();
      }
      await uploadFiles(savedTicket.ticketNumber, attachments, generation, file => setAttachments(files => files.filter(item => item !== file)));
      if (!isCurrentSession(generation)) return;
      setSubject('');
      setDescription('');
      setHoneypot('');
    } catch (error) {
      if (!isCurrentSession(generation)) return;
      setSubmitError(savedTicket
        ? `Ticket #${savedTicket.ticketNumber} was saved, but some attachments were not uploaded. Retry the remaining uploads below; do not submit the ticket again. ${errorMessage(error, 'Upload failed.')}`
        : errorMessage(error, 'Unable to submit your ticket. Your text and selected files have been kept.'));
    } finally {
      if (isCurrentSession(generation)) { submitBusy.current = false; setIsSubmitting(false); }
    }
  };

  const handleOpenTicketDetail = async (ticket: Pick<Ticket, 'ticketNumber'>) => {
    if (!isAuthenticated || signOutBusy.current) return;
    const generation = sessionGeneration.current;
    const request = ++detailRequest.current;
    setSelectedTicketNumber(ticket.ticketNumber);
    setSelectedTicket(null);
    setDetailLoading(true);
    setDetailError(null);
    setTicketActionError(null);
    setActiveTab('ticket-detail');
    setCsatSubmitted(false);
    setCsatRating(0);
    setCsatComment('');
    setCsatError(null);
    try {
      const detail = await apiService.getCustomerPortalTicketDetail(companySlug, ticket.ticketNumber, customerEmail);
      if (!Array.isArray(detail.threads)) throw new Error('The conversation response was incomplete. Please retry.');
      if (isCurrentSession(generation) && request === detailRequest.current) setSelectedTicket(detail);
    } catch (error) {
      if (isCurrentSession(generation) && request === detailRequest.current) setDetailError(errorMessage(error, 'Unable to load this conversation. Please retry.'));
    } finally {
      if (isCurrentSession(generation) && request === detailRequest.current) setDetailLoading(false);
    }
  };

  const updateReplyDraft = (ticketNumber: string, patch: Partial<ReplyDraft>) => {
    setReplyDrafts(drafts => ({ ...drafts, [ticketNumber]: { ...(drafts[ticketNumber] ?? { text: '', files: [] }), ...patch } }));
  };

  const handleSendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated || signOutBusy.current || !selectedTicket || replyBusy.current || actionBusy.current || !customerReplyText.trim()) return;
    const generation = sessionGeneration.current;
    const request = detailRequest.current;
    const number = selectedTicket.ticketNumber;
    const files = replyDraft?.files || [];
    let saved = replyDraft?.saved || false;
    let threadId = replyDraft?.threadId;
    replyBusy.current = true;
    setIsReplying(true);
    updateReplyDraft(number, { error: undefined, notice: undefined });
    try {
      validateFiles(files);
      if (!saved) {
        const updated = await apiService.sendCustomerPortalReply(companySlug, number, customerEmail, customerReplyText.trim());
        if (!isCurrentSession(generation)) return;
        saved = true;
        const previousIds = new Set(ticketThreads.map(thread => thread.id));
        const added = updated.threads?.filter(thread => thread.senderType === 'CUSTOMER' && thread.threadType === 'CUSTOMER_REPLY' && !previousIds.has(thread.id)) || [];
        threadId = added.length === 1 ? added[0].id : undefined;
        updateReplyDraft(number, { saved: true, threadId });
        if (request === detailRequest.current) setSelectedTicket(updated);
        loadCustomerTickets();
      }
      await uploadFiles(number, files, generation, file => {
        setReplyDrafts(drafts => ({ ...drafts, [number]: { ...drafts[number], files: drafts[number].files.filter(item => item !== file) } }));
      }, threadId);
      if (!isCurrentSession(generation)) return;
      updateReplyDraft(number, { text: '', files: [], saved: false, threadId: undefined, notice: files.length ? 'Reply saved and attachments uploaded to this ticket.' : 'Reply saved.' });
      if (files.length && request === detailRequest.current) {
        try {
          const detail = await apiService.getCustomerPortalTicketDetail(companySlug, number, customerEmail);
          if (isCurrentSession(generation) && request === detailRequest.current) setSelectedTicket(detail);
        } catch (error) {
          if (isCurrentSession(generation) && request === detailRequest.current) setTicketActionError(`Your reply and uploads were saved, but the conversation could not refresh. ${errorMessage(error, 'Reload the conversation to see the latest attachments.')}`);
        }
      }
    } catch (error) {
      if (isCurrentSession(generation)) updateReplyDraft(number, { error: saved
        ? `Your reply was saved, but some attachments were not uploaded. Retry uploads only; the reply will not be sent again. ${errorMessage(error, 'Upload failed.')}`
        : errorMessage(error, 'Unable to send your reply. Your text and selected files have been kept.') });
    } finally {
      if (isCurrentSession(generation)) { replyBusy.current = false; setIsReplying(false); }
    }
  };

  const handleTicketStatus = async (reopen: boolean) => {
    if (!isAuthenticated || signOutBusy.current || !selectedTicket || actionBusy.current || replyBusy.current) return;
    const generation = sessionGeneration.current;
    const request = detailRequest.current;
    actionBusy.current = true;
    setIsUpdatingTicket(true);
    setTicketActionError(null);
    try {
      const updated = reopen
        ? await apiService.reopenCustomerPortalTicket(companySlug, selectedTicket.ticketNumber)
        : await apiService.closeTicketByCustomer(companySlug, selectedTicket.ticketNumber, customerEmail);
      if (!isCurrentSession(generation)) return;
      if (request === detailRequest.current) setSelectedTicket(updated);
      loadCustomerTickets();
    } catch (error) {
      if (isCurrentSession(generation) && request === detailRequest.current) setTicketActionError(errorMessage(error, `Unable to ${reopen ? 'reopen' : 'resolve'} this ticket. Please retry.`));
    } finally {
      if (isCurrentSession(generation)) { actionBusy.current = false; setIsUpdatingTicket(false); }
    }
  };

  const handleSubmitCsat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated || signOutBusy.current || !selectedTicket || csatBusy.current || csatRating < 1 || csatRating > 5 || !['RESOLVED', 'CLOSED'].includes(selectedTicket.status)) return;
    const generation = sessionGeneration.current;
    const request = detailRequest.current;
    csatBusy.current = true;
    setIsSubmittingCsat(true);
    setCsatError(null);
    try {
      const result = await apiService.submitCsat(companySlug, selectedTicket.ticketNumber, csatRating, csatComment);
      if (result.success === false) throw new Error(result.message || 'Your rating could not be saved.');
      if (isCurrentSession(generation) && request === detailRequest.current) setCsatSubmitted(true);
    } catch (error) {
      if (isCurrentSession(generation) && request === detailRequest.current) setCsatError(errorMessage(error, 'Unable to submit your rating. Please retry.'));
    } finally {
      if (isCurrentSession(generation)) { csatBusy.current = false; setIsSubmittingCsat(false); }
    }
  };

  // KB Voting Handler (Screen 14c)
  const handleVoteArticle = async (articleId: number, helpful: boolean) => {
    if (votingArticle !== null || articleVoted[articleId]) return;
    const generation = sessionGeneration.current;
    setVotingArticle(articleId);
    setArticleError(null);
    try {
      await apiService.voteKbArticle(companySlug, articleId, helpful);
      if (!isCurrentSession(generation)) return;
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
    } catch (error) {
      if (isCurrentSession(generation)) setArticleError(errorMessage(error, 'Unable to record your article feedback. Please retry.'));
    } finally {
      if (isCurrentSession(generation)) setVotingArticle(null);
    }
  };

  // Export Data Handler (Screen 15)
  const handleExportData = async () => {
    if (!isAuthenticated || signOutBusy.current || exportBusy.current) return;
    const generation = sessionGeneration.current;
    exportBusy.current = true;
    setIsExporting(true);
    setExportError(null);
    try {
      const data = await apiService.exportCustomerData(companySlug, customerEmail);
      if (!data || data.scope !== 'customer' || !Array.isArray(data.tickets)) throw new Error('The ticket export response was incomplete. No export was downloaded.');
      if (isCurrentSession(generation)) downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${companySlug}_ticket_history.json`);
    } catch (error) {
      if (isCurrentSession(generation)) setExportError(errorMessage(error, 'Unable to export your ticket history. Please retry.'));
    } finally {
      if (isCurrentSession(generation)) { exportBusy.current = false; setIsExporting(false); }
    }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadAttachment = async (attachment: TicketAttachment) => {
    if (!isAuthenticated || downloadingAttachment !== null || signOutBusy.current) return;
    const generation = sessionGeneration.current;
    const request = detailRequest.current;
    setDownloadingAttachment(attachment.id);
    setTicketActionError(null);
    try {
      const blob = await apiService.downloadCustomerAttachment(companySlug, attachment.id);
      if (isCurrentSession(generation)) downloadBlob(blob, attachment.fileName);
    } catch (error) {
      if (isCurrentSession(generation) && request === detailRequest.current) setTicketActionError(errorMessage(error, 'Unable to download this attachment. Please retry.'));
    } finally {
      if (isCurrentSession(generation)) setDownloadingAttachment(null);
    }
  };

  const renderAttachments = (files: TicketAttachment[] = []) => files.length > 0 && (
    <div className="d-flex flex-wrap gap-2 mt-3" aria-label="Ticket attachments">
      {files.map(file => <button key={file.id} type="button" className="btn btn-sm btn-light border d-inline-flex align-items-center gap-2 text-start" style={{ maxWidth: '100%' }} disabled={downloadingAttachment !== null || isSigningOut} onClick={() => void handleDownloadAttachment(file)}>
        <Download size={14} className="flex-shrink-0" aria-hidden="true" />
        <span style={{ overflowWrap: 'anywhere' }}>{downloadingAttachment === file.id ? 'Downloading...' : file.fileName}</span>
      </button>)}
    </div>
  );

  const renderSignIn = () => <PortalSignIn
    step={authStep} email={authEmailInput} code={otpCode} notice={otpNotice} error={otpError}
    countdown={otpCountdown} pending={authPending}
    onEmailChange={email => { setAuthEmailInput(email); setOtpError(null); }}
    onCodeChange={code => { setOtpCode(code); setOtpError(null); }}
    onRequestCode={handleRequestOtp} onVerifyCode={handleVerifyOtp}
    onChangeEmail={() => { setAuthStep('input'); setOtpCode(''); setOtpNotice(null); setOtpError(null); }}
  />;

  const visibleArticles = !kbLoading && !kbError ? kbArticles : [];

  // Suggested KB articles for deflection on Screen 11
  const suggestedArticles = subject.trim().length > 3
    ? visibleArticles.filter(a =>
      a.title.toLowerCase().includes(subject.toLowerCase()) ||
      a.categoryName.toLowerCase().includes(subject.toLowerCase())
    ).slice(0, 3)
    : [];

  const primaryColor = company?.primaryColor || '#0d6efd';

  // Dedicated Authentication Barrier for /ticket and /ticketstatus
  const renderAuthBarrier = (target: 'ticket' | 'ticketstatus') => {
    const isTicket = target === 'ticket';
    if (sessionStatus === 'checking') return (
      <div className="card border-0 shadow-sm rounded-4 p-4 text-center bg-white mx-auto" style={{ maxWidth: '580px' }} role="status">
        <span className="spinner-border spinner-border-sm text-primary mx-auto mb-2" aria-hidden="true" />
        Checking your customer session...
      </div>
    );
    if (sessionStatus === 'error') return (
      <div className="card border-0 shadow-sm rounded-4 p-4 bg-white mx-auto" style={{ maxWidth: '580px' }}>
        <p className="text-danger" role="alert">Your customer session could not be checked. Private ticket information is hidden.</p>
        <button type="button" className="btn btn-outline-primary" onClick={() => void checkSession()}>Retry Session Check</button>
      </div>
    );
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
              Customer Sign-in Required
            </span>
          </div>
          <h4 className="fw-bolder text-dark mb-1 fs-5 fs-md-4">
            {isTicket ? 'Sign In to Submit Support Ticket' : 'Sign In to Track Tickets & Status'}
          </h4>
          <p className="text-muted small mb-0 px-2" style={{ maxWidth: '460px', margin: '0 auto', fontSize: '0.84rem' }}>
            {isTicket
              ? 'Verify your email to submit a support request. Your ticket will be associated with your signed-in email.'
              : 'Verify your email to view your requests, ticket status, and public support conversations.'}
          </p>
        </div>

        {!showAuthModal && renderSignIn()}

        {/* Back Link */}
        <div className="text-center pt-2 mt-3 border-top">
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
    <div className="customer-portal min-vh-100 d-flex flex-column bg-slate-50" style={{ backgroundColor: '#f8fafc' }}>
      {/* 0. Top Operational Announcement Banner (Screen 9) */}
      {portalMetadata.announcementBanner && (
        <div
          className="py-1.5 px-3 text-center small text-white fw-medium d-flex align-items-center justify-content-center gap-2"
          style={{ background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)', fontSize: '0.8rem' }}
        >
          <span className="badge bg-success rounded-pill px-2 py-0.5" style={{ fontSize: '0.68rem' }}>SUPPORT NOTICE</span>
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
                {company?.name || 'Customer Support'}
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
              onClick={openTicketForm}
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
              {isAuthenticated && allTicketTotal !== null && allTicketTotal > 0 && (
                <span className="badge rounded-pill bg-primary ms-1.5" style={{ fontSize: '0.65rem' }}>
                  {allTicketTotal}
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
                      <Clock size={14} /> My Tickets{allTicketTotal !== null ? ` (${allTicketTotal})` : ''}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-light w-100 text-start d-flex align-items-center gap-2"
                      onClick={openTicketForm}
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
                      disabled={isSigningOut}
                      onClick={() => void handleSignOut()}
                    >
                      <LogOut size={14} /> {isSigningOut ? 'Signing Out...' : 'Sign Out'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold ms-2"
                disabled={sessionStatus !== 'anonymous' || !company}
                onClick={openAuthModal}
              >
                {sessionStatus === 'checking' ? 'Checking...' : 'Sign In'}
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
                disabled={sessionStatus !== 'anonymous' || !company}
                onClick={openAuthModal}
              >
                {sessionStatus === 'checking' ? 'Checking...' : 'Sign In'}
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
                  disabled={isSigningOut}
                  onClick={() => void handleSignOut()}
                >
                  {isSigningOut ? 'Signing Out...' : 'Sign Out'}
                </button>
              </div>
            ) : (
              <div className="mb-2.5">
                <button
                  type="button"
                  className="btn btn-primary w-100 py-2 fw-semibold rounded-3 d-flex align-items-center justify-content-center gap-2 shadow-xs"
                  disabled={sessionStatus !== 'anonymous' || !company}
                  onClick={openAuthModal}
                >
                  <User size={16} /> {sessionStatus === 'checking' ? 'Checking Customer Session...' : 'Sign In to Your Account'}
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
                onClick={openTicketForm}
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
                  {isAuthenticated && allTicketTotal !== null && allTicketTotal > 0 && (
                    <span className="badge rounded-pill bg-danger" style={{ fontSize: '0.68rem' }}>
                      {allTicketTotal}
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
              Customer Support Portal
            </span>
            <h2 className="fw-bolder mb-2 text-white fs-3 fs-md-2" style={{ letterSpacing: '-0.02em' }}>
              How can we assist you today?
            </h2>
            <p className="text-white-50 mb-3 mb-md-4 small px-2" style={{ fontSize: '0.9rem' }}>
              Search help articles, check ticket status, or submit a request to our support team.
            </p>

            {/* Knowledge Base Instant Search Box */}
            <div className="position-relative mx-auto" style={{ maxWidth: '580px' }}>
              <Search size={18} className="position-absolute text-muted" style={{ top: '14px', left: '16px' }} />
                <input
                  type="text"
                  aria-label="Search help articles"
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
              {searchQuery.trim().length > 1 && visibleArticles.length > 0 && (
                <div
                  className="position-absolute w-100 bg-white rounded-4 shadow-2xl border text-start mt-2 p-2"
                  style={{ zIndex: 1050 }}
                >
                  <small className="text-muted fw-bold px-3 py-1 d-block text-uppercase" style={{ fontSize: '0.68rem' }}>
                    Matching Help Articles
                  </small>
                  {visibleArticles.slice(0, 5).map(art => (
                    <div
                      key={art.id}
                      className="p-2.5 rounded-3 hover-bg-light cursor-pointer transition-all d-flex align-items-center justify-content-between"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedArticle(art);
                        setActiveTab('article');
                        setSearchQuery('');
                        void loadKbArticles();
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
      <main ref={mainContent} tabIndex={-1} className="container py-3 py-md-4 flex-grow-1 pb-5 mb-5 mb-md-0 px-2 px-sm-3" style={{ maxWidth: '1100px', minWidth: 0 }}>
        {loading && !company && <div className="card border-0 shadow-sm rounded-4 p-4 bg-white text-center" role="status">Loading support portal...</div>}
        {portalError && <div className="alert alert-danger" role="alert">
          <p className="mb-2">{portalError}</p>
          <button type="button" className="btn btn-sm btn-outline-danger" disabled={loading} onClick={() => void loadPortalData()}>Retry Portal</button>
        </div>}
        {sessionError && <div className="alert alert-warning" role="alert">
          {sessionError}
          {sessionStatus === 'error' && <button type="button" className="btn btn-sm btn-outline-secondary d-block mt-2" onClick={() => void checkSession()}>Retry Session Check</button>}
        </div>}
        {company && <>
        {(activeTab === 'home' || activeTab === 'kb') && kbLoading && <div className="alert alert-light border small" role="status">Loading help articles...</div>}
        {(activeTab === 'home' || activeTab === 'kb') && kbError && <div className="alert alert-warning small" role="alert"><p className="mb-2">{kbError}</p><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void loadKbArticles(searchQuery)}>Retry Help Articles</button></div>}
        {(activeTab === 'home' || activeTab === 'kb') && !kbLoading && !kbError && visibleArticles.length === 0 && <div className="alert alert-light border small">{searchQuery ? 'No help articles match this search.' : 'No help articles have been published yet.'}</div>}
        {sessionStatus === 'checking' && activeTab === 'home' && <div className="alert alert-light border" role="status">Checking your customer session...</div>}
        {isAuthenticated && submitSuccess && attachments.length > 0 && activeTab !== 'submit' && <div className="alert alert-warning small" role="status">
          Ticket #{submitSuccess.ticketNumber} was saved. {attachments.length} attachment(s) still need upload.
          <button type="button" className="btn btn-sm btn-outline-secondary d-block mt-2" onClick={openTicketForm}>Resume Attachment Uploads</button>
        </div>}

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
                    <h5 className="fw-bold text-dark mb-1 fs-6 fs-md-5">{customerName ? `Welcome back, ${customerName}` : 'Welcome back'}</h5>
                    <p className="text-muted small mb-0">
                      Signed in as <strong style={{ overflowWrap: 'anywhere' }}>{customerEmail}</strong>{allTicketTotal !== null ? ` | ${allTicketTotal} ticket(s) in ${company.name}.` : ''}
                    </p>
                  </div>
                  <div className="d-flex flex-wrap align-items-center gap-1.5 gap-md-2 mt-1 mt-sm-0">
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
                  onClick={openTicketForm}
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
                    Raise an inquiry with supporting documents or error logs. After submission, use your tracking number to follow the request.
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
                      <small className="text-muted" style={{ fontSize: '0.75rem' }}>Check ticket status and support replies</small>
                    </div>
                  </div>
                  <p className="text-secondary small mb-3" style={{ fontSize: '0.82rem' }}>
                    Access conversation threads, download attachments sent by our team, reply with more details, or reopen resolved requests.
                  </p>
                  <span className="text-success fw-bold small d-inline-flex align-items-center gap-1">
                    {isAuthenticated ? 'View your tickets' : 'Sign in to track'}
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
                {visibleArticles.slice(0, 4).map(art => (
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
                      <span className="fw-bold text-dark small text-truncate d-block">{portalMetadata.supportEmail || 'Not provided'}</span>
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
                      <span className="fw-bold text-dark small d-block">{portalMetadata.supportPhone || 'Not provided'}</span>
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
                      <span className="fw-bold text-dark small d-block">{portalMetadata.businessHours || 'Not provided'}</span>
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
                  onNavigate?.('/' + companySlug);
                }}
              >
                <ArrowLeft size={15} /> Back to Home
              </button>
              <span className="small text-muted">Customer Support Request</span>
            </div>
            {submitError && isAuthenticated && <div className="alert alert-danger small" role="alert">{submitError}</div>}

            {!isAuthenticated ? (
              renderAuthBarrier('ticket')
            ) : submitSuccess ? (
              <div className="card border-0 shadow-sm rounded-4 p-4 p-md-5 text-center bg-white animate-fade-in mx-auto" style={{ maxWidth: '640px' }}>
                <div className="rounded-circle bg-success-subtle text-success mx-auto d-flex align-items-center justify-content-center mb-3" style={{ width: '56px', height: '56px' }}>
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="fw-bolder text-dark mb-1 fs-5 fs-md-4">Your Ticket Has Been Saved</h4>
                <p className="text-muted small mb-3">
                  {submitSuccess.emailNotification === 'queued'
                    ? 'A confirmation email has been queued. Delivery to your inbox is not yet confirmed.'
                    : submitSuccess.emailNotification === 'not_configured'
                      ? 'Email notifications are not configured. Track your request here in the portal.'
                      : 'Use the tracking number below to follow your request in this portal.'}
                </p>

                <div className="p-3 bg-light rounded-3 border mx-auto mb-4 w-100" style={{ maxWidth: '420px' }}>
                  <div className="small text-secondary mb-1">Your Tracking Number</div>
                  <h3 className="fw-bolder text-primary mb-1 fs-4 fs-md-3">#{submitSuccess.ticketNumber}</h3>
                  <div className="small text-muted text-truncate">Subject: "{submitSuccess.subject}"</div>
                  <div className="badge bg-info-subtle text-info mt-2">{submitSuccess.status}</div>
                </div>

                {attachments.length > 0 && <div className="border rounded-3 p-3 mb-3 text-start bg-light">
                  <p className="small mb-2" role="status">{isSubmitting ? 'Uploading attachments...' : 'These files still need to be uploaded:'}</p>
                  <ul className="list-unstyled small mb-3">
                    {attachments.map((file, index) => <li key={`${file.name}-${index}`} className="d-flex align-items-center justify-content-between gap-2 mb-1">
                      <span style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{file.name}</span>
                      <button type="button" className="btn btn-sm btn-link text-danger flex-shrink-0" disabled={isSubmitting || isSigningOut} aria-label={`Remove pending attachment ${file.name}`} onClick={() => setAttachments(files => files.filter(item => item !== file))}>Remove</button>
                    </li>)}
                  </ul>
                  <button type="button" className="btn btn-outline-primary btn-sm" disabled={isSubmitting || isSigningOut} onClick={() => void handleSubmitTicket()}>{isSubmitting ? 'Uploading...' : 'Retry Remaining Uploads Only'}</button>
                </div>}

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
                    disabled={isSubmitting || attachments.length > 0 || isSigningOut}
                    onClick={() => {
                      setSubmitSuccess(null);
                      setSubmitError(null);
                      setSubject('');
                      setDescription('');
                      setAgreedToPrivacy(false);
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
                        Describe your request and choose a support category. You can track the response in this portal.
                      </p>
                    </div>

                    <form onSubmit={handleSubmitTicket} aria-busy={isSubmitting}>
                      <fieldset disabled={isSubmitting || isSigningOut || !!portalError} style={{ minWidth: 0 }}>
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
                          <label htmlFor="portal-requester-name" className="form-label small fw-bold text-dark">Your Name (Read-Only)</label>
                          <input
                            id="portal-requester-name"
                            name="name"
                            type="text"
                            autoComplete="name"
                            maxLength={100}
                            className="form-control"
                            readOnly
                            placeholder="Not provided"
                            value={customerName}
                          />
                        </div>
                        <div className="col-12 col-md-6">
                          <div className="d-flex flex-wrap justify-content-between align-items-center gap-1 mb-1">
                            <label htmlFor="portal-requester-email" className="form-label small fw-bold text-dark mb-0">Your Email Address *</label>
                            <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1" style={{ fontSize: '0.66rem' }}>
                              <CheckCircle2 size={10} /> Verified Sign-in
                            </span>
                          </div>
                          <div className="input-group">
                            <span className="input-group-text bg-light text-muted">
                              <Lock size={15} />
                            </span>
                            <input
                              id="portal-requester-email"
                              name="email"
                              autoComplete="email"
                              type="email"
                              className="form-control bg-light text-dark fw-semibold"
                              required
                              value={customerEmail}
                              readOnly
                              title="Locked to signed-in customer email"
                            />
                          </div>
                          <small className="text-muted d-block mt-1" style={{ fontSize: '0.72rem' }}>
                            This request belongs to your verified email. Email notifications depend on the portal's configuration.
                          </small>
                        </div>
                      </div>

                      {/* Category & Priority */}
                      <div className="row g-2.5 g-md-3 mb-3">
                        <div className="col-12 col-md-7">
                          <label htmlFor="portal-department" className="form-label small fw-bold text-dark">Category / Department *</label>
                          <select
                            id="portal-department"
                            className="form-select"
                            required
                            disabled={departments.length === 0}
                            value={deptId}
                            onChange={e => setDeptId(Number(e.target.value))}
                          >
                            <option value="" disabled>Select a category</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.name}{d.code ? ` (${d.code})` : ''}
                              </option>
                            ))}
                          </select>
                          {departments.length === 0 && <p className="small text-danger mt-1 mb-0">No support categories are available. Ticket submission is unavailable until a category is configured.</p>}
                        </div>
                        <div className="col-12 col-md-5">
                          <label htmlFor="portal-priority" className="form-label small fw-bold text-dark">Priority *</label>
                          <select
                            id="portal-priority"
                            className="form-select"
                            value={priority}
                            onChange={e => setPriority(e.target.value as Ticket['priority'])}
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
                        <label htmlFor="portal-subject" className="form-label small fw-bold text-dark">Ticket Subject *</label>
                        <input
                          id="portal-subject"
                          maxLength={200}
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
                        <label htmlFor="portal-description" className="form-label small fw-bold text-dark">Detailed Description *</label>
                        <textarea
                          id="portal-description"
                          maxLength={100000}
                          className="form-control font-sans"
                          rows={5}
                          required
                          placeholder="Describe what happened and the steps you tried. Do not include passwords or sign-in codes."
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                        />
                      </div>

                      {/* Attachments Dropzone */}
                      <div className="mb-4">
                        <label htmlFor="portal-attachments" className="form-label small fw-bold text-dark d-flex flex-wrap justify-content-between gap-1">
                          <span>Supporting Attachments</span>
                          <span className="text-muted fw-normal">PNG, PDF, JPG, JPEG, TXT up to 25MB</span>
                        </label>

                        <div className="p-3 border-2 border-dashed rounded-3 text-center bg-light">
                          <Paperclip size={20} className="text-muted mb-1" />
                          <div className="small text-muted mb-2">Select files from your device</div>
                          <input
                            id="portal-attachments"
                            type="file"
                            multiple
                            accept=".png,.pdf,.jpg,.jpeg,.txt"
                            className="form-control form-control-sm mx-auto"
                            style={{ maxWidth: '280px' }}
                            onChange={e => {
                              if (e.target.files) {
                                const added = Array.from(e.target.files);
                                setAttachments(files => [...files, ...added.filter(file => !files.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified))]);
                                e.target.value = '';
                              }
                            }}
                          />
                        </div>

                        {attachments.length > 0 && (
                          <div className="d-flex flex-wrap gap-2 mt-2">
                            {attachments.map((file, idx) => (
                              <span key={idx} className="badge bg-white text-dark border p-2 d-inline-flex align-items-center gap-1.5 text-wrap" style={{ maxWidth: '100%' }}>
                                <FileText size={14} className="text-primary" />
                                <span style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{file.name}</span>
                                <small className="text-muted">({(file.size / 1024).toFixed(0)} KB)</small>
                                <button type="button" className="btn btn-sm btn-link p-0 text-danger" aria-label={`Remove ${file.name}`} onClick={() => setAttachments(files => files.filter(item => item !== file))}><X size={14} aria-hidden="true" /></button>
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
                        disabled={isSubmitting || !agreedToPrivacy || !deptId || departments.length === 0}
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
                      </fieldset>
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
                                  setActiveTab('home');
                                  onNavigate?.('/' + companySlug);
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
                      Showing inquiries associated with <strong style={{ overflowWrap: 'anywhere' }}>{customerEmail}</strong> in {company?.name}.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm fw-semibold d-flex align-items-center justify-content-center gap-1.5 px-3 py-2 shadow-xs w-100 w-sm-auto"
                    onClick={openTicketForm}
                  >
                    <Send size={15} />
                    <span>Submit a New Ticket</span>
                  </button>
                </div>

                {/* Filter Chips & Search Bar (Mobile Responsive) */}
                <div className="card border-0 shadow-sm rounded-4 p-2.5 p-sm-3 mb-3 mb-md-4 bg-white">
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-stretch align-items-md-center gap-2.5">
                    <div className="d-flex align-items-center gap-1.5 overflow-x-auto text-nowrap pb-1 pb-md-0 w-100" style={{ WebkitOverflowScrolling: 'touch' }}>
                      {(['ALL', 'OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'WAITING_ON_THIRD_PARTY', 'RESOLVED', 'CLOSED'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold flex-shrink-0 ${ticketFilter === f ? 'btn-primary shadow-xs' : 'btn-light text-muted border-0'}`}
                          onClick={() => updateTicketQuery({ status: f, page: 0 })}
                          aria-pressed={ticketFilter === f}
                          style={{ fontSize: '0.78rem' }}
                        >
                          {f === 'WAITING_ON_CUSTOMER' ? 'Waiting on You' : f.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>

                    <div className="input-group input-group-sm w-100 flex-shrink-0" style={{ maxWidth: '280px' }}>
                      <span className="input-group-text bg-light border-end-0">
                        <Search size={14} className="text-muted" />
                      </span>
                      <input
                        type="search"
                        aria-label="Search your tickets by number or subject"
                        maxLength={250}
                        className="form-control bg-light border-start-0"
                        placeholder="Search ticket # or subject..."
                        value={ticketSearchTerm}
                        onChange={e => updateTicketQuery({ q: e.target.value, page: 0 })}
                      />
                    </div>
                  </div>
                </div>

                {ticketsLoading ? <div className="card border-0 shadow-sm rounded-4 p-4 text-center bg-white" role="status">Loading your tickets...</div> : ticketsError ? (
                  <div className="alert alert-danger" role="alert">
                    <p className="mb-2">{ticketsError}</p>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={loadCustomerTickets}>Retry Tickets</button>
                  </div>
                ) : <>
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
                        {myTickets.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-5 text-muted">
                              <LifeBuoy size={36} className="text-muted opacity-50 mb-2 d-block mx-auto" />
                              <div className="fw-semibold">No tickets found in this view</div>
                              <small className="text-muted">Submit an inquiry or change the filter tab.</small>
                            </td>
                          </tr>
                        ) : (
                          myTickets.map(t => (
                            <tr
                              key={t.id}
                              className="cursor-pointer"
                              onClick={() => handleOpenTicketDetail(t)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td className="ps-4">
                                <button type="button" className="btn btn-link p-0 fw-bolder font-monospace text-primary text-start" onClick={event => { event.stopPropagation(); void handleOpenTicketDetail(t); }}>#{t.ticketNumber}</button>
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
                                  {t.department?.name || 'Not provided'}
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
                                {formatDate(t.updatedAt || t.createdAt)}
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
                  {myTickets.length === 0 ? (
                    <div className="card border-0 shadow-sm rounded-4 p-4 text-center text-muted bg-white">
                      <LifeBuoy size={36} className="text-muted opacity-50 mb-2 mx-auto" />
                      <div className="fw-semibold">No tickets found in this view</div>
                      <small className="text-muted">Submit an inquiry or change the filter tab.</small>
                    </div>
                  ) : (
                    myTickets.map(t => (
                      <button
                        type="button"
                        key={t.id}
                        className="card border-0 shadow-sm rounded-3 p-3 bg-white cursor-pointer hover-shadow transition-all text-start w-100"
                        onClick={() => handleOpenTicketDetail(t)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-2">
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

                        <div className="fw-bold text-dark mb-1.5" style={{ fontSize: '0.92rem', lineHeight: '1.35', overflowWrap: 'anywhere' }}>
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
                              {t.department?.name || 'Not provided'}
                            </span>
                            <span className="badge bg-light text-muted border" style={{ fontSize: '0.65rem' }}>
                              {t.priority}
                            </span>
                          </div>
                          <div className="d-flex align-items-center gap-1 text-muted text-end" style={{ fontSize: '0.72rem', minWidth: 0 }}>
                            <span>{formatDate(t.updatedAt || t.createdAt)}</span>
                            <ChevronRight size={14} className="text-muted" />
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3 p-3 border rounded-3 bg-white">
                  <p className="small text-muted mb-0" aria-live="polite">
                    {ticketPage.totalElements === 0 ? '0 matching tickets' : `${ticketPage.number * ticketPage.size + 1}-${ticketPage.number * ticketPage.size + myTickets.length} of ${ticketPage.totalElements} matching tickets`}
                  </p>
                  <nav className="d-flex flex-wrap align-items-center gap-2" aria-label="Ticket pagination">
                    <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Previous ticket page" disabled={ticketQuery.page === 0} onClick={() => updateTicketQuery({ page: ticketQuery.page - 1 })}>Previous</button>
                    <span className="small">Page {ticketPage.totalPages ? ticketPage.number + 1 : 0} of {ticketPage.totalPages}</span>
                    <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Next ticket page" disabled={ticketPage.totalPages === 0 || ticketQuery.page + 1 >= ticketPage.totalPages} onClick={() => updateTicketQuery({ page: ticketQuery.page + 1 })}>Next</button>
                  </nav>
                </div>
                </>}
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
            ) : detailLoading ? (
              <div className="card border-0 shadow-sm rounded-4 p-4 bg-white text-center" role="status">Loading ticket conversation...</div>
            ) : detailError ? (
              <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <p className="text-danger" role="alert">{detailError}</p>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline-primary" disabled={!selectedTicketNumber} onClick={() => selectedTicketNumber && void handleOpenTicketDetail({ ticketNumber: selectedTicketNumber })}>Retry Conversation</button>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => { detailRequest.current += 1; setActiveTab('tickets'); onNavigate?.('/' + companySlug + '/ticketstatus'); }}>Back to My Tickets</button>
                </div>
              </div>
            ) : selectedTicket ? (
              <div>
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-secondary text-decoration-none p-0 d-flex align-items-center gap-1"
                    onClick={() => {
                      detailRequest.current += 1;
                      setSelectedTicket(null);
                      setActiveTab('tickets');
                      onNavigate?.('/' + companySlug + '/ticketstatus');
                    }}
                  >
                    <ArrowLeft size={15} /> Back to My Tickets
                  </button>
                  <div className="d-flex align-items-center gap-2">
                    {['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'WAITING_ON_THIRD_PARTY'].includes(selectedTicket.status) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success fw-semibold"
                        disabled={isUpdatingTicket || isReplying || isSigningOut || isSubmittingCsat}
                        onClick={() => void handleTicketStatus(false)}
                      >
                        {isUpdatingTicket ? 'Updating...' : 'Mark as Resolved'}
                      </button>
                    )}
                    {(selectedTicket.status === 'RESOLVED' || selectedTicket.status === 'CLOSED') && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary fw-semibold d-flex align-items-center gap-1"
                        disabled={isUpdatingTicket || isReplying || isSigningOut || isSubmittingCsat}
                        onClick={() => void handleTicketStatus(true)}
                      >
                        <RotateCcw size={14} /> {isUpdatingTicket ? 'Updating...' : 'Reopen Ticket'}
                      </button>
                    )}
                  </div>
                </div>
                {ticketActionError && <div className="alert alert-danger small" role="alert">
                  {ticketActionError}
                  <button type="button" className="btn btn-sm btn-outline-danger d-block mt-2" disabled={isReplying || isUpdatingTicket} onClick={() => void handleOpenTicketDetail(selectedTicket)}>Reload Conversation</button>
                </div>}

                {/* Ticket Header Card */}
                <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 mb-3 mb-md-4 bg-white">
                  <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start gap-2.5">
                    <div style={{ minWidth: 0, maxWidth: '100%' }}>
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
                      <h4 className="fw-bolder text-dark mb-0 fs-5 fs-md-4" style={{ overflowWrap: 'anywhere' }}>{selectedTicket.subject}</h4>
                    </div>
                    <div className="text-start text-sm-end text-muted small mt-1 mt-sm-0 flex-shrink-0">
                      <div>Opened: {formatDate(selectedTicket.createdAt)}</div>
                      {selectedTicket.updatedAt && <div>Updated: {formatDate(selectedTicket.updatedAt)}</div>}
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
                      <small className="text-muted text-end">{formatDate(selectedTicket.createdAt)}</small>
                    </div>
                    {selectedTicket.descriptionText ? <div className="text-secondary small mt-2 lh-base" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{selectedTicket.descriptionText}</div>
                      : <div className="text-secondary small mt-2 lh-base" style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedTicket.descriptionHtml || '') }} />}
                    {renderAttachments(selectedTicket.attachments)}
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
                              <small className="text-muted" style={{ fontSize: '0.7rem' }}>{isCustomer ? 'Customer' : 'Support Team'}</small>
                            </div>
                          </div>
                          <small className="text-muted">
                            {formatDate(th.createdAt)}
                          </small>
                        </div>
                        {th.bodyHtml ? <div className="text-secondary small mt-2 lh-base" style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(th.bodyHtml) }} />
                          : <div className="text-secondary small mt-2 lh-base" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{th.bodyText}</div>}
                        {renderAttachments(th.attachments)}
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
                      <div className="alert alert-success py-2 px-3 small d-flex align-items-center gap-2 mb-0" role="status">
                        <CheckCircle2 size={16} />
                        <span>Your feedback has been recorded. Thank you for rating our support.</span>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitCsat} aria-busy={isSubmittingCsat}>
                        {csatError && <div className="alert alert-danger small" role="alert">{csatError}</div>}
                        <p className="text-muted small mb-2.5">Rate your experience with our engineering support:</p>
                        <div className="d-flex flex-wrap gap-2 mb-3">
                          {[1, 2, 3, 4, 5].map(star => (
                            <button
                              key={star}
                              type="button"
                              className={`btn btn-sm ${csatRating >= star ? 'btn-warning text-dark' : 'btn-outline-secondary'}`}
                              aria-label={`Rate ${star} out of 5`}
                              aria-pressed={csatRating === star}
                              disabled={isSubmittingCsat || isSigningOut || isUpdatingTicket}
                              onClick={() => setCsatRating(star)}
                            >
                              ★ {star}
                            </button>
                          ))}
                        </div>
                        <label htmlFor="portal-csat-comment" className="form-label small">Feedback Comment (Optional)</label>
                        <textarea
                          id="portal-csat-comment"
                          maxLength={2000}
                          disabled={isSubmittingCsat || isSigningOut || isUpdatingTicket}
                          className="form-control form-control-sm mb-3"
                          rows={2}
                          placeholder="Optional feedback comment on agent helpfulness and response speed..."
                          value={csatComment}
                          onChange={e => setCsatComment(e.target.value)}
                        />
                        <button type="submit" className="btn btn-warning btn-sm fw-bold w-100 w-sm-auto" disabled={isSubmittingCsat || isSigningOut || isUpdatingTicket || csatRating < 1}>
                          {isSubmittingCsat ? 'Saving Feedback...' : 'Submit Feedback'}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* Reply Box */}
                <div className="card border-0 shadow-sm rounded-4 p-3.5 p-md-4 bg-white">
                  <h6 className="fw-bold text-dark mb-2.5">Post a Reply to this Thread</h6>
                  <form onSubmit={handleSendReply} aria-busy={isReplying}>
                    {replyDraft?.error && <div className="alert alert-danger small" role="alert">{replyDraft.error}</div>}
                    {replyDraft?.notice && <div className="alert alert-success small" role="status">{replyDraft.notice}</div>}
                    <fieldset disabled={isReplying || isSigningOut || isUpdatingTicket} style={{ minWidth: 0 }}>
                    <label htmlFor="portal-reply" className="form-label small fw-semibold">Your Reply</label>
                    <textarea
                      id="portal-reply"
                      maxLength={100000}
                      readOnly={replyDraft?.saved}
                      className="form-control mb-3"
                      rows={3}
                      required
                      placeholder="Add details for the support team. Do not include passwords or sign-in codes."
                      value={customerReplyText}
                      onChange={e => updateReplyDraft(selectedTicket.ticketNumber, { text: e.target.value, error: undefined, notice: undefined })}
                    />
                    <label htmlFor="portal-reply-files" className="form-label small fw-semibold">Reply Attachments</label>
                    <input id="portal-reply-files" type="file" multiple accept=".png,.pdf,.jpg,.jpeg,.txt" className="form-control form-control-sm mb-2" disabled={replyDraft?.saved} onChange={event => {
                      if (!event.target.files) return;
                      const added = Array.from(event.target.files);
                      const files = replyDraft?.files || [];
                      updateReplyDraft(selectedTicket.ticketNumber, { files: [...files, ...added.filter(file => !files.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified))] });
                      event.target.value = '';
                    }} />
                    <p className="small text-muted mb-2">PNG, PDF, JPG, JPEG or TXT; up to 25 MB per file.</p>
                    {(replyDraft?.files || []).map((file, index) => <div key={`${file.name}-${index}`} className="d-flex align-items-center justify-content-between gap-2 small mb-2">
                      <span style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{file.name}</span>
                      <button type="button" className="btn btn-sm btn-link text-danger flex-shrink-0" aria-label={`Remove reply attachment ${file.name}`} onClick={() => updateReplyDraft(selectedTicket.ticketNumber, { files: replyDraft!.files.filter(item => item !== file) })}>Remove</button>
                    </div>)}
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-stretch align-items-sm-center gap-2">
                      <span className="small text-muted" style={{ fontSize: '0.78rem' }}>
                        {replyDraft?.saved ? 'Your reply is already saved. Only remaining attachments will be uploaded.' : 'Your reply is visible to the support team in this ticket.'}
                      </span>
                      <button
                        type="submit"
                        disabled={isReplying || !customerReplyText.trim()}
                        className="btn btn-primary btn-sm px-4 py-2 fw-semibold d-flex align-items-center justify-content-center gap-2 w-100 w-sm-auto"
                      >
                        {isReplying ? (
                          <>
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                            <span>{replyDraft?.saved ? 'Uploading...' : 'Sending...'}</span>
                          </>
                        ) : (
                          <>
                            <span>{replyDraft?.saved ? 'Retry Uploads Only' : 'Send Reply'}</span>
                            <Send size={15} />
                          </>
                        )}
                      </button>
                    </div>
                    </fieldset>
                  </form>
                </div>
              </div>
            ) : <div className="card border-0 shadow-sm rounded-4 p-4 bg-white text-center"><p>No ticket is selected.</p><button type="button" className="btn btn-outline-primary" onClick={() => { setActiveTab('tickets'); onNavigate?.('/' + companySlug + '/ticketstatus'); }}>View My Tickets</button></div>}
          </div>
        )}

        {/* ==============================================================
            SCREEN 14: HELP CENTRE AND KNOWLEDGE BASE
            ============================================================== */}
        {activeTab === 'kb' && (
          <div>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
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
                onClick={openTicketForm}
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
                  All Articles ({visibleArticles.length})
              </button>
              {Array.from(new Set(visibleArticles.map(a => a.categoryName))).map(cat => (
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
              {visibleArticles
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
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
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
                  onClick={async () => {
                    const generation = sessionGeneration.current;
                    setArticleError(null);
                    try {
                      await navigator.clipboard.writeText(new URL('/' + encodeURIComponent(companySlug), window.location.origin).href);
                      if (!isCurrentSession(generation)) return;
                      setCopiedLink(true);
                      window.setTimeout(() => { if (isCurrentSession(generation)) setCopiedLink(false); }, 3000);
                    } catch (error) {
                      if (isCurrentSession(generation)) setArticleError(errorMessage(error, 'Unable to copy the portal link.'));
                    }
                  }}
                >
                  <Copy size={14} /> {copiedLink ? 'Copied!' : 'Copy Portal Link'}
                </button>
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 p-4 p-md-5 bg-white mb-4">
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle d-inline-block mb-2 px-2.5 py-1">
                {selectedArticle.categoryName}
              </span>
              <h3 className="fw-bolder text-dark mb-3">{selectedArticle.title}</h3>
              <div className="d-flex align-items-center gap-3 text-muted small pb-3 mb-4 border-bottom">
                <span>Views: {selectedArticle.viewCount ?? 'Not available'}</span>
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
                {articleError && <div className="alert alert-danger small" role="alert">{articleError}</div>}
                <h6 className="fw-bold text-dark mb-2">Was this article helpful?</h6>
                <div className="d-flex justify-content-center gap-2 mb-2">
                  <button
                    type="button"
                    className={`btn btn-sm d-flex align-items-center gap-1.5 px-3 py-1.5 ${articleVoted[selectedArticle.id] === 'yes' ? 'btn-success' : 'btn-outline-secondary'}`}
                    disabled={votingArticle !== null || !!articleVoted[selectedArticle.id]}
                    onClick={() => handleVoteArticle(selectedArticle.id, true)}
                  >
                    <ThumbsUp size={15} /> Yes
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm d-flex align-items-center gap-1.5 px-3 py-1.5 ${articleVoted[selectedArticle.id] === 'no' ? 'btn-danger' : 'btn-outline-secondary'}`}
                    disabled={votingArticle !== null || !!articleVoted[selectedArticle.id]}
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
                    openTicketForm();
                    if ((!submitSuccess && !subject.trim()) || (submitSuccess && attachments.length === 0 && !submitBusy.current)) setSubject(`Inquiry regarding: ${selectedArticle.title}`.slice(0, 200));
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
        {activeTab === 'profile' && !isAuthenticated && renderAuthBarrier('ticketstatus')}
        {isAuthenticated && (
          <div key={`${companySlug}:${customerEmail}`} hidden={activeTab !== 'profile'} className="mx-auto" style={{ maxWidth: '720px' }}>
            <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
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
              <span className="small text-muted">Customer Profile & Privacy</span>
            </div>

            <div className="card border-0 shadow-sm rounded-4 p-3 p-sm-4 p-md-5 bg-white mb-4">
              <div className="d-flex flex-wrap align-items-center gap-3 mb-4 pb-3 border-bottom">
                <div
                  className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                  style={{ width: '56px', height: '56px', backgroundColor: primaryColor, fontSize: '1.4rem' }}
                >
                  {customerName.charAt(0).toUpperCase() || customerEmail.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                  <h5 className="fw-bolder text-dark mb-0" style={{ overflowWrap: 'anywhere' }}>{customerName || 'Customer Account'}</h5>
                  <span className="text-muted small" style={{ overflowWrap: 'anywhere' }}>{customerEmail}</span>
                  <span className="badge bg-success-subtle text-success ms-2" style={{ fontSize: '0.65rem' }}>VERIFIED CUSTOMER</span>
                </div>
              </div>

              <CustomerProfileForm companySlug={companySlug} customerEmail={customerEmail}
                active={activeTab === 'profile'} disabled={isSigningOut} onNameChange={setCustomerName} sessionGeneration={sessionGeneration} />

              {/* Data & Privacy Actions */}
              <h6 className="fw-bold text-dark mb-2">My Data & Privacy</h6>
              <p className="text-muted small mb-3">
                Download the first page of your ticket history, up to 100 tickets, with server-provided pagination metadata. This is not a complete-history export when more than 100 tickets exist. Account deletion requests are not configured.
              </p>
              {exportError && <div className="alert alert-danger small" role="alert">{exportError}</div>}
              <div className="d-flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5"
                  onClick={handleExportData}
                  disabled={isExporting || isSigningOut}
                >
                  <Download size={14} />
                  <span>{isExporting ? 'Preparing Export...' : 'Download First 100 Tickets (JSON)'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled
                  title="Account deletion requests are not configured"
                >
                  Account Deletion (Not Configured)
                </button>
              </div>

              <div className="d-flex flex-wrap gap-2 justify-content-between pt-3 border-top">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                >
                  <LogOut size={14} /> {isSigningOut ? 'Signing Out...' : 'Sign Out'}
                </button>
              </div>
            </div>
          </div>
        )}
        </>}
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-top py-3.5 text-center text-muted small mt-auto mb-5 mb-md-0 pb-4 pb-md-3">
        <div className="container d-flex flex-wrap justify-content-between align-items-center" style={{ maxWidth: '1200px' }}>
          <div>
            © 2026 <strong>{company?.name}</strong>. All rights reserved.
          </div>
          <div className="d-flex flex-wrap justify-content-center align-items-center gap-3">
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
            onClick={openTicketForm}
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
              {isAuthenticated && allTicketTotal !== null && allTicketTotal > 0 && (
                <span
                  className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-white"
                  style={{ fontSize: '0.55rem', padding: '0.15em 0.35em' }}
                >
                  {allTicketTotal}
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
              disabled={sessionStatus !== 'anonymous' || !company}
              onClick={event => {
                openAuthModal(event);
                setMobileMenuOpen(false);
              }}
            >
              <Lock size={19} className="mb-0.5" />
              <span className="text-truncate">{sessionStatus === 'checking' ? 'Checking' : 'Sign In'}</span>
            </button>
          )}
        </div>
      </nav>

      {/* ==============================================================
          SCREEN 10: CUSTOMER LOGIN MODAL (OTP & OAUTH)
          ============================================================== */}
      <dialog ref={authDialog} className="account-flow-dialog" aria-labelledby="portal-sign-in-title" onCancel={event => { event.preventDefault(); setShowAuthModal(false); }} onClose={() => setShowAuthModal(false)}>
        <div className="account-flow-header position-relative">
          <span className="account-flow-mark"><LifeBuoy size={24} aria-hidden="true" /></span>
          <div>
            <h2 id="portal-sign-in-title">Customer Sign In</h2>
            <p>Access your {company?.name || 'support'} tickets securely.</p>
          </div>
          <button type="button" className="btn-close position-absolute top-0 end-0 m-3" aria-label="Close customer sign-in" onClick={() => setShowAuthModal(false)} />
        </div>
        <div className="modal-body p-4">{showAuthModal && renderSignIn()}</div>
      </dialog>
    </div>
  );
};
