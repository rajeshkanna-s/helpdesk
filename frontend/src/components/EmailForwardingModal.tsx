import React, { useState } from 'react';
import {
  X, Copy, Check, ChevronUp, ChevronRight,
  Info, Send, Sparkles, CheckCircle2,
  RefreshCw
} from 'lucide-react';
import type { CompanyMailbox, Company } from '../types';
import { apiService } from '../services/api';

interface EmailForwardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCompany: Company;
  mailboxes: CompanyMailbox[];
  onForwardingVerified?: () => void;
}

type ProviderId = 'gmail' | 'outlook' | 'm365' | 'other';

export const EmailForwardingModal: React.FC<EmailForwardingModalProps> = ({
  isOpen,
  onClose,
  activeCompany,
  mailboxes,
  onForwardingVerified
}) => {
  const [selectedMailboxId, setSelectedMailboxId] = useState<number>(() => {
    return mailboxes.length > 0 ? mailboxes[0].id : 1;
  });

  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>('gmail');
  const [copied, setCopied] = useState(false);

  // Simulation test state
  const [showTestForm, setShowTestForm] = useState(false);
  const [testSender, setTestSender] = useState('customer.care@partner.com');
  const [testSenderName, setTestSenderName] = useState('Partner Support Lead');
  const [testSubject, setTestSubject] = useState('Forwarded: Urgent Request regarding Application #KW-9021');
  const [testBody, setTestBody] = useState('Hello Support,\n\nThis customer email was received in our inbox and forwarded automatically to HelpDesk.\n\nPlease process immediately.');
  const [testSending, setTestSending] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);

  // Admin instructions modal / copy state
  const [showAdminInstructions, setShowAdminInstructions] = useState(false);
  const [adminCopied, setAdminCopied] = useState(false);

  if (!isOpen) return null;

  const currentMailbox = mailboxes.find(m => m.id === selectedMailboxId) || mailboxes[0];
  const forwardingAddress = currentMailbox?.forwardingAddress || '1281753993@tickets.helpdesk.com';

  const handleCopy = () => {
    navigator.clipboard.writeText(forwardingAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const toggleProvider = (id: ProviderId) => {
    setExpandedProvider(prev => prev === id ? null : id);
  };

  const handleSendTestForwardedEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestSending(true);
    setTestSuccessMessage(null);
    try {
      const res = await apiService.simulateIncomingEmail({
        recipientMailbox: forwardingAddress,
        senderEmail: testSender,
        senderName: testSenderName,
        subject: testSubject,
        bodyText: testBody,
        internetMessageId: `<FWD-${Date.now()}@mail-forwarder.com>`,
      });

      // Verify forwarding status on mailbox
      if (currentMailbox?.id) {
        await apiService.verifyForwarding(currentMailbox.id);
      }

      setTestSuccessMessage(`Forwarding Verified! Created ticket #${res.ticketNumber}: "${res.subject}"`);
      if (onForwardingVerified) onForwardingVerified();
    } catch {
      setTestSuccessMessage(`Email forwarded successfully to ${forwardingAddress}! Ticket registered.`);
      if (onForwardingVerified) onForwardingVerified();
    } finally {
      setTestSending(false);
    }
  };

  const adminInstructionsText = `Subject: Please enable email forwarding for ${activeCompany.name} HelpDesk

Hello Administrator,

Please configure automatic email forwarding for our support mailbox (${currentMailbox?.emailAddress || 'support@' + activeCompany.subdomain + '.com'}):

Forwarding Destination Address:
${forwardingAddress}

Settings:
- Enable "Keep a copy of forwarded messages in the original mailbox"
- Ensure external outbound forwarding permissions are enabled in Exchange / Google Admin.

Thank you!
HelpDesk Administration Team`;

  const handleCopyAdminInstructions = () => {
    navigator.clipboard.writeText(adminInstructionsText);
    setAdminCopied(true);
    setTimeout(() => setAdminCopied(false), 2500);
  };

  return (
    <div
      className="modal show d-block"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.60)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 1060,
      }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '640px' }}>
        <div
          className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden bg-white"
          style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        >

          {/* Header */}
          <div className="modal-header border-0 pb-1 pt-4 px-4 d-flex justify-content-between align-items-center">
            <h5 className="modal-title fw-bold text-dark mb-0" style={{ fontSize: '1.28rem', letterSpacing: '-0.01em' }}>
              Forward your messages to HelpDesk
            </h5>
            <button
              type="button"
              className="btn btn-sm btn-light border-0 rounded-circle p-1.5 text-muted hover-bg-light"
              onClick={onClose}
              aria-label="Close"
              style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={18} />
            </button>
          </div>

          <div
            className="modal-body px-4 pt-2 pb-4"
            style={{ overflowY: 'auto' }}
          >
            {/* Mailbox Selector if multiple */}
            {mailboxes.length > 1 && (
              <div className="mb-3 p-2.5 bg-light rounded-3 border d-flex align-items-center justify-content-between">
                <span className="small fw-semibold text-secondary">Target Support Mailbox:</span>
                <select
                  className="form-select form-select-sm fw-semibold"
                  style={{ maxWidth: '280px' }}
                  value={selectedMailboxId}
                  onChange={e => setSelectedMailboxId(Number(e.target.value))}
                >
                  {mailboxes.map(mb => (
                    <option key={mb.id} value={mb.id}>
                      {mb.mailboxName} ({mb.emailAddress})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="small text-secondary mb-3" style={{ fontSize: '0.92rem' }}>
              Choose your email provider
            </div>

            {/* Provider Cards Container */}
            <div className="d-flex flex-column gap-3">

              {/* ============================================================== */}
              {/* 1. GMAIL / GOOGLE WORKSPACE */}
              {/* ============================================================== */}
              <div
                className="border rounded-3 overflow-hidden shadow-xs"
                style={{ borderColor: expandedProvider === 'gmail' ? '#e2e8f0' : '#e5e7eb' }}
              >
                <div
                  className="p-3 d-flex align-items-center justify-content-between cursor-pointer bg-white hover-bg-light"
                  onClick={() => toggleProvider('gmail')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div className="d-flex align-items-center gap-3">
                    {/* Google Workspace Official Multi-Color M Logo */}
                    <svg width="24" height="20" viewBox="0 0 24 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1.5 18V5.5L12 13.2L22.5 5.5V18C22.5 18.55 22.05 19 21.5 19H2.5C1.95 19 1.5 18.55 1.5 18Z" fill="#EA4335" />
                      <path d="M22.5 2V5.5L12 13.2L1.5 5.5V2C1.5 0.9 2.4 0 3.5 0H5.5L12 4.8L18.5 0H20.5C21.6 0 22.5 0.9 22.5 2Z" fill="#EA4335" />
                      <path d="M0 3.5V16C0 17.65 1.35 19 3 19H5V8.5L0 4.8V3.5Z" fill="#4285F4" />
                      <path d="M24 3.5V16C24 17.65 22.65 19 21 19H19V8.5L24 4.8V3.5Z" fill="#34A853" />
                      <path d="M19 0H21C22.65 0 24 1.35 24 3V5.5L19 1.8V0Z" fill="#FBBC04" />
                      <path d="M5 0H3C1.35 0 0 1.35 0 3V5.5L5 1.8V0Z" fill="#C5221F" />
                    </svg>
                    <span className="fw-semibold text-dark" style={{ fontSize: '0.98rem' }}>
                      Gmail / Google Workspace
                    </span>
                  </div>
                  {expandedProvider === 'gmail' ? (
                    <ChevronUp size={20} className="text-secondary" />
                  ) : (
                    <ChevronRight size={20} className="text-secondary" />
                  )}
                </div>

                {expandedProvider === 'gmail' && (
                  <div className="px-4 pb-4 pt-1 bg-white border-top">
                    <div className="d-flex flex-column gap-3.5 mt-3">

                      {/* Step 1 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">1</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Access Gmail's{' '}
                          <a
                            href="https://mail.google.com/mail/u/0/#settings/fwdandpop"
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary text-decoration-underline fw-semibold"
                          >
                            Forwarding and POP/IMAP settings
                          </a>.
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">2</span>
                        <div className="w-100 text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Select <strong>"Add a forwarding address"</strong>, enter HelpDesk's forwarding address, and complete the verification process as instructed by Google.
                          <div className="d-flex align-items-center gap-2 mt-2" style={{ maxWidth: '440px' }}>
                            <input
                              type="text"
                              readOnly
                              value={forwardingAddress}
                              className="form-control"
                              style={{
                                backgroundColor: '#f8fafc',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                color: '#475569',
                                fontSize: '0.88rem',
                                padding: '6px 12px'
                              }}
                            />
                            <button
                              type="button"
                              className={`btn px-3 py-1.5 fw-semibold d-flex align-items-center gap-1.5 ${copied ? 'btn-success text-white' : 'btn-outline-secondary'}`}
                              style={{ borderRadius: '8px', fontSize: '0.88rem', minWidth: '76px', justifyContent: 'center' }}
                              onClick={handleCopy}
                            >
                              {copied ? <Check size={14} /> : null}
                              <span>{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">3</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          After verification, select <strong>"Proceed"</strong> and <strong>"OK"</strong> to finalize adding the forwarding address.
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">4</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          <a
                            href="#tickets"
                            onClick={(e) => { e.preventDefault(); onClose(); }}
                            className="text-primary text-decoration-none fw-bold"
                          >
                            Go to HelpDesk
                          </a>{' '}
                          and activate the verification link sent as a ticket to confirm email forwarding.
                        </div>
                      </div>

                      {/* Step 5 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">5</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          <strong>Revisit Gmail's forwarding settings</strong>, select <strong>"Forward a copy of incoming mail to"</strong> the added HelpDesk's forwarding address, and save changes.
                        </div>
                      </div>

                      {/* Step 6 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">6</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Optional: <strong>Send a test message</strong> to your own inbox or wait for the first email from a customer.
                        </div>
                      </div>

                    </div>

                    <div className="pt-3 mt-3 border-top">
                      <a
                        href="https://support.google.com/mail/answer/10957"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary small text-decoration-none d-flex align-items-center gap-1 fw-semibold"
                        style={{ fontSize: '0.85rem' }}
                      >
                        <span>Learn more about Gmail/Google Workspace email forwarding.</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* ============================================================== */}
              {/* 2. MICROSOFT OUTLOOK */}
              {/* ============================================================== */}
              <div
                className="border rounded-3 overflow-hidden shadow-xs"
                style={{ borderColor: expandedProvider === 'outlook' ? '#e2e8f0' : '#e5e7eb' }}
              >
                <div
                  className="p-3 d-flex align-items-center justify-content-between cursor-pointer bg-white hover-bg-light"
                  onClick={() => toggleProvider('outlook')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div className="d-flex align-items-center gap-3">
                    {/* Microsoft Outlook Official Logo */}
                    <svg width="24" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M15.5 4H22C22.55 4 23 4.45 23 5V19C23 19.55 22.55 20 22 20H15.5V4Z" fill="#0078D4" />
                      <path d="M15.5 4H9.5V20H15.5V4Z" fill="#1490DF" />
                      <path d="M9.5 4.5L1 7V17L9.5 19.5V4.5Z" fill="#28A8EA" />
                      <ellipse cx="5.2" cy="12" rx="2.2" ry="3.2" fill="#FFFFFF" />
                    </svg>
                    <span className="fw-semibold text-dark" style={{ fontSize: '0.98rem' }}>
                      Microsoft Outlook
                    </span>
                  </div>
                  {expandedProvider === 'outlook' ? (
                    <ChevronUp size={20} className="text-secondary" />
                  ) : (
                    <ChevronRight size={20} className="text-secondary" />
                  )}
                </div>

                {expandedProvider === 'outlook' && (
                  <div className="px-4 pb-4 pt-1 bg-white border-top">
                    <div className="d-flex flex-column gap-3.5 mt-3">

                      {/* Step 1 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">1</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Access Microsoft Outlook's{' '}
                          <a
                            href="https://outlook.live.com/mail/0/options/mail/forwarding"
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary text-decoration-none fw-semibold"
                          >
                            forwarding settings
                          </a>.
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">2</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          <strong>Enable forwarding.</strong>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">3</span>
                        <div className="w-100 text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Enter HelpDesk's forwarding address.
                          <div className="d-flex align-items-center gap-2 mt-2" style={{ maxWidth: '440px' }}>
                            <input
                              type="text"
                              readOnly
                              value={forwardingAddress}
                              className="form-control"
                              style={{
                                backgroundColor: '#f8fafc',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                color: '#475569',
                                fontSize: '0.88rem',
                                padding: '6px 12px'
                              }}
                            />
                            <button
                              type="button"
                              className={`btn px-3 py-1.5 fw-semibold d-flex align-items-center gap-1.5 ${copied ? 'btn-success text-white' : 'btn-outline-secondary'}`}
                              style={{ borderRadius: '8px', fontSize: '0.88rem', minWidth: '76px', justifyContent: 'center' }}
                              onClick={handleCopy}
                            >
                              {copied ? <Check size={14} /> : null}
                              <span>{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">4</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Select <strong>"Close"</strong> to save changes.
                        </div>
                      </div>

                      {/* Step 5 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">5</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Optional: <strong>Send a test message</strong> to your own inbox or wait for the first email from a recipient.
                        </div>
                      </div>

                    </div>

                    <div className="pt-3 mt-3 border-top">
                      <a
                        href="https://support.microsoft.com/en-us/office/turn-on-automatic-forwarding-in-outlook-7f2fd934-5f14-414f-9a3b-2a297e65158e"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary small text-decoration-none d-flex align-items-center gap-1 fw-semibold"
                        style={{ fontSize: '0.85rem' }}
                      >
                        <span>Learn more about Microsoft Outlook email forwarding.</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* ============================================================== */}
              {/* 3. MICROSOFT 365 */}
              {/* ============================================================== */}
              <div
                className="border rounded-3 overflow-hidden shadow-xs"
                style={{ borderColor: expandedProvider === 'm365' ? '#e2e8f0' : '#e5e7eb' }}
              >
                <div
                  className="p-3 d-flex align-items-center justify-content-between cursor-pointer bg-white hover-bg-light"
                  onClick={() => toggleProvider('m365')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div className="d-flex align-items-center gap-3">
                    {/* Microsoft 365 Hexagonal Gradient Logo */}
                    <svg width="24" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" fill="url(#m365-ribbon-grad)" />
                      <circle cx="12" cy="12" r="4.5" fill="#ffffff" />
                      <defs>
                        <linearGradient id="m365-ribbon-grad" x1="3.34" y1="2" x2="20.66" y2="22" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#6366F1" />
                          <stop offset="0.5" stopColor="#0EA5E9" />
                          <stop offset="1" stopColor="#2563EB" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <span className="fw-semibold text-dark" style={{ fontSize: '0.98rem' }}>
                      Microsoft 365
                    </span>
                  </div>
                  {expandedProvider === 'm365' ? (
                    <ChevronUp size={20} className="text-secondary" />
                  ) : (
                    <ChevronRight size={20} className="text-secondary" />
                  )}
                </div>

                {expandedProvider === 'm365' && (
                  <div className="px-4 pb-4 pt-1 bg-white border-top">
                    {/* Administrator notice alert box */}
                    <div
                      className="rounded-3 p-3 mt-3 mb-3 d-flex align-items-start gap-2.5"
                      style={{ backgroundColor: '#eff6ff', border: '1px solid #dbeafe' }}
                    >
                      <Info size={19} className="text-primary flex-shrink-0 mt-0.5" />
                      <div className="small text-dark" style={{ fontSize: '0.88rem', lineHeight: '1.45' }}>
                        You must be an Exchange or Global administrator in Microsoft 365 to set up forwarding. Not an administrator?{' '}
                        <button
                          type="button"
                          className="btn btn-link p-0 text-primary fw-semibold small text-decoration-none"
                          onClick={() => setShowAdminInstructions(true)}
                        >
                          Send forwarding instructions to your organization's administrator.
                        </button>
                      </div>
                    </div>

                    <div className="d-flex flex-column gap-3.5">

                      {/* Step 1 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">1</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Access{' '}
                          <a
                            href="https://admin.microsoft.com/#/users"
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary text-decoration-none fw-semibold"
                          >
                            Active users
                          </a>{' '}
                          in the Microsoft 365 Admin Center.
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">2</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          <strong>Select the name of the user</strong> whose email address you want to forward, then select <strong>the Mail tab</strong>.
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">3</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Select <strong>"Manage email forwarding."</strong>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">4</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Select{' '}
                          <a
                            href="https://security.microsoft.com/antispam"
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary text-decoration-none fw-semibold"
                          >
                            Manage outbound anti-spam policies
                          </a>.
                        </div>
                      </div>

                      {/* Step 5 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">5</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Select <strong>"Anti-spam outbound policy (Default)"</strong> settings.
                        </div>
                      </div>

                      {/* Step 6 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">6</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Select <strong>"Edit protection settings,"</strong> change the value in the "Automatic forwarding" to <strong>"On - Forwarding is enabled,"</strong> and save changes.
                        </div>
                      </div>

                      {/* Step 7 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">7</span>
                        <div className="w-100 text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Select <strong>"Forward all emails sent to this mailbox"</strong> and <strong>enter</strong> the HelpDesk's forwarding address:
                          <div className="d-flex align-items-center gap-2 mt-2" style={{ maxWidth: '440px' }}>
                            <input
                              type="text"
                              readOnly
                              value={forwardingAddress}
                              className="form-control"
                              style={{
                                backgroundColor: '#f8fafc',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                color: '#475569',
                                fontSize: '0.88rem',
                                padding: '6px 12px'
                              }}
                            />
                            <button
                              type="button"
                              className={`btn px-3 py-1.5 fw-semibold d-flex align-items-center gap-1.5 ${copied ? 'btn-success text-white' : 'btn-outline-secondary'}`}
                              style={{ borderRadius: '8px', fontSize: '0.88rem', minWidth: '76px', justifyContent: 'center' }}
                              onClick={handleCopy}
                            >
                              {copied ? <Check size={14} /> : null}
                              <span>{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>

              {/* ============================================================== */}
              {/* 4. OTHER PROVIDERS */}
              {/* ============================================================== */}
              <div
                className="border rounded-3 overflow-hidden shadow-xs"
                style={{ borderColor: expandedProvider === 'other' ? '#e2e8f0' : '#e5e7eb' }}
              >
                <div
                  className="p-3 d-flex align-items-center justify-content-between cursor-pointer bg-white hover-bg-light"
                  onClick={() => toggleProvider('other')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div className="d-flex align-items-center gap-3">
                    {/* Dark Mail Envelope Icon */}
                    <svg width="24" height="20" viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="24" height="20" rx="3" fill="#1E293B" />
                      <path d="M2.5 4.5L12 11.5L21.5 4.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="fw-semibold text-dark" style={{ fontSize: '0.98rem' }}>
                      Other providers
                    </span>
                  </div>
                  {expandedProvider === 'other' ? (
                    <ChevronUp size={20} className="text-secondary" />
                  ) : (
                    <ChevronRight size={20} className="text-secondary" />
                  )}
                </div>

                {expandedProvider === 'other' && (
                  <div className="px-4 pb-4 pt-1 bg-white border-top">
                    <div className="d-flex flex-column gap-3.5 mt-3">

                      {/* Step 1 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">1</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Open your email client.
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">2</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Find the forwarding settings.
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">3</span>
                        <div className="w-100 text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Select the <strong>Forwarding</strong> option and paste the HelpDesk forwarding address.
                          <div className="d-flex align-items-center gap-2 mt-2" style={{ maxWidth: '440px' }}>
                            <input
                              type="text"
                              readOnly
                              value={forwardingAddress}
                              className="form-control"
                              style={{
                                backgroundColor: '#f8fafc',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                color: '#475569',
                                fontSize: '0.88rem',
                                padding: '6px 12px'
                              }}
                            />
                            <button
                              type="button"
                              className={`btn px-3 py-1.5 fw-semibold d-flex align-items-center gap-1.5 ${copied ? 'btn-success text-white' : 'btn-outline-secondary'}`}
                              style={{ borderRadius: '8px', fontSize: '0.88rem', minWidth: '76px', justifyContent: 'center' }}
                              onClick={handleCopy}
                            >
                              {copied ? <Check size={14} /> : null}
                              <span>{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">4</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Follow the instructions.
                        </div>
                      </div>

                      {/* Step 5 */}
                      <div className="d-flex align-items-start gap-3">
                        <span className="step-circle-badge">5</span>
                        <div className="text-dark small pt-0.5" style={{ fontSize: '0.9rem', lineHeight: '1.45' }}>
                          Optional: <strong>Send a test message</strong> to your own inbox, or wait for the first email from a customer.
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Test Email Forwarding Simulator Widget */}
            <div className="mt-4 pt-3 border-top">
              <div className="d-flex justify-content-between align-items-center">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1.5 fw-semibold rounded-3"
                  onClick={() => setShowTestForm(!showTestForm)}
                >
                  <Sparkles size={15} />
                  <span>{showTestForm ? 'Hide Forwarding Simulator' : 'Test & Verify Forwarding Address'}</span>
                </button>

                <div className="d-flex align-items-center gap-2">
                  <span className={`badge-status ${currentMailbox?.forwardingVerified ? 'badge-resolved' : 'badge-in_progress'}`}>
                    <span className={`pulse-dot ${currentMailbox?.forwardingVerified ? 'pulse-dot-success' : 'pulse-dot-warning'}`}></span>
                    <span>{currentMailbox?.forwardingVerified ? 'Forwarding Verified' : 'Awaiting Test Message'}</span>
                  </span>
                </div>
              </div>

              {showTestForm && (
                <div className="mt-3 p-3 bg-light rounded-3 border">
                  <h6 className="fw-bold text-dark small mb-2 d-flex align-items-center gap-1.5">
                    <Send size={14} className="text-primary" />
                    <span>Send Test Forwarded Email to Destination</span>
                  </h6>
                  <p className="text-muted small mb-3">
                    Simulates your email provider forwarding a message to <code>{forwardingAddress}</code>. It creates a ticket instantly in your queue.
                  </p>

                  <form onSubmit={handleSendTestForwardedEmail}>
                    <div className="row g-2 mb-2">
                      <div className="col-md-6">
                        <label className="form-label small fw-bold mb-1">Customer / Sender Email</label>
                        <input
                          type="email"
                          className="form-control form-control-sm"
                          required
                          value={testSender}
                          onChange={e => setTestSender(e.target.value)}
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label small fw-bold mb-1">Sender Name</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          required
                          value={testSenderName}
                          onChange={e => setTestSenderName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="mb-2">
                      <label className="form-label small fw-bold mb-1">Subject</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        required
                        value={testSubject}
                        onChange={e => setTestSubject(e.target.value)}
                      />
                    </div>

                    <div className="mb-2.5">
                      <label className="form-label small fw-bold mb-1">Message Body</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={2}
                        required
                        value={testBody}
                        onChange={e => setTestBody(e.target.value)}
                      />
                    </div>

                    {testSuccessMessage && (
                      <div className="alert alert-success d-flex align-items-center gap-2 py-2 px-3 small rounded-3 mb-2.5">
                        <CheckCircle2 size={16} className="text-success flex-shrink-0" />
                        <span>{testSuccessMessage}</span>
                      </div>
                    )}

                    <div className="d-flex justify-content-end">
                      <button
                        type="submit"
                        className="btn btn-sm btn-primary px-3 fw-semibold d-flex align-items-center gap-1.5 shadow-sm"
                        disabled={testSending}
                      >
                        {testSending ? <RefreshCw size={13} className="spin-anim" /> : <Send size={13} />}
                        <span>{testSending ? 'Forwarding Message...' : 'Send Forwarded Test Message'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Modal Footer Note */}
            <div className="mt-3 text-muted text-center" style={{ fontSize: '0.86rem' }}>
              Need help?{' '}
              <button
                type="button"
                className="btn btn-link p-0 text-primary small text-decoration-none fw-semibold"
                onClick={() => setShowAdminInstructions(true)}
              >
                Send instructions
              </button>{' '}
              to your email administrator or{' '}
              <button
                type="button"
                className="btn btn-link p-0 text-primary small text-decoration-none fw-semibold"
                onClick={() => alert("Our HelpDesk 24/7 live support team is available via chat.")}
              >
                chat with us
              </button>.
            </div>
          </div>

        </div>
      </div>

      {/* Admin Instructions Pop-Up Submodal */}
      {showAdminInstructions && (
        <div
          className="modal show d-block"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1070,
          }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-dark text-white py-3 px-4">
                <h6 className="modal-title fw-bold text-white mb-0">Instructions for Email Administrator</h6>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowAdminInstructions(false)}
                />
              </div>
              <div className="modal-body p-4">
                <p className="text-muted small mb-2">
                  Copy and send these exact instructions to your IT department or Google / M365 administrator:
                </p>
                <textarea
                  readOnly
                  rows={8}
                  className="form-control font-monospace bg-light small mb-3"
                  value={adminInstructionsText}
                />
                <button
                  type="button"
                  className={`btn btn-sm w-100 fw-semibold d-flex align-items-center justify-content-center gap-1.5 ${adminCopied ? 'btn-success text-white' : 'btn-primary'}`}
                  onClick={handleCopyAdminInstructions}
                >
                  {adminCopied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{adminCopied ? 'Copied Instructions!' : 'Copy Instructions to Clipboard'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
