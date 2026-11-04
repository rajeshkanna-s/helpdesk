import axios from 'axios';
import type { TicketAttachment, 
  Company, DashboardStats, Ticket, TicketThread, CompanyMailbox, Department, User,
  LoginResponse, AdminOverview, CompanyDetail, CompanyCreateInput, UserCredentialInput,
  MisTrackItem, MisSummary, DepartmentDetail, DepartmentCreateInput,
  SupportEngineer, SupportEngineerCreateInput, KbArticle, CompanySubscription, CannedResponse,
  Verify2FaRequest, ForgotPasswordRequest, ResetPasswordRequest, InvitationValidationResponse, AcceptInvitationRequest, AgentInvitation,
  CustomerContact, NotificationItem } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');

let currentCompanyId = 1;
type SessionKind = 'STAFF' | 'CUSTOMER';
const csrfTokens: Record<SessionKind, string | null> = { STAFF: null, CUSTOMER: null };
const refreshRequests: Partial<Record<SessionKind, Promise<LoginResponse | CustomerSession>>> = {};
let staffBootstrap: Promise<LoginResponse> | null = null;
type CustomerSession = { browserSession: boolean; email: string; name?: string; companyId: number; csrfToken: string };
const customerBootstraps = new Map<string, Promise<CustomerSession>>();
const isApiUrl = (url: string) => url === API_BASE || url.startsWith(`${API_BASE}/`);
export interface PageResult<T> { content: T[]; number: number; size: number; totalElements: number; totalPages: number; }
export interface TicketQueryFilters {
  q?: string; priority?: string; departmentId?: number; agentId?: number; unassigned?: boolean;
  customerEmail?: string; contactId?: number; channel?: string; slaStatus?: string; from?: string; to?: string;
}
export interface CustomerProfile {
  firstName: string; lastName: string; email: string; phone: string; organizationName: string; timeZone: string; language: string;
  notifications: { replies: boolean; resolved: boolean; surveys: boolean };
}
export interface PublicPlan {
  code: string; displayName: string; description: string; baseTier: string; status: string; currency: 'INR'; gstExclusive: boolean;
  monthlyPrice: number; yearlyPrice: number; includedAgents: number; ticketLimitMonthly: number; trialDays: number; storageBytes: number;
  features: Record<string, boolean>; revision: number;
}

// Old bearer credentials are deliberately discarded, never migrated into JavaScript sessions.
try {
  for (const key of ['kuwy_auth_token', 'kuwy_user', 'kuwy_cust_token', 'kuwy_cust_email', 'kuwy_cust_name']) localStorage.removeItem(key);
} catch { /* Cookie authentication also works when browser storage is unavailable. */ }

function rememberBrowserSession(data: { browserSession?: boolean; csrfToken?: string }, kind: SessionKind) {
  if (!data.browserSession || !data.csrfToken) throw new Error('A secure browser session could not be established. Please sign in again.');
  csrfTokens[kind] = data.csrfToken;
}

function refreshBrowserSession(kind: SessionKind, url: string) {
  if (!refreshRequests[kind]) {
    const refresh = async () => {
      const response = await axios.post(url, {});
      rememberBrowserSession(response.data, kind);
      return response.data as LoginResponse | CustomerSession;
    };
    // Serialize rotation across tabs as well as requests so a parallel tab does not replay the previous cookie.
    const request = navigator.locks ? navigator.locks.request(`kuwy-session-refresh:${kind}`, refresh) : refresh();
    refreshRequests[kind] = request.catch(error => {
      csrfTokens[kind] = null;
      window.dispatchEvent(new CustomEvent('kuwy-session-expired', { detail: kind }));
      throw error;
    }).finally(() => { delete refreshRequests[kind]; });
  }
  return refreshRequests[kind]!;
}

const requestInterceptor = axios.interceptors.request.use(config => {
  if (config.url && isApiUrl(config.url)) {
    config.withCredentials = true;
    config.headers.set('X-Browser-Session', '1');
    const kind: SessionKind = config.url.startsWith(`${API_BASE}/portal/`) ? 'CUSTOMER' : 'STAFF';
    if (csrfTokens[kind]) config.headers.set('X-Session-CSRF', csrfTokens[kind]);
  }
  return config;
});

