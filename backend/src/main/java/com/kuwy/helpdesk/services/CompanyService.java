package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.dto.CustomerContactDto;
import com.kuwy.helpdesk.dto.KbArticleDto;
import com.kuwy.helpdesk.dto.SaveKbArticleRequest;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class CompanyService {

    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final NotificationRepository notificationRepository;
    private final SecurityAuditLogRepository securityAuditLogRepository;
    private final CompanyMailboxRepository companyMailboxRepository;
    private final CannedResponseRepository cannedResponseRepository;
    private final AutomationRuleRepository automationRuleRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    @Transactional(readOnly = true)
    public List<Company> getAllCompanies() {
        if (!TenantContext.isSuperAdmin()) {
            throw new SecurityException("Only a platform administrator can list workspaces.");
        }
        return companyRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Company getCompanyById(Long id) {
        TenantContext.assertAccessTo(id);
        return companyRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Company not found: " + id));
    }

    @Transactional(readOnly = true)
    public Company getCompanyBySubdomain(String subdomain) {
        return companyRepository.findBySubdomain(subdomain)
                .orElseThrow(() -> new RuntimeException("Company not found for subdomain: " + subdomain));
    }

    @Transactional(readOnly = true)
    public List<Department> getDepartments(Long companyId) {
        TenantContext.assertAccessTo(companyId);
        return departmentRepository.findByCompanyIdAndIsActiveTrue(companyId);
    }

    @Transactional(readOnly = true)
    public List<User> getAgents(Long companyId) {
        TenantContext.assertAccessTo(companyId);
        return userRepository.findByCompanyIdAndIsActiveTrue(companyId);
    }

    @Transactional(readOnly = true)
    public List<KbArticleDto> getKbArticles(Long companyId) {
        TenantContext.assertAccessTo(companyId);
        String sql = "SELECT a.id, a.category_id, c.name as category_name, a.title, a.slug, a.content_html, a.view_count, a.helpful_votes " +
                     "FROM kb_articles a " +
                     "JOIN kb_categories c ON a.category_id = c.id AND c.company_id = a.company_id " +
                     "WHERE a.company_id = ? AND a.status = 'PUBLISHED' " +
                     "ORDER BY c.display_order ASC, a.title ASC";
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            KbArticleDto dto = new KbArticleDto();
            dto.setId(rs.getLong("id"));
            dto.setCategoryId(rs.getLong("category_id"));
            dto.setCategoryName(rs.getString("category_name"));
            dto.setTitle(rs.getString("title"));
            dto.setSlug(rs.getString("slug"));
            dto.setContentHtml(rs.getString("content_html"));
            dto.setViewCount(rs.getInt("view_count"));
            dto.setHelpfulVotes(rs.getInt("helpful_votes"));
            return dto;
        }, companyId);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getKbCategories(Long companyId) {
        TenantContext.assertAccessTo(companyId);
        String sql = "SELECT id, name, slug, description, display_order FROM kb_categories WHERE company_id = ? ORDER BY display_order ASC";
        return jdbcTemplate.queryForList(sql, companyId);
    }

    @Transactional
    public KbArticleDto createKbArticle(Long companyId, SaveKbArticleRequest req) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        Long catId = req.getCategoryId();
        if (catId == null) {
            catId = jdbcTemplate.queryForList(
                    "SELECT id FROM kb_categories WHERE company_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
                    Long.class, companyId).stream().findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("A category in this workspace is required."));
        }
        validateTenantReferences(companyId, Map.of("categoryId", catId));
        Long authorId = TenantContext.requireUserId();
        String catName = jdbcTemplate.queryForObject(
                "SELECT name FROM kb_categories WHERE id = ? AND company_id = ?", String.class, catId, companyId);
        String slug = req.getSlug();
        if (slug == null || slug.isBlank()) {
            slug = req.getTitle().toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        }
        String status = req.getStatus() != null ? req.getStatus() : "PUBLISHED";

        jdbcTemplate.update(
            "INSERT INTO kb_articles (company_id, category_id, author_id, title, slug, content_html, status, view_count, helpful_votes, unhelpful_votes, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NOW(), NOW())",
            companyId, catId, authorId, req.getTitle(), slug, req.getContentHtml(), status
        );
        Long id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        
        KbArticleDto dto = new KbArticleDto();
        dto.setId(id);
        dto.setCategoryId(catId);
        dto.setCategoryName(catName != null ? catName : "General");
        dto.setTitle(req.getTitle());
        dto.setSlug(slug);
        dto.setContentHtml(req.getContentHtml());
        dto.setViewCount(0);
        dto.setHelpfulVotes(0);
        return dto;
    }

    @Transactional(readOnly = true)
    public List<CustomerContactDto> getCustomers(Long companyId) {
        TenantContext.assertAccessTo(companyId);
        String sql = "SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.created_at, " +
                     "       a.id as account_id, a.account_name, " +
                     "       COUNT(t.id) as total_tickets, " +
                     "       SUM(CASE WHEN t.status IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER') THEN 1 ELSE 0 END) as open_tickets " +
                     "FROM contacts c " +
                     "LEFT JOIN customer_accounts a ON c.account_id = a.id AND a.company_id = c.company_id " +
                     "LEFT JOIN tickets t ON t.contact_id = c.id AND t.company_id = c.company_id " +
                     "WHERE c.company_id = ? " +
                     "GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, c.created_at, a.id, a.account_name " +
                     "ORDER BY c.id DESC";
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            CustomerContactDto dto = new CustomerContactDto();
            dto.setId(rs.getLong("id"));
            dto.setFirstName(rs.getString("first_name"));
            dto.setLastName(rs.getString("last_name"));
            String first = dto.getFirstName() != null ? dto.getFirstName() : "";
            String last = dto.getLastName() != null ? dto.getLastName() : "";
            dto.setDisplayName((first + " " + last).trim());
            dto.setEmail(rs.getString("email"));
            dto.setPhone(rs.getString("phone"));
            dto.setAccountId(rs.getObject("account_id") != null ? rs.getLong("account_id") : null);
            dto.setOrganization(rs.getString("account_name") != null ? rs.getString("account_name") : "Individual Customer");
            dto.setTotalTickets(rs.getInt("total_tickets"));
            dto.setOpenTickets(rs.getInt("open_tickets"));
            dto.setCreatedAt(rs.getString("created_at"));
            return dto;
        }, companyId);
    }

    @Transactional
    public CustomerContactDto createCustomer(Long companyId, CustomerContactDto req) {
        TenantContext.assertAccessTo(companyId);
        Long accountId = req.getAccountId();
        if (accountId != null) {
            validateTenantReferences(companyId, Map.of("accountId", accountId));
        }
        if (accountId == null && req.getOrganization() != null && !req.getOrganization().isBlank()) {
            List<Long> accIds = jdbcTemplate.query(
                "SELECT id FROM customer_accounts WHERE company_id = ? AND account_name = ?",
                (rs, rowNum) -> rs.getLong("id"), companyId, req.getOrganization().trim()
            );
            if (!accIds.isEmpty()) {
                accountId = accIds.get(0);
            } else {
                jdbcTemplate.update(
                    "INSERT INTO customer_accounts (company_id, account_name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
                    companyId, req.getOrganization().trim()
                );
                accountId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
            }
        }

        jdbcTemplate.update(
            "INSERT INTO contacts (company_id, account_id, first_name, last_name, email, phone, is_portal_user, is_active, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW())",
            companyId, accountId, req.getFirstName(), req.getLastName(), req.getEmail().trim(), req.getPhone()
        );
        Long contactId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        req.setId(contactId);
        return req;
    }

    @Transactional(readOnly = true)
    public List<Notification> getNotifications(Long companyId, Long userId) {
        TenantContext.assertAccessTo(companyId);
        Long recipientId = TenantContext.requireUserId();
        if (userId != null && !recipientId.equals(userId)) {
            throw new SecurityException("Notifications belong to the current recipient only.");
        }
        return notificationRepository.findByCompanyIdAndUserIdOrderByCreatedAtDesc(companyId, recipientId);
    }

    @Transactional
    public void markNotificationRead(Long companyId, Long id) {
        TenantContext.assertAccessTo(companyId);
        Long recipientId = TenantContext.requireUserId();
        Notification notification = notificationRepository.findById(id)
                .filter(n -> companyId.equals(n.getCompanyId()) && recipientId.equals(n.getUserId()))
                .orElseThrow(() -> new SecurityException("Notification not found for the current recipient."));
        notification.setIsRead(true);
        notificationRepository.save(notification);
    }

    @Transactional
    public void markAllNotificationsRead(Long companyId) {
        TenantContext.assertAccessTo(companyId);
        jdbcTemplate.update("UPDATE notifications SET is_read = 1 WHERE company_id = ? AND user_id = ?",
                companyId, TenantContext.requireUserId());
    }

    // =========================================================================
    // SECTION E: ADMIN SETTINGS METHODS (SCREENS 25 TO 39)
    // =========================================================================

    @Transactional(readOnly = true)
    public Map<String, Object> getCompanySettings(Long companyId) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        Company company = getCompanyById(companyId);
        Map<String, Object> settings = new HashMap<>();

        if (company.getSettingsJson() != null && !company.getSettingsJson().isBlank()) {
            try {
                settings = objectMapper.readValue(company.getSettingsJson(), new TypeReference<Map<String, Object>>() {});
            } catch (Exception e) {
                log.warn("Could not parse settingsJson for company {}: {}", companyId, e.getMessage());
            }
        }

        // Merge defaults for all 15 screens
        ensureSettingsDefaults(company, settings);
        return settings;
    }

    @Transactional
    public Map<String, Object> updateCompanySettings(Long companyId, Map<String, Object> payload) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        Company company = getCompanyById(companyId);

        // Sync top-level branding/profile fields if provided
        if (payload.containsKey("branding")) {
            @SuppressWarnings("unchecked")
            Map<String, Object> branding = (Map<String, Object>) payload.get("branding");
            if (branding.get("name") != null) company.setName(String.valueOf(branding.get("name")));
            if (branding.get("primaryColor") != null) company.setPrimaryColor(String.valueOf(branding.get("primaryColor")));
            if (branding.get("accentColor") != null) company.setAccentColor(String.valueOf(branding.get("accentColor")));
            if (branding.get("customDomain") != null) company.setCustomDomain(String.valueOf(branding.get("customDomain")));
            if (branding.get("logoUrl") != null) company.setLogoUrl(String.valueOf(branding.get("logoUrl")));
            if (branding.get("timezone") != null) company.setTimezone(String.valueOf(branding.get("timezone")));
            if (branding.get("defaultLanguage") != null) company.setDefaultLanguage(String.valueOf(branding.get("defaultLanguage")));
            if (branding.get("supportEmail") != null) company.setSupportEmail(String.valueOf(branding.get("supportEmail")));
            if (branding.get("supportPhone") != null) company.setSupportPhone(String.valueOf(branding.get("supportPhone")));
            if (branding.get("supportAddress") != null) company.setSupportAddress(String.valueOf(branding.get("supportAddress")));
            if (branding.get("legalName") != null) company.setLegalName(String.valueOf(branding.get("legalName")));
            if (branding.get("businessHoursText") != null) company.setBusinessHoursText(String.valueOf(branding.get("businessHoursText")));
            if (branding.get("portalName") != null) company.setPortalName(String.valueOf(branding.get("portalName")));
            if (branding.get("portalWelcomeMessage") != null) company.setPortalWelcomeMessage(String.valueOf(branding.get("portalWelcomeMessage")));
            if (branding.get("poweredByBadge") != null) company.setPoweredByBadge(Boolean.valueOf(String.valueOf(branding.get("poweredByBadge"))));
            if (branding.get("customDomainStatus") != null) company.setCustomDomainStatus(String.valueOf(branding.get("customDomainStatus")));
        }

        try {
            String json = objectMapper.writeValueAsString(payload);
            company.setSettingsJson(json);
        } catch (Exception e) {
            log.error("Failed to serialize settings payload for company {}: {}", companyId, e.getMessage());
        }

        companyRepository.save(company);

        // Record audit log
        recordAuditLog(companyId, "SETTINGS_UPDATED", "Administrative settings configuration saved for workspace", null, null);

        return getCompanySettings(companyId);
    }

    @Transactional
    public SecurityAuditLog recordAuditLog(Long companyId, String action, String details, String ipAddress, String userAgent) {
        TenantContext.assertAccessTo(companyId);
        SecurityAuditLog logEntry = new SecurityAuditLog();
        logEntry.setCompanyId(companyId);
        logEntry.setUserId(TenantContext.requireUserId());
        logEntry.setAction(action);
        logEntry.setEmail(TenantContext.getUserEmail());
        logEntry.setIpAddress(ipAddress);
        logEntry.setUserAgent(userAgent);
        logEntry.setDetails(details);
        return securityAuditLogRepository.save(logEntry);
    }

    @Transactional(readOnly = true)
    public List<SecurityAuditLog> getAuditLogs(Long companyId) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        return securityAuditLogRepository.findTop50ByCompanyIdOrderByCreatedAtDesc(companyId);
    }

    @Transactional(readOnly = true)
    public List<CompanyMailbox> getCompanyMailboxes(Long companyId) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        return companyMailboxRepository.findByCompanyId(companyId);
    }

    @Transactional
    public CompanyMailbox saveCompanyMailbox(Long companyId, Map<String, Object> payload) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        Company company = getCompanyById(companyId);
        Long id = payload.get("id") != null ? Long.valueOf(String.valueOf(payload.get("id"))) : null;

        CompanyMailbox mailbox;
        if (id != null) {
            mailbox = companyMailboxRepository.findById(id)
                    .filter(m -> m.getCompany() != null && companyId.equals(m.getCompany().getId()))
                    .orElseThrow(() -> new SecurityException("Mailbox not found in this workspace."));
        } else {
            mailbox = new CompanyMailbox();
            mailbox.setCompany(company);
        }

        validateTenantReferences(companyId, payload);
        Long departmentId = departmentIdFrom(payload);
        Department department = departmentId != null ? requireDepartment(companyId, departmentId) : mailbox.getDepartment();
        if (department == null) {
            department = departmentRepository.findByCompanyIdAndIsActiveTrue(companyId).stream().findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("A department in this workspace is required."));
        }
        if (department.getCompany() == null || !companyId.equals(department.getCompany().getId())) {
            throw new SecurityException("Department not found in this workspace.");
        }

        String previousEmail = mailbox.getEmailAddress();
        CompanyMailbox.MailProviderType previousProvider = mailbox.getProviderType();
        mailbox.setMailboxName(String.valueOf(payload.getOrDefault("mailboxName", company.getName() + " Support")));
        mailbox.setEmailAddress(String.valueOf(payload.getOrDefault("emailAddress",
                previousEmail != null ? previousEmail : "support@" + company.getSubdomain() + ".com")));
        mailbox.setSendAsName(String.valueOf(payload.getOrDefault("sendAsName", company.getName() + " Support")));

        String prov = String.valueOf(payload.getOrDefault("providerType",
                id != null && previousProvider != null ? previousProvider.name() : "FORWARDING"));
        if (prov.contains("MICROSOFT")) {
            mailbox.setProviderType(CompanyMailbox.MailProviderType.MICROSOFT_365);
            mailbox.setAuthType(CompanyMailbox.AuthType.OAUTH2_GRAPH_API);
        } else if (prov.contains("GOOGLE")) {
            mailbox.setProviderType(CompanyMailbox.MailProviderType.GOOGLE_WORKSPACE);
            mailbox.setAuthType(CompanyMailbox.AuthType.OAUTH2_IMAP);
        } else {
            mailbox.setProviderType(CompanyMailbox.MailProviderType.FORWARDING);
            mailbox.setAuthType(CompanyMailbox.AuthType.FORWARD_ONLY);
            if (mailbox.getForwardingAddress() == null) {
                mailbox.setForwardingAddress("in-" + company.getSubdomain() + "-" + UUID.randomUUID().toString().substring(0, 8) + "@in.yourhelpdesk.com");
            }
        }

        if (id == null || !Objects.equals(previousEmail, mailbox.getEmailAddress())
                || previousProvider != mailbox.getProviderType()) {
            mailbox.setSyncStatus(CompanyMailbox.SyncStatus.PAUSED);
            mailbox.setForwardingVerified(false);
            mailbox.setLastSyncedAt(null);
            mailbox.setSyncErrorDetails("Configuration saved; mailbox connection has not been verified.");
        }
        mailbox.setIsActive(true);
        mailbox.setDepartment(department);

        CompanyMailbox saved = companyMailboxRepository.save(mailbox);
        recordAuditLog(companyId, "MAILBOX_CONFIGURED", "Saved configuration for support mailbox " + saved.getEmailAddress(), null, null);
        return saved;
    }

    @Transactional
    public void deleteCompanyMailbox(Long companyId, Long mailboxId) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        CompanyMailbox mailbox = companyMailboxRepository.findById(mailboxId)
                .filter(m -> m.getCompany() != null && companyId.equals(m.getCompany().getId()))
                .orElseThrow(() -> new SecurityException("Mailbox not found in this workspace."));
        companyMailboxRepository.delete(mailbox);
        recordAuditLog(companyId, "MAILBOX_REMOVED", "Removed support mailbox ID #" + mailboxId, null, null);
    }

    @Transactional(readOnly = true)
    public List<CannedResponse> getCannedResponses(Long companyId) {
        TenantContext.assertAccessTo(companyId);
        Long actorId = TenantContext.requireUserId();
        boolean admin = TenantContext.isSuperAdmin() || Role.RoleType.COMPANY_ADMIN.name().equals(TenantContext.getUserRole());
        return cannedResponseRepository.findByCompanyIdOrderByTitleAsc(companyId).stream()
                .filter(c -> admin || Boolean.TRUE.equals(c.getIsShared()) || actorId.equals(c.getCreatedByUserId()))
                .toList();
    }

    @Transactional
    public CannedResponse saveCannedResponse(Long companyId, Map<String, Object> payload) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        Company company = getCompanyById(companyId);
        Long id = payload.get("id") != null ? Long.valueOf(String.valueOf(payload.get("id"))) : null;

        CannedResponse cr;
        if (id != null) {
            cr = cannedResponseRepository.findById(id)
                    .filter(c -> c.getCompany() != null && companyId.equals(c.getCompany().getId()))
                    .orElseThrow(() -> new SecurityException("Canned response not found in this workspace."));
        } else {
            cr = new CannedResponse();
            cr.setCompany(company);
        }

        validateTenantReferences(companyId, payload);
        Department department = cr.getDepartment();
        if (payload.containsKey("departmentId") || payload.containsKey("department")) {
            if (payload.get("department") != null && !(payload.get("department") instanceof Map<?, ?>)) {
                throw new IllegalArgumentException("Department must be an object containing its ID.");
            }
            Long departmentId = departmentIdFrom(payload);
            department = departmentId != null ? requireDepartment(companyId, departmentId) : null;
        }
        if (department != null && (department.getCompany() == null || !companyId.equals(department.getCompany().getId()))) {
            throw new SecurityException("Department not found in this workspace.");
        }
        String shared = String.valueOf(payload.getOrDefault("isShared", Boolean.TRUE.equals(cr.getIsShared())));
        if (!"true".equalsIgnoreCase(shared) && !"false".equalsIgnoreCase(shared)) {
            throw new IllegalArgumentException("isShared must be true or false.");
        }
        cr.setTitle(String.valueOf(payload.getOrDefault("title", id != null ? cr.getTitle() : "Quick Response")));
        cr.setShortcut(String.valueOf(payload.getOrDefault("shortcut", id != null ? cr.getShortcut() : "/quick")));
        cr.setContent(String.valueOf(payload.getOrDefault("content", id != null ? cr.getContent() : "")));
        cr.setIsShared(Boolean.valueOf(shared));
        cr.setDepartment(department);
        if (id == null) cr.setCreatedByUserId(TenantContext.requireUserId());

        CannedResponse saved = cannedResponseRepository.save(cr);
        recordAuditLog(companyId, "CANNED_RESPONSE_SAVED", "Saved canned response shortcut " + saved.getShortcut(), null, null);
        return saved;
    }

    @Transactional
    public void deleteCannedResponse(Long companyId, Long responseId) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        CannedResponse response = cannedResponseRepository.findById(responseId)
                .filter(c -> c.getCompany() != null && companyId.equals(c.getCompany().getId()))
                .orElseThrow(() -> new SecurityException("Canned response not found in this workspace."));
        cannedResponseRepository.delete(response);
        recordAuditLog(companyId, "CANNED_RESPONSE_DELETED", "Deleted canned response " + response.getShortcut(), null, null);
    }

    @Transactional(readOnly = true)
    public List<AutomationRule> getAutomationRules(Long companyId) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        return automationRuleRepository.findByCompanyIdOrderByPriorityOrderAsc(companyId);
    }

    @Transactional
    public AutomationRule saveAutomationRule(Long companyId, Map<String, Object> payload) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        Company company = getCompanyById(companyId);
        Long id = payload.get("id") != null ? Long.valueOf(String.valueOf(payload.get("id"))) : null;

        AutomationRule rule;
        if (id != null) {
            rule = automationRuleRepository.findById(id)
                    .filter(r -> r.getCompany() != null && companyId.equals(r.getCompany().getId()))
                    .orElseThrow(() -> new SecurityException("Automation rule not found in this workspace."));
        } else {
            rule = new AutomationRule();
            rule.setCompany(company);
        }

        if (payload.get("companyId") != null) {
            validateTenantReferences(companyId, Map.of("companyId", payload.get("companyId")));
        }
        if (payload.get("company") instanceof Map<?, ?> owner && owner.get("id") != null) {
            validateTenantReferences(companyId, Map.of("companyId", owner.get("id")));
        }
        String conditionJson = validatedRuleJson(companyId,
                payload.getOrDefault("conditionJson", id != null ? rule.getConditionJson() : null), true);
        String actionJson = validatedRuleJson(companyId,
                payload.getOrDefault("actionJson", id != null ? rule.getActionJson() : null), false);
        AutomationRule.EventTrigger trigger = AutomationRule.EventTrigger.valueOf(String.valueOf(
                payload.getOrDefault("eventTrigger", id != null ? rule.getEventTrigger() : AutomationRule.EventTrigger.TICKET_CREATED)));
        String active = String.valueOf(payload.getOrDefault("isActive", id == null || Boolean.TRUE.equals(rule.getIsActive())));
        if (!"true".equalsIgnoreCase(active) && !"false".equalsIgnoreCase(active)) {
            throw new IllegalArgumentException("isActive must be true or false.");
        }
        int order = Integer.parseInt(String.valueOf(payload.getOrDefault("priorityOrder",
                id != null ? String.valueOf(rule.getPriorityOrder()) : "10")));
        if (order < 0 || order > 10_000) throw new IllegalArgumentException("Rule order must be between 0 and 10000.");

        rule.setName(String.valueOf(payload.getOrDefault("name", id != null ? rule.getName() : "Custom Workflow Rule")));
        rule.setEventTrigger(trigger);
        rule.setConditionJson(conditionJson);
        rule.setActionJson(actionJson);
        rule.setIsActive(Boolean.valueOf(active));
        rule.setPriorityOrder(order);

        AutomationRule saved = automationRuleRepository.save(rule);
        recordAuditLog(companyId, "AUTOMATION_RULE_SAVED", "Saved automation routing rule " + saved.getName(), null, null);
        return saved;
    }

    @Transactional
    public boolean reauthenticate(Long companyId, Long userId, String password) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        Long actorId = TenantContext.requireUserId();
        if (userId != null && !actorId.equals(userId)) return false;
        if (password == null || password.isBlank()) return false;
        User actor = userRepository.findById(actorId).orElse(null);
        if (actor == null || !Boolean.TRUE.equals(actor.getIsActive()) || !"ACTIVE".equalsIgnoreCase(actor.getStatus())
                || actor.getRole() == null || actor.getRole().getRoleType() == null || actor.getPasswordHash() == null
                || !actor.getRole().getRoleType().name().equals(TenantContext.getUserRole())
                || actor.getEmail() == null || !actor.getEmail().equalsIgnoreCase(TenantContext.getUserEmail())) {
            return false;
        }
        if (!TenantContext.isSuperAdmin()
                && (actor.getCompany() == null || !companyId.equals(actor.getCompany().getId()))) return false;
        boolean ok;
        try {
            ok = passwordEncoder.matches(password, actor.getPasswordHash());
        } catch (IllegalArgumentException invalidHash) {
            return false;
        }
        if (ok) {
            recordAuditLog(companyId, "REAUTH_VERIFIED", "Current administrator password verified", null, null);
        }
        return ok;
    }

    @Transactional
    public Map<String, Object> exportWorkspaceData(Long companyId) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        Company company = getCompanyById(companyId);
        Map<String, Object> export = new HashMap<>();
        export.put("companyId", company.getId());
        export.put("companyName", company.getName());
        export.put("subdomain", company.getSubdomain());
        export.put("exportedAt", LocalDateTime.now().toString());
        export.put("settings", getCompanySettings(companyId));
        export.put("customersCount", getCustomers(companyId).size());
        export.put("cannedResponsesCount", getCannedResponses(companyId).size());
        export.put("automationRulesCount", getAutomationRules(companyId).size());
        export.put("recentAuditLogs", getAuditLogs(companyId));
        export.put("complianceChecksum", UUID.randomUUID().toString());

        recordAuditLog(companyId, "DATA_EXPORT_GENERATED", "Workspace summary export generated by administrator", null, null);
        return export;
    }

    private Department requireDepartment(Long companyId, Long departmentId) {
        return departmentRepository.findById(departmentId)
                .filter(d -> d.getCompany() != null && companyId.equals(d.getCompany().getId()))
                .orElseThrow(() -> new SecurityException("Department not found in this workspace."));
    }

    private Long departmentIdFrom(Map<String, Object> payload) {
        Object value = payload.get("departmentId");
        if (value == null && payload.get("department") instanceof Map<?, ?> department) {
            value = department.get("id");
        }
        return value != null ? Long.valueOf(String.valueOf(value)) : null;
    }

    private void validateTenantReferences(Long companyId, Object value) {
        if (value instanceof Map<?, ?> fields) {
            for (Map.Entry<?, ?> field : fields.entrySet()) {
                String key = String.valueOf(field.getKey()).replace("_", "").toLowerCase(Locale.ROOT);
                Object reference = field.getValue();
                if (Set.of("department", "category", "account", "company").contains(key)
                        && reference instanceof Map<?, ?> nested) {
                    reference = nested.get("id");
                    key += "id";
                }
                if (reference != null && Set.of("departmentid", "categoryid", "accountid", "companyid").contains(key)) {
                    Long referenceId = Long.valueOf(String.valueOf(reference));
                    if ("departmentid".equals(key)) {
                        requireDepartment(companyId, referenceId);
                    } else if ("companyid".equals(key)) {
                        if (!companyId.equals(referenceId)) {
                            throw new SecurityException("Company reference does not match this workspace.");
                        }
                    } else {
                        String table = "categoryid".equals(key) ? "kb_categories" : "customer_accounts";
                        Long count = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM " + table + " WHERE id = ? AND company_id = ?",
                                Long.class, referenceId, companyId);
                        if (!Long.valueOf(1).equals(count)) {
                            throw new SecurityException("Referenced resource not found in this workspace.");
                        }
                    }
                }
                validateTenantReferences(companyId, field.getValue());
            }
        } else if (value instanceof Collection<?> values) {
            values.forEach(item -> validateTenantReferences(companyId, item));
        }
    }

    private String validatedRuleJson(Long companyId, Object value, boolean condition) {
        try {
            if (value instanceof String json && (json.length() > 16_384
                    || json.getBytes(StandardCharsets.UTF_8).length > 16_384)) {
                throw new IllegalArgumentException("Rule JSON cannot exceed 16 KiB.");
            }
            Object parsed = value instanceof String json ? objectMapper.readerFor(Object.class)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .with(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readValue(json) : value;
            validateRuleNode(companyId, parsed, condition, 0, new int[] {100});
            String json = value instanceof String text ? text : objectMapper.writeValueAsString(parsed);
            if (json.getBytes(StandardCharsets.UTF_8).length > 16_384) {
                throw new IllegalArgumentException("Rule JSON cannot exceed 16 KiB.");
            }
            validateTenantReferences(companyId, parsed);
            return json;
        } catch (JsonProcessingException invalidJson) {
            throw new IllegalArgumentException("Rule configuration must contain valid JSON.", invalidJson);
        }
    }

    private void validateRuleNode(Long companyId, Object node, boolean condition, int depth, int[] remaining) {
        if (depth > 8 || --remaining[0] < 0) {
            throw new IllegalArgumentException("Rule JSON exceeds the depth or 100-node limit.");
        }
        if (node instanceof Collection<?> clauses) {
            if (clauses.isEmpty() || clauses.size() > 100) {
                throw new IllegalArgumentException("Rule lists must contain between 1 and 100 clauses.");
            }
            for (Object clause : clauses) validateRuleNode(companyId, clause, condition, depth + 1, remaining);
            return;
        }
        if (!(node instanceof Map<?, ?> fields) || fields.isEmpty()) {
            throw new IllegalArgumentException("A nonempty rule object is required.");
        }
        String group = condition ? (fields.containsKey("all") ? "all" : fields.containsKey("any") ? "any" : "conditions") : "actions";
        if (fields.containsKey(group)) {
            if (fields.size() != 1 || !(fields.get(group) instanceof Collection<?>)) {
                throw new IllegalArgumentException("A rule group must contain only its clause list.");
            }
            validateRuleNode(companyId, fields.get(group), condition, depth + 1, remaining);
            return;
        }
        if (condition) {
            if (!Set.of("field", "operator", "value", "hours").containsAll(fields.keySet())
                    || !(fields.get("field") instanceof String field)
                    || !(fields.get("operator") instanceof String operator)
                    || !Set.of("equals", "not_equals", "contains", "not_contains", "greater_than", "less_than").contains(operator)) {
                throw new IllegalArgumentException("Invalid rule condition fields or operator.");
            }
            Object value = fields.get("value");
            if (!(value instanceof String text && !text.isBlank() && text.length() <= 2048)
                    && !(value instanceof Number number && Double.isFinite(number.doubleValue()))) {
                throw new IllegalArgumentException("A bounded scalar condition value is required.");
            }
            String key = field.replace("_", "").toLowerCase(Locale.ROOT);
            boolean equality = Set.of("equals", "not_equals").contains(operator);
            if (Set.of("departmentid", "categoryid", "accountid", "companyid").contains(key)) {
                if (!equality || Long.parseLong(String.valueOf(value)) <= 0) {
                    throw new IllegalArgumentException("Reference conditions require a positive ID and equality operator.");
                }
                validateTenantReferences(companyId, Map.of(field, value));
            } else if ("subject".equals(key)) {
                if (!(value instanceof String) || !(equality || operator.equals("contains") || operator.equals("not_contains"))) {
                    throw new IllegalArgumentException("Subject conditions require text comparisons.");
                }
            } else if ("slathreshold".equals(key)) {
                if (!(value instanceof Number number) || number.doubleValue() < 0 || number.doubleValue() > 100
                        || !(equality || operator.equals("greater_than") || operator.equals("less_than"))) {
                    throw new IllegalArgumentException("SLA threshold conditions require a percentage comparison.");
                }
            } else {
                if (!equality || !(value instanceof String text)) {
                    throw new IllegalArgumentException("State conditions require a named value and equality operator.");
                }
                switch (key) {
                    case "status" -> Ticket.TicketStatus.valueOf(text);
                    case "priority" -> Ticket.TicketPriority.valueOf(text);
                    case "channel" -> Ticket.TicketChannel.valueOf(text);
                    default -> throw new IllegalArgumentException("Unsupported condition field.");
                }
            }
            if (fields.containsKey("hours")) {
                long hours = Long.parseLong(String.valueOf(fields.get("hours")));
                if (hours < 1 || hours > 8760) throw new IllegalArgumentException("Condition hours must be between 1 and 8760.");
            }
        } else {
            if (!(fields.get("action") instanceof String action)) {
                throw new IllegalArgumentException("A named rule action is required.");
            }
            switch (action) {
                case "assign_team" -> {
                    if (!Set.of("action", "team", "departmentId", "department_id", "department", "priority").containsAll(fields.keySet())
                            || fields.keySet().stream().filter(k -> !k.equals("action") && !k.equals("priority")).count() != 1) {
                        throw new IllegalArgumentException("Team assignment requires exactly one department reference.");
                    }
                    if (fields.containsKey("team")) {
                        if (!(fields.get("team") instanceof String team) || team.isBlank() || team.length() > 150) {
                            throw new IllegalArgumentException("A bounded department name is required.");
                        }
                        boolean found = departmentRepository.findByCompanyId(companyId).stream()
                                .anyMatch(d -> d.getCompany() != null && companyId.equals(d.getCompany().getId())
                                        && d.getName() != null && d.getName().equalsIgnoreCase(team.trim()));
                        if (!found) throw new SecurityException("Department not found in this workspace.");
                    } else {
                        Object target = fields.containsKey("department") ? fields.get("department")
                                : fields.containsKey("departmentId") ? fields.get("departmentId") : fields.get("department_id");
                        if (fields.containsKey("department")) {
                            if (!(target instanceof Map<?, ?> department) || !Set.of("id").equals(department.keySet())) {
                                throw new IllegalArgumentException("Department must contain only its ID.");
                            }
                            target = department.get("id");
                        }
                        if (Long.parseLong(String.valueOf(target)) <= 0) {
                            throw new IllegalArgumentException("A positive department ID is required.");
                        }
                    }
                    if (fields.containsKey("priority")) Ticket.TicketPriority.valueOf(String.valueOf(fields.get("priority")));
                }
                case "set_status" -> {
                    if (!Set.of("action", "status").equals(fields.keySet())) {
                        throw new IllegalArgumentException("A status action requires only a status value.");
                    }
                    Ticket.TicketStatus.valueOf(String.valueOf(fields.get("status")));
                }
                case "set_priority" -> {
                    if (!Set.of("action", "priority").equals(fields.keySet())) {
                        throw new IllegalArgumentException("A priority action requires only a priority value.");
                    }
                    Ticket.TicketPriority.valueOf(String.valueOf(fields.get("priority")));
                }
                case "notify_manager" -> {
                    if (!Set.of("action", "channel").equals(fields.keySet())
                            || !Set.of("email", "slack", "email_and_slack").contains(String.valueOf(fields.get("channel")))) {
                        throw new IllegalArgumentException("A manager notification requires a supported channel.");
                    }
                }
                default -> throw new IllegalArgumentException("Unsupported rule action.");
            }
        }
    }

    private void ensureSettingsDefaults(Company comp, Map<String, Object> s) {
        // 1. Branding & Profile
        if (!s.containsKey("branding")) {
            Map<String, Object> b = new HashMap<>();
            b.put("name", comp.getName());
            b.put("legalName", comp.getLegalName() != null ? comp.getLegalName() : comp.getName() + " Private Limited");
            b.put("supportEmail", comp.getSupportEmail() != null ? comp.getSupportEmail() : "support@" + comp.getSubdomain() + ".com");
            b.put("supportPhone", comp.getSupportPhone() != null ? comp.getSupportPhone() : "+91 44 6789 0123");
            b.put("supportAddress", comp.getSupportAddress() != null ? comp.getSupportAddress() : "Level 4, Cyber Park, OMR Tech Corridor, Chennai, India");
            b.put("website", "https://" + comp.getSubdomain() + ".in");
            b.put("industry", "Financial Technology & Software");
            b.put("businessHoursText", comp.getBusinessHoursText() != null ? comp.getBusinessHoursText() : "Mon - Fri, 9:00 AM - 6:00 PM IST");
            b.put("timezone", comp.getTimezone() != null ? comp.getTimezone() : "Asia/Kolkata");
            b.put("defaultLanguage", comp.getDefaultLanguage() != null ? comp.getDefaultLanguage() : "en");
            b.put("logoUrl", comp.getLogoUrl() != null ? comp.getLogoUrl() : "");
            b.put("primaryColor", comp.getPrimaryColor() != null ? comp.getPrimaryColor() : "#0d6efd");
            b.put("accentColor", comp.getAccentColor() != null ? comp.getAccentColor() : "#6366f1");
            b.put("portalName", comp.getPortalName() != null ? comp.getPortalName() : comp.getName() + " Support Center");
            b.put("portalWelcomeMessage", comp.getPortalWelcomeMessage() != null ? comp.getPortalWelcomeMessage() : "Welcome to our customer helpdesk. Search our solution library or submit a support ticket below.");
            b.put("poweredByBadge", comp.getPoweredByBadge() != null ? comp.getPoweredByBadge() : true);
            b.put("customDomain", comp.getCustomDomain() != null ? comp.getCustomDomain() : "support." + comp.getSubdomain() + ".com");
            b.put("customDomainStatus", comp.getCustomDomainStatus() != null ? comp.getCustomDomainStatus() : "ACTIVE");
            b.put("cnameRecord", "portal.yourhelpdesk.com");
            b.put("txtRecord", "v=kuwy-verification-" + comp.getSubdomain() + "-87x2");
            s.put("branding", b);
        }

        // 2. SLA & Auto-assignment
        if (!s.containsKey("sla")) {
            Map<String, Object> sla = new HashMap<>();
            sla.put("autoAssignEnabled", true);
            sla.put("autoCloseHours", 48);
            sla.put("urgentTurnaroundHours", 2);
            sla.put("highTurnaroundHours", 6);
            sla.put("mediumTurnaroundHours", 24);
            sla.put("lowTurnaroundHours", 48);
            sla.put("pauseOnHold", true);
            sla.put("reminder75", true);
            sla.put("reminder90", true);
            s.put("sla", sla);
        }

        // 3. CSAT Satisfaction
        if (!s.containsKey("csat")) {
            Map<String, Object> csat = new HashMap<>();
            csat.put("enabled", true);
            csat.put("surveyType", "STARS_5");
            csat.put("sendTimingHours", 24);
            csat.put("questionText", "How satisfied were you with the support provided by our engineering team?");
            csat.put("lowScoreFollowup", "What could we have done better to resolve your request?");
            s.put("csat", csat);
        }

        // 4. Security & Access
        if (!s.containsKey("security")) {
            Map<String, Object> sec = new HashMap<>();
            sec.put("twoFactorPolicy", "REQUIRED_ADMINS");
            sec.put("sessionTimeoutMinutes", 60);
            sec.put("ipAllowlist", "");
            sec.put("portalSecurityMode", "VERIFIED_EMAIL");
            sec.put("dataRetentionDays", 365);
            s.put("security", sec);
        }

        // 5. Billing & Subscription Meters
        if (!s.containsKey("billing")) {
            Map<String, Object> bil = new HashMap<>();
            bil.put("planTier", comp.getPlanName() != null ? comp.getPlanName() : "ENTERPRISE");
            bil.put("maxAgents", comp.getMaxAgents() != null ? comp.getMaxAgents() : 50);
            bil.put("agentsUsed", userRepository.countByCompanyId(comp.getId()));
            bil.put("ticketsAllowedMonthly", 10000);
            bil.put("billingCycle", "ANNUAL");
            bil.put("renewalDate", "2027-11-03");
            bil.put("status", "ACTIVE");
            s.put("billing", bil);
        }
    }
}
