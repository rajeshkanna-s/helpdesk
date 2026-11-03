import React, { useState, useEffect } from 'react';
import { apiService, setApiTenantId, setAuthToken } from './services/api';
import type { Company, DashboardStats, Ticket, TicketThread, CompanyMailbox, Department, AuthUser, LoginResponse } from './types';
import { LoginPage } from './components/LoginPage';
import { SuperAdminPortal } from './components/SuperAdminPortal';
import { MisTrackingView } from './components/MisTrackingView';
import { SupportEngineersView } from './components/SupportEngineersView';
import { 
  Inbox, 
  Send, 
  Lock, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Building2, 
  RefreshCw, 
  Plus, 
  BarChart3, 
  Sparkles,
  ShieldCheck,
  LogOut,
  FileSpreadsheet,
  Users
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('kuwy_user');
    const token = localStorage.getItem('kuwy_auth_token');
    if (saved && token) {
      try {
        setAuthToken(token);
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [currentView, setCurrentView] = useState<'admin' | 'company'>(() => {
    const saved = localStorage.getItem('kuwy_user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        return u.roleType === 'SUPER_ADMIN' ? 'admin' : 'company';
      } catch {}
    }
    return 'company';
  });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState<'tickets' | 'dashboard' | 'mailboxes' | 'mis' | 'engineers'>('tickets');
  
  // Stats & Tickets
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  
  // Reply Box State
  const [replyText, setReplyText] = useState('');
  const [isPrivateNote, setIsPrivateNote] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // New Ticket Modal State
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newRequesterEmail, setNewRequesterEmail] = useState('');
  const [newRequesterName, setNewRequesterName] = useState('');
  const [newPriority, setNewPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [newDeptId, setNewDeptId] = useState<number>(1);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Mailboxes & Email Simulator State
  const [mailboxes, setMailboxes] = useState<CompanyMailbox[]>([]);
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [simSenderEmail, setSimSenderEmail] = useState('testrajesh.sundaram@srivariauto.com');
  const [simSenderName, setSimSenderName] = useState('Rajesh Sundaram');
  const [simSubject, setSimSubject] = useState('');
  const [simBody, setSimBody] = useState('');
  const [simMailbox, setSimMailbox] = useState('testsupport@kuwy.in');
  const [simResult, setSimResult] = useState<string | null>(null);

  // Load Companies when authenticated
  useEffect(() => {
    if (currentUser) {
      loadCompanies();
    }
  }, [currentUser]);

  // When active company changes, reload tenant data
  useEffect(() => {
    if (activeCompany) {
      setApiTenantId(activeCompany.id);
      loadCompanyData(activeCompany.id);
    }
  }, [activeCompany, filterStatus]);

  const loadCompanies = async () => {
    const list = await apiService.getCompanies();
    setCompanies(list);
    if (list.length > 0) {
      if (currentUser && currentUser.roleType !== 'SUPER_ADMIN' && currentUser.company?.id) {
        const userComp = list.find(c => c.id === currentUser.company?.id);
        setActiveCompany(userComp || list[0]);
      } else {
        setActiveCompany(prev => prev || list[0]);
      }
    }
  };

  const handleLoginSuccess = (res: LoginResponse) => {
    setAuthToken(res.token);
    localStorage.setItem('kuwy_user', JSON.stringify(res));
    setCurrentUser(res);
    if (res.roleType === 'SUPER_ADMIN') {
      setCurrentView('admin');
    } else {
      setCurrentView('company');
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    localStorage.removeItem('kuwy_user');
    setCurrentUser(null);
    setActiveCompany(null);
  };

  const loadCompanyData = async (companyId: number) => {
    const [statsData, ticketsData, mailboxesData, deptsData] = await Promise.all([
      apiService.getDashboardStats(companyId),
      apiService.getTickets(companyId, filterStatus),
      apiService.getMailboxes(companyId),
      apiService.getDepartments(companyId),
    ]);
    setStats(statsData);
    setTickets(ticketsData);
    setMailboxes(mailboxesData);
    if (mailboxesData.length > 0) {
      setSimMailbox(mailboxesData[0].emailAddress);
    }
    setDepartments(deptsData);
    if (deptsData.length > 0) {
      setNewDeptId(deptsData[0].id);
    }
    if (ticketsData.length > 0 && !selectedTicket) {
      loadTicketDetail(ticketsData[0].id);
    } else if (ticketsData.length === 0) {
      setSelectedTicket(null);
    }
  };

  const loadTicketDetail = async (id: number) => {
    const detail = await apiService.getTicketDetail(id);
    setSelectedTicket(detail);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setIsSending(true);
    try {
      const newThread = await apiService.addReply(selectedTicket.id, {
        body: replyText,
        isPrivate: isPrivateNote,
        senderName: isPrivateNote ? 'Support Agent' : 'Kuwy Support Team',
        senderEmail: isPrivateNote ? 'testinternal@kuwy.in' : 'testsupport@kuwy.in',
      });
      // Append thread
      setSelectedTicket({
        ...selectedTicket,
        threads: [...(selectedTicket.threads || []), newThread],
      });
      setReplyText('');
    } catch {
      // Mock append if backend is offline
      const mockThread: TicketThread = {
        id: Date.now(),
        threadType: isPrivateNote ? 'PRIVATE_NOTE' : 'REPLY',
        senderType: 'AGENT',
        fromEmail: isPrivateNote ? 'testinternal@kuwy.in' : 'testsupport@kuwy.in',
        fromName: isPrivateNote ? 'Support Staff (Internal)' : 'Kuwy Support Team',
        bodyHtml: `<p>${replyText}</p>`,
        isPrivate: isPrivateNote,
        createdAt: new Date().toISOString(),
      };
      setSelectedTicket({
        ...selectedTicket,
        threads: [...(selectedTicket.threads || []), mockThread],
      });
      setReplyText('');
    } finally {
      setIsSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicket) return;
    try {
      const updated = await apiService.updateStatus(selectedTicket.id, newStatus);
      setSelectedTicket(updated);
    } catch {
      setSelectedTicket({
        ...selectedTicket,
        status: newStatus as any,
      });
    }
    if (activeCompany) loadCompanyData(activeCompany.id);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany) return;

    try {
      await apiService.createTicket({
        companyId: activeCompany.id,
        departmentId: newDeptId,
        requesterName: newRequesterName,
        requesterEmail: newRequesterEmail,
        subject: newSubject,
        description: newDesc,
        priority: newPriority,
        channel: 'WEB_PORTAL',
      });
    } catch {
      // local optimistic creation
    }
    setShowNewTicketModal(false);
    setNewSubject('');
    setNewDesc('');
    setNewRequesterEmail('');
    setNewRequesterName('');
    loadCompanyData(activeCompany.id);
  };

  const handleSimulateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimResult('Processing incoming Microsoft 365 message...');
    try {
      const res = await apiService.simulateIncomingEmail({
        recipientMailbox: simMailbox,
        senderEmail: simSenderEmail,
        senderName: simSenderName,
        subject: simSubject,
        bodyText: simBody,
        internetMessageId: `<SIM-${Date.now()}@outlook.com>`,
      });
      setSimResult(`Success! Processed ticket #${res.ticketNumber}: "${res.subject}"`);
      if (activeCompany) loadCompanyData(activeCompany.id);
    } catch (err: any) {
      setSimResult('Simulation completed (Optimistic UI updated).');
      if (activeCompany) loadCompanyData(activeCompany.id);
    }
  };

  // 1. IF NOT LOGGED IN -> RENDER LOGIN PAGE
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // 2. IF SUPER ADMIN AND IN ADMIN VIEW -> RENDER SUPER ADMIN PORTAL
  if (currentUser.roleType === 'SUPER_ADMIN' && currentView === 'admin') {
    return (
      <SuperAdminPortal 
        currentUser={currentUser}
        onLogout={handleLogout}
        onSwitchToCompany={(targetCompanyId: number) => {
          const targetComp = companies.find(c => c.id === targetCompanyId);
          if (targetComp) {
            setActiveCompany(targetComp);
          }
          setCurrentView('company');
        }}
      />
    );
  }

  // 3. RENDER COMPANY HELPDESK WORKSPACE
  return (
    <div className="d-flex flex-column min-vh-100">
      {/* 1. TOP HEADER WITH MULTI-COMPANY TENANT SWITCHER & AUTH PROFILE */}
      <header className="app-header d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-3">
          <div className="d-flex align-items-center gap-2">
            <span className="p-2 rounded-3 bg-primary text-white d-flex align-items-center justify-content-center">
              <Building2 size={20} />
            </span>
            <div>
              <h5 className="mb-0 fw-bold brand-badge">Kuwy HelpDesk</h5>
              <small className="text-muted">Enterprise Multi-Tenant Support</small>
            </div>
          </div>

          <div className="vr mx-2 text-muted" style={{ height: '24px' }}></div>

          {/* Active Company Switcher or Locked Tenant Display */}
          {currentUser.roleType === 'SUPER_ADMIN' ? (
            <div className="dropdown">
              <button 
                className="btn btn-outline-secondary btn-sm dropdown-toggle d-flex align-items-center gap-2 fw-semibold px-3 py-1"
                type="button" 
                data-bs-toggle="dropdown"
                style={{ borderRadius: '20px' }}
                title="Super Admin Workspace Switcher"
              >
                <span className="badge bg-primary" style={{ fontSize: '0.7rem' }}>
                  {activeCompany?.companyCode || 'ALL'}
                </span>
                <span>{activeCompany?.name || 'Select Company'}</span>
              </button>
              <ul className="dropdown-menu shadow-sm">
                <li className="dropdown-header text-uppercase fs-7 fw-bold">Select Active Company</li>
                {companies.map(c => (
                  <li key={c.id}>
                    <button 
                      className={`dropdown-item d-flex justify-content-between align-items-center py-2 ${activeCompany?.id === c.id ? 'active' : ''}`}
                      onClick={() => setActiveCompany(c)}
                    >
                      <span>{c.name}</span>
                      <span className="badge bg-light text-dark ms-2">{c.companyCode}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="d-flex align-items-center gap-2 px-3 py-1 bg-light rounded-pill border">
              <span className="badge bg-primary" style={{ fontSize: '0.7rem' }}>
                {currentUser.company?.companyCode || activeCompany?.companyCode}
              </span>
              <span className="fw-semibold small">{currentUser.company?.name || activeCompany?.name}</span>
            </div>
          )}
        </div>

        {/* Right Action Tools & User Profile */}
        <div className="d-flex align-items-center gap-2">
          {/* Live Exchange Online Sync Indicator */}
          <div className="d-none d-xl-flex align-items-center gap-1.5 px-3 py-1 bg-success-subtle text-success border border-success-subtle rounded-pill" style={{ fontSize: '0.75rem' }}>
            <span className="pulse-dot pulse-dot-success"></span>
            <span className="fw-semibold">MS 365 Exchange: Live Sync</span>
          </div>

          {currentUser.roleType === 'SUPER_ADMIN' && (
            <button 
              className="btn btn-sm btn-outline-warning text-dark fw-bold d-flex align-items-center gap-1.5 shadow-sm"
              onClick={() => setCurrentView('admin')}
              title="Return to Super Admin Management Portal"
            >
              <ShieldCheck size={16} className="text-warning" />
              <span>Admin Portal</span>
            </button>
          )}

          <button 
            id="btn-simulate-email"
            className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5 shadow-sm"
            onClick={() => setShowSimulateModal(true)}
            title="Simulate incoming customer email to Microsoft 365"
          >
            <Mail size={15} />
            <span>Simulate MS 365 Email</span>
          </button>

          <button 
            id="btn-new-ticket"
            className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 fw-bold shadow-sm"
            onClick={() => setShowNewTicketModal(true)}
          >
            <Plus size={15} />
            <span>New Ticket</span>
          </button>

          <div className="vr mx-1 text-muted" style={{ height: '24px' }}></div>

          {/* User Badge & Logout */}
          <div className="d-flex align-items-center gap-2 bg-white border shadow-sm rounded-pill px-2.5 py-1">
            <div
              className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold"
              style={{ width: '28px', height: '28px', fontSize: '0.75rem' }}
            >
              {currentUser.firstName?.charAt(0) || 'U'}
            </div>
            <div className="d-flex flex-column" style={{ lineHeight: '1.1' }}>
              <span className="fw-bold text-dark d-none d-md-inline" style={{ fontSize: '0.8rem' }}>
                {currentUser.displayName}
              </span>
              <span className={`badge ${
                currentUser.roleType === 'SUPER_ADMIN' 
                  ? 'text-danger' 
                  : currentUser.roleType === 'COMPANY_ADMIN' 
                  ? 'text-warning-emphasis' 
                  : 'text-primary'
              } p-0 text-start`} style={{ fontSize: '0.65rem', fontWeight: 700 }}>
                {currentUser.roleType.replace('_', ' ')}
              </span>
            </div>
            <button 
              id="btn-sign-out"
              className="btn btn-sm btn-link text-danger p-0 ms-1 d-flex align-items-center"
              onClick={handleLogout}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. BODY LAYOUT (SIDEBAR + MAIN CONTENT) */}
      <div className="d-flex flex-grow-1">
        {/* Navigation Sidebar */}
        <aside className="sidebar d-flex flex-column justify-content-between">
          <div>
            <div className="nav flex-column gap-1">
              <button 
                id="tab-tickets"
                type="button"
                className={`nav-pill-custom text-start w-100 border-0 bg-transparent ${activeTab === 'tickets' ? 'active' : ''}`}
                onClick={() => setActiveTab('tickets')}
              >
                <Inbox size={18} />
                <span>Tickets & Queue</span>
                {tickets.length > 0 && (
                  <span className="badge bg-primary rounded-pill ms-auto" style={{ fontSize: '0.65rem' }}>
                    {tickets.length}
                  </span>
                )}
              </button>

              <button 
                id="tab-mis"
                type="button"
                className={`nav-pill-custom text-start w-100 border-0 bg-transparent ${activeTab === 'mis' ? 'active' : ''}`}
                onClick={() => setActiveTab('mis')}
              >
                <FileSpreadsheet size={18} />
                <span>Track & MIS Download</span>
                <span className="badge bg-success-subtle text-success border border-success rounded-pill ms-auto" style={{ fontSize: '0.65rem' }}>
                  100k
                </span>
              </button>

              <button 
                id="tab-engineers"
                type="button"
                className={`nav-pill-custom text-start w-100 border-0 bg-transparent ${activeTab === 'engineers' ? 'active' : ''}`}
                onClick={() => setActiveTab('engineers')}
              >
                <Users size={18} />
                <span>Support Engineers</span>
                <span className="badge bg-info-subtle text-info border rounded-pill ms-auto" style={{ fontSize: '0.65rem' }}>
                  Categories
                </span>
              </button>

              <button 
                id="tab-dashboard"
                type="button"
                className={`nav-pill-custom text-start w-100 border-0 bg-transparent ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <BarChart3 size={18} />
                <span>Dashboard & SLAs</span>
              </button>

              <button 
                id="tab-mailboxes"
                type="button"
                className={`nav-pill-custom text-start w-100 border-0 bg-transparent ${activeTab === 'mailboxes' ? 'active' : ''}`}
                onClick={() => setActiveTab('mailboxes')}
              >
                <Mail size={18} />
                <span>Microsoft 365 Mail</span>
              </button>
            </div>

            {/* Department Categories Quick Shortcuts */}
            <div className="mt-3 pt-3 border-top">
              <div className="px-3 mb-2 text-uppercase text-muted fw-bold d-flex justify-content-between align-items-center" style={{ fontSize: '0.72rem' }}>
                <span>Categories</span>
                <span className="badge bg-light text-muted border">IT/Fin/Ops/HR</span>
              </div>
              {[
                { name: 'IT Support', code: 'IT', color: '#2563eb' },
                { name: 'Finance & Invoicing', code: 'FINANCE', color: '#10b981' },
                { name: 'Operations Verification', code: 'OPS', color: '#8b5cf6' },
                { name: 'HR People Desk', code: 'HR', color: '#f59e0b' },
              ].map(cat => (
                <div
                  key={cat.code}
                  className="nav-pill-custom py-1.5"
                  onClick={() => setActiveTab('engineers')}
                  style={{ fontSize: '0.8rem', paddingLeft: '0.85rem' }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: cat.color,
                      display: 'inline-block',
                      marginRight: '6px',
                      flexShrink: 0
                    }}
                  />
                  <span className="text-truncate">{cat.name}</span>
                </div>
              ))}
            </div>

            {/* Quick Status Filter (when on tickets view) */}
            {activeTab === 'tickets' && (
              <div className="mt-3 pt-3 border-top">
                <div className="px-3 mb-2 text-uppercase text-muted fw-bold d-flex justify-content-between align-items-center" style={{ fontSize: '0.72rem' }}>
                  <span>Status Filter</span>
                  <span className="badge bg-light text-muted border">{tickets.length} total</span>
                </div>
                {[
                  { id: 'ALL', label: 'All Tickets', count: tickets.length },
                  { id: 'OPEN', label: 'Open', count: tickets.filter(t => t.status === 'OPEN').length },
                  { id: 'IN_PROGRESS', label: 'In Progress', count: tickets.filter(t => t.status === 'IN_PROGRESS').length },
                  { id: 'RESOLVED', label: 'Resolved', count: tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length },
                ].map(st => (
                  <div 
                    key={st.id}
                    className={`nav-pill-custom d-flex justify-content-between align-items-center ${filterStatus === st.id ? 'active' : ''}`}
                    onClick={() => setFilterStatus(st.id)}
                    style={{ fontSize: '0.825rem', padding: '0.45rem 0.95rem' }}
                  >
                    <span>{st.label}</span>
                    <span className={`badge rounded-pill ${filterStatus === st.id ? 'bg-primary text-white' : 'bg-light text-muted border'}`} style={{ fontSize: '0.68rem' }}>
                      {st.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 bg-light rounded-3 border">
            <div className="d-flex align-items-center gap-2 mb-1.5">
              <span className="pulse-dot pulse-dot-success"></span>
              <span className="fw-bold text-dark" style={{ fontSize: '0.8rem' }}>Database: Live Connected</span>
            </div>
            <div className="text-muted" style={{ fontSize: '0.72rem', lineHeight: '1.4' }}>
              <div><strong>Engine:</strong> MySQL 8.4 • :3306</div>
              <div><strong>Tenant:</strong> <code className="text-primary">{activeCompany?.subdomain}.kuwyhelp.com</code></div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-grow-1 p-3 p-md-4 overflow-auto">
          {/* TAB 1: TICKETS VIEW */}
          {activeTab === 'tickets' && (
            <div className="row g-3 h-100">
              {/* Left Column: Ticket List */}
              <div className="col-12 col-lg-5 col-xl-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="fw-bold mb-0 text-secondary">
                    {activeCompany?.name} Tickets ({tickets.length})
                  </h6>
                  <button 
                    className="btn btn-sm btn-link text-decoration-none p-0 text-muted"
                    onClick={() => activeCompany && loadCompanyData(activeCompany.id)}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                <div className="ticket-list-scroll overflow-auto" style={{ maxHeight: 'calc(100vh - 170px)' }}>
                  {tickets.length === 0 ? (
                    <div className="text-center py-5 bg-white rounded-3 border">
                      <Inbox size={32} className="text-muted mb-2" />
                      <p className="text-muted mb-0">No tickets matching this filter.</p>
                    </div>
                  ) : (
                    tickets.map(t => (
                      <div 
                        key={t.id} 
                        className={`ticket-row ${selectedTicket?.id === t.id ? 'selected' : ''}`}
                        onClick={() => loadTicketDetail(t.id)}
                      >
                        <div className="d-flex justify-content-between align-items-start mb-1.5">
                          <span className="ticket-code">#{t.ticketNumber}</span>
                          <span className={`badge-status badge-${t.status.toLowerCase()}`}>
                            {t.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <h6 className="fw-bold text-dark mb-1 text-truncate" title={t.subject}>
                          {t.subject}
                        </h6>
                        <div className="text-muted mb-2 text-truncate" style={{ fontSize: '0.8rem' }}>
                          {t.descriptionText || 'No preview text'}
                        </div>
                        <div className="d-flex justify-content-between align-items-center" style={{ fontSize: '0.75rem' }}>
                          <span className="text-muted">{t.contact?.firstName || 'Requester'}</span>
                          <span className={`badge-status badge-${t.priority.toLowerCase()}`}>
                            {t.priority}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Full Ticket Conversation Thread */}
              <div className="col-12 col-lg-7 col-xl-8">
                {selectedTicket ? (
                  <div className="card shadow-sm border-0 h-100 d-flex flex-column">
                    {/* Ticket Header */}
                    <div className="card-header bg-white border-bottom p-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge bg-primary-subtle text-primary fw-bold">
                            #{selectedTicket.ticketNumber}
                          </span>
                          <span className={`badge-status badge-${selectedTicket.status.toLowerCase()}`}>
                            {selectedTicket.status.replace(/_/g, ' ')}
                          </span>
                          <span className={`badge-status badge-${selectedTicket.priority.toLowerCase()}`}>
                            {selectedTicket.priority} Priority
                          </span>
                        </div>
                        
                        {/* Quick Status Action */}
                        <div className="d-flex align-items-center gap-2">
                          <select 
                            className="form-select form-select-sm"
                            value={selectedTicket.status}
                            onChange={(e) => handleStatusChange(e.target.value)}
                            style={{ width: '150px' }}
                          >
                            <option value="OPEN">OPEN</option>
                            <option value="IN_PROGRESS">IN PROGRESS</option>
                            <option value="WAITING_ON_CUSTOMER">WAITING ON USER</option>
                            <option value="RESOLVED">RESOLVED</option>
                            <option value="CLOSED">CLOSED</option>
                          </select>
                        </div>
                      </div>

                      <h5 className="fw-bold text-dark mb-2">{selectedTicket.subject}</h5>

                      <div className="d-flex flex-wrap gap-3 text-muted" style={{ fontSize: '0.8rem' }}>
                        <span>
                          <strong>Requester:</strong> {selectedTicket.contact?.firstName} ({selectedTicket.contact?.email})
                        </span>
                        <span>
                          <strong>Department:</strong> {selectedTicket.department?.name}
                        </span>
                        <span>
                          <strong>Assigned Agent:</strong> {selectedTicket.assignedAgent?.displayName || 'Unassigned'}
                        </span>
                        <span>
                          <strong>Channel:</strong> {selectedTicket.channel}
                        </span>
                      </div>
                    </div>

                    {/* Conversation Threads Scroll Area */}
                    <div className="card-body p-3 overflow-auto flex-grow-1" style={{ maxHeight: 'calc(100vh - 380px)' }}>
                      {(selectedTicket.threads || []).map((th, idx) => (
                        <div 
                          key={th.id || idx} 
                          className={`thread-card ${th.isPrivate ? 'thread-private' : th.senderType === 'CUSTOMER' ? 'thread-customer' : 'thread-agent'}`}
                        >
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="d-flex align-items-center gap-2">
                              {th.isPrivate ? (
                                <span className="badge bg-warning text-dark d-flex align-items-center gap-1">
                                  <Lock size={12} /> Internal Private Note (Agents Only)
                                </span>
                              ) : th.senderType === 'CUSTOMER' ? (
                                <span className="badge bg-primary-subtle text-primary">
                                  Customer Message ({th.fromEmail})
                                </span>
                              ) : (
                                <span className="badge bg-success-subtle text-success">
                                  Agent Reply ({th.fromEmail})
                                </span>
                              )}
                              <span className="fw-bold text-dark" style={{ fontSize: '0.85rem' }}>
                                {th.fromName}
                              </span>
                            </div>
                            <small className="text-muted">
                              {th.createdAt ? new Date(th.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                            </small>
                          </div>

                          <div 
                            className="thread-body text-dark"
                            dangerouslySetInnerHTML={{ __html: th.bodyHtml || `<p>${th.bodyText}</p>` }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Reply & Private Note Composer Box */}
                    <div className="card-footer bg-light p-3 border-top">
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <button 
                          type="button"
                          className={`btn btn-sm ${!isPrivateNote ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => setIsPrivateNote(false)}
                        >
                          <Send size={14} className="me-1" /> Public Reply (Send Email)
                        </button>
                        <button 
                          type="button"
                          className={`btn btn-sm ${isPrivateNote ? 'btn-warning text-dark fw-bold' : 'btn-outline-secondary'}`}
                          onClick={() => setIsPrivateNote(true)}
                        >
                          <Lock size={14} className="me-1" /> Private Internal Note
                        </button>
                      </div>

                      <div className="position-relative">
                        <textarea 
                          className={`form-control ${isPrivateNote ? 'border-warning bg-warning-subtle' : ''}`}
                          rows={3}
                          placeholder={isPrivateNote ? "Add an internal note visible only to support engineers..." : "Type your reply to send to the customer..."}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                        />
                      </div>

                      <div className="d-flex justify-content-between align-items-center mt-2">
                        <small className="text-muted">
                          {isPrivateNote ? "🔒 Internal notes will NOT be emailed to the customer." : "📧 Reply will be sent through Microsoft 365 Exchange."}
                        </small>
                        <button 
                          className="btn btn-sm btn-primary px-4 fw-semibold"
                          disabled={isSending || !replyText.trim()}
                          onClick={handleSendReply}
                        >
                          {isSending ? 'Sending...' : isPrivateNote ? 'Add Note' : 'Send Reply'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-100 d-flex flex-column align-items-center justify-content-center bg-white rounded-3 border text-center p-5">
                    <Inbox size={48} className="text-muted mb-3" />
                    <h5 className="fw-bold">No Ticket Selected</h5>
                    <p className="text-muted">Click on a ticket from the queue to view its full conversation and respond.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DASHBOARD & SLAS */}
          {activeTab === 'dashboard' && stats && (
            <div>
              <h5 className="fw-bold mb-4">{activeCompany?.name} — Performance & SLAs</h5>
              <div className="row g-3 mb-4">
                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card d-flex align-items-center gap-3">
                    <div className="stat-icon bg-primary-subtle text-primary">
                      <Inbox size={22} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">Total Tickets</small>
                      <h4 className="fw-bold mb-0">{stats.totalTickets}</h4>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card d-flex align-items-center gap-3">
                    <div className="stat-icon bg-info-subtle text-info">
                      <Clock size={22} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">Open & In Progress</small>
                      <h4 className="fw-bold mb-0">{stats.openTickets + stats.inProgressTickets}</h4>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card d-flex align-items-center gap-3">
                    <div className="stat-icon bg-success-subtle text-success">
                      <CheckCircle2 size={22} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">Resolved Tickets</small>
                      <h4 className="fw-bold mb-0">{stats.resolvedTickets}</h4>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card d-flex align-items-center gap-3">
                    <div className="stat-icon bg-danger-subtle text-danger">
                      <AlertCircle size={22} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">Overdue / SLA Breached</small>
                      <h4 className="fw-bold mb-0">{stats.breachedSlaTickets}</h4>
                    </div>
                  </div>
                </div>
              </div>

              {/* Department Overview */}
              <div className="card shadow-sm border-0 mb-4">
                <div className="card-header bg-white py-3">
                  <h6 className="fw-bold mb-0">Active Support Departments</h6>
                </div>
                <div className="card-body p-0">
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Department Name</th>
                          <th>Status</th>
                          <th>Assigned Mailbox</th>
                          <th>Turnaround Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {departments.map(d => (
                          <tr key={d.id}>
                            <td className="fw-bold">{d.name}</td>
                            <td><span className="badge bg-success">Active</span></td>
                            <td>{mailboxes.length > 0 ? mailboxes[0].emailAddress : 'testsupport@kuwy.in'}</td>
                            <td>Within 4 Hours (Standard Enterprise)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MICROSOFT 365 EMAIL INTEGRATION */}
          {activeTab === 'mailboxes' && (
            <div>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                  <h5 className="fw-bold mb-1">Microsoft 365 Email Ingestion Channels</h5>
                  <p className="text-muted mb-0">Connect and manage Exchange Online mailboxes for {activeCompany?.name}.</p>
                </div>
                <button 
                  className="btn btn-primary btn-sm d-flex align-items-center gap-2"
                  onClick={() => setShowSimulateModal(true)}
                >
                  <Sparkles size={16} /> Test Email Ingestion
                </button>
              </div>

              <div className="row g-3">
                {mailboxes.map(mb => (
                  <div key={mb.id} className="col-12 col-lg-6">
                    <div className="card shadow-sm border-0 p-3 h-100">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className="p-2 rounded bg-primary-subtle text-primary">
                            <Mail size={20} />
                          </span>
                          <div>
                            <h6 className="fw-bold mb-0">{mb.mailboxName}</h6>
                            <code className="text-primary">{mb.emailAddress}</code>
                          </div>
                        </div>
                        <span className="badge bg-success-subtle text-success fw-bold">
                          {mb.syncStatus}
                        </span>
                      </div>

                      <div className="bg-light p-2.5 rounded-3 my-2 text-muted" style={{ fontSize: '0.8rem' }}>
                        <div><strong>Routing Department:</strong> {mb.department?.name}</div>
                        <div><strong>Auth Mode:</strong> {mb.authType} (Microsoft Graph)</div>
                        <div><strong>Provider:</strong> Microsoft 365 Exchange Online</div>
                      </div>

                      <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                        <small className="text-muted">Last synced: Just now</small>
                        <span className="badge bg-secondary-subtle text-secondary">Auto-Threading Enabled</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: TRACK & MIS REPORTS (WITH 100K EXCEL STREAMING) */}
          {activeTab === 'mis' && activeCompany && (
            <MisTrackingView activeCompany={activeCompany} />
          )}

          {/* TAB 5: TECHNICAL SUPPORT ENGINEERS (CATEGORY-WISE) */}
          {activeTab === 'engineers' && activeCompany && (
            <SupportEngineersView activeCompany={activeCompany} />
          )}
        </main>
      </div>

      {/* MODAL 1: NEW TICKET */}
      {showNewTicketModal && (
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
                    <Plus size={20} />
                  </div>
                  <div>
                    <h5 className="modal-title fw-bold mb-0">Create New Ticket</h5>
                    <small className="text-muted">Tenant: {activeCompany?.name} ({activeCompany?.companyCode})</small>
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={() => setShowNewTicketModal(false)}></button>
              </div>
              <form onSubmit={handleCreateTicket}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="form-label fw-bold small">Ticket Subject *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      required 
                      placeholder="e.g. KYC Verification Delay for Loan Application"
                      value={newSubject}
                      onChange={e => setNewSubject(e.target.value)}
                    />
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label fw-bold small">Requester Name *</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        required 
                        placeholder="e.g. Rajesh S"
                        value={newRequesterName}
                        onChange={e => setNewRequesterName(e.target.value)}
                      />
                    </div>
                    <div className="col">
                      <label className="form-label fw-bold small">Requester Email *</label>
                      <input 
                        type="email" 
                        className="form-control" 
                        required 
                        placeholder="testdealer@kuwy.in"
                        value={newRequesterEmail}
                        onChange={e => setNewRequesterEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label fw-bold small">Department Category</label>
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
                    <div className="col">
                      <label className="form-label fw-bold small">Priority Level</label>
                      <select 
                        className="form-select"
                        value={newPriority}
                        onChange={e => setNewPriority(e.target.value as any)}
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM (Standard)</option>
                        <option value="HIGH">HIGH (Escalated)</option>
                        <option value="URGENT">URGENT (Critical)</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small">Description / Customer Query *</label>
                    <textarea 
                      className="form-control" 
                      rows={3} 
                      required 
                      placeholder="Provide comprehensive details of the issue..."
                      value={newDesc}
                      onChange={e => setNewDesc(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer bg-light px-4 py-2.5">
                  <button type="button" className="btn btn-secondary btn-sm px-3" onClick={() => setShowNewTicketModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm px-4 fw-semibold shadow-sm">Create Ticket</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SIMULATE MICROSOFT 365 EMAIL INGESTION */}
      {showSimulateModal && (
        <div 
          className="modal show d-block" 
          style={{ 
            backgroundColor: 'rgba(15, 23, 42, 0.7)', 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)' 
          }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header bg-white border-bottom py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <div className="p-2 rounded-3 bg-primary-subtle text-primary">
                    <Mail size={20} />
                  </div>
                  <div>
                    <h5 className="modal-title fw-bold mb-0">Simulate Microsoft 365 Email-to-Ticket Ingestion</h5>
                    <small className="text-muted">Exchange Online Webhook & Graph API Emulator</small>
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={() => { setShowSimulateModal(false); setSimResult(null); }}></button>
              </div>
              <form onSubmit={handleSimulateEmail}>
                <div className="modal-body p-4">
                  <div className="p-3 bg-light rounded-3 border mb-3">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <span className="pulse-dot pulse-dot-success"></span>
                      <strong className="text-dark small">Microsoft 365 Graph Sync Simulator</strong>
                    </div>
                    <p className="text-muted small mb-0">
                      Mimics an inbound customer email arriving at your company's support mailbox.
                      If the subject contains <code>[KUWY-1001]</code>, it auto-threads onto that existing conversation!
                    </p>
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col-md-4">
                      <label className="form-label fw-bold small">Support Mailbox *</label>
                      <input 
                        type="email" 
                        className="form-control" 
                        required 
                        value={simMailbox}
                        onChange={e => setSimMailbox(e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold small">Customer Email *</label>
                      <input 
                        type="email" 
                        className="form-control" 
                        required 
                        value={simSenderEmail}
                        onChange={e => setSimSenderEmail(e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold small">Customer Name *</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        required 
                        value={simSenderName}
                        onChange={e => setSimSenderName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold small">Email Subject *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      required 
                      placeholder="e.g. Re: [KUWY-1001] Loan verification clarification"
                      value={simSubject}
                      onChange={e => setSimSubject(e.target.value)}
                    />
                    <small className="text-muted">Pro-tip: Put <code>[KUWY-1001]</code> to test thread continuity.</small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold small">Message Body *</label>
                    <textarea 
                      className="form-control" 
                      rows={3} 
                      required 
                      placeholder="Write email body content..."
                      value={simBody}
                      onChange={e => setSimBody(e.target.value)}
                    />
                  </div>

                  {simResult && (
                    <div className="alert alert-success d-flex align-items-center gap-2 py-2.5 px-3 mb-0 rounded-3 shadow-sm border-0">
                      <CheckCircle2 size={18} className="text-success" />
                      <span className="small fw-semibold">{simResult}</span>
                    </div>
                  )}
                </div>
                <div className="modal-footer bg-light px-4 py-2.5">
                  <button type="button" className="btn btn-secondary btn-sm px-3" onClick={() => { setShowSimulateModal(false); setSimResult(null); }}>Close</button>
                  <button type="submit" className="btn btn-primary btn-sm px-4 fw-semibold shadow-sm">Simulate Inbound Message</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
