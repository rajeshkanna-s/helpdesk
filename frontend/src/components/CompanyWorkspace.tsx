import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  Inbox, Send, Lock, Mail, CheckCircle2, AlertCircle, Clock,
  Building2, RefreshCw, Plus, BarChart3, Sparkles,
  LogOut, FileSpreadsheet, Users, Search, ChevronRight, ArrowLeft,
  BookOpen, Zap, Play, Pause, RotateCcw, SlidersHorizontal,
  Paperclip, FileText, Image as ImageIcon, Download, Eye, File, X,
  CreditCard, Globe, ExternalLink, Bell, UserPlus, Settings,
  Menu, Headphones, ChevronDown, ChevronLeft, MoreHorizontal, ArrowUpDown, PanelRight, MessageSquare
} from 'lucide-react';
import { apiService, setApiTenantId } from '../services/api';
import type {
  Company, DashboardStats, Ticket, TicketThread, CompanyMailbox,
  Department, AuthUser, User, KbArticle, ScenarioMacro, TicketAttachment,
  CannedResponse, CompanySubscription, CustomerContact, NotificationItem
} from '../types';
import { MisTrackingView } from './MisTrackingView';
import { SupportEngineersView } from './SupportEngineersView';
import { EmailForwardingModal } from './EmailForwardingModal';
import { AdminSettingsConsole } from './AdminSettingsConsole';

