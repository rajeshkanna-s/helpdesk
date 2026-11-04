import React, { useState, useEffect, useRef } from 'react';
import {
  Building2, ShieldCheck, Users, Ticket as TicketIcon, Plus, Power,
  KeyRound, RefreshCw, LogOut, ArrowRight, CheckCircle2,
  AlertCircle, Edit3, Settings, ShieldAlert, LayoutDashboard,
  Database, Globe, Search, Layers, Lock, Server, Mail,
  FileSpreadsheet, BarChart3, ChevronRight, Activity,
  CreditCard, Clock, Sliders, Tag, Ban,
  Eye, EyeOff, Download, Trash2,
  X, Menu, MoreHorizontal
} from 'lucide-react';
import { apiService } from '../services/api';
import type { AdminOverview, CompanyDetail, User, AuthUser } from '../types';

export type WorkspaceTab = 'tickets' | 'dashboard' | 'mailboxes' | 'mis' | 'engineers';

interface SuperAdminPortalProps {
  currentUser: AuthUser;
  onLogout: () => void;
  onSwitchToCompany: (companyId: number, initialTab?: WorkspaceTab) => void;
}

// 7 Top-Level Admin Navigation Sections covering Screens 40 through 43 + Utilities
type AdminMenuSection =
  | 'overview'       // Screen 40: Super Admin Executive Dashboard
  | 'companies'      // Screen 41: Companies Directory & In-Depth Company Detail
  | 'plans'          // Screen 42: Plans, Pricing & Entitlements Management
  | 'platform'       // Screen 43: Platform Settings, Email System Health & Abuse Tools
  | 'credentials'    // Staff Identity & Multi-Tenant Credentials
  | 'workspaces'     // Tenant Workspaces & Direct Launchers
  | 'system';        // MySQL DB Schema & Security Architecture

