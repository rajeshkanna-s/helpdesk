import axios from 'axios';
import type { 
  Company, DashboardStats, Ticket, TicketThread, CompanyMailbox, Department, User,
  LoginResponse, AdminOverview, CompanyDetail, CompanyCreateInput, UserCredentialInput,
  MisTrackItem, MisSummary, DepartmentDetail, DepartmentCreateInput,
  SupportEngineer, SupportEngineerCreateInput
} from '../types';

const API_BASE = 'http://localhost:8080/api/v1';

let currentCompanyId = 1;
let authToken: string | null = localStorage.getItem('kuwy_auth_token');

export const setApiTenantId = (companyId: number) => {
  currentCompanyId = companyId;
};

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem('kuwy_auth_token', token);
  } else {
    localStorage.removeItem('kuwy_auth_token');
  }
};

const getHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Company-ID': String(currentCompanyId),
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
};

export const apiService = {
  // Auth
  async login(credentials: { email: string; password: string; companyCode?: string }): Promise<LoginResponse> {
    const res = await axios.post(`${API_BASE}/auth/login`, credentials);
    if (res.data?.token) {
      setAuthToken(res.data.token);
    }
    return res.data;
  },

  // Admin APIs (Project Owner)
  async getAdminOverview(): Promise<AdminOverview> {
    try {
      const res = await axios.get(`${API_BASE}/admin/overview`, { headers: getHeaders() });
      return res.data;
    } catch {
      return {
        totalCompanies: 2,
        activeCompanies: 2,
        suspendedCompanies: 0,
        totalTickets: 3,
        totalAgents: 6,
      };
    }
  },

  async getAdminCompanies(): Promise<CompanyDetail[]> {
    try {
      const res = await axios.get(`${API_BASE}/admin/companies`, { headers: getHeaders() });
      return res.data;
    } catch {
      return [
        {
          id: 1,
          companyCode: 'KUWY',
          name: 'Kuwy Technology Services Pvt Ltd',
          subdomain: 'kuwy',
          customDomain: 'helpdesk.kuwy.in',
          status: 'ACTIVE',
          planName: 'ENTERPRISE',
          maxAgents: 50,
          primaryColor: '#0d6efd',
          createdAt: '2026-11-02T23:00:00',
          userCount: 4,
          ticketCount: 3,
        },
        {
          id: 2,
          companyCode: 'ACME',
          name: 'Acme Global Logistics',
          subdomain: 'acme',
          customDomain: 'support.acmelogistics.com',
          status: 'ACTIVE',
          planName: 'PROFESSIONAL',
          maxAgents: 50,
          primaryColor: '#198754',
          createdAt: '2026-11-02T23:00:00',
          userCount: 1,
          ticketCount: 0,
        },
      ];
    }
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
    try {
      const res = await axios.get(`${API_BASE}/admin/users`, { headers: getHeaders() });
      return res.data;
    } catch {
      return [];
    }
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
    try {
      const res = await axios.get(`${API_BASE}/companies`);
      return res.data;
    } catch {
      return [
        {
          id: 1,
          companyCode: 'KUWY',
          name: 'Kuwy Technology Services Pvt Ltd',
          subdomain: 'kuwy',
          primaryColor: '#0d6efd',
          status: 'ACTIVE',
          planName: 'ENTERPRISE',
        },
        {
          id: 2,
          companyCode: 'ACME',
          name: 'Acme Global Logistics',
          subdomain: 'acme',
          primaryColor: '#198754',
          status: 'ACTIVE',
          planName: 'PROFESSIONAL',
        },
      ];
    }
  },

  // Dashboard Stats
  async getDashboardStats(companyId: number): Promise<DashboardStats> {
    try {
      const res = await axios.get(`${API_BASE}/dashboard/stats?companyId=${companyId}`, { headers: getHeaders() });
      return res.data;
    } catch {
      return {
        totalTickets: companyId === 1 ? 2 : 1,
        openTickets: 1,
        inProgressTickets: companyId === 1 ? 1 : 0,
        resolvedTickets: 0,
        breachedSlaTickets: 0,
        activeAgents: companyId === 1 ? 3 : 1,
        connectedMailboxes: companyId === 1 ? 2 : 1,
      };
    }
  },

  // Tickets
  async getTickets(companyId: number, status?: string): Promise<Ticket[]> {
    try {
      const url = status && status !== 'ALL'
        ? `${API_BASE}/tickets?companyId=${companyId}&status=${status}`
        : `${API_BASE}/tickets?companyId=${companyId}`;
      const res = await axios.get(url, { headers: getHeaders() });
      return res.data.content || res.data;
    } catch {
      if (companyId === 1) {
        return [
          {
            id: 1,
            ticketNumber: 'KUWY-1001',
            subject: 'Dealer Portal: CIBIL Score Pull Failure for Application #KW-98421',
            descriptionText: 'We are encountering a timeout error when trying to fetch the bureau score for loan application #KW-98421.',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            channel: 'MICROSOFT_365',
            department: { id: 2, name: 'IT & Engineering Support', isActive: true },
            contact: { id: 1, firstName: 'Rajesh', lastName: 'Sundaram', email: 'testrajesh.sundaram@srivariauto.com' },
            assignedAgent: { id: 2, email: 'testkarthik.agent@kuwy.in', firstName: 'Karthik', displayName: 'Karthik N (Support)', role: { name: 'Agent', roleType: 'AGENT' }, isActive: true },
            slaStatus: 'WITHIN_SLA',
            createdAt: '2026-11-02T16:45:00',
            tags: [{ id: 1, name: 'Bureau-Issue', colorHex: '#dc3545' }, { id: 3, name: 'Dealer-Portal', colorHex: '#198754' }],
          },
          {
            id: 2,
            ticketNumber: 'KUWY-1002',
            subject: 'Disbursement verification required for 3 sanctioned contracts',
            descriptionText: 'Attached are the signed loan sanction letters for dealer code D-402. Kindly initiate verification.',
            status: 'OPEN',
            priority: 'MEDIUM',
            channel: 'EMAIL',
            department: { id: 1, name: 'Loan Origination & Ops', isActive: true },
            contact: { id: 2, firstName: 'Pooja', lastName: 'Menon', email: 'testpooja.menon@cholafinance.com' },
            assignedAgent: { id: 3, email: 'testdivya.ops@kuwy.in', firstName: 'Divya', displayName: 'Divya P (Operations)', role: { name: 'Agent', roleType: 'AGENT' }, isActive: true },
            slaStatus: 'WITHIN_SLA',
            createdAt: '2026-11-02T16:50:00',
            tags: [{ id: 2, name: 'Loan-Ops', colorHex: '#0d6efd' }],
          },
        ];
      } else {
        return [
          {
            id: 3,
            ticketNumber: 'ACME-1001',
            subject: 'Customs clearance delay at Chennai Port (Container #CN-884)',
            descriptionText: 'Port authorities are requesting updated bill of lading documents.',
            status: 'OPEN',
            priority: 'URGENT',
            channel: 'MICROSOFT_365',
            department: { id: 4, name: 'Fleet & Freight Support', isActive: true },
            contact: { id: 3, firstName: 'Mark', lastName: 'Spencer', email: 'testmark@freightline.org' },
            slaStatus: 'WITHIN_SLA',
            createdAt: '2026-11-02T15:30:00',
          },
        ];
      }
    }
  },

  // Ticket Detail + Threads
  async getTicketDetail(id: number): Promise<Ticket> {
    try {
      const [ticketRes, threadsRes] = await Promise.all([
        axios.get(`${API_BASE}/tickets/${id}`, { headers: getHeaders() }),
        axios.get(`${API_BASE}/tickets/${id}/threads`, { headers: getHeaders() }).catch(() => ({ data: [] })),
      ]);
      return {
        ...ticketRes.data,
        threads: threadsRes.data || [],
      };
    } catch {
      return {
        id: 1,
        ticketNumber: 'KUWY-1001',
        subject: 'Dealer Portal: CIBIL Score Pull Failure for Application #KW-98421',
        descriptionText: 'We are encountering a timeout error when trying to fetch the bureau score for loan application #KW-98421.',
        descriptionHtml: '<p>Hello Kuwy Team,</p><p>We are encountering a timeout error when trying to fetch the bureau score for loan application <b>#KW-98421</b>. Could you please check if the bureau integration is operational?</p><p>Regards,<br/>Rajesh Sundaram<br/>Sri Vari Auto</p>',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        channel: 'MICROSOFT_365',
        department: { id: 2, name: 'IT & Engineering Support', isActive: true },
        contact: { id: 1, firstName: 'Rajesh', lastName: 'Sundaram', email: 'testrajesh.sundaram@srivariauto.com' },
        assignedAgent: { id: 2, email: 'testkarthik.agent@kuwy.in', firstName: 'Karthik', displayName: 'Karthik N (Support)', role: { name: 'Agent', roleType: 'AGENT' }, isActive: true },
        slaStatus: 'WITHIN_SLA',
        createdAt: '2026-11-02T16:45:00',
        tags: [{ id: 1, name: 'Bureau-Issue', colorHex: '#dc3545' }, { id: 3, name: 'Dealer-Portal', colorHex: '#198754' }],
        threads: [
          {
            id: 1,
            threadType: 'CUSTOMER_REPLY',
            senderType: 'CUSTOMER',
            fromEmail: 'testrajesh.sundaram@srivariauto.com',
            fromName: 'Rajesh Sundaram',
            subject: 'Dealer Portal: CIBIL Score Pull Failure for Application #KW-98421',
            bodyHtml: '<p>Hello Kuwy Team,</p><p>We are encountering a timeout error when trying to fetch the bureau score for loan application <b>#KW-98421</b>. Could you please check if the bureau integration is operational?</p>',
            isPrivate: false,
            createdAt: '2026-11-02T16:45:00',
          },
          {
            id: 2,
            threadType: 'PRIVATE_NOTE',
            senderType: 'AGENT',
            fromEmail: 'testkarthik.agent@kuwy.in',
            fromName: 'Karthik N (Support)',
            bodyHtml: '<p><b>@Seetha</b> I checked the bureau gateway logs. Experian and Equifax endpoints were momentarily slow between 14:10 and 14:25. Re-triggering the token now.</p>',
            isPrivate: true,
            createdAt: '2026-11-02T17:00:00',
          },
          {
            id: 3,
            threadType: 'REPLY',
            senderType: 'AGENT',
            fromEmail: 'testsupport@kuwy.in',
            fromName: 'Karthik N | Kuwy Support',
            bodyHtml: '<p>Dear Rajesh,</p><p>Thank you for reaching out. We identified a transient network latency with the bureau service provider. We have re-polled the bureau report for Application <b>#KW-98421</b> and the score is now successfully updated in your portal.</p><p>Please review and let us know if you need anything else.</p><p>Best regards,<br/><b>Kuwy Technical Support</b></p>',
            isPrivate: false,
            createdAt: '2026-11-02T17:15:00',
          },
        ],
      };
    }
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

  // Update Status
  async updateStatus(ticketId: number, status: string): Promise<Ticket> {
    const res = await axios.patch(`${API_BASE}/tickets/${ticketId}/status?status=${status}`, {}, { headers: getHeaders() });
    return res.data;
  },

  // Mailboxes
  async getMailboxes(companyId: number): Promise<CompanyMailbox[]> {
    try {
      const res = await axios.get(`${API_BASE}/mailboxes?companyId=${companyId}`, { headers: getHeaders() });
      return res.data;
    } catch {
      return [
        {
          id: 1,
          mailboxName: 'Kuwy IT & Partner Support',
          emailAddress: 'testsupport@kuwy.in',
          providerType: 'MICROSOFT_365',
          authType: 'OAUTH2_GRAPH_API',
          syncStatus: 'CONNECTED',
          department: { id: 2, name: 'IT & Engineering Support', isActive: true },
          lastSyncedAt: '2 mins ago',
          isActive: true,
        },
        {
          id: 2,
          mailboxName: 'Kuwy Loan Processing Mailbox',
          emailAddress: 'testloans@kuwy.in',
          providerType: 'MICROSOFT_365',
          authType: 'OAUTH2_GRAPH_API',
          syncStatus: 'CONNECTED',
          department: { id: 1, name: 'Loan Origination & Ops', isActive: true },
          lastSyncedAt: '5 mins ago',
          isActive: true,
        },
      ];
    }
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

  // Departments & Agents
  async getDepartments(companyId: number): Promise<Department[]> {
    try {
      const res = await axios.get(`${API_BASE}/companies/${companyId}/departments`, { headers: getHeaders() });
      return res.data;
    } catch {
      return [
        { id: 1, name: 'Loan Origination & Ops', isActive: true },
        { id: 2, name: 'IT & Engineering Support', isActive: true },
        { id: 3, name: 'Merchant & Dealer Helpdesk', isActive: true },
      ];
    }
  },

  async getAgents(companyId: number): Promise<User[]> {
    try {
      const res = await axios.get(`${API_BASE}/companies/${companyId}/agents`, { headers: getHeaders() });
      return res.data;
    } catch {
      return [
        { id: 1, email: 'testadmin@kuwy.in', firstName: 'Seetha', displayName: 'Seetha Raman (Admin)', role: { name: 'Admin', roleType: 'COMPANY_ADMIN' }, isActive: true },
        { id: 2, email: 'testkarthik.agent@kuwy.in', firstName: 'Karthik', displayName: 'Karthik N (Support)', role: { name: 'Agent', roleType: 'AGENT' }, isActive: true },
        { id: 3, email: 'testdivya.ops@kuwy.in', firstName: 'Divya', displayName: 'Divya P (Operations)', role: { name: 'Agent', roleType: 'AGENT' }, isActive: true },
      ];
    }
  },

  // MIS & Large-Scale Export APIs (Supports up to 100,000+ rows)
  async getMisSummary(companyId: number): Promise<MisSummary> {
    try {
      const res = await axios.get(`${API_BASE}/mis/summary?companyId=${companyId}`, { headers: getHeaders() });
      return res.data;
    } catch {
      return {
        totalTickets: 8,
        openTickets: 4,
        inProgressTickets: 2,
        resolvedTickets: 1,
        closedTickets: 1,
        breachedTickets: 0,
        slaCompliancePercentage: 100.0,
        avgResolutionHours: 2.4,
        departmentBreakdown: { 'IT & Engineering': 3, 'Finance': 1, 'Operations': 2, 'HR': 1, 'Legal': 1 },
        priorityBreakdown: { 'URGENT': 1, 'HIGH': 2, 'MEDIUM': 4, 'LOW': 1 },
      };
    }
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
    try {
      const res = await axios.get(`${API_BASE}/departments?companyId=${companyId}`, { headers: getHeaders() });
      return res.data;
    } catch {
      return [];
    }
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
    try {
      const res = await axios.get(`${API_BASE}/departments/engineers?companyId=${companyId}`, { headers: getHeaders() });
      return res.data;
    } catch {
      return [];
    }
  },

  async createSupportEngineer(data: SupportEngineerCreateInput): Promise<SupportEngineer> {
    const res = await axios.post(`${API_BASE}/departments/engineers`, data, { headers: getHeaders() });
    return res.data;
  },

  async toggleSupportEngineer(userId: number): Promise<User> {
    const res = await axios.patch(`${API_BASE}/departments/engineers/${userId}/toggle-active`, {}, { headers: getHeaders() });
    return res.data;
  },
};

