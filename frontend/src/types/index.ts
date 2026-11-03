export interface Company {
  id: number;
  companyCode: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  logoUrl?: string;
  primaryColor: string;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  planName: string;
}

export interface Department {
  id: number;
  name: string;
  code?: string;
  description?: string;
  isActive: boolean;
}

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName?: string;
  displayName: string;
  role: {
    name: string;
    roleType: string;
  };
  primaryDepartment?: Department;
  isActive: boolean;
}

export interface Contact {
  id: number;
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
}

export interface Tag {
  id: number;
  name: string;
  colorHex: string;
}

export interface TicketThread {
  id: number;
  threadType: 'REPLY' | 'CUSTOMER_REPLY' | 'PRIVATE_NOTE' | 'FORWARD' | 'SYSTEM';
  senderType: 'AGENT' | 'CUSTOMER' | 'SYSTEM';
  senderUser?: User;
  senderContact?: Contact;
  fromEmail: string;
  fromName: string;
  toEmails?: string;
  subject?: string;
  bodyHtml: string;
  bodyText?: string;
  isPrivate: boolean;
  createdAt: string;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  descriptionHtml?: string;
  descriptionText?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_CUSTOMER' | 'WAITING_ON_THIRD_PARTY' | 'RESOLVED' | 'CLOSED' | 'SPAM';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  channel: 'EMAIL' | 'MICROSOFT_365' | 'WEB_PORTAL' | 'CHAT' | 'PHONE' | 'API';
  department: Department;
  contact: Contact;
  assignedAgent?: User;
  firstResponseDueAt?: string;
  slaStatus: 'WITHIN_SLA' | 'NEARING_BREACH' | 'BREACHED' | 'EXEMPT';
  createdAt: string;
  tags?: Tag[];
  threads?: TicketThread[];
}

export interface CompanyMailbox {
  id: number;
  mailboxName: string;
  emailAddress: string;
  providerType: string;
  authType: string;
  syncStatus: 'CONNECTED' | 'AUTHENTICATING' | 'AUTH_EXPIRED' | 'ERROR';
  department: Department;
  lastSyncedAt?: string;
  isActive: boolean;
}

export interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  breachedSlaTickets: number;
  activeAgents: number;
  connectedMailboxes: number;
}

export interface AuthUser {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  roleType: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'AGENT' | 'CUSTOMER';
  roleName: string;
  company?: {
    id: number;
    companyCode: string;
    name: string;
    subdomain: string;
    status: string;
    primaryColor: string;
  };
}

export interface LoginResponse extends AuthUser {
  token: string;
}

export interface AdminOverview {
  totalCompanies: number;
  activeCompanies: number;
  suspendedCompanies: number;
  totalTickets: number;
  totalAgents: number;
}

export interface CompanyDetail {
  id: number;
  companyCode: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'INACTIVE';
  planName: string;
  maxAgents: number;
  primaryColor: string;
  createdAt: string;
  userCount: number;
  ticketCount: number;
}

export interface CompanyCreateInput {
  companyCode: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  planName: string;
  maxAgents: number;
  primaryColor?: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPassword: string;
  adminPhone?: string;
}

export interface UserCredentialInput {
  companyId: number;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleType: string;
  departmentId?: number;
}

export interface MisFilter {
  companyId?: number;
  departmentId?: number;
  status?: string;
  priority?: string;
  channel?: string;
  slaStatus?: string;
  search?: string;
  dateRange?: string;
}

export interface MisTrackItem {
  id: number;
  ticketNumber: string;
  companyId: number;
  companyCode: string;
  departmentId?: number;
  departmentName?: string;
  departmentCode?: string;
  subject: string;
  requesterName?: string;
  requesterEmail?: string;
  assignedAgentName?: string;
  status: string;
  priority: string;
  channel: string;
  slaStatus: string;
  createdAt: string;
  firstResponseDueAt?: string;
  firstResponseAt?: string;
  resolutionDueAt?: string;
  resolvedAt?: string;
  turnaroundHours?: number;
}

export interface MisSummary {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  breachedTickets: number;
  slaCompliancePercentage: number;
  avgResolutionHours: number;
  departmentBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
}

export interface DepartmentDetail {
  id: number;
  companyId: number;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  agentCount: number;
  openTicketCount: number;
}

export interface DepartmentCreateInput {
  companyId?: number;
  name: string;
  code?: string;
  description?: string;
}

export interface SupportEngineer {
  id: number;
  companyId: number;
  companyCode: string;
  departmentId?: number;
  departmentName: string;
  departmentCode: string;
  firstName: string;
  lastName?: string;
  displayName: string;
  email: string;
  phone?: string;
  roleType: string;
  roleName: string;
  isActive: boolean;
  activeTicketsCount: number;
  createdAt?: string;
}

export interface SupportEngineerCreateInput {
  companyId?: number;
  departmentId?: number;
  firstName: string;
  lastName?: string;
  email: string;
  password?: string;
  phone?: string;
  specialization?: string;
  roleType?: string;
}