export type WorkspaceTab =
  | 'tickets'
  | 'dashboard'
  | 'customers'
  | 'engineers'
  | 'mis'
  | 'mailboxes'
  | 'solutions'
  | 'automations'
  | 'billing'
  | 'settings';

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
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [showMobileTicket, setShowMobileTicket] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const sidebarRef = useRef<HTMLElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDetailsElement>(null);
  const newTicketDialogRef = useRef<HTMLDialogElement>(null);
  const propertiesRef = useRef<HTMLElement>(null);
  const loadedCompanyRef = useRef<number | null>(null);
  const workspaceRequestRef = useRef(0);
  const workspaceMetadataRequestRef = useRef(0);
  const ticketRequestRef = useRef(0);

  // Stats & Tickets
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);
  const [viewFilter, setViewFilter] = useState<string>('ALL');
  const [ticketSearch, setTicketSearch] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority'>('newest');
  const [priorityFilter, setPriorityFilter] = useState<Ticket['priority'] | 'ALL'>('ALL');
  const [ticketPage, setTicketPage] = useState(0);
  const [ticketPageInfo, setTicketPageInfo] = useState({ number: 0, size: 25, totalElements: 0, totalPages: 0 });
  const [ticketCounts, setTicketCounts] = useState<Record<string, number>>({});

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
  const [showPropertiesDrawer, setShowPropertiesDrawer] = useState(() => window.matchMedia('(min-width: 1400px)').matches);
  const [isWideDetailsLayout, setIsWideDetailsLayout] = useState(() => window.matchMedia('(min-width: 1400px)').matches);
  const isDetailsOverlay = showPropertiesDrawer && !isWideDetailsLayout && activeTab === 'tickets';

  // Time Tracker State
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Section D States (Screens 19, 20, 21, 23, 24)
  const [customers, setCustomers] = useState<CustomerContact[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerContact | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustFirst, setNewCustFirst] = useState('');
  const [newCustLast, setNewCustLast] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustOrg, setNewCustOrg] = useState('');

  // Notifications State (Screen 24)
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  // KB Manager State (Screen 23)
  const [kbCategories, setKbCategories] = useState<any[]>([]);
  const [showNewArticleModal, setShowNewArticleModal] = useState(false);
  const [newArtTitle, setNewArtTitle] = useState('');
  const [newArtCatId, setNewArtCatId] = useState<number>(1);
  const [newArtContent, setNewArtContent] = useState('');
  const [newArtStatus, setNewArtStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED');

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
      const companyChanged = loadedCompanyRef.current !== activeCompany.id;
      loadedCompanyRef.current = activeCompany.id;
      loadCompanyData(activeCompany.id, companyChanged, !companyChanged);
    }
  }, [activeCompany, viewFilter, ticketPage, sortBy]);

  useEffect(() => {
    if (!showNewTicketModal) return;
    const dialog = newTicketDialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [showNewTicketModal]);

  useEffect(() => {
    if (!isDetailsOverlay) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    propertiesRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [isDetailsOverlay]);

  useEffect(() => {
    const closePopovers = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavigationOpen(false);
        setShowNotifDropdown(false);
        setShowScenarioMenu(false);
        setShowFilters(false);
        setShowPropertiesDrawer(false);
        toolsMenuRef.current?.removeAttribute('open');
      }
    };
    const closeNotifications = (event: PointerEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        toolsMenuRef.current.removeAttribute('open');
      }
    };
    const desktopLayout = window.matchMedia('(min-width: 1400px)');
    const desktopNavigation = window.matchMedia('(min-width: 1100px)');
    const closeNarrowDetails = () => {
      setIsWideDetailsLayout(desktopLayout.matches);
      if (!desktopLayout.matches) setShowPropertiesDrawer(false);
    };
    const closeMobileNavigation = () => {
      if (desktopNavigation.matches) setIsNavigationOpen(false);
    };
    document.addEventListener('keydown', closePopovers);
    document.addEventListener('pointerdown', closeNotifications);
    desktopLayout.addEventListener('change', closeNarrowDetails);
    desktopNavigation.addEventListener('change', closeMobileNavigation);
    return () => {
      document.removeEventListener('keydown', closePopovers);
      document.removeEventListener('pointerdown', closeNotifications);
      desktopLayout.removeEventListener('change', closeNarrowDetails);
      desktopNavigation.removeEventListener('change', closeMobileNavigation);
    };
  }, []);

  useEffect(() => {
    if (!isNavigationOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>('button, a, select');
    focusable?.[0]?.focus();
    const trapNavigationFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapNavigationFocus);
    return () => {
      document.removeEventListener('keydown', trapNavigationFocus);
      previousFocus?.focus();
    };
  }, [isNavigationOpen]);

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

  // Section D Handlers (Screens 20, 23, 24)
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustEmail.trim() || !newCustFirst.trim()) return;
    try {
      const created = await apiService.createCustomer(activeCompany.id, {
        firstName: newCustFirst.trim(),
        lastName: newCustLast.trim() || undefined,
        email: newCustEmail.trim(),
        phone: newCustPhone.trim() || undefined,
        organization: newCustOrg.trim() || undefined,
      });
      setCustomers(prev => [created, ...prev]);
      setShowNewCustomerModal(false);
      setNewCustFirst('');
      setNewCustLast('');
      setNewCustEmail('');
      setNewCustPhone('');
      setNewCustOrg('');
      showNotification(`Customer contact created: ${created.email}`);
    } catch {
      showNotification('Failed to create customer contact', 'warning');
    }
  };

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArtTitle.trim() || !newArtContent.trim()) return;
    try {
      const created = await apiService.createKbArticle(activeCompany.id, {
        categoryId: newArtCatId,
        title: newArtTitle.trim(),
        contentHtml: newArtContent.trim(),
        status: newArtStatus,
      });
      setKbArticles(prev => [created, ...prev]);
      setShowNewArticleModal(false);
      setNewArtTitle('');
      setNewArtContent('');
      showNotification(`Solution article published: "${created.title}"`);
    } catch {
      showNotification('Failed to save solution article', 'warning');
    }
  };

  const handleMarkAllNotifsRead = async () => {
    try {
      await apiService.markAllNotificationsRead(activeCompany.id);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showNotification('All notifications marked as read');
    } catch {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    }
  };

  const handleMarkNotifRead = async (notif: NotificationItem) => {
    try {
      await apiService.markNotificationRead(activeCompany.id, notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
      if (notif.ticketId) {
        setShowNotifDropdown(false);
        setActiveTab('tickets');
        loadTicketDetail(notif.ticketId);
      }
    } catch {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    }
  };

  // Filtered Customers (Screen 20)
  const filteredCustomers = customers.filter(c => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      (c.displayName || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.organization || '').toLowerCase().includes(q)
    );
  });

  const showNotification = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setActionNotice({ type, text });
    setTimeout(() => setActionNotice(null), 4000);
  };

  const loadCompanyData = async (companyId: number, resetSelection = false, queueOnly = false) => {
    const requestId = ++workspaceRequestRef.current;
    const metadataRequestId = queueOnly ? workspaceMetadataRequestRef.current : ++workspaceMetadataRequestRef.current;
    setIsLoadingWorkspace(true);
    if (resetSelection) {
      ticketRequestRef.current += 1;
      setTickets([]);
      setSelectedTicket(null);
      setSelectedTicketIds([]);
      setShowMobileTicket(false);
      setDeptFilter(null);
      setPriorityFilter('ALL');
      setStats(null);
      setDepartments([]);
      setAgents([]);
      setMailboxes([]);
      setKbArticles([]);
      setCannedResponses([]);
      setCustomers([]);
      setNotifications([]);
      setCurrentSubscription(null);
      setTicketCounts({});
    }
    try {
      const [pageData, workspaceData] = await Promise.all([
        apiService.getTicketPage(companyId, viewFilter, resetSelection ? 0 : ticketPage, 25, sortBy === 'oldest' ? 'asc' : 'desc'),
        queueOnly ? null : Promise.all([
          apiService.getDashboardStats(companyId).catch(() => null),
          apiService.getMailboxes(companyId).catch(() => []),
          apiService.getDepartments(companyId).catch(() => []),
          apiService.getAgents(companyId).catch(() => []),
          apiService.getKbArticles(companyId).catch(() => []),
          apiService.getCannedResponses(companyId).catch(() => []),
          apiService.getCurrentSubscription(companyId).catch(() => null),
          apiService.getCustomers(companyId).catch(() => []),
          apiService.getNotifications(companyId, currentUser.userId).catch(() => []),
          apiService.getKbCategories(companyId).catch(() => []),
          Promise.all(['ALL', 'OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'].map(async status => {
            const page = await apiService.getTicketPage(companyId, status, 0, 1);
            return [status, page.totalElements] as const;
          })),
        ]),
      ]);

      // A new queue view must not discard reference data that is still loading.
      if (workspaceData && metadataRequestId === workspaceMetadataRequestRef.current && loadedCompanyRef.current === companyId) {
        const [statsData, mailboxesData, deptsData, agentsData, kbData, crData, subData, custData, notifsData, catsData, countsData] = workspaceData;
        if (statsData) setStats(statsData);
        setMailboxes(mailboxesData);
        setDepartments(deptsData);
        setAgents(agentsData);
        setKbArticles(kbData);
        setCannedResponses(crData);
        if (subData) setCurrentSubscription(subData);
        setCustomers(custData);
        setNotifications(notifsData);
        setKbCategories(catsData);
        setTicketCounts(Object.fromEntries(countsData));
        if (catsData.length) setNewArtCatId(catsData[0].id);
        if (mailboxesData.length) setSimMailbox(mailboxesData[0].forwardingAddress || mailboxesData[0].emailAddress);
        if (deptsData.length) setNewDeptId(deptsData[0].id);
      }

      if (requestId !== workspaceRequestRef.current) return;
      const ticketsData = pageData.content;
      setTickets(ticketsData);
      setTicketPageInfo({ number: pageData.number, size: pageData.size, totalElements: pageData.totalElements, totalPages: pageData.totalPages });
      setTicketCounts(previous => ({ ...previous, [viewFilter]: pageData.totalElements }));
      setSelectedTicketIds(previous => previous.filter(id => ticketsData.some(ticket => ticket.id === id)));
      if (resetSelection) setTicketPage(0);
      else if (ticketPage >= pageData.totalPages && ticketPage > 0) setTicketPage(Math.max(0, pageData.totalPages - 1));

      const refreshedTicket = ticketsData.find(ticket => ticket.id === selectedTicket?.id);
      if (!ticketsData.length) {
        setSelectedTicket(null);
      } else if (resetSelection || !refreshedTicket) {
        loadTicketDetail(ticketsData[0].id, false);
      } else {
        setSelectedTicket(current => current?.id === refreshedTicket.id ? { ...current, ...refreshedTicket, threads: refreshedTicket.threads ?? current.threads } : current);
      }
    } catch {
      // Fallback
    } finally {
      if (requestId === workspaceRequestRef.current) setIsLoadingWorkspace(false);
    }
  };

  const loadTicketDetail = async (id: number, openOnMobile = true) => {
    const requestId = ++ticketRequestRef.current;
    const detail = await apiService.getTicketDetail(id);
    if (requestId !== ticketRequestRef.current) return;
    setSelectedTicket(detail);
    if (openOnMobile) setShowMobileTicket(true);
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
      setSelectedTicket({ ...updated, threads: updated.threads ?? selectedTicket.threads });
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
      setSelectedTicket({ ...updated, threads: updated.threads ?? selectedTicket.threads });
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
      setSelectedTicket({ ...updated, threads: updated.threads ?? selectedTicket.threads });
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
      setSelectedTicket({ ...updated, threads: updated.threads ?? selectedTicket.threads });
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
    if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
    if (!ticketSearch.trim()) return true;
    const q = ticketSearch.toLowerCase();
    return (
      t.ticketNumber.toLowerCase().includes(q.replace(/^#/, '')) ||
      t.subject.toLowerCase().includes(q) ||
      (t.contact?.firstName || '').toLowerCase().includes(q) ||
      (t.contact?.lastName || '').toLowerCase().includes(q) ||
      (t.contact?.email || '').toLowerCase().includes(q)
    );
  });

  // The API paginates status views; text and attribute filters refine the current page.
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    if (sortBy === 'priority') {
      const pMap: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
    }
    const dateDifference = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sortBy === 'oldest' ? -dateDifference : dateDifference;
  });

  const ticketViews = [
    { id: 'ALL', label: 'All tickets' },
    { id: 'OPEN', label: 'Open' },
    { id: 'IN_PROGRESS', label: 'In progress' },
    { id: 'WAITING_ON_CUSTOMER', label: 'Waiting on customer' },
    { id: 'RESOLVED', label: 'Resolved' },
    { id: 'CLOSED', label: 'Closed' },
  ];
  const activeFilterCount = Number(deptFilter !== null) + Number(priorityFilter !== 'ALL');
  const visibleSelectedIds = selectedTicketIds.filter(id => sortedTickets.some(ticket => ticket.id === id));
  const formatLabel = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, char => char.toUpperCase());
  const navigateToTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    setIsNavigationOpen(false);
    if (!isWideDetailsLayout) setShowPropertiesDrawer(false);
  };
  const resetTicketFilters = () => {
    setViewFilter('ALL');
    setTicketPage(0);
    setDeptFilter(null);
    setPriorityFilter('ALL');
    setTicketSearch('');
    setSelectedTicketIds([]);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const tabLabels: Record<WorkspaceTab, { title: string; subtitle: string }> = {
    tickets: {
      title: 'Tickets',
      subtitle: 'A little clarity for every customer conversation.',
    },
    dashboard: {
      title: 'Overview',
      subtitle: 'Keep a pulse on your team, ticket volume, and service targets.',
    },
    customers: {
      title: 'Customers',
      subtitle: 'The people and organizations your team supports.',
    },
    engineers: {
      title: 'Support team',
      subtitle: 'Manage teammates, invitations, and department assignments.',
    },
    mis: {
      title: 'Reports',
      subtitle: 'Explore support activity and export the details you need.',
    },
    mailboxes: {
      title: 'Email channels',
      subtitle: 'Connect your support inboxes and manage email routing.',
    },
    solutions: {
      title: 'Knowledge base',
      subtitle: 'Helpful answers for your customers and your team.',
    },
    automations: {
      title: 'Automations',
      subtitle: 'Make routine support work simpler with reusable workflows.',
    },
    billing: {
      title: 'Plans & billing',
      subtitle: 'Your subscription, team capacity, and workspace usage.',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Make this workspace work for your team.',
    },
  };

  return (
    <div className={`enterprise-shell company-workspace ${isNavigationOpen ? 'navigation-open' : ''}`}>
      {isNavigationOpen && (
        <button type="button" className="workspace-nav-backdrop" tabIndex={-1} aria-label="Close navigation" onClick={() => setIsNavigationOpen(false)} />
      )}
      <aside ref={sidebarRef} id="workspace-navigation" className="enterprise-sidebar" aria-label="Workspace navigation">
        <div className="sidebar-brand-header">
          <div className="sidebar-brand-icon"><Headphones size={22} strokeWidth={2} /></div>
          <div className="workspace-wordmark">
            <strong>{activeCompany.companyCode.toLowerCase()}<span>desk</span></strong>
            <small>Customer support, connected.</small>
          </div>
          <button type="button" className="workspace-icon-button workspace-nav-close" aria-label="Close navigation" onClick={() => setIsNavigationOpen(false)}><X size={19} /></button>
        </div>

        <div className="workspace-company-label" title={activeCompany.name}>
          <Building2 size={15} />
          <span>{activeCompany.name}</span>
        </div>

        <nav className="workspace-sidebar-scroll" aria-label="Main">
          {currentUser.roleType === 'SUPER_ADMIN' && (
            <button type="button" className="workspace-admin-return" onClick={onSwitchToAdmin}>
              <ArrowLeft size={15} /> Platform admin
            </button>
          )}
          {[
            {
              label: 'Workspace',
              items: [
                { id: 'tickets' as const, label: 'Tickets', icon: Inbox },
                { id: 'dashboard' as const, label: 'Overview', icon: BarChart3 },
                { id: 'customers' as const, label: 'Customers', icon: Users },
                { id: 'solutions' as const, label: 'Knowledge base', icon: BookOpen },
              ],
            },
            {
              label: 'Manage',
              items: [
                { id: 'engineers' as const, label: 'Support team', icon: Users },
                { id: 'mis' as const, label: 'Reports', icon: FileSpreadsheet },
                { id: 'mailboxes' as const, label: 'Email channels', icon: Mail },
                { id: 'automations' as const, label: 'Automations', icon: Zap },
              ],
            },
          ].map(group => (
            <div key={group.label}>
              <div className="sidebar-section-label">{group.label}</div>
              <div className="sidebar-nav-group">
                {group.items.map(item => (
                  <button
                    key={item.id}
                    id={`rail-tab-${item.id}`}
                    type="button"
                    className={`sidebar-menu-btn ${activeTab === item.id ? 'active' : ''}`}
                    aria-current={activeTab === item.id ? 'page' : undefined}
                    onClick={() => navigateToTab(item.id)}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                    {item.id === 'tickets' && <span className="sidebar-badge">{ticketCounts.ALL ?? 0}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="workspace-secondary-nav sidebar-nav-group">
            <button id="rail-tab-settings" type="button" className={`sidebar-menu-btn ${activeTab === 'settings' ? 'active' : ''}`} aria-current={activeTab === 'settings' ? 'page' : undefined} onClick={() => navigateToTab('settings')}>
              <Settings size={18} /><span>Settings</span>
            </button>
            <button id="rail-tab-billing" type="button" className={`sidebar-menu-btn ${activeTab === 'billing' ? 'active' : ''}`} aria-current={activeTab === 'billing' ? 'page' : undefined} onClick={() => navigateToTab('billing')}>
              <CreditCard size={18} /><span>Plans & billing</span>
            </button>
          </div>
        </nav>

        <div className="workspace-plan-card">
          <span className="workspace-eyebrow">Your workspace</span>
          <div><strong>{formatLabel(currentSubscription?.planTier || activeCompany.planName)} plan</strong><span className="workspace-plan-dot" /></div>
          <button type="button" onClick={() => navigateToTab('billing')}>Manage subscription <ChevronRight size={14} /></button>
        </div>
        <div className="sidebar-footer">
          <div className="workspace-user">
            <div className="workspace-avatar">
              {currentUser.firstName?.charAt(0) || 'U'}{currentUser.lastName?.charAt(0)}
              <span className={`presence-indicator presence-${agentPresence.toLowerCase()}`} />
            </div>
            <div className="workspace-user-info">
              <strong title={currentUser.displayName}>{currentUser.displayName}</strong>
              <span>{formatLabel(currentUser.roleType)}</span>
            </div>
            <button id="btn-sign-out" type="button" className="workspace-icon-button" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
          </div>
          <label className="workspace-presence">
            <span>My availability</span>
            <select value={agentPresence} onChange={e => setAgentPresence(e.target.value as typeof agentPresence)} aria-label="My availability">
              <option value="ONLINE">Available</option>
              <option value="BUSY">Busy</option>
              <option value="AWAY">Away</option>
            </select>
          </label>
        </div>
      </aside>

      {/* ====================================================================
          2. RIGHT MAIN AREA (TOPBAR + MULTI-PANE WORKSPACE CONTENT)
          ==================================================================== */}
      <div className="enterprise-main" inert={isNavigationOpen}>
        {/* Top Contextual Header Bar */}
        <header className="enterprise-topbar">
          <div className="workspace-header-context">
            <button id="btn-workspace-menu" type="button" className="workspace-icon-button workspace-menu-toggle" aria-label="Open navigation" aria-expanded={isNavigationOpen} aria-controls="workspace-navigation" onClick={() => setIsNavigationOpen(true)}><Menu size={20} /></button>
            <div className="workspace-breadcrumb" aria-label="Breadcrumb">
              <span>{activeCompany.companyCode} workspace</span>
              <ChevronRight size={14} />
              <strong>{tabLabels[activeTab].title}</strong>
            </div>

            {/* Tenant Switcher if Super Admin */}
            {currentUser.roleType === 'SUPER_ADMIN' && companies.length > 1 && (
              <div className="workspace-tenant-switcher">
                <select
                  className="form-select form-select-sm"
                  aria-label="Switch company"
                  value={activeCompany.id}
                  onChange={e => {
                    const found = companies.find(c => c.id === Number(e.target.value));
                    if (found) onSwitchCompany(found);
                  }}
                >
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.companyCode}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="workspace-topbar-actions">
            {/* Customer Support Portal Direct Link */}
            <a
              href={`/${activeCompany.subdomain}`}
              target="_blank"
              rel="noreferrer"
              className="workspace-portal-link"
              title="Open Public Customer Support Portal in new tab"
            >
              <Globe size={16} />
              <span>Customer portal</span>
              <ExternalLink size={12} />
            </a>

            <details ref={toolsMenuRef} className="workspace-tools-menu">
              <summary className="workspace-icon-button" aria-label="Email tools" title="Email tools"><MoreHorizontal size={20} /></summary>
              <div className="workspace-tools-popover">
                <span className="workspace-eyebrow">Email tools</span>
                <button id="btn-forwarding-topbar" type="button" onClick={e => { setShowForwardingModal(true); e.currentTarget.closest('details')?.removeAttribute('open'); }}>
                  <Send size={16} /><span>Set up email forwarding</span>
                </button>
                <button id="btn-simulate-email" type="button" onClick={e => { setShowSimulateModal(true); e.currentTarget.closest('details')?.removeAttribute('open'); }}>
                  <Mail size={16} /><span>Simulate incoming email</span>
                </button>
              </div>
            </details>

            {/* Notification Center Bell (Screen 24) */}
            <div className="position-relative" ref={notificationsRef}>
              <button
                id="btn-notifications-center"
                type="button"
                className="workspace-icon-button workspace-notification-toggle"
                onClick={() => setShowNotifDropdown(prev => !prev)}
                title="Notifications"
                aria-label={`Notifications${notifications.some(n => !n.isRead) ? `, ${notifications.filter(n => !n.isRead).length} unread` : ''}`}
                aria-expanded={showNotifDropdown}
                aria-controls="workspace-notifications"
              >
                <Bell size={16} className="text-secondary" />
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <span className="workspace-unread-dot" />
                )}
              </button>

              {showNotifDropdown && (
                <div
                  id="workspace-notifications"
                  className="workspace-notifications bg-white border overflow-hidden"
                  role="region"
                  aria-label="Notifications"
                >
                  <div className="p-3 bg-light border-bottom d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="fw-bold mb-0 text-dark">Notifications</h6>
                      <small className="text-muted" style={{ fontSize: '0.72rem' }}>
                        Your latest workspace activity
                      </small>
                    </div>
                    {notifications.some(n => !n.isRead) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-link p-0 text-primary text-decoration-none fw-semibold small"
                        onClick={handleMarkAllNotifsRead}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-muted small">
                        No notifications recorded.
                      </div>
                    ) : (
                      notifications.map(notif => (
                        <button
                          type="button"
                          key={notif.id}
                          className={`workspace-notification-row p-3 border-bottom ${!notif.isRead ? 'is-unread' : ''}`}
                          onClick={() => handleMarkNotifRead(notif)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="d-flex justify-content-between align-items-start mb-1">
                            <span className="fw-bold text-dark small d-flex align-items-center gap-1.5">
                              {!notif.isRead && (
                                <span className="p-1 rounded-circle bg-primary d-inline-block" style={{ width: '6px', height: '6px' }} />
                              )}
                              {notif.title}
                            </span>
                            <small className="text-muted" style={{ fontSize: '0.68rem' }}>
                              {notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                            </small>
                          </div>
                          <p className="text-secondary small mb-1" style={{ fontSize: '0.78rem' }}>
                            {notif.message}
                          </p>
                          {notif.ticketId && (
                            <span className="badge bg-light text-primary border small" style={{ fontSize: '0.68rem' }}>
                              View Ticket #{notif.ticketId} →
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* New Ticket (Screen 19) */}
            <button
              id="btn-new-ticket"
              type="button"
              aria-label="New ticket"
              className="btn btn-primary workspace-new-ticket"
              onClick={() => setShowNewTicketModal(true)}
            >
              <Plus size={15} />
              <span>New ticket</span>
            </button>
          </div>
        </header>

        {/* Global Toast Notification */}
        {actionNotice && (
          <div className="workspace-toast" role="status" aria-live="polite">
            <div className={`alert alert-${actionNotice.type} py-2 px-3 mb-0 rounded-3 shadow-xs small d-flex align-items-center justify-content-between`}>
              <span className="fw-semibold">{actionNotice.text}</span>
              <button type="button" className="btn-close btn-sm" aria-label="Dismiss notification" onClick={() => setActionNotice(null)}></button>
            </div>
          </div>
        )}

        {/* Main Workspace Content Area */}
        <main className={`enterprise-content ${activeTab === 'tickets' ? 'is-ticket-workspace' : ''}`}>
          {activeTab !== 'tickets' && (
            <div className="workspace-page-heading">
              <div>
                <span className="workspace-eyebrow">Workspace</span>
                <h1>{tabLabels[activeTab].title}</h1>
                <p>{tabLabels[activeTab].subtitle}</p>
              </div>
            </div>
          )}
          {/* ==============================================================
              TAB 1: TICKETS COMMAND CENTER (FRESHDESK /a/tickets/1 LAYOUT)
              ============================================================== */}
          {activeTab === 'tickets' && (
            <div className={`tickets-workspace ${showMobileTicket ? 'mobile-ticket-open' : ''}`}>
              <div className="workspace-page-heading tickets-heading">
                <div>
                  <span className="workspace-eyebrow">Team inbox</span>
                  <h1>Tickets <span className="workspace-heading-count">{ticketCounts.ALL ?? 0}</span></h1>
                  <p>{tabLabels.tickets.subtitle}</p>
                </div>
                <div className="workspace-queue-summary">
                  <span><span className="queue-summary-dot" />{tickets.filter(t => !t.assignedAgent && !['RESOLVED', 'CLOSED', 'SPAM'].includes(t.status)).length} unassigned on page</span>
                  <span><span className="queue-summary-dot is-overdue" />{stats?.breachedSlaTickets ?? 0} SLA overdue</span>
                  <button type="button" className="workspace-icon-button" onClick={() => loadCompanyData(activeCompany.id)} disabled={isLoadingWorkspace} title="Refresh tickets" aria-label="Refresh tickets">
                    <RefreshCw size={16} className={isLoadingWorkspace ? 'spin' : ''} />
                  </button>
                </div>
              </div>

              <nav className="ticket-view-tabs" aria-label="Ticket views">
                {ticketViews.map(view => (
                  <button key={view.id} type="button" className={viewFilter === view.id ? 'active' : ''} aria-pressed={viewFilter === view.id} onClick={() => { setViewFilter(view.id); setTicketPage(0); setSelectedTicketIds([]); setShowMobileTicket(false); }}>
                    {view.label}<span>{ticketCounts[view.id] ?? 0}</span>
                  </button>
                ))}
              </nav>

              <div className="ticket-workbench-controls">
                <div className="workspace-search ticket-search">
                  <Search size={17} />
                  <input id="workspace-ticket-search" type="search" aria-label="Search tickets" placeholder="Search this page by subject, ID, or customer..." value={ticketSearch} onChange={e => { setTicketSearch(e.target.value); setSelectedTicketIds([]); }} />
                  {ticketSearch && <button type="button" className="workspace-icon-button" aria-label="Clear ticket search" onClick={() => setTicketSearch('')}><X size={15} /></button>}
                </div>
                <div className="ticket-control-actions">
                  <button type="button" className={`workspace-filter-button ${showFilters || activeFilterCount ? 'active' : ''}`} onClick={() => setShowFilters(prev => !prev)} aria-expanded={showFilters} aria-controls="ticket-filters">
                    <SlidersHorizontal size={15} /><span>Filters</span>{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}<ChevronDown size={13} />
                  </button>
                  <label className="ticket-sort-control">
                    <ArrowUpDown size={15} />
                    <select aria-label="Sort tickets" value={sortBy} onChange={e => { setSortBy(e.target.value as typeof sortBy); setTicketPage(0); }}>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="priority">Priority on page</option>
                    </select>
                  </label>
                </div>
              </div>

              {showFilters && (
                <div id="ticket-filters" className="ticket-filter-panel">
                  <label>Department
                    <select className="form-select form-select-sm" aria-label="Department" value={deptFilter ?? ''} onChange={e => { setDeptFilter(e.target.value ? Number(e.target.value) : null); setSelectedTicketIds([]); }}>
                      <option value="">All departments</option>
                      {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                    </select>
                  </label>
                  <label>Priority
                    <select className="form-select form-select-sm" aria-label="Priority" value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value as typeof priorityFilter); setSelectedTicketIds([]); }}>
                      <option value="ALL">All priorities</option>
                      {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(priority => <option key={priority} value={priority}>{formatLabel(priority)}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={() => { setDeptFilter(null); setPriorityFilter('ALL'); setSelectedTicketIds([]); }} disabled={!activeFilterCount}>Reset filters</button>
                  <small className="ticket-filter-scope">Filters apply to this page.</small>
                </div>
              )}

              <div className={`ticket-workbench ${showMobileTicket ? 'is-detail-open' : ''}`}>
              <section className="ticket-queue" aria-label="Ticket queue" aria-busy={isLoadingWorkspace}>
                <div className="ticket-queue-heading">
                  <label>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      aria-label="Select all visible tickets"
                      disabled={sortedTickets.length === 0}
                      checked={sortedTickets.length > 0 && visibleSelectedIds.length === sortedTickets.length}
                      ref={element => { if (element) element.indeterminate = visibleSelectedIds.length > 0 && visibleSelectedIds.length < sortedTickets.length; }}
                      onChange={e => setSelectedTicketIds(e.target.checked ? sortedTickets.map(ticket => ticket.id) : [])}
                    />
                    <span>{sortedTickets.length} conversation{sortedTickets.length === 1 ? '' : 's'}</span>
                  </label>
                  {activeFilterCount > 0 && <span className="ticket-filtered-label">Filtered</span>}
                </div>

                {/* Bulk Operations Toolbar when tickets selected */}
                {selectedTicketIds.length > 0 && (
                  <div className="ticket-bulk-actions">
                    <span className="small fw-bold">{selectedTicketIds.length} selected</span>
                    <div className="ticket-bulk-controls">
                      <select
                        className="form-select form-select-sm py-0 text-dark bg-white border-0 fw-semibold"
                        style={{ fontSize: '0.72rem' }}
                        onChange={e => e.target.value && handleBulkStatus(e.target.value)}
                        defaultValue=""
                        aria-label="Bulk update status"
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
                        aria-label="Bulk update priority"
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
                        aria-label="Bulk assign agent"
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
                <div className="ticket-list-scroll">
                  {isLoadingWorkspace && tickets.length === 0 ? (
                    <div className="ticket-queue-loading" role="status">
                      <span className="visually-hidden">Loading tickets...</span>
                      {[1, 2, 3].map(item => <div key={item} className="ticket-skeleton" aria-hidden="true"><span /><span /><span /></div>)}
                    </div>
                  ) : sortedTickets.length === 0 ? (
                    <div className="workspace-empty-state">
                      <span className="workspace-empty-icon"><Inbox size={26} /></span>
                      <h2>{tickets.length ? 'No matching tickets' : 'Your inbox is clear'}</h2>
                      <p>{tickets.length ? 'Try a different search or adjust your filters.' : 'New customer conversations will appear here.'}</p>
                      {tickets.length > 0 ? (
                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={resetTicketFilters}>View all tickets</button>
                      ) : (
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowNewTicketModal(true)}><Plus size={14} /> Create a ticket</button>
                      )}
                    </div>
                  ) : (
                    sortedTickets.map(t => (
                      <article
                        key={t.id}
                        className={`ticket-row ${selectedTicket?.id === t.id ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="form-check-input ticket-row-checkbox"
                          aria-label={`Select ticket ${t.ticketNumber}`}
                          checked={selectedTicketIds.includes(t.id)}
                          onChange={e => setSelectedTicketIds(prev => e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id))}
                        />
                        <button type="button" className="ticket-open-button" onClick={() => loadTicketDetail(t.id)} aria-pressed={selectedTicket?.id === t.id} aria-label={`Open ticket ${t.ticketNumber}: ${t.subject}`}>
                          <span className="ticket-row-topline">
                            <span className="ticket-code">#{t.ticketNumber}</span>
                            <time dateTime={t.createdAt} title={new Date(t.createdAt).toLocaleString()}>{new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
                          </span>
                          <span className="ticket-row-subject" title={t.subject}>{t.subject}</span>
                          <span className="ticket-row-preview">{t.descriptionText || 'No message preview'}</span>
                          <span className="ticket-row-requester">
                            <span className={`ticket-requester-avatar avatar-tone-${t.id % 4}`}>{t.contact?.firstName?.charAt(0) || 'C'}</span>
                            <span className="text-truncate">{[t.contact?.firstName, t.contact?.lastName].filter(Boolean).join(' ') || 'Customer'}</span>
                            <span className="ticket-channel" title={formatLabel(t.channel)} aria-label={formatLabel(t.channel)}>{['EMAIL', 'MICROSOFT_365'].includes(t.channel) ? <Mail size={13} /> : <Globe size={13} />}</span>
                          </span>
                          <span className="ticket-row-bottom">
                            <span className={`badge-status badge-${t.status.toLowerCase()}`}>{formatLabel(t.status)}</span>
                            <span className={`ticket-priority priority-${t.priority.toLowerCase()}`}>{formatLabel(t.priority)}</span>
                          </span>
                        </button>
                      </article>
                    ))
                  )}
                </div>
                <div className="ticket-queue-footer">
                  <span>{sortedTickets.length} shown / {ticketPageInfo.totalElements} total</span>
                  <div className="ticket-pagination" aria-label="Ticket pagination">
                    <button type="button" className="workspace-icon-button" aria-label="Previous ticket page" disabled={ticketPage === 0 || isLoadingWorkspace} onClick={() => { setTicketPage(previous => previous - 1); setSelectedTicketIds([]); }}><ChevronLeft size={14} /></button>
                    <span>{ticketPageInfo.number + 1} / {Math.max(1, ticketPageInfo.totalPages)}</span>
                    <button type="button" className="workspace-icon-button" aria-label="Next ticket page" disabled={ticketPage + 1 >= ticketPageInfo.totalPages || isLoadingWorkspace} onClick={() => { setTicketPage(previous => previous + 1); setSelectedTicketIds([]); }}><ChevronRight size={14} /></button>
                  </div>
                </div>
              </section>

              {/* RIGHT MAIN PANE: FRESHDESK /a/tickets/1 COMMAND CENTER */}
              <section className="ticket-detail-pane" aria-label="Ticket conversation">
                {selectedTicket ? (
                  <div className="ticket-detail-card">
                    <div className="ticket-detail-toolbar">
                      <div className="ticket-toolbar-title">
                        <button type="button" className="workspace-icon-button ticket-back-button" aria-label="Back to ticket list" onClick={() => { setShowMobileTicket(false); setShowPropertiesDrawer(false); }}><ArrowLeft size={18} /></button>
                        <span className="ticket-code">#{selectedTicket.ticketNumber}</span>
                        <span className={`badge-status badge-${selectedTicket.status.toLowerCase()}`}>
                          {formatLabel(selectedTicket.status)}
                        </span>
                      </div>

                      <div className="ticket-toolbar-actions">
                        {/* Scenario Macros Dropdown */}
                        <div className="position-relative">
                          <button
                            type="button"
                            className="workspace-filter-button"
                            onClick={() => setShowScenarioMenu(!showScenarioMenu)}
                            aria-expanded={showScenarioMenu}
                            aria-controls="ticket-scenario-menu"
                          >
                            <Zap size={14} />
                            <span>Run macro</span><ChevronDown size={12} />
                          </button>

                          {showScenarioMenu && (
                            <div
                              id="ticket-scenario-menu"
                              className="ticket-scenario-menu bg-white rounded-3 border p-2"
                            >
                              <div className="workspace-eyebrow p-2">Choose a workflow</div>
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

                        <button type="button" className={`workspace-filter-button ${showPropertiesDrawer ? 'active' : ''}`} aria-label="Toggle ticket details" aria-expanded={showPropertiesDrawer} aria-controls="ticket-properties" onClick={() => setShowPropertiesDrawer(prev => !prev)}><PanelRight size={15} /><span>Details</span></button>
                      </div>
                    </div>

                    <div className={`ticket-sla-notice sla-${selectedTicket.slaStatus?.toLowerCase()}`}>
                      <Clock size={14} />
                      <span>{selectedTicket.slaStatus === 'WITHIN_SLA' ? 'Within SLA' : selectedTicket.slaStatus === 'NEARING_BREACH' ? 'Response due soon' : selectedTicket.slaStatus === 'BREACHED' ? 'SLA overdue' : 'No active SLA target'}</span>
                      {selectedTicket.firstResponseDueAt && <time dateTime={selectedTicket.firstResponseDueAt}>First response due {new Date(selectedTicket.firstResponseDueAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>}
                    </div>

                    {/* Main Split: Conversation Thread (Left) + Properties Drawer (Right) */}
                    <div className="ticket-detail-layout">
                      {/* Thread & Composer Container */}
                      <div className="ticket-conversation" inert={isDetailsOverlay}>
                        {/* Ticket Subject Header */}
                        <div className="ticket-subject-header">
                          <h2>{selectedTicket.subject}</h2>
                          <div className="ticket-subject-meta">
                            <span><Mail size={13} />{selectedTicket.contact?.email || 'Customer conversation'}</span>
                            <span>{selectedTicket.department?.name}</span>
                          </div>
                        </div>
                        <div className="ticket-routing-bar">
                          <label>Status
                            <select className="form-select form-select-sm" aria-label="Ticket status" value={selectedTicket.status} onChange={e => handleStatusChange(e.target.value)}>
                              <option value="OPEN">Open</option>
                              <option value="IN_PROGRESS">In progress</option>
                              <option value="WAITING_ON_CUSTOMER">Waiting on customer</option>
                              <option value="WAITING_ON_THIRD_PARTY">Waiting on third party</option>
                              <option value="RESOLVED">Resolved</option>
                              <option value="CLOSED">Closed</option>
                              <option value="SPAM">Spam</option>
                            </select>
                          </label>
                          <label>Priority
                            <select className="form-select form-select-sm" aria-label="Ticket priority" value={selectedTicket.priority} onChange={e => handlePriorityChange(e.target.value)}>
                              <option value="LOW">Low</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="HIGH">High</option>
                              <option value="URGENT">Urgent</option>
                            </select>
                          </label>
                          <label>Assigned to
                            <select className="form-select form-select-sm" aria-label="Assigned agent" value={selectedTicket.assignedAgent?.id || ''} onChange={e => handleAssignAgent(Number(e.target.value))}>
                              <option value="" disabled>Unassigned</option>
                              {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.displayName}</option>)}
                            </select>
                          </label>
                        </div>

                        {/* Conversation Threads Stream */}
                        <div className="ticket-thread-stream" aria-label="Conversation messages" tabIndex={0}>
                          <div className="ticket-conversation-label"><MessageSquare size={14} />Conversation<span>{selectedTicket.threads?.length || 0}</span></div>
                          {!selectedTicket.threads?.length && <p className="ticket-no-messages">{selectedTicket.descriptionText || 'No messages yet. Start the conversation below.'}</p>}
                          {(selectedTicket.threads || []).map((th, idx) => (
                            <div
                              key={th.id || idx}
                              className={`thread-card ${th.isPrivate ? 'thread-private' : th.senderType === 'CUSTOMER' ? 'thread-customer' : 'thread-agent'}`}
                            >
                              <div className="ticket-message-header">
                                <div className="ticket-message-author">
                                  <span className={`ticket-message-avatar ${th.senderType === 'CUSTOMER' ? 'is-customer' : ''}`}>{th.fromName?.charAt(0) || 'S'}</span>
                                  <div>
                                    <strong>{th.fromName || th.fromEmail}</strong>
                                    <span>{th.isPrivate ? <><Lock size={11} /> Private note</> : th.senderType === 'CUSTOMER' ? 'Customer' : 'Support team'}</span>
                                  </div>
                                </div>
                                <time dateTime={th.createdAt} title={th.fromEmail}>{th.createdAt ? new Date(th.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</time>
                              </div>

                              {th.bodyHtml ? <div className="thread-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(th.bodyHtml) }} /> : <div className="thread-body ticket-plain-message">{th.bodyText}</div>}

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
                        <div className={`ticket-composer ${isPrivateNote ? 'is-private-note' : ''}`}>
                          <div className="ticket-composer-toolbar">
                            <div className="ticket-composer-tabs" aria-label="Reply visibility">
                              <button
                                type="button"
                                className={`ticket-composer-tab ${!isPrivateNote ? 'active' : ''}`}
                                aria-pressed={!isPrivateNote}
                                onClick={() => setIsPrivateNote(false)}
                              >
                                <Send size={14} /> Reply
                              </button>
                              <button
                                type="button"
                                className={`ticket-composer-tab ${isPrivateNote ? 'active' : ''}`}
                                aria-pressed={isPrivateNote}
                                onClick={() => setIsPrivateNote(true)}
                              >
                                <Lock size={14} /> Private note
                              </button>
                            </div>

                            {/* Toolbar Buttons: Attachments & Knowledge Base */}
                            <div className="ticket-composer-tools">
                              <label
                                className="ticket-composer-tool"
                                title="Attach Documents (PNG, PDF, JPG, JPEG, TXT)"
                              >
                                <Paperclip size={16} />
                                <span className="composer-tool-label">Attach</span>
                                <input
                                  type="file"
                                  multiple
                                  accept=".png,.jpg,.jpeg,.pdf,.txt,.doc,.docx,.xls,.xlsx,.csv"
                                  className="visually-hidden"
                                  aria-label="Attach files to reply"
                                  onChange={(e) => {
                                    if (e.target.files) {
                                      setReplyAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                                    }
                                  }}
                                />
                              </label>

                              <button
                                type="button"
                                className="ticket-composer-tool"
                                onClick={() => { setShowKbPicker(!showKbPicker); setShowCannedPicker(false); }}
                                title="Insert Knowledge Base Solution"
                                aria-label="Insert knowledge base article"
                                aria-expanded={showKbPicker}
                              >
                                <BookOpen size={16} />
                                <span className="composer-tool-label">Article</span>
                              </button>

                              <button
                                type="button"
                                className="ticket-composer-tool"
                                onClick={() => { setShowCannedPicker(!showCannedPicker); setShowKbPicker(false); }}
                                title="Insert Canned Response Template (#)"
                                aria-label="Insert reply template"
                                aria-expanded={showCannedPicker}
                              >
                                <Sparkles size={16} />
                                <span className="composer-tool-label">Template</span>
                              </button>
                            </div>
                          </div>

                          {/* Canned Responses Template Picker */}
                          {showCannedPicker && (
                            <div className="ticket-composer-picker p-3 bg-white rounded-3 border">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <span className="small fw-bold text-dark">Reply templates</span>
                                <button type="button" className="btn-close btn-sm" aria-label="Close reply templates" onClick={() => setShowCannedPicker(false)}></button>
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
                            <div className="ticket-composer-picker p-3 bg-white rounded-3 border">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <span className="small fw-bold text-dark">Knowledge base articles</span>
                                <button type="button" className="btn-close btn-sm" aria-label="Close knowledge base articles" onClick={() => setShowKbPicker(false)}></button>
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

                          <div className="ticket-composer-recipient">
                            {isPrivateNote ? <><Lock size={12} />Visible only to your support team</> : <>To: <span>{selectedTicket.contact?.email || 'Customer'}</span></>}
                          </div>
                          <textarea
                            className="form-control ticket-reply-input"
                            rows={3}
                            aria-label={isPrivateNote ? 'Private note' : 'Reply message'}
                            placeholder={isPrivateNote ? 'Add context for your teammates...' : `Write a reply to ${selectedTicket.contact?.firstName || 'your customer'}...`}
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

                          <div className="ticket-composer-footer">
                            <small>{isPrivateNote ? 'Not shared with the customer' : 'Your reply will be sent by email'}</small>
                            <div className="d-flex align-items-center gap-2">
                              <button
                                type="button"
                                className="btn btn-sm btn-light"
                                disabled={!replyText && !replyAttachments.length}
                                onClick={() => {
                                  setReplyText('');
                                  setReplyAttachments([]);
                                }}
                              >
                                Discard
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary ticket-send-button"
                                disabled={isSending || !replyText.trim()}
                                onClick={handleSendReply}
                              >
                                <Send size={14} />{isSending ? 'Sending...' : isPrivateNote ? 'Add note' : 'Send reply'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* FRESHDESK PROPERTIES & CUSTOMER 360° DRAWER (Right 280px) */}
                      {showPropertiesDrawer && (
                        <>
                        <button type="button" className="ticket-properties-backdrop" aria-label="Close ticket details" tabIndex={-1} onClick={() => setShowPropertiesDrawer(false)} />
                        <aside ref={propertiesRef} id="ticket-properties" className="ticket-properties" aria-label="Ticket details">
                          <div className="ticket-properties-heading"><strong>Ticket details</strong><button type="button" className="workspace-icon-button" aria-label="Close ticket details" onClick={() => setShowPropertiesDrawer(false)}><X size={16} /></button></div>
                          {/* Customer 360° Profile */}
                          <div className="enterprise-card p-3 mb-3 bg-white shadow-xs">
                            <span className="fw-bold text-dark small d-block mb-3">Customer</span>
                            <div className="d-flex align-items-center gap-2 mb-2">
                              <div
                                className="rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center flex-shrink-0"
                                style={{ width: '36px', height: '36px' }}
                              >
                                {selectedTicket.contact?.firstName?.charAt(0) || 'C'}
                              </div>
                              <div className="overflow-hidden">
                                <div className="fw-bold text-dark text-truncate">{selectedTicket.contact?.firstName} {selectedTicket.contact?.lastName}</div>
                                <span className="text-muted d-block text-truncate" style={{ fontSize: '0.74rem' }} title={selectedTicket.contact?.email}>
                                  {selectedTicket.contact?.email}
                                </span>
                              </div>
                            </div>
                            <div className="ticket-customer-meta">
                              <span>Channel <strong>{formatLabel(selectedTicket.channel)}</strong></span>
                              {selectedTicket.contact?.phone && <span>Phone <strong>{selectedTicket.contact.phone}</strong></span>}
                              {selectedTicket.sourceMailbox?.forwardingAddress && <span>Support inbox <strong>{selectedTicket.sourceMailbox.forwardingAddress}</strong></span>}
                            </div>
                          </div>

                          {/* Ticket Properties */}
                          <div className="enterprise-card p-3 mb-3 bg-white shadow-xs">
                            <span className="fw-bold text-dark small d-block mb-3">Properties</span>
                            <div className="ticket-property-list d-flex flex-column gap-2 text-secondary small">
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
                                  {formatLabel(selectedTicket.status)}
                                </span>
                              </div>
                              <div className="d-flex justify-content-between">
                                <span>Priority:</span>
                                <span className={`badge-status badge-${selectedTicket.priority.toLowerCase()}`}>
                                  {formatLabel(selectedTicket.priority)}
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

                          <div className="enterprise-card p-3 mb-3 bg-white">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="fw-bold text-dark small">Session timer</span>
                              <span className="font-monospace text-primary fw-bolder" style={{ fontSize: '1rem' }}>{formatTimer(timerSeconds)}</span>
                            </div>
                            <div className="d-flex align-items-center gap-1.5">
                              <button type="button" className={`btn btn-sm ${timerRunning ? 'btn-outline-warning' : 'btn-outline-secondary'} w-100 d-flex align-items-center justify-content-center gap-1`} onClick={() => setTimerRunning(!timerRunning)}>
                                {timerRunning ? <Pause size={13} /> : <Play size={13} />}<span>{timerRunning ? 'Pause' : 'Start timer'}</span>
                              </button>
                              <button type="button" className="btn btn-sm btn-outline-secondary p-1.5" onClick={() => { setTimerRunning(false); setTimerSeconds(0); }} title="Reset timer" aria-label="Reset timer"><RotateCcw size={13} /></button>
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
                        </aside>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="workspace-empty-state ticket-detail-empty">
                    <span className="workspace-empty-icon"><MessageSquare size={30} /></span>
                    <h2>A space for better conversations</h2>
                    <p>Select a ticket to read the conversation and help your customer.</p>
                  </div>
                )}
              </section>
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
              TAB: CUSTOMERS & CLIENT ORGANIZATIONS (Screens 20 & 21)
              ============================================================== */}
          {activeTab === 'customers' && (
            <div className="animate-fade-in">
              {/* Header banner */}
              <div className="enterprise-card workspace-section-banner p-4 mb-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-3 rounded-4 bg-primary text-white shadow-sm">
                      <Users size={26} />
                    </div>
                    <div>
                      <h4 className="fw-bolder mb-1 text-dark">
                        Customer directory
                      </h4>
                      <p className="text-secondary small mb-0">
                        Manage contacts, organizations, and conversation history.
                      </p>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm px-3 py-2 fw-semibold d-flex align-items-center gap-1.5 shadow-sm rounded-3"
                      onClick={() => setShowNewCustomerModal(true)}
                    >
                      <UserPlus size={16} />
                      <span>Add customer</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Stat Counters */}
              <div className="row g-3 mb-4">
                <div className="col-12 col-sm-4">
                  <div className="stat-card p-3 rounded-4 bg-white border shadow-xs d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-primary-subtle text-primary">
                      <Users size={20} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">Total Customers</small>
                      <h4 className="fw-bolder mb-0 text-dark">{customers.length}</h4>
                    </div>
                  </div>
                </div>
                <div className="col-12 col-sm-4">
                  <div className="stat-card p-3 rounded-4 bg-white border shadow-xs d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-warning-subtle text-warning-emphasis">
                      <Inbox size={20} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">Active Customer Tickets</small>
                      <h4 className="fw-bolder mb-0 text-dark">
                        {customers.reduce((acc, c) => acc + (c.openTickets || 0), 0)}
                      </h4>
                    </div>
                  </div>
                </div>
                <div className="col-12 col-sm-4">
                  <div className="stat-card p-3 rounded-4 bg-white border shadow-xs d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-success-subtle text-success">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <small className="text-muted fw-semibold">Corporate Accounts</small>
                      <h4 className="fw-bolder mb-0 text-dark">
                        {new Set(customers.map(c => c.organization).filter(o => o && o !== 'Individual Customer')).size}
                      </h4>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="enterprise-card p-3 mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div className="position-relative" style={{ minWidth: '280px', maxWidth: '420px', flex: 1 }}>
                  <Search size={16} className="position-absolute text-muted" style={{ top: '10px', left: '12px' }} />
                  <input
                    type="text"
                    className="form-control form-control-sm rounded-pill ps-5"
                    placeholder="Search customer name, email, phone, or organization..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                  />
                </div>
                <div className="text-muted small">
                  Showing <strong>{filteredCustomers.length}</strong> registered contact(s)
                </div>
              </div>

              {/* Customers Directory Table */}
              <div className="enterprise-card p-0 overflow-hidden shadow-xs">
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="ps-4">Customer Name</th>
                        <th>Email & Contact</th>
                        <th>Organization</th>
                        <th>Total Inquiries</th>
                        <th>Open Status</th>
                        <th>Joined</th>
                        <th className="pe-4 text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-5 text-muted">
                            <Users size={36} className="text-muted mb-2 opacity-50" />
                            <p className="mb-0">No customer records matching search criteria.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredCustomers.map(cust => (
                          <tr key={cust.id} className="cursor-pointer">
                            <td className="ps-4">
                              <div className="d-flex align-items-center gap-2.5">
                                <div
                                  className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold"
                                  style={{ width: '34px', height: '34px', backgroundColor: '#3b82f6', fontSize: '0.85rem' }}
                                >
                                  {(cust.displayName || cust.firstName || 'C').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="fw-bold text-dark">{cust.displayName || `${cust.firstName} ${cust.lastName || ''}`}</div>
                                  <small className="text-muted" style={{ fontSize: '0.72rem' }}>ID #{cust.id} • Verified Contact</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div><code>{cust.email}</code></div>
                              {cust.phone && <small className="text-secondary">{cust.phone}</small>}
                            </td>
                            <td>
                              <span className={`badge px-2.5 py-1 ${cust.organization && cust.organization !== 'Individual Customer' ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-light text-secondary border'}`}>
                                {cust.organization || 'Individual Customer'}
                              </span>
                            </td>
                            <td>
                              <span className="badge bg-light text-dark border">
                                {cust.totalTickets || 0} tickets
                              </span>
                            </td>
                            <td>
                              {cust.openTickets > 0 ? (
                                <span className="badge bg-warning-subtle text-warning-emphasis">
                                  {cust.openTickets} open
                                </span>
                              ) : (
                                <span className="badge bg-success-subtle text-success">
                                  All Resolved
                                </span>
                              )}
                            </td>
                            <td className="text-muted small">
                              {cust.createdAt ? new Date(cust.createdAt).toLocaleDateString() : 'Active'}
                            </td>
                            <td className="pe-4 text-end">
                              <div className="d-flex justify-content-end gap-1.5">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary py-1 px-2.5 rounded-2"
                                  onClick={() => setSelectedCustomer(cust)}
                                  title="View Customer Details & History"
                                >
                                  View History →
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-light border py-1 px-2 rounded-2"
                                  onClick={() => {
                                    setNewRequesterEmail(cust.email);
                                    setNewRequesterName(cust.displayName || cust.firstName);
                                    setShowNewTicketModal(true);
                                  }}
                                  title="Create a ticket for this customer"
                                >
                                  + Ticket
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
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
              <div className="enterprise-card workspace-section-banner p-4 mb-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-3 rounded-4 bg-success text-white shadow-sm">
                      <BookOpen size={24} />
                    </div>
                    <div>
                      <h5 className="fw-bolder mb-1 text-dark">Shared knowledge</h5>
                      <p className="text-muted small mb-0">
                        Keep useful answers in one place and add them directly to customer replies.
                      </p>
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-success fw-bold d-flex align-items-center gap-1.5 px-3 py-2 rounded-3 shadow-sm"
                    onClick={() => setShowNewArticleModal(true)}
                  >
                    <Plus size={15} />
                    <span>New article</span>
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
                            {art.viewCount} views
                          </span>
                        </div>
                        <h6 className="fw-bold text-dark mb-2" style={{ fontSize: '0.94rem' }}>
                          {art.title}
                        </h6>
                        <div
                          className="text-muted small mb-3 text-truncate-3"
                          style={{ fontSize: '0.8rem', lineHeight: '1.45' }}
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(art.contentHtml) }}
                        />
                      </div>
                      <div className="pt-2 border-top d-flex justify-content-between align-items-center">
                        <small className="text-success fw-semibold">{art.helpfulVotes} helpful votes</small>
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
              <div className="enterprise-card workspace-section-banner p-4 mb-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-3 rounded-4 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                      <Zap size={24} />
                    </div>
                    <div>
                      <h5 className="fw-bolder mb-1 text-dark">Ready-to-use workflows</h5>
                      <p className="text-muted small mb-0">
                        Apply consistent status updates and customer responses with a single action.
                      </p>
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-primary fw-bold d-flex align-items-center gap-1.5 px-3 py-2 rounded-3 shadow-sm"
                    disabled
                    title="Custom macro creation is not available yet"
                  >
                    <Plus size={15} />
                    <span>New macro</span>
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
                        Apply to selected ticket
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
                className="enterprise-card workspace-section-banner p-4 mb-4"
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
                          Connect a support inbox
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
              <div className="enterprise-card workspace-section-banner p-4 mb-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-3 rounded-4 bg-primary text-white shadow-sm">
                      <CreditCard size={28} />
                    </div>
                    <div>
                      <h4 className="fw-bolder mb-1 text-dark">
                        Workspace subscription
                      </h4>
                      <p className="text-secondary small mb-0">
                        Manage agent seat allocations, monthly ticket limits, and payment methods
                      </p>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-success-subtle text-success fs-6 px-3 py-2 border border-success-subtle rounded-pill">
                      {formatLabel(currentSubscription?.status || activeCompany.status)}
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

          {/* ==============================================================
              SECTION E: ADMIN SETTINGS CONSOLE
              ============================================================== */}
          {/* ==============================================================
              SECTION E: ADMIN SETTINGS CONSOLE (SCREENS 25 TO 39)
              ============================================================== */}
          {activeTab === 'settings' && (
            <AdminSettingsConsole
              activeCompany={activeCompany}
              currentUser={currentUser}
              onRefreshCompany={() => onSwitchCompany(activeCompany)}
              onShowToast={showNotification}
            />
          )}

        </main>
      </div>

      {/* ==============================================================
          MODAL 1: NEW TICKET CREATION
          ============================================================== */}
      {showNewTicketModal && (
        <dialog ref={newTicketDialogRef} className="workspace-ticket-dialog" aria-labelledby="new-ticket-title" onCancel={() => setShowNewTicketModal(false)} onClick={e => { if (e.target === e.currentTarget) setShowNewTicketModal(false); }}>
          <div className="modal-dialog">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header bg-white border-bottom py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <div className="p-2 rounded-3 bg-primary-subtle text-primary">
                    <Plus size={20} />
                  </div>
                  <div>
                    <h2 id="new-ticket-title" className="modal-title fw-bold mb-1">New ticket</h2>
                    <small className="text-muted">Start a conversation on behalf of a customer.</small>
                  </div>
                </div>
                <button type="button" className="btn-close" aria-label="Close new ticket" onClick={() => setShowNewTicketModal(false)}></button>
              </div>
              <form onSubmit={handleCreateTicket}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label htmlFor="new-ticket-subject" className="form-label fw-semibold small">Subject *</label>
                    <input
                      id="new-ticket-subject"
                      type="text"
                      autoFocus
                      className="form-control"
                      required
                      placeholder="A short summary of the request"
                      value={newSubject}
                      onChange={e => setNewSubject(e.target.value)}
                    />
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col-12 col-sm-6">
                      <label htmlFor="new-ticket-requester" className="form-label fw-semibold small">Customer name *</label>
                      <input
                        id="new-ticket-requester"
                        type="text"
                        className="form-control"
                        required
                        placeholder="Full name"
                        value={newRequesterName}
                        onChange={e => setNewRequesterName(e.target.value)}
                      />
                    </div>
                    <div className="col-12 col-sm-6">
                      <label htmlFor="new-ticket-email" className="form-label fw-semibold small">Customer email *</label>
                      <input
                        id="new-ticket-email"
                        type="email"
                        className="form-control"
                        required
                        placeholder="name@company.com"
                        value={newRequesterEmail}
                        onChange={e => setNewRequesterEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col-12 col-sm-6">
                      <label htmlFor="new-ticket-department" className="form-label fw-semibold small">Department</label>
                      <select
                        id="new-ticket-department"
                        className="form-select"
                        value={newDeptId}
                        onChange={e => setNewDeptId(Number(e.target.value))}
                      >
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12 col-sm-6">
                      <label htmlFor="new-ticket-priority" className="form-label fw-semibold small">Priority</label>
                      <select
                        id="new-ticket-priority"
                        className="form-select"
                        value={newPriority}
                        onChange={e => setNewPriority(e.target.value as any)}
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label htmlFor="new-ticket-description" className="form-label fw-semibold small">Description *</label>
                    <textarea
                      id="new-ticket-description"
                      className="form-control"
                      rows={3}
                      required
                      placeholder="Describe the issue and how we can help..."
                      value={newDesc}
                      onChange={e => setNewDesc(e.target.value)}
                    />
                  </div>

                  {/* Attach Documents & Files (PNG, PDF, JPG, JPEG, TXT) */}
                  <div className="mb-2">
                    <div className="form-label fw-semibold small d-flex align-items-center justify-content-between mb-1.5">
                      <span className="d-flex align-items-center gap-1.5">
                        <Paperclip size={14} className="text-primary" />
                        <span>Attachments</span>
                      </span>
                      <span className="text-muted fw-normal" style={{ fontSize: '0.72rem' }}>
                        Optional
                      </span>
                    </div>

                    <label
                      className="workspace-upload-area"
                      htmlFor="new-ticket-file-input"
                    >
                      <Paperclip size={20} className="text-primary mb-1 inline" />
                      <div className="small fw-semibold text-dark">
                        Browse files
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        Add images, documents, or spreadsheets for context.
                      </div>
                      <input
                        id="new-ticket-file-input"
                        type="file"
                        multiple
                        accept=".png,.jpg,.jpeg,.pdf,.txt,.doc,.docx,.xls,.xlsx,.csv"
                        className="visually-hidden"
                        aria-label="Ticket attachments"
                        onChange={(e) => {
                          if (e.target.files) {
                            setNewTicketAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                          }
                        }}
                      />
                    </label>

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
                  <button type="button" className="btn btn-light btn-sm px-3" onClick={() => setShowNewTicketModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm px-4 fw-semibold">Create ticket</button>
                </div>
              </form>
            </div>
          </div>
        </dialog>
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
      {/* SCREEN 23: NEW SOLUTION ARTICLE MODAL */}
      {showNewArticleModal && (
        <div className="modal show d-block modal-backdrop-blur" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content rounded-4 border-0 shadow-2xl">
              <div className="modal-header bg-success text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <BookOpen size={20} />
                  <h5 className="modal-title fw-bold mb-0">New knowledge base article</h5>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowNewArticleModal(false)} />
              </div>
              <form onSubmit={handleCreateArticle}>
                <div className="modal-body p-4">
                  <div className="row g-3 mb-3">
                    <div className="col-md-8">
                      <label className="form-label small fw-bold text-dark">Article Title *</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. Troubleshooting Vehicle RC Verification Delays"
                        value={newArtTitle}
                        onChange={e => setNewArtTitle(e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-bold text-dark">Category *</label>
                      <select
                        className="form-select"
                        value={newArtCatId}
                        onChange={e => setNewArtCatId(Number(e.target.value))}
                      >
                        {kbCategories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-dark">Article Content (HTML / Markdown) *</label>
                    <textarea
                      className="form-control font-monospace"
                      rows={8}
                      required
                      placeholder="<p>Provide step-by-step guidance, API payloads, or escalation procedures...</p>"
                      value={newArtContent}
                      onChange={e => setNewArtContent(e.target.value)}
                    />
                  </div>

                  <div className="mb-2">
                    <label className="form-label small fw-bold text-dark">Publication Status</label>
                    <div className="d-flex gap-3">
                      <label className="form-check-label d-flex align-items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="artStatus"
                          className="form-check-input"
                          checked={newArtStatus === 'PUBLISHED'}
                          onChange={() => setNewArtStatus('PUBLISHED')}
                        />
                        <span>Published (Live in Portal & Agent Composer)</span>
                      </label>
                      <label className="form-check-label d-flex align-items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="artStatus"
                          className="form-check-input"
                          checked={newArtStatus === 'DRAFT'}
                          onChange={() => setNewArtStatus('DRAFT')}
                        />
                        <span>Draft (Internal review only)</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="modal-footer bg-light px-4 py-3">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewArticleModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-success btn-sm px-4 fw-bold">Publish Solution Article</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 20: NEW CUSTOMER CONTACT MODAL */}
      {showNewCustomerModal && (
        <div className="modal show d-block modal-backdrop-blur" style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content rounded-4 border-0 shadow-2xl">
              <div className="modal-header bg-primary text-white py-3 px-4">
                <div className="d-flex align-items-center gap-2">
                  <UserPlus size={20} />
                  <h5 className="modal-title fw-bold mb-0">Add customer</h5>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowNewCustomerModal(false)} />
              </div>
              <form onSubmit={handleCreateCustomer}>
                <div className="modal-body p-4">
                  <div className="row g-2 mb-3">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-dark">First Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={newCustFirst}
                        onChange={e => setNewCustFirst(e.target.value)}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-dark">Last Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newCustLast}
                        onChange={e => setNewCustLast(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-dark">Customer Email Address *</label>
                    <input
                      type="email"
                      className="form-control"
                      required
                      placeholder="customer@domain.com"
                      value={newCustEmail}
                      onChange={e => setNewCustEmail(e.target.value)}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-dark">Phone Number</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="+91 98401 23456"
                      value={newCustPhone}
                      onChange={e => setNewCustPhone(e.target.value)}
                    />
                  </div>

                  <div className="mb-2">
                    <label className="form-label small fw-bold text-dark">Organization / Dealership</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Sri Vari Auto Dealership Ltd"
                      value={newCustOrg}
                      onChange={e => setNewCustOrg(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer bg-light px-4 py-3">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewCustomerModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm px-4 fw-bold">Save Customer Contact</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMER DETAIL DRAWER (Screen 20 & 21) */}
      {selectedCustomer && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', zIndex: 1060 }}
          onClick={() => setSelectedCustomer(null)}
        >
          <div
            className="modal-dialog modal-dialog-end h-100 my-0 ms-auto"
            style={{ maxWidth: '480px' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-content h-100 border-0 rounded-0 shadow-2xl overflow-auto">
              <div className="modal-header bg-dark text-white p-4">
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold fs-5"
                    style={{ width: '48px', height: '48px', backgroundColor: '#3b82f6' }}
                  >
                    {(selectedCustomer.displayName || selectedCustomer.firstName || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h5 className="modal-title fw-bold mb-0">{selectedCustomer.displayName || `${selectedCustomer.firstName} ${selectedCustomer.lastName || ''}`}</h5>
                    <small className="text-secondary">{selectedCustomer.email}</small>
                  </div>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => setSelectedCustomer(null)} />
              </div>

              <div className="modal-body p-4">
                <div className="mb-4">
                  <h6 className="fw-bold text-dark mb-2">Customer Profile & Organization</h6>
                  <div className="p-3 bg-light rounded-3 text-secondary small border">
                    <div className="mb-1"><strong>Phone:</strong> {selectedCustomer.phone || 'Not registered'}</div>
                    <div className="mb-1"><strong>Organization:</strong> {selectedCustomer.organization || 'Individual Customer'}</div>
                    <div className="mb-1"><strong>Total Tickets:</strong> {selectedCustomer.totalTickets || 0}</div>
                    <div><strong>Open Tickets:</strong> {selectedCustomer.openTickets || 0}</div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="fw-bold text-dark mb-0">Ticket History in {activeCompany.name}</h6>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary py-0.5 px-2"
                      onClick={() => {
                        setNewRequesterEmail(selectedCustomer.email);
                        setNewRequesterName(selectedCustomer.displayName || selectedCustomer.firstName);
                        setSelectedCustomer(null);
                        setShowNewTicketModal(true);
                      }}
                    >
                      + Raise Ticket
                    </button>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    {tickets.filter(t => t.contact?.email === selectedCustomer.email).length === 0 ? (
                      <p className="text-muted small mb-0">No tickets currently linked to this email address.</p>
                    ) : (
                      tickets.filter(t => t.contact?.email === selectedCustomer.email).map(tk => (
                        <div
                          key={tk.id}
                          className="p-3 rounded-3 border bg-white cursor-pointer hover-shadow transition-all"
                          onClick={() => {
                            setSelectedCustomer(null);
                            setActiveTab('tickets');
                            loadTicketDetail(tk.id);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="fw-bold text-primary font-monospace small">#{tk.ticketNumber}</span>
                            <span className={`badge ${tk.status === 'OPEN' ? 'bg-primary' : tk.status === 'RESOLVED' ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: '0.65rem' }}>
                              {tk.status}
                            </span>
                          </div>
                          <div className="fw-semibold text-dark small text-truncate">{tk.subject}</div>
                          <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                            Created {tk.createdAt ? new Date(tk.createdAt).toLocaleDateString() : 'Today'}
                          </small>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer bg-light p-3">
                <button type="button" className="btn btn-secondary btn-sm w-100" onClick={() => setSelectedCustomer(null)}>Close Drawer</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