const responseInterceptor = axios.interceptors.response.use(response => response, async error => {
  const config = error.config;
  const url = typeof config?.url === 'string' ? config.url : '';
  const route = url.slice(API_BASE.length).split('?')[0];
  const publicAuthRoute = /^\/auth\/(?:login|verify-2fa|forgot-password|reset-password|validate-reset-token|lookup-workspace|session|refresh|logout)$/.test(route)
    || /^\/invitations\/(?:accept|validate)$/.test(route) || route.startsWith('/onboarding/');
  if (error.response?.status !== 401 || !config || !isApiUrl(url) || config.sessionRetried
    || publicAuthRoute || /\/(?:session|refresh|logout|request-otp|verify-otp|demo-login)(?:\?|$)/.test(url)) throw error;
  const kind: SessionKind = url.startsWith(`${API_BASE}/portal/`) ? 'CUSTOMER' : 'STAFF';
  if (!csrfTokens[kind]) throw error;
  config.sessionRetried = true;
  const portal = kind === 'CUSTOMER' ? url.slice(`${API_BASE}/portal/`.length).split('/')[0] : '';
  const refreshUrl = kind === 'CUSTOMER' ? `${API_BASE}/portal/${portal}/refresh` : `${API_BASE}/auth/refresh`;
  await refreshBrowserSession(kind, refreshUrl);
  return axios(config);
});
if (import.meta.hot) import.meta.hot.dispose(() => {
  axios.interceptors.request.eject(requestInterceptor);
  axios.interceptors.response.eject(responseInterceptor);
});

export const setApiTenantId = (companyId: number) => {
  currentCompanyId = companyId;
};

export const clearStaffSession = () => { csrfTokens.STAFF = null; };
export const clearCustomerSession = () => { csrfTokens.CUSTOMER = null; };

const getHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Company-ID': String(currentCompanyId),
  };
  return headers;
};

const getCustomerHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  return headers;
};

