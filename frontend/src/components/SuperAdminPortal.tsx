import React, { useState, useEffect } from 'react';
import {
  Building2, ShieldCheck, Users, Ticket as TicketIcon, Plus, Power,
  KeyRound, RefreshCw, LogOut, ArrowRight, CheckCircle2,
  AlertCircle, Edit3, Settings, ShieldAlert, LayoutDashboard,
  Database, Globe, Search, Layers, Lock, Server, Mail,
  FileSpreadsheet, BarChart3, ChevronRight, Activity,
  CreditCard, Clock, Sliders, Tag, Ban,
  Eye, EyeOff, Download, Trash2, AlertTriangle,
  X, TrendingUp, DollarSign
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
  const [emailHealth, setEmailHealth] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [alertNotice, setAlertNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null);

  // Screen 40: Date Range & Chart States
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'ytd'>('30d');

  // Screen 41: Companies List & Filter States
  const [compSearch, setCompSearch] = useState('');
  const [compStatusFilter, setCompStatusFilter] = useState<string>('ALL');
  const [compPlanFilter, setCompPlanFilter] = useState<string>('ALL');
  const [compHealthFilter, setCompHealthFilter] = useState<string>('ALL');
  const [unmaskedEmails, setUnmaskedEmails] = useState<Record<number, boolean>>({});

  // Screen 41b: Company Detail Drawer / Modal State
  const [selectedCompanyDetail, setSelectedCompanyDetail] = useState<CompanyDetail | null>(null);
  const [companyDetailTab, setCompanyDetailTab] = useState<'overview' | 'billing' | 'usage' | 'email' | 'users' | 'security' | 'notes' | 'audit'>('overview');
  const [staffNotes, setStaffNotes] = useState<Record<number, string[]>>({
    1: ['Flagship enterprise tenant. Annual renewal due in Q3.', 'Verified SPF and DKIM on custom domain helpdesk.kuwy.in.'],
    2: ['Pilot trial tenant. Requested extended evaluation for 10 agents.', 'Customer contact confirmed integration with Razorpay.'],
    3: ['Scale professional plan subscriber. Consistent low bounce rate.'],
    4: ['Starter evaluation account. Outreach sent regarding SLA automation setup.']
  });
  const [newStaffNoteInput, setNewStaffNoteInput] = useState('');

  // Modals for Actions on Companies (Section F Safety Rails)
  const [showExtendTrialModal, setShowExtendTrialModal] = useState<CompanyDetail | null>(null);
  const [trialDaysToAdd, setTrialDaysToAdd] = useState<number>(14);
  const [trialExtendReason, setTrialExtendReason] = useState<string>('Sales team authorized evaluation extension');

  const [showChangePlanModal, setShowChangePlanModal] = useState<CompanyDetail | null>(null);
  const [newPlanTarget, setNewPlanTarget] = useState<string>('PRO');
  const [planChangeProrate, setPlanChangeProrate] = useState<boolean>(true);

  const [showSuspendModal, setShowSuspendModal] = useState<CompanyDetail | null>(null);
  const [suspendReason, setSuspendReason] = useState<string>('Payment past due after 14-day grace period');

  const [showDeleteModal, setShowDeleteModal] = useState<CompanyDetail | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState<string>('');

  const [showSupportSessionModal, setShowSupportSessionModal] = useState<CompanyDetail | null>(null);
  const [supportSessionReason, setSupportSessionReason] = useState<string>('Investigating customer mailbox inbound sync issue');
  const [activeSupportSession, setActiveSupportSession] = useState<{ companyName: string; expiresAt: string; token: string } | null>(null);

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
  const [abuseReports, setAbuseReports] = useState<any[]>([
    { id: 1, reporterEmail: 'security-team@externalorg.com', reportedCompany: 'Apex Global Logistics', reason: 'High bounce rate with generic marketing subject', riskScore: 'Low', status: 'INVESTIGATING', reportedAt: '2 hours ago' },
    { id: 2, reporterEmail: 'postmaster@deliverability.net', reportedCompany: 'FastTrack Logistics', reason: 'Unverified sender domain SPF mismatch', riskScore: 'Medium', status: 'PENDING_REVIEW', reportedAt: 'Yesterday' }
  ]);
  const [blockedIps, setBlockedIps] = useState<string[]>(['198.51.100.42', '203.0.113.89', '185.220.101.5']);
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
  const [newCompAdminPassword, setNewCompAdminPassword] = useState('Password@123');

  // New Credential Form Data
  const [credCompanyId, setCredCompanyId] = useState<number>(1);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('Password@123');
  const [credFirstName, setCredFirstName] = useState('');
  const [credLastName, setCredLastName] = useState('');
  const [credPhone, setCredPhone] = useState('');
  const [credRoleType, setCredRoleType] = useState('AGENT');

  // Reset Password Form Data
  const [newPasswordVal, setNewPasswordVal] = useState('Password@123');

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const [overviewData, companiesData, usersData, plansData, couponsData, emailHealthData] = await Promise.all([
        apiService.getAdminOverview(),
        apiService.getAdminCompanies(),
        apiService.getAdminUsers(),
        apiService.getPlatformPlans(),
        apiService.getPlatformCoupons(),
        apiService.getEmailSystemHealth(),
      ]);
      setOverview(overviewData);
      setCompanies(companiesData);
      setUsers(usersData);
      setPlans(plansData);
      setCoupons(couponsData);
      setEmailHealth(emailHealthData);
      if (companiesData.length > 0 && !credCompanyId) {
        setCredCompanyId(companiesData[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load Super Admin telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to mask owner emails for super admin privacy: e.g. "admin@kuwy.in" -> "adm***@kuwy.in"
  const maskEmail = (email: string) => {
    if (!email) return 'adm***@tenant.com';
    const parts = email.split('@');
    if (parts.length < 2) return 'adm***@tenant.com';
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
        message: `Extended trial for ${showExtendTrialModal.name} by +${trialDaysToAdd} days.`,
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
      await apiService.updateCompanyLimits(showChangePlanModal.id, newPlanTarget, showChangePlanModal.maxAgents);
      setAlertNotice({
        type: 'success',
        message: `Plan for ${showChangePlanModal.name} changed to ${newPlanTarget} with prorated billing adjustments.`,
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
      await apiService.suspendCompany(showSuspendModal.id, suspendReason);
      setAlertNotice({
        type: 'success',
        message: `Organization ${showSuspendModal.name} status updated to SUSPENDED. Reason logged in audit trail.`,
      });
      setShowSuspendModal(null);
      loadAdminData();
    } catch (err: any) {
      setAlertNotice({ type: 'danger', message: err.message || 'Failed to update company suspension state' });
    }
  };

  // Quick Action: Support Access / Consent-based 60-min impersonation
  const handleStartSupportSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSupportSessionModal) return;
    try {
      const session = await apiService.impersonateCompany(
        showSupportSessionModal.id,
        currentUser.displayName || 'Super Admin Staff',
        supportSessionReason
      );
      setActiveSupportSession({
        companyName: showSupportSessionModal.name,
        expiresAt: session.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString(),
        token: session.sessionToken || 'active-session-token'
      });
      setShowSupportSessionModal(null);
      setAlertNotice({
        type: 'success',
        message: `Support impersonation active for ${showSupportSessionModal.name}. 60-minute audit-logged read-only session started.`,
      });
      // Switch into company workspace with support banner
      onSwitchToCompany(showSupportSessionModal.id, 'tickets');
    } catch (err: any) {
      setAlertNotice({ type: 'danger', message: err.message || 'Failed to initiate support session' });
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
        message: `Company ${showDeleteModal.name} queued for deletion with 30-day grace recovery hold.`,
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
    setAlertNotice({ type: 'success', message: `Coupon code '${newEntry.code}' created successfully.` });
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
      title: 'Executive Platform Overview (Screen 40)',
      subtitle: 'Real-time cross-tenant telemetry, MRR/ARR growth, infrastructure diagnostics & critical alerts',
    },
    companies: {
      title: 'Organizations & Multi-Tenant Directory (Screen 41)',
      subtitle: 'Inspect tenant health, manage quotas, trials, plan migrations, and consent-based support access',
    },
    plans: {
      title: 'Plans, Pricing & Entitlements Management (Screen 42)',
      subtitle: 'Manage subscription tiers, feature flags, coupon campaigns, and grandfathering versions',
    },
    platform: {
      title: 'Platform Settings, System Health & Abuse (Screen 43)',
      subtitle: 'Global sign-up controls, inbound/outbound email telemetry, rate limits, and abuse mitigation',
    },
    credentials: {
      title: 'Identity, Roles & Login Credentials',
      subtitle: 'Provision administrator and support engineer accounts across all registered organizations',
    },
    workspaces: {
      title: 'Tenant Workspaces & Queue Launcher',
      subtitle: 'Inspect and launch directly into any client organization’s live HelpDesk workspace',
    },
    system: {
      title: 'System Architecture, Security & Database',
      subtitle: 'MySQL 24-table multi-tenant schema, strict tenant isolation boundaries, and RBAC matrix',
    },
  };

  // Helper for KPI card click-throughs to filter Companies list (Screen 40 -> Screen 41 interaction)
  const jumpToFilteredCompanies = (status: string) => {
    setCompStatusFilter(status);
    setActiveMenu('companies');
  };

  return (
    <div className="enterprise-shell">
      {/* ====================================================================
          LEFT SIDEBAR NAVIGATION (ALL ADMIN & WORKSPACE MENUS)
          ==================================================================== */}
      <aside className="enterprise-sidebar">
        <div>
          {/* Brand Header */}
          <div className="sidebar-brand-header">
            <div className="sidebar-brand-icon admin-mode">
              <ShieldCheck size={22} />
            </div>
            <div className="overflow-hidden">
              <h6 className="mb-0 fw-bolder text-white text-truncate" style={{ fontSize: '1.05rem', letterSpacing: '-0.2px' }}>
                Admin Console
              </h6>
              <small className="text-secondary" style={{ fontSize: '0.72rem' }}>Super Admin Governance</small>
            </div>
          </div>

          {/* Active Impersonation Warning Banner (if active) */}
          {activeSupportSession && (
            <div className="mx-2.5 my-2 p-2.5 rounded-3 bg-warning text-dark border border-warning shadow-xs" style={{ fontSize: '0.75rem' }}>
              <div className="d-flex align-items-center gap-1.5 fw-bold mb-0.5">
                <Clock size={14} />
                <span>Support Impersonation Active</span>
              </div>
              <div className="text-truncate">Tenant: <strong>{activeSupportSession.companyName}</strong></div>
              <div className="d-flex justify-content-between align-items-center mt-1 pt-1 border-top border-dark border-opacity-25">
                <span style={{ fontSize: '0.68rem' }}>Read-only (60m)</span>
                <button
                  type="button"
                  className="btn btn-dark btn-xs px-1.5 py-0.5"
                  style={{ fontSize: '0.65rem' }}
                  onClick={() => setActiveSupportSession(null)}
                >
                  End Session
                </button>
              </div>
            </div>
          )}

          {/* SECTION 1: PLATFORM GOVERNANCE */}
          <div className="sidebar-section-label">
            <span>Platform Governance</span>
          </div>
          <div className="sidebar-nav-group">
            <button
              type="button"
              className={`sidebar-menu-btn ${activeMenu === 'overview' ? 'admin-active' : ''}`}
              onClick={() => setActiveMenu('overview')}
            >
              <LayoutDashboard size={18} />
              <span>Super Admin Dashboard</span>
            </button>

            <button
              type="button"
              className={`sidebar-menu-btn ${activeMenu === 'companies' ? 'admin-active' : ''}`}
              onClick={() => setActiveMenu('companies')}
            >
              <Building2 size={18} />
              <span>Companies & Tenants</span>
              <span className="sidebar-badge">{companies.length}</span>
            </button>

            <button
              type="button"
              className={`sidebar-menu-btn ${activeMenu === 'plans' ? 'admin-active' : ''}`}
              onClick={() => setActiveMenu('plans')}
            >
              <CreditCard size={18} />
              <span>Plans & Pricing</span>
              <span className="sidebar-badge">{plans.length || 4}</span>
            </button>

            <button
              type="button"
              className={`sidebar-menu-btn ${activeMenu === 'platform' ? 'admin-active' : ''}`}
              onClick={() => setActiveMenu('platform')}
            >
              <Sliders size={18} />
              <span>Platform Health & Abuse</span>
              {abuseReports.length > 0 && (
                <span className="badge bg-danger rounded-pill ms-auto" style={{ fontSize: '0.65rem' }}>
                  {abuseReports.length}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`sidebar-menu-btn ${activeMenu === 'credentials' ? 'admin-active' : ''}`}
              onClick={() => setActiveMenu('credentials')}
            >
              <KeyRound size={18} />
              <span>Staff Identity & Roles</span>
              <span className="sidebar-badge">{users.length}</span>
            </button>

            <button
              type="button"
              className={`sidebar-menu-btn ${activeMenu === 'workspaces' ? 'admin-active' : ''}`}
              onClick={() => setActiveMenu('workspaces')}
            >
              <Layers size={18} />
              <span>Tenant Workspaces</span>
            </button>

            <button
              type="button"
              className={`sidebar-menu-btn ${activeMenu === 'system' ? 'admin-active' : ''}`}
              onClick={() => setActiveMenu('system')}
            >
              <Database size={18} />
              <span>System & DB Schema</span>
              <span className="sidebar-badge">24 Tbls</span>
            </button>
          </div>

          {/* SECTION 2: QUICK HELPDESK MODULE JUMP */}
          <div className="sidebar-section-label">
            <span>HelpDesk Direct Jump</span>
          </div>
          <div className="sidebar-nav-group">
            <button
              type="button"
              className="sidebar-menu-btn"
              onClick={() => onSwitchToCompany(companies[0]?.id || 1, 'tickets')}
            >
              <TicketIcon size={17} className="text-info" />
              <span>Tickets & Live Queue</span>
              <ChevronRight size={14} className="ms-auto opacity-50" />
            </button>

            <button
              type="button"
              className="sidebar-menu-btn"
              onClick={() => onSwitchToCompany(companies[0]?.id || 1, 'engineers')}
            >
              <Users size={17} className="text-success" />
              <span>Support Engineers</span>
              <ChevronRight size={14} className="ms-auto opacity-50" />
            </button>

            <button
              type="button"
              className="sidebar-menu-btn"
              onClick={() => onSwitchToCompany(companies[0]?.id || 1, 'mis')}
            >
              <FileSpreadsheet size={17} className="text-warning" />
              <span>Track & 100k MIS</span>
              <ChevronRight size={14} className="ms-auto opacity-50" />
            </button>
          </div>

          {/* SECTION 3: REGISTERED TENANTS QUICK SWITCHER */}
          <div className="sidebar-section-label">
            <span>Registered Tenants</span>
          </div>
          <div className="sidebar-nav-group">
            {companies.map(comp => (
              <button
                key={comp.id}
                type="button"
                className="sidebar-menu-btn py-1.5"
                onClick={() => onSwitchToCompany(comp.id, 'tickets')}
                title={`Launch ${comp.name} HelpDesk Workspace`}
              >
                <span
                  className="rounded-2 d-inline-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0"
                  style={{
                    width: '22px',
                    height: '22px',
                    fontSize: '0.62rem',
                    backgroundColor: comp.primaryColor || '#2563eb',
                  }}
                >
                  {comp.companyCode.slice(0, 2)}
                </span>
                <span className="text-truncate" style={{ fontSize: '0.8rem' }}>{comp.name}</span>
                <span
                  className={`pulse-dot ms-auto ${comp.status === 'ACTIVE' ? 'pulse-dot-success' : 'pulse-dot-danger'}`}
                  style={{ width: '6px', height: '6px' }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar Footer: Platform Health & Super Admin Account */}
        <div className="sidebar-footer">
          <div className="p-2.5 rounded-3 mb-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="d-flex align-items-center justify-content-between mb-1">
              <div className="d-flex align-items-center gap-1.5">
                <span className="pulse-dot pulse-dot-success" style={{ width: '7px', height: '7px' }}></span>
                <span className="fw-bold text-white" style={{ fontSize: '0.74rem' }}>MySQL 8.4 Connected</span>
              </div>
              <span className="badge bg-success bg-opacity-25 text-success" style={{ fontSize: '0.62rem' }}>:3306</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
              Multi-Tenant DB: <code className="text-info">kuwy_helpdesk</code>
            </div>
          </div>

          <div className="d-flex align-items-center justify-content-between pt-1">
            <div className="d-flex align-items-center gap-2 overflow-hidden">
              <div
                className="rounded-circle bg-warning text-dark fw-bold d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}
              >
                {currentUser.firstName?.charAt(0) || 'S'}
              </div>
              <div className="overflow-hidden">
                <div className="fw-bold text-white text-truncate" style={{ fontSize: '0.8rem' }}>
                  {currentUser.displayName || 'Platform Owner'}
                </div>
                <div className="badge bg-warning bg-opacity-25 text-warning" style={{ fontSize: '0.65rem' }}>
                  Super Admin
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline-danger border-0 p-1.5 text-danger"
              onClick={onLogout}
              title="Sign Out of Admin Console"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ====================================================================
          RIGHT MAIN AREA (CONTEXTUAL TOPBAR + CONTENT)
          ==================================================================== */}
      <div className="enterprise-main">
        {/* Top Contextual Header */}
        <header className="enterprise-topbar">
          <div>
            <div className="d-flex align-items-center gap-2 text-muted small mb-0.5" style={{ fontSize: '0.75rem' }}>
              <span className="fw-semibold text-primary">Admin Console</span>
              <ChevronRight size={13} />
              <span className="fw-semibold text-dark">{menuTitleMap[activeMenu].title}</span>
            </div>
            <h5 className="fw-bolder mb-0 text-dark" style={{ fontSize: '1.15rem' }}>
              {menuTitleMap[activeMenu].title}
            </h5>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1.5 px-3 py-1.5 rounded-3"
              onClick={loadAdminData}
              disabled={isLoading}
            >
              <RefreshCw size={14} className={isLoading ? 'spin-anim' : ''} />
              <span>Sync Telemetry</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5 px-3 py-1.5 rounded-3 fw-semibold"
              onClick={() => setShowNewCredModal(true)}
            >
              <KeyRound size={14} />
              <span>Issue Staff Login</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 px-3 py-1.5 rounded-3 fw-semibold shadow-sm"
              onClick={() => setShowNewCompanyModal(true)}
            >
              <Plus size={15} />
              <span>Onboard Organization</span>
            </button>

            <div className="vr mx-1 text-muted d-none d-md-block" style={{ height: '24px' }}></div>

            <button
              type="button"
              className="btn btn-sm btn-dark d-flex align-items-center gap-1.5 px-3 py-1.5 rounded-3 fw-semibold shadow-sm"
              onClick={() => onSwitchToCompany(companies.length > 0 ? companies[0].id : 1, 'tickets')}
            >
              <span>Launch HelpDesk Queue</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </header>

        {/* Main Scrollable Content */}
        <div className="enterprise-content">
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
            <div className="animate-fade-in">
              {/* Date Range Selector & Period Controls */}
              <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                <div>
                  <h6 className="fw-bold mb-0 text-dark">Platform Telemetry & Financial Health</h6>
                  <small className="text-muted">Consolidated multi-tenant KPIs across all client workspaces</small>
                </div>

                <div className="btn-group btn-group-sm bg-white p-1 rounded-3 border shadow-xs">
                  {(['7d', '30d', '90d', 'ytd'] as const).map(range => (
                    <button
                      key={range}
                      type="button"
                      className={`btn btn-sm px-3 rounded-2 fw-semibold ${dateRange === range ? 'btn-primary' : 'btn-light border-0 text-secondary'}`}
                      onClick={() => setDateRange(range)}
                    >
                      {range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : range === '90d' ? 'Last 90 Days' : 'Year to Date'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 1: Business KPI Cards (Clickable into Screen 41 Filters) */}
              <div className="row g-3 mb-4">
                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card h-100" onClick={() => jumpToFilteredCompanies('ALL')} style={{ cursor: 'pointer' }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                          Total Companies
                        </small>
                        <h3 className="fw-bolder mb-1 mt-1">{overview?.totalCompanies || companies.length}</h3>
                        <div className="d-flex align-items-center gap-1.5 small text-success fw-bold">
                          <span className="pulse-dot pulse-dot-success"></span>
                          <span>{overview?.activeCompanies || 3} Active</span>
                          <span className="text-muted ms-1">• {overview?.trialCompanies || 1} Trial</span>
                        </div>
                      </div>
                      <div className="stat-icon bg-primary-subtle text-primary">
                        <Building2 size={24} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card h-100" onClick={() => jumpToFilteredCompanies('ACTIVE')} style={{ cursor: 'pointer' }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                          Monthly Recurring Revenue (MRR)
                        </small>
                        <h3 className="fw-bolder mb-1 mt-1 text-success">
                          ₹{(overview?.mrr || 41996).toLocaleString()}
                        </h3>
                        <div className="d-flex align-items-center gap-1 small text-success fw-semibold">
                          <TrendingUp size={14} />
                          <span>+14.2% MoM Growth</span>
                        </div>
                      </div>
                      <div className="stat-icon bg-success-subtle text-success">
                        <DollarSign size={24} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card h-100" onClick={() => setActiveMenu('plans')} style={{ cursor: 'pointer' }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                          Annual Run Rate (ARR)
                        </small>
                        <h3 className="fw-bolder mb-1 mt-1 text-primary">
                          ₹{(overview?.arr || 503952).toLocaleString()}
                        </h3>
                        <div className="small text-muted">
                          <span>Churn: <strong>0.0%</strong></span> • <span className="text-success">+3 sign-ups</span>
                        </div>
                      </div>
                      <div className="stat-icon bg-info-subtle text-info">
                        <TrendingUp size={24} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card h-100" onClick={() => jumpToFilteredCompanies('PAST_DUE')} style={{ cursor: 'pointer' }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                          Failed Payments / Risk
                        </small>
                        <h3 className="fw-bolder mb-1 mt-1 text-dark">
                          {overview?.failedPaymentsCount || 0}
                        </h3>
                        <div className="d-flex align-items-center gap-1 small text-success fw-bold">
                          <CheckCircle2 size={13} />
                          <span>0 Accounts in Past Due</span>
                        </div>
                      </div>
                      <div className="stat-icon bg-warning-subtle text-warning">
                        <AlertTriangle size={24} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Growth Charts & Platform-Wide Usage KPIs */}
              <div className="row g-4 mb-4">
                {/* Left: Sign-ups vs Churn & MRR Growth Simulation */}
                <div className="col-12 col-xl-7">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div>
                        <h6 className="fw-bold mb-0">Tenant Growth & MRR Trajectory</h6>
                        <small className="text-muted">Monthly onboarding velocity vs customer retention</small>
                      </div>
                      <span className="badge bg-success-subtle text-success px-2.5 py-1 rounded-pill fw-bold">
                        99.8% Retention
                      </span>
                    </div>

                    <div className="p-4">
                      {/* CSS-based bar chart representation */}
                      <div className="d-flex justify-content-between align-items-end mb-3 pt-3" style={{ height: '160px' }}>
                        {[
                          { m: 'Jun', signups: 3, mrr: 12000, height: 40 },
                          { m: 'Jul', signups: 4, mrr: 19000, height: 60 },
                          { m: 'Aug', signups: 5, mrr: 26000, height: 80 },
                          { m: 'Sep', signups: 6, mrr: 33000, height: 105 },
                          { m: 'Oct', signups: 7, mrr: 38000, height: 125 },
                          { m: 'Nov (Now)', signups: 9, mrr: 41996, height: 145 },
                        ].map(bar => (
                          <div key={bar.m} className="d-flex flex-column align-items-center gap-2" style={{ width: '14%' }}>
                            <small className="text-muted fw-bold" style={{ fontSize: '0.65rem' }}>
                              ₹{(bar.mrr / 1000).toFixed(0)}k
                            </small>
                            <div
                              className="rounded-top-3 w-100 bg-primary bg-opacity-75 hover-shadow transition-all"
                              style={{ height: `${bar.height}px` }}
                              title={`${bar.m}: ${bar.signups} Sign-ups, ₹${bar.mrr.toLocaleString()} MRR`}
                            />
                            <span className="text-muted fw-semibold" style={{ fontSize: '0.72rem' }}>{bar.m}</span>
                          </div>
                        ))}
                      </div>

                      <div className="p-3 bg-light rounded-3 border d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div className="d-flex align-items-center gap-3">
                          <div className="d-flex align-items-center gap-1.5">
                            <span className="badge bg-primary p-1 rounded-circle" style={{ width: '10px', height: '10px' }}></span>
                            <span className="small text-secondary fw-semibold">Net New Workspaces</span>
                          </div>
                          <div className="d-flex align-items-center gap-1.5">
                            <span className="badge bg-success p-1 rounded-circle" style={{ width: '10px', height: '10px' }}></span>
                            <span className="small text-secondary fw-semibold">Zero Churn (100% Retained)</span>
                          </div>
                        </div>
                        <span className="text-muted small">Updated in real-time</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Platform-Wide Usage Counters */}
                <div className="col-12 col-xl-5">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div>
                        <h6 className="fw-bold mb-0">Platform-Wide Workload Utilization</h6>
                        <small className="text-muted">Real-time aggregate consumption</small>
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="p-3 bg-light rounded-3 border mb-2.5">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="text-muted small fw-semibold">Tickets Ingested Today</span>
                          <span className="badge bg-primary-subtle text-primary fw-bold">Live Stream</span>
                        </div>
                        <div className="fs-4 fw-bolder text-dark mb-1">
                          {overview?.ticketsToday || 128} <span className="fs-6 fw-normal text-muted">/ {overview?.totalTickets || 487} this month</span>
                        </div>
                        <div className="quota-bar">
                          <div className="quota-bar-fill bg-primary" style={{ width: '38%' }} />
                        </div>
                      </div>

                      <div className="p-3 bg-light rounded-3 border mb-2.5">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="text-muted small fw-semibold">Active Agents Online</span>
                          <span className="badge bg-success-subtle text-success fw-bold">{overview?.totalAgents || 19} Assigned</span>
                        </div>
                        <div className="fs-4 fw-bolder text-dark mb-1">
                          {overview?.totalAgents || 19} <span className="fs-6 fw-normal text-muted">across {companies.length} tenants</span>
                        </div>
                        <div className="quota-bar">
                          <div className="quota-bar-fill bg-success" style={{ width: '62%' }} />
                        </div>
                      </div>

                      <div className="p-3 bg-light rounded-3 border">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="text-muted small fw-semibold">Object Storage & Attachment Pool</span>
                          <span className="badge bg-info-subtle text-info fw-bold">1.42 GB / 50 GB</span>
                        </div>
                        <div className="fs-4 fw-bolder text-dark mb-1">
                          1.42 GB <span className="fs-6 fw-normal text-muted">(2.8% of platform tier quota)</span>
                        </div>
                        <div className="quota-bar">
                          <div className="quota-bar-fill bg-info" style={{ width: '3%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Platform Health Panel (Real-Time Diagnostic Gauges) */}
              <div className="enterprise-card mb-4">
                <div className="enterprise-card-header bg-dark text-white">
                  <div className="d-flex align-items-center gap-2">
                    <Activity size={18} className="text-success" />
                    <div>
                      <h6 className="fw-bold mb-0 text-white">Platform Infrastructure & Service Health Diagnostics</h6>
                      <small className="text-secondary" style={{ fontSize: '0.72rem' }}>Latency, Error Rates, Email Deliverability & External Providers</small>
                    </div>
                  </div>
                  <span className="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25 d-inline-flex align-items-center gap-1.5 px-3 py-1.5">
                    <span className="pulse-dot pulse-dot-success" style={{ width: '6px', height: '6px' }}></span>
                    <span>ALL PLATFORM ENGINES OPERATIONAL</span>
                  </span>
                </div>

                <div className="p-4">
                  <div className="row g-3">
                    <div className="col-12 col-md-3">
                      <div className="p-3 bg-light rounded-3 border h-100">
                        <div className="text-muted small fw-bold text-uppercase mb-1" style={{ fontSize: '0.68rem' }}>
                          API Latency (p95)
                        </div>
                        <div className="fs-4 fw-bolder text-success">
                          {overview?.avgResponseTimeMs || 42} ms
                        </div>
                        <small className="text-muted">Target: &lt; 200 ms • Error Rate: 0.02%</small>
                      </div>
                    </div>

                    <div className="col-12 col-md-3">
                      <div className="p-3 bg-light rounded-3 border h-100">
                        <div className="text-muted small fw-bold text-uppercase mb-1" style={{ fontSize: '0.68rem' }}>
                          Inbound Email Delay
                        </div>
                        <div className="fs-4 fw-bolder text-primary">
                          {emailHealth?.inboundProcessingDelayMs || 340} ms
                        </div>
                        <small className="text-muted">Queue Size: {emailHealth?.inboundQueueSize || 0} • Dead Letter: 0</small>
                      </div>
                    </div>

                    <div className="col-12 col-md-3">
                      <div className="p-3 bg-light rounded-3 border h-100">
                        <div className="text-muted small fw-bold text-uppercase mb-1" style={{ fontSize: '0.68rem' }}>
                          Outbound Delivery Rate
                        </div>
                        <div className="fs-4 fw-bolder text-success">
                          {emailHealth?.outboundDeliveryRate || 99.8}%
                        </div>
                        <small className="text-muted">Bounce Rate: {emailHealth?.bounceRate || 0.18}% • SPF/DKIM: 99.4%</small>
                      </div>
                    </div>

                    <div className="col-12 col-md-3">
                      <div className="p-3 bg-light rounded-3 border h-100">
                        <div className="text-muted small fw-bold text-uppercase mb-1" style={{ fontSize: '0.68rem' }}>
                          Hikari Connection Pool
                        </div>
                        <div className="fs-4 fw-bolder text-dark">
                          1 / 10 Active
                        </div>
                        <small className="text-muted">Wait time: 0 ms • CPU: 14% • RAM: 1.18 GB</small>
                      </div>
                    </div>
                  </div>

                  {/* Third-Party Service Dependencies Grid */}
                  <div className="mt-4 pt-3 border-top">
                    <div className="small fw-bold text-uppercase text-muted mb-2.5" style={{ fontSize: '0.7rem' }}>
                      Upstream Third-Party Service Connections:
                    </div>
                    <div className="row g-2">
                      <div className="col-12 col-md-4">
                        <div className="p-2.5 border rounded-3 d-flex justify-content-between align-items-center bg-white">
                          <div className="d-flex align-items-center gap-2">
                            <CreditCard size={16} className="text-primary" />
                            <span className="small fw-semibold text-dark">Payment Gateway (Razorpay/Stripe)</span>
                          </div>
                          <span className="badge bg-success-subtle text-success">Operational (99.99%)</span>
                        </div>
                      </div>

                      <div className="col-12 col-md-4">
                        <div className="p-2.5 border rounded-3 d-flex justify-content-between align-items-center bg-white">
                          <div className="d-flex align-items-center gap-2">
                            <Mail size={16} className="text-info" />
                            <span className="small fw-semibold text-dark">M365 & SES Email Relays</span>
                          </div>
                          <span className="badge bg-success-subtle text-success">Operational (99.95%)</span>
                        </div>
                      </div>

                      <div className="col-12 col-md-4">
                        <div className="p-2.5 border rounded-3 d-flex justify-content-between align-items-center bg-white">
                          <div className="d-flex align-items-center gap-2">
                            <Server size={16} className="text-success" />
                            <span className="small fw-semibold text-dark">Storage Cluster (Local/S3)</span>
                          </div>
                          <span className="badge bg-success-subtle text-success">Operational (100.0%)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 4: Critical Needs-Attention List & Live Audit Activity */}
              <div className="row g-4">
                {/* Needs Attention Column */}
                <div className="col-12 col-xl-6">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div className="d-flex align-items-center gap-2">
                        <AlertTriangle size={17} className="text-warning" />
                        <h6 className="fw-bold mb-0">Needs Attention (Platform Safety)</h6>
                      </div>
                      <span className="badge bg-warning-subtle text-warning-emphasis fw-bold">2 Action Items</span>
                    </div>

                    <div className="p-0">
                      <ul className="list-group list-group-flush">
                        <li className="list-group-item p-3 d-flex justify-content-between align-items-center">
                          <div>
                            <div className="fw-bold text-dark small">Seat Quota Warning: Kuwy Technology Services</div>
                            <div className="text-muted small">Currently utilizing 14 of 15 allowed seats (93% capacity).</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary rounded-3"
                            onClick={() => {
                              const kuwy = companies.find(c => c.companyCode === 'KUWY');
                              if (kuwy) {
                                setShowChangePlanModal(kuwy);
                              }
                            }}
                          >
                            Expand Quota
                          </button>
                        </li>

                        <li className="list-group-item p-3 d-flex justify-content-between align-items-center">
                          <div>
                            <div className="fw-bold text-dark small">Trial Expiry: FastTrack Logistics</div>
                            <div className="text-muted small">Starter plan evaluation expires in 2 days.</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success rounded-3"
                            onClick={() => {
                              const fast = companies.find(c => c.name.includes('FastTrack') || c.companyCode === 'FAST');
                              if (fast) setShowExtendTrialModal(fast);
                              else if (companies[1]) setShowExtendTrialModal(companies[1]);
                            }}
                          >
                            Extend +14d
                          </button>
                        </li>

                        <li className="list-group-item p-3 d-flex justify-content-between align-items-center bg-light">
                          <div className="d-flex align-items-center gap-2 text-muted small">
                            <CheckCircle2 size={15} className="text-success" />
                            <span>No failed credit card webhooks or pending charge disputes.</span>
                          </div>
                          <span className="badge bg-secondary-subtle text-secondary">Clean</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Recent Activity Stream Column */}
                <div className="col-12 col-xl-6">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div className="d-flex align-items-center gap-2">
                        <Clock size={17} className="text-primary" />
                        <h6 className="fw-bold mb-0">Platform Audit & Activity Feed</h6>
                      </div>
                      <span className="badge bg-light text-dark border">Live Log</span>
                    </div>

                    <div className="p-3">
                      <div className="d-flex flex-column gap-2.5">
                        {[
                          { time: '10m ago', text: 'Super Admin opened telemetry sync and inspected company quotas.', type: 'info' },
                          { time: '1h ago', text: 'Verified SPF/DKIM DNS record for custom domain helpdesk.kuwy.in.', type: 'success' },
                          { time: '3h ago', text: 'Onboarded client organization: Nexus Digital Enterprises (ID #3).', type: 'primary' },
                          { time: '5h ago', text: 'Automatic Microsoft Graph token renewal executed successfully.', type: 'success' },
                          { time: '1d ago', text: 'Platform automated daily backup verified to local storage pool.', type: 'secondary' },
                        ].map((act, idx) => (
                          <div key={idx} className="p-2.5 rounded-3 border-bottom d-flex align-items-start gap-2.5">
                            <span className="badge bg-light text-secondary border mt-0.5" style={{ fontSize: '0.68rem' }}>
                              {act.time}
                            </span>
                            <span className="small text-dark fw-medium">{act.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
                  <div className="enterprise-card-header bg-white border-bottom p-4">
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
                            <span className={`badge-status ${selectedCompanyDetail.status === 'ACTIVE' ? 'badge-resolved' : 'badge-urgent'}`}>
                              {selectedCompanyDetail.status}
                            </span>
                            <span className="badge bg-light text-dark border fw-bold">
                              {selectedCompanyDetail.planName}
                            </span>
                          </div>
                          <div className="text-muted small mt-1">
                            <code>{selectedCompanyDetail.subdomain}.kuwyhelp.com</code> • Custom Domain: <strong>{selectedCompanyDetail.customDomain || 'None configured'}</strong>
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
                          <span>Extend Trial (+14d)</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5 rounded-3 fw-semibold"
                          onClick={() => setShowChangePlanModal(selectedCompanyDetail)}
                        >
                          <Edit3 size={14} />
                          <span>Change Plan</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-warning text-dark d-flex align-items-center gap-1.5 rounded-3 fw-semibold shadow-xs"
                          onClick={() => setShowSupportSessionModal(selectedCompanyDetail)}
                        >
                          <Eye size={14} />
                          <span>Support Access (60m)</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 rounded-3"
                          onClick={() => setShowSuspendModal(selectedCompanyDetail)}
                        >
                          <Power size={14} />
                          <span>{selectedCompanyDetail.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 rounded-3"
                          onClick={() => setShowDeleteModal(selectedCompanyDetail)}
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-dark d-flex align-items-center gap-1 rounded-3 ms-2"
                          onClick={() => setSelectedCompanyDetail(null)}
                        >
                          <X size={14} />
                          <span>Close Inspector</span>
                        </button>
                      </div>
                    </div>

                    {/* Inspector Sub-Navigation (8 Detailed Tabs) */}
                    <div className="d-flex gap-2 mt-4 pt-3 border-top overflow-x-auto">
                      {(['overview', 'billing', 'usage', 'email', 'users', 'security', 'notes', 'audit'] as const).map(tab => (
                        <button
                          key={tab}
                          type="button"
                          className={`btn btn-sm px-3 rounded-pill fw-semibold ${companyDetailTab === tab ? 'btn-primary' : 'btn-light border-0 text-secondary'}`}
                          style={{ fontSize: '0.78rem' }}
                          onClick={() => setCompanyDetailTab(tab)}
                        >
                          {tab === 'overview' && '1. Overview'}
                          {tab === 'billing' && '2. Subscription & Billing'}
                          {tab === 'usage' && '3. Usage Metrics'}
                          {tab === 'email' && '4. Email Health'}
                          {tab === 'users' && '5. Users & Agents'}
                          {tab === 'security' && '6. Security & Abuse'}
                          {tab === 'notes' && '7. Staff Notes'}
                          {tab === 'audit' && '8. Audit Log'}
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
                            <div className="mb-2"><strong>Platform Subdomain:</strong> <code>{selectedCompanyDetail.subdomain}.kuwyhelp.com</code></div>
                            <div className="mb-2">
                              <strong>Custom Domain:</strong> {selectedCompanyDetail.customDomain ? (
                                <span className="badge bg-success-subtle text-success ms-1">
                                  {selectedCompanyDetail.customDomain} (SSL Active)
                                </span>
                              ) : <span className="text-muted">None</span>}
                            </div>
                            <div className="mb-2"><strong>Onboarded At:</strong> {new Date(selectedCompanyDetail.createdAt || Date.now()).toLocaleDateString()}</div>
                            <div>
                              <strong>Owner Work Email:</strong>{' '}
                              <code>
                                {unmaskedEmails[selectedCompanyDetail.id]
                                  ? (selectedCompanyDetail.ownerEmail || `admin@${selectedCompanyDetail.subdomain}.com`)
                                  : maskEmail(selectedCompanyDetail.ownerEmail || `admin@${selectedCompanyDetail.subdomain}.com`)}
                              </code>
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 ms-2 text-decoration-none"
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
                              <strong>Agent Seats Allocated:</strong> {selectedCompanyDetail.userCount} / {selectedCompanyDetail.maxAgents} seats
                            </div>
                            <div className="quota-bar mb-2">
                              <div
                                className="quota-bar-fill"
                                style={{ width: `${Math.min(100, Math.round((selectedCompanyDetail.userCount / Math.max(1, selectedCompanyDetail.maxAgents)) * 100))}%` }}
                              />
                            </div>
                            <div className="mb-2"><strong>Monthly Ticket Limit:</strong> 5,000 tickets/mo (Current: {selectedCompanyDetail.ticketCount})</div>
                            <div><strong>Trial Status:</strong> {selectedCompanyDetail.status === 'TRIAL' ? 'Active 14-day trial' : 'Paid recurring plan'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 2: Subscription & Billing */}
                  {companyDetailTab === 'billing' && (
                    <div className="p-4">
                      <div className="row g-4 mb-4">
                        <div className="col-12 col-md-4">
                          <div className="p-3 bg-light rounded-3 border">
                            <small className="text-muted fw-bold">Payment Gateway Customer</small>
                            <div className="fw-bold text-dark mt-1"><code>cus_razor_{selectedCompanyDetail.id}84912</code></div>
                            <small className="text-success fw-semibold">Auto-Debit Active</small>
                          </div>
                        </div>
                        <div className="col-12 col-md-4">
                          <div className="p-3 bg-light rounded-3 border">
                            <small className="text-muted fw-bold">Default Payment Method</small>
                            <div className="fw-bold text-dark mt-1">Visa •••• 4242</div>
                            <small className="text-muted">Expires 12/28</small>
                          </div>
                        </div>
                        <div className="col-12 col-md-4">
                          <div className="p-3 bg-light rounded-3 border">
                            <small className="text-muted fw-bold">Monthly Recurring Billing</small>
                            <div className="fw-bolder fs-5 text-success mt-1">
                              ₹{selectedCompanyDetail.planName === 'ENTERPRISE' ? '14,999' : selectedCompanyDetail.planName === 'PRO' ? '6,999' : '2,999'} / mo
                            </div>
                            <small className="text-muted">Next invoice due Dec 1, 2026</small>
                          </div>
                        </div>
                      </div>

                      <h6 className="fw-bold text-dark mb-2">Recent Invoice History</h6>
                      <div className="table-responsive border rounded-3">
                        <table className="table table-sm align-middle mb-0">
                          <thead className="table-light">
                            <tr>
                              <th className="ps-3">Invoice #</th>
                              <th>Date</th>
                              <th>Amount</th>
                              <th>Status</th>
                              <th className="text-end pe-3">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="ps-3"><code>INV-2026-1101</code></td>
                              <td>Nov 1, 2026</td>
                              <td>₹14,999</td>
                              <td><span className="badge bg-success-subtle text-success">PAID</span></td>
                              <td className="text-end pe-3">
                                <button type="button" className="btn btn-xs btn-outline-secondary py-0.5 px-2 rounded-2 me-1">
                                  <Download size={12} className="me-1" /> PDF
                                </button>
                                <button type="button" className="btn btn-xs btn-outline-danger py-0.5 px-2 rounded-2">
                                  Refund
                                </button>
                              </td>
                            </tr>
                            <tr>
                              <td className="ps-3"><code>INV-2026-1001</code></td>
                              <td>Oct 1, 2026</td>
                              <td>₹14,999</td>
                              <td><span className="badge bg-success-subtle text-success">PAID</span></td>
                              <td className="text-end pe-3">
                                <button type="button" className="btn btn-xs btn-outline-secondary py-0.5 px-2 rounded-2">
                                  <Download size={12} className="me-1" /> PDF
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 3: Usage Metrics */}
                  {companyDetailTab === 'usage' && (
                    <div className="p-4">
                      <div className="row g-3">
                        <div className="col-md-3">
                          <div className="p-3 bg-light rounded-3 border text-center">
                            <div className="fs-4 fw-bolder text-primary">{selectedCompanyDetail.ticketCount}</div>
                            <small className="text-muted">Total Tickets Logged</small>
                          </div>
                        </div>
                        <div className="col-md-3">
                          <div className="p-3 bg-light rounded-3 border text-center">
                            <div className="fs-4 fw-bolder text-success">98.4%</div>
                            <small className="text-muted">SLA Compliance Rate</small>
                          </div>
                        </div>
                        <div className="col-md-3">
                          <div className="p-3 bg-light rounded-3 border text-center">
                            <div className="fs-4 fw-bolder text-info">420 MB</div>
                            <small className="text-muted">Attachment Storage</small>
                          </div>
                        </div>
                        <div className="col-md-3">
                          <div className="p-3 bg-light rounded-3 border text-center">
                            <div className="fs-4 fw-bolder text-dark">18,420</div>
                            <small className="text-muted">Monthly API Hits</small>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 4: Email Health */}
                  {companyDetailTab === 'email' && (
                    <div className="p-4">
                      <div className="p-3 bg-light rounded-3 border mb-3">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="fw-bold text-dark">Domain Inbound & Outbound Deliverability Status</span>
                          <span className="badge bg-success">HEALTHY</span>
                        </div>
                        <div className="row g-3">
                          <div className="col-md-4">
                            <small className="text-muted d-block">SPF & DKIM Status</small>
                            <span className="fw-bold text-success">Verified & Passing</span>
                          </div>
                          <div className="col-md-4">
                            <small className="text-muted d-block">Bounce Rate (30d)</small>
                            <span className="fw-bold text-dark">0.12% (Threshold: &lt; 2.0%)</span>
                          </div>
                          <div className="col-md-4">
                            <small className="text-muted d-block">Spam Complaint Rate</small>
                            <span className="fw-bold text-dark">0.00%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 5: Users & Agents */}
                  {companyDetailTab === 'users' && (
                    <div className="p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="fw-bold text-dark mb-0">Assigned Staff Members & Agents</h6>
                        <span className="badge bg-light text-dark border">
                          {users.filter(u => (u as any).company?.id === selectedCompanyDetail.id).length} Active Credentials
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
                                <td><span className="badge bg-success-subtle text-success">Enforced</span></td>
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
                      <div className="p-3 bg-light rounded-3 border">
                        <div className="fw-bold text-dark mb-1">Security Audit & Risk Assessment</div>
                        <p className="text-muted small mb-2">Zero active abuse flags or security warnings detected for this organization.</p>
                        <div className="row g-2">
                          <div className="col-md-4">
                            <small className="text-muted d-block">Failed Login Spikes (24h)</small>
                            <span className="fw-bold text-success">0 Incidents</span>
                          </div>
                          <div className="col-md-4">
                            <small className="text-muted d-block">IP Allow-Listing</small>
                            <span className="fw-bold text-dark">Permissive / Multi-Office</span>
                          </div>
                          <div className="col-md-4">
                            <small className="text-muted d-block">Mandatory 2FA Policy</small>
                            <span className="fw-bold text-success">Enabled for Administrators</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 7: Staff Notes */}
                  {companyDetailTab === 'notes' && (
                    <div className="p-4">
                      <h6 className="fw-bold text-dark mb-2">Internal Staff Notes (Super Admin Only)</h6>
                      <p className="text-muted small mb-3">Notes here are strictly confidential and invisible to the client organization.</p>

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
                          Add Note
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 8: Audit Log */}
                  {companyDetailTab === 'audit' && (
                    <div className="p-4">
                      <h6 className="fw-bold text-dark mb-3">Super Admin Actions Logged on this Organization</h6>
                      <div className="d-flex flex-column gap-2">
                        <div className="p-2.5 bg-light rounded-3 border d-flex justify-content-between align-items-center">
                          <div>
                            <span className="fw-bold text-dark small">Workspace Created</span>
                            <div className="text-muted small">Initial tenant partition initialized by Super Admin</div>
                          </div>
                          <span className="text-muted small">{new Date(selectedCompanyDetail.createdAt || Date.now()).toLocaleDateString()}</span>
                        </div>
                        <div className="p-2.5 bg-light rounded-3 border d-flex justify-content-between align-items-center">
                          <div>
                            <span className="fw-bold text-dark small">Agent Quota Adjusted</span>
                            <div className="text-muted small">Configured quota to {selectedCompanyDetail.maxAgents} seats</div>
                          </div>
                          <span className="text-muted small">Automatic</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Screen 41a: Dense Companies List */}
              <div className="enterprise-card">
                <div className="enterprise-card-header">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <div className="input-group input-group-sm" style={{ width: '280px' }}>
                      <span className="input-group-text bg-white border-end-0">
                        <Search size={14} className="text-muted" />
                      </span>
                      <input
                        type="text"
                        className="form-control border-start-0"
                        placeholder="Search company, code, subdomain..."
                        value={compSearch}
                        onChange={e => setCompSearch(e.target.value)}
                      />
                    </div>

                    {/* Status Filter */}
                    <div className="d-flex gap-1">
                      {['ALL', 'ACTIVE', 'TRIAL', 'SUSPENDED'].map(st => (
                        <button
                          key={st}
                          type="button"
                          className={`btn btn-sm px-2.5 rounded-pill fw-semibold ${compStatusFilter === st ? 'btn-primary' : 'btn-outline-secondary'}`}
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => setCompStatusFilter(st)}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {/* Plan Filter */}
                    <select
                      className="form-select form-select-sm"
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
                      style={{ width: '140px', fontSize: '0.75rem' }}
                      value={compHealthFilter}
                      onChange={e => setCompHealthFilter(e.target.value)}
                    >
                      <option value="ALL">All Health</option>
                      <option value="HEALTHY">Healthy</option>
                      <option value="NEAR_LIMIT">Near Limit (&gt;85%)</option>
                      <option value="AT_RISK">At Risk / Suspended</option>
                    </select>
                  </div>

                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 rounded-3"
                      onClick={() => {
                        // Export CSV simulation
                        const csvContent = "data:text/csv;charset=utf-8," +
                          "ID,Name,Code,Subdomain,Plan,Status,Agents\n" +
                          companies.map(c => `${c.id},"${c.name}",${c.companyCode},${c.subdomain},${c.planName},${c.status},${c.userCount}/${c.maxAgents}`).join("\n");
                        const encodedUri = encodeURI(csvContent);
                        const link = document.createElement("a");
                        link.setAttribute("href", encodedUri);
                        link.setAttribute("download", `kuwy_companies_export_${Date.now()}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                    >
                      <Download size={13} />
                      <span>Export CSV</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 px-3 py-1.5 rounded-3 fw-semibold shadow-sm"
                      onClick={() => setShowNewCompanyModal(true)}
                    >
                      <Plus size={15} />
                      <span>Onboard Organization</span>
                    </button>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-enterprise align-middle mb-0">
                    <thead>
                      <tr>
                        <th className="ps-4">Organization & Domain</th>
                        <th>Plan & MRR</th>
                        <th>Status</th>
                        <th>Owner Email (Privacy)</th>
                        <th>Agent Quota</th>
                        <th>Tickets (mo)</th>
                        <th>Health Flag</th>
                        <th className="text-end pe-4">Safety Actions</th>
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
                                    <code>{comp.subdomain}.kuwyhelp.com</code>
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td>
                              <div>
                                <span className="badge bg-light text-dark border fw-bold" style={{ fontSize: '0.72rem' }}>
                                  {comp.planName}
                                </span>
                                <div className="small text-success fw-semibold mt-0.5">
                                  ₹{comp.planName === 'ENTERPRISE' ? '14,999' : comp.planName === 'PRO' ? '6,999' : '2,999'}/mo
                                </div>
                              </div>
                            </td>

                            <td>
                              <span className={`badge-status ${comp.status === 'ACTIVE' ? 'badge-resolved' : 'badge-urgent'}`}>
                                <span className={`pulse-dot ${comp.status === 'ACTIVE' ? 'pulse-dot-success' : 'pulse-dot-danger'}`} />
                                <span>{comp.status}</span>
                              </span>
                            </td>

                            <td>
                              <div className="d-flex align-items-center gap-1.5">
                                <code style={{ fontSize: '0.75rem' }}>
                                  {unmaskedEmails[comp.id]
                                    ? (comp.ownerEmail || `admin@${comp.subdomain}.com`)
                                    : maskEmail(comp.ownerEmail || `admin@${comp.subdomain}.com`)}
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
                                  {isHealthGood ? 'Healthy' : isHealthWarn ? 'Near Limit' : isHealthCrit ? 'Suspended' : 'Unknown'}
                                </small>
                              </div>
                            </td>

                            <td className="text-end pe-4">
                              <div className="d-flex justify-content-end align-items-center gap-1">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary py-1 px-2 rounded-2"
                                  onClick={() => {
                                    setSelectedCompanyDetail(comp);
                                    setCompanyDetailTab('overview');
                                  }}
                                  title="Inspect full company details & sub-tabs"
                                >
                                  <Eye size={13} />
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-sm btn-warning text-dark py-1 px-2 rounded-2"
                                  onClick={() => setShowSupportSessionModal(comp)}
                                  title="Start 60-minute Consent Support Session"
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
                    </tbody>
                  </table>
                </div>
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
                  <h6 className="fw-bold mb-0 text-dark">Platform Plans, Quotas & Entitlements</h6>
                  <small className="text-muted">Configure subscription tiers, feature flags, coupon codes & grandfathering rules</small>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1 rounded-3 fw-semibold"
                    onClick={() => setShowNewCouponModal(true)}
                  >
                    <Tag size={14} />
                    <span>+ New Coupon Campaign</span>
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
                    <span>Create New Plan</span>
                  </button>
                </div>
              </div>

              {/* Screen 42a: Plans List Table */}
              <div className="enterprise-card mb-4">
                <div className="enterprise-card-header">
                  <h6 className="fw-bold mb-0">Subscription Tiers & Packaging</h6>
                  <span className="badge bg-light text-dark border">4 Active Tiers</span>
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
                        <th>Subscribed Companies</th>
                        <th>Plan MRR</th>
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
                              {p.companiesCount || 1} Tenants
                            </span>
                          </td>

                          <td>
                            <span className="fw-bold text-success">
                              ₹{((p.priceMonthlyInr || 0) * (p.companiesCount || 1)).toLocaleString()}/mo
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
                                <span>Edit Quotas</span>
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
                        <h6 className="fw-bold mb-0">Active Promotional Coupons & Discount Codes</h6>
                      </div>
                      <span className="badge bg-primary-subtle text-primary">{coupons.length} Active</span>
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
                              <td><small className="text-dark fw-bold">{c.redemptionCount} / {c.maxRedemptions}</small></td>
                              <td className="text-end pe-3">
                                <span className="badge bg-success">ACTIVE</span>
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
                        Choose how platform plan and pricing modifications impact existing paying tenant organizations.
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
                          Grandfather Existing Subscribers (Recommended)
                          <small className="text-muted d-block fw-normal mt-0.5">
                            New pricing and quota limits only apply to new sign-ups. Existing client organizations retain their current billing rates indefinitely.
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
                          Migrate Existing on Renewal (30-day Notice)
                          <small className="text-muted d-block fw-normal mt-0.5">
                            Subscribers will receive an automated email notice and update to the revised pricing on their next billing cycle renewal date.
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
              {/* Emergency Outbound Killswitch Banner */}
              <div className={`p-3 rounded-3 mb-4 d-flex justify-content-between align-items-center flex-wrap gap-3 ${emergencyOutboundPaused ? 'bg-danger text-white' : 'bg-light border text-dark'}`}>
                <div className="d-flex align-items-center gap-2.5">
                  <ShieldAlert size={22} className={emergencyOutboundPaused ? 'text-white' : 'text-danger'} />
                  <div>
                    <h6 className="fw-bold mb-0">Emergency Platform Outbound Email Kill-Switch</h6>
                    <small className={emergencyOutboundPaused ? 'text-white text-opacity-75' : 'text-muted'}>
                      {emergencyOutboundPaused
                        ? 'EMERGENCY PAUSE ACTIVE: Outbound delivery is suspended platform-wide to protect IP reputation. Inbound ingestion continues.'
                        : 'Outbound mail relays operational. Use this panic button in case of mass spam or phishing compromise.'}
                    </small>
                  </div>
                </div>

                <button
                  type="button"
                  className={`btn btn-sm px-4 fw-bold shadow-xs ${emergencyOutboundPaused ? 'btn-light text-danger' : 'btn-danger'}`}
                  onClick={() => {
                    const newState = !emergencyOutboundPaused;
                    setEmergencyOutboundPaused(newState);
                    setAlertNotice({
                      type: newState ? 'danger' : 'success',
                      message: newState ? 'EMERGENCY: Platform outbound email has been PAUSED.' : 'Platform outbound email has been RESUMED.',
                    });
                  }}
                >
                  {emergencyOutboundPaused ? 'Resume Outbound Email' : 'Pause All Outbound Email'}
                </button>
              </div>

              {/* Sub-Section 43a: Global Platform Settings */}
              <div className="row g-4 mb-4">
                <div className="col-12 col-xl-6">
                  <div className="enterprise-card h-100">
                    <div className="enterprise-card-header">
                      <div className="d-flex align-items-center gap-2">
                        <Settings size={18} className="text-primary" />
                        <h6 className="fw-bold mb-0">Platform Settings & Onboarding Controls</h6>
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
                          When active, only Super Admins can log in; workspaces show a maintenance banner.
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
                        <h6 className="fw-bold mb-0">Disposable Email Filter & Broadcast Notice</h6>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="mb-4">
                        <label className="form-label small fw-bold text-dark">
                          Blocked Disposable Email Domains (Prevents Spam Sign-Ups)
                        </label>
                        <div className="d-flex flex-wrap gap-1.5 mb-2">
                          {blockedDomains.map((dom, i) => (
                            <span key={i} className="badge bg-light text-dark border d-flex align-items-center gap-1 px-2.5 py-1">
                              <span>{dom}</span>
                              <button
                                type="button"
                                className="btn-close btn-close-sm p-0 ms-1"
                                style={{ fontSize: '0.6rem' }}
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
                          Displays a sticky notification banner at the top of every tenant admin workspace.
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
                    <h6 className="fw-bold mb-0">Abuse Reports Queue & Platform Blocklist</h6>
                  </div>
                  <span className="badge bg-danger-subtle text-danger fw-bold">{abuseReports.length} Flagged</span>
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
                    </tbody>
                  </table>
                </div>

                {/* Platform-Wide Blocked IPs Section (Screen 43c) */}
                <div className="p-4 border-top bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-2.5 flex-wrap gap-2">
                    <div>
                      <h6 className="fw-bold mb-0 text-dark small">Platform-Wide Edge Blocked IP Addresses</h6>
                      <small className="text-muted">Requests from these IPs are rejected at the edge gateway before reaching tenant partitions.</small>
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
                        Ban IP
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
                                setNewPasswordVal('Password@123');
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
        <div className="modal show d-block modal-backdrop-blur">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-success text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Clock size={20} />
                  <h5 className="modal-title fw-bold text-white mb-0">Extend Trial: {showExtendTrialModal.name}</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowExtendTrialModal(null)}
                ></button>
              </div>

              <form onSubmit={handleExtendTrialSubmit}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Evaluation Days to Add</label>
                    <select
                      className="form-select"
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
                    Apply Trial Extension
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 2. Change Plan Modal (Proration Preview) */}
      {showChangePlanModal && (
        <div className="modal show d-block modal-backdrop-blur">
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
                      value={newPlanTarget}
                      onChange={e => setNewPlanTarget(e.target.value)}
                    >
                      <option value="STARTER">Growth Starter (₹2,999/mo • 5 Agents)</option>
                      <option value="PRO">Scale Professional (₹6,999/mo • 15 Agents)</option>
                      <option value="ENTERPRISE">Corporate Enterprise (₹14,999/mo • 50 Agents)</option>
                    </select>
                  </div>

                  <div className="p-3 bg-light rounded-3 border mb-3">
                    <div className="d-flex justify-content-between align-items-center small mb-1">
                      <span className="text-muted">Prorated Net Adjustment:</span>
                      <strong className="text-success">+ ₹2,400 immediate charge</strong>
                    </div>
                    <div className="d-flex justify-content-between align-items-center small">
                      <span className="text-muted">Effective Date:</span>
                      <strong>Immediate (live upgrade)</strong>
                    </div>
                  </div>

                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="prorateCheck"
                      checked={planChangeProrate}
                      onChange={e => setPlanChangeProrate(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="prorateCheck">
                      Prorate remaining billing cycle balance automatically
                    </label>
                  </div>
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
                    Confirm Plan Migration
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 3. Suspend / Unsuspend Modal (Required Reason) */}
      {showSuspendModal && (
        <div className="modal show d-block modal-backdrop-blur">
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
                  onClick={() => setShowSuspendModal(null)}
                ></button>
              </div>

              <form onSubmit={handleSuspendSubmit}>
                <div className="modal-body p-4">
                  <p className="text-dark small">
                    Target: <strong>{showSuspendModal.name}</strong> (<code>{showSuspendModal.subdomain}</code>)
                  </p>
                  <p className="text-muted small">
                    Suspension stops all staff & customer logins and locks ticket editing. Inbound emails will be queued safely.
                  </p>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Administrative Reason (Required for Audit)</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      required
                      placeholder="e.g. Non-payment after repeated reminders, or breach of terms of service..."
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
                  <button type="submit" className="btn btn-danger btn-sm fw-semibold px-4">
                    Apply Suspension State
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 4. Support Session Impersonation Modal (Consent-Based 60-min Session) */}
      {showSupportSessionModal && (
        <div className="modal show d-block modal-backdrop-blur">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-warning text-dark py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <ShieldAlert size={20} />
                  <h5 className="modal-title fw-bold mb-0">Start Support Impersonation Session</h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowSupportSessionModal(null)}
                ></button>
              </div>

              <form onSubmit={handleStartSupportSession}>
                <div className="modal-body p-4">
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
                  <button type="submit" className="btn btn-warning btn-sm fw-bold px-4 text-dark shadow-xs">
                    Start 60-Minute Support Session
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 5. Soft Delete Modal (Typing Company Name Confirmation) */}
      {showDeleteModal && (
        <div className="modal show d-block modal-backdrop-blur">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-danger text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Trash2 size={20} />
                  <h5 className="modal-title fw-bold text-white mb-0">Confirm Company Soft Deletion</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowDeleteModal(null)}
                ></button>
              </div>

              <form onSubmit={handleDeleteCompanySubmit}>
                <div className="modal-body p-4">
                  <div className="alert alert-danger py-2.5 px-3 small mb-3">
                    <strong>CAUTION:</strong> This will place <strong>{showDeleteModal.name}</strong> into a 30-day grace recovery hold, after which all tenant partitions will be permanently purged.
                  </div>

                  <p className="text-dark small mb-2">
                    To prevent accidental deletion, please type the full company name <code>{showDeleteModal.name}</code> below:
                  </p>

                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder={showDeleteModal.name}
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
                    Permanently Soft-Delete
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 6. Plan Editor Modal (Screen 42b) */}
      {showPlanEditorModal && (
        <div className="modal show d-block modal-backdrop-blur">
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-dark text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Sliders size={20} className="text-warning" />
                  <h5 className="modal-title fw-bold text-white mb-0">Plan Editor: {showPlanEditorModal.name}</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowPlanEditorModal(null)}
                ></button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                setAlertNotice({ type: 'success', message: `Plan '${showPlanEditorModal.name}' entitlements and quotas saved.` });
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
                    Save Plan Configurations
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 7. New Coupon Modal (Screen 42c) */}
      {showNewCouponModal && (
        <div className="modal show d-block modal-backdrop-blur">
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
                    Create Coupon Campaign
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 8. Onboard New Company Modal */}
      {showNewCompanyModal && (
        <div className="modal show d-block modal-backdrop-blur">
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-dark text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Building2 size={20} className="text-warning" />
                  <h5 className="modal-title fw-bold text-white mb-0">Onboard New Organization / Company</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowNewCompanyModal(false)}
                ></button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
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
                  loadAdminData();
                } catch (err: any) {
                  setAlertNotice({ type: 'danger', message: err.response?.data?.error || err.message || 'Failed to create company' });
                }
              }}>
                <div className="modal-body p-4">
                  <h6 className="fw-bold text-primary mb-3 border-bottom pb-2">1. Company Profile & Subdomain</h6>
                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Company Full Name</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. Tata Motors Financial Services"
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
                        value={newCompSubdomain}
                        onChange={e => setNewCompSubdomain(e.target.value.toLowerCase())}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Service Plan</label>
                      <select
                        className="form-select"
                        value={newCompPlan}
                        onChange={e => setNewCompPlan(e.target.value)}
                      >
                        <option value="STARTER">Starter Plan (₹2,999/mo)</option>
                        <option value="PRO">Professional Plan (₹6,999/mo)</option>
                        <option value="ENTERPRISE">Enterprise Plan (₹14,999/mo)</option>
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Max Support Agents Quota</label>
                      <input
                        type="number"
                        className="form-control"
                        min={1}
                        max={500}
                        value={newCompMaxAgents}
                        onChange={e => setNewCompMaxAgents(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <h6 className="fw-bold text-success mb-3 border-bottom pb-2">
                    2. Initial Company Administrator Login Credential
                  </h6>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Admin First Name</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. Rajesh"
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
                        value={newCompAdminEmail}
                        onChange={e => setNewCompAdminEmail(e.target.value)}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Initial Password</label>
                      <input
                        type="text"
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
                    onClick={() => setShowNewCompanyModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-semibold px-4">
                    Create Company & Admin Account
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 9. Issue Credential Modal */}
      {showNewCredModal && (
        <div className="modal show d-block modal-backdrop-blur">
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
                  onClick={() => setShowNewCredModal(false)}
                ></button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
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
                  loadAdminData();
                } catch (err: any) {
                  setAlertNotice({ type: 'danger', message: err.response?.data?.error || err.message || 'Failed to create credential' });
                }
              }}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Target Organization / Company</label>
                    <select
                      className="form-select"
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
                      value={credEmail}
                      onChange={e => setCredEmail(e.target.value)}
                    />
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label fw-semibold small">Role / Access Level</label>
                      <select
                        className="form-select"
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
                        type="text"
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
                      type="text"
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
                    onClick={() => setShowNewCredModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-semibold px-4">
                    Issue Login Credential
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 10. Reset Password Modal */}
      {showResetPasswordModal && (
        <div className="modal show d-block modal-backdrop-blur">
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
                  setNewPasswordVal('Password@123');
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
                      type="text"
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
        </div>
      )}
    </div>
  );
};
