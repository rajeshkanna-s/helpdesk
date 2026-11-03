import React, { useState, useEffect } from 'react';
import {
  Building2, ShieldCheck, Users, Ticket as TicketIcon, Plus, Power,
  KeyRound, RefreshCw, LogOut, ArrowRight, CheckCircle2,
  AlertCircle, Edit3, Settings, ShieldAlert
} from 'lucide-react';
import { apiService } from '../services/api';
import type { AdminOverview, CompanyDetail, User, AuthUser } from '../types';

interface SuperAdminPortalProps {
  currentUser: AuthUser;
  onLogout: () => void;
  onSwitchToCompany: (companyId: number) => void;
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  currentUser,
  onLogout,
  onSwitchToCompany,
}) => {
  const [activeTab, setActiveTab] = useState<'companies' | 'credentials'>('companies');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [companies, setCompanies] = useState<CompanyDetail[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [alertNotice, setAlertNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null);

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
      if (companiesData.length > 0) {
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
      // Reset
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

  return (
    <div className="d-flex flex-column min-vh-100 bg-light">
      {/* Top Navigation Bar */}
      <header className="app-header d-flex justify-content-between align-items-center bg-dark text-white px-4 py-2.5">
        <div className="d-flex align-items-center gap-3">
          <div className="d-flex align-items-center gap-2">
            <span className="p-2 rounded-3 bg-warning text-dark d-flex align-items-center justify-content-center fw-bold shadow-sm">
              <ShieldCheck size={20} />
            </span>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h5 className="mb-0 fw-bold text-white">Kuwy Platform Owner</h5>
                <span className="badge bg-warning text-dark fw-bold" style={{ fontSize: '0.65rem' }}>
                  SUPER ADMIN
                </span>
              </div>
              <small className="text-secondary">Multi-Tenant Organization & Access Control Console</small>
            </div>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {/* Active Admin Profile */}
          <div className="d-none d-md-flex align-items-center gap-2 px-3 py-1 bg-secondary bg-opacity-25 rounded-pill border border-secondary border-opacity-50 text-white">
            <span className="badge bg-warning text-dark rounded-circle p-1">👑</span>
            <span className="small fw-semibold">{currentUser.displayName}</span>
            <span className="text-secondary small">({currentUser.email})</span>
          </div>

          {/* Quick jump to company workspace */}
          <button
            type="button"
            className="btn btn-outline-light btn-sm d-flex align-items-center gap-1.5"
            onClick={() => onSwitchToCompany(companies.length > 0 ? companies[0].id : 1)}
            title="Jump into Helpdesk Queue to test or resolve tickets"
          >
            <span>Open HelpDesk Desk</span>
            <ArrowRight size={14} />
          </button>

          {/* Logout */}
          <button
            type="button"
            className="btn btn-danger btn-sm d-flex align-items-center gap-1.5 fw-semibold"
            onClick={onLogout}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow-1 p-3 p-md-4 container-fluid" style={{ maxWidth: '1440px' }}>
        {/* Alert Notification */}
        {alertNotice && (
          <div
            className={`alert alert-${alertNotice.type} alert-dismissible fade show shadow-sm py-2.5 px-3 mb-4 rounded-3 d-flex align-items-center justify-content-between`}
            role="alert"
          >
            <div className="d-flex align-items-center gap-2">
              {alertNotice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{alertNotice.message}</span>
            </div>
            <button
              type="button"
              className="btn-close p-2"
              onClick={() => setAlertNotice(null)}
            ></button>
          </div>
        )}

        {/* Global Platform Metrics Banner */}
        {overview && (
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-xl-3">
              <div className="stat-card h-100">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                      Total Organizations
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
              <div className="stat-card h-100">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                      Cross-Tenant Tickets
                    </small>
                    <h3 className="fw-bolder mb-1 mt-1">{overview.totalTickets}</h3>
                    <small className="text-muted">Managed across all queues</small>
                  </div>
                  <div className="stat-icon bg-info-subtle text-info">
                    <TicketIcon size={24} />
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <div className="stat-card h-100">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                      Total Support Agents
                    </small>
                    <h3 className="fw-bolder mb-1 mt-1">{overview.totalAgents}</h3>
                    <small className="text-muted">Admins & Engineers onboarded</small>
                  </div>
                  <div className="stat-icon bg-success-subtle text-success">
                    <Users size={24} />
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <div className="stat-card h-100">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <small className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                      Platform Engine
                    </small>
                    <div className="d-flex align-items-center gap-1.5 mt-1.5">
                      <span className="badge bg-success-subtle text-success border border-success d-inline-flex align-items-center gap-1">
                        <span className="pulse-dot pulse-dot-success" style={{ width: '6px', height: '6px' }}></span>
                        <span>ONLINE</span>
                      </span>
                      <span className="badge bg-primary-subtle text-primary border border-primary">MySQL 8.4</span>
                    </div>
                    <small className="text-muted d-block mt-1">Tenant Isolation: Strict</small>
                  </div>
                  <div className="stat-icon bg-warning-subtle text-warning">
                    <ShieldCheck size={24} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Control Bar */}
        <div className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-header bg-white border-bottom p-3 d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className={`btn btn-sm px-3.5 py-1.5 rounded-pill fw-semibold d-flex align-items-center gap-2 ${
                  activeTab === 'companies'
                    ? 'btn-primary'
                    : 'btn-outline-secondary'
                }`}
                onClick={() => setActiveTab('companies')}
              >
                <Building2 size={16} />
                <span>Companies & Tenants ({companies.length})</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm px-3.5 py-1.5 rounded-pill fw-semibold d-flex align-items-center gap-2 ${
                  activeTab === 'credentials'
                    ? 'btn-primary'
                    : 'btn-outline-secondary'
                }`}
                onClick={() => setActiveTab('credentials')}
              >
                <KeyRound size={16} />
                <span>Company Login Credentials ({users.length})</span>
              </button>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                onClick={loadAdminData}
                disabled={isLoading}
              >
                <RefreshCw size={14} className={isLoading ? 'spin-anim' : ''} />
                <span>Refresh</span>
              </button>

              {activeTab === 'companies' ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 fw-semibold shadow-sm"
                  onClick={() => setShowNewCompanyModal(true)}
                >
                  <Plus size={16} />
                  <span>Onboard New Company</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 fw-semibold shadow-sm"
                  onClick={() => setShowNewCredModal(true)}
                >
                  <Plus size={16} />
                  <span>Create Company Login Credential</span>
                </button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {/* TAB 1: COMPANIES DIRECTORY */}
            {activeTab === 'companies' && (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-4">Company Details</th>
                      <th>Subdomain & Portal URL</th>
                      <th>Plan & Quota</th>
                      <th>Users</th>
                      <th>Tickets</th>
                      <th>Status (Control)</th>
                      <th className="text-end pe-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map(comp => (
                      <tr key={comp.id}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-3">
                            <div
                              className="rounded-3 p-2 d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
                              style={{
                                width: '40px',
                                height: '40px',
                                backgroundColor: comp.primaryColor || '#0d6efd',
                              }}
                            >
                              {comp.companyCode.slice(0, 3)}
                            </div>
                            <div>
                              <h6 className="fw-bold mb-0 text-dark">{comp.name}</h6>
                              <div className="d-flex align-items-center gap-1 mt-0.5">
                                <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.7rem' }}>
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
                          <div style={{ maxWidth: '170px' }}>
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <span className="badge bg-light text-dark border fw-bold" style={{ fontSize: '0.72rem' }}>
                                {comp.planName}
                              </span>
                              <span className="text-muted small" style={{ fontSize: '0.75rem' }}>
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

                            {/* Enable/Disable Toggle */}
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
                            {/* Create Credential for this Company */}
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary py-1 px-2 d-flex align-items-center gap-1"
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

                            {/* Edit Limits */}
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary py-1 px-2"
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

                            {/* Open Workspace */}
                            <button
                              type="button"
                              className="btn btn-sm btn-light border py-1 px-2 d-flex align-items-center gap-1"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => onSwitchToCompany(comp.id)}
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
            )}

            {/* TAB 2: COMPANY CREDENTIALS DIRECTORY */}
            {activeTab === 'credentials' && (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
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
                    {users.map(u => (
                      <tr key={u.id}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-2.5">
                            <div className="avatar-chip bg-primary text-white fw-bold">
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
                                : 'bg-info text-dark'
                            }`}
                          >
                            {u.role?.name || u.role?.roleType}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`badge ${
                              u.isActive ? 'bg-success' : 'bg-danger'
                            }`}
                          >
                            {u.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                          </span>
                        </td>

                        <td className="text-end pe-4">
                          <div className="d-flex justify-content-end align-items-center gap-2">
                            {/* Toggle active / deactivate */}
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

                            {/* Reset Password */}
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary py-1 px-2.5 d-flex align-items-center gap-1"
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
            )}
          </div>
        </div>
      </main>

      {/* MODAL 1: ONBOARD NEW COMPANY */}
      {showNewCompanyModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4">
              <div className="modal-header bg-dark text-white rounded-top-4">
                <div className="d-flex align-items-center gap-2">
                  <Building2 size={20} className="text-warning" />
                  <h5 className="modal-title fw-bold">Onboard New Organization / Company</h5>
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
                      <div className="input-group">
                        <input
                          type="text"
                          className="form-control"
                          required
                          placeholder="tata"
                          value={newCompSubdomain}
                          onChange={e => setNewCompSubdomain(e.target.value.toLowerCase())}
                        />
                      </div>
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
                    2. Initial Company Administrator Login Credential (Created by Admin)
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

                <div className="modal-footer bg-light rounded-bottom-4">
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

      {/* MODAL 2: CREATE USER CREDENTIAL FOR A COMPANY */}
      {showNewCredModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4">
              <div className="modal-header bg-primary text-white rounded-top-4">
                <div className="d-flex align-items-center gap-2">
                  <KeyRound size={20} />
                  <h5 className="modal-title fw-bold">Create Company Login Credential</h5>
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

                <div className="modal-footer bg-light rounded-bottom-4">
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

      {/* MODAL 3: EDIT LIMITS */}
      {showEditLimitsModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4">
              <div className="modal-header bg-white border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <Settings size={20} className="text-primary" />
                  <h5 className="modal-title fw-bold">Edit Quota: {showEditLimitsModal.name}</h5>
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

                <div className="modal-footer bg-light rounded-bottom-4">
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

      {/* MODAL 4: RESET PASSWORD */}
      {showResetPasswordModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4">
              <div className="modal-header bg-white border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <ShieldAlert size={20} className="text-warning" />
                  <h5 className="modal-title fw-bold">Reset User Password</h5>
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

                <div className="modal-footer bg-light rounded-bottom-4">
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