export const apiService = {
  // Auth
  async login(credentials: { email: string; password: string; companyCode?: string }): Promise<LoginResponse> {
    const res = await axios.post(`${API_BASE}/auth/login`, credentials);
    if (!res.data?.twoFactorRequired) rememberBrowserSession(res.data, 'STAFF');
    return res.data;
  },

  async getStaffSession(): Promise<LoginResponse> {
    if (!staffBootstrap) {
      staffBootstrap = axios.get(`${API_BASE}/auth/session`).then(async response => {
        rememberBrowserSession(response.data, 'STAFF');
        return await refreshBrowserSession('STAFF', `${API_BASE}/auth/refresh`) as LoginResponse;
      }).catch(error => { clearStaffSession(); throw error; }).finally(() => { staffBootstrap = null; });
    }
    return staffBootstrap;
  },

  async logoutStaff(): Promise<void> {
    await axios.post(`${API_BASE}/auth/logout`, {});
    clearStaffSession();
  },

  async getStaffAccount(): Promise<{ email: string; displayName: string; twoFactorEnabled: boolean; twoFactorRequired: boolean; sessionId: string }> {
    return (await axios.get(`${API_BASE}/auth/account`)).data;
  },

  async getCompanyRoles(companyId: number): Promise<Array<{ id: number; name: string; roleType: string }>> {
    return (await axios.get(`${API_BASE}/companies/${companyId}/roles`, { headers: getHeaders() })).data;
  },

  async getStaffSessions(): Promise<Array<{ sessionId: string; current: boolean; deviceLabel: string; remoteAddr: string; createdAt: string; lastSeenAt: string; absoluteExpiresAt: string; idleExpiresAt: string }>> {
    return (await axios.get(`${API_BASE}/auth/sessions`)).data;
  },

  async revokeStaffSession(id: string): Promise<void> {
    await axios.delete(`${API_BASE}/auth/sessions/${encodeURIComponent(id)}`);
  },

  async logoutAllStaffSessions(): Promise<void> {
    await axios.post(`${API_BASE}/auth/logout-all`, {});
    clearStaffSession();
  },

  async changeOwnPassword(currentPassword: string, newPassword: string, code?: string): Promise<void> {
    await axios.post(`${API_BASE}/auth/change-password`, { currentPassword, newPassword, code });
    clearStaffSession();
  },

  async getCustomerSession(subdomain: string): Promise<CustomerSession> {
    if (!customerBootstraps.has(subdomain)) {
      const promise = axios.get(`${API_BASE}/portal/${encodeURIComponent(subdomain)}/session`).then(async response => {
        rememberBrowserSession(response.data, 'CUSTOMER');
        return await refreshBrowserSession('CUSTOMER', `${API_BASE}/portal/${encodeURIComponent(subdomain)}/refresh`) as CustomerSession;
      }).catch(error => { clearCustomerSession(); throw error; }).finally(() => { customerBootstraps.delete(subdomain); });
      customerBootstraps.set(subdomain, promise);
    }
    return customerBootstraps.get(subdomain)!;
  },

  async logoutCustomer(subdomain: string): Promise<void> {
    await axios.post(`${API_BASE}/portal/${encodeURIComponent(subdomain)}/logout`, {});
    clearCustomerSession();
  },

  async getCustomerProfile(subdomain: string): Promise<CustomerProfile> {
    return (await axios.get(`${API_BASE}/portal/${encodeURIComponent(subdomain)}/profile`)).data;
  },

  async updateCustomerProfile(subdomain: string, profile: Omit<CustomerProfile, 'email'>): Promise<CustomerProfile> {
    return (await axios.patch(`${API_BASE}/portal/${encodeURIComponent(subdomain)}/profile`, profile)).data;
  },

  // Admin APIs (Project Owner)
  async getAdminOverview(): Promise<AdminOverview> {
    const res = await axios.get(`${API_BASE}/admin/overview`, { headers: getHeaders() });
    return res.data;
  },

  async getAdminCompanies(): Promise<CompanyDetail[]> {
    const res = await axios.get(`${API_BASE}/admin/companies`, { headers: getHeaders() });
    return res.data;
  },

  async createAdminCompany(data: CompanyCreateInput): Promise<Company> {
    const res = await axios.post(`${API_BASE}/admin/companies`, data, { headers: getHeaders() });
    return res.data;
  },

  async updateCompanyStatus(companyId: number, status: string): Promise<Company> {
    const res = await axios.patch(`${API_BASE}/admin/companies/${companyId}/status?status=${status}`, {}, { headers: getHeaders() });
    return res.data;
  },

  async updateCompanyLimits(companyId: number, planName?: string, maxAgents?: number): Promise<Company> {
    const params = new URLSearchParams();
    if (planName) params.append('planName', planName);
    if (maxAgents) params.append('maxAgents', String(maxAgents));
    const res = await axios.patch(`${API_BASE}/admin/companies/${companyId}/limits?${params.toString()}`, {}, { headers: getHeaders() });
    return res.data;
  },

  async getAdminUsers(): Promise<User[]> {
    const res = await axios.get(`${API_BASE}/admin/users`, { headers: getHeaders() });
    return res.data;
  },

  async createUserCredential(data: UserCredentialInput): Promise<User> {
    const res = await axios.post(`${API_BASE}/admin/users`, data, { headers: getHeaders() });
    return res.data;
  },

  async toggleUserActive(userId: number): Promise<User> {
    const res = await axios.patch(`${API_BASE}/admin/users/${userId}/toggle-active`, {}, { headers: getHeaders() });
    return res.data;
  },

  async resetUserPassword(userId: number, newPassword: string): Promise<void> {
    await axios.post(`${API_BASE}/admin/users/${userId}/reset-password`, { newPassword }, { headers: getHeaders() });
  },
  // Companies
  async getCompanies(): Promise<Company[]> {
    const res = await axios.get(`${API_BASE}/companies`);
    return res.data;
  },

  // Dashboard Stats
  async getDashboardStats(companyId: number): Promise<DashboardStats> {
    const res = await axios.get(`${API_BASE}/dashboard/stats?companyId=${companyId}`, { headers: getHeaders() });
    return res.data;
  },

  // Tickets
  async getTickets(companyId: number, status?: string): Promise<Ticket[]> {
    return (await apiService.getTicketPage(companyId, status)).content;
  },

  async getTicketPage(companyId: number, status?: string, page = 0, size = 25, order: 'asc' | 'desc' = 'desc', filters: TicketQueryFilters = {}, sortBy: 'createdAt' | 'updatedAt' | 'priority' = 'createdAt'): Promise<PageResult<Ticket>> {
    const res = await axios.get(`${API_BASE}/tickets`, {
      headers: getHeaders(),
      params: { ...filters, companyId, status: status && status !== 'ALL' ? status : undefined, page, size, sortBy, order },
    });
    return res.data;
  },

  // Ticket Detail + Threads
  async getTicketDetail(id: number): Promise<Ticket> {
    const [ticketRes, threadsRes] = await Promise.all([
      axios.get(`${API_BASE}/tickets/${id}`, { headers: getHeaders() }),
      axios.get(`${API_BASE}/tickets/${id}/threads`, { headers: getHeaders() }),
    ]);
    return { ...ticketRes.data, threads: threadsRes.data };
  },

  // Create Ticket
  async createTicket(ticketData: any): Promise<Ticket> {
    const res = await axios.post(`${API_BASE}/tickets`, ticketData, { headers: getHeaders() });
    return res.data;
  },

  // Add Reply or Private Note
  async addReply(ticketId: number, replyData: { body: string; isPrivate: boolean; senderName: string; senderEmail: string }): Promise<TicketThread> {
    const res = await axios.post(`${API_BASE}/tickets/${ticketId}/replies`, replyData, { headers: getHeaders() });
    return res.data;
  },

  // Attachments Upload & Retrieval
  async uploadTicketAttachments(ticketId: number, files: File[], threadId?: number): Promise<TicketAttachment[]> {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    let url = `${API_BASE}/tickets/${ticketId}/attachments`;
    if (threadId) url += `?threadId=${threadId}`;
    const headers = {
      ...getHeaders(),
      'Content-Type': 'multipart/form-data',
    };
    const res = await axios.post(url, formData, { headers });
    return res.data;
  },

  async getTicketAttachments(ticketId: number): Promise<TicketAttachment[]> {
    const res = await axios.get(`${API_BASE}/tickets/${ticketId}/attachments`, { headers: getHeaders() });
    return res.data;
  },

  async deleteAttachment(attachmentId: number): Promise<void> {
    await axios.delete(`${API_BASE}/attachments/${attachmentId}`, { headers: getHeaders() });
  },

  getAttachmentDownloadUrl(attachmentId: number): string {
    return `${API_BASE}/attachments/${attachmentId}/download`;
  },

  getAttachmentPreviewUrl(attachmentId: number): string {
    return `${API_BASE}/attachments/${attachmentId}/preview`;
  },

  // Update Status
  async updateStatus(ticketId: number, status: string): Promise<Ticket> {
    const res = await axios.patch(`${API_BASE}/tickets/${ticketId}/status?status=${status}`, {}, { headers: getHeaders() });
    return res.data;
  },

  // Mailboxes
  async getMailboxes(companyId: number): Promise<CompanyMailbox[]> {
    const res = await axios.get(`${API_BASE}/mailboxes?companyId=${companyId}`, { headers: getHeaders() });
    return res.data;
  },

  // Simulate Incoming MS 365 Email
  async simulateIncomingEmail(emailData: {
    recipientMailbox: string;
    senderEmail: string;
    senderName: string;
    subject: string;
    bodyText: string;
    internetMessageId?: string;
    msConversationId?: string;
    inReplyTo?: string;
  }): Promise<Ticket> {
    const res = await axios.post(`${API_BASE}/mailboxes/simulate-incoming-mail`, emailData, { headers: getHeaders() });
    return res.data;
  },

  async verifyForwarding(mailboxId: number): Promise<CompanyMailbox> {
    const res = await axios.post(`${API_BASE}/mailboxes/${mailboxId}/verify-forwarding`, {}, { headers: getHeaders() });
    return res.data;
  },

  // Departments & Agents
  async getDepartments(companyId: number): Promise<Department[]> {
    const res = await axios.get(`${API_BASE}/companies/${companyId}/departments`, { headers: getHeaders() });
    return res.data;
  },

  async getAgents(companyId: number): Promise<User[]> {
    const res = await axios.get(`${API_BASE}/companies/${companyId}/agents`, { headers: getHeaders() });
    return res.data;
  },

  // MIS & Large-Scale Export APIs (Supports up to 100,000+ rows)
  async getMisSummary(companyId: number): Promise<MisSummary> {
    const res = await axios.get(`${API_BASE}/mis/summary?companyId=${companyId}`, { headers: getHeaders() });
    return res.data;
  },

  async getMisTracking(params: {
    companyId: number;
    departmentId?: number;
    status?: string;
    priority?: string;
    channel?: string;
    slaStatus?: string;
    search?: string;
    page?: number;
    size?: number;
  }): Promise<{ content: MisTrackItem[]; totalElements: number; totalPages: number }> {
    const q = new URLSearchParams();
    q.append('companyId', String(params.companyId));
    if (params.departmentId) q.append('departmentId', String(params.departmentId));
    if (params.status && params.status !== 'ALL') q.append('status', params.status);
    if (params.priority && params.priority !== 'ALL') q.append('priority', params.priority);
    if (params.channel && params.channel !== 'ALL') q.append('channel', params.channel);
    if (params.slaStatus && params.slaStatus !== 'ALL') q.append('slaStatus', params.slaStatus);
    if (params.search) q.append('search', params.search);
    q.append('page', String(params.page || 0));
    q.append('size', String(params.size || 20));

    const res = await axios.get(`${API_BASE}/mis/track?${q.toString()}`, { headers: getHeaders() });
    return res.data;
  },

  getMisExcelDownloadUrl(companyId: number, rows: number = 100000, departmentId?: number, status?: string): string {
    const q = new URLSearchParams();
    q.append('companyId', String(companyId));
    q.append('rows', String(rows));
    if (departmentId) q.append('departmentId', String(departmentId));
    if (status && status !== 'ALL') q.append('status', status);
    return `${API_BASE}/mis/export/excel?${q.toString()}`;
  },

  getMisCsvDownloadUrl(companyId: number, rows: number = 100000, departmentId?: number, status?: string): string {
    const q = new URLSearchParams();
    q.append('companyId', String(companyId));
    q.append('rows', String(rows));
    if (departmentId) q.append('departmentId', String(departmentId));
    if (status && status !== 'ALL') q.append('status', status);
    return `${API_BASE}/mis/export/csv?${q.toString()}`;
  },

  // Category & Department Management
  async getDepartmentsWithDetails(companyId: number): Promise<DepartmentDetail[]> {
    const res = await axios.get(`${API_BASE}/departments?companyId=${companyId}`, { headers: getHeaders() });
    return res.data;
  },

  async createDepartment(data: DepartmentCreateInput): Promise<Department> {
    const res = await axios.post(`${API_BASE}/departments`, data, { headers: getHeaders() });
    return res.data;
  },

  async toggleDepartment(departmentId: number): Promise<Department> {
    const res = await axios.patch(`${API_BASE}/departments/${departmentId}/toggle-active`, {}, { headers: getHeaders() });
    return res.data;
  },

  // Category-Wise Technical Support Engineers
  async getSupportEngineers(companyId: number): Promise<SupportEngineer[]> {
    const res = await axios.get(`${API_BASE}/departments/engineers?companyId=${companyId}`, { headers: getHeaders() });
    return res.data;
  },

  async createSupportEngineer(data: SupportEngineerCreateInput): Promise<SupportEngineer> {
    const res = await axios.post(`${API_BASE}/departments/engineers`, data, { headers: getHeaders() });
    return res.data;
  },

  async toggleSupportEngineer(userId: number): Promise<User> {
    const res = await axios.patch(`${API_BASE}/departments/engineers/${userId}/toggle-active`, {}, { headers: getHeaders() });
    return res.data;
  },

  // Update Priority
  async updatePriority(ticketId: number, priority: string): Promise<Ticket> {
    const res = await axios.patch(`${API_BASE}/tickets/${ticketId}/priority?priority=${priority}`, {}, { headers: getHeaders() });
    return res.data;
  },

  // Update Department
  async updateDepartment(ticketId: number, departmentId: number): Promise<Ticket> {
    const res = await axios.patch(`${API_BASE}/tickets/${ticketId}/department?departmentId=${departmentId}`, {}, { headers: getHeaders() });
    return res.data;
  },

  // Assign Agent
  async assignAgent(ticketId: number, agentId: number): Promise<Ticket> {
    const res = await axios.patch(`${API_BASE}/tickets/${ticketId}/assign?agentId=${agentId}`, {}, { headers: getHeaders() });
    return res.data;
  },

  // Bulk Update Tickets
  async bulkUpdateTickets(payload: { ticketIds: number[]; status?: string; priority?: string; agentId?: number; departmentId?: number }): Promise<void> {
    await axios.post(`${API_BASE}/tickets/bulk`, payload, { headers: getHeaders() });
  },

  // Execute Scenario Macro
  async executeScenario(ticketId: number, payload: { scenarioKey: string; customNote?: string; authorName?: string }): Promise<Ticket> {
    const res = await axios.post(`${API_BASE}/tickets/${ticketId}/execute-scenario`, payload, { headers: getHeaders() });
    return res.data;
  },

  // Knowledge Base Articles & Manager (Screen 23)
  async getKbArticles(companyId: number): Promise<KbArticle[]> {
    const res = await axios.get(`${API_BASE}/companies/${companyId}/kb-articles`, { headers: getHeaders() });
    return res.data;
  },

  async getKbCategories(companyId: number): Promise<any[]> {
    const res = await axios.get(`${API_BASE}/companies/${companyId}/kb-categories`, { headers: getHeaders() });
    return res.data;
  },

  async createKbArticle(companyId: number, data: { categoryId: number; title: string; contentHtml: string; status?: string }): Promise<KbArticle> {
    const res = await axios.post(`${API_BASE}/companies/${companyId}/kb-articles`, data, { headers: getHeaders() });
    return res.data;
  },

  // Customers & Organizations Directory (Screens 20 & 21)
  async getCustomers(companyId: number): Promise<CustomerContact[]> {
    const res = await axios.get(`${API_BASE}/companies/${companyId}/customers`, { headers: getHeaders() });
    return res.data;
  },

  async createCustomer(companyId: number, data: Partial<CustomerContact>): Promise<CustomerContact> {
    const res = await axios.post(`${API_BASE}/companies/${companyId}/customers`, data, { headers: getHeaders() });
    return res.data;
  },

  // Notification Center (Screen 24)
  async getNotifications(companyId: number, userId?: number): Promise<NotificationItem[]> {
    const url = userId
      ? `${API_BASE}/companies/${companyId}/notifications?userId=${userId}`
      : `${API_BASE}/companies/${companyId}/notifications`;
    const res = await axios.get(url, { headers: getHeaders() });
    return res.data;
  },

  async markNotificationRead(companyId: number, notifId: number): Promise<void> {
    await axios.post(`${API_BASE}/companies/${companyId}/notifications/${notifId}/read`, {}, { headers: getHeaders() });
  },

  async markAllNotificationsRead(companyId: number): Promise<void> {
    await axios.post(`${API_BASE}/companies/${companyId}/notifications/read-all`, {}, { headers: getHeaders() });
  },
  // -------------------------------------------------------------
  // SUBSCRIPTIONS & BILLING
  // -------------------------------------------------------------
  async getCurrentSubscription(companyId?: number): Promise<CompanySubscription> {
    const url = companyId ? `${API_BASE}/subscriptions/current?companyId=${companyId}` : `${API_BASE}/subscriptions/current`;
    const res = await axios.get(url, { headers: getHeaders() });
    return res.data;
  },

  async upgradeSubscription(planTier: string, gateway: string = 'RAZORPAY'): Promise<CompanySubscription> {
    const res = await axios.post(`${API_BASE}/subscriptions/checkout`, { planTier, gateway }, { headers: getHeaders() });
    return res.data;
  },

  // -------------------------------------------------------------
  // CANNED RESPONSES & MACROS
  // -------------------------------------------------------------
  async getCannedResponses(companyId?: number): Promise<CannedResponse[]> {
    const url = companyId ? `${API_BASE}/canned-responses?companyId=${companyId}` : `${API_BASE}/canned-responses`;
    const res = await axios.get(url, { headers: getHeaders() });
    return res.data;
  },

  async createCannedResponse(data: { title: string; shortcut: string; content: string; departmentId?: number }): Promise<CannedResponse> {
    const res = await axios.post(`${API_BASE}/canned-responses`, data, { headers: getHeaders() });
    return res.data;
  },

  async deleteCannedResponse(id: number): Promise<void> {
    await axios.delete(`${API_BASE}/canned-responses/${id}`, { headers: getHeaders() });
  },

  // -------------------------------------------------------------
  // PUBLIC CUSTOMER SUPPORT PORTAL
  // -------------------------------------------------------------
  async getPortalInfo(subdomain: string): Promise<any> {
    const res = await axios.get(`${API_BASE}/portal/${subdomain}`);
    return res.data;
  },

  async requestPortalOtp(subdomain: string, email: string): Promise<any> {
    const res = await axios.post(`${API_BASE}/portal/${subdomain}/request-otp`, { email });
    return res.data;
  },

  async verifyPortalOtp(subdomain: string, email: string, otp: string): Promise<any> {
    const res = await axios.post(`${API_BASE}/portal/${subdomain}/verify-otp`, { email, otp });
    rememberBrowserSession(res.data, 'CUSTOMER');
    return res.data;
  },

  async submitPortalTicket(subdomain: string, ticketData: any): Promise<Ticket> {
    const res = await axios.post(`${API_BASE}/portal/${subdomain}/tickets`, ticketData, { headers: getCustomerHeaders() });
    return res.data;
  },

  async getCustomerPortalTicketPage(subdomain: string, query: { page?: number; size?: number; q?: string; status?: string }): Promise<PageResult<Ticket>> {
    const res = await axios.get(`${API_BASE}/portal/${encodeURIComponent(subdomain)}/tickets`, { params: query, headers: getCustomerHeaders() });
    return res.data;
  },

  async uploadCustomerAttachments(subdomain: string, ticketNumber: string, files: File[], threadId?: number): Promise<TicketAttachment[]> {
    const body = new FormData();
    for (const file of files) body.append('files', file);
    if (threadId != null) body.append('threadId', String(threadId));
    const res = await axios.post(`${API_BASE}/portal/${encodeURIComponent(subdomain)}/tickets/${encodeURIComponent(ticketNumber)}/attachments`, body);
    return res.data;
  },

  async downloadCustomerAttachment(subdomain: string, id: number): Promise<Blob> {
    const res = await axios.get(`${API_BASE}/portal/${encodeURIComponent(subdomain)}/attachments/${id}/download`, { responseType: 'blob' });
    return res.data;
  },

  async getCustomerPortalTicketDetail(subdomain: string, ticketNumber: string, email: string): Promise<Ticket> {
    const res = await axios.get(`${API_BASE}/portal/${subdomain}/tickets/${encodeURIComponent(ticketNumber)}?email=${encodeURIComponent(email)}`, { headers: getCustomerHeaders() });
    return res.data;
  },

  async sendCustomerPortalReply(subdomain: string, ticketNumber: string, email: string, reply: string): Promise<Ticket> {
    const res = await axios.post(`${API_BASE}/portal/${subdomain}/tickets/${encodeURIComponent(ticketNumber)}/reply`, { email, reply }, { headers: getCustomerHeaders() });
    return res.data;
  },

  async reopenCustomerPortalTicket(subdomain: string, ticketNumber: string): Promise<Ticket> {
    const res = await axios.post(`${API_BASE}/portal/${subdomain}/tickets/${encodeURIComponent(ticketNumber)}/reopen`, {}, { headers: getCustomerHeaders() });
    return res.data;
  },

  // -------------------------------------------------------------
  // SELF-SERVE ONBOARDING
  // -------------------------------------------------------------
  async onboardCompany(data: {
    companyName: string;
    subdomain: string;
    adminEmail: string;
    adminPassword: string;
    adminName: string;
    planTier: string;
    challengeId: string;
    verificationCode: string;
    agreedToTerms: boolean;
  }): Promise<LoginResponse> {
    const res = await axios.post(`${API_BASE}/onboarding/signup`, data);
    rememberBrowserSession(res.data, 'STAFF');
    return res.data;
  },

  async getPublicPlans(): Promise<PublicPlan[]> {
    return (await axios.get(`${API_BASE}/plans`)).data;
  },

  async getSignupConfiguration(): Promise<{ signupEnabled: boolean; captchaSiteKey: string; googleEnabled: boolean; microsoftEnabled: boolean }> {
    return (await axios.get(`${API_BASE}/onboarding/config`)).data;
  },

  async checkWorkspaceAddress(slug: string): Promise<{ available: boolean; slug?: string; reason?: string }> {
    return (await axios.get(`${API_BASE}/onboarding/check-subdomain`, { params: { slug } })).data;
  },

  async sendSignupVerification(email: string, captchaToken: string): Promise<{ success: boolean; challengeId: string; expiresInSeconds: number; resendAfterSeconds: number }> {
    return (await axios.post(`${API_BASE}/onboarding/send-verification`, { email, captchaToken })).data;
  },

  // ==========================================
  // SECTION B: LOGIN, 2FA, RESET & INVITATIONS
  // ==========================================

  async verify2Fa(data: Verify2FaRequest): Promise<LoginResponse> {
    const res = await axios.post(`${API_BASE}/auth/verify-2fa`, data);
    rememberBrowserSession(res.data, 'STAFF');
    return res.data;
  },

  async forgotPassword(data: ForgotPasswordRequest): Promise<{ success: boolean; message: string }> {
    const res = await axios.post(`${API_BASE}/auth/forgot-password`, data);
    return res.data;
  },

  async validateResetToken(token: string): Promise<{ valid: boolean; status?: string; message?: string; email?: string }> {
    const res = await axios.post(`${API_BASE}/auth/validate-reset-token`, { token });
    return res.data;
  },

  async resetPassword(data: ResetPasswordRequest): Promise<{ success: boolean; message: string }> {
    const res = await axios.post(`${API_BASE}/auth/reset-password`, data);
    return res.data;
  },

  async lookupWorkspace(email: string): Promise<{ found: boolean; subdomain: string; companyName?: string; companyCode?: string }> {
    const res = await axios.get(`${API_BASE}/auth/lookup-workspace`, {
      params: { email }
    });
    return res.data;
  },

  async validateInvitation(token: string): Promise<InvitationValidationResponse> {
    const res = await axios.post(`${API_BASE}/invitations/validate`, { token });
    return res.data;
  },

  async acceptInvitation(data: AcceptInvitationRequest): Promise<LoginResponse> {
    const res = await axios.post(`${API_BASE}/invitations/accept`, data);
    if (!res.data?.twoFactorRequired && res.data?.browserSession) rememberBrowserSession(res.data, 'STAFF');
    return res.data;
  },

  async getPendingInvitations(companyId: number): Promise<AgentInvitation[]> {
    const res = await axios.get(`${API_BASE}/invitations`, {
      params: { companyId },
      headers: getHeaders()
    });
    return res.data;
  },

  async inviteAgent(data: { email: string; name: string; roleId?: number }, companyId: number): Promise<{ success: boolean; message: string }> {
    const res = await axios.post(`${API_BASE}/invitations/invite`, data, {
      params: { companyId },
      headers: getHeaders()
    });
    return res.data;
  },

  async resendInvitation(id: number): Promise<{ success: boolean; message: string }> {
    const res = await axios.post(`${API_BASE}/invitations/${id}/resend`, {}, {
      headers: getHeaders()
    });
    return res.data;
  },

  async revokeInvitation(id: number): Promise<{ success: boolean; message: string }> {
    const res = await axios.post(`${API_BASE}/invitations/${id}/revoke`, {}, {
      headers: getHeaders()
    });
    return res.data;
  },

  async setup2Fa(password: string, currentCode?: string): Promise<{ secret: string; otpAuthUrl: string; expiresAt: string }> {
    const res = await axios.post(`${API_BASE}/auth/2fa/setup`, { password, currentCode }, {
      headers: getHeaders()
    });
    return res.data;
  },

  async enable2Fa(code: string): Promise<{ success: boolean; message: string; backupCodes: string[]; signInRequired: boolean }> {
    const res = await axios.post(`${API_BASE}/auth/2fa/enable`, { code }, {
      headers: getHeaders()
    });
    return res.data;
  },

  async disable2Fa(password: string, code: string): Promise<{ success: boolean; message: string; signInRequired: boolean }> {
    const res = await axios.post(`${API_BASE}/auth/2fa/disable`, { password, code }, {
      headers: getHeaders()
    });
    return res.data;
  },


  // ==========================================
  // SECTION C: CUSTOMER PORTAL ENHANCEMENTS
  // ==========================================

  async getPublicKbArticles(subdomain: string, query?: string): Promise<KbArticle[]> {
    const res = await axios.get(`${API_BASE}/portal/${subdomain}/kb/articles`, {
      params: query ? { query } : undefined
    });
    return res.data;
  },

  async voteKbArticle(subdomain: string, articleId: number, helpful: boolean): Promise<{ success: boolean; message: string }> {
    const res = await axios.post(`${API_BASE}/portal/${subdomain}/kb/articles/${articleId}/vote`, {}, {
      params: { helpful }
    });
    return res.data;
  },

  async submitCsat(subdomain: string, ticketNumber: string, rating: number, comment?: string): Promise<{ success: boolean; message: string }> {
    const res = await axios.post(`${API_BASE}/portal/${subdomain}/tickets/${ticketNumber}/csat`, {
      rating,
      comment
    });
    return res.data;
  },

  async closeTicketByCustomer(subdomain: string, ticketNumber: string, email?: string): Promise<Ticket> {
    const res = await axios.post(`${API_BASE}/portal/${subdomain}/tickets/${ticketNumber}/close`, {}, {
      params: email ? { email } : undefined,
      headers: getCustomerHeaders()
    });
    return res.data;
  },

  async exportCustomerData(subdomain: string, email: string): Promise<any> {
    const res = await axios.get(`${API_BASE}/portal/${subdomain}/export-data`, {
      params: { email },
      headers: getCustomerHeaders()
    });
    return res.data;
  },


  // =========================================================================
  // SECTION E: ADMIN SETTINGS APIS (SCREENS 25 TO 39)
  // =========================================================================

  async getCompanySettings(companyId: number): Promise<any> {
    const res = await axios.get(`${API_BASE}/companies/${companyId}/settings`, { headers: getHeaders() });
    return res.data;
  },

  async updateCompanySettings(companyId: number, settings: any): Promise<any> {
    const res = await axios.put(`${API_BASE}/companies/${companyId}/settings`, settings, { headers: getHeaders() });
    return res.data;
  },

  async getAuditLogs(companyId: number): Promise<any[]> {
    const res = await axios.get(`${API_BASE}/companies/${companyId}/audit-logs`, { headers: getHeaders() });
    return res.data;
  },

  async saveMailbox(companyId: number, mailbox: any): Promise<any> {
    const res = await axios.post(`${API_BASE}/companies/${companyId}/mailboxes`, mailbox, { headers: getHeaders() });
    return res.data;
  },

  async deleteMailbox(companyId: number, mailboxId: number): Promise<void> {
    await axios.delete(`${API_BASE}/companies/${companyId}/mailboxes/${mailboxId}`, { headers: getHeaders() });
  },

  async saveCannedResponse(companyId: number, canned: any): Promise<any> {
    const res = await axios.post(`${API_BASE}/companies/${companyId}/canned-responses`, canned, { headers: getHeaders() });
    return res.data;
  },

  async getAutomationRules(companyId: number): Promise<any[]> {
    const res = await axios.get(`${API_BASE}/companies/${companyId}/automation-rules`, { headers: getHeaders() });
    return res.data;
  },

  async saveAutomationRule(companyId: number, rule: any): Promise<any> {
    const res = await axios.post(`${API_BASE}/companies/${companyId}/automation-rules`, rule, { headers: getHeaders() });
    return res.data;
  },

  async reauthenticate(companyId: number, password: string): Promise<{ success: boolean; message: string }> {
    const res = await axios.post(`${API_BASE}/companies/${companyId}/reauth`, { password }, { headers: getHeaders() });
    return res.data;
  },

  async exportWorkspaceData(companyId: number): Promise<any> {
    const res = await axios.get(`${API_BASE}/companies/${companyId}/export`, { headers: getHeaders() });
    return res.data;
  },


  // =========================================================================
  // SECTION F: SUPER ADMIN APIS (SCREENS 40 TO 43)
  // =========================================================================

  async getPlatformPlans(): Promise<any[]> {
    const res = await axios.get(`${API_BASE}/admin/plans`, { headers: getHeaders() });
    return res.data;
  },

  async getPlatformCoupons(): Promise<any[]> {
    const res = await axios.get(`${API_BASE}/admin/coupons`, { headers: getHeaders() });
    return res.data;
  },

  async getEmailSystemHealth(): Promise<any> {
    const res = await axios.get(`${API_BASE}/admin/email-health`, { headers: getHeaders() });
    return res.data;
  },

  async extendCompanyTrial(id: number, days = 14, reason = 'Extended by platform administrator'): Promise<any> {
    const res = await axios.post(`${API_BASE}/admin/companies/${id}/extend-trial`, { days, reason }, { headers: getHeaders() });
    return res.data;
  },

  async suspendCompany(id: number, reason = 'Administrative hold'): Promise<any> {
    const res = await axios.post(`${API_BASE}/admin/companies/${id}/suspend`, { reason }, { headers: getHeaders() });
    return res.data;
  },

  async impersonateCompany(id: number, staffName = 'Super Admin Staff', reason = 'Support Troubleshooting'): Promise<any> {
    const res = await axios.post(`${API_BASE}/admin/companies/${id}/impersonate`, { staffName, reason }, { headers: getHeaders() });
    return res.data;
  },

  async deleteCompany(id: number, confirmationName: string): Promise<any> {
    const res = await axios.delete(`${API_BASE}/admin/companies/${id}`, {
      params: { confirmationName },
      headers: getHeaders()
    });
    return res.data;
  },

};
