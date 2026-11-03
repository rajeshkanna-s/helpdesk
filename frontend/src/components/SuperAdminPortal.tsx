import React, { useState, useEffect } from 'react';
import {
  Building2, ShieldCheck, Users, Ticket as TicketIcon, Plus, Power,
  KeyRound, RefreshCw, LogOut, ArrowRight, CheckCircle2,
  AlertCircle, Edit3, Settings, ShieldAlert, LayoutDashboard,
  Database, Globe, Search, Layers, Lock, Server, Mail,
  FileSpreadsheet, BarChart3, ChevronRight, Activity
} from 'lucide-react';
import { apiService } from '../services/api';
import type { AdminOverview, CompanyDetail, User, AuthUser } from '../types';

export type WorkspaceTab = 'tickets' | 'dashboard' | 'mailboxes' | 'mis' | 'engineers';

interface SuperAdminPortalProps {
  currentUser: AuthUser;
  onLogout: () => void;
  onSwitchToCompany: (companyId: number, initialTab?: WorkspaceTab) => void;
}

type AdminMenuSection = 'overview' | 'companies' | 'credentials' | 'workspaces' | 'system';

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  currentUser,
  onLogout,
  onSwitchToCompany,
}) => {
  const [activeMenu, setActiveMenu] = useState<AdminMenuSection>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [companies, setCompanies] = useState<CompanyDetail[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [alertNotice, setAlertNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null);

  // Search & Filter states for Companies & Credentials
  const [compSearch, setCompSearch] = useState('');
  const [compStatusFilter, setCompStatusFilter] = useState<string>('ALL');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [userCompanyFilter, setUserCompanyFilter] = useState<string>('ALL');

  // Modals state
  const [showNewCompanyModal, setShowNewCompanyModal] = useState(false);
  const [showNewCredModal, setShowNewCredModal] = useState(false);
  const [showEditLimitsModal, setShowEditLimitsModal] = useState<CompanyDetail | null>(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<User | null>(null);

  // New Company Form
  const [newCompName, setNewCompName] = useState('');
  const [newCompCode, setNewCompCode] = useState('');
  const [newCompSubdomain, setNewCompSubdomain] = useState('');
  const [newCompPlan, setNewCompPlan] = useState('ENTERPRISE');
  const [newCompMaxAgents, setNewCompMaxAgents] = useState(30);
  const [newCompAdminFirst, setNewCompAdminFirst] = useState('');
  const [newCompAdminLast, setNewCompAdminLast] = useState('');
  const [newCompAdminEmail, setNewCompAdminEmail] = useState('');
  const [newCompAdminPassword, setNewCompAdminPassword] = useState('Password@123');

  // New Credential Form
  const [credCompanyId, setCredCompanyId] = useState<number>(1);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('Password@123');
  const [credFirstName, setCredFirstName] = useState('');
  const [credLastName, setCredLastName] = useState('');
  const [credPhone, setCredPhone] = useState('');
  const [credRoleType, setCredRoleType] = useState('AGENT');

  // Edit Limits Form
  const [editPlan, setEditPlan] = useState('');
  const [editMaxAgents, setEditMaxAgents] = useState(50);

  // Reset Password Form
  const [newPasswordVal, setNewPasswordVal] = useState('Password@123');

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const [overviewData, companiesData, usersData] = await Promise.all([
        apiService.getAdminOverview(),
        apiService.getAdminCompanies(),
        apiService.getAdminUsers(),
      ]);
      setOverview(overviewData);
      setCompanies(companiesData);
      setUsers(usersData);
      if (companiesData.length > 0 && !credCompanyId) {
        setCredCompanyId(companiesData[0].id);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleCompanyStatus = async (company: CompanyDetail) => {
    const targetStatus = company.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await apiService.updateCompanyStatus(company.id, targetStatus);
      setAlertNotice({
        type: 'success',
        message: `Company ${company.name} (${company.companyCode}) status changed to ${targetStatus}.`,
      });
      loadAdminData();
    } catch (err: any) {
      setAlertNotice({ type: 'danger', message: err.message || 'Failed to update company status' });
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
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
  };

  const handleCreateCredential = async (e: React.FormEvent) => {
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
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditLimitsModal) return;
    try {
      await apiService.updateCompanyLimits(showEditLimitsModal.id, editPlan, editMaxAgents);
      setAlertNotice({
        type: 'success',
        message: `Updated quotas and plan for ${showEditLimitsModal.name}.`,
      });
      setShowEditLimitsModal(null);
      loadAdminData();
    } catch (err: any) {
      setAlertNotice({ type: 'danger', message: err.message || 'Failed to update limits' });
    }
  };

  const handleToggleUserActive = async (user: User) => {
    try {
      await apiService.toggleUserActive(user.id);
      setAlertNotice({
        type: 'success',
        message: `Account status updated for ${user.displayName}.`,
      });
      loadAdminData();
    } catch (err: any) {
      setAlertNotice({ type: 'danger', message: err.message || 'Failed to update user' });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
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
  };

  // Filtered lists
  const filteredCompanies = companies.filter(c => {
    const matchesStatus = compStatusFilter === 'ALL' || c.status === compStatusFilter;
    const matchesSearch = !compSearch.trim() ||
      c.name.toLowerCase().includes(compSearch.toLowerCase()) ||
      c.companyCode.toLowerCase().includes(compSearch.toLowerCase()) ||
      c.subdomain.toLowerCase().includes(compSearch.toLowerCase());
    return matchesStatus && matchesSearch;
  });

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
      title: 'Executive Platform Overview',
      subtitle: 'Real-time cross-tenant telemetry, organization health, and quick administration actions',
    },
    companies: {
      title: 'Organizations & Multi-Tenant Directory',
      subtitle: 'Onboard client organizations, configure agent quotas, and control tenant activation state',
    },
    credentials: {
      title: 'Identity, Roles & Login Credentials',
      subtitle: 'Provision administrator and support engineer accounts across all registered organizations',
    },
    workspaces: {
      title: 'Tenant Workspaces & Queue Launcher',
      subtitle: 'Inspect and launch straight into any organization’s live HelpDesk modules',
    },
    system: {
      title: 'System Architecture, Security & Database',
      subtitle: 'MySQL multi-tenant schema diagnostics, Microsoft 365 Graph engine, and RBAC policies',
    },
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
            </div>
          </div>

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
              <span>Executive Overview</span>
            </button>

            <button
              type="button"
              className={`sidebar-menu-btn ${activeMenu === 'companies' ? 'admin-active' : ''}`}
              onClick={() => setActiveMenu('companies')}
            >
              <Building2 size={18} />
              <span>Organizations & Tenants</span>
              <span className="sidebar-badge">{companies.length}</span>
            </button>

            <button
              type="button"
              className={`sidebar-menu-btn ${activeMenu === 'credentials' ? 'admin-active' : ''}`}
              onClick={() => setActiveMenu('credentials')}
            >
              <KeyRound size={18} />
              <span>Login Credentials</span>
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
            <span>HelpDesk Modules</span>
            <span className="badge bg-dark text-secondary border border-secondary border-opacity-25" style={{ fontSize: '0.6rem' }}>
              Direct Jump
            </span>
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

            <button
              type="button"
              className="sidebar-menu-btn"
              onClick={() => onSwitchToCompany(companies[0]?.id || 1, 'dashboard')}
            >
              <BarChart3 size={17} className="text-primary" />
              <span>SLA & Analytics</span>
              <ChevronRight size={14} className="ms-auto opacity-50" />
            </button>

            <button
              type="button"
              className="sidebar-menu-btn"
              onClick={() => onSwitchToCompany(companies[0]?.id || 1, 'mailboxes')}
            >
              <Mail size={17} className="text-info" />
              <span>MS 365 Exchange Mail</span>
              <ChevronRight size={14} className="ms-auto opacity-50" />
            </button>
          </div>

          {/* SECTION 3: ACTIVE TENANT SWITCHER */}
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

        {/* Sidebar Footer: DB Status & Admin Profile */}
        <div className="sidebar-footer">
          <div className="p-2.5 rounded-3 mb-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="d-flex align-items-center justify-content-between mb-1">
              <div className="d-flex align-items-center gap-1.5">
                <span className="pulse-dot pulse-dot-success" style={{ width: '7px', height: '7px' }}></span>
                <span className="fw-bold text-white" style={{ fontSize: '0.74rem' }}>MySQL 8.0 Connected</span>
              </div>
              <span className="badge bg-success bg-opacity-25 text-success" style={{ fontSize: '0.62rem' }}>:3306</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
              DB: <code className="text-info">kuwy_helpdesk</code> • Multi-Tenant
            </div>
          </div>

          <div className="d-flex align-items-center justify-content-between pt-1">
            <div className="d-flex align-items-center gap-2 overflow-hidden">
              <div
                className="rounded-circle bg-warning text-dark fw-bold d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}
              >
                {currentUser.firstName?.charAt(0) || 'P'}
              </div>
              <div className="overflow-hidden" style={{ lineHeight: '1.2' }}>
                <div className="fw-bold text-white text-truncate" style={{ fontSize: '0.78rem' }}>
                  {currentUser.displayName}
                </div>
                <small className="text-warning d-block text-truncate" style={{ fontSize: '0.66rem', fontWeight: 600 }}>
                  {currentUser.email}
                </small>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger border-0 p-1.5 text-danger"
              onClick={onLogout}
              title="Sign Out"
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
              <span>Issue Login Credential</span>
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
              <span>Open HelpDesk Queue</span>
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

          {/* Global KPI Row (Shown on Overview, Companies, and Credentials) */}
          {overview && (activeMenu === 'overview' || activeMenu === 'companies' || activeMenu === 'credentials') && (
            <div className="row g-3 mb-4">
              <div className="col-12 col-sm-6 col-xl-3">
                <div className="stat-card h-100" onClick={() => setActiveMenu('companies')} style={{ cursor: 'pointer' }}>
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                        Registered Tenants
                      </small>
                      <h3 className="fw-bolder mb-1 mt-1">{overview.totalCompanies}</h3>
                      <div className="d-flex align-items-center gap-1.5 small text-success fw-bold">
                        <span className="pulse-dot pulse-dot-success"></span>
                        <span>{overview.activeCompanies} Active</span>
                        {overview.suspendedCompanies > 0 && (
                          <span className="text-danger ms-1">• {overview.suspendedCompanies} Suspended</span>
                        )}
                      </div>
                    </div>
                    <div className="stat-icon bg-primary-subtle text-primary">
                      <Building2 size={24} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-sm-6 col-xl-3">
                <div className="stat-card h-100" onClick={() => onSwitchToCompany(companies[0]?.id || 1, 'tickets')} style={{ cursor: 'pointer' }}>
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                        Cross-Tenant Tickets
                      </small>
                      <h3 className="fw-bolder mb-1 mt-1">{overview.totalTickets}</h3>
                      <small className="text-muted">Tracked across all departments</small>
                    </div>
                    <div className="stat-icon bg-info-subtle text-info">
                      <TicketIcon size={24} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-sm-6 col-xl-3">
                <div className="stat-card h-100" onClick={() => setActiveMenu('credentials')} style={{ cursor: 'pointer' }}>
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                        Total Support Staff
                      </small>
                      <h3 className="fw-bolder mb-1 mt-1">{overview.totalAgents}</h3>
                      <small className="text-muted">Admins & Category Engineers</small>
                    </div>
                    <div className="stat-icon bg-success-subtle text-success">
                      <Users size={24} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-sm-6 col-xl-3">
                <div className="stat-card h-100" onClick={() => setActiveMenu('system')} style={{ cursor: 'pointer' }}>
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                        Platform Infrastructure
                      </small>
                      <div className="d-flex align-items-center gap-1.5 mt-2">
                        <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1">
                          <span className="pulse-dot pulse-dot-success" style={{ width: '6px', height: '6px' }}></span>
                          <span>HEALTHY</span>
                        </span>
                        <span className="badge bg-primary-subtle text-primary border border-primary-subtle">MySQL :3306</span>
                      </div>
                      <small className="text-muted d-block mt-1">Strict Tenant Isolation</small>
                    </div>
                    <div className="stat-icon bg-warning-subtle text-warning">
                      <ShieldCheck size={24} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              MENU 1: EXECUTIVE OVERVIEW
              ================================================================ */}
          {activeMenu === 'overview' && (
            <div className="row g-4">
              {/* Left Column: Active Organizations Summary */}
              <div className="col-12 col-xl-7">
                <div className="enterprise-card h-100">
                  <div className="enterprise-card-header">
                    <div>
                      <h6 className="fw-bold mb-0">Registered Tenant Organizations</h6>
                      <small className="text-muted">Multi-company isolation & live utilization</small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary rounded-3 fw-semibold"
                      onClick={() => setActiveMenu('companies')}
                    >
                      Manage All Tenants
                    </button>
                  </div>
                  <div className="p-3">
                    {companies.map(comp => (
                      <div
                        key={comp.id}
                        className="p-3 rounded-3 border mb-2.5 d-flex flex-wrap justify-content-between align-items-center gap-3 bg-white hover-shadow"
                      >
                        <div className="d-flex align-items-center gap-3">
                          <div
                            className="rounded-3 d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
                            style={{
                              width: '44px',
                              height: '44px',
                              backgroundColor: comp.primaryColor || '#2563eb',
                              fontSize: '0.9rem',
                            }}
                          >
                            {comp.companyCode.slice(0, 3)}
                          </div>
                          <div>
                            <div className="d-flex align-items-center gap-2">
                              <h6 className="fw-bold mb-0 text-dark">{comp.name}</h6>
                              <span className={`badge-status ${comp.status === 'ACTIVE' ? 'badge-resolved' : 'badge-urgent'}`}>
                                {comp.status}
                              </span>
                            </div>
                            <div className="text-muted small mt-0.5">
                              <code className="text-primary">{comp.subdomain}.kuwyhelp.com</code> • Plan: <strong>{comp.planName}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="d-flex align-items-center gap-3">
                          <div className="text-end">
                            <div className="fw-bold text-dark small">{comp.ticketCount} Tickets</div>
                            <small className="text-muted">{comp.userCount} / {comp.maxAgents} Agents</small>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary d-flex align-items-center gap-1 rounded-3 px-3"
                            onClick={() => onSwitchToCompany(comp.id, 'tickets')}
                          >
                            <span>Open Desk</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Quick Governance Actions & Recent Staff */}
              <div className="col-12 col-xl-5">
                <div className="enterprise-card mb-4">
                  <div className="enterprise-card-header">
                    <div>
                      <h6 className="fw-bold mb-0">Quick Governance Actions</h6>
                      <small className="text-muted">Administrative shortcuts</small>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="row g-2">
                      <div className="col-6">
                        <button
                          type="button"
                          className="btn btn-light border w-100 text-start p-3 rounded-3 d-flex flex-column gap-1"
                          onClick={() => setShowNewCompanyModal(true)}
                        >
                          <Building2 size={20} className="text-primary" />
                          <span className="fw-bold text-dark small">Onboard Company</span>
                          <small className="text-muted" style={{ fontSize: '0.72rem' }}>Create isolated tenant & admin</small>
                        </button>
                      </div>
                      <div className="col-6">
                        <button
                          type="button"
                          className="btn btn-light border w-100 text-start p-3 rounded-3 d-flex flex-column gap-1"
                          onClick={() => setShowNewCredModal(true)}
                        >
                          <KeyRound size={20} className="text-success" />
                          <span className="fw-bold text-dark small">Issue Credential</span>
                          <small className="text-muted" style={{ fontSize: '0.72rem' }}>Add Admin or Support Engineer</small>
                        </button>
                      </div>
                      <div className="col-6">
                        <button
                          type="button"
                          className="btn btn-light border w-100 text-start p-3 rounded-3 d-flex flex-column gap-1"
                          onClick={() => onSwitchToCompany(companies[0]?.id || 1, 'mis')}
                        >
                          <FileSpreadsheet size={20} className="text-warning" />
                          <span className="fw-bold text-dark small">100k MIS Export</span>
                          <small className="text-muted" style={{ fontSize: '0.72rem' }}>Download enterprise reports</small>
                        </button>
                      </div>
                      <div className="col-6">
                        <button
                          type="button"
                          className="btn btn-light border w-100 text-start p-3 rounded-3 d-flex flex-column gap-1"
                          onClick={() => onSwitchToCompany(companies[0]?.id || 1, 'engineers')}
                        >
                          <Users size={20} className="text-info" />
                          <span className="fw-bold text-dark small">Category Engineers</span>
                          <small className="text-muted" style={{ fontSize: '0.72rem' }}>IT, Finance, Ops, HR, Legal</small>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="enterprise-card">
                  <div className="enterprise-card-header">
                    <div>
                      <h6 className="fw-bold mb-0">Recently Provisioned Accounts</h6>
                      <small className="text-muted">{users.length} active credentials across platform</small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-decoration-none p-0 fw-semibold"
                      onClick={() => setActiveMenu('credentials')}
                    >
                      View All →
                    </button>
                  </div>
                  <div className="p-0">
                    <ul className="list-group list-group-flush">
                      {users.slice(0, 5).map(u => (
                        <li key={u.id} className="list-group-item px-3.5 py-2.5 d-flex justify-content-between align-items-center">
                          <div className="d-flex align-items-center gap-2.5">
                            <div className="avatar-chip bg-primary-subtle text-primary fw-bold" style={{ width: '34px', height: '34px' }}>
                              {u.firstName?.[0] || 'U'}
                            </div>
                            <div>
                              <div className="fw-bold text-dark small">{u.displayName}</div>
                              <code className="text-muted" style={{ fontSize: '0.72rem' }}>{u.email}</code>
                            </div>
                          </div>
                          <span className="badge bg-light text-dark border" style={{ fontSize: '0.68rem' }}>
                            {(u as any).company?.companyCode || 'SYSTEM'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              MENU 2: ORGANIZATIONS & TENANTS DIRECTORY
              ================================================================ */}
          {activeMenu === 'companies' && (
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
                      placeholder="Search organization, code, subdomain..."
                      value={compSearch}
                      onChange={e => setCompSearch(e.target.value)}
                    />
                  </div>

                  <div className="d-flex gap-1">
                    {['ALL', 'ACTIVE', 'SUSPENDED'].map(st => (
                      <button
                        key={st}
                        type="button"
                        className={`btn btn-sm px-3 rounded-pill fw-semibold ${
                          compStatusFilter === st ? 'btn-primary' : 'btn-outline-secondary'
                        }`}
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setCompStatusFilter(st)}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 px-3 py-1.5 rounded-3 fw-semibold shadow-sm"
                  onClick={() => setShowNewCompanyModal(true)}
                >
                  <Plus size={15} />
                  <span>Onboard New Organization</span>
                </button>
              </div>

              <div className="table-responsive">
                <table className="table table-enterprise align-middle mb-0">
                  <thead>
                    <tr>
                      <th className="ps-4">Company Details</th>
                      <th>Subdomain & Portal URL</th>
                      <th>Plan & Agent Quota</th>
                      <th>Staff</th>
                      <th>Tickets</th>
                      <th>Status & Control</th>
                      <th className="text-end pe-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map(comp => (
                      <tr key={comp.id}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-3">
                            <div
                              className="rounded-3 p-2 d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
                              style={{
                                width: '42px',
                                height: '42px',
                                backgroundColor: comp.primaryColor || '#2563eb',
                              }}
                            >
                              {comp.companyCode.slice(0, 3)}
                            </div>
                            <div>
                              <h6 className="fw-bold mb-0 text-dark">{comp.name}</h6>
                              <div className="d-flex align-items-center gap-1.5 mt-0.5">
                                <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.68rem' }}>
                                  Code: {comp.companyCode}
                                </span>
                                <span className="text-muted small">ID: #{comp.id}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div>
                            <code className="text-primary fw-semibold">{comp.subdomain}.kuwyhelp.com</code>
                            {comp.customDomain && (
                              <div className="text-muted small">Custom: {comp.customDomain}</div>
                            )}
                          </div>
                        </td>

                        <td>
                          <div style={{ maxWidth: '175px' }}>
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <span className="badge bg-light text-dark border fw-bold" style={{ fontSize: '0.7rem' }}>
                                {comp.planName}
                              </span>
                              <span className="text-muted small" style={{ fontSize: '0.74rem' }}>
                                {comp.userCount} / {comp.maxAgents}
                              </span>
                            </div>
                            <div className="quota-bar">
                              <div
                                className="quota-bar-fill"
                                style={{ width: `${Math.min(100, Math.round((comp.userCount / Math.max(1, comp.maxAgents)) * 100))}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="badge bg-primary-subtle text-primary fw-bold px-2.5 py-1">
                            {comp.userCount} Agents
                          </span>
                        </td>

                        <td>
                          <span className="badge bg-secondary-subtle text-secondary fw-bold px-2.5 py-1">
                            {comp.ticketCount} Tickets
                          </span>
                        </td>

                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <span className={`badge-status ${comp.status === 'ACTIVE' ? 'badge-resolved' : 'badge-urgent'}`}>
                              <span className={`pulse-dot ${comp.status === 'ACTIVE' ? 'pulse-dot-success' : 'pulse-dot-danger'}`} />
                              <span>{comp.status}</span>
                            </span>

                            <button
                              type="button"
                              className={`btn btn-sm py-1 px-2.5 rounded-pill d-flex align-items-center gap-1 ${
                                comp.status === 'ACTIVE'
                                  ? 'btn-outline-danger'
                                  : 'btn-outline-success'
                              }`}
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => handleToggleCompanyStatus(comp)}
                              title={comp.status === 'ACTIVE' ? 'Suspend this company' : 'Reactivate this company'}
                            >
                              <Power size={12} />
                              <span>{comp.status === 'ACTIVE' ? 'Suspend' : 'Activate'}</span>
                            </button>
                          </div>
                        </td>

                        <td className="text-end pe-4">
                          <div className="d-flex justify-content-end align-items-center gap-1.5">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary py-1 px-2.5 d-flex align-items-center gap-1 rounded-3"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => {
                                setCredCompanyId(comp.id);
                                setShowNewCredModal(true);
                              }}
                              title="Create Login Credential for this Company"
                            >
                              <KeyRound size={13} />
                              <span>Add Login</span>
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary py-1 px-2 rounded-3"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => {
                                setShowEditLimitsModal(comp);
                                setEditPlan(comp.planName);
                                setEditMaxAgents(comp.maxAgents);
                              }}
                              title="Edit Limits & Plan"
                            >
                              <Edit3 size={13} />
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-dark py-1 px-2.5 d-flex align-items-center gap-1 rounded-3"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => onSwitchToCompany(comp.id, 'tickets')}
                              title="Open company helpdesk queue"
                            >
                              <span>Workspace</span>
                              <ArrowRight size={12} />
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
              MENU 3: ACCESS & LOGIN CREDENTIALS DIRECTORY
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
                            className={`badge ${
                              u.role?.roleType === 'SUPER_ADMIN'
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
                                className={`btn btn-sm py-1 px-2.5 rounded-pill d-flex align-items-center gap-1 ${
                                  u.isActive ? 'btn-outline-danger' : 'btn-outline-success'
                                }`}
                                style={{ fontSize: '0.72rem' }}
                                onClick={() => handleToggleUserActive(u)}
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
              MENU 4: TENANT WORKSPACES & DIRECT MODULE LAUNCHER
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
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1.5 rounded-3 px-3 py-1.5"
                          onClick={() => onSwitchToCompany(comp.id, 'mailboxes')}
                        >
                          <Mail size={14} />
                          <span>MS 365 Mailboxes</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ================================================================
              MENU 5: SYSTEM ARCHITECTURE, SECURITY & DATABASE SCHEMA
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
                      { mod: 'Channels & Mailboxes', tables: 'company_mailboxes (MS 365 Exchange Online)' },
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
                      <h6 className="fw-bold mb-0">Enterprise Security & Integration Stack</h6>
                    </div>
                  </div>
                  <div className="p-4 d-flex flex-column gap-3">
                    <div className="p-3 bg-light rounded-3 border">
                      <div className="d-flex align-items-center gap-2 fw-bold text-dark mb-1">
                        <Lock size={16} className="text-primary" />
                        <span>Strict Tenant Isolation & JWT RBAC</span>
                      </div>
                      <p className="text-muted small mb-0">
                        Every query is scoped by <code>company_id</code> and verified against signed HMAC-SHA384 JWT tokens with role hierarchy (<code>SUPER_ADMIN</code>, <code>COMPANY_ADMIN</code>, <code>AGENT</code>).
                      </p>
                    </div>

                    <div className="p-3 bg-light rounded-3 border">
                      <div className="d-flex align-items-center gap-2 fw-bold text-dark mb-1">
                        <Globe size={16} className="text-info" />
                        <span>Microsoft 365 Exchange Online Graph Sync</span>
                      </div>
                      <p className="text-muted small mb-0">
                        Automatic thread matching via <code>In-Reply-To</code>, <code>ms_conversation_id</code>, and subject regex <code>[KUWY-XXXX]</code>.
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
          MODALS (ONBOARD COMPANY, CREATE CREDENTIAL, EDIT LIMITS, RESET PWD)
          ==================================================================== */}
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

              <form onSubmit={handleCreateCompany}>
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
                        <option value="STARTER">Starter Plan</option>
                        <option value="PROFESSIONAL">Professional Plan</option>
                        <option value="ENTERPRISE">Enterprise Plan</option>
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

              <form onSubmit={handleCreateCredential}>
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

      {showEditLimitsModal && (
        <div className="modal show d-block modal-backdrop-blur">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-white border-bottom py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <Settings size={20} className="text-primary" />
                  <h5 className="modal-title fw-bold mb-0">Edit Quota: {showEditLimitsModal.name}</h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowEditLimitsModal(null)}
                ></button>
              </div>

              <form onSubmit={handleSaveLimits}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Plan Tier</label>
                    <select
                      className="form-select"
                      value={editPlan}
                      onChange={e => setEditPlan(e.target.value)}
                    >
                      <option value="STARTER">STARTER</option>
                      <option value="PROFESSIONAL">PROFESSIONAL</option>
                      <option value="ENTERPRISE">ENTERPRISE</option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Max Allowed Agents</label>
                    <input
                      type="number"
                      className="form-control"
                      min={1}
                      max={500}
                      value={editMaxAgents}
                      onChange={e => setEditMaxAgents(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="modal-footer bg-light px-4 py-2.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowEditLimitsModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-semibold">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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

              <form onSubmit={handleResetPassword}>
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
