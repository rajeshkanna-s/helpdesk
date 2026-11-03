import React, { useState, useEffect } from 'react';
import {
  Inbox, Send, Lock, Mail, CheckCircle2, AlertCircle, Clock,
  Building2, RefreshCw, Plus, BarChart3, Sparkles,
  LogOut, FileSpreadsheet, Users, Search, ChevronRight, ArrowLeft,
  BookOpen, Zap, Play, Pause, RotateCcw, SlidersHorizontal,
  Paperclip, FileText, Image as ImageIcon, Download, Eye, File, X,
  CreditCard, Globe, ExternalLink
} from 'lucide-react';
import { apiService, setApiTenantId } from '../services/api';
import type {
  Company, DashboardStats, Ticket, TicketThread, CompanyMailbox,
  Department, AuthUser, User, KbArticle, ScenarioMacro, TicketAttachment,
  CannedResponse, CompanySubscription
} from '../types';
import { MisTrackingView } from './MisTrackingView';
import { SupportEngineersView } from './SupportEngineersView';
import { EmailForwardingModal } from './EmailForwardingModal';

export type WorkspaceTab =
  | 'tickets'
  | 'dashboard'
  | 'engineers'
  | 'mis'
  | 'mailboxes'
  | 'solutions'
  | 'automations'
  | 'billing';

interface CompanyWorkspaceProps {
  currentUser: AuthUser;
  activeCompany: Company;
  companies: Company[];
  onSwitchCompany: (company: Company) => void;
  onSwitchToAdmin: () => void;
  onLogout: () => void;
}

// Pre-configured Scenario Automations (Freshdesk 1-Click Macros)
const PRESET_SCENARIOS: ScenarioMacro[] = [
  {
    id: 'KYC_RESUBMIT',
    title: 'KYC Re-upload Request',
    description: 'Sets status to Waiting on Customer, updates priority to High, and sends re-upload guidelines.',
    badge: 'Operations',
    color: '#8b5cf6',
    targetStatus: 'WAITING_ON_CUSTOMER',
    targetPriority: 'HIGH',
    cannedResponse: 'Discrepancy detected in submitted KYC documents. Please re-upload clear copies of PAN and Aadhaar.'
  },
  {
    id: 'ESCALATE_LEAD',
    title: 'Escalate to Technical Lead',
    description: 'Marks priority as Urgent, routes to IT & Engineering Support, and logs internal escalation note.',
    badge: 'IT Support',
    color: '#ef4444',
    targetStatus: 'IN_PROGRESS',
    targetPriority: 'URGENT',
    cannedResponse: 'Escalated to Senior Technical Engineering Lead for immediate investigation.'
  },
  {
    id: 'LOAN_APPROVED',
    title: 'Loan Verification Approved',
    description: 'Sets ticket status to Resolved, records timestamp, and dispatches approval note to customer.',
    badge: 'Finance',
    color: '#10b981',
    targetStatus: 'RESOLVED',
    cannedResponse: 'Congratulations! Your loan underwriting and verification have been approved.'
  },
  {
    id: 'CUSTOMER_INACTIVE',
    title: 'Customer Inactive Close',
    description: 'Sets status to Closed due to customer non-response after 48-hour follow-up period.',
    badge: 'Queue Triage',
    color: '#64748b',
    targetStatus: 'CLOSED',
    cannedResponse: 'Closing ticket due to absence of customer follow-up after multiple notifications.'
  }
];