function PlatformDialog({ title, onClose, children, wide = false, busy = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; busy?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea')?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={dialogRef} className={`platform-dialog ${wide ? 'platform-dialog-wide' : ''}`} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      {children}
    </dialog>
  );
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  currentUser,
  onLogout,
  onSwitchToCompany,
}) => {
  const [activeMenu, setActiveMenu] = useState<AdminMenuSection>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [companies, setCompanies] = useState<CompanyDetail[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [alertNotice, setAlertNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDetailsElement>(null);
  const dataRequestRef = useRef(0);

  // Screen 41: Companies List & Filter States
  const [compSearch, setCompSearch] = useState('');
  const [compStatusFilter, setCompStatusFilter] = useState<string>('ALL');
  const [compPlanFilter, setCompPlanFilter] = useState<string>('ALL');
  const [compHealthFilter, setCompHealthFilter] = useState<string>('ALL');
  const [unmaskedEmails, setUnmaskedEmails] = useState<Record<number, boolean>>({});

  // Screen 41b: Company Detail Drawer / Modal State
  const [selectedCompanyDetail, setSelectedCompanyDetail] = useState<CompanyDetail | null>(null);
  const [companyDetailTab, setCompanyDetailTab] = useState<'overview' | 'billing' | 'usage' | 'email' | 'users' | 'security' | 'notes' | 'audit'>('overview');
  const [staffNotes, setStaffNotes] = useState<Record<number, string[]>>({});
  const [newStaffNoteInput, setNewStaffNoteInput] = useState('');

  // Modals for Actions on Companies (Section F Safety Rails)
  const [showExtendTrialModal, setShowExtendTrialModal] = useState<CompanyDetail | null>(null);
  const [trialDaysToAdd, setTrialDaysToAdd] = useState<number>(14);
  const [trialExtendReason, setTrialExtendReason] = useState<string>('Sales team authorized evaluation extension');

  const [showChangePlanModal, setShowChangePlanModal] = useState<CompanyDetail | null>(null);
  const [newPlanTarget, setNewPlanTarget] = useState<string>('PRO');

  const [showSuspendModal, setShowSuspendModal] = useState<CompanyDetail | null>(null);
  const [suspendReason, setSuspendReason] = useState<string>('');

  const [showDeleteModal, setShowDeleteModal] = useState<CompanyDetail | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState<string>('');

  const [showSupportSessionModal, setShowSupportSessionModal] = useState<CompanyDetail | null>(null);
  const [supportSessionReason, setSupportSessionReason] = useState<string>('Investigating customer mailbox inbound sync issue');

  // Screen 42: Plans & Coupons States
  const [showPlanEditorModal, setShowPlanEditorModal] = useState<any | null>(null);
  const [showNewCouponModal, setShowNewCouponModal] = useState<boolean>(false);
  const [newCouponCode, setNewCouponCode] = useState<string>('');
  const [newCouponDiscount, setNewCouponDiscount] = useState<number>(25);
  const [newCouponDuration, setNewCouponDuration] = useState<string>('3_MONTHS');
  const [newCouponMax, setNewCouponMax] = useState<number>(50);
  const [grandfatheringPolicy, setGrandfatheringPolicy] = useState<'grandfather' | 'migrate'>('grandfather');

  // Screen 43: Platform Settings, System Health & Abuse States
  const [platformName, setPlatformName] = useState<string>('Kuwy HelpDesk');
  const [platformSupportEmail, setPlatformSupportEmail] = useState<string>('support@kuwyhelp.com');
  const [signupControl, setSignupControl] = useState<'OPEN' | 'INVITE_ONLY' | 'CLOSED'>('OPEN');
  const [blockedDomains, setBlockedDomains] = useState<string[]>([
    'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'trashmail.com'
  ]);
  const [newBlockedDomainInput, setNewBlockedDomainInput] = useState<string>('');
  const [globalRateLimitRpm, setGlobalRateLimitRpm] = useState<number>(300);
  const [ticketRateLimitPerHour, setTicketRateLimitPerHour] = useState<number>(20);
  const [maintenanceModeActive, setMaintenanceModeActive] = useState<boolean>(false);
  const [maintenanceBannerText, setMaintenanceBannerText] = useState<string>('Scheduled platform maintenance tonight from 02:00 to 03:00 UTC.');
  const [globalAnnouncementActive, setGlobalAnnouncementActive] = useState<boolean>(false);
  const [globalAnnouncementText, setGlobalAnnouncementText] = useState<string>('New SLA escalation rules and automated agent assignment are now live across all workspaces.');
  const [emergencyOutboundPaused, setEmergencyOutboundPaused] = useState<boolean>(false);

  // Screen 43c: Abuse Reports & Platform Blocklist
  const [abuseReports, setAbuseReports] = useState<any[]>([]);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [newBlockedIpInput, setNewBlockedIpInput] = useState<string>('');

  // Credentials & Workspace States
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [userCompanyFilter, setUserCompanyFilter] = useState<string>('ALL');

  // New Company / Credential Modals
  const [showNewCompanyModal, setShowNewCompanyModal] = useState(false);
  const [showNewCredModal, setShowNewCredModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<User | null>(null);

  // New Company Form Data
  const [newCompName, setNewCompName] = useState('');
  const [newCompCode, setNewCompCode] = useState('');
  const [newCompSubdomain, setNewCompSubdomain] = useState('');
  const [newCompPlan, setNewCompPlan] = useState('STARTER');
  const [newCompMaxAgents, setNewCompMaxAgents] = useState(10);
  const [newCompAdminFirst, setNewCompAdminFirst] = useState('');
  const [newCompAdminLast, setNewCompAdminLast] = useState('');
  const [newCompAdminEmail, setNewCompAdminEmail] = useState('');
  const [newCompAdminPassword, setNewCompAdminPassword] = useState('');

  // New Credential Form Data
  const [credCompanyId, setCredCompanyId] = useState<number>(1);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credFirstName, setCredFirstName] = useState('');
  const [credLastName, setCredLastName] = useState('');
  const [credPhone, setCredPhone] = useState('');
  const [credRoleType, setCredRoleType] = useState('AGENT');

  // Reset Password Form Data
  const [newPasswordVal, setNewPasswordVal] = useState('');

  useEffect(() => {
    loadAdminData();
    return () => { dataRequestRef.current += 1; };
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavigationOpen(false);
        actionsRef.current?.removeAttribute('open');
      }
    };
    const onOutsideActions = (event: PointerEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) actionsRef.current.removeAttribute('open');
    };
    const desktop = window.matchMedia('(min-width: 1100px)');
    const onDesktop = () => { if (desktop.matches) setIsNavigationOpen(false); };
    document.addEventListener('keydown', onEscape);
    document.addEventListener('pointerdown', onOutsideActions);
    desktop.addEventListener('change', onDesktop);
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('pointerdown', onOutsideActions);
      desktop.removeEventListener('change', onDesktop);
    };
  }, []);

  useEffect(() => {
    if (!isNavigationOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = navigationRef.current?.querySelectorAll<HTMLElement>('button, a, select');
    controls?.[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.removeEventListener('keydown', trapFocus); if (previous?.isConnected) previous.focus(); };
  }, [isNavigationOpen]);

  async function loadAdminData() {
    const requestId = ++dataRequestRef.current;
    setIsLoading(true);
    try {
      const [overviewData, companiesData, usersData, plansData, couponsData] = await Promise.all([
        apiService.getAdminOverview(),
        apiService.getAdminCompanies(),
        apiService.getAdminUsers(),
        apiService.getPlatformPlans(),
        apiService.getPlatformCoupons(),
      ]);
      if (requestId !== dataRequestRef.current) return;
      setOverview(overviewData);
      setCompanies(companiesData);
      setSelectedCompanyDetail(current => current ? companiesData.find(company => company.id === current.id) ?? null : null);
      setUsers(usersData);
      setPlans(plansData);
      setCoupons(couponsData);
      setLastRefreshed(new Date().toISOString());
      if (companiesData.length > 0 && !companiesData.some(company => company.id === credCompanyId)) {
        setCredCompanyId(companiesData[0].id);
      }
    } catch {
      if (requestId === dataRequestRef.current) setAlertNotice({ type: 'danger', message: 'Platform data could not be loaded. Please try refreshing.' });
    } finally {
      if (requestId === dataRequestRef.current) setIsLoading(false);
    }
  }

  // Helper to mask owner emails for super admin privacy: e.g. "admin@kuwy.in" -> "adm***@kuwy.in"
  const maskEmail = (email: string) => {
    if (!email) return 'Not available';
    const parts = email.split('@');
    if (parts.length < 2) return 'Not available';
    const name = parts[0];
    const domain = parts[1];
    const visiblePrefix = name.slice(0, Math.min(3, name.length));
    return `${visiblePrefix}***@${domain}`;
  };

  // Quick Action: Extend Trial (+14 days)
  const handleExtendTrialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showExtendTrialModal) return;
    try {
      await apiService.extendCompanyTrial(showExtendTrialModal.id, trialDaysToAdd, trialExtendReason);
      setAlertNotice({
        type: 'success',
        message: `${showExtendTrialModal.name} is now marked as a trial workspace. An expiry date has not been scheduled.`,
      });
      setShowExtendTrialModal(null);
      loadAdminData();
    } catch (err: any) {
      setAlertNotice({ type: 'danger', message: err.message || 'Failed to extend company trial' });
    }
  };

  // Quick Action: Change Plan
  const handleChangePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showChangePlanModal) return;
    try {
      const maxAgents = plans.find(plan => plan.code === newPlanTarget)?.maxAgents ?? showChangePlanModal.maxAgents;
      await apiService.updateCompanyLimits(showChangePlanModal.id, newPlanTarget, maxAgents);
      setAlertNotice({
        type: 'success',
        message: `Company plan and staff capacity updated for ${showChangePlanModal.name}. No payment was processed.`,
      });
      setShowChangePlanModal(null);
      loadAdminData();
    } catch (err: any) {
      setAlertNotice({ type: 'danger', message: err.message || 'Failed to change plan' });
    }
  };

  // Quick Action: Suspend / Reactivate Company
  const handleSuspendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSuspendModal) return;
    try {
      const nextStatus = showSuspendModal.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      if (nextStatus === 'SUSPENDED') await apiService.suspendCompany(showSuspendModal.id, suspendReason);
      else await apiService.updateCompanyStatus(showSuspendModal.id, nextStatus);
      setAlertNotice({
        type: 'success',
        message: `${showSuspendModal.name} status updated to ${nextStatus.toLowerCase()}.`,
      });
      setShowSuspendModal(null);
      loadAdminData();
    } catch (err: any) {
      setAlertNotice({ type: 'danger', message: err.message || 'Failed to update company suspension state' });
    }
  };

  // Quick Action: Soft Delete Company with Name Confirmation
  const handleDeleteCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDeleteModal) return;
    if (deleteConfirmationInput.trim().toLowerCase() !== showDeleteModal.name.trim().toLowerCase()) {
      setAlertNotice({ type: 'danger', message: `Confirmation text must match '${showDeleteModal.name}' exactly.` });
      return;
    }
    try {
      await apiService.deleteCompany(showDeleteModal.id, showDeleteModal.name);
      setAlertNotice({
        type: 'success',
        message: `${showDeleteModal.name} has been deactivated. Stored data is retained; automatic deletion is not configured.`,
      });
      setShowDeleteModal(null);
      setDeleteConfirmationInput('');
      setSelectedCompanyDetail(null);
      loadAdminData();
    } catch (err: any) {
      setAlertNotice({ type: 'danger', message: err.response?.data?.error || err.message || 'Failed to delete company' });
    }
  };

  // Add Staff Note
  const handleAddStaffNote = (companyId: number) => {
    if (!newStaffNoteInput.trim()) return;
    const existing = staffNotes[companyId] || [];
    setStaffNotes({
      ...staffNotes,
      [companyId]: [...existing, `[${currentUser.displayName || 'Super Admin'}] ${newStaffNoteInput.trim()}`]
    });
    setNewStaffNoteInput('');
  };

  // Add Coupon
  const handleCreateCouponSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode.trim()) return;
    const newEntry = {
      code: newCouponCode.toUpperCase().trim(),
      discountPercent: newCouponDiscount,
      duration: newCouponDuration,
      redemptionCount: 0,
      maxRedemptions: newCouponMax,
      isActive: true,
    };
    setCoupons([newEntry, ...coupons]);
    setShowNewCouponModal(false);
    setNewCouponCode('');
    setAlertNotice({ type: 'success', message: `Coupon '${newEntry.code}' added to the local preview only. It has not been published.` });
  };

  // Filtered Companies List (Screen 41a)
  const filteredCompanies = companies.filter(c => {
    const matchesStatus = compStatusFilter === 'ALL' || c.status === compStatusFilter;
    const matchesPlan = compPlanFilter === 'ALL' || c.planName?.toUpperCase() === compPlanFilter.toUpperCase();

    // Health flag filter
    let matchesHealth = true;
    const seatUtil = (c.userCount || 0) / Math.max(1, c.maxAgents || 1);
    if (compHealthFilter === 'HEALTHY') matchesHealth = c.status === 'ACTIVE' && seatUtil < 0.85;
    if (compHealthFilter === 'NEAR_LIMIT') matchesHealth = seatUtil >= 0.85;
    if (compHealthFilter === 'AT_RISK') matchesHealth = c.status === 'SUSPENDED' || (c as any).status === 'PAST_DUE';

    const matchesSearch = !compSearch.trim() ||
      c.name.toLowerCase().includes(compSearch.toLowerCase()) ||
      c.companyCode.toLowerCase().includes(compSearch.toLowerCase()) ||
      c.subdomain.toLowerCase().includes(compSearch.toLowerCase()) ||
      (c.ownerEmail && c.ownerEmail.toLowerCase().includes(compSearch.toLowerCase()));

    return matchesStatus && matchesPlan && matchesHealth && matchesSearch;
  });

  // Filtered Users List
  const filteredUsers = users.filter(u => {
    const compCode = (u as any).company?.companyCode || 'SYS';
    const roleType = u.role?.roleType || '';
    const matchesRole = userRoleFilter === 'ALL' || roleType === userRoleFilter;
    const matchesComp = userCompanyFilter === 'ALL' || compCode === userCompanyFilter;
    const matchesSearch = !userSearch.trim() ||
      (u.displayName || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(userSearch.toLowerCase());
    return matchesRole && matchesComp && matchesSearch;
  });

  const menuTitleMap: Record<AdminMenuSection, { title: string; subtitle: string }> = {
    overview: {
      title: 'Overview',
      subtitle: 'A clear view of your companies, workspace usage, and next actions.',
    },
    companies: {
      title: 'Companies',
      subtitle: 'Manage company accounts, plans, and workspace capacity in one place.',
    },
    plans: {
      title: 'Plans & pricing',
      subtitle: 'Review your plan catalog, pricing, and included capabilities.',
    },
    platform: {
      title: 'Platform settings',
      subtitle: 'Configuration, monitoring availability, and platform-wide controls.',
    },
    credentials: {
      title: 'Staff access',
      subtitle: 'Manage staff accounts and role assignments across your companies.',
    },
    workspaces: {
      title: 'Workspaces',
      subtitle: 'Choose a company before opening its support workspace.',
    },
    system: {
      title: 'System reference',
      subtitle: 'Reference information about the application structure and data model.',
    },
  };

  const navigateToMenu = (section: AdminMenuSection) => {
    setActiveMenu(section);
    setSelectedCompanyDetail(null);
    setIsNavigationOpen(false);
    contentRef.current?.scrollTo({ top: 0 });
  };
  const openCompanyDetail = (company: CompanyDetail) => {
    navigateToMenu('companies');
    setSelectedCompanyDetail(company);
    setCompanyDetailTab('overview');
  };
  const openNewCompanyForm = () => {
    setAlertNotice(null);
    const plan = plans.find(item => item.code === newCompPlan);
    if (plan?.maxAgents > 0) setNewCompMaxAgents(plan.maxAgents);
    setShowNewCompanyModal(true);
  };
  const companyPlanMix = [...new Set([...plans.map(plan => String(plan.code)), ...companies.map(company => company.planName)])].map(plan => ({ plan, count: companies.filter(company => company.planName === plan).length }));
  const recentCompanies = [...companies].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).slice(0, 5);
  const attentionCompanies = companies.filter(company => ['SUSPENDED', 'PAST_DUE'].includes(company.status) || company.userCount / Math.max(1, company.maxAgents) >= 0.85);

  // Helper for KPI card click-throughs to filter Companies list (Screen 40 -> Screen 41 interaction)
  const jumpToFilteredCompanies = (status: string) => {
    setCompStatusFilter(status);
    setCompPlanFilter('ALL');
    setCompHealthFilter('ALL');
    setCompSearch('');
    navigateToMenu('companies');
  };

  return (
    <div className={`enterprise-shell company-workspace platform-console ${isNavigationOpen ? 'navigation-open' : ''}`}>
      {isNavigationOpen && <button type="button" className="workspace-nav-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={() => setIsNavigationOpen(false)} />}
      <aside ref={navigationRef} id="platform-navigation" className="enterprise-sidebar" aria-label="Platform navigation">
        <div className="sidebar-brand-header">
          <div className="sidebar-brand-icon"><ShieldCheck size={22} /></div>
          <div className="workspace-wordmark"><strong>kuwy<span>admin</span></strong><small>Platform operations</small></div>
          <button type="button" className="workspace-icon-button workspace-nav-close" aria-label="Close navigation" onClick={() => setIsNavigationOpen(false)}><X size={18} /></button>
        </div>
        <div className="workspace-company-label"><Layers size={15} /><span>Platform administration</span></div>
        <nav className="workspace-sidebar-scroll" aria-label="Main">
          {[
            { label: 'Platform', items: [
              { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
              { id: 'companies' as const, label: 'Companies', icon: Building2 },
              { id: 'plans' as const, label: 'Plans & pricing', icon: CreditCard },
            ] },
            { label: 'Administration', items: [
              { id: 'credentials' as const, label: 'Staff access', icon: Users },
              { id: 'workspaces' as const, label: 'Workspaces', icon: Layers },
              { id: 'platform' as const, label: 'Platform settings', icon: Settings },
              { id: 'system' as const, label: 'System reference', icon: Database },
            ] },
          ].map(group => (
            <div key={group.label}>
              <div className="sidebar-section-label">{group.label}</div>
              <div className="sidebar-nav-group">
                {group.items.map(item => (
                  <button key={item.id} id={`platform-tab-${item.id}`} type="button" className={`sidebar-menu-btn ${activeMenu === item.id ? 'active' : ''}`} aria-current={activeMenu === item.id ? 'page' : undefined} onClick={() => navigateToMenu(item.id)}>
                    <item.icon size={18} /><span>{item.label}</span>
                    {item.id === 'companies' && <span className="sidebar-badge">{companies.length}</span>}
                    {item.id === 'credentials' && <span className="sidebar-badge">{users.length}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="workspace-plan-card">
          <span className="workspace-eyebrow">Company operations</span>
          <div><strong>Workspace directory</strong><Layers size={14} className="text-muted" /></div>
          <button type="button" onClick={() => navigateToMenu('workspaces')}>Choose a workspace <ChevronRight size={14} /></button>
        </div>
        <div className="sidebar-footer">
          <div className="workspace-user">
            <div className="workspace-avatar">{currentUser.firstName?.charAt(0) || 'S'}{currentUser.lastName?.charAt(0)}</div>
            <div className="workspace-user-info"><strong title={currentUser.displayName}>{currentUser.displayName || 'Platform owner'}</strong><span>Super admin</span></div>
            <button type="button" className="workspace-icon-button" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="enterprise-main" inert={isNavigationOpen}>
        <header className="enterprise-topbar">
          <div className="workspace-header-context">
            <button id="btn-platform-menu" type="button" className="workspace-icon-button workspace-menu-toggle" aria-label="Open navigation" aria-expanded={isNavigationOpen} aria-controls="platform-navigation" onClick={() => setIsNavigationOpen(true)}><Menu size={20} /></button>
            <div className="workspace-breadcrumb"><span>Platform</span><ChevronRight size={14} /><strong>{menuTitleMap[activeMenu].title}</strong></div>
          </div>
          <div className="workspace-topbar-actions">
            <button id="btn-platform-refresh" type="button" className="workspace-icon-button" onClick={loadAdminData} disabled={isLoading} aria-label="Refresh platform data" title="Refresh platform data"><RefreshCw size={17} className={isLoading ? 'spin' : ''} /></button>
            <details ref={actionsRef} className="workspace-tools-menu">
              <summary className="workspace-icon-button" aria-label="Platform quick actions" title="Quick actions"><MoreHorizontal size={20} /></summary>
              <div className="workspace-tools-popover">
                <span className="workspace-eyebrow">Quick actions</span>
                <button type="button" onClick={event => { setShowNewCredModal(true); event.currentTarget.closest('details')?.removeAttribute('open'); }}><KeyRound size={16} /><span>Add staff account</span></button>
                <button type="button" onClick={event => { navigateToMenu('workspaces'); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Layers size={16} /><span>Open workspace directory</span></button>
              </div>
            </details>
            <button id="btn-new-company" type="button" className="btn btn-primary workspace-new-ticket" onClick={openNewCompanyForm} aria-label="New company" title="New company"><Plus size={16} /><span>New company</span></button>
          </div>
        </header>

        <div ref={contentRef} className="enterprise-content" role="main">
          <div className="workspace-page-heading">
            <div><span className="workspace-eyebrow">Platform administration</span><h1>{menuTitleMap[activeMenu].title}</h1><p>{menuTitleMap[activeMenu].subtitle}</p></div>
            <span className="platform-snapshot"><Clock size={13} />{isLoading ? 'Refreshing...' : lastRefreshed ? `Refreshed ${new Date(lastRefreshed).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'No snapshot yet'}</span>
          </div>
          {/* Alert Notification */}
          {alertNotice && (
            <div
              className={`alert alert-${alertNotice.type} alert-dismissible fade show shadow-sm py-2.5 px-3.5 mb-4 rounded-3 border-0 d-flex align-items-center justify-content-between`}
              role="alert"
            >
              <div className="d-flex align-items-center gap-2">
                {alertNotice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span className="fw-semibold small">{alertNotice.message}</span>
              </div>
              <button
                type="button"
                className="btn-close p-2"
                onClick={() => setAlertNotice(null)}
              ></button>
            </div>
          )}

          {/* ================================================================
              SCREEN 40: SUPER ADMIN DASHBOARD
              ================================================================ */}
          {activeMenu === 'overview' && (
            <div className="platform-content-inner" aria-busy={isLoading}>
              <div className="platform-stat-grid">
                {[
                  { label: 'Total companies', value: overview?.totalCompanies ?? companies.length, note: 'All registered workspaces', icon: Building2, action: () => jumpToFilteredCompanies('ALL') },
                  { label: 'Active workspaces', value: overview?.activeCompanies ?? companies.filter(company => company.status === 'ACTIVE').length, note: 'Currently marked active', icon: CheckCircle2, action: () => jumpToFilteredCompanies('ACTIVE') },
                  { label: 'On trial', value: overview?.trialCompanies ?? companies.filter(company => company.status === 'TRIAL').length, note: 'Companies evaluating the platform', icon: Clock, action: () => jumpToFilteredCompanies('TRIAL') },
                  { label: 'Estimated monthly plan value', value: overview?.mrr == null ? 'Not available' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(overview.mrr), note: 'Plan estimate, not collected revenue', icon: CreditCard, action: () => navigateToMenu('plans') },
                ].map(metric => (
                  <button key={metric.label} type="button" className="platform-stat-card" onClick={metric.action}>
                    <span className="d-flex align-items-center justify-content-between gap-2"><span className="platform-stat-label">{metric.label}</span><span className="stat-icon bg-primary-subtle text-primary"><metric.icon size={18} /></span></span>
                    <span className={`platform-stat-value ${metric.value === 'Not available' ? 'is-unavailable' : ''}`}>{isLoading && !overview ? '...' : metric.value}</span>
                    <span className="platform-stat-note">{metric.note}</span>
                  </button>
                ))}
              </div>

              <div className="platform-overview-grid">
                <section className="enterprise-card">
                  <div className="enterprise-card-header"><div><h6 className="fw-bold mb-0">Company plan mix</h6><small>Current assignments across registered companies</small></div><span className="badge bg-light text-secondary border">{companies.length} companies</span></div>
                  <div className="p-4">
                    {companyPlanMix.map(({ plan, count }) => <div key={plan} className="platform-plan-row"><span>{plan}</span><div className="quota-bar" aria-hidden="true"><div className="quota-bar-fill" style={{ width: `${count / Math.max(1, companies.length) * 100}%` }} /></div><span>{count}</span></div>)}
                    {!companyPlanMix.length && <p className="text-muted small mb-0">Plan assignments will appear when companies are available.</p>}
                    <p className="platform-source-note">Includes all company statuses. These counts are not a revenue or retention report.</p>
                  </div>
                </section>
                <section className="enterprise-card">
                  <div className="enterprise-card-header"><div><h6 className="fw-bold mb-0">Recent companies</h6><small>Your newest registered workspaces</small></div><Building2 size={17} className="text-muted" /></div>
                  {recentCompanies.map(company => (
                    <button key={company.id} type="button" className="platform-workspace-row" onClick={() => openCompanyDetail(company)}>
                      <span className="platform-company-avatar">{company.companyCode.slice(0, 2)}</span>
                      <span className="platform-workspace-copy"><strong>{company.name}</strong><small>{company.subdomain} / {company.planName}</small></span>
                      <ChevronRight size={15} className="text-muted flex-shrink-0" />
                    </button>
                  ))}
                  {!recentCompanies.length && <div className="platform-attention-empty"><Building2 size={24} /><span>No companies yet. Create your first workspace to get started.</span></div>}
                  <div className="p-3 border-top"><button type="button" className="btn btn-link btn-sm text-decoration-none p-0" onClick={() => jumpToFilteredCompanies('ALL')}>View all companies <ArrowRight size={13} /></button></div>
                </section>
              </div>

              <div className="platform-overview-grid">
                <section className="enterprise-card">
                  <div className="enterprise-card-header"><div><h6 className="fw-bold mb-0">Needs attention</h6><small>Company status and staff-capacity checks</small></div><span className="badge bg-light text-secondary border">{attentionCompanies.length}</span></div>
                  {attentionCompanies.map(company => <button key={company.id} type="button" className="platform-workspace-row" onClick={() => openCompanyDetail(company)}><AlertCircle size={18} className="text-warning flex-shrink-0" /><span className="platform-workspace-copy"><strong>{company.name}</strong><small>{['SUSPENDED', 'PAST_DUE'].includes(company.status) ? company.status.replace(/_/g, ' ').toLowerCase() : `${company.userCount} of ${company.maxAgents} staff slots used`}</small></span><ChevronRight size={15} /></button>)}
                  {!attentionCompanies.length && <div className="platform-attention-empty"><CheckCircle2 size={25} /><strong>No matching flags</strong><span>No loaded companies are suspended, past due, or above 85% staff capacity.</span></div>}
                </section>
                <section className="enterprise-card">
                  <div className="enterprise-card-header"><div><h6 className="fw-bold mb-0">Workspace footprint</h6><small>Stored records across the platform</small></div><Layers size={17} className="text-muted" /></div>
                  <div className="p-4">
                    <div className="platform-usage-grid">
                      <div><TicketIcon size={19} className="text-primary" /><strong>{(overview?.totalTickets ?? companies.reduce((sum, company) => sum + company.ticketCount, 0)).toLocaleString()}</strong><small>Total tickets</small></div>
                      <div><Users size={19} className="text-primary" /><strong>{(overview?.totalAgents ?? users.length).toLocaleString()}</strong><small>User accounts</small></div>
                      <div><Power size={19} className="text-primary" /><strong>{overview?.suspendedCompanies ?? companies.filter(company => company.status === 'SUSPENDED').length}</strong><small>Suspended</small></div>
                    </div>
                    <p className="platform-source-note">Counts only. Customer conversations are not displayed in this overview.</p>
                  </div>
                </section>
              </div>

              <section className="enterprise-card">
                <div className="enterprise-card-header"><div><h6 className="fw-bold mb-0">Monitoring availability</h6><small>Operational signals are shown only when supported by measured data</small></div><button type="button" className="btn btn-sm btn-light" onClick={() => navigateToMenu('platform')}>Platform settings <ChevronRight size={13} /></button></div>
                <div className="p-4 platform-health-grid">
                  <div className="platform-unavailable"><Mail size={19} className="mb-2" /><strong>Email delivery</strong><span>Not monitored. Live delivery, bounce, and queue metrics are not available yet.</span></div>
                  <div className="platform-unavailable"><Activity size={19} className="mb-2" /><strong>Service performance</strong><span>Not monitored. Response-time and error-rate measurements are not connected.</span></div>
                  <div className="platform-unavailable"><CreditCard size={19} className="mb-2" /><strong>Payment reporting</strong><span>Unavailable. Verified collections, payment failures, and historical revenue are not included in this snapshot.</span></div>
                </div>
              </section>
            </div>
          )}

          {/* ================================================================
              SCREEN 41: COMPANIES LIST AND COMPANY DETAIL
              ================================================================ */}
          {activeMenu === 'companies' && (
            <div className="animate-fade-in">
              {/* If a company detail view is selected, render the 8-tab Inspector */}
              {selectedCompanyDetail ? (
                <div className="enterprise-card mb-4">
                  {/* Company Detail Header */}
                  <div className="enterprise-card-header platform-company-detail-header bg-white border-bottom p-4">
                    <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 w-100">
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="rounded-3 d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
                          style={{
                            width: '52px',
                            height: '52px',
                            backgroundColor: selectedCompanyDetail.primaryColor || '#2563eb',
                            fontSize: '1.1rem',
                          }}
                        >
                          {selectedCompanyDetail.companyCode.slice(0, 3)}
                        </div>
                        <div>
                          <div className="d-flex align-items-center gap-2">
                            <h5 className="fw-bolder mb-0 text-dark">{selectedCompanyDetail.name}</h5>
                            <span className={`badge-status ${selectedCompanyDetail.status === 'ACTIVE' ? 'badge-resolved' : selectedCompanyDetail.status === 'TRIAL' ? 'badge-in_progress' : selectedCompanyDetail.status === 'SUSPENDED' ? 'badge-urgent' : 'badge-closed'}`}>
                              {selectedCompanyDetail.status}
                            </span>
                            <span className="badge bg-light text-dark border fw-bold">
                              {selectedCompanyDetail.planName}
                            </span>
                          </div>
                          <div className="text-muted small mt-1">
                            <code>/{selectedCompanyDetail.subdomain}</code> • Custom domain: <strong>{selectedCompanyDetail.customDomain || 'Not configured'}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Header Quick Actions */}
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success d-flex align-items-center gap-1.5 rounded-3 fw-semibold"
                          onClick={() => setShowExtendTrialModal(selectedCompanyDetail)}
                        >
                          <Clock size={14} />
                          <span>Trial settings</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5 rounded-3 fw-semibold"
                          onClick={() => setShowChangePlanModal(selectedCompanyDetail)}
                        >
                          <Edit3 size={14} />
                          <span>Change plan</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-warning text-dark d-flex align-items-center gap-1.5 rounded-3 fw-semibold shadow-xs"
                          onClick={() => setShowSupportSessionModal(selectedCompanyDetail)}
                        >
                          <Eye size={14} />
                          <span>Support access</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 rounded-3"
                          onClick={() => { setSuspendReason(''); setShowSuspendModal(selectedCompanyDetail); }}
                        >
                          <Power size={14} />
                          <span>{selectedCompanyDetail.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 rounded-3"
                          onClick={() => { setDeleteConfirmationInput(''); setShowDeleteModal(selectedCompanyDetail); }}
                        >
                          <Trash2 size={14} />
                          <span>Deactivate</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-dark d-flex align-items-center gap-1 rounded-3 ms-2"
                          onClick={() => setSelectedCompanyDetail(null)}
                        >
                          <X size={14} />
                          <span>Back to companies</span>
                        </button>
                      </div>
                    </div>

                    {/* Inspector Sub-Navigation (8 Detailed Tabs) */}
                    <div className="platform-detail-tabs mt-3 border-top" aria-label="Company details sections">
                      {(['overview', 'billing', 'usage', 'email', 'users', 'security', 'notes', 'audit'] as const).map(tab => (
                        <button
                          key={tab}
                          type="button"
                          className={`btn btn-sm px-3 rounded-pill fw-semibold ${companyDetailTab === tab ? 'btn-primary' : 'btn-light border-0 text-secondary'}`}
                          style={{ fontSize: '0.78rem' }}
                          onClick={() => setCompanyDetailTab(tab)}
                          aria-pressed={companyDetailTab === tab}
                        >
                          {tab === 'overview' && 'Overview'}
                          {tab === 'billing' && 'Billing'}
                          {tab === 'usage' && 'Usage'}
                          {tab === 'email' && 'Email health'}
                          {tab === 'users' && 'Staff'}
                          {tab === 'security' && 'Security'}
                          {tab === 'notes' && 'Notes'}
                          {tab === 'audit' && 'Audit log'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sub-Tab 1: Overview */}
                  {companyDetailTab === 'overview' && (
                    <div className="p-4">
                      <div className="row g-4">
                        <div className="col-12 col-md-6">
                          <h6 className="fw-bold text-dark mb-3">Organization & Domain Settings</h6>
                          <div className="p-3 bg-light rounded-3 border">
                            <div className="mb-2"><strong>Company Code:</strong> <code>{selectedCompanyDetail.companyCode}</code></div>
                            <div className="mb-2"><strong>Workspace path:</strong> <code>/{selectedCompanyDetail.subdomain}</code></div>
                            <div className="mb-2">
                              <strong>Custom Domain:</strong> {selectedCompanyDetail.customDomain ? (
                                <span className="badge bg-success-subtle text-success ms-1">
                                  {selectedCompanyDetail.customDomain}
                                </span>
                              ) : <span className="text-muted">None</span>}
                            </div>
                            <div className="mb-2"><strong>Created:</strong> {selectedCompanyDetail.createdAt ? new Date(selectedCompanyDetail.createdAt).toLocaleDateString() : 'Not recorded'}</div>
                            <div>
                              <strong>Owner Work Email:</strong>{' '}
                              <code>
                                {unmaskedEmails[selectedCompanyDetail.id]
                                  ? (selectedCompanyDetail.ownerEmail || 'Not provided')
                                  : maskEmail(selectedCompanyDetail.ownerEmail || '')}
                              </code>
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 ms-2 text-decoration-none"
                                aria-label={unmaskedEmails[selectedCompanyDetail.id] ? 'Mask owner email' : 'Show owner email'}
                                onClick={() => setUnmaskedEmails({
                                  ...unmaskedEmails,
                                  [selectedCompanyDetail.id]: !unmaskedEmails[selectedCompanyDetail.id]
                                })}
                              >
                                {unmaskedEmails[selectedCompanyDetail.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="col-12 col-md-6">
                          <h6 className="fw-bold text-dark mb-3">Subscription Quotas & Entitlements</h6>
                          <div className="p-3 bg-light rounded-3 border">
                            <div className="mb-2"><strong>Active Plan Tier:</strong> <span className="badge bg-primary ms-1">{selectedCompanyDetail.planName}</span></div>
                            <div className="mb-2">
                              <strong>Staff accounts / capacity:</strong> {selectedCompanyDetail.userCount} / {selectedCompanyDetail.maxAgents}
                            </div>
                            <div className="quota-bar mb-2">
                              <div
                                className="quota-bar-fill"
                                style={{ width: `${Math.min(100, Math.round((selectedCompanyDetail.userCount / Math.max(1, selectedCompanyDetail.maxAgents)) * 100))}%` }}
                              />
                            </div>
                            <div className="mb-2"><strong>Total tickets:</strong> {selectedCompanyDetail.ticketCount}</div>
                            <div><strong>Workspace status:</strong> {selectedCompanyDetail.status}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 2: Subscription & Billing */}
                  {companyDetailTab === 'billing' && (
                    <div className="p-4">
                      <div className="platform-unavailable"><CreditCard size={22} className="mb-2" /><strong>Billing history is not available</strong><p className="mb-0">Assigned plan: {selectedCompanyDetail.planName}. Verified invoices, payment methods, refunds, and renewal dates are not exposed by the current platform API.</p></div>
                    </div>
                  )}

                  {/* Sub-Tab 3: Usage Metrics */}
                  {companyDetailTab === 'usage' && (
                    <div className="p-4">
                      <div className="platform-usage-grid">
                        <div className="p-3 border rounded"><small>Total tickets</small><strong>{selectedCompanyDetail.ticketCount}</strong></div>
                        <div className="p-3 border rounded"><small>Staff accounts</small><strong>{selectedCompanyDetail.userCount}</strong></div>
                        <div className="p-3 border rounded"><small>Staff capacity</small><strong>{selectedCompanyDetail.maxAgents}</strong></div>
                      </div>
                      <p className="platform-source-note">Storage, API usage, and SLA summaries are not currently reported by the platform API.</p>
                    </div>
                  )}

                  {/* Sub-Tab 4: Email Health */}
                  {companyDetailTab === 'email' && (
                    <div className="p-4">
                      <div className="platform-unavailable"><Mail size={22} className="mb-2" /><strong>Email health is not monitored</strong><span>Verified DNS, delivery, bounce, and mailbox-connection measurements are not available for this company yet.</span></div>
                    </div>
                  )}

                  {/* Sub-Tab 5: Users & Agents */}
                  {companyDetailTab === 'users' && (
                    <div className="p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="fw-bold text-dark mb-0">Assigned Staff Members & Agents</h6>
                        <span className="badge bg-light text-dark border">
                          {users.filter(u => (u as any).company?.id === selectedCompanyDetail.id).length} accounts
                        </span>
                      </div>
                      <div className="table-responsive border rounded-3">
                        <table className="table table-sm align-middle mb-0">
                          <thead className="table-light">
                            <tr>
                              <th className="ps-3">Name</th>
                              <th>Email</th>
                              <th>Role</th>
                              <th>2FA Status</th>
                              <th>Account State</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.filter(u => (u as any).company?.id === selectedCompanyDetail.id).map(u => (
                              <tr key={u.id}>
                                <td className="ps-3 fw-bold">{u.displayName}</td>
                                <td><code>{u.email}</code></td>
                                <td><span className="badge bg-primary-subtle text-primary">{u.role?.roleType}</span></td>
                                <td><span className="text-muted small">Not reported</span></td>
                                <td>
                                  <span className={`badge ${u.isActive ? 'bg-success' : 'bg-danger'}`}>
                                    {u.isActive ? 'ACTIVE' : 'LOCKED'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 6: Security & Abuse */}
                  {companyDetailTab === 'security' && (
                    <div className="p-4">
                      <div className="platform-unavailable"><ShieldCheck size={22} className="mb-2" /><strong>Security signals are not available</strong><span>The current API does not report verified two-factor enrollment, login anomalies, or company security audit events. No security status is inferred from missing data.</span></div>
                    </div>
                  )}

                  {/* Sub-Tab 7: Staff Notes */}
                  {companyDetailTab === 'notes' && (
                    <div className="p-4">
                      <h6 className="fw-bold text-dark mb-2">Draft staff notes</h6>
                      <p className="text-muted small mb-3">Temporary notes for this browser session. They are not saved to the server and will be cleared when you leave the console.</p>

                      <div className="d-flex flex-column gap-2 mb-3">
                        {(staffNotes[selectedCompanyDetail.id] || []).map((note, idx) => (
                          <div key={idx} className="p-3 bg-light rounded-3 border">
                            <p className="mb-0 text-dark small">{note}</p>
                          </div>
                        ))}
                      </div>

                      <div className="d-flex gap-2">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Add private note regarding this company..."
                          aria-label="Draft staff note"
                          value={newStaffNoteInput}
                          onChange={e => setNewStaffNoteInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddStaffNote(selectedCompanyDetail.id);
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-primary px-3 fw-semibold"
                          onClick={() => handleAddStaffNote(selectedCompanyDetail.id)}
                        >
                          Add draft
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 8: Audit Log */}
                  {companyDetailTab === 'audit' && (
                    <div className="p-4">
                      <div className="platform-unavailable"><Clock size={22} className="mb-2" /><strong>Platform audit history is not connected</strong><span>No audit events are inferred from company properties. An audit-record endpoint is required to display verified action history here.</span></div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Screen 41a: Dense Companies List */}
              <div className={`enterprise-card ${selectedCompanyDetail ? 'd-none' : ''}`}>
                <div className="enterprise-card-header">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <div className="input-group input-group-sm" style={{ width: '280px', maxWidth: '100%' }}>
                      <span className="input-group-text bg-white border-end-0">
                        <Search size={14} className="text-muted" />
                      </span>
                      <input
                        type="search"
                        aria-label="Search companies"
                        className="form-control border-start-0"
                        placeholder="Search company, code, subdomain..."
                        value={compSearch}
                        onChange={e => setCompSearch(e.target.value)}
                      />
                    </div>

                    {/* Status Filter */}
                    <div className="d-flex gap-1 flex-wrap" aria-label="Company status filters">
                      {['ALL', 'ACTIVE', 'TRIAL', 'SUSPENDED'].map(st => (
                        <button
                          key={st}
                          type="button"
                          className={`btn btn-sm px-2.5 rounded-pill fw-semibold ${compStatusFilter === st ? 'btn-primary' : 'btn-outline-secondary'}`}
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => setCompStatusFilter(st)}
                          aria-pressed={compStatusFilter === st}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {/* Plan Filter */}
                    <select
                      className="form-select form-select-sm"
                      aria-label="Filter companies by plan"
                      style={{ width: '135px', fontSize: '0.75rem' }}
                      value={compPlanFilter}
                      onChange={e => setCompPlanFilter(e.target.value)}
                    >
                      <option value="ALL">All Plans</option>
                      <option value="FREE">Free</option>
                      <option value="STARTER">Starter</option>
                      <option value="PRO">Pro</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>

                    {/* Health Filter */}
                    <select
                      className="form-select form-select-sm"
                      aria-label="Filter companies by capacity"
                      style={{ width: '140px', fontSize: '0.75rem' }}
                      value={compHealthFilter}
                      onChange={e => setCompHealthFilter(e.target.value)}
                    >
                      <option value="ALL">Any capacity</option>
                      <option value="HEALTHY">Active, below limit</option>
                      <option value="NEAR_LIMIT">Near Limit (&gt;85%)</option>
                      <option value="AT_RISK">At Risk / Suspended</option>
                    </select>
                  </div>

                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 rounded-3"
                      onClick={() => {
                        const rows = [['ID', 'Name', 'Code', 'Workspace', 'Plan', 'Status', 'Staff'], ...filteredCompanies.map(company => [company.id, company.name, company.companyCode, company.subdomain, company.planName, company.status, `${company.userCount}/${company.maxAgents}`])];
                        const csv = rows.map(row => row.map(value => {
                          const text = String(value ?? '');
                          const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
                          return `"${safe.replace(/"/g, '""')}"`;
                        }).join(',')).join('\r\n');
                        const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'companies.csv';
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={13} />
                      <span>Export CSV</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 px-3 py-1.5 rounded-3 fw-semibold shadow-sm"
                      onClick={openNewCompanyForm}
                    >
                      <Plus size={15} />
                      <span>New company</span>
                    </button>
                  </div>
                </div>

                <div className="table-responsive d-none d-md-block" role="region" aria-label="Companies table" tabIndex={0}>
                  <table className="table table-enterprise platform-company-table align-middle mb-0">
                    <thead>
                      <tr>
                        <th className="ps-4">Company</th>
                        <th>Plan</th>
                        <th>Status</th>
                        <th>Owner email</th>
                        <th>Staff capacity</th>
                        <th>Total tickets</th>
                        <th>Attention</th>
                        <th className="text-end pe-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompanies.map(comp => {
                        const seatUtil = (comp.userCount || 0) / Math.max(1, comp.maxAgents || 1);
                        const isHealthGood = comp.status === 'ACTIVE' && seatUtil < 0.85;
                        const isHealthWarn = comp.status === 'ACTIVE' && seatUtil >= 0.85;
                        const isHealthCrit = comp.status === 'SUSPENDED';

                        return (
                          <tr key={comp.id}>
                            <td className="ps-4">
                              <div className="d-flex align-items-center gap-2.5">
                                <div
                                  className="rounded-3 d-flex align-items-center justify-content-center text-white fw-bold shadow-xs flex-shrink-0"
                                  style={{
                                    width: '38px',
                                    height: '38px',
                                    backgroundColor: comp.primaryColor || '#2563eb',
                                    fontSize: '0.85rem'
                                  }}
                                >
                                  {comp.companyCode.slice(0, 3)}
                                </div>
                                <div className="overflow-hidden">
                                  <h6 className="fw-bold mb-0 text-dark text-truncate" style={{ maxWidth: '200px' }}>
                                    {comp.name}
                                  </h6>
                                  <div className="text-muted small">
                                    <code>/{comp.subdomain}</code>
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td>
                              <div>
                                <span className="badge bg-light text-dark border fw-bold" style={{ fontSize: '0.72rem' }}>
                                  {comp.planName}
                                </span>
                              </div>
                            </td>

                            <td>
                              <span className={`badge-status ${comp.status === 'ACTIVE' ? 'badge-resolved' : comp.status === 'TRIAL' ? 'badge-in_progress' : comp.status === 'SUSPENDED' ? 'badge-urgent' : 'badge-closed'}`}>
                                <span className="platform-status-dot" />
                                <span>{comp.status}</span>
                              </span>
                            </td>

                            <td>
                              <div className="d-flex align-items-center gap-1.5">
                                <code style={{ fontSize: '0.75rem' }}>
                                  {unmaskedEmails[comp.id]
                                    ? (comp.ownerEmail || 'Not provided')
                                    : maskEmail(comp.ownerEmail || '')}
                                </code>
                                <button
                                  type="button"
                                  className="btn btn-link btn-xs p-0 text-muted hover-text-primary"
                                  onClick={() => setUnmaskedEmails({
                                    ...unmaskedEmails,
                                    [comp.id]: !unmaskedEmails[comp.id]
                                  })}
                                  title={unmaskedEmails[comp.id] ? 'Mask email' : 'Unmask email for Super Admin'}
                                >
                                  {unmaskedEmails[comp.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                              </div>
                            </td>

                            <td>
                              <div style={{ maxWidth: '140px' }}>
                                <div className="d-flex justify-content-between align-items-center mb-0.5">
                                  <small className="text-muted fw-semibold" style={{ fontSize: '0.7rem' }}>
                                    {comp.userCount} / {comp.maxAgents}
                                  </small>
                                  <small className="text-muted" style={{ fontSize: '0.68rem' }}>
                                    {Math.round(seatUtil * 100)}%
                                  </small>
                                </div>
                                <div className="quota-bar" style={{ height: '5px' }}>
                                  <div
                                    className={`quota-bar-fill ${seatUtil >= 0.85 ? 'bg-warning' : 'bg-primary'}`}
                                    style={{ width: `${Math.min(100, Math.round(seatUtil * 100))}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td>
                              <span className="badge bg-secondary-subtle text-secondary fw-bold px-2 py-1">
                                {comp.ticketCount || 0}
                              </span>
                            </td>

                            <td>
                              <div className="d-flex align-items-center gap-1.5">
                                <span
                                  className={`rounded-circle d-inline-block ${isHealthGood ? 'bg-success' : isHealthWarn ? 'bg-warning' : isHealthCrit ? 'bg-danger' : 'bg-secondary'}`}
                                  style={{ width: '8px', height: '8px' }}
                                />
                                <small className="fw-semibold text-secondary" style={{ fontSize: '0.72rem' }}>
                                  {isHealthGood ? 'Below limit' : isHealthWarn ? 'Near limit' : isHealthCrit ? 'Suspended' : 'Not flagged'}
                                </small>
                              </div>
                            </td>

                            <td className="text-end pe-4">
                              <div className="d-flex justify-content-end align-items-center gap-1">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary py-1 px-2 rounded-2"
                                  onClick={() => openCompanyDetail(comp)}
                                  title="View company details"
                                >
                                  <Eye size={13} />
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-sm btn-warning text-dark py-1 px-2 rounded-2"
                                  onClick={() => setShowSupportSessionModal(comp)}
                                  title="Support access options"
                                >
                                  <ShieldAlert size={13} />
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary py-1 px-2 rounded-2"
                                  onClick={() => setShowChangePlanModal(comp)}
                                  title="Change Plan Tier"
                                >
                                  <Edit3 size={13} />
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-sm btn-dark py-1 px-2.5 rounded-2 d-flex align-items-center gap-1"
                                  onClick={() => onSwitchToCompany(comp.id, 'tickets')}
                                  title="Open live company workspace"
                                >
                                  <ArrowRight size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!filteredCompanies.length && <tr><td colSpan={8} className="text-center text-muted py-5">No companies match these filters.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="platform-mobile-companies p-3">
                  {filteredCompanies.map(company => (
                    <article key={company.id} className="platform-company-mobile-card">
                      <div className="d-flex align-items-start justify-content-between gap-2 mb-2"><span className="platform-company-avatar">{company.companyCode.slice(0, 2)}</span><span className={`badge-status ${company.status === 'ACTIVE' ? 'badge-resolved' : company.status === 'TRIAL' ? 'badge-in_progress' : 'badge-closed'}`}>{company.status}</span></div>
                      <h3 className="fw-semibold mb-1">{company.name}</h3><code>/{company.subdomain}</code>
                      <div className="platform-mobile-metrics"><span><strong>{company.planName}</strong>Plan</span><span><strong>{company.userCount} / {company.maxAgents}</strong>Staff</span><span><strong>{company.ticketCount}</strong>Tickets</span></div>
                      <div className="d-flex align-items-center gap-2 flex-wrap"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openCompanyDetail(company)}>View company <ChevronRight size={13} /></button><button type="button" className="btn btn-sm btn-light" onClick={() => onSwitchToCompany(company.id, 'tickets')}>Open workspace <ArrowRight size={13} /></button></div>
                    </article>
                  ))}
                  {!filteredCompanies.length && <div className="workspace-empty-state"><Search size={25} className="mb-3 text-muted" /><h2>No matching companies</h2><p>Try another search or clear your filters.</p><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => jumpToFilteredCompanies('ALL')}>Clear filters</button></div>}
                </div>
                <div className="px-4 py-3 border-top text-muted small" role="status">{filteredCompanies.length} of {companies.length} companies</div>
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 42: PLANS AND PRICING MANAGEMENT
              ================================================================ */}
          {activeMenu === 'plans' && (
            <div className="animate-fade-in">
              <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                <div>
                  <h6 className="fw-bold mb-0 text-dark">Plan catalog</h6>
                  <small className="text-muted">Read-only catalog. Plan and coupon editors currently provide local previews only.</small>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1 rounded-3 fw-semibold"
                    onClick={() => setShowNewCouponModal(true)}
                  >
                    <Tag size={14} />
                    <span>Preview coupon</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-primary d-flex align-items-center gap-1 rounded-3 fw-semibold shadow-sm"
                    onClick={() => setShowPlanEditorModal({
                      code: 'NEW_CUSTOM',
                      name: 'Custom High-Growth',
                      status: 'PUBLIC',
                      priceMonthlyInr: 9999,
                      priceYearlyInr: 99990,
                      maxAgents: 25,
                      monthlyTickets: 10000,
                      customDomain: true,
                      slaEngine: true,
                    })}
                  >
                    <Plus size={14} />
                    <span>Preview new plan</span>
                  </button>
                </div>
              </div>

              {/* Screen 42a: Plans List Table */}
              <div className="enterprise-card mb-4">
                <div className="enterprise-card-header">
                  <h6 className="fw-bold mb-0">Subscription Tiers & Packaging</h6>
                  <span className="badge bg-light text-dark border">{plans.length} catalog plans</span>
                </div>

                <div className="table-responsive">
                  <table className="table table-enterprise align-middle mb-0">
                    <thead>
                      <tr>
                        <th className="ps-4">Plan Name & Code</th>
                        <th>Status</th>
                        <th>Monthly Price (INR)</th>
                        <th>Annual Price (INR)</th>
                        <th>Agent Quota</th>
                        <th>Assigned companies</th>
                        <th>Est. active plan value</th>
                        <th className="text-end pe-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((p, idx) => (
                        <tr key={idx}>
                          <td className="ps-4">
                            <div className="fw-bold text-dark">{p.name}</div>
                            <code>{p.code}</code>
                          </td>

                          <td>
                            <span className="badge bg-success-subtle text-success">
                              {p.status || 'PUBLIC'}
                            </span>
                          </td>

                          <td>
                            <span className="fw-bold text-dark">
                              {p.priceMonthlyInr > 0 ? `₹${p.priceMonthlyInr.toLocaleString()}` : 'Free'}
                            </span>
                          </td>

                          <td>
                            <span className="text-secondary">
                              {p.priceYearlyInr > 0 ? `₹${p.priceYearlyInr.toLocaleString()}` : 'Free'}
                            </span>
                          </td>

                          <td>
                            <span className="badge bg-primary-subtle text-primary fw-bold">
                              {p.maxAgents} Included Seats
                            </span>
                          </td>

                          <td>
                            <span className="badge bg-light text-dark border fw-bold">
                              {companies.filter(company => company.planName === p.code).length} companies
                            </span>
                          </td>

                          <td>
                            <span className="fw-bold text-success">
                              ₹{((p.priceMonthlyInr || 0) * companies.filter(company => company.planName === p.code && company.status === 'ACTIVE').length).toLocaleString()}/mo
                            </span>
                          </td>

                          <td className="text-end pe-4">
                            <div className="d-flex justify-content-end align-items-center gap-1.5">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary py-1 px-2.5 rounded-2 d-flex align-items-center gap-1"
                                onClick={() => setShowPlanEditorModal(p)}
                              >
                                <Edit3 size={13} />
                                <span>Preview plan</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Screen 42c & 42d: Coupons & Grandfathering Policy */}
              <div className="row g-4">
                {/* Coupons List */}
                <div className="col-12 col-xl-7">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div className="d-flex align-items-center gap-2">
                        <Tag size={17} className="text-primary" />
                        <h6 className="fw-bold mb-0">Coupon previews</h6>
                      </div>
                      <span className="badge bg-light text-secondary border">Not published</span>
                    </div>

                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th className="ps-3">Code</th>
                            <th>Discount</th>
                            <th>Duration</th>
                            <th>Redemptions</th>
                            <th className="text-end pe-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {coupons.map((c, i) => (
                            <tr key={i}>
                              <td className="ps-3"><code>{c.code}</code></td>
                              <td><span className="badge bg-success-subtle text-success">{c.discountPercent}% OFF</span></td>
                              <td><small className="text-muted">{c.duration}</small></td>
                              <td><small className="text-muted">Not tracked</small></td>
                              <td className="text-end pe-3">
                                <span className="badge bg-light text-secondary border">Preview</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Grandfathering Policy Box */}
                <div className="col-12 col-xl-5">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div className="d-flex align-items-center gap-2">
                        <ShieldCheck size={17} className="text-success" />
                        <h6 className="fw-bold mb-0">Plan Versioning & Grandfathering Policy</h6>
                      </div>
                    </div>

                    <div className="p-4">
                      <p className="text-muted small">
                        Preview a plan-change policy. These selections are not saved and do not change existing subscriptions.
                      </p>

                      <div className="form-check p-3 rounded-3 border mb-2.5 bg-light">
                        <input
                          className="form-check-input ms-0 me-2.5"
                          type="radio"
                          name="grandfatheringRadio"
                          id="gf1"
                          checked={grandfatheringPolicy === 'grandfather'}
                          onChange={() => setGrandfatheringPolicy('grandfather')}
                        />
                        <label className="form-check-label fw-bold text-dark small" htmlFor="gf1">
                          Keep existing terms
                          <small className="text-muted d-block fw-normal mt-0.5">
                            Proposed behavior: new prices apply to new sign-ups while existing companies retain their current terms.
                          </small>
                        </label>
                      </div>

                      <div className="form-check p-3 rounded-3 border bg-light">
                        <input
                          className="form-check-input ms-0 me-2.5"
                          type="radio"
                          name="grandfatheringRadio"
                          id="gf2"
                          checked={grandfatheringPolicy === 'migrate'}
                          onChange={() => setGrandfatheringPolicy('migrate')}
                        />
                        <label className="form-check-label fw-bold text-dark small" htmlFor="gf2">
                          Apply at next renewal
                          <small className="text-muted d-block fw-normal mt-0.5">
                            Proposed behavior: notify subscribers before applying revised prices on renewal. No notices are sent by this preview.
                          </small>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 43: PLATFORM SETTINGS, EMAIL HEALTH & ABUSE TOOLS
              ================================================================ */}
          {activeMenu === 'platform' && (
            <div className="animate-fade-in">
              <div className="platform-unavailable mb-4"><Settings size={21} className="mb-2" /><strong>Configuration preview</strong><span>These controls are not connected to persistent platform settings yet. Changes remain in this browser session and do not modify live sign-ups, rate limits, banners, or email delivery.</span></div>
              {/* Emergency Outbound Killswitch Banner */}
              <div className={`p-3 rounded-3 mb-4 d-flex justify-content-between align-items-center flex-wrap gap-3 ${emergencyOutboundPaused ? 'bg-danger text-white' : 'bg-light border text-dark'}`}>
                <div className="d-flex align-items-center gap-2.5">
                  <ShieldAlert size={22} className={emergencyOutboundPaused ? 'text-white' : 'text-danger'} />
                  <div>
                    <h6 className="fw-bold mb-0">Outbound email controls</h6>
                    <small className={emergencyOutboundPaused ? 'text-white text-opacity-75' : 'text-muted'}>
                      Global delivery controls are not connected to the email pipeline yet.
                    </small>
                  </div>
                </div>

                <button
                  type="button"
                  className={`btn btn-sm px-4 fw-bold shadow-xs ${emergencyOutboundPaused ? 'btn-light text-danger' : 'btn-danger'}`}
                  disabled
                  onClick={() => {
                    const newState = !emergencyOutboundPaused;
                    setEmergencyOutboundPaused(newState);
                    setAlertNotice({
                      type: newState ? 'danger' : 'success',
                      message: newState ? 'EMERGENCY: Platform outbound email has been PAUSED.' : 'Platform outbound email has been RESUMED.',
                    });
                  }}
                >
                  Outbound pause unavailable
                </button>
              </div>

              {/* Sub-Section 43a: Global Platform Settings */}
              <div className="row g-4 mb-4">
                <div className="col-12 col-xl-6">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div className="d-flex align-items-center gap-2">
                        <Settings size={18} className="text-primary" />
                        <h6 className="fw-bold mb-0">General settings preview</h6>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="mb-3">
                        <label className="form-label small fw-bold text-dark">Platform Brand Name</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={platformName}
                          onChange={e => setPlatformName(e.target.value)}
                        />
                      </div>

                      <div className="mb-3">
                        <label className="form-label small fw-bold text-dark">Global Support & Escalation Email</label>
                        <input
                          type="email"
                          className="form-control form-control-sm"
                          value={platformSupportEmail}
                          onChange={e => setPlatformSupportEmail(e.target.value)}
                        />
                      </div>

                      <div className="mb-3">
                        <label className="form-label small fw-bold text-dark">New Organization Sign-Up Mode</label>
                        <select
                          className="form-select form-select-sm"
                          value={signupControl}
                          onChange={e => setSignupControl(e.target.value as any)}
                        >
                          <option value="OPEN">Open Sign-ups (Self-service Public Checkout)</option>
                          <option value="INVITE_ONLY">Invite-Only (Requires Super Admin Invitation)</option>
                          <option value="CLOSED">Closed (Sales Direct Onboarding Only)</option>
                        </select>
                      </div>

                      <div className="mb-3">
                        <label className="form-label small fw-bold text-dark">Global Rate Limits</label>
                        <div className="row g-2">
                          <div className="col">
                            <small className="text-muted d-block">API Requests / Min</small>
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              value={globalRateLimitRpm}
                              onChange={e => setGlobalRateLimitRpm(Number(e.target.value))}
                            />
                          </div>
                          <div className="col">
                            <small className="text-muted d-block">Public Tickets / IP / Hr</small>
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              value={ticketRateLimitPerHour}
                              onChange={e => setTicketRateLimitPerHour(Number(e.target.value))}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-light rounded-3 border">
                        <div className="form-check form-switch mb-1">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="maintToggle"
                            checked={maintenanceModeActive}
                            onChange={e => setMaintenanceModeActive(e.target.checked)}
                          />
                          <label className="form-check-label fw-bold text-dark small" htmlFor="maintToggle">
                            Platform Maintenance Mode
                          </label>
                        </div>
                        <small className="text-muted d-block mb-2">
                          Preview only. This does not restrict logins or show a banner in company workspaces.
                        </small>
                        {maintenanceModeActive && (
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={maintenanceBannerText}
                            onChange={e => setMaintenanceBannerText(e.target.value)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-Section 43b: Disposable Email Domain Filter & Broadcast */}
                <div className="col-12 col-xl-6">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div className="d-flex align-items-center gap-2">
                        <Ban size={18} className="text-danger" />
                        <h6 className="fw-bold mb-0">Domain rules & announcements</h6>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="mb-4">
                        <label className="form-label small fw-bold text-dark">
                          Proposed blocked domains
                        </label>
                        <div className="d-flex flex-wrap gap-1.5 mb-2">
                          {blockedDomains.map((dom, i) => (
                            <span key={i} className="badge bg-light text-dark border d-flex align-items-center gap-1 px-2.5 py-1">
                              <span>{dom}</span>
                              <button
                                type="button"
                                className="btn-close btn-close-sm p-0 ms-1"
                                style={{ fontSize: '0.6rem' }}
                                aria-label={`Remove ${dom} from draft`}
                                onClick={() => setBlockedDomains(blockedDomains.filter((_, idx) => idx !== i))}
                              ></button>
                            </span>
                          ))}
                        </div>
                        <div className="d-flex gap-2">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Add blocked domain (e.g. discardmail.com)..."
                            value={newBlockedDomainInput}
                            onChange={e => setNewBlockedDomainInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && newBlockedDomainInput.trim()) {
                                setBlockedDomains([...blockedDomains, newBlockedDomainInput.trim().toLowerCase()]);
                                setNewBlockedDomainInput('');
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-dark px-3"
                            onClick={() => {
                              if (newBlockedDomainInput.trim()) {
                                setBlockedDomains([...blockedDomains, newBlockedDomainInput.trim().toLowerCase()]);
                                setNewBlockedDomainInput('');
                              }
                            }}
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      <div className="p-3 bg-light rounded-3 border">
                        <div className="form-check form-switch mb-1">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="announcementToggle"
                            checked={globalAnnouncementActive}
                            onChange={e => setGlobalAnnouncementActive(e.target.checked)}
                          />
                          <label className="form-check-label fw-bold text-dark small" htmlFor="announcementToggle">
                            Platform-Wide Announcement Banner
                          </label>
                        </div>
                        <small className="text-muted d-block mb-2">
                          Preview only. This draft is not published to company workspaces.
                        </small>
                        {globalAnnouncementActive && (
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={globalAnnouncementText}
                            onChange={e => setGlobalAnnouncementText(e.target.value)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-Section 43c: Abuse Reports Queue & IP Blocklist */}
              <div className="enterprise-card">
                <div className="enterprise-card-header">
                  <div className="d-flex align-items-center gap-2">
                    <ShieldAlert size={18} className="text-danger" />
                    <h6 className="fw-bold mb-0">Abuse reports</h6>
                  </div>
                  <span className="badge bg-light text-secondary border">Not connected</span>
                </div>

                <div className="table-responsive">
                  <table className="table table-enterprise align-middle mb-0">
                    <thead>
                      <tr>
                        <th className="ps-4">Reporter Email</th>
                        <th>Reported Organization</th>
                        <th>Reason / Incident Details</th>
                        <th>Risk Score</th>
                        <th>Reported</th>
                        <th className="text-end pe-4">Mitigation Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abuseReports.map(rep => (
                        <tr key={rep.id}>
                          <td className="ps-4"><code>{rep.reporterEmail}</code></td>
                          <td><span className="fw-bold text-dark">{rep.reportedCompany}</span></td>
                          <td><small className="text-secondary">{rep.reason}</small></td>
                          <td>
                            <span className={`badge ${rep.riskScore === 'Low' ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'}`}>
                              {rep.riskScore} Risk
                            </span>
                          </td>
                          <td><small className="text-muted">{rep.reportedAt}</small></td>
                          <td className="text-end pe-4">
                            <div className="d-flex justify-content-end align-items-center gap-1.5">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success py-0.5 px-2 rounded-2"
                                style={{ fontSize: '0.72rem' }}
                                onClick={() => {
                                  setAbuseReports(abuseReports.filter(r => r.id !== rep.id));
                                  setAlertNotice({ type: 'success', message: `Dismissed abuse flag #${rep.id}.` });
                                }}
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger py-0.5 px-2 rounded-2"
                                style={{ fontSize: '0.72rem' }}
                                onClick={() => {
                                  setAbuseReports(abuseReports.filter(r => r.id !== rep.id));
                                  setAlertNotice({ type: 'danger', message: `Suspended organization ${rep.reportedCompany} on grounds of verified abuse report.` });
                                }}
                              >
                                Suspend Org
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!abuseReports.length && <tr><td colSpan={6} className="p-4 text-muted">No verified abuse records are available from the current API.</td></tr>}
                    </tbody>
                  </table>
                </div>

                {/* Platform-Wide Blocked IPs Section (Screen 43c) */}
                <div className="p-4 border-top bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-2.5 flex-wrap gap-2">
                    <div>
                      <h6 className="fw-bold mb-0 text-dark small">IP blocklist preview</h6>
                      <small className="text-muted">Local draft entries only. They do not configure an edge gateway.</small>
                    </div>
                    <div className="d-flex gap-2">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        style={{ width: '180px' }}
                        placeholder="e.g. 198.51.100.1"
                        value={newBlockedIpInput}
                        onChange={e => setNewBlockedIpInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newBlockedIpInput.trim()) {
                            setBlockedIps([...blockedIps, newBlockedIpInput.trim()]);
                            setNewBlockedIpInput('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => {
                          if (newBlockedIpInput.trim()) {
                            setBlockedIps([...blockedIps, newBlockedIpInput.trim()]);
                            setNewBlockedIpInput('');
                          }
                        }}
                      >
                        Add IP draft
                      </button>
                    </div>
                  </div>
                  <div className="d-flex flex-wrap gap-1.5">
                    {blockedIps.map((ip, i) => (
                      <span key={i} className="badge bg-white text-danger border d-flex align-items-center gap-1.5 px-2.5 py-1">
                        <code>{ip}</code>
                        <button
                          type="button"
                          className="btn-close btn-close-sm p-0 ms-1"
                          style={{ fontSize: '0.6rem' }}
                          onClick={() => setBlockedIps(blockedIps.filter((_, idx) => idx !== i))}
                        />
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              MENU: STAFF CREDENTIALS & LOGIN DIRECTORY
              ================================================================ */}
          {activeMenu === 'credentials' && (
            <div className="enterprise-card">
              <div className="enterprise-card-header">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <div className="input-group input-group-sm" style={{ width: '260px' }}>
                    <span className="input-group-text bg-white border-end-0">
                      <Search size={14} className="text-muted" />
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0"
                      placeholder="Search name or email..."
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                    />
                  </div>

                  <select
                    className="form-select form-select-sm"
                    style={{ width: '170px' }}
                    value={userCompanyFilter}
                    onChange={e => setUserCompanyFilter(e.target.value)}
                  >
                    <option value="ALL">All Organizations</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.companyCode}>
                        {c.name} ({c.companyCode})
                      </option>
                    ))}
                  </select>

                  <select
                    className="form-select form-select-sm"
                    style={{ width: '165px' }}
                    value={userRoleFilter}
                    onChange={e => setUserRoleFilter(e.target.value)}
                  >
                    <option value="ALL">All Roles</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                    <option value="COMPANY_ADMIN">Company Admin</option>
                    <option value="AGENT">Support Engineer</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 px-3 py-1.5 rounded-3 fw-semibold shadow-sm"
                  onClick={() => setShowNewCredModal(true)}
                >
                  <Plus size={15} />
                  <span>Create Company Login Credential</span>
                </button>
              </div>

              <div className="table-responsive">
                <table className="table table-enterprise align-middle mb-0">
                  <thead>
                    <tr>
                      <th className="ps-4">User / Agent Name</th>
                      <th>Login Email</th>
                      <th>Organization</th>
                      <th>Role & Permissions</th>
                      <th>Account Status</th>
                      <th className="text-end pe-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-2.5">
                            <div className="avatar-chip bg-primary-subtle text-primary fw-bold">
                              {u.firstName?.[0] || 'U'}
                            </div>
                            <div>
                              <div className="fw-bold text-dark">{u.displayName}</div>
                              <small className="text-muted">{u.firstName} {u.lastName}</small>
                            </div>
                          </div>
                        </td>

                        <td>
                          <code className="text-primary fw-semibold">{u.email}</code>
                        </td>

                        <td>
                          <div className="d-flex align-items-center gap-1.5">
                            <span className="badge bg-secondary-subtle text-secondary">
                              {(u as any).company?.companyCode || 'SYS'}
                            </span>
                            <span className="small text-muted">
                              {(u as any).company?.name || 'Platform Level'}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`badge ${u.role?.roleType === 'SUPER_ADMIN'
                                ? 'bg-warning text-dark fw-bold'
                                : u.role?.roleType === 'COMPANY_ADMIN'
                                  ? 'bg-primary'
                                  : 'bg-info-subtle text-info-emphasis border border-info-subtle'
                              }`}
                          >
                            {u.role?.name || u.role?.roleType}
                          </span>
                        </td>

                        <td>
                          <span className={`badge-status ${u.isActive ? 'badge-resolved' : 'badge-urgent'}`}>
                            <span className={`pulse-dot ${u.isActive ? 'pulse-dot-success' : 'pulse-dot-danger'}`} />
                            {u.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                          </span>
                        </td>

                        <td className="text-end pe-4">
                          <div className="d-flex justify-content-end align-items-center gap-2">
                            {u.role?.roleType !== 'SUPER_ADMIN' && (
                              <button
                                type="button"
                                className={`btn btn-sm py-1 px-2.5 rounded-pill d-flex align-items-center gap-1 ${u.isActive ? 'btn-outline-danger' : 'btn-outline-success'
                                  }`}
                                style={{ fontSize: '0.72rem' }}
                                onClick={async () => {
                                  try {
                                    await apiService.toggleUserActive(u.id);
                                    setAlertNotice({ type: 'success', message: `Updated active status for ${u.displayName}.` });
                                    loadAdminData();
                                  } catch (err: any) {
                                    setAlertNotice({ type: 'danger', message: err.message || 'Failed to toggle status' });
                                  }
                                }}
                              >
                                <Power size={12} />
                                <span>{u.isActive ? 'Deactivate' : 'Activate'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary py-1 px-2.5 rounded-3 d-flex align-items-center gap-1"
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => {
                                setShowResetPasswordModal(u);
                                setNewPasswordVal('');
                              }}
                            >
                              <KeyRound size={12} />
                              <span>Reset Password</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================
              MENU: TENANT WORKSPACES QUICK LAUNCHER
              ================================================================ */}
          {activeMenu === 'workspaces' && (
            <div className="row g-4">
              {companies.map(comp => (
                <div key={comp.id} className="col-12 col-lg-6">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="rounded-3 d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
                          style={{
                            width: '46px',
                            height: '46px',
                            backgroundColor: comp.primaryColor || '#2563eb',
                          }}
                        >
                          {comp.companyCode}
                        </div>
                        <div>
                          <h6 className="fw-bold mb-0">{comp.name}</h6>
                          <small className="text-muted">
                            <code className="text-primary">{comp.subdomain}.kuwyhelp.com</code> • {comp.planName}
                          </small>
                        </div>
                      </div>
                      <span className={`badge-status ${comp.status === 'ACTIVE' ? 'badge-resolved' : 'badge-urgent'}`}>
                        {comp.status}
                      </span>
                    </div>

                    <div className="p-4">
                      <div className="row g-2 mb-3 text-center">
                        <div className="col-4">
                          <div className="p-2.5 bg-light rounded-3 border">
                            <div className="fw-bolder fs-5 text-dark">{comp.ticketCount}</div>
                            <small className="text-muted" style={{ fontSize: '0.72rem' }}>Total Tickets</small>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="p-2.5 bg-light rounded-3 border">
                            <div className="fw-bolder fs-5 text-primary">{comp.userCount}</div>
                            <small className="text-muted" style={{ fontSize: '0.72rem' }}>Active Staff</small>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="p-2.5 bg-light rounded-3 border">
                            <div className="fw-bolder fs-5 text-success">{comp.maxAgents}</div>
                            <small className="text-muted" style={{ fontSize: '0.72rem' }}>Seat Quota</small>
                          </div>
                        </div>
                      </div>

                      <div className="small fw-bold text-uppercase text-muted mb-2" style={{ fontSize: '0.7rem' }}>
                        Launch Specific Tenant Module:
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 rounded-3 px-3 py-1.5"
                          onClick={() => onSwitchToCompany(comp.id, 'tickets')}
                        >
                          <TicketIcon size={14} />
                          <span>Tickets Queue</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1.5 rounded-3 px-3 py-1.5"
                          onClick={() => onSwitchToCompany(comp.id, 'engineers')}
                        >
                          <Users size={14} />
                          <span>Support Engineers</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1.5 rounded-3 px-3 py-1.5"
                          onClick={() => onSwitchToCompany(comp.id, 'mis')}
                        >
                          <FileSpreadsheet size={14} />
                          <span>MIS & 100k Export</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1.5 rounded-3 px-3 py-1.5"
                          onClick={() => onSwitchToCompany(comp.id, 'dashboard')}
                        >
                          <BarChart3 size={14} />
                          <span>SLA Analytics</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ================================================================
              MENU: SYSTEM ARCHITECTURE & 24-TABLE MYSQL SCHEMA
              ================================================================ */}
          {activeMenu === 'system' && (
            <div className="row g-4">
              <div className="col-12 col-lg-6">
                <div className="enterprise-card h-100">
                  <div className="enterprise-card-header">
                    <div className="d-flex align-items-center gap-2">
                      <Database size={18} className="text-primary" />
                      <h6 className="fw-bold mb-0">MySQL Multi-Tenant Schema (24 Tables)</h6>
                    </div>
                    <span className="badge bg-success-subtle text-success border border-success-subtle">
                      kuwy_helpdesk :3306
                    </span>
                  </div>
                  <div className="p-3">
                    {[
                      { mod: 'Tenants & Accounts', tables: 'companies, customer_accounts, contacts' },
                      { mod: 'Departments & RBAC', tables: 'departments, roles, permissions, role_permissions, users, user_departments' },
                      { mod: 'Tickets & Conversations', tables: 'tickets, ticket_threads, ticket_attachments, ticket_audit_logs' },
                      { mod: 'Tags & Custom Fields', tables: 'tags, ticket_tags, custom_field_definitions, ticket_custom_field_values' },
                      { mod: 'Channels & Mailboxes', tables: 'company_mailboxes (MS 365 Exchange Online & Forwarding)' },
                      { mod: 'SLAs & Business Hours', tables: 'sla_policies, sla_targets, business_hours' },
                      { mod: 'Knowledge Base & Alerts', tables: 'kb_categories, kb_articles, notifications' },
                    ].map(row => (
                      <div key={row.mod} className="p-2.5 border-bottom d-flex justify-content-between align-items-start gap-2">
                        <div className="fw-bold text-dark small" style={{ minWidth: '170px' }}>{row.mod}</div>
                        <code className="text-primary small text-end">{row.tables}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="col-12 col-lg-6">
                <div className="enterprise-card h-100">
                  <div className="enterprise-card-header">
                    <div className="d-flex align-items-center gap-2">
                      <Server size={18} className="text-success" />
                      <h6 className="fw-bold mb-0">Enterprise Security & Multi-Tenant Isolation</h6>
                    </div>
                  </div>
                  <div className="p-4 d-flex flex-column gap-3">
                    <div className="p-3 bg-light rounded-3 border">
                      <div className="d-flex align-items-center gap-2 fw-bold text-dark mb-1">
                        <Lock size={16} className="text-primary" />
                        <span>Strict Tenant Isolation & JWT RBAC</span>
                      </div>
                      <p className="text-muted small mb-0">
                        Every query is strictly scoped by <code>company_id</code> in the ORM/SQL layer and verified against signed JWT tokens with role hierarchy.
                      </p>
                    </div>

                    <div className="p-3 bg-light rounded-3 border">
                      <div className="d-flex align-items-center gap-2 fw-bold text-dark mb-1">
                        <Globe size={16} className="text-info" />
                        <span>Inbound Forwarding & DNS Verification</span>
                      </div>
                      <p className="text-muted small mb-0">
                        Forwarding tokens (e.g. <code>help+kuwy@inbound.yourhelpdesk.com</code>) and MX/SPF/DKIM/DMARC DNS checks guarantee authentic email delivery.
                      </p>
                    </div>

                    <div className="p-3 bg-light rounded-3 border">
                      <div className="d-flex align-items-center gap-2 fw-bold text-dark mb-1">
                        <Activity size={16} className="text-success" />
                        <span>High-Volume 100,000+ Row Streaming Engine</span>
                      </div>
                      <p className="text-muted small mb-0">
                        Powered by Apache POI <code>SXSSFWorkbook</code> and UTF-8 BOM CSV streaming for zero-memory-spike enterprise MIS exports.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====================================================================
          MODALS FOR ACTIONS (SECTION F SAFETY RAILS)
          ==================================================================== */}

      {/* 1. Extend Trial Modal (+7, +14, +30 days) */}
      {showExtendTrialModal && (
        <PlatformDialog title={`Trial settings: ${showExtendTrialModal.name}`} onClose={() => setShowExtendTrialModal(null)}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-success text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Clock size={20} />
                  <h5 className="modal-title fw-bold text-white mb-0">Trial settings: {showExtendTrialModal.name}</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close trial settings"
                  onClick={() => setShowExtendTrialModal(null)}
                ></button>
              </div>

              <form onSubmit={handleExtendTrialSubmit}>
                <div className="modal-body p-4">
                  <div className="alert alert-warning small">The current endpoint changes trial status only. It does not store or extend an expiry date.</div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Evaluation Days to Add</label>
                    <select
                      className="form-select"
                      aria-label="Requested trial days"
                      disabled
                      value={trialDaysToAdd}
                      onChange={e => setTrialDaysToAdd(Number(e.target.value))}
                    >
                      <option value={7}>+ 7 Days</option>
                      <option value={14}>+ 14 Days (Standard Two Weeks)</option>
                      <option value={30}>+ 30 Days (Full Evaluation Cycle)</option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Extension Authorization Reason</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      required
                      placeholder="e.g. Authorized by Sales VP for enterprise POC evaluation..."
                      value={trialExtendReason}
                      onChange={e => setTrialExtendReason(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowExtendTrialModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-success btn-sm fw-semibold px-4 text-white">
                    Set trial status
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}

      {/* 2. Change Plan Modal (Proration Preview) */}
      {showChangePlanModal && (
        <PlatformDialog title={`Change plan: ${showChangePlanModal.name}`} onClose={() => setShowChangePlanModal(null)}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-primary text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Edit3 size={20} />
                  <h5 className="modal-title fw-bold text-white mb-0">Change Plan: {showChangePlanModal.name}</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close plan change"
                  onClick={() => setShowChangePlanModal(null)}
                ></button>
              </div>

              <form onSubmit={handleChangePlanSubmit}>
                <div className="modal-body p-4">
                  <p className="text-muted small">Current Subscription Tier: <strong>{showChangePlanModal.planName}</strong></p>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">New Subscription Plan Tier</label>
                    <select
                      className="form-select"
                      aria-label="Target company plan"
                      value={newPlanTarget}
                      onChange={e => setNewPlanTarget(e.target.value)}
                    >
                      {plans.map(plan => <option key={plan.code} value={plan.code}>{plan.name} / {plan.maxAgents} staff</option>)}
                    </select>
                  </div>

                  <div className="platform-unavailable">This updates the company's assigned plan and staff capacity. It does not process a payment or calculate prorated charges.</div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowChangePlanModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-semibold px-4">
                    Update company plan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}

      {/* 3. Suspend / Unsuspend Modal (Required Reason) */}
      {showSuspendModal && (
        <PlatformDialog title={`Change company status: ${showSuspendModal.name}`} onClose={() => setShowSuspendModal(null)}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-danger text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Power size={20} />
                  <h5 className="modal-title fw-bold text-white mb-0">
                    {showSuspendModal.status === 'ACTIVE' ? 'Suspend Organization' : 'Reactivate Organization'}
                  </h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close company status change"
                  onClick={() => setShowSuspendModal(null)}
                ></button>
              </div>

              <form onSubmit={handleSuspendSubmit}>
                <div className="modal-body p-4">
                  <p className="text-dark small">
                    Target: <strong>{showSuspendModal.name}</strong> (<code>{showSuspendModal.subdomain}</code>)
                  </p>
                  <p className="text-muted small">
                    This changes the company's account status. Existing records are retained. Email queuing and session revocation are not verified by this action.
                  </p>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Administrative Reason (Required for Audit)</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      required
                      placeholder="e.g. Non-payment after repeated reminders, or breach of terms of service..."
                      aria-label="Reason for status change"
                      value={suspendReason}
                      onChange={e => setSuspendReason(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowSuspendModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={`btn ${showSuspendModal.status === 'ACTIVE' ? 'btn-danger' : 'btn-primary'} btn-sm fw-semibold px-4`}>
                    {showSuspendModal.status === 'ACTIVE' ? 'Suspend company' : 'Reactivate company'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}

      {/* 4. Support Session Impersonation Modal (Consent-Based 60-min Session) */}
      {showSupportSessionModal && (
        <PlatformDialog title={`Support access: ${showSupportSessionModal.name}`} onClose={() => setShowSupportSessionModal(null)}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-warning text-dark py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <ShieldAlert size={20} />
                  <h5 className="modal-title fw-bold mb-0">Support access</h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close support access"
                  onClick={() => setShowSupportSessionModal(null)}
                ></button>
              </div>

              <form onSubmit={event => event.preventDefault()}>
                <div className="modal-body p-4">
                  <div className="alert alert-warning small">Scoped, consent-based support sessions are not implemented yet. This action is unavailable until approval, authorization, and expiry are enforced by the server.</div>
                  <div className="p-3 bg-warning-subtle text-dark border border-warning rounded-3 mb-3 small">
                    <strong>Notice:</strong> This grants a 60-minute temporary, audit-logged read-only support session into <strong>{showSupportSessionModal.name}</strong>. A visible yellow banner will appear in the workspace.
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Staff Member Initiating Support</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      disabled
                      value={currentUser.displayName || 'Super Admin Staff'}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Support Case ID / Reason (Logged)</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. Investigating mailbox token sync failure requested by client admin..."
                      value={supportSessionReason}
                      onChange={e => setSupportSessionReason(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowSupportSessionModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-secondary btn-sm px-4" disabled>
                    Support sessions unavailable
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}

      {/* 5. Soft Delete Modal (Typing Company Name Confirmation) */}
      {showDeleteModal && (
        <PlatformDialog title={`Deactivate company: ${showDeleteModal.name}`} onClose={() => setShowDeleteModal(null)}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-danger text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Trash2 size={20} />
                  <h5 className="modal-title fw-bold text-white mb-0">Deactivate company</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close company deactivation"
                  onClick={() => setShowDeleteModal(null)}
                ></button>
              </div>

              <form onSubmit={handleDeleteCompanySubmit}>
                <div className="modal-body p-4">
                  <div className="alert alert-danger py-2.5 px-3 small mb-3">
                    <strong>Confirm deactivation:</strong> This marks <strong>{showDeleteModal.name}</strong> inactive. Stored data remains in place. No deletion schedule or recovery deadline is configured.
                  </div>

                  <p className="text-dark small mb-2">
                    Type the full company name <code>{showDeleteModal.name}</code> to confirm:
                  </p>

                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder={showDeleteModal.name}
                    aria-label="Company name confirmation"
                    value={deleteConfirmationInput}
                    onChange={e => setDeleteConfirmationInput(e.target.value)}
                  />
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowDeleteModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-danger btn-sm fw-bold px-4"
                    disabled={deleteConfirmationInput.trim().toLowerCase() !== showDeleteModal.name.trim().toLowerCase()}
                  >
                    Deactivate company
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}

      {/* 6. Plan Editor Modal (Screen 42b) */}
      {showPlanEditorModal && (
        <PlatformDialog title="Plan preview" onClose={() => setShowPlanEditorModal(null)} wide>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-dark text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Sliders size={20} className="text-warning" />
                  <h5 className="modal-title fw-bold text-white mb-0">Plan preview: {showPlanEditorModal.name}</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close plan preview"
                  onClick={() => setShowPlanEditorModal(null)}
                ></button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                setAlertNotice({ type: 'success', message: 'Plan preview closed. No server changes were made.' });
                setShowPlanEditorModal(null);
              }}>
                <div className="modal-body p-4">
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold">Plan Display Name</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={showPlanEditorModal.name}
                        onChange={e => setShowPlanEditorModal({ ...showPlanEditorModal, name: e.target.value })}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small fw-bold">Plan Code</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={showPlanEditorModal.code}
                        onChange={e => setShowPlanEditorModal({ ...showPlanEditorModal, code: e.target.value })}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small fw-bold">Catalog Status</label>
                      <select
                        className="form-select form-select-sm"
                        value={showPlanEditorModal.status || 'PUBLIC'}
                        onChange={e => setShowPlanEditorModal({ ...showPlanEditorModal, status: e.target.value })}
                      >
                        <option value="PUBLIC">Public</option>
                        <option value="HIDDEN">Hidden</option>
                        <option value="DRAFT">Draft</option>
                        <option value="RETIRED">Retired</option>
                      </select>
                    </div>
                  </div>

                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold">Monthly Price (INR)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={showPlanEditorModal.priceMonthlyInr}
                        onChange={e => setShowPlanEditorModal({
                          ...showPlanEditorModal,
                          priceMonthlyInr: Number(e.target.value),
                          priceYearlyInr: Number(e.target.value) * 10
                        })}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold">Annual Price (INR • 17% Discount)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={showPlanEditorModal.priceYearlyInr}
                        onChange={e => setShowPlanEditorModal({ ...showPlanEditorModal, priceYearlyInr: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <h6 className="fw-bold text-dark border-bottom pb-2 mb-3">Entitlements & Quotas</h6>
                  <div className="row g-3 mb-3">
                    <div className="col-md-4">
                      <label className="form-label small fw-semibold">Agent Seats Included</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={showPlanEditorModal.maxAgents}
                        onChange={e => setShowPlanEditorModal({ ...showPlanEditorModal, maxAgents: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-semibold">Monthly Tickets Limit</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={showPlanEditorModal.monthlyTickets || 5000}
                        onChange={e => setShowPlanEditorModal({ ...showPlanEditorModal, monthlyTickets: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-semibold">Storage Limit (GB)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        defaultValue={25}
                      />
                    </div>
                  </div>

                  <h6 className="fw-bold text-dark border-bottom pb-2 mb-3">Feature Flags</h6>
                  <div className="row g-2">
                    <div className="col-md-6">
                      <div className="form-check form-switch">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="f1"
                          defaultChecked={Boolean(showPlanEditorModal.customDomain)}
                        />
                        <label className="form-check-label small" htmlFor="f1">Custom Domain with Automated SSL</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-check form-switch">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="f2"
                          defaultChecked={Boolean(showPlanEditorModal.slaEngine)}
                        />
                        <label className="form-check-label small" htmlFor="f2">Enterprise SLA Escalation Engine</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-check form-switch">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="f3"
                          defaultChecked={true}
                        />
                        <label className="form-check-label small" htmlFor="f3">Remove "Powered by Kuwy" Branding</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-check form-switch">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="f4"
                          defaultChecked={true}
                        />
                        <label className="form-check-label small" htmlFor="f4">Webhooks & REST API Access</label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowPlanEditorModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-semibold px-4">
                    Close preview
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}

      {/* 7. New Coupon Modal (Screen 42c) */}
      {showNewCouponModal && (
        <PlatformDialog title="Coupon preview" onClose={() => setShowNewCouponModal(false)}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-primary text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Tag size={20} />
                  <h5 className="modal-title fw-bold text-white mb-0">Create Promotion / Coupon Code</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close coupon preview"
                  onClick={() => setShowNewCouponModal(false)}
                ></button>
              </div>

              <form onSubmit={handleCreateCouponSubmit}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="form-label small fw-bold">Coupon Code (Uppercase)</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. FLASH30"
                      value={newCouponCode}
                      onChange={e => setNewCouponCode(e.target.value.toUpperCase())}
                    />
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label small fw-bold">Discount Percentage</label>
                      <input
                        type="number"
                        className="form-control"
                        min={5}
                        max={100}
                        value={newCouponDiscount}
                        onChange={e => setNewCouponDiscount(Number(e.target.value))}
                      />
                    </div>
                    <div className="col">
                      <label className="form-label small fw-bold">Duration</label>
                      <select
                        className="form-select"
                        value={newCouponDuration}
                        onChange={e => setNewCouponDuration(e.target.value)}
                      >
                        <option value="ONCE">Once (First Month)</option>
                        <option value="3_MONTHS">3 Months</option>
                        <option value="FOREVER">Forever (Recurring)</option>
                      </select>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold">Max Allowed Redemptions</label>
                    <input
                      type="number"
                      className="form-control"
                      value={newCouponMax}
                      onChange={e => setNewCouponMax(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowNewCouponModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-semibold px-4">
                    Add to local preview
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}

      {/* 8. Onboard New Company Modal */}
      {showNewCompanyModal && (
        <PlatformDialog title="New company" onClose={() => setShowNewCompanyModal(false)} wide busy={isSaving}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-dark text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Building2 size={20} className="text-warning" />
                  <h5 className="modal-title fw-bold text-white mb-0">New company</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close new company"
                  disabled={isSaving}
                  onClick={() => setShowNewCompanyModal(false)}
                ></button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isSaving) return;
                setIsSaving(true);
                setAlertNotice(null);
                try {
                  await apiService.createAdminCompany({
                    name: newCompName,
                    companyCode: newCompCode.toUpperCase(),
                    subdomain: newCompSubdomain.toLowerCase(),
                    planName: newCompPlan,
                    maxAgents: newCompMaxAgents,
                    adminFirstName: newCompAdminFirst,
                    adminLastName: newCompAdminLast,
                    adminEmail: newCompAdminEmail.toLowerCase(),
                    adminPassword: newCompAdminPassword,
                  });

                  setAlertNotice({
                    type: 'success',
                    message: `Successfully registered ${newCompName} with Admin credential (${newCompAdminEmail}).`,
                  });
                  setShowNewCompanyModal(false);
                  setNewCompName('');
                  setNewCompCode('');
                  setNewCompSubdomain('');
                  setNewCompAdminFirst('');
                  setNewCompAdminLast('');
                  setNewCompAdminEmail('');
                  setNewCompAdminPassword('');
                  loadAdminData();
                } catch (err: any) {
                  setAlertNotice({ type: 'danger', message: err.response?.data?.error || err.message || 'Failed to create company' });
                } finally {
                  setIsSaving(false);
                }
              }}>
                <div className="modal-body p-4">
                  {alertNotice?.type === 'danger' && <div className="alert alert-danger small" role="alert">{alertNotice.message}</div>}
                  <h6 className="fw-semibold text-dark mb-3 border-bottom pb-2">Company details</h6>
                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Company Full Name</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. Tata Motors Financial Services"
                        aria-label="Company name"
                        autoComplete="organization"
                        autoFocus
                        value={newCompName}
                        onChange={e => setNewCompName(e.target.value)}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-semibold small">Company Code</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. TATA"
                        aria-label="Company code"
                        value={newCompCode}
                        onChange={e => setNewCompCode(e.target.value.toUpperCase())}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-semibold small">Subdomain</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="tata"
                        aria-label="Workspace address"
                        minLength={3}
                        maxLength={30}
                        pattern="[a-z0-9](?:[a-z0-9]|-){1,28}[a-z0-9]"
                        title="Use 3-30 lowercase letters, numbers, or hyphens; start and end with a letter or number."
                        value={newCompSubdomain}
                        onChange={e => setNewCompSubdomain(e.target.value.toLowerCase())}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Service Plan</label>
                      <select
                        className="form-select"
                        aria-label="Company plan"
                        value={newCompPlan}
                        onChange={e => { setNewCompPlan(e.target.value); const plan = plans.find(item => item.code === e.target.value); if (plan?.maxAgents > 0) setNewCompMaxAgents(plan.maxAgents); }}
                      >
                        {plans.map(plan => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Max Support Agents Quota</label>
                      <input
                        type="number"
                        aria-label="Staff capacity"
                        className="form-control"
                        min={1}
                        max={500}
                        value={newCompMaxAgents}
                        onChange={e => setNewCompMaxAgents(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <h6 className="fw-bold text-success mb-3 border-bottom pb-2">
                    Company administrator
                  </h6>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Admin First Name</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. Rajesh"
                        aria-label="Admin first name"
                        autoComplete="given-name"
                        value={newCompAdminFirst}
                        onChange={e => setNewCompAdminFirst(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Admin Last Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Kumar"
                        aria-label="Admin last name"
                        autoComplete="family-name"
                        value={newCompAdminLast}
                        onChange={e => setNewCompAdminLast(e.target.value)}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Admin Work Email (For Login)</label>
                      <input
                        type="email"
                        className="form-control"
                        required
                        placeholder="e.g. testadmin@tata.com"
                        aria-label="Admin email"
                        autoComplete="email"
                        value={newCompAdminEmail}
                        onChange={e => setNewCompAdminEmail(e.target.value)}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Initial Password</label>
                      <input
                        type="password"
                        aria-label="Initial admin password"
                        minLength={10}
                        autoComplete="new-password"
                        className="form-control"
                        required
                        value={newCompAdminPassword}
                        onChange={e => setNewCompAdminPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={isSaving}
                    onClick={() => setShowNewCompanyModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-semibold px-4" disabled={isSaving || !plans.length}>
                    {isSaving ? 'Creating...' : 'Create company'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}

      {/* 9. Issue Credential Modal */}
      {showNewCredModal && (
        <PlatformDialog title="Add staff account" onClose={() => setShowNewCredModal(false)} busy={isSaving}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-primary text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <KeyRound size={20} />
                  <h5 className="modal-title fw-bold text-white mb-0">Create Company Login Credential</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close staff account form"
                  disabled={isSaving}
                  onClick={() => setShowNewCredModal(false)}
                ></button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isSaving) return;
                setIsSaving(true);
                setAlertNotice(null);
                try {
                  const created = await apiService.createUserCredential({
                    companyId: credCompanyId,
                    email: credEmail.toLowerCase(),
                    password: credPassword,
                    firstName: credFirstName,
                    lastName: credLastName,
                    phone: credPhone,
                    roleType: credRoleType,
                  });

                  setAlertNotice({
                    type: 'success',
                    message: `Created login credential for ${created.displayName} (${created.email}).`,
                  });
                  setShowNewCredModal(false);
                  setCredEmail('');
                  setCredFirstName('');
                  setCredLastName('');
                  setCredPhone('');
                  setCredPassword('');
                  loadAdminData();
                } catch (err: any) {
                  setAlertNotice({ type: 'danger', message: err.response?.data?.error || err.message || 'Failed to create credential' });
                } finally {
                  setIsSaving(false);
                }
              }}>
                <div className="modal-body p-4">
                  {alertNotice?.type === 'danger' && <div className="alert alert-danger small" role="alert">{alertNotice.message}</div>}
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Target Organization / Company</label>
                    <select
                      className="form-select"
                      aria-label="Staff company"
                      required
                      value={credCompanyId}
                      onChange={e => setCredCompanyId(Number(e.target.value))}
                    >
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.companyCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label fw-semibold small">First Name</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="John"
                        aria-label="Staff first name"
                        value={credFirstName}
                        onChange={e => setCredFirstName(e.target.value)}
                      />
                    </div>
                    <div className="col">
                      <label className="form-label fw-semibold small">Last Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Doe"
                        aria-label="Staff last name"
                        value={credLastName}
                        onChange={e => setCredLastName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Login Email Address</label>
                    <input
                      type="email"
                      className="form-control"
                      required
                      placeholder="e.g. testagent@company.com"
                      aria-label="Staff email"
                      autoComplete="email"
                      value={credEmail}
                      onChange={e => setCredEmail(e.target.value)}
                    />
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label fw-semibold small">Role / Access Level</label>
                      <select
                        className="form-select"
                        aria-label="Staff role"
                        value={credRoleType}
                        onChange={e => setCredRoleType(e.target.value)}
                      >
                        <option value="AGENT">Support Agent</option>
                        <option value="COMPANY_ADMIN">Company Administrator</option>
                      </select>
                    </div>

                    <div className="col">
                      <label className="form-label fw-semibold small">Password</label>
                      <input
                        type="password"
                        aria-label="Staff password"
                        autoComplete="new-password"
                        minLength={10}
                        className="form-control"
                        required
                        value={credPassword}
                        onChange={e => setCredPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Phone Number</label>
                    <input
                      type="tel"
                      aria-label="Staff phone"
                      autoComplete="tel"
                      className="form-control"
                      placeholder="+91 9876543210"
                      value={credPhone}
                      onChange={e => setCredPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={isSaving}
                    onClick={() => setShowNewCredModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-semibold px-4" disabled={isSaving || !companies.length}>
                    {isSaving ? 'Creating...' : 'Create staff account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}

      {/* 10. Reset Password Modal */}
      {showResetPasswordModal && (
        <PlatformDialog title="Reset staff password" onClose={() => setShowResetPasswordModal(null)}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-white border-bottom py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <ShieldAlert size={20} className="text-warning" />
                  <h5 className="modal-title fw-bold mb-0">Reset User Password</h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close password reset"
                  onClick={() => setShowResetPasswordModal(null)}
                ></button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!showResetPasswordModal) return;
                try {
                  await apiService.resetUserPassword(showResetPasswordModal.id, newPasswordVal);
                  setAlertNotice({
                    type: 'success',
                    message: `Password successfully reset for ${showResetPasswordModal.email}.`,
                  });
                  setShowResetPasswordModal(null);
                  setNewPasswordVal('');
                } catch (err: any) {
                  setAlertNotice({ type: 'danger', message: err.message || 'Failed to reset password' });
                }
              }}>
                <div className="modal-body p-4">
                  <p className="text-muted small">
                    Resetting password for: <strong>{showResetPasswordModal.displayName}</strong> ({showResetPasswordModal.email})
                  </p>
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">New Password</label>
                    <input
                      type="password"
                      aria-label="New password"
                      autoComplete="new-password"
                      minLength={10}
                      className="form-control"
                      required
                      value={newPasswordVal}
                      onChange={e => setNewPasswordVal(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowResetPasswordModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-semibold">
                    Apply New Password
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PlatformDialog>
      )}
    </div>
  );
};
