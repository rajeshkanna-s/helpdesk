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

export interface TicketAttachment {
  id: number;
  ticketId: number;
  threadId?: number | null;
  fileName: string;
  fileSizeBytes: number;
  contentType: string;
  storageType: 'LOCAL_DISK' | 'CLOUDINARY' | 'S3' | 'AZURE_BLOB';
  storagePath: string;
  downloadUrl: string;
  previewUrl: string;
  isInline?: boolean;
  createdAt?: string;
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
  attachments?: TicketAttachment[];
}

export interface Ticket {
  attachments?: TicketAttachment[];
  emailNotification?: 'queued' | 'not_configured';
  updatedAt?: string;
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
  sourceMailbox?: CompanyMailbox;
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
  forwardingAddress?: string;
  forwardingVerified?: boolean;
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
  mfaSetupRequired?: boolean;
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  roleType: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'TEAM_LEAD' | 'AGENT' | 'LIGHT_AGENT' | 'CUSTOMER';
  roleName: string;
  company?: {
    id: number;
    companyCode: string;
    name: string;
    subdomain: string;
    status: string;
    primaryColor: string;
    planName?: string;
  };
}

export interface LoginResponse extends Partial<AuthUser> {
  browserSession?: boolean;
  csrfToken?: string;
  sessionId?: string;
  token?: string;
  twoFactorRequired?: boolean;
  tempToken?: string;
  maskedEmail?: string;
}

export interface Verify2FaRequest {
  tempToken: string;
  code: string;
  isBackupCode?: boolean;
  trustDevice30Days?: boolean;
}

export interface ForgotPasswordRequest {
  email: string;
  companyCode?: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface InvitationValidationResponse {
  valid: boolean;
  status: 'VALID' | 'EXPIRED' | 'USED' | 'REVOKED' | 'NOT_FOUND' | 'LIMIT_REACHED';
  message: string;
  email?: string;
  name?: string;
  companyName?: string;
  companySubdomain?: string;
  companyLogo?: string;
  roleName?: string;
  inviterName?: string;
}

export interface AcceptInvitationRequest {
  token: string;
  name: string;
  password: string;
  agreedToTerms: boolean;
}

export interface AgentInvitation {
  id: number;
  email: string;
  name: string;
  roleId: number;
  roleName: string;
  inviterName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

export interface AdminOverview {
  totalCompanies: number;
  activeCompanies: number;
  suspendedCompanies: number;
  trialCompanies?: number;
  paidCompanies?: number;
  totalTickets: number;
  totalAgents: number;
  mrr?: number;
  arr?: number;
  ticketsToday?: number;
  apiErrorRate?: number;
  avgResponseTimeMs?: number;
  failedPaymentsCount?: number;
}

export interface CompanyDetail {
  id: number;
  companyCode: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'INACTIVE' | 'PAST_DUE';
  ownerEmail?: string;
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



export interface KbArticle {
  id: number;
  categoryId: number;
  categoryName: string;
  title: string;
  slug: string;
  contentHtml: string;
  viewCount: number;
  helpfulVotes: number;
}

export interface ScenarioMacro {
  id: string;
  title: string;
  description: string;
  badge: string;
  color: string;
  targetStatus?: string;
  targetPriority?: string;
  cannedResponse?: string;
}



export interface CompanySubscription {
  id: number;
  companyId: number;
  planTier: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  billingCycle: 'MONTHLY' | 'ANNUAL';
  amount: number;
  currency: string;
  gatewayProvider?: string;
  agentLimit: number;
  ticketLimitMonthly: number;
  status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED' | 'LOCKED';
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  gracePeriodEndsAt?: string;
}

export interface CannedResponse {
  id: number;
  title: string;
  shortcut: string;
  content: string;
  isShared: boolean;
  departmentId?: number | null;
  department?: Department;
}

export interface AutomationRule {
  id: number;
  name: string;
  eventTrigger: 'TICKET_CREATED' | 'TICKET_UPDATED' | 'CUSTOMER_REPLIED' | 'SLA_BREACHED' | 'TIME_INACTIVE';
  conditionJson?: string;
  actionJson?: string;
  isActive: boolean;
  priorityOrder: number;
}

export interface EmailTemplate {
  id: number;
  templateType: 'TICKET_CREATED_CONFIRMATION' | 'AGENT_REPLY' | 'TICKET_RESOLVED' | 'TICKET_CLOSED' | 'CUSTOMER_OTP';
  subjectTemplate: string;
  bodyHtml: string;
  isActive: boolean;
}

export interface CustomerContact {
  id: number;
  firstName: string;
  lastName?: string;
  displayName: string;
  email: string;
  phone?: string;
  organization?: string;
  accountId?: number;
  totalTickets: number;
  openTickets: number;
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  companyId: number;
  userId: number;
  ticketId?: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}