export const CompanyWorkspace: React.FC<CompanyWorkspaceProps> = ({
  currentUser,
  activeCompany,
  companies,
  onSwitchCompany,
  onSwitchToAdmin,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('tickets');
  const [agentPresence, setAgentPresence] = useState<'ONLINE' | 'BUSY' | 'AWAY'>('ONLINE');

  // Stats & Tickets
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);
  const [viewFilter, setViewFilter] = useState<string>('ALL');
  const [ticketSearch, setTicketSearch] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'lastMessageAt' | 'createdAt' | 'priority'>('lastMessageAt');

  // Department & Agents
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [mailboxes, setMailboxes] = useState<CompanyMailbox[]>([]);
  const [kbArticles, setKbArticles] = useState<KbArticle[]>([]);

  // Reply Composer State
  const [replyText, setReplyText] = useState('');
  const [isPrivateNote, setIsPrivateNote] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showKbPicker, setShowKbPicker] = useState(false);
  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<CompanySubscription | null>(null);
  const [isUpgradingSub, setIsUpgradingSub] = useState(false);
  const [showScenarioMenu, setShowScenarioMenu] = useState(false);

  // Right Context & Properties Drawer
  const [showPropertiesDrawer, setShowPropertiesDrawer] = useState(true);

  // Time Tracker State
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Interactive To-Do Checklist for active ticket
  const [ticketTodos, setTicketTodos] = useState<Record<number, { id: number; text: string; done: boolean }[]>>({
    1: [
      { id: 1, text: 'Inspect customer PAN & Aadhaar on Bureau', done: true },
      { id: 2, text: 'Verify partner API webhook payload', done: false },
      { id: 3, text: 'Confirm loan disbursement batch', done: false },
    ]
  });

  // Modals state
  const [showForwardingModal, setShowForwardingModal] = useState(false);
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);

  // New Ticket Form State
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newRequesterEmail, setNewRequesterEmail] = useState('');
  const [newRequesterName, setNewRequesterName] = useState('');
  const [newPriority, setNewPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [newDeptId, setNewDeptId] = useState<number>(1);

  // Simulator Form State
  const [simSenderEmail, setSimSenderEmail] = useState('testrajesh.sundaram@srivariauto.com');
  const [simSenderName, setSimSenderName] = useState('Rajesh Sundaram');
  const [simSubject, setSimSubject] = useState('');
  const [simBody, setSimBody] = useState('');
  const [simMailbox, setSimMailbox] = useState('1281753993@tickets.helpdesk.com');
  const [simResult, setSimResult] = useState<string | null>(null);

  // Attachment States & Helpers
  const [newTicketAttachments, setNewTicketAttachments] = useState<File[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<TicketAttachment | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isImageFile = (fileName: string): boolean => {
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName);
  };

  const isPdfFile = (fileName: string): boolean => {
    return /\.pdf$/i.test(fileName);
  };

  // Load Company Workspace Data
  useEffect(() => {
    if (activeCompany) {
      setApiTenantId(activeCompany.id);
      loadCompanyData(activeCompany.id);
    }
  }, [activeCompany, viewFilter, deptFilter, sortBy]);

  // Active Timer Tick
  useEffect(() => {
    let interval: any = null;
    if (timerRunning) {
      interval = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [timerRunning]);

  const showNotification = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setActionNotice({ type, text });
    setTimeout(() => setActionNotice(null), 4000);
  };

  const loadCompanyData = async (companyId: number) => {
    try {
      const [statsData, ticketsData, mailboxesData, deptsData, agentsData, kbData, crData, subData] = await Promise.all([
        apiService.getDashboardStats(companyId).catch(() => null),
        apiService.getTickets(companyId, viewFilter === 'ALL' ? undefined : viewFilter).catch(() => []),
        apiService.getMailboxes(companyId).catch(() => []),
        apiService.getDepartments(companyId).catch(() => []),
        apiService.getAgents(companyId).catch(() => []),
        apiService.getKbArticles(companyId).catch(() => []),
        apiService.getCannedResponses(companyId).catch(() => []),
        apiService.getCurrentSubscription(companyId).catch(() => null),
      ]);

      if (statsData) setStats(statsData);
      setTickets(ticketsData || []);
      setMailboxes(mailboxesData || []);
      setDepartments(deptsData || []);
      setAgents(agentsData || []);
      setKbArticles(kbData || []);
      setCannedResponses(crData || []);
      if (subData) setCurrentSubscription(subData);

      if (mailboxesData.length > 0) {
        setSimMailbox(mailboxesData[0].forwardingAddress || mailboxesData[0].emailAddress);
      }
      if (deptsData.length > 0) {
        setNewDeptId(deptsData[0].id);
      }

      if (ticketsData.length > 0 && !selectedTicket) {
        loadTicketDetail(ticketsData[0].id);
      } else if (ticketsData.length === 0) {
        setSelectedTicket(null);
      }
    } catch {
      // Fallback
    }
  };

  const loadTicketDetail = async (id: number) => {
    const detail = await apiService.getTicketDetail(id);
    setSelectedTicket(detail);
  };

  const handleInsertCannedResponse = (cr: CannedResponse) => {
    const custName = selectedTicket?.contact
      ? `${selectedTicket.contact.firstName} ${selectedTicket.contact.lastName || ''}`.trim()
      : 'Customer';
    const subject = selectedTicket?.subject || 'your inquiry';
    const ticketId = selectedTicket?.ticketNumber || 'TICKET';
    let formatted = cr.content
      .replace(/\{\{customer_name\}\}/g, custName)
      .replace(/\{\{ticket_subject\}\}/g, subject)
      .replace(/\{\{ticket_id\}\}/g, ticketId);
    setReplyText(prev => prev ? `${prev}\n\n${formatted}` : formatted);
    setShowCannedPicker(false);
    showNotification(`Inserted template ${cr.shortcut}`);
  };

  const handleUpgradeSubscription = async (targetPlan: 'FREE' | 'STARTER' | 'PRO') => {
    setIsUpgradingSub(true);
    try {
      const updated = await apiService.upgradeSubscription(targetPlan, 'RAZORPAY');
      setCurrentSubscription(updated);
      showNotification(`Subscription updated to ${targetPlan} plan!`);
    } catch {
      showNotification(`Plan updated to ${targetPlan}.`, 'info');
    } finally {
      setIsUpgradingSub(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setIsSending(true);
    try {
      const newThread = await apiService.addReply(selectedTicket.id, {
        body: replyText,
        isPrivate: isPrivateNote,
        senderName: isPrivateNote ? currentUser.displayName : 'Kuwy Support Team',
        senderEmail: isPrivateNote ? currentUser.email : 'testsupport@kuwy.in',
      });

      if (replyAttachments.length > 0) {
        try {
          const uploadedAtts = await apiService.uploadTicketAttachments(selectedTicket.id, replyAttachments, newThread.id);
          newThread.attachments = uploadedAtts;
          showNotification(`Attached ${replyAttachments.length} document(s) to conversation`);
        } catch (attErr) {
          console.error("Failed to upload reply attachments", attErr);
        }
      }

      setSelectedTicket({
        ...selectedTicket,
        threads: [...(selectedTicket.threads || []), newThread],
      });
      setReplyText('');
      setReplyAttachments([]);
      showNotification(isPrivateNote ? 'Internal note recorded' : 'Reply dispatched to customer');
    } catch {
      const mockThread: TicketThread = {
        id: Date.now(),
        threadType: isPrivateNote ? 'PRIVATE_NOTE' : 'REPLY',
        senderType: 'AGENT',
        fromEmail: isPrivateNote ? currentUser.email : 'testsupport@kuwy.in',
        fromName: isPrivateNote ? `${currentUser.displayName} (Internal)` : 'Kuwy Support Team',
        bodyHtml: `<p>${replyText}</p>`,
        isPrivate: isPrivateNote,
        createdAt: new Date().toISOString(),
      };
      setSelectedTicket({
        ...selectedTicket,
        threads: [...(selectedTicket.threads || []), mockThread],
      });
      setReplyText('');
      showNotification(isPrivateNote ? 'Internal note saved' : 'Reply sent');
    } finally {
      setIsSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicket) return;
    try {
      const updated = await apiService.updateStatus(selectedTicket.id, newStatus);
      setSelectedTicket(updated);
      showNotification(`Ticket #${selectedTicket.ticketNumber} status updated to ${newStatus}`);
    } catch {
      setSelectedTicket({ ...selectedTicket, status: newStatus as any });
    }
    loadCompanyData(activeCompany.id);
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!selectedTicket) return;
    try {
      const updated = await apiService.updatePriority(selectedTicket.id, newPriority);
      setSelectedTicket(updated);
      showNotification(`Priority set to ${newPriority}`);
    } catch {
      setSelectedTicket({ ...selectedTicket, priority: newPriority as any });
    }
    loadCompanyData(activeCompany.id);
  };

  const handleAssignAgent = async (agentId: number) => {
    if (!selectedTicket) return;
    try {
      const updated = await apiService.assignAgent(selectedTicket.id, agentId);
      setSelectedTicket(updated);
      const agent = agents.find(a => a.id === agentId);
      showNotification(`Assigned to ${agent?.displayName || 'Support Engineer'}`);
    } catch {
      // optimistic
    }
    loadCompanyData(activeCompany.id);
  };

  const handleExecuteScenario = async (scenario: ScenarioMacro) => {
    if (!selectedTicket) return;
    setShowScenarioMenu(false);
    try {
      const updated = await apiService.executeScenario(selectedTicket.id, {
        scenarioKey: scenario.id,
        authorName: currentUser.displayName,
      });
      setSelectedTicket(updated);
      showNotification(`Executed macro: "${scenario.title}"`);
      loadCompanyData(activeCompany.id);
    } catch {
      showNotification(`Applied scenario: ${scenario.title}`);
    }
  };

  const handleBulkStatus = async (status: string) => {
    if (selectedTicketIds.length === 0) return;
    await apiService.bulkUpdateTickets({ ticketIds: selectedTicketIds, status });
    showNotification(`Updated ${selectedTicketIds.length} tickets to ${status}`);
    setSelectedTicketIds([]);
    loadCompanyData(activeCompany.id);
  };

  const handleBulkPriority = async (priority: string) => {
    if (selectedTicketIds.length === 0) return;
    await apiService.bulkUpdateTickets({ ticketIds: selectedTicketIds, priority });
    showNotification(`Updated ${selectedTicketIds.length} tickets priority to ${priority}`);
    setSelectedTicketIds([]);
    loadCompanyData(activeCompany.id);
  };

  const handleBulkAssign = async (agentId: number) => {
    if (selectedTicketIds.length === 0) return;
    await apiService.bulkUpdateTickets({ ticketIds: selectedTicketIds, agentId });
    showNotification(`Assigned ${selectedTicketIds.length} tickets`);
    setSelectedTicketIds([]);
    loadCompanyData(activeCompany.id);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiService.createTicket({
        companyId: activeCompany.id,
        departmentId: newDeptId,
        requesterName: newRequesterName,
        requesterEmail: newRequesterEmail,
        subject: newSubject,
        description: newDesc,
        priority: newPriority,
        channel: 'WEB_PORTAL',
      });
      if (created?.id && newTicketAttachments.length > 0) {
        try {
          await apiService.uploadTicketAttachments(created.id, newTicketAttachments);
          showNotification(`Created #${created.ticketNumber} with ${newTicketAttachments.length} document(s) attached`);
        } catch (attErr) {
          console.error("Failed to upload ticket attachments", attErr);
          showNotification(`Ticket #${created.ticketNumber} created successfully`);
        }
      } else {
        showNotification(`Ticket #${created.ticketNumber} created successfully`);
      }
    } catch {
      showNotification('Ticket created (optimistic)');
    }
    setShowNewTicketModal(false);
    setNewSubject('');
    setNewDesc('');
    setNewRequesterEmail('');
    setNewRequesterName('');
    setNewTicketAttachments([]);
    loadCompanyData(activeCompany.id);
  };

  const handleSimulateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimResult('Processing incoming message...');
    try {
      const res = await apiService.simulateIncomingEmail({
        recipientMailbox: simMailbox,
        senderEmail: simSenderEmail,
        senderName: simSenderName,
        subject: simSubject,
        bodyText: simBody,
        internetMessageId: `<SIM-${Date.now()}@outlook.com>`,
      });
      setSimResult(`Success! Created/Threaded Ticket #${res.ticketNumber}: "${res.subject}"`);
      showNotification(`Inbound email ingested: Ticket #${res.ticketNumber}`);
      loadCompanyData(activeCompany.id);
    } catch {
      setSimResult('Simulated message processed.');
      loadCompanyData(activeCompany.id);
    }
  };

  // Filter tickets by search and department
  const filteredTickets = tickets.filter(t => {
    if (deptFilter && t.department?.id !== deptFilter) return false;
    if (!ticketSearch.trim()) return true;
    const q = ticketSearch.toLowerCase();
    return (
      t.ticketNumber.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.contact?.firstName || '').toLowerCase().includes(q) ||
      (t.contact?.email || '').toLowerCase().includes(q)
    );
  });

  // Sort Tickets (HelpDesk.com style: lastMessageAt default)
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    if (sortBy === 'priority') {
      const pMap: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const tabLabels: Record<WorkspaceTab, { title: string; subtitle: string }> = {
    tickets: {
      title: 'Ticket Queue & Command Center',
      subtitle: 'Triage omnichannel cases, execute scenarios, and track SLAs',
    },
    dashboard: {
      title: 'Operational Analytics & SLA Telemetry',
      subtitle: 'Real-time performance indicators and department turnaround targets',
    },
    engineers: {
      title: 'Category Support Engineers',
      subtitle: 'Manage specialized staff across IT, Finance, Operations, HR & Legal',
    },
    mis: {
      title: 'Enterprise MIS Reports & 100k Streaming',
      subtitle: 'High-volume ticket telemetry and memory-safe streaming exports',
    },
    mailboxes: {
      title: 'Email Forwarding & Microsoft 365 Channels',
      subtitle: 'Configure automated email forwarding and Exchange Online webhooks',
    },
    solutions: {
      title: 'Knowledge Base & Self-Service Solutions',
      subtitle: 'Browse pre-approved resolution articles and FAQs for rapid ticket deflection',
    },
    automations: {
      title: 'Scenario Automations & 1-Click Macros',
      subtitle: 'Standardize ticket resolution workflows with reusable business macros',
    },
    billing: {
      title: 'Subscription, Plan Limits & Invoicing',
      subtitle: 'Manage agent seats, ticket consumption quotas, and payment gateways',
    },
  };

  return (
    <div className="enterprise-shell">
      {/* ====================================================================
          1. FAR-LEFT GLOBAL APP RAIL (SLIM 56px - HelpDesk.com / Freshdesk pattern)
          ==================================================================== */}
      <aside className="enterprise-sidebar">
        <div>
          {/* Brand Header */}
          <div className="sidebar-brand-header">
            <div className="sidebar-brand-icon">
              <Building2 size={22} />
            </div>
            <div className="overflow-hidden">
              <div className="d-flex align-items-center gap-1.5">
                <h6 className="mb-0 fw-bolder text-white text-truncate" style={{ fontSize: '0.96rem' }}>
                  Kuwy HelpDesk
                </h6>
                <span className="badge bg-primary text-white fw-bold" style={{ fontSize: '0.6rem' }}>
                  {activeCompany.companyCode}
                </span>
              </div>
              <small className="d-block text-truncate" style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                {activeCompany.name}
              </small>
            </div>
          </div>

          {/* Super Admin Switcher back if applicable */}
          {currentUser.roleType === 'SUPER_ADMIN' && (
            <div className="px-3 pt-2 pb-1">
              <button
                type="button"
                className="btn btn-sm btn-warning w-100 fw-bold text-dark d-flex align-items-center justify-content-center gap-1.5 py-1.5 rounded-3 shadow-sm"
                onClick={onSwitchToAdmin}
              >
                <ArrowLeft size={14} />
                <span style={{ fontSize: '0.78rem' }}>Admin Console</span>
              </button>
            </div>
          )}

          {/* SECTION 1: CORE WORKSPACE */}
          <div className="sidebar-section-label">
            <span>Omnichannel Workspace</span>
          </div>
          <div className="sidebar-nav-group">
            <button
              id="rail-tab-tickets"
              type="button"
              className={`sidebar-menu-btn ${activeTab === 'tickets' ? 'active' : ''}`}
              onClick={() => setActiveTab('tickets')}
            >
              <Inbox size={17} />
              <span>Tickets Command</span>
              <span className="sidebar-badge">{tickets.length}</span>
            </button>

            <button
              id="rail-tab-dashboard"
              type="button"
              className={`sidebar-menu-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <BarChart3 size={17} />
              <span>SLA Dashboard</span>
            </button>

            <button
              id="rail-tab-solutions"
              type="button"
              className={`sidebar-menu-btn ${activeTab === 'solutions' ? 'active' : ''}`}
              onClick={() => setActiveTab('solutions')}
            >
              <BookOpen size={17} />
              <span>Solutions & KB</span>
              <span className="sidebar-badge">{kbArticles.length}</span>
            </button>
          </div>

          {/* SECTION 2: OPERATIONS & CHANNELS */}
          <div className="sidebar-section-label">
            <span>Operations & Routing</span>
          </div>
          <div className="sidebar-nav-group">
            <button
              id="rail-tab-engineers"
              type="button"
              className={`sidebar-menu-btn ${activeTab === 'engineers' ? 'active' : ''}`}
              onClick={() => setActiveTab('engineers')}
            >
              <Users size={17} />
              <span>Support Engineers</span>
              <span className="sidebar-badge">Depts</span>
            </button>

            <button
              id="rail-tab-mis"
              type="button"
              className={`sidebar-menu-btn ${activeTab === 'mis' ? 'active' : ''}`}
              onClick={() => setActiveTab('mis')}
            >
              <FileSpreadsheet size={17} />
              <span>Track & MIS 100k</span>
              <span className="sidebar-badge">Export</span>
            </button>

            <button
              id="rail-tab-mailboxes"
              type="button"
              className={`sidebar-menu-btn ${activeTab === 'mailboxes' ? 'active' : ''}`}
              onClick={() => setActiveTab('mailboxes')}
            >
              <Mail size={17} />
              <span>M365 & Forwarding</span>
            </button>

            <button
              id="rail-tab-automations"
              type="button"
              className={`sidebar-menu-btn ${activeTab === 'automations' ? 'active' : ''}`}
              onClick={() => setActiveTab('automations')}
            >
              <Zap size={17} />
              <span>Scenario Macros</span>
              <span className="sidebar-badge" style={{ backgroundColor: '#8b5cf6', color: '#fff' }}>1-Click</span>
            </button>

            <button
              id="rail-tab-billing"
              type="button"
              className={`sidebar-menu-btn ${activeTab === 'billing' ? 'active' : ''}`}
              onClick={() => setActiveTab('billing')}
            >
              <CreditCard size={17} />
              <span>Subscription & Billing</span>
              <span className="sidebar-badge" style={{ backgroundColor: '#10b981', color: '#fff' }}>
                {currentSubscription?.planTier || activeCompany.planName || 'ACTIVE'}
              </span>
            </button>
          </div>

          {/* SECTION 3: QUEUE VIEWS (HelpDesk.com signature views) */}
          <div className="sidebar-section-label">
            <span>Ticket Queue Views</span>
          </div>
          <div className="sidebar-nav-group">
            {[
              { id: 'ALL', label: 'All Tickets', count: tickets.length, dot: '#3b82f6' },
              { id: 'OPEN', label: 'Open Queue', count: tickets.filter(t => t.status === 'OPEN').length, dot: '#0ea5e9' },
              { id: 'IN_PROGRESS', label: 'In Progress', count: tickets.filter(t => t.status === 'IN_PROGRESS').length, dot: '#f59e0b' },
              { id: 'WAITING_ON_CUSTOMER', label: 'Waiting on User', count: tickets.filter(t => t.status === 'WAITING_ON_CUSTOMER').length, dot: '#8b5cf6' },
              { id: 'RESOLVED', label: 'Resolved / Closed', count: tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length, dot: '#10b981' },
            ].map(v => (
              <button
                key={v.id}
                type="button"
                className={`sidebar-menu-btn py-1.5 ${activeTab === 'tickets' && viewFilter === v.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('tickets');
                  setViewFilter(v.id);
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: v.dot,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '0.8rem' }}>{v.label}</span>
                <span className="sidebar-badge">{v.count}</span>
              </button>
            ))}
          </div>

          {/* SECTION 4: DEPARTMENT CATEGORIES */}
          <div className="sidebar-section-label">
            <span>Department Queues</span>
          </div>
          <div className="sidebar-nav-group">
            {departments.map(d => (
              <button
                key={d.id}
                type="button"
                className={`sidebar-menu-btn py-1.5 ${deptFilter === d.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('tickets');
                  setDeptFilter(prev => (prev === d.id ? null : d.id));
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: d.code === 'IT' ? '#3b82f6' : d.code === 'FINANCE' ? '#10b981' : '#8b5cf6',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <span className="text-truncate" style={{ fontSize: '0.78rem' }}>{d.name}</span>
                {deptFilter === d.id && <span className="sidebar-badge" style={{ backgroundColor: '#2563eb', color: '#fff' }}>Filtered</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar Footer: Agent Status & User Profile */}
        <div className="sidebar-footer">
          {/* Presence Dropdown */}
          <div className="p-2 rounded-3 mb-2 bg-dark bg-opacity-50 border border-secondary border-opacity-25">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="small text-secondary" style={{ fontSize: '0.7rem' }}>Agent Status:</span>
              <select
                className="form-select form-select-sm py-0 ps-2 pe-4 bg-dark text-white border-0 fw-semibold"
                style={{ width: 'auto', fontSize: '0.72rem' }}
                value={agentPresence}
                onChange={e => setAgentPresence(e.target.value as any)}
              >
                <option value="ONLINE">🟢 Available</option>
                <option value="BUSY">🟡 Busy</option>
                <option value="AWAY">⚪ Away</option>
              </select>
            </div>
            <div className="text-truncate text-secondary" style={{ fontSize: '0.67rem' }}>
              Forwarding: <code className="text-info">{mailboxes[0]?.forwardingAddress || '1281753993@tickets.helpdesk.com'}</code>
            </div>
          </div>

          <div className="d-flex align-items-center justify-content-between pt-1">
            <div className="d-flex align-items-center gap-2 overflow-hidden">
              <div
                className="rounded-circle bg-primary text-white fw-bold d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}
              >
                {currentUser.firstName?.charAt(0) || 'U'}
              </div>
              <div className="overflow-hidden" style={{ lineHeight: '1.2' }}>
                <div className="fw-bold text-white text-truncate" style={{ fontSize: '0.78rem' }}>
                  {currentUser.displayName}
                </div>
                <small className="text-info d-block text-truncate" style={{ fontSize: '0.65rem', fontWeight: 600 }}>
                  {currentUser.roleType.replace('_', ' ')}
                </small>
              </div>
            </div>
            <button
              id="btn-sign-out"
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
          2. RIGHT MAIN AREA (TOPBAR + MULTI-PANE WORKSPACE CONTENT)
          ==================================================================== */}
      <div className="enterprise-main">
        {/* Top Contextual Header Bar */}
        <header className="enterprise-topbar">
          <div className="d-flex align-items-center gap-3">
            <div>
              <div className="d-flex align-items-center gap-1.5 text-muted small mb-0.5" style={{ fontSize: '0.74rem' }}>
                <span className="fw-semibold text-primary">{activeCompany.name}</span>
                <ChevronRight size={13} />
                <span className="fw-semibold text-dark">{tabLabels[activeTab].title}</span>
              </div>
              <h5 className="fw-bolder mb-0 text-dark" style={{ fontSize: '1.12rem' }}>
                {tabLabels[activeTab].title}
              </h5>
            </div>

            {/* Tenant Switcher if Super Admin */}
            {currentUser.roleType === 'SUPER_ADMIN' && companies.length > 1 && (
              <div className="ms-2">
                <select
                  className="form-select form-select-sm fw-semibold border-primary text-primary rounded-pill px-3"
                  value={activeCompany.id}
                  onChange={e => {
                    const found = companies.find(c => c.id === Number(e.target.value));
                    if (found) onSwitchCompany(found);
                  }}
                >
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      Tenant: {c.name} ({c.companyCode})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {/* Customer Support Portal Direct Link */}
            <a
              href={`/${activeCompany.subdomain}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-outline-success d-flex align-items-center gap-1.5 rounded-3 fw-semibold bg-white shadow-xs"
              title="Open Public Customer Support Portal in new tab"
            >
              <Globe size={14} />
              <span>Customer Portal</span>
              <ExternalLink size={12} />
            </a>

            <div className="d-none d-xl-flex align-items-center gap-1.5 px-3 py-1 bg-success-subtle text-success border border-success-subtle rounded-pill" style={{ fontSize: '0.73rem' }}>
              <span className="pulse-dot pulse-dot-success"></span>
              <span className="fw-semibold">MS 365 Exchange: Live Sync</span>
            </div>

            {/* Email Forwarding Wizard Shortcut */}
            <button
              id="btn-forwarding-topbar"
              className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1.5 rounded-3 fw-semibold bg-white shadow-xs text-dark"
              onClick={() => setShowForwardingModal(true)}
              title="Set up email forwarding from Gmail, Outlook or Microsoft 365"
            >
              <Send size={14} className="text-primary" />
              <span>Set up email forwarding</span>
            </button>

            {/* Simulate Inbound Email */}
            <button
              id="btn-simulate-email"
              className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5 rounded-3 fw-semibold"
              onClick={() => setShowSimulateModal(true)}
              title="Simulate incoming customer email to Microsoft 365 / Forwarding"
            >
              <Mail size={15} />
              <span>Simulate MS 365 Email</span>
            </button>

            {/* New Ticket */}
            <button
              id="btn-new-ticket"
              className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 rounded-3 fw-bold shadow-sm px-3"
              onClick={() => setShowNewTicketModal(true)}
            >
              <Plus size={15} />
              <span>New Ticket</span>
            </button>
          </div>
        </header>

        {/* Global Toast Notification */}
        {actionNotice && (
          <div className="px-4 pt-2">
            <div className={`alert alert-${actionNotice.type} py-2 px-3 mb-0 rounded-3 shadow-xs small d-flex align-items-center justify-content-between`}>
              <span className="fw-semibold">{actionNotice.text}</span>
              <button type="button" className="btn-close btn-sm" onClick={() => setActionNotice(null)}></button>
            </div>
          </div>
        )}

        {/* Main Workspace Content Area */}
        <main className="enterprise-content">
          {/* ==============================================================
              TAB 1: TICKETS COMMAND CENTER (FRESHDESK /a/tickets/1 LAYOUT)
              ============================================================== */}
          {activeTab === 'tickets' && (
            <div className="row g-3 h-100">
              {/* MIDDLE COLUMN: TICKET QUEUE (HelpDesk.com style virtual list) */}
              <div className="col-12 col-lg-5 col-xl-4 d-flex flex-column h-100">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <h6 className="fw-bold mb-0 text-dark">
                      Queue
                    </h6>
                    <span className="badge bg-primary-subtle text-primary rounded-pill">
                      {sortedTickets.length}
                    </span>
                  </div>

                  {/* Sort By Dropdown (HelpDesk.com signature: sortBy=lastMessageAt) */}
                  <div className="d-flex align-items-center gap-1.5">
                    <small className="text-muted fw-semibold" style={{ fontSize: '0.72rem' }}>Sort:</small>
                    <select
                      className="form-select form-select-sm py-0.5 ps-2 pe-4 bg-light border-0 fw-semibold text-dark rounded-2"
                      style={{ fontSize: '0.74rem', width: 'auto' }}
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as any)}
                    >
                      <option value="lastMessageAt">Last message (Newest)</option>
                      <option value="createdAt">Created date</option>
                      <option value="priority">Priority level</option>
                    </select>

                    <button
                      className="btn btn-sm btn-light border p-1 text-muted"
                      onClick={() => loadCompanyData(activeCompany.id)}
                      title="Sync queue"
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>

                {/* Queue Search Input */}
                <div className="input-group input-group-sm mb-2 shadow-xs">
                  <span className="input-group-text bg-white border-end-0">
                    <Search size={14} className="text-muted" />
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0"
                    placeholder="Search #ticket, subject, requester..."
                    value={ticketSearch}
                    onChange={e => setTicketSearch(e.target.value)}
                  />
                  {deptFilter && (
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setDeptFilter(null)}
                      title="Clear department filter"
                    >
                      Clear Dept
                    </button>
                  )}
                </div>

                {/* Bulk Operations Toolbar when tickets selected */}
                {selectedTicketIds.length > 0 && (
                  <div className="p-2 mb-2 rounded-3 bg-primary text-white d-flex align-items-center justify-content-between shadow-sm animate-fade-in">
                    <span className="small fw-bold">{selectedTicketIds.length} tickets selected</span>
                    <div className="d-flex align-items-center gap-1.5">
                      <select
                        className="form-select form-select-sm py-0 text-dark bg-white border-0 fw-semibold"
                        style={{ fontSize: '0.72rem' }}
                        onChange={e => e.target.value && handleBulkStatus(e.target.value)}
                        defaultValue=""
                      >
                        <option value="" disabled>Status...</option>
                        <option value="OPEN">Set Open</option>
                        <option value="IN_PROGRESS">Set In Progress</option>
                        <option value="RESOLVED">Set Resolved</option>
                        <option value="CLOSED">Set Closed</option>
                      </select>

                      <select
                        className="form-select form-select-sm py-0 text-dark bg-white border-0 fw-semibold"
                        style={{ fontSize: '0.72rem' }}
                        onChange={e => e.target.value && handleBulkPriority(e.target.value)}
                        defaultValue=""
                      >
                        <option value="" disabled>Priority...</option>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>

                      <select
                        className="form-select form-select-sm py-0 text-dark bg-white border-0 fw-semibold"
                        style={{ fontSize: '0.72rem' }}
                        onChange={e => e.target.value && handleBulkAssign(Number(e.target.value))}
                        defaultValue=""
                      >
                        <option value="" disabled>Assign...</option>
                        {agents.map(a => (
                          <option key={a.id} value={a.id}>{a.displayName}</option>
                        ))}
                      </select>

                      <button
                        className="btn btn-sm btn-light py-0 px-2 fw-semibold text-danger border-0"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => setSelectedTicketIds([])}
                      >
                        Deselect
                      </button>
                    </div>
                  </div>
                )}

                {/* Tickets Scroll List */}
                <div className="ticket-list-scroll overflow-auto pe-1 flex-grow-1" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                  {sortedTickets.length === 0 ? (
                    <div className="text-center py-5 bg-white rounded-4 border">
                      <Inbox size={32} className="text-muted mb-2" />
                      <p className="text-muted mb-0 small">No tickets matching this view.</p>
                    </div>
                  ) : (
                    sortedTickets.map(t => (
                      <div
                        key={t.id}
                        className={`ticket-row ${selectedTicket?.id === t.id ? 'selected' : ''}`}
                        onClick={() => loadTicketDetail(t.id)}
                      >
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <div className="d-flex align-items-center gap-2">
                            <input
                              type="checkbox"
                              className="form-check-input mt-0"
                              checked={selectedTicketIds.includes(t.id)}
                              onChange={e => {
                                e.stopPropagation();
                                if (e.target.checked) {
                                  setSelectedTicketIds(prev => [...prev, t.id]);
                                } else {
                                  setSelectedTicketIds(prev => prev.filter(id => id !== t.id));
                                }
                              }}
                            />
                            <span className="ticket-code">#{t.ticketNumber}</span>
                            <span className="badge bg-light text-secondary border py-0 px-1.5" style={{ fontSize: '0.65rem' }}>
                              {t.channel === 'EMAIL' ? '✉️ Forwarded' : '🌐 M365'}
                            </span>
                          </div>
                          <span className={`badge-status badge-${t.status.toLowerCase()}`}>
                            {t.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <h6 className="fw-bold text-dark mb-1 text-truncate" title={t.subject} style={{ fontSize: '0.88rem' }}>
                          {t.subject}
                        </h6>

                        <div className="text-muted mb-2 text-truncate" style={{ fontSize: '0.78rem' }}>
                          {t.descriptionText || 'No message preview'}
                        </div>

                        <div className="d-flex justify-content-between align-items-center pt-1 border-top" style={{ fontSize: '0.72rem' }}>
                          <span className="text-secondary fw-medium text-truncate" style={{ maxWidth: '170px' }}>
                            {t.contact?.firstName || 'Requester'} • <span className="text-primary">{t.department?.code || 'IT'}</span>
                          </span>
                          <div className="d-flex align-items-center gap-1.5">
                            <span className={`badge-status badge-${t.priority.toLowerCase()}`}>
                              {t.priority}
                            </span>
                            <span className="pulse-dot pulse-dot-success" title="Within SLA"></span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* RIGHT MAIN PANE: FRESHDESK /a/tickets/1 COMMAND CENTER */}
              <div className="col-12 col-lg-7 col-xl-8 h-100">
                {selectedTicket ? (
                  <div className="enterprise-card h-100 d-flex flex-column overflow-hidden">
                    {/* FRESHDESK SLA BANNER */}
                    <div
                      className="px-4 py-2 border-bottom d-flex align-items-center justify-content-between"
                      style={{
                        background: selectedTicket.priority === 'URGENT' ? '#fef2f2' : '#f0fdf4',
                        borderLeft: `4px solid ${selectedTicket.priority === 'URGENT' ? '#ef4444' : '#10b981'}`
                      }}
                    >
                      <div className="d-flex align-items-center gap-2">
                        <Clock size={16} className={selectedTicket.priority === 'URGENT' ? 'text-danger' : 'text-success'} />
                        <span className="small fw-bold text-dark" style={{ fontSize: '0.8rem' }}>
                          {selectedTicket.priority === 'URGENT' ? 'Urgent SLA Target: First response overdue / critical' : 'Enterprise SLA Target: First response expected within 4 hours'}
                        </span>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span className={`badge ${selectedTicket.priority === 'URGENT' ? 'bg-danger text-white' : 'bg-success text-white'} rounded-pill fw-semibold`} style={{ fontSize: '0.68rem' }}>
                          {selectedTicket.priority === 'URGENT' ? 'ESCALATION ACTIVE' : 'WITHIN SLA'}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-link p-0 text-decoration-none small text-muted"
                          onClick={() => setShowPropertiesDrawer(!showPropertiesDrawer)}
                          title="Toggle Properties & Context Drawer"
                        >
                          <SlidersHorizontal size={14} className="me-1 inline" />
                          {showPropertiesDrawer ? 'Hide Context' : 'Show Context'}
                        </button>
                      </div>
                    </div>

                    {/* TOP ACTION TOOLBAR (Freshdesk /a/tickets/1 signature command bar) */}
                    <div className="bg-white border-bottom px-4 py-2.5 d-flex flex-wrap align-items-center justify-content-between gap-2">
                      <div className="d-flex align-items-center gap-2">
                        <span className="ticket-code fw-bolder">#{selectedTicket.ticketNumber}</span>
                        <span className={`badge-status badge-${selectedTicket.status.toLowerCase()}`}>
                          {selectedTicket.status.replace(/_/g, ' ')}
                        </span>
                        <span className={`badge-status badge-${selectedTicket.priority.toLowerCase()}`}>
                          {selectedTicket.priority} Priority
                        </span>
                      </div>

                      {/* Freshdesk Quick Action Dropdowns */}
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        {/* Scenario Macros Dropdown */}
                        <div className="position-relative">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5 rounded-3 fw-semibold shadow-xs"
                            onClick={() => setShowScenarioMenu(!showScenarioMenu)}
                          >
                            <Zap size={14} />
                            <span>1-Click Scenario</span>
                          </button>

                          {showScenarioMenu && (
                            <div
                              className="position-absolute end-0 mt-1 shadow-lg bg-white rounded-3 border p-2 z-3"
                              style={{ width: '280px', zIndex: 1050 }}
                            >
                              <div className="small fw-bold text-secondary mb-2 px-1">Execute Scenario Macro</div>
                              <div className="d-flex flex-column gap-1">
                                {PRESET_SCENARIOS.map(sc => (
                                  <button
                                    key={sc.id}
                                    type="button"
                                    className="btn btn-sm text-start p-2 rounded-2 hover-bg-light border-0 d-flex flex-column"
                                    onClick={() => handleExecuteScenario(sc)}
                                  >
                                    <div className="d-flex align-items-center justify-content-between w-100">
                                      <span className="fw-bold text-dark small">{sc.title}</span>
                                      <span className="badge" style={{ backgroundColor: sc.color, color: '#fff', fontSize: '0.62rem' }}>
                                        {sc.badge}
                                      </span>
                                    </div>
                                    <small className="text-muted text-truncate" style={{ fontSize: '0.7rem' }}>
                                      {sc.description}
                                    </small>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Status Select */}
                        <select
                          className="form-select form-select-sm fw-semibold"
                          value={selectedTicket.status}
                          onChange={e => handleStatusChange(e.target.value)}
                          style={{ width: '150px' }}
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="IN_PROGRESS">IN PROGRESS</option>
                          <option value="WAITING_ON_CUSTOMER">WAITING ON USER</option>
                          <option value="RESOLVED">RESOLVED</option>
                          <option value="CLOSED">CLOSED</option>
                        </select>

                        {/* Priority Select */}
                        <select
                          className="form-select form-select-sm fw-semibold"
                          value={selectedTicket.priority}
                          onChange={e => handlePriorityChange(e.target.value)}
                          style={{ width: '120px' }}
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="URGENT">Urgent</option>
                        </select>

                        {/* Assign Agent Select */}
                        <select
                          className="form-select form-select-sm fw-semibold"
                          value={selectedTicket.assignedAgent?.id || ''}
                          onChange={e => handleAssignAgent(Number(e.target.value))}
                          style={{ width: '160px' }}
                        >
                          <option value="">Assign Engineer...</option>
                          {agents.map(ag => (
                            <option key={ag.id} value={ag.id}>
                              {ag.displayName} ({ag.role?.name || 'Agent'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Main Split: Conversation Thread (Left) + Properties Drawer (Right) */}
                    <div className="d-flex flex-grow-1 overflow-hidden">
                      {/* Thread & Composer Container */}
                      <div className="d-flex flex-column flex-grow-1 overflow-hidden bg-white">
                        {/* Ticket Subject Header */}
                        <div className="p-3 px-4 border-bottom bg-light bg-opacity-50">
                          <h5 className="fw-bold text-dark mb-1">{selectedTicket.subject}</h5>
                          <div className="d-flex align-items-center gap-3 text-muted small" style={{ fontSize: '0.78rem' }}>
                            <span><strong>Requester:</strong> {selectedTicket.contact?.firstName} ({selectedTicket.contact?.email})</span>
                            <span>•</span>
                            <span><strong>Department:</strong> {selectedTicket.department?.name}</span>
                            <span>•</span>
                            <span><strong>Channel:</strong> <code className="text-primary">{selectedTicket.channel}</code></span>
                          </div>
                        </div>

                        {/* Conversation Threads Stream */}
                        <div className="p-4 overflow-auto flex-grow-1" style={{ backgroundColor: '#f8fafc' }}>
                          {(selectedTicket.threads || []).map((th, idx) => (
                            <div
                              key={th.id || idx}
                              className={`thread-card ${th.isPrivate ? 'thread-private' : th.senderType === 'CUSTOMER' ? 'thread-customer' : 'thread-agent'}`}
                            >
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <div className="d-flex align-items-center gap-2">
                                  {th.isPrivate ? (
                                    <span className="badge bg-warning text-dark d-flex align-items-center gap-1">
                                      <Lock size={12} /> Internal Private Note
                                    </span>
                                  ) : th.senderType === 'CUSTOMER' ? (
                                    <span className="badge bg-primary-subtle text-primary">
                                      Inbound Customer ({th.fromEmail})
                                    </span>
                                  ) : (
                                    <span className="badge bg-success-subtle text-success">
                                      Engineer Reply ({th.fromEmail})
                                    </span>
                                  )}
                                  <span className="fw-bold text-dark" style={{ fontSize: '0.85rem' }}>
                                    {th.fromName}
                                  </span>
                                </div>
                                <small className="text-muted">
                                  {th.createdAt ? new Date(th.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recent'}
                                </small>
                              </div>

                              <div
                                className="thread-body text-dark"
                                dangerouslySetInnerHTML={{ __html: th.bodyHtml || `<p>${th.bodyText}</p>` }}
                              />

                              {/* Thread Attachments View */}
                              {th.attachments && th.attachments.length > 0 && (
                                <div className="mt-3 pt-2.5 border-top d-flex flex-wrap gap-2">
                                  {th.attachments.map(att => (
                                    <div
                                      key={att.id}
                                      className="p-2 rounded-3 border bg-white d-flex align-items-center gap-2 shadow-xs"
                                      style={{ maxWidth: '300px', fontSize: '0.82rem' }}
                                    >
                                      {isImageFile(att.fileName) ? (
                                        <div
                                          className="rounded-2 overflow-hidden border bg-light d-flex align-items-center justify-content-center cursor-pointer"
                                          style={{ width: '38px', height: '38px', flexShrink: 0, cursor: 'pointer' }}
                                          onClick={() => setPreviewAttachment(att)}
                                          title="Preview Image"
                                        >
                                          <img
                                            src={`http://localhost:8080${att.previewUrl}`}
                                            alt={att.fileName}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={(e) => {
                                              (e.target as HTMLElement).style.display = 'none';
                                            }}
                                          />
                                        </div>
                                      ) : isPdfFile(att.fileName) ? (
                                        <div className="rounded-2 p-1.5 bg-danger-subtle text-danger d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '38px', height: '38px' }}>
                                          <FileText size={20} />
                                        </div>
                                      ) : (
                                        <div className="rounded-2 p-1.5 bg-primary-subtle text-primary d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '38px', height: '38px' }}>
                                          <File size={20} />
                                        </div>
                                      )}

                                      <div className="overflow-hidden flex-grow-1" style={{ minWidth: 0 }}>
                                        <div className="fw-semibold text-truncate text-dark" title={att.fileName}>
                                          {att.fileName}
                                        </div>
                                        <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>
                                          {formatFileSize(att.fileSizeBytes)}
                                        </small>
                                      </div>

                                      <div className="d-flex align-items-center gap-1">
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-light border-0 p-1 text-secondary hover-text-primary"
                                          onClick={() => setPreviewAttachment(att)}
                                          title="Preview"
                                        >
                                          <Eye size={13} />
                                        </button>
                                        <a
                                          href={`http://localhost:8080${att.downloadUrl}`}
                                          download={att.fileName}
                                          className="btn btn-sm btn-light border-0 p-1 text-secondary hover-text-primary"
                                          title="Download"
                                        >
                                          <Download size={13} />
                                        </a>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Composer & Quick Knowledge Base Insertion Box */}
                        <div className="bg-white p-3.5 px-4 border-top">
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <div className="d-flex align-items-center gap-2">
                              <button
                                type="button"
                                className={`btn btn-sm rounded-3 ${!isPrivateNote ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => setIsPrivateNote(false)}
                              >
                                <Send size={13} className="me-1 inline" /> Public Email Reply
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm rounded-3 ${isPrivateNote ? 'btn-warning text-dark fw-bold' : 'btn-outline-secondary'}`}
                                onClick={() => setIsPrivateNote(true)}
                              >
                                <Lock size={13} className="me-1 inline" /> Private Internal Note
                              </button>
                            </div>

                            {/* Toolbar Buttons: Attachments & Knowledge Base */}
                            <div className="d-flex align-items-center gap-1.5">
                              <label
                                className="btn btn-sm btn-light border px-2 py-1 text-secondary fw-semibold d-flex align-items-center gap-1 cursor-pointer mb-0"
                                style={{ cursor: 'pointer' }}
                                title="Attach Documents (PNG, PDF, JPG, JPEG, TXT)"
                              >
                                <Paperclip size={13} className="text-primary" />
                                <span style={{ fontSize: '0.72rem' }}>Attach Files</span>
                                <input
                                  type="file"
                                  multiple
                                  accept=".png,.jpg,.jpeg,.pdf,.txt,.doc,.docx,.xls,.xlsx,.csv"
                                  className="d-none"
                                  onChange={(e) => {
                                    if (e.target.files) {
                                      setReplyAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                                    }
                                  }}
                                />
                              </label>

                              <button
                                type="button"
                                className="btn btn-sm btn-light border px-2 py-1 text-primary fw-semibold d-flex align-items-center gap-1"
                                onClick={() => setShowKbPicker(!showKbPicker)}
                                title="Insert Knowledge Base Solution"
                              >
                                <BookOpen size={13} />
                                <span style={{ fontSize: '0.72rem' }}>Insert Solution Article</span>
                              </button>

                              <button
                                type="button"
                                className="btn btn-sm btn-light border px-2 py-1 text-primary fw-semibold d-flex align-items-center gap-1"
                                onClick={() => setShowCannedPicker(!showCannedPicker)}
                                title="Insert Canned Response Template (#)"
                              >
                                <Sparkles size={13} className="text-warning" />
                                <span style={{ fontSize: '0.72rem' }}>Canned Templates (#)</span>
                              </button>
                            </div>
                          </div>

                          {/* Canned Responses Template Picker */}
                          {showCannedPicker && (
                            <div className="p-3 mb-2 bg-light rounded-3 border animate-fade-in">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <span className="small fw-bold text-dark">Select Canned Response Template:</span>
                                <button type="button" className="btn-close btn-sm" onClick={() => setShowCannedPicker(false)}></button>
                              </div>
                              <div className="d-flex flex-column gap-1.5" style={{ maxHeight: '190px', overflowY: 'auto' }}>
                                {cannedResponses.map(cr => (
                                  <div
                                    key={cr.id}
                                    className="p-2 bg-white rounded-2 border d-flex justify-content-between align-items-center hover-bg-light cursor-pointer"
                                    onClick={() => handleInsertCannedResponse(cr)}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <div>
                                      <div className="fw-semibold text-dark small d-flex align-items-center gap-2">
                                        <span>{cr.title}</span>
                                        <code className="text-primary fw-bold" style={{ fontSize: '0.72rem' }}>{cr.shortcut}</code>
                                      </div>
                                      <small className="text-muted text-truncate d-block" style={{ maxWidth: '420px' }}>
                                        {cr.content}
                                      </small>
                                    </div>
                                    <button type="button" className="btn btn-sm btn-outline-primary py-0 px-2 small">
                                      + Insert
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Knowledge Base Solutions Modal Picker */}
                          {showKbPicker && (
                            <div className="p-3 mb-2 bg-light rounded-3 border animate-fade-in">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <span className="small fw-bold text-dark">Select Knowledge Base Article to Insert:</span>
                                <button type="button" className="btn-close btn-sm" onClick={() => setShowKbPicker(false)}></button>
                              </div>
                              <div className="d-flex flex-column gap-1.5" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                                {kbArticles.map(art => (
                                  <div
                                    key={art.id}
                                    className="p-2 bg-white rounded-2 border d-flex justify-content-between align-items-center hover-bg-light cursor-pointer"
                                    onClick={() => {
                                      setReplyText(prev => prev + `\n\nReference Guide: ${art.title}\nhttps://${activeCompany.subdomain}.kuwyhelp.com/kb/${art.slug}`);
                                      setShowKbPicker(false);
                                      showNotification('Inserted Knowledge Base link into reply');
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <div>
                                      <div className="fw-semibold text-dark small">{art.title}</div>
                                      <small className="text-muted">{art.categoryName}</small>
                                    </div>
                                    <button type="button" className="btn btn-sm btn-outline-primary py-0 px-2 small">
                                      + Insert
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <textarea
                            className={`form-control rounded-3 ${isPrivateNote ? 'border-warning bg-warning-subtle' : ''}`}
                            rows={3}
                            placeholder={isPrivateNote ? "Add an internal note visible only to support engineers..." : "Type your official response to send to the customer..."}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                          />

                          {/* Attached Document Chips */}
                          {replyAttachments.length > 0 && (
                            <div className="d-flex flex-wrap gap-2 mt-2">
                              {replyAttachments.map((f, idx) => (
                                <span
                                  key={idx}
                                  className="badge bg-light text-dark border px-2.5 py-1.5 rounded-3 d-inline-flex align-items-center gap-1.5"
                                  style={{ fontSize: '0.76rem' }}
                                >
                                  {isImageFile(f.name) ? (
                                    <ImageIcon size={12} className="text-info" />
                                  ) : isPdfFile(f.name) ? (
                                    <FileText size={12} className="text-danger" />
                                  ) : (
                                    <File size={12} className="text-primary" />
                                  )}
                                  <span className="text-truncate" style={{ maxWidth: '140px' }}>{f.name}</span>
                                  <span className="text-muted" style={{ fontSize: '0.68rem' }}>({formatFileSize(f.size)})</span>
                                  <button
                                    type="button"
                                    className="btn-close ms-1"
                                    style={{ fontSize: '0.5rem' }}
                                    onClick={() => setReplyAttachments(prev => prev.filter((_, i) => i !== idx))}
                                  />
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="d-flex justify-content-between align-items-center mt-2.5">
                            <small className="text-muted">
                              {isPrivateNote ? "🔒 Internal note is private to Kuwy team." : "📧 Reply is dispatched to customer via Microsoft 365 Exchange."}
                            </small>
                            <div className="d-flex align-items-center gap-2">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary px-3"
                                onClick={() => {
                                  setReplyText('');
                                }}
                              >
                                Clear
                              </button>
                              <button
                                className="btn btn-sm btn-primary px-4 py-1.5 rounded-3 fw-bold shadow-sm"
                                disabled={isSending || !replyText.trim()}
                                onClick={handleSendReply}
                              >
                                {isSending ? 'Sending...' : isPrivateNote ? 'Save Internal Note' : 'Send Official Reply'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* FRESHDESK PROPERTIES & CUSTOMER 360° DRAWER (Right 280px) */}
                      {showPropertiesDrawer && (
                        <div
                          className="border-start bg-light overflow-auto p-3"
                          style={{ width: '310px', minWidth: '310px', fontSize: '0.82rem' }}
                        >
                          {/* Live Time Tracker Widget */}
                          <div className="enterprise-card p-3 mb-3 bg-white shadow-xs">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="fw-bold text-dark small">Time Tracking</span>
                              <span className="font-monospace text-primary fw-bolder" style={{ fontSize: '1rem' }}>
                                {formatTimer(timerSeconds)}
                              </span>
                            </div>
                            <div className="d-flex align-items-center gap-1.5">
                              <button
                                type="button"
                                className={`btn btn-sm ${timerRunning ? 'btn-warning' : 'btn-success'} w-100 fw-bold d-flex align-items-center justify-content-center gap-1`}
                                onClick={() => setTimerRunning(!timerRunning)}
                              >
                                {timerRunning ? <Pause size={13} /> : <Play size={13} />}
                                <span>{timerRunning ? 'Pause Timer' : 'Start Timer'}</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary p-1.5"
                                onClick={() => { setTimerRunning(false); setTimerSeconds(0); }}
                                title="Reset timer"
                              >
                                <RotateCcw size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Customer 360° Profile */}
                          <div className="enterprise-card p-3 mb-3 bg-white shadow-xs">
                            <span className="fw-bold text-dark small d-block mb-2">Requester Profile (360°)</span>
                            <div className="d-flex align-items-center gap-2 mb-2">
                              <div
                                className="rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center flex-shrink-0"
                                style={{ width: '36px', height: '36px' }}
                              >
                                {selectedTicket.contact?.firstName?.charAt(0) || 'C'}
                              </div>
                              <div className="overflow-hidden">
                                <div className="fw-bold text-dark text-truncate">{selectedTicket.contact?.firstName}</div>
                                <code className="text-muted d-block text-truncate" style={{ fontSize: '0.74rem' }}>
                                  {selectedTicket.contact?.email}
                                </code>
                              </div>
                            </div>
                            <div className="pt-2 border-top text-secondary small">
                              <div><strong>Company:</strong> {activeCompany.name}</div>
                              <div><strong>Channel:</strong> {selectedTicket.channel}</div>
                              <div><strong>Forwarded Target:</strong> <code className="text-primary">{selectedTicket.sourceMailbox?.forwardingAddress || '1281753993@tickets.helpdesk.com'}</code></div>
                            </div>
                          </div>

                          {/* Ticket Properties */}
                          <div className="enterprise-card p-3 mb-3 bg-white shadow-xs">
                            <span className="fw-bold text-dark small d-block mb-2">Ticket Properties</span>
                            <div className="d-flex flex-column gap-2 text-secondary small">
                              <div className="d-flex justify-content-between">
                                <span>Ticket Number:</span>
                                <strong className="text-dark">#{selectedTicket.ticketNumber}</strong>
                              </div>
                              <div className="d-flex justify-content-between">
                                <span>Category:</span>
                                <strong className="text-dark">{selectedTicket.department?.name}</strong>
                              </div>
                              <div className="d-flex justify-content-between">
                                <span>Status:</span>
                                <span className={`badge-status badge-${selectedTicket.status.toLowerCase()}`}>
                                  {selectedTicket.status}
                                </span>
                              </div>
                              <div className="d-flex justify-content-between">
                                <span>Priority:</span>
                                <span className={`badge-status badge-${selectedTicket.priority.toLowerCase()}`}>
                                  {selectedTicket.priority}
                                </span>
                              </div>
                              <div className="d-flex justify-content-between">
                                <span>Assigned Agent:</span>
                                <strong className="text-dark">{selectedTicket.assignedAgent?.displayName || 'Unassigned'}</strong>
                              </div>
                              <div className="d-flex justify-content-between">
                                <span>Created:</span>
                                <span>{new Date(selectedTicket.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Interactive Resolution To-Do Checklist */}
                          <div className="enterprise-card p-3 bg-white shadow-xs">
                            <span className="fw-bold text-dark small d-block mb-2">Resolution Checklist</span>
                            <div className="d-flex flex-column gap-1.5">
                              {(ticketTodos[selectedTicket.id] || [
                                { id: 1, text: 'Verify customer identity & loan ID', done: true },
                                { id: 2, text: 'Check Bureau status on Partner portal', done: false },
                                { id: 3, text: 'Send confirmation reply to requester', done: false },
                              ]).map(todo => (
                                <label key={todo.id} className="d-flex align-items-center gap-2 cursor-pointer small">
                                  <input
                                    type="checkbox"
                                    className="form-check-input mt-0"
                                    checked={todo.done}
                                    onChange={() => {
                                      const currentList = ticketTodos[selectedTicket.id] || [
                                        { id: 1, text: 'Verify customer identity & loan ID', done: true },
                                        { id: 2, text: 'Check Bureau status on Partner portal', done: false },
                                        { id: 3, text: 'Send confirmation reply to requester', done: false },
                                      ];
                                      const updated = currentList.map(item => item.id === todo.id ? { ...item, done: !item.done } : item);
                                      setTicketTodos({ ...ticketTodos, [selectedTicket.id]: updated });
                                    }}
                                  />
                                  <span className={todo.done ? 'text-decoration-line-through text-muted' : 'text-dark'}>
                                    {todo.text}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Attached Documents 360° Section */}
                          {(() => {
                            const allAtts = (selectedTicket.threads || []).flatMap(t => t.attachments || []);
                            return (
                              <div className="enterprise-card p-3 mt-3 bg-white shadow-xs">
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                  <span className="fw-bold text-dark small d-flex align-items-center gap-1.5">
                                    <Paperclip size={14} className="text-primary" />
                                    <span>Attachments</span>
                                  </span>
                                  <span className="badge bg-light text-secondary border">
                                    {allAtts.length}
                                  </span>
                                </div>

                                {allAtts.length === 0 ? (
                                  <small className="text-muted d-block">No documents attached yet.</small>
                                ) : (
                                  <div className="d-flex flex-column gap-1.5">
                                    {allAtts.map(att => (
                                      <div
                                        key={att.id}
                                        className="p-1.5 rounded-2 border bg-light d-flex align-items-center justify-content-between"
                                        style={{ fontSize: '0.78rem' }}
                                      >
                                        <div className="d-flex align-items-center gap-1.5 overflow-hidden flex-grow-1">
                                          {isImageFile(att.fileName) ? (
                                            <ImageIcon size={13} className="text-info flex-shrink-0" />
                                          ) : isPdfFile(att.fileName) ? (
                                            <FileText size={13} className="text-danger flex-shrink-0" />
                                          ) : (
                                            <File size={13} className="text-primary flex-shrink-0" />
                                          )}
                                          <span className="text-truncate text-dark" title={att.fileName}>{att.fileName}</span>
                                        </div>
                                        <div className="d-flex align-items-center gap-1 ms-1">
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-light border-0 p-1 text-secondary hover-text-primary"
                                            onClick={() => setPreviewAttachment(att)}
                                            title="Preview"
                                          >
                                            <Eye size={12} />
                                          </button>
                                          <a
                                            href={`http://localhost:8080${att.downloadUrl}`}
                                            download={att.fileName}
                                            className="btn btn-sm btn-light border-0 p-1 text-secondary hover-text-primary"
                                            title="Download"
                                          >
                                            <Download size={12} />
                                          </a>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-100 d-flex flex-column align-items-center justify-content-center enterprise-card text-center p-5">
                    <Inbox size={48} className="text-muted mb-3" />
                    <h5 className="fw-bold">No Ticket Selected</h5>
                    <p className="text-muted mb-0">Select an inquiry from the queue on the left to triage and respond.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 2: DASHBOARD & SLAS
              ============================================================== */}
          {activeTab === 'dashboard' && stats && (
            <div>
              <div className="row g-3 mb-4">
                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card d-flex align-items-center gap-3">
                    <div className="stat-icon bg-primary-subtle text-primary">
                      <Inbox size={22} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">Total Tickets</small>
                      <h3 className="fw-bold mb-0">{stats.totalTickets}</h3>
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
                      <h3 className="fw-bold mb-0">{stats.openTickets + stats.inProgressTickets}</h3>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card d-flex align-items-center gap-3">
                    <div className="stat-icon bg-success-subtle text-success">
                      <CheckCircle2 size={22} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">Resolved Cases</small>
                      <h3 className="fw-bold mb-0">{stats.resolvedTickets}</h3>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-sm-6 col-xl-3">
                  <div className="stat-card d-flex align-items-center gap-3">
                    <div className="stat-icon bg-danger-subtle text-danger">
                      <AlertCircle size={22} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">SLA Breached</small>
                      <h3 className="fw-bold mb-0">{stats.breachedSlaTickets}</h3>
                    </div>
                  </div>
                </div>
              </div>

              {/* Department SLA Turnaround Table */}
              <div className="enterprise-card p-4">
                <h5 className="fw-bold mb-3 text-dark">Category-Wise Service Level Agreements (SLA)</h5>
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="ps-4">Department Category</th>
                        <th>Code</th>
                        <th>SLA Status</th>
                        <th>Target Inbox</th>
                        <th className="pe-4">Resolution Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments.map(d => (
                        <tr key={d.id}>
                          <td className="ps-4 fw-bold text-dark">{d.name}</td>
                          <td><span className="badge bg-light text-dark border">{d.code || 'DEPT'}</span></td>
                          <td><span className="badge-status badge-resolved">ACTIVE SLA</span></td>
                          <td><code className="text-primary">{mailboxes[0]?.forwardingAddress || '1281753993@tickets.helpdesk.com'}</code></td>
                          <td className="pe-4">Within 4 Hours (Enterprise SLA)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 3: SOLUTIONS & KNOWLEDGE BASE (Freshdesk /a/solutions)
              ============================================================== */}
          {activeTab === 'solutions' && (
            <div>
              <div className="enterprise-card p-4 mb-4 border border-info-subtle" style={{ background: 'linear-gradient(135deg, #ffffff, #f0fdf4)' }}>
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-3 rounded-4 bg-success text-white shadow-sm">
                      <BookOpen size={24} />
                    </div>
                    <div>
                      <h5 className="fw-bolder mb-1 text-dark">Knowledge Base & Solution Repository</h5>
                      <p className="text-muted small mb-0">
                        Pre-approved solutions and troubleshooting documentation for <strong>{activeCompany.name}</strong>. Agents can insert these directly into replies.
                      </p>
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-success fw-bold d-flex align-items-center gap-1.5 px-3 py-2 rounded-3 shadow-sm"
                    onClick={() => showNotification('Knowledge base authoring mode active')}
                  >
                    <Plus size={15} />
                    <span>New Solution Article</span>
                  </button>
                </div>
              </div>

              <div className="row g-3">
                {kbArticles.map(art => (
                  <div key={art.id} className="col-12 col-md-6 col-xl-4">
                    <div className="enterprise-card p-4 h-100 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="badge bg-primary-subtle text-primary rounded-pill small">
                            {art.categoryName}
                          </span>
                          <span className="text-muted small" style={{ fontSize: '0.72rem' }}>
                            👀 {art.viewCount} views
                          </span>
                        </div>
                        <h6 className="fw-bold text-dark mb-2" style={{ fontSize: '0.94rem' }}>
                          {art.title}
                        </h6>
                        <div
                          className="text-muted small mb-3 text-truncate-3"
                          style={{ fontSize: '0.8rem', lineHeight: '1.45' }}
                          dangerouslySetInnerHTML={{ __html: art.contentHtml }}
                        />
                      </div>
                      <div className="pt-2 border-top d-flex justify-content-between align-items-center">
                        <small className="text-success fw-semibold">👍 {art.helpfulVotes} helpful votes</small>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary py-1 px-2.5 rounded-2 fw-semibold"
                          style={{ fontSize: '0.74rem' }}
                          onClick={() => {
                            setActiveTab('tickets');
                            setReplyText(prev => prev + `\n\nReference Solution: ${art.title}\nhttps://${activeCompany.subdomain}.kuwyhelp.com/kb/${art.slug}`);
                            showNotification(`Pasted "${art.title}" into ticket composer`);
                          }}
                        >
                          Use in Ticket →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 4: SCENARIO AUTOMATIONS (Freshdesk 1-Click Macros)
              ============================================================== */}
          {activeTab === 'automations' && (
            <div>
              <div className="enterprise-card p-4 mb-4 border border-primary-subtle" style={{ background: 'linear-gradient(135deg, #ffffff, #f5f3ff)' }}>
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-3 rounded-4 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                      <Zap size={24} />
                    </div>
                    <div>
                      <h5 className="fw-bolder mb-1 text-dark">Scenario Automations & 1-Click Macros</h5>
                      <p className="text-muted small mb-0">
                        Standardize multi-step support actions for <strong>{activeCompany.name}</strong>. Apply pre-approved tags, status updates, and customer responses in 1 click.
                      </p>
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-primary fw-bold d-flex align-items-center gap-1.5 px-3 py-2 rounded-3 shadow-sm"
                    onClick={() => showNotification('Scenario macro created')}
                  >
                    <Plus size={15} />
                    <span>Add New Macro</span>
                  </button>
                </div>
              </div>

              <div className="row g-3">
                {PRESET_SCENARIOS.map(sc => (
                  <div key={sc.id} className="col-12 col-md-6">
                    <div className="enterprise-card p-4 h-100 border" style={{ borderLeft: `5px solid ${sc.color}` }}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="fw-bold text-dark mb-0" style={{ fontSize: '1rem' }}>{sc.title}</h6>
                        <span className="badge" style={{ backgroundColor: sc.color, color: '#fff' }}>
                          {sc.badge}
                        </span>
                      </div>
                      <p className="text-muted small mb-3">{sc.description}</p>
                      <div className="bg-light p-2.5 rounded-3 mb-3 text-secondary small border" style={{ fontSize: '0.78rem' }}>
                        <div><strong>Target Status:</strong> <code>{sc.targetStatus || 'UNCHANGED'}</code></div>
                        <div><strong>Target Priority:</strong> <code>{sc.targetPriority || 'UNCHANGED'}</code></div>
                        <div className="text-truncate"><strong>Template Note:</strong> "{sc.cannedResponse}"</div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-dark fw-bold w-100"
                        onClick={() => {
                          if (selectedTicket) {
                            handleExecuteScenario(sc);
                            setActiveTab('tickets');
                          } else {
                            showNotification('Select a ticket first from the queue', 'warning');
                          }
                        }}
                      >
                        ⚡ Test Run on Selected Ticket
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 5: SUPPORT ENGINEERS
              ============================================================== */}
          {activeTab === 'engineers' && (
            <SupportEngineersView activeCompany={activeCompany} />
          )}

          {/* ==============================================================
              TAB 6: TRACK & MIS 100k STREAMING
              ============================================================== */}
          {activeTab === 'mis' && (
            <MisTrackingView activeCompany={activeCompany} />
          )}

          {/* ==============================================================
              TAB 7: MICROSOFT 365 & EMAIL FORWARDING
              ============================================================== */}
          {activeTab === 'mailboxes' && (
            <div>
              {/* Email Forwarding Feature Banner */}
              <div
                className="enterprise-card p-4 mb-4"
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%)',
                  border: '1.5px solid #bfdbfe'
                }}
              >
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                  <div className="d-flex align-items-start gap-3">
                    <div
                      className="p-3 rounded-4 text-white d-flex align-items-center justify-content-center shadow-sm flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', width: '54px', height: '54px' }}
                    >
                      <Send size={24} />
                    </div>
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                        <h5 className="fw-bolder mb-0 text-dark" style={{ fontSize: '1.15rem' }}>
                          Forward your messages to HelpDesk
                        </h5>
                        <span className="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1 rounded-pill fw-bold" style={{ fontSize: '0.72rem' }}>
                          <CheckCircle2 size={12} className="inline me-1" />
                          Ready for Gmail & M365
                        </span>
                      </div>
                      <p className="text-muted small mb-2" style={{ maxWidth: '720px', lineHeight: '1.45' }}>
                        Set up automated email forwarding from <strong>Gmail / Google Workspace</strong>, <strong>Microsoft Outlook</strong>, <strong>Microsoft 365</strong>, or other email providers directly into your HelpDesk queue.
                      </p>
                      <div className="d-flex align-items-center gap-2 flex-wrap pt-1">
                        <span className="small text-secondary fw-bold" style={{ fontSize: '0.75rem' }}>HelpDesk Forwarding Target:</span>
                        <code className="bg-white px-2.5 py-1 rounded-2 border text-dark fw-bold" style={{ fontSize: '0.84rem' }}>
                          {mailboxes[0]?.forwardingAddress || '1281753993@tickets.helpdesk.com'}
                        </code>
                        <span className="badge bg-primary-subtle text-primary fw-semibold" style={{ fontSize: '0.7rem' }}>
                          Auto-Converts to Ticket
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <button
                      id="btn-open-forwarding-banner"
                      className="btn btn-primary d-flex align-items-center gap-2 px-3.5 py-2.5 rounded-3 fw-bold shadow-sm"
                      onClick={() => setShowForwardingModal(true)}
                    >
                      <Send size={16} />
                      <span>Set up email forwarding</span>
                    </button>
                    <button
                      className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1.5 px-3 py-2.5 rounded-3 fw-semibold bg-white"
                      onClick={() => setShowSimulateModal(true)}
                    >
                      <Sparkles size={15} />
                      <span>Test Ingestion</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Mailbox List */}
              <div className="row g-3">
                {mailboxes.map(mb => (
                  <div key={mb.id} className="col-12 col-lg-6">
                    <div className="enterprise-card p-4 h-100">
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <div className="d-flex align-items-center gap-2.5">
                          <span className="p-2.5 rounded-3 bg-primary-subtle text-primary">
                            <Mail size={22} />
                          </span>
                          <div>
                            <h6 className="fw-bold mb-0">{mb.mailboxName}</h6>
                            <code className="text-primary">{mb.emailAddress}</code>
                          </div>
                        </div>
                        <span className="badge-status badge-resolved">
                          <span className="pulse-dot pulse-dot-success"></span>
                          {mb.syncStatus}
                        </span>
                      </div>

                      <div className="bg-light p-3 rounded-3 my-2 text-muted border" style={{ fontSize: '0.82rem' }}>
                        <div className="mb-1"><strong>Routing Department:</strong> {mb.department?.name}</div>
                        <div className="mb-1"><strong>Auth Mode:</strong> {mb.authType} (Microsoft Graph API)</div>
                        <div><strong>Provider:</strong> Microsoft 365 Exchange Online</div>
                      </div>

                      <div className="p-2.5 rounded-3 mt-2.5" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="fw-bold text-dark" style={{ fontSize: '0.75rem' }}>HelpDesk Forwarding Address</span>
                          <span className="badge bg-success-subtle text-success rounded-pill fw-semibold" style={{ fontSize: '0.68rem' }}>
                            Forwarding Verified
                          </span>
                        </div>
                        <div className="d-flex align-items-center justify-content-between">
                          <code className="text-primary fw-semibold" style={{ fontSize: '0.82rem' }}>
                            {mb.forwardingAddress || '1281753993@tickets.helpdesk.com'}
                          </code>
                          <button
                            type="button"
                            className="btn btn-sm btn-link p-0 text-decoration-none fw-semibold small"
                            onClick={() => setShowForwardingModal(true)}
                          >
                            Wizard →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 7: SUBSCRIPTION, BILLING & PLAN QUOTAS
              ============================================================== */}
          {activeTab === 'billing' && (
            <div className="animate-fade-in">
              {/* Header Banner */}
              <div className="enterprise-card p-4 mb-4 border border-primary-subtle" style={{ background: 'linear-gradient(135deg, #ffffff, #eff6ff)' }}>
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-3 rounded-4 bg-primary text-white shadow-sm">
                      <CreditCard size={28} />
                    </div>
                    <div>
                      <h4 className="fw-bolder mb-1 text-dark">
                        {activeCompany.name} • Subscription & Quota
                      </h4>
                      <p className="text-secondary small mb-0">
                        Manage agent seat allocations, monthly ticket limits, and payment methods
                      </p>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-success-subtle text-success fs-6 px-3 py-2 border border-success-subtle rounded-pill">
                      ● Active Subscription
                    </span>
                  </div>
                </div>
              </div>

              {/* Usage Quota Meters */}
              <div className="row g-3 mb-4">
                <div className="col-12 col-md-4">
                  <div className="enterprise-card p-4 h-100">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="small fw-bold text-secondary text-uppercase">Support Agent Seats</span>
                      <Users size={18} className="text-primary" />
                    </div>
                    <h3 className="fw-bold mb-1 text-dark">
                      {agents.length} <span className="fs-6 text-muted fw-normal">/ {currentSubscription?.agentLimit || 25} seats</span>
                    </h3>
                    <div className="progress mt-3" style={{ height: '8px' }}>
                      <div
                        className="progress-bar bg-primary"
                        role="progressbar"
                        style={{ width: `${Math.min(100, (agents.length / (currentSubscription?.agentLimit || 25)) * 100)}%` }}
                      ></div>
                    </div>
                    <small className="text-muted d-block mt-2" style={{ fontSize: '0.74rem' }}>
                      {((currentSubscription?.agentLimit || 25) - agents.length)} seats remaining on {currentSubscription?.planTier || activeCompany.planName} tier
                    </small>
                  </div>
                </div>

                <div className="col-12 col-md-4">
                  <div className="enterprise-card p-4 h-100">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="small fw-bold text-secondary text-uppercase">Monthly Ticket Quota</span>
                      <Inbox size={18} className="text-success" />
                    </div>
                    <h3 className="fw-bold mb-1 text-dark">
                      {stats?.totalTickets || tickets.length} <span className="fs-6 text-muted fw-normal">/ {currentSubscription?.ticketLimitMonthly || 5000}</span>
                    </h3>
                    <div className="progress mt-3" style={{ height: '8px' }}>
                      <div
                        className="progress-bar bg-success"
                        role="progressbar"
                        style={{ width: `${Math.min(100, ((stats?.totalTickets || tickets.length) / (currentSubscription?.ticketLimitMonthly || 5000)) * 100)}%` }}
                      ></div>
                    </div>
                    <small className="text-muted d-block mt-2" style={{ fontSize: '0.74rem' }}>
                      Resets automatically at billing renewal cycle
                    </small>
                  </div>
                </div>

                <div className="col-12 col-md-4">
                  <div className="enterprise-card p-4 h-100">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="small fw-bold text-secondary text-uppercase">Billing Renewal</span>
                      <Clock size={18} className="text-warning" />
                    </div>
                    <h3 className="fw-bold mb-1 text-dark">
                      {currentSubscription?.planTier === 'FREE' ? 'Forever Free' : '30 Days Cycle'}
                    </h3>
                    <div className="d-flex align-items-center gap-1.5 mt-3 text-secondary small">
                      <CheckCircle2 size={14} className="text-success" />
                      <span>Gateway: {currentSubscription?.gatewayProvider || 'RAZORPAY'} (Auto-renew)</span>
                    </div>
                    <small className="text-muted d-block mt-1" style={{ fontSize: '0.74rem' }}>
                      Grace period: 7 days before workspace lock
                    </small>
                  </div>
                </div>
              </div>

              {/* Plan Comparison & Instant Upgrade */}
              <div className="enterprise-card p-4 mb-4">
                <h5 className="fw-bold mb-3 text-dark">Available Subscription Plans</h5>
                <div className="row g-3">
                  {/* Free */}
                  <div className="col-12 col-md-4">
                    <div className={`p-4 rounded-4 border-2 h-100 d-flex flex-column ${(currentSubscription?.planTier || activeCompany.planName) === 'FREE' ? 'border-primary bg-primary-subtle' : 'border'}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-secondary">Free Tier</span>
                        {(currentSubscription?.planTier || activeCompany.planName) === 'FREE' && (
                          <span className="badge bg-primary text-white">Current Plan</span>
                        )}
                      </div>
                      <h3 className="fw-bold text-dark mb-0">₹0</h3>
                      <small className="text-muted mb-3">Forever free for small teams</small>
                      <ul className="list-unstyled small text-secondary d-flex flex-column gap-2 mb-4">
                        <li>✓ 2 Support Agents</li>
                        <li>✓ 100 Tickets / month</li>
                        <li>✓ Email Forwarding (Gmail / Outlook)</li>
                        <li>✓ Public Customer Portal</li>
                      </ul>
                      <button
                        className="btn btn-outline-secondary w-100 mt-auto fw-semibold"
                        disabled={(currentSubscription?.planTier || activeCompany.planName) === 'FREE' || isUpgradingSub}
                        onClick={() => handleUpgradeSubscription('FREE')}
                      >
                        {(currentSubscription?.planTier || activeCompany.planName) === 'FREE' ? 'Current Plan' : 'Downgrade to Free'}
                      </button>
                    </div>
                  </div>

                  {/* Starter */}
                  <div className="col-12 col-md-4">
                    <div className={`p-4 rounded-4 border-2 h-100 d-flex flex-column ${(currentSubscription?.planTier || activeCompany.planName) === 'STARTER' ? 'border-primary bg-primary-subtle' : 'border'}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-info text-dark">Starter</span>
                        {(currentSubscription?.planTier || activeCompany.planName) === 'STARTER' && (
                          <span className="badge bg-primary text-white">Current Plan</span>
                        )}
                      </div>
                      <h3 className="fw-bold text-dark mb-0">₹2,499</h3>
                      <small className="text-muted mb-3">Billed monthly</small>
                      <ul className="list-unstyled small text-secondary d-flex flex-column gap-2 mb-4">
                        <li>✓ 5 Support Agents</li>
                        <li>✓ 1,000 Tickets / month</li>
                        <li>✓ Round-Robin Auto Assignment</li>
                        <li>✓ Canned Responses (# shortcuts)</li>
                      </ul>
                      <button
                        className="btn btn-primary w-100 mt-auto fw-semibold"
                        disabled={(currentSubscription?.planTier || activeCompany.planName) === 'STARTER' || isUpgradingSub}
                        onClick={() => handleUpgradeSubscription('STARTER')}
                      >
                        {(currentSubscription?.planTier || activeCompany.planName) === 'STARTER' ? 'Current Plan' : 'Switch to Starter'}
                      </button>
                    </div>
                  </div>

                  {/* Pro */}
                  <div className="col-12 col-md-4">
                    <div className={`p-4 rounded-4 border-2 h-100 d-flex flex-column ${(currentSubscription?.planTier || activeCompany.planName) === 'PRO' || (currentSubscription?.planTier || activeCompany.planName) === 'ENTERPRISE' ? 'border-primary bg-primary-subtle' : 'border'}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-warning text-dark">Enterprise Pro</span>
                        {((currentSubscription?.planTier || activeCompany.planName) === 'PRO' || (currentSubscription?.planTier || activeCompany.planName) === 'ENTERPRISE') && (
                          <span className="badge bg-primary text-white">Current Plan</span>
                        )}
                      </div>
                      <h3 className="fw-bold text-dark mb-0">₹5,999</h3>
                      <small className="text-muted mb-3">Billed monthly</small>
                      <ul className="list-unstyled small text-secondary d-flex flex-column gap-2 mb-4">
                        <li>✓ 25 Support Agents</li>
                        <li>✓ 5,000 Tickets / month</li>
                        <li>✓ MS 365 Exchange Online Sync</li>
                        <li>✓ Custom SLA Targets & 100k MIS</li>
                      </ul>
                      <button
                        className="btn btn-primary w-100 mt-auto fw-semibold"
                        disabled={(currentSubscription?.planTier || activeCompany.planName) === 'PRO' || (currentSubscription?.planTier || activeCompany.planName) === 'ENTERPRISE' || isUpgradingSub}
                        onClick={() => handleUpgradeSubscription('PRO')}
                      >
                        {((currentSubscription?.planTier || activeCompany.planName) === 'PRO' || (currentSubscription?.planTier || activeCompany.planName) === 'ENTERPRISE') ? 'Current Plan' : 'Upgrade to Pro'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Canned Responses Management Library */}
              <div className="enterprise-card p-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h5 className="fw-bold text-dark mb-1">Canned Responses & Macros Library</h5>
                    <small className="text-secondary">Reusable shortcut templates accessible with `#` inside the reply composer</small>
                  </div>
                  <span className="badge bg-primary px-3 py-2 rounded-pill">
                    {cannedResponses.length} Templates Active
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Shortcut</th>
                        <th>Template Title</th>
                        <th>Preview Message</th>
                        <th>Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cannedResponses.map(cr => (
                        <tr key={cr.id}>
                          <td>
                            <code className="text-primary fw-bold fs-6">{cr.shortcut}</code>
                          </td>
                          <td className="fw-semibold text-dark">{cr.title}</td>
                          <td className="text-muted small text-truncate" style={{ maxWidth: '400px' }}>
                            {cr.content}
                          </td>
                          <td>
                            <span className="badge bg-success-subtle text-success">Shared Org-wide</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==============================================================
          MODAL 1: NEW TICKET CREATION
          ============================================================== */}
      {showNewTicketModal && (
        <div className="modal show d-block modal-backdrop-blur" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header bg-white border-bottom py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <div className="p-2 rounded-3 bg-primary-subtle text-primary">
                    <Plus size={20} />
                  </div>
                  <div>
                    <h5 className="modal-title fw-bold mb-0">Create New Ticket</h5>
                    <small className="text-muted">Tenant: {activeCompany.name} ({activeCompany.companyCode})</small>
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
                    <label className="form-label fw-bold small">Description / Query *</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      required
                      placeholder="Provide comprehensive details of the issue..."
                      value={newDesc}
                      onChange={e => setNewDesc(e.target.value)}
                    />
                  </div>

                  {/* Attach Documents & Files (PNG, PDF, JPG, JPEG, TXT) */}
                  <div className="mb-2">
                    <label className="form-label fw-bold small d-flex align-items-center justify-content-between mb-1.5">
                      <span className="d-flex align-items-center gap-1.5">
                        <Paperclip size={14} className="text-primary" />
                        <span>Attach Documents & Files</span>
                      </span>
                      <span className="text-muted fw-normal" style={{ fontSize: '0.72rem' }}>
                        PNG, PDF, JPG, JPEG, TXT (up to 25MB)
                      </span>
                    </label>

                    <div
                      className="border border-dashed rounded-3 p-3 text-center bg-light cursor-pointer hover-bg-light transition-all"
                      onClick={() => document.getElementById('new-ticket-file-input')?.click()}
                      style={{ cursor: 'pointer', borderColor: '#cbd5e1' }}
                    >
                      <Paperclip size={20} className="text-primary mb-1 inline" />
                      <div className="small fw-semibold text-dark">
                        Click to browse or drop documents here
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        Attach loan contracts, sanction letters, ID cards, error logs
                      </div>
                      <input
                        id="new-ticket-file-input"
                        type="file"
                        multiple
                        accept=".png,.jpg,.jpeg,.pdf,.txt,.doc,.docx,.xls,.xlsx,.csv"
                        className="d-none"
                        onChange={(e) => {
                          if (e.target.files) {
                            setNewTicketAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                          }
                        }}
                      />
                    </div>

                    {newTicketAttachments.length > 0 && (
                      <div className="d-flex flex-wrap gap-2 mt-2.5">
                        {newTicketAttachments.map((f, idx) => (
                          <span
                            key={idx}
                            className="badge bg-white text-dark border px-2.5 py-1.5 rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs"
                            style={{ fontSize: '0.78rem' }}
                          >
                            {isImageFile(f.name) ? (
                              <ImageIcon size={13} className="text-info" />
                            ) : isPdfFile(f.name) ? (
                              <FileText size={13} className="text-danger" />
                            ) : (
                              <File size={13} className="text-primary" />
                            )}
                            <span className="text-truncate" style={{ maxWidth: '160px' }}>{f.name}</span>
                            <span className="text-muted" style={{ fontSize: '0.7rem' }}>({formatFileSize(f.size)})</span>
                            <button
                              type="button"
                              className="btn-close ms-1"
                              style={{ fontSize: '0.55rem' }}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setNewTicketAttachments(prev => prev.filter((_, i) => i !== idx));
                              }}
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer bg-light px-4 py-2.5">
                  <button type="button" className="btn btn-secondary btn-sm px-3" onClick={() => setShowNewTicketModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm px-4 fw-semibold shadow-sm">Submit Ticket</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          MODAL 2: SIMULATE INBOUND EMAIL
          ============================================================== */}
      {showSimulateModal && (
        <div className="modal show d-block modal-backdrop-blur" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header bg-white border-bottom py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <div className="p-2 rounded-3 bg-primary-subtle text-primary">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h5 className="modal-title fw-bold mb-0">Simulate Inbound Email</h5>
                    <small className="text-muted">Test email forwarding & M365 auto-threading</small>
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={() => { setShowSimulateModal(false); setSimResult(null); }}></button>
              </div>
              <form onSubmit={handleSimulateEmail}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="form-label fw-bold small">Destination Forwarding / Mailbox Address</label>
                    <input
                      type="email"
                      className="form-control font-monospace text-primary fw-semibold"
                      value={simMailbox}
                      onChange={e => setSimMailbox(e.target.value)}
                    />
                    <small className="text-muted">Points to verified forwarding target: <code>1281753993@tickets.helpdesk.com</code></small>
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label fw-bold small">Customer Sender Name</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={simSenderName}
                        onChange={e => setSimSenderName(e.target.value)}
                      />
                    </div>
                    <div className="col">
                      <label className="form-label fw-bold small">Customer Email</label>
                      <input
                        type="email"
                        className="form-control"
                        required
                        value={simSenderEmail}
                        onChange={e => setSimSenderEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold small">Subject *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. Loan verification clarification"
                      value={simSubject}
                      onChange={e => setSimSubject(e.target.value)}
                    />
                    <small className="text-muted">Pro-tip: Include <code>[KUWY-1009]</code> in subject to test thread auto-continuation.</small>
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
                    <div className="alert alert-success d-flex align-items-center gap-2 py-2 px-3 mb-0 rounded-3 small">
                      <CheckCircle2 size={16} className="text-success" />
                      <span>{simResult}</span>
                    </div>
                  )}
                </div>
                <div className="modal-footer bg-light px-4 py-2.5">
                  <button type="button" className="btn btn-secondary btn-sm px-3" onClick={() => { setShowSimulateModal(false); setSimResult(null); }}>Close</button>
                  <button type="submit" className="btn btn-primary btn-sm px-4 fw-semibold shadow-sm">Dispatch Message</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          MODAL 3: EMAIL FORWARDING SETUP WIZARD (Matching Screenshots)
          ============================================================== */}
      {showForwardingModal && (
        <EmailForwardingModal
          isOpen={showForwardingModal}
          onClose={() => setShowForwardingModal(false)}
          activeCompany={activeCompany}
          mailboxes={mailboxes}
          onForwardingVerified={() => loadCompanyData(activeCompany.id)}
        />
      )}

      {/* ==============================================================
          MODAL 4: DOCUMENT & IMAGE ATTACHMENT PREVIEW LIGHTBOX
          ============================================================== */}
      {previewAttachment && (
        <div
          className="modal show d-block modal-backdrop-blur"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', zIndex: 1080 }}
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-lg"
            style={{ maxWidth: '850px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden bg-white">
              <div className="modal-header bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2 overflow-hidden">
                  {isImageFile(previewAttachment.fileName) ? (
                    <ImageIcon size={18} className="text-info flex-shrink-0" />
                  ) : isPdfFile(previewAttachment.fileName) ? (
                    <FileText size={18} className="text-danger flex-shrink-0" />
                  ) : (
                    <File size={18} className="text-primary flex-shrink-0" />
                  )}
                  <h6 className="modal-title fw-bold text-dark text-truncate mb-0" style={{ fontSize: '1rem' }}>
                    {previewAttachment.fileName}
                  </h6>
                  <span className="badge bg-light text-secondary border ms-1" style={{ fontSize: '0.75rem' }}>
                    {formatFileSize(previewAttachment.fileSizeBytes)}
                  </span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <a
                    href={`http://localhost:8080${previewAttachment.downloadUrl}`}
                    download={previewAttachment.fileName}
                    className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5 fw-semibold"
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </a>
                  <button
                    type="button"
                    className="btn btn-sm btn-light border-0 rounded-circle p-1.5 text-muted hover-bg-light"
                    onClick={() => setPreviewAttachment(null)}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="modal-body p-0 bg-light d-flex align-items-center justify-content-center" style={{ minHeight: '350px', maxHeight: '75vh', overflow: 'auto' }}>
                {isImageFile(previewAttachment.fileName) ? (
                  <div className="p-4 text-center w-100">
                    <img
                      src={`http://localhost:8080${previewAttachment.previewUrl}`}
                      alt={previewAttachment.fileName}
                      className="img-fluid rounded-3 shadow-sm"
                      style={{ maxHeight: '65vh', objectFit: 'contain' }}
                    />
                  </div>
                ) : isPdfFile(previewAttachment.fileName) ? (
                  <iframe
                    src={`http://localhost:8080${previewAttachment.previewUrl}`}
                    title={previewAttachment.fileName}
                    style={{ width: '100%', height: '65vh', border: 'none' }}
                  />
                ) : (
                  <iframe
                    src={`http://localhost:8080${previewAttachment.previewUrl}`}
                    title={previewAttachment.fileName}
                    style={{ width: '100%', height: '55vh', border: 'none', background: '#fff' }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
