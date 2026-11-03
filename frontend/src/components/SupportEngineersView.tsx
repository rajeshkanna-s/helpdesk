import React, { useState, useEffect } from 'react';
import {
  Users, UserCheck, Plus, Search, RefreshCw, Power, Phone,
  Mail, Building2, CheckCircle2, AlertCircle
} from 'lucide-react';
import { apiService } from '../services/api';
import type { SupportEngineer, DepartmentDetail, Company } from '../types';

interface SupportEngineersViewProps {
  activeCompany: Company;
}

export const SupportEngineersView: React.FC<SupportEngineersViewProps> = ({ activeCompany }) => {
  const [engineers, setEngineers] = useState<SupportEngineer[]>([]);
  const [departments, setDepartments] = useState<DepartmentDetail[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDeptId, setNewDeptId] = useState<number>(1);
  const [newPassword, setNewPassword] = useState('Password@123');
  const [newRoleType, setNewRoleType] = useState('AGENT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadEngineers();
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

  const handleToggleActive = async (eng: SupportEngineer) => {
    try {
      await apiService.toggleSupportEngineer(eng.id);
      setNotice({
        type: 'success',
        message: `${eng.displayName} has been ${eng.isActive ? 'disabled' : 'enabled'}.`,
      });
      loadEngineers();
      setTimeout(() => setNotice(null), 5000);
    } catch (err) {
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
            <h4 className="fw-bold mb-0">Technical Support Engineers Directory</h4>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle ms-1 px-2.5 py-1">
              {activeCompany.name}
            </span>
          </div>
          <p className="text-muted small mb-0">
            Provision, allocate, and manage dedicated technical support engineers categorized across <strong>IT, Finance, Operations, HR, Legal</strong> and more.
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1.5 px-3 py-1.5"
            onClick={loadEngineers}
            disabled={isLoading}
            style={{ borderRadius: '8px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            className="btn btn-primary btn-sm d-flex align-items-center gap-1.5 fw-semibold px-3 py-1.5 shadow-sm"
            onClick={() => setShowAddModal(true)}
            style={{ borderRadius: '8px' }}
          >
            <Plus size={16} />
            <span>Enable Support Engineer</span>
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
                <small className="text-muted fw-semibold">Total Engineers</small>
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
                <small className="text-muted fw-semibold">Active On Duty</small>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <span className="pulse-dot pulse-dot-success"></span>
                  <h3 className="fw-bold mb-0 text-success">
                    {engineers.filter(e => e.isActive).length}
                  </h3>
                </div>
              </div>
              <div className="stat-icon bg-success-subtle text-success">
                <UserCheck size={22} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="stat-card">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <small className="text-muted fw-semibold">Categories Active</small>
                <h3 className="fw-bold mb-0 mt-1">{departments.length}</h3>
              </div>
              <div className="stat-icon bg-purple-subtle text-purple" style={{ backgroundColor: '#f3e8ff', color: '#7e22ce' }}>
                <Building2 size={22} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="stat-card">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <small className="text-muted fw-semibold">Tickets Assigned</small>
                <h3 className="fw-bold mb-0 mt-1 text-primary">
                  {engineers.reduce((acc, e) => acc + (e.activeTicketsCount || 0), 0)}
                </h3>
              </div>
              <div className="stat-icon bg-info-subtle text-info">
                <CheckCircle2 size={22} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Category Tabs & Search Bar */}
      <div className="card shadow-sm border-0 mb-4 rounded-3">
        <div className="card-body p-3">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            {/* Department Category Pills */}
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
                const isSelected = selectedDeptId === d.id;
                return (
                  <button
                    key={d.id}
                    className={`btn btn-sm px-3 py-1.5 fw-semibold d-flex align-items-center gap-1.5 ${
                      isSelected ? 'btn-primary shadow-sm' : 'btn-outline-secondary'
                    }`}
                    onClick={() => setSelectedDeptId(d.id)}
                    style={{ borderRadius: '20px' }}
                  >
                    <span>{d.name}</span>
                    <span className={`badge ${isSelected ? 'bg-white text-primary' : 'bg-light text-dark'} rounded-pill`} style={{ fontSize: '0.7rem' }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Bar */}
            <div style={{ maxWidth: '300px', width: '100%' }}>
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-white border-end-0">
                  <Search size={14} className="text-muted" />
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Search by name, email or category..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Engineers Directory Table */}
      <div className="card shadow-sm border-0 rounded-3 overflow-hidden">
        <div className="card-header bg-white py-3 px-3.5 d-flex justify-content-between align-items-center border-bottom">
          <div className="d-flex align-items-center gap-2">
            <h6 className="fw-bold mb-0">Technical Support Personnel</h6>
            <span className="badge bg-secondary-subtle text-secondary rounded-pill">
              {filtered.length} Displayed
            </span>
          </div>
          <small className="text-muted">Managed via Kuwy Enterprise Role-Based Access</small>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }} className="text-muted">
                  <th className="ps-3.5">Engineer & Contact</th>
                  <th>Category</th>
                  <th>Role Designation</th>
                  <th>Active Tickets</th>
                  <th>Status</th>
                  <th className="text-end pe-3.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-5 text-muted">
                      <Users size={36} className="text-muted mb-2 d-block mx-auto opacity-50" />
                      <div className="fw-semibold">No technical support engineers found</div>
                      <small className="text-muted">Try changing the category filter or search keyword.</small>
                    </td>
                  </tr>
                ) : (
                  filtered.map(eng => (
                    <tr key={eng.id}>
                      <td className="ps-3.5">
                        <div className="d-flex align-items-center gap-2.5">
                          <div
                            className="rounded-circle d-flex align-items-center justify-content-center fw-bold shadow-sm"
                            style={{ 
                              width: '40px', 
                              height: '40px', 
                              fontSize: '0.875rem',
                              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe'
                            }}
                          >
                            {eng.firstName.charAt(0)}{eng.lastName ? eng.lastName.charAt(0) : ''}
                          </div>
                          <div>
                            <div className="fw-bold text-dark">{eng.displayName}</div>
                            <div className="text-muted small d-flex align-items-center gap-1.5" style={{ fontSize: '0.78rem' }}>
                              <Mail size={12} className="text-muted" /> {eng.email}
                              {eng.phone && (
                                <>
                                  <span className="mx-1">•</span>
                                  <Phone size={12} className="text-muted" /> {eng.phone}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`badge border px-2.5 py-1.5 ${getDeptColor(eng.departmentCode)}`} style={{ borderRadius: '6px' }}>
                          <Building2 size={12} className="me-1" />
                          {eng.departmentName}
                        </span>
                      </td>

                      <td>
                        <span className={`badge ${
                          eng.roleType === 'COMPANY_ADMIN' 
                            ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' 
                            : 'bg-primary-subtle text-primary border border-primary-subtle'
                        }`} style={{ borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {eng.roleType === 'COMPANY_ADMIN' ? 'Category Lead / Admin' : 'Support Engineer'}
                        </span>
                      </td>

                      <td>
                        <span className={`badge ${eng.activeTicketsCount > 0 ? 'bg-primary' : 'bg-light text-muted border'}`} style={{ borderRadius: '6px' }}>
                          {eng.activeTicketsCount} Active
                        </span>
                      </td>

                      <td>
                        <span className={`badge-status ${eng.isActive ? 'badge-resolved' : 'badge-closed'}`}>
                          <span className={`pulse-dot ${eng.isActive ? 'pulse-dot-success' : ''}`}></span>
                          {eng.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>

                      <td className="text-end pe-3.5">
                        <button
                          className={`btn btn-sm ${
                            eng.isActive ? 'btn-outline-danger' : 'btn-outline-success'
                          } d-inline-flex align-items-center gap-1 px-2.5 py-1`}
                          onClick={() => handleToggleActive(eng)}
                          title={eng.isActive ? 'Disable Engineer' : 'Enable Engineer'}
                          style={{ borderRadius: '6px', fontSize: '0.78rem' }}
                        >
                          <Power size={13} />
                          <span>{eng.isActive ? 'Disable' : 'Enable'}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. MODAL: ADD TECHNICAL SUPPORT ENGINEER */}
      {showAddModal && (
        <div 
          className="modal show d-block" 
          style={{ 
            backgroundColor: 'rgba(15, 23, 42, 0.7)', 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)' 
          }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header bg-white border-bottom py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <div className="p-2 rounded-3 bg-primary-subtle text-primary">
                    <UserCheck size={20} />
                  </div>
                  <div>
                    <h5 className="modal-title fw-bold mb-0">Enable Technical Support Engineer</h5>
                    <small className="text-muted">Multi-Department Allocation</small>
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}></button>
              </div>

              <form onSubmit={handleCreateEngineer}>
                <div className="modal-body">
                  <p className="text-muted small mb-3">
                    Assign a support engineer to a category (<strong>IT, Finance, Operations, HR, Legal</strong>) for {activeCompany.name}.
                    They will be able to log in and resolve department-specific tickets.
                  </p>

                  {/* Category Selection */}
                  <div className="mb-3">
                    <label className="form-label fw-bold small">Department Category *</label>
                    <select
                      className="form-select"
                      required
                      value={newDeptId}
                      onChange={e => {
                        const did = Number(e.target.value);
                        setNewDeptId(did);
                        const found = departments.find(d => d.id === did);
                        if (found) {
                          const prefix = found.code ? found.code.toLowerCase() : 'support';
                          setNewEmail(`test.${prefix}@kuwy.in`);
                        }
                      }}
                    >
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
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
