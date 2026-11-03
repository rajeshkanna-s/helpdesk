import React, { useState, useEffect } from 'react';
import {
  Users, Plus, Search, RefreshCw, Power, Phone,
  CheckCircle2, AlertCircle, Send, Clock,
  Copy, Trash2, Shield
} from 'lucide-react';
import { apiService } from '../services/api';
import type { SupportEngineer, DepartmentDetail, Company, AgentInvitation } from '../types';

interface SupportEngineersViewProps {
  activeCompany: Company;
}

export const SupportEngineersView: React.FC<SupportEngineersViewProps> = ({ activeCompany }) => {
  const [engineers, setEngineers] = useState<SupportEngineer[]>([]);
  const [departments, setDepartments] = useState<DepartmentDetail[]>([]);
  const [invitations, setInvitations] = useState<AgentInvitation[]>([]);
  const [currentView, setCurrentView] = useState<'directory' | 'invitations'>('directory');

  const [selectedDeptId, setSelectedDeptId] = useState<number | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null);

  // Direct Creation Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDeptId, setNewDeptId] = useState<number>(1);
  const [newPassword, setNewPassword] = useState('Password@123');
  const [newRoleType, setNewRoleType] = useState('AGENT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invitation Modal State (Screen 8 & 27)
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState<number>(2);
  const [isInviting, setIsInviting] = useState(false);
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    loadEngineers();
    loadInvitations();
  }, [activeCompany.id]);

  const loadEngineers = async () => {
    setIsLoading(true);
    try {
      const [engList, deptList] = await Promise.all([
        apiService.getSupportEngineers(activeCompany.id),
        apiService.getDepartmentsWithDetails(activeCompany.id),
      ]);
      setEngineers(engList);
      setDepartments(deptList);
      if (deptList.length > 0 && !newDeptId) {
        setNewDeptId(deptList[0].id);
      }
    } catch (err) {
      console.error('Failed to load support engineers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInvitations = async () => {
    try {
      const list = await apiService.getPendingInvitations(activeCompany.id);
      setInvitations(list);
    } catch {
      setInvitations([]);
    }
  };

  const handleToggleActive = async (eng: SupportEngineer) => {
    try {
      await apiService.toggleSupportEngineer(eng.id);
      setNotice({
        type: 'success',
        message: `${eng.displayName} has been ${eng.isActive ? 'disabled' : 'enabled'}.`,
      });
      loadEngineers();
      setTimeout(() => setNotice(null), 5000);
    } catch {
      setNotice({ type: 'danger', message: 'Failed to update engineer status.' });
    }
  };

  const handleCreateEngineer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await apiService.createSupportEngineer({
        companyId: activeCompany.id,
        departmentId: newDeptId,
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        password: newPassword,
        roleType: newRoleType,
      });

      setNotice({
        type: 'success',
        message: `Successfully enabled Technical Support Engineer: ${newFirstName} ${newLastName} (${newEmail}) in department!`,
      });
      setShowAddModal(false);
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewPhone('');
      loadEngineers();
      setTimeout(() => setNotice(null), 6000);
    } catch (err: any) {
      setNotice({
        type: 'danger',
        message: err.response?.data?.message || err.message || 'Failed to create support engineer.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Section B Invitation Handlers
  const handleInviteAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    try {
      const res = await apiService.inviteAgent(
        { email: inviteEmail.trim(), name: inviteName.trim(), roleId: inviteRoleId },
        1,
        activeCompany.id
      );

      setLatestInviteUrl(res.inviteUrl || null);
      setNotice({
        type: 'success',
        message: `Invitation created and link generated for ${inviteName} (${inviteEmail}). Valid for 7 days.`,
      });
      loadInvitations();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to send invitation.';
      setNotice({ type: 'danger', message: msg });
    } finally {
      setIsInviting(false);
    }
  };

  const handleResendInvitation = async (id: number) => {
    try {
      const res = await apiService.resendInvitation(id, 1);
      setNotice({
        type: 'success',
        message: res.message || 'Invitation refreshed with a new 7-day validity token.',
      });
      loadInvitations();
      setTimeout(() => setNotice(null), 5000);
    } catch (err: any) {
      setNotice({ type: 'danger', message: err.response?.data?.error || 'Failed to resend invite.' });
    }
  };

  const handleRevokeInvitation = async (id: number) => {
    if (!confirm('Are you sure you want to revoke this invitation? The link will immediately stop working.')) return;
    try {
      await apiService.revokeInvitation(id, 1);
      setNotice({
        type: 'success',
        message: 'Invitation has been revoked.',
      });
      loadInvitations();
      setTimeout(() => setNotice(null), 5000);
    } catch (err: any) {
      setNotice({ type: 'danger', message: err.response?.data?.error || 'Failed to revoke invite.' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 3000);
  };

  const getDeptColor = (code: string) => {
    switch (code) {
      case 'IT': return 'bg-primary-subtle text-primary border-primary';
      case 'FINANCE': return 'bg-success-subtle text-success border-success';
      case 'OPS': return 'bg-purple-subtle text-purple border-purple';
      case 'HR': return 'bg-warning-subtle text-warning-emphasis border-warning';
      case 'LEGAL': return 'bg-danger-subtle text-danger border-danger';
      default: return 'bg-secondary-subtle text-secondary';
    }
  };

  // Quota calculation
  const planName = activeCompany.planName || 'STARTER';
  const maxSeats = planName === 'FREE' ? 2 : planName === 'PRO' ? 25 : planName === 'ENTERPRISE' ? 50 : 5;
  const pendingCount = invitations.filter(i => i.status === 'PENDING').length;
  const totalAllocated = engineers.length + pendingCount;
  const seatsRemaining = Math.max(0, maxSeats - totalAllocated);

  // Filtered engineers
  const filtered = engineers.filter(eng => {
    const matchesDept = selectedDeptId === 'ALL' || eng.departmentId === selectedDeptId;
    const matchesSearch = !searchTerm.trim() ||
      eng.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eng.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eng.departmentName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesDept && matchesSearch;
  });

  return (
    <div className="container-fluid p-0">
      {/* 1. Header & Actions */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3 bg-white p-3.5 rounded-3 border shadow-sm">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <span className="p-2 rounded-3 bg-primary text-white shadow-sm d-flex align-items-center justify-content-center">
              <Users size={22} />
            </span>
            <h4 className="fw-bold mb-0">Staff & Team Management</h4>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle ms-1 px-2.5 py-1">
              {activeCompany.name}
            </span>
          </div>
          <p className="text-muted small mb-0">
            Invite agents, configure roles, monitor quota limits, and allocate engineers across categories.
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1.5 px-3 py-1.5"
            onClick={() => { loadEngineers(); loadInvitations(); }}
            disabled={isLoading}
            style={{ borderRadius: '8px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1.5 fw-semibold px-3 py-1.5 shadow-sm"
            onClick={() => {
              setLatestInviteUrl(null);
              setShowInviteModal(true);
            }}
            style={{ borderRadius: '8px' }}
          >
            <Send size={15} />
            <span>Invite Agent via Email</span>
          </button>

          <button
            className="btn btn-primary btn-sm d-flex align-items-center gap-1.5 fw-semibold px-3 py-1.5 shadow-sm"
            onClick={() => setShowAddModal(true)}
            style={{ borderRadius: '8px' }}
          >
            <Plus size={16} />
            <span>Quick Create Staff</span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className={`alert alert-${notice.type} d-flex align-items-center gap-2 py-2.5 px-3 mb-3 shadow-sm border-0 rounded-3`}>
          {notice.type === 'success' ? <CheckCircle2 size={18} className="text-success" /> : <AlertCircle size={18} className="text-danger" />}
          <span className="small fw-semibold">{notice.message}</span>
        </div>
      )}

      {/* 1.5 Quick KPI Metric Cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="stat-card">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <small className="text-muted fw-semibold">Active Staff</small>
                <h3 className="fw-bold mb-0 mt-1">{engineers.length}</h3>
              </div>
              <div className="stat-icon bg-primary-subtle text-primary">
                <Users size={22} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="stat-card">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <small className="text-muted fw-semibold">Pending Invitations</small>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <span className="pulse-dot pulse-dot-warning"></span>
                  <h3 className="fw-bold mb-0 text-warning">
                    {pendingCount}
                  </h3>
                </div>
              </div>
              <div className="stat-icon bg-warning-subtle text-warning">
                <Clock size={22} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="stat-card">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <small className="text-muted fw-semibold">Plan Seat Limit</small>
                <h3 className="fw-bold mb-0 mt-1 text-dark">
                  {totalAllocated} <span className="fs-6 text-muted fw-normal">/ {maxSeats}</span>
                </h3>
              </div>
              <div className="stat-icon bg-purple-subtle text-purple" style={{ backgroundColor: '#f3e8ff', color: '#7e22ce' }}>
                <Shield size={22} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="stat-card">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <small className="text-muted fw-semibold">Seats Remaining</small>
                <h3 className={`fw-bold mb-0 mt-1 ${seatsRemaining === 0 ? 'text-danger' : 'text-success'}`}>
                  {seatsRemaining}
                </h3>
              </div>
              <div className="stat-icon bg-info-subtle text-info">
                <CheckCircle2 size={22} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Switcher: Directory vs Invitations */}
      <div className="d-flex align-items-center gap-2 mb-3 border-bottom pb-2">
        <button
          className={`btn btn-sm fw-semibold d-flex align-items-center gap-2 ${currentView === 'directory' ? 'btn-primary' : 'btn-light text-muted'}`}
          onClick={() => setCurrentView('directory')}
          style={{ borderRadius: '8px' }}
        >
          <Users size={16} />
          <span>Active Staff Directory</span>
          <span className="badge bg-white text-dark ms-1">{engineers.length}</span>
        </button>

        <button
          className={`btn btn-sm fw-semibold d-flex align-items-center gap-2 ${currentView === 'invitations' ? 'btn-primary' : 'btn-light text-muted'}`}
          onClick={() => setCurrentView('invitations')}
          style={{ borderRadius: '8px' }}
        >
          <Send size={15} />
          <span>Pending Invitations (Screen 8 & 27)</span>
          <span className={`badge ${pendingCount > 0 ? 'bg-warning text-dark' : 'bg-light text-dark'} ms-1`}>
            {invitations.length}
          </span>
        </button>
      </div>

      {/* VIEW A: ACTIVE ENGINEERS DIRECTORY */}
      {currentView === 'directory' && (
        <>
          {/* Category Tabs & Search Bar */}
          <div className="card shadow-sm border-0 mb-4 rounded-3">
            <div className="card-body p-3">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="d-flex flex-wrap gap-2">
                  <button
                    className={`btn btn-sm px-3 py-1.5 fw-semibold d-flex align-items-center gap-1.5 ${
                      selectedDeptId === 'ALL' ? 'btn-primary shadow-sm' : 'btn-outline-secondary'
                    }`}
                    onClick={() => setSelectedDeptId('ALL')}
                    style={{ borderRadius: '20px' }}
                  >
                    <span>All Categories</span>
                    <span className={`badge ${selectedDeptId === 'ALL' ? 'bg-white text-primary' : 'bg-light text-dark'} rounded-pill`} style={{ fontSize: '0.7rem' }}>
                      {engineers.length}
                    </span>
                  </button>
                  {departments.map(d => {
                    const count = engineers.filter(e => e.departmentId === d.id).length;
                    return (
                      <button
                        key={d.id}
                        className={`btn btn-sm px-3 py-1.5 fw-semibold d-flex align-items-center gap-1.5 ${
                          selectedDeptId === d.id ? 'btn-primary shadow-sm' : 'btn-outline-secondary'
                        }`}
                        onClick={() => setSelectedDeptId(d.id)}
                        style={{ borderRadius: '20px' }}
                      >
                        <span>{d.name}</span>
                        <span className={`badge ${selectedDeptId === d.id ? 'bg-white text-primary' : 'bg-light text-dark'} rounded-pill`} style={{ fontSize: '0.7rem' }}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="input-group input-group-sm" style={{ maxWidth: '280px' }}>
                  <span className="input-group-text bg-white border-end-0">
                    <Search size={14} className="text-muted" />
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0"
                    placeholder="Search staff by name or email..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Engineers Directory Table */}
          <div className="card shadow-sm border-0 rounded-3 overflow-hidden">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light text-secondary text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                  <tr>
                    <th className="ps-3 py-3">Support Engineer</th>
                    <th>Category / Unit</th>
                    <th>Role Scope</th>
                    <th>Contact Info</th>
                    <th>Workload</th>
                    <th>Status</th>
                    <th className="pe-3 text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-5 text-muted">
                        No support engineers found in this view.
                      </td>
                    </tr>
                  ) : (
                    filtered.map(eng => (
                      <tr key={eng.id}>
                        <td className="ps-3">
                          <div className="d-flex align-items-center gap-2.5">
                            <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>
                              {eng.displayName.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="fw-bold text-dark">{eng.displayName}</div>
                              <small className="text-muted font-monospace">{eng.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge border px-2.5 py-1 ${getDeptColor(eng.departmentCode)}`}>
                            {eng.departmentName}
                          </span>
                        </td>
                        <td>
                          <span className="badge bg-light text-dark border">
                            {eng.roleName}
                          </span>
                        </td>
                        <td>
                          <div className="small text-muted d-flex align-items-center gap-1.5">
                            <Phone size={13} />
                            <span>{eng.phone || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="badge bg-info-subtle text-info border border-info-subtle px-2 py-1">
                            {eng.activeTicketsCount || 0} active tickets
                          </span>
                        </td>
                        <td>
                          {eng.isActive ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1 px-2.5 py-1">
                              <span className="pulse-dot pulse-dot-success" style={{ width: '6px', height: '6px' }}></span>
                              Active
                            </span>
                          ) : (
                            <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-2.5 py-1">
                              Deactivated
                            </span>
                          )}
                        </td>
                        <td className="pe-3 text-end">
                          <button
                            className={`btn btn-sm ${eng.isActive ? 'btn-outline-danger' : 'btn-outline-success'} py-1 px-2.5`}
                            onClick={() => handleToggleActive(eng)}
                            style={{ borderRadius: '6px', fontSize: '0.78rem' }}
                          >
                            <Power size={13} className="me-1" />
                            <span>{eng.isActive ? 'Deactivate' : 'Activate'}</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* VIEW B: PENDING INVITATIONS (SCREEN 8 & 27) */}
      {currentView === 'invitations' && (
        <div className="card shadow-sm border-0 rounded-3 overflow-hidden">
          <div className="card-header bg-white p-3.5 d-flex justify-content-between align-items-center border-bottom">
            <div>
              <h6 className="fw-bold text-dark mb-0">Pending & Historical Invitations</h6>
              <small className="text-muted">
                Links are single-use, hashed via SHA-256, and expire after 7 days per Section B security specifications.
              </small>
            </div>
            <button
              className="btn btn-primary btn-sm d-flex align-items-center gap-1.5 fw-semibold px-3 py-1.5"
              onClick={() => {
                setLatestInviteUrl(null);
                setShowInviteModal(true);
              }}
              style={{ borderRadius: '8px' }}
            >
              <Send size={15} />
              <span>Invite New Agent</span>
            </button>
          </div>

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light text-secondary text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                <tr>
                  <th className="ps-3 py-3">Invited Staff Member</th>
                  <th>Designated Role</th>
                  <th>Invited By</th>
                  <th>Status</th>
                  <th>Expires On</th>
                  <th className="pe-3 text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-5 text-muted">
                      No pending invitations for this workspace. Click "Invite New Agent" to send an invitation.
                    </td>
                  </tr>
                ) : (
                  invitations.map(inv => (
                    <tr key={inv.id}>
                      <td className="ps-3">
                        <div className="fw-bold text-dark">{inv.name}</div>
                        <small className="text-muted font-monospace">{inv.email}</small>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border">
                          {inv.roleName || 'Agent'}
                        </span>
                      </td>
                      <td>
                        <small className="text-muted">{inv.inviterName || 'Admin'}</small>
                      </td>
                      <td>
                        {inv.status === 'PENDING' && (
                          <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle d-inline-flex align-items-center gap-1 px-2.5 py-1">
                            <Clock size={12} />
                            Pending Acceptance
                          </span>
                        )}
                        {inv.status === 'ACCEPTED' && (
                          <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1 px-2.5 py-1">
                            <CheckCircle2 size={12} />
                            Accepted & Active
                          </span>
                        )}
                        {inv.status === 'REVOKED' && (
                          <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2.5 py-1">
                            Revoked
                          </span>
                        )}
                        {inv.status === 'EXPIRED' && (
                          <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-2.5 py-1">
                            Expired
                          </span>
                        )}
                      </td>
                      <td>
                        <small className="text-muted">
                          {new Date(inv.expiresAt).toLocaleDateString()} {new Date(inv.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </td>
                      <td className="pe-3 text-end">
                        {inv.status === 'PENDING' && (
                          <div className="d-flex align-items-center justify-content-end gap-1.5">
                            <button
                              className="btn btn-outline-secondary btn-sm py-1 px-2.5"
                              onClick={() => handleResendInvitation(inv.id)}
                              title="Resend invitation and reset 7-day timer"
                              style={{ borderRadius: '6px', fontSize: '0.75rem' }}
                            >
                              <RefreshCw size={13} className="me-1" />
                              <span>Resend</span>
                            </button>
                            <button
                              className="btn btn-outline-danger btn-sm py-1 px-2"
                              onClick={() => handleRevokeInvitation(inv.id)}
                              title="Revoke this invite token"
                              style={{ borderRadius: '6px' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                        {inv.status !== 'PENDING' && (
                          <small className="text-muted">—</small>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==============================================================
          MODAL 1: INVITE AGENT MODAL (SCREEN 8 & 27)
          ============================================================== */}
      {showInviteModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)' }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '480px' }}>
            <div className="modal-content rounded-4 border-0 shadow-2xl overflow-hidden">
              <div className="bg-primary p-4 text-white">
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <h5 className="modal-title fw-bold mb-0">Invite Team Member</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowInviteModal(false)} />
                </div>
                <small className="text-white text-opacity-80">
                  Screen 8 & 27 • Send secure single-use invitation
                </small>
              </div>

              <div className="modal-body p-4">
                {/* Quota status bar */}
                <div className="bg-light p-3 rounded-3 mb-3 border">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="small fw-bold text-dark">Plan Seat Allocation:</span>
                    <span className="badge bg-primary text-white">{planName}</span>
                  </div>
                  <div className="small text-muted">
                    {totalAllocated} of {maxSeats} seats occupied ({seatsRemaining} seats remaining)
                  </div>
                </div>

                {latestInviteUrl ? (
                  <div className="text-center py-2">
                    <div className="d-inline-flex p-3 rounded-circle bg-success bg-opacity-10 text-success mb-3">
                      <CheckCircle2 size={40} />
                    </div>
                    <h5 className="fw-bold text-dark mb-2">Invitation Created!</h5>
                    <p className="text-muted small mb-3">
                      The link has been registered with strict single-use SHA-256 token security.
                    </p>

                    <div className="input-group mb-3">
                      <input
                        type="text"
                        className="form-control font-monospace small bg-light"
                        readOnly
                        value={latestInviteUrl}
                      />
                      <button
                        className="btn btn-outline-primary d-flex align-items-center gap-1"
                        onClick={() => copyToClipboard(latestInviteUrl)}
                      >
                        <Copy size={14} />
                        <span>{copiedUrl ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>

                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary w-50 py-2 fw-semibold"
                        onClick={() => {
                          setLatestInviteUrl(null);
                          setInviteEmail('');
                          setInviteName('');
                        }}
                      >
                        Invite Another
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary w-50 py-2 fw-semibold"
                        onClick={() => setShowInviteModal(false)}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleInviteAgent}>
                    <div className="mb-3">
                      <label className="form-label fw-bold small">Staff Full Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Priyadharshini K"
                        required
                        value={inviteName}
                        onChange={e => setInviteName(e.target.value)}
                        autoFocus
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label fw-bold small">Staff Email Address *</label>
                      <input
                        type="email"
                        className="form-control"
                        placeholder="name@company.com"
                        required
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                      />
                    </div>

                    <div className="mb-4">
                      <label className="form-label fw-bold small">Assigned Role</label>
                      <select
                        className="form-select"
                        value={inviteRoleId}
                        onChange={e => setInviteRoleId(Number(e.target.value))}
                      >
                        <option value={2}>Technical Support Engineer (Agent)</option>
                        <option value={3}>Category Lead / Department Head</option>
                        <option value={1}>Workspace Administrator</option>
                      </select>
                    </div>

                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-light border w-50 py-2 fw-semibold"
                        onClick={() => setShowInviteModal(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isInviting || seatsRemaining === 0}
                        className="btn btn-primary w-50 py-2 fw-semibold d-flex align-items-center justify-content-center gap-2"
                      >
                        {isInviting ? (
                          <>
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <span>Send Invite</span>
                            <Send size={15} />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          MODAL 2: QUICK CREATE STAFF (DIRECT)
          ============================================================== */}
      {showAddModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content rounded-3 border-0 shadow">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Enable Technical Support Engineer</h5>
                <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}></button>
              </div>
              <form onSubmit={handleCreateEngineer}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label fw-bold small">Assign Category / Department</label>
                    <select
                      className="form-select"
                      value={newDeptId}
                      onChange={e => setNewDeptId(Number(e.target.value))}
                    >
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label fw-bold small">First Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. Ramesh"
                        value={newFirstName}
                        onChange={e => setNewFirstName(e.target.value)}
                      />
                    </div>
                    <div className="col">
                      <label className="form-label fw-bold small">Last Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. V"
                        value={newLastName}
                        onChange={e => setNewLastName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold small">Engineer Login Email *</label>
                    <input
                      type="email"
                      className="form-control"
                      required
                      placeholder="test.it.ramesh@kuwy.in"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                    />
                    <small className="text-muted">Use test-safe email (e.g. <code>test...</code>)</small>
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label fw-bold small">Phone Number</label>
                      <input
                        type="tel"
                        className="form-control"
                        placeholder="+91 9876543210"
                        value={newPhone}
                        onChange={e => setNewPhone(e.target.value)}
                      />
                    </div>
                    <div className="col">
                      <label className="form-label fw-bold small">Temporary Password</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold small">Role</label>
                    <select
                      className="form-select"
                      value={newRoleType}
                      onChange={e => setNewRoleType(e.target.value)}
                    >
                      <option value="AGENT">Technical Support Engineer</option>
                      <option value="COMPANY_ADMIN">Category Lead / Company Admin</option>
                    </select>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm fw-semibold"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Enabling...' : 'Enable Support Engineer'}
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
