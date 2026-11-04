package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.dto.CustomerContactDto;
import com.kuwy.helpdesk.dto.SaveKbArticleRequest;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CompanyAuthorizationTest {
    private static final String VALID_CONDITION = "{\"field\":\"status\",\"operator\":\"equals\",\"value\":\"OPEN\"}";
    private static final String VALID_ACTION = "{\"action\":\"set_status\",\"status\":\"CLOSED\"}";
    private CompanyRepository companies;
    private DepartmentRepository departments;
    private UserRepository users;
    private NotificationRepository notifications;
    private SecurityAuditLogRepository audits;
    private CompanyMailboxRepository mailboxes;
    private CannedResponseRepository canned;
    private AutomationRuleRepository rules;
    private PasswordEncoder passwords;
    private JdbcTemplate jdbc;
    private CompanyService service;
    private Company company;

    @BeforeEach
    void setUp() {
        TenantContext.clear();
        companies = mock(CompanyRepository.class);
        departments = mock(DepartmentRepository.class);
        users = mock(UserRepository.class);
        notifications = mock(NotificationRepository.class);
        audits = mock(SecurityAuditLogRepository.class);
        mailboxes = mock(CompanyMailboxRepository.class);
        canned = mock(CannedResponseRepository.class);
        rules = mock(AutomationRuleRepository.class);
        passwords = mock(PasswordEncoder.class);
        jdbc = mock(JdbcTemplate.class);
        service = new CompanyService(companies, departments, users, notifications, audits, mailboxes,
                canned, rules, passwords, new ObjectMapper(), jdbc);
        company = company(7L);
        when(companies.findById(7L)).thenReturn(Optional.of(company));
        when(audits.save(any(SecurityAuditLog.class))).thenAnswer(call -> call.getArgument(0));
        actor("COMPANY_ADMIN");
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @ParameterizedTest
    @ValueSource(strings = {"AGENT", "TEAM_LEAD", "LIGHT_AGENT"})
    void nonAdministratorsCannotUseAdministrativeSettings(String role) {
        actor(role);
        assertThrows(SecurityException.class, () -> service.getCompanySettings(7L));
        assertThrows(SecurityException.class, () -> service.updateCompanySettings(7L, Map.of()));
        assertThrows(SecurityException.class, () -> service.getAuditLogs(7L));
        assertThrows(SecurityException.class, () -> service.exportWorkspaceData(7L));
        assertThrows(SecurityException.class, () -> service.getCompanyMailboxes(7L));
        assertThrows(SecurityException.class, () -> service.saveCompanyMailbox(7L, Map.of()));
        assertThrows(SecurityException.class, () -> service.deleteCompanyMailbox(7L, 90L));
        assertThrows(SecurityException.class, () -> service.saveCannedResponse(7L, Map.of()));
        assertThrows(SecurityException.class, () -> service.deleteCannedResponse(7L, 90L));
        assertThrows(SecurityException.class, () -> service.getAutomationRules(7L));
        assertThrows(SecurityException.class, () -> service.saveAutomationRule(7L, Map.of()));
        assertThrows(SecurityException.class, () -> service.reauthenticate(7L, 44L, "test-password"));
        verifyNoInteractions(companies, departments, users, notifications, audits, mailboxes, canned, rules, passwords, jdbc);
    }

    @Test
    void aTenantHeaderAloneCannotReadOrMutateWorkspaceData() {
        TenantContext.clear();
        TenantContext.setCompanyId(7L);
        assertThrows(SecurityException.class, () -> service.getDepartments(7L));
        assertThrows(SecurityException.class, () -> service.getAgents(7L));
        assertThrows(SecurityException.class, () -> service.getKbArticles(7L));
        assertThrows(SecurityException.class, () -> service.getCannedResponses(7L));
        assertThrows(SecurityException.class, () -> service.getNotifications(7L, 44L));
        assertThrows(SecurityException.class, () -> service.updateCompanySettings(7L, Map.of()));
        verifyNoInteractions(companies, departments, users, notifications, audits, mailboxes, canned, rules, jdbc);
    }

    @Test
    void agentReferenceReadsRemainAvailableWithoutReadSideWrites() {
        actor("AGENT");
        CannedResponse shared = response(company, 55L, true);
        CannedResponse own = response(company, 44L, false);
        CannedResponse anotherUsersPrivate = response(company, 55L, false);
        when(canned.findByCompanyIdOrderByTitleAsc(7L)).thenReturn(List.of(shared, own, anotherUsersPrivate));

        assertDoesNotThrow(() -> service.getDepartments(7L));
        assertDoesNotThrow(() -> service.getAgents(7L));
        assertDoesNotThrow(() -> service.getKbArticles(7L));
        assertDoesNotThrow(() -> service.getKbCategories(7L));
        assertEquals(List.of(shared, own), service.getCannedResponses(7L));
        verify(departments).findByCompanyIdAndIsActiveTrue(7L);
        verify(users).findByCompanyIdAndIsActiveTrue(7L);
        verify(canned, never()).save(any());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"COMPANY_ADMIN", "SUPER_ADMIN"})
    void existingPayloadIdsMustBelongToTheTargetTenantBeforeMutation(String role) {
        actor(role);
        Company foreignCompany = company(8L);
        CompanyMailbox mailbox = new CompanyMailbox();
        mailbox.setCompany(foreignCompany);
        mailbox.setMailboxName("unchanged mailbox");
        CannedResponse response = response(foreignCompany, 55L, true);
        response.setTitle("unchanged response");
        AutomationRule rule = new AutomationRule();
        rule.setCompany(foreignCompany);
        rule.setName("unchanged rule");
        when(mailboxes.findById(90L)).thenReturn(Optional.of(mailbox));
        when(canned.findById(90L)).thenReturn(Optional.of(response));
        when(rules.findById(90L)).thenReturn(Optional.of(rule));

        assertThrows(SecurityException.class, () -> service.saveCompanyMailbox(7L, Map.of("id", 90L, "mailboxName", "changed")));
        assertThrows(SecurityException.class, () -> service.saveCannedResponse(7L, Map.of("id", 90L, "title", "changed")));
        assertThrows(SecurityException.class, () -> service.saveAutomationRule(7L, Map.of("id", 90L, "name", "changed")));
        assertEquals("unchanged mailbox", mailbox.getMailboxName());
        assertEquals("unchanged response", response.getTitle());
        assertEquals("unchanged rule", rule.getName());
        verify(mailboxes, never()).save(any());
        verify(canned, never()).save(any());
        verify(rules, never()).save(any());
        verifyNoInteractions(audits, jdbc);
    }

    @Test
    void missingUpdateIdsCannotBecomeNewResources() {
        assertThrows(SecurityException.class, () -> service.saveCompanyMailbox(7L, Map.of("id", 90L)));
        assertThrows(SecurityException.class, () -> service.saveCannedResponse(7L, Map.of("id", 90L)));
        assertThrows(SecurityException.class, () -> service.saveAutomationRule(7L, Map.of("id", 90L)));
        verify(mailboxes, never()).save(any());
        verify(canned, never()).save(any());
        verify(rules, never()).save(any());
    }

    @Test
    void nestedForeignDepartmentsAreRejectedBeforeChangingExistingResources() {
        Department foreign = department(91L, company(8L));
        when(departments.findById(91L)).thenReturn(Optional.of(foreign));
        CompanyMailbox mailbox = new CompanyMailbox();
        mailbox.setCompany(company);
        mailbox.setMailboxName("original");
        CannedResponse response = response(company, 55L, true);
        response.setTitle("original");
        AutomationRule rule = configuredRule();
        when(mailboxes.findById(90L)).thenReturn(Optional.of(mailbox));
        when(canned.findById(90L)).thenReturn(Optional.of(response));
        when(rules.findById(90L)).thenReturn(Optional.of(rule));

        assertThrows(SecurityException.class, () -> service.saveCompanyMailbox(7L,
                Map.of("id", 90L, "mailboxName", "changed", "department", Map.of("id", 91L))));
        assertThrows(SecurityException.class, () -> service.saveCannedResponse(7L,
                Map.of("id", 90L, "title", "changed", "departmentId", 91L)));
        assertThrows(SecurityException.class, () -> service.saveAutomationRule(7L,
                Map.of("id", 90L, "name", "changed", "actionJson", "{\"actions\":[{\"action\":\"assign_team\",\"departmentId\":91}]}")));
        assertEquals("original", mailbox.getMailboxName());
        assertEquals("original", response.getTitle());
        assertEquals("original", rule.getName());
        verify(mailboxes, never()).save(any());
        verify(canned, never()).save(any());
        verify(rules, never()).save(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"categoryId", "category_id", "accountId", "account_id"})
    void ruleJsonReferencesAreQualifiedByTenant(String key) {
        String table = key.startsWith("category") ? "kb_categories" : "customer_accounts";
        when(jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE id = ? AND company_id = ?",
                Long.class, 91L, 7L)).thenReturn(0L);
        assertThrows(SecurityException.class, () -> service.saveAutomationRule(7L,
                Map.of("conditionJson", "{\"field\":\"" + key + "\",\"operator\":\"equals\",\"value\":91}", "actionJson", VALID_ACTION)));
        verify(jdbc).queryForObject("SELECT COUNT(*) FROM " + table + " WHERE id = ? AND company_id = ?",
                Long.class, 91L, 7L);
        verify(rules, never()).save(any());
    }

    @Test
    void kbAndCustomerWritesRejectForeignCategoryAndAccountIdsBeforeJdbcUpdates() {
        SaveKbArticleRequest article = new SaveKbArticleRequest();
        article.setCategoryId(91L);
        CustomerContactDto contact = new CustomerContactDto();
        contact.setAccountId(92L);
        when(jdbc.queryForObject("SELECT COUNT(*) FROM kb_categories WHERE id = ? AND company_id = ?",
                Long.class, 91L, 7L)).thenReturn(0L);
        when(jdbc.queryForObject("SELECT COUNT(*) FROM customer_accounts WHERE id = ? AND company_id = ?",
                Long.class, 92L, 7L)).thenReturn(0L);
        assertThrows(SecurityException.class, () -> service.createKbArticle(7L, article));
        assertThrows(SecurityException.class, () -> service.createCustomer(7L, contact));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void validConfigurationCrudPersistsWithoutClaimingMailboxVerification() {
        Department department = department(17L, company);
        when(departments.findById(17L)).thenReturn(Optional.of(department));
        when(mailboxes.save(any(CompanyMailbox.class))).thenAnswer(call -> call.getArgument(0));
        when(canned.save(any(CannedResponse.class))).thenAnswer(call -> call.getArgument(0));
        when(rules.save(any(AutomationRule.class))).thenAnswer(call -> call.getArgument(0));

        CompanyMailbox mailbox = service.saveCompanyMailbox(7L,
                Map.of("departmentId", 17L, "emailAddress", "support@example.invalid", "providerType", "MICROSOFT_365"));
        assertSame(company, mailbox.getCompany());
        assertSame(department, mailbox.getDepartment());
        assertEquals(CompanyMailbox.SyncStatus.PAUSED, mailbox.getSyncStatus());
        assertFalse(mailbox.getForwardingVerified());
        assertNull(mailbox.getLastSyncedAt());
        CannedResponse response = service.saveCannedResponse(7L, Map.of("title", "Saved response", "content", "Test content"));
        assertEquals(44L, response.getCreatedByUserId());
        assertEquals("Saved response", response.getTitle());
        AutomationRule rule = service.saveAutomationRule(7L,
                Map.of("name", "Saved rule", "conditionJson", VALID_CONDITION, "actionJson", VALID_ACTION));
        assertEquals("Saved rule", rule.getName());
        verify(audits, times(3)).save(any(SecurityAuditLog.class));
    }

    @Test
    void cannedUpdatesPreserveCreatorAndDeletionIsAudited() {
        CannedResponse response = response(company, 55L, false);
        response.setShortcut("/test");
        response.setContent("Private content");
        Department department = department(17L, company);
        response.setDepartment(department);
        when(canned.findById(90L)).thenReturn(Optional.of(response));
        when(canned.save(any(CannedResponse.class))).thenAnswer(call -> call.getArgument(0));
        service.saveCannedResponse(7L, Map.of("id", 90L, "title", "Updated", "createdByUserId", 999L));
        assertEquals(55L, response.getCreatedByUserId());
        assertFalse(response.getIsShared());
        assertEquals("/test", response.getShortcut());
        assertEquals("Private content", response.getContent());
        assertSame(department, response.getDepartment());
        service.deleteCannedResponse(7L, 90L);
        verify(canned).delete(response);
        verify(audits).save(argThat(log -> "CANNED_RESPONSE_DELETED".equals(log.getAction())
                && Long.valueOf(7L).equals(log.getCompanyId()) && Long.valueOf(44L).equals(log.getUserId())
                && log.getIpAddress() == null && log.getUserAgent() == null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"COMPANY_ADMIN", "SUPER_ADMIN"})
    void administratorsCanReadPrivateTemplatesWithinTheRequestedTenant(String role) {
        actor(role);
        CannedResponse shared = response(company, 55L, true);
        CannedResponse privateResponse = response(company, 55L, false);
        when(canned.findByCompanyIdOrderByTitleAsc(7L)).thenReturn(List.of(shared, privateResponse));

        assertEquals(List.of(shared, privateResponse), service.getCannedResponses(7L));
        verify(canned).findByCompanyIdOrderByTitleAsc(7L);
        verify(canned, never()).save(any());
        verifyNoInteractions(audits);
    }

    @Test
    void cannedCreationBindsCreatorAndDepartmentAndExplicitNullCanClearDepartment() {
        Department department = department(17L, company);
        when(departments.findById(17L)).thenReturn(Optional.of(department));
        when(canned.save(any(CannedResponse.class))).thenAnswer(call -> call.getArgument(0));
        CannedResponse response = service.saveCannedResponse(7L, Map.of("title", "Private template",
                "isShared", false, "createdByUserId", 999L, "department", Map.of("id", 17L)));
        assertEquals(44L, response.getCreatedByUserId());
        assertFalse(response.getIsShared());
        assertSame(department, response.getDepartment());

        when(canned.findById(90L)).thenReturn(Optional.of(response));
        Map<String, Object> update = new HashMap<>();
        update.put("id", 90L);
        update.put("departmentId", null);
        service.saveCannedResponse(7L, update);
        assertNull(response.getDepartment());
        assertEquals(44L, response.getCreatedByUserId());
        assertFalse(response.getIsShared());
        assertEquals("Private template", response.getTitle());
        verify(audits, times(2)).save(argThat(log -> "CANNED_RESPONSE_SAVED".equals(log.getAction())
                && Long.valueOf(44L).equals(log.getUserId()) && log.getIpAddress() == null && log.getUserAgent() == null));
    }

    @Test
    void cannedForeignNestedDepartmentAndInvalidPrivacyCannotPartiallyMutate() {
        CannedResponse response = response(company, 55L, false);
        response.setTitle("original");
        when(canned.findById(90L)).thenReturn(Optional.of(response));
        when(departments.findById(91L)).thenReturn(Optional.of(department(91L, company(8L))));
        assertThrows(SecurityException.class, () -> service.saveCannedResponse(7L,
                Map.of("id", 90L, "title", "changed", "department", Map.of("id", 91L))));
        assertThrows(IllegalArgumentException.class, () -> service.saveCannedResponse(7L,
                Map.of("id", 90L, "title", "changed", "isShared", "not-a-boolean")));
        assertEquals("original", response.getTitle());
        assertEquals(55L, response.getCreatedByUserId());
        assertFalse(response.getIsShared());
        assertNull(response.getDepartment());
        verify(canned, never()).save(any());
        verifyNoInteractions(audits);
    }

    @Test
    void cannedDeletionRejectsForeignAndMissingIdsWithoutAuditOrDelete() {
        CannedResponse response = response(company(8L), 55L, true);
        when(canned.findById(90L)).thenReturn(Optional.of(response));
        assertThrows(SecurityException.class, () -> service.deleteCannedResponse(7L, 90L));
        assertThrows(SecurityException.class, () -> service.deleteCannedResponse(7L, 91L));
        verify(canned, never()).delete(any(CannedResponse.class));
        verifyNoInteractions(audits);
    }

    @Test
    void emptyReadsDoNotFabricateNotificationsAuditsOrConfiguration() {
        assertTrue(service.getNotifications(7L, null).isEmpty());
        assertTrue(service.getAuditLogs(7L).isEmpty());
        assertTrue(service.getCompanyMailboxes(7L).isEmpty());
        assertTrue(service.getCannedResponses(7L).isEmpty());
        assertTrue(service.getAutomationRules(7L).isEmpty());
        verifyNoInteractions(jdbc);
        verify(notifications, never()).save(any());
        verify(audits, never()).save(any());
        verify(mailboxes, never()).save(any());
        verify(canned, never()).save(any());
        verify(rules, never()).save(any());
    }

    @Test
    void notificationReadsAndReadAllBindTheCurrentRecipient() {
        actor("AGENT");
        service.getNotifications(7L, null);
        assertThrows(SecurityException.class, () -> service.getNotifications(7L, 55L));
        assertThrows(SecurityException.class, () -> service.getNotifications(8L, 44L));
        service.markAllNotificationsRead(7L);
        verify(notifications).findByCompanyIdAndUserIdOrderByCreatedAtDesc(7L, 44L);
        verify(notifications, never()).findByCompanyIdOrderByCreatedAtDesc(anyLong());
        verify(jdbc).update("UPDATE notifications SET is_read = 1 WHERE company_id = ? AND user_id = ?", 7L, 44L);
    }

    @Test
    void notificationReadOneRequiresBothTenantAndRecipientEvenForAdmins() {
        Notification notification = new Notification();
        notification.setCompanyId(8L);
        notification.setUserId(44L);
        when(notifications.findById(90L)).thenReturn(Optional.of(notification));
        assertThrows(SecurityException.class, () -> service.markNotificationRead(7L, 90L));
        notification.setCompanyId(7L);
        notification.setUserId(55L);
        assertThrows(SecurityException.class, () -> service.markNotificationRead(7L, 90L));
        assertFalse(notification.getIsRead());
        verify(notifications, never()).save(any());
        notification.setUserId(44L);
        service.markNotificationRead(7L, 90L);
        assertTrue(notification.getIsRead());
        verify(notifications).save(notification);
    }

    @Test
    void reauthenticationOnlyChecksTheCurrentActorsEncodedPassword() {
        User actor = currentAdmin();
        when(users.findById(44L)).thenReturn(Optional.of(actor));
        when(passwords.matches("correct-test-password", "encoded-actor-password")).thenReturn(true);
        assertFalse(service.reauthenticate(7L, 55L, "correct-test-password"));
        assertFalse(service.reauthenticate(7L, 44L, "Password@123"));
        assertTrue(service.reauthenticate(7L, 44L, "correct-test-password"));
        verify(users, never()).findById(55L);
        verify(passwords).matches("Password@123", "encoded-actor-password");
        verify(passwords).matches("correct-test-password", "encoded-actor-password");
        verify(audits, times(1)).save(argThat(log -> "REAUTH_VERIFIED".equals(log.getAction())));
    }

    @Test
    void reauthenticationRejectsDisabledOrForeignActors() {
        User actor = currentAdmin();
        when(users.findById(44L)).thenReturn(Optional.of(actor));
        actor.setIsActive(false);
        assertFalse(service.reauthenticate(7L, null, "test-password"));
        actor.setIsActive(true);
        actor.setCompany(company(8L));
        assertFalse(service.reauthenticate(7L, null, "test-password"));
        verifyNoInteractions(passwords, audits);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{}", "[]", "null", "42", "\"action\"", "{",
            "{\"action\":\"delete_workspace\"}",
            "{\"action\":\"set_status\",\"status\":\"NOT_A_STATUS\"}",
            "{\"action\":\"set_status\"}",
            "{\"field\":\"status\",\"operator\":\"equals\",\"value\":\"OPEN\"}",
            "{\"action\":\"set_status\",\"status\":\"CLOSED\",\"departmentId\":17}",
            "{\"action\":\"set_status\",\"status\":\"CLOSED\"} {\"action\":\"notify_manager\",\"channel\":\"email\"}",
            "{\"action\":\"set_status\",\"status\":\"OPEN\",\"status\":\"CLOSED\"}",
            "{\"actions\":[]}"
    })
    void malformedOrUnsupportedActionsCannotPartiallyUpdateRules(String json) {
        AutomationRule rule = configuredRule();
        when(rules.findById(90L)).thenReturn(Optional.of(rule));
        assertThrows(IllegalArgumentException.class, () -> service.saveAutomationRule(7L,
                Map.of("id", 90L, "name", "changed", "isActive", false, "actionJson", json)));
        assertEquals("original", rule.getName());
        assertEquals(VALID_ACTION, rule.getActionJson());
        assertEquals(VALID_CONDITION, rule.getConditionJson());
        assertTrue(rule.getIsActive());
        verify(rules, never()).save(any());
        verifyNoInteractions(audits);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{}", "[]", "null", "[true]",
            "{\"field\":\"password_hash\",\"operator\":\"equals\",\"value\":\"test\"}",
            "{\"field\":\"status\",\"operator\":\"equals\"}",
            "{\"field\":\"subject\",\"operator\":\"execute\",\"value\":\"test\"}",
            "{\"field\":\"status\",\"operator\":\"contains\",\"value\":\"OPEN\"}",
            "{\"field\":\"status\",\"operator\":\"equals\",\"value\":true}",
            "{\"field\":\"status\",\"operator\":\"equals\",\"value\":\"UNKNOWN\"}",
            "{\"field\":\"sla_threshold\",\"operator\":\"greater_than\",\"value\":101}",
            "{\"field\":\"status\",\"operator\":\"equals\",\"value\":\"RESOLVED\",\"hours\":8761}"
    })
    void invalidConditionSemanticsCannotPartiallyUpdateRules(String json) {
        AutomationRule rule = configuredRule();
        when(rules.findById(90L)).thenReturn(Optional.of(rule));
        assertThrows(IllegalArgumentException.class, () -> service.saveAutomationRule(7L,
                Map.of("id", 90L, "name", "changed", "conditionJson", json)));
        assertEquals("original", rule.getName());
        assertEquals(VALID_CONDITION, rule.getConditionJson());
        assertEquals(VALID_ACTION, rule.getActionJson());
        verify(rules, never()).save(any());
        verifyNoInteractions(audits);
    }

    @ParameterizedTest
    @CsvSource({"eventTrigger,NOT_A_TRIGGER", "isActive,perhaps", "priorityOrder,-1", "priorityOrder,10001", "priorityOrder,1.5"})
    void invalidRuleMetadataCannotPartiallyUpdateRules(String field, String value) {
        AutomationRule rule = configuredRule();
        when(rules.findById(90L)).thenReturn(Optional.of(rule));
        assertThrows(IllegalArgumentException.class, () -> service.saveAutomationRule(7L,
                Map.of("id", 90L, "name", "changed", field, value)));
        assertEquals("original", rule.getName());
        assertEquals(AutomationRule.EventTrigger.TICKET_CREATED, rule.getEventTrigger());
        assertEquals(10, rule.getPriorityOrder());
        assertTrue(rule.getIsActive());
        verify(rules, never()).save(any());
        verifyNoInteractions(audits);
    }

    @Test
    void ruleJsonIsBoundedByBytesDepthNodeCountAndScalarLength() {
        AutomationRule rule = configuredRule();
        when(rules.findById(90L)).thenReturn(Optional.of(rule));
        Map<String, Object> clause = Map.of("field", "status", "operator", "equals", "value", "OPEN");
        Object nested = clause;
        for (int i = 0; i < 9; i++) nested = List.of(nested);
        List<Object> invalid = List.of(
                VALID_CONDITION + " ".repeat(16_384),
                "{\"field\":\"subject\",\"operator\":\"contains\",\"value\":\"" + "\u03c0".repeat(9000) + "\"}",
                nested,
                Map.of("any", List.of(Map.of("all", Collections.nCopies(50, clause)), Map.of("all", Collections.nCopies(50, clause)))),
                Map.of("field", "subject", "operator", "contains", "value", "x".repeat(2049)));
        for (Object json : invalid) {
            assertThrows(IllegalArgumentException.class, () -> service.saveAutomationRule(7L,
                    Map.of("id", 90L, "name", "changed", "conditionJson", json)));
        }
        assertEquals("original", rule.getName());
        assertEquals(VALID_CONDITION, rule.getConditionJson());
        verify(rules, never()).save(any());
        verifyNoInteractions(audits);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"action\":\"assign_team\",\"departmentId\":17,\"priority\":\"HIGH\"}",
            "{\"action\":\"assign_team\",\"department\":{\"id\":17}}",
            "{\"action\":\"assign_team\",\"team\":\"Support\"}",
            "{\"action\":\"set_priority\",\"priority\":\"HIGH\"}",
            "{\"action\":\"notify_manager\",\"channel\":\"email_and_slack\"}",
            "[{\"action\":\"set_status\",\"status\":\"RESOLVED\"}]",
            "{\"actions\":[{\"action\":\"set_status\",\"status\":\"CLOSED\"}]}"
    })
    void validRuleActionsPreserveOmittedConfigurationAndAuditTheMutation(String json) {
        AutomationRule rule = configuredRule();
        rule.setIsActive(false);
        rule.setPriorityOrder(25);
        Department department = department(17L, company);
        department.setName("Support");
        when(departments.findById(17L)).thenReturn(Optional.of(department));
        when(departments.findByCompanyId(7L)).thenReturn(List.of(department));
        when(rules.findById(90L)).thenReturn(Optional.of(rule));
        when(rules.save(any(AutomationRule.class))).thenAnswer(call -> call.getArgument(0));

        assertSame(rule, service.saveAutomationRule(7L, Map.of("id", 90L, "actionJson", json)));
        assertEquals(json, rule.getActionJson());
        assertEquals(VALID_CONDITION, rule.getConditionJson());
        assertEquals("original", rule.getName());
        assertFalse(rule.getIsActive());
        assertEquals(25, rule.getPriorityOrder());
        var ordered = inOrder(rules, audits);
        ordered.verify(rules).save(rule);
        ordered.verify(audits).save(argThat(log -> "AUTOMATION_RULE_SAVED".equals(log.getAction())
                && Long.valueOf(7L).equals(log.getCompanyId()) && Long.valueOf(44L).equals(log.getUserId())
                && log.getIpAddress() == null && log.getUserAgent() == null));
    }

    @Test
    void validNestedConditionsQualifyAccountAndCategoryBeforeCreatingRule() {
        when(jdbc.queryForObject("SELECT COUNT(*) FROM customer_accounts WHERE id = ? AND company_id = ?",
                Long.class, 21L, 7L)).thenReturn(1L);
        when(jdbc.queryForObject("SELECT COUNT(*) FROM kb_categories WHERE id = ? AND company_id = ?",
                Long.class, 22L, 7L)).thenReturn(1L);
        when(rules.save(any(AutomationRule.class))).thenAnswer(call -> call.getArgument(0));
        Map<String, Object> condition = Map.of("all", List.of(
                Map.of("field", "accountId", "operator", "equals", "value", 21L),
                Map.of("any", List.of(Map.of("field", "category_id", "operator", "equals", "value", 22L)))));
        AutomationRule saved = service.saveAutomationRule(7L,
                Map.of("conditionJson", condition, "actionJson", Map.of("action", "set_status", "status", "CLOSED")));
        assertSame(company, saved.getCompany());
        assertEquals(AutomationRule.EventTrigger.TICKET_CREATED, saved.getEventTrigger());
        var action = assertDoesNotThrow(() -> new ObjectMapper().readTree(saved.getActionJson()));
        assertEquals("set_status", action.path("action").asText());
        assertEquals("CLOSED", action.path("status").asText());
        verify(jdbc).queryForObject("SELECT COUNT(*) FROM customer_accounts WHERE id = ? AND company_id = ?", Long.class, 21L, 7L);
        verify(jdbc).queryForObject("SELECT COUNT(*) FROM kb_categories WHERE id = ? AND company_id = ?", Long.class, 22L, 7L);
        verify(rules).save(saved);
    }

    @ParameterizedTest
    @ValueSource(strings = {"COMPANY_ADMIN", "SUPER_ADMIN"})
    void ruleCompanyAndDepartmentReferencesCannotEscapeTheRequestedTenant(String role) {
        actor(role);
        AutomationRule rule = configuredRule();
        Department foreign = department(91L, company(8L));
        foreign.setName("Support");
        when(rules.findById(90L)).thenReturn(Optional.of(rule));
        when(departments.findById(91L)).thenReturn(Optional.of(foreign));
        when(departments.findByCompanyId(7L)).thenReturn(List.of(foreign));
        List<Map<String, Object>> changes = List.of(
                Map.of("companyId", 8L),
                Map.of("company", Map.of("id", 8L)),
                Map.of("conditionJson", "{\"field\":\"companyId\",\"operator\":\"equals\",\"value\":8}"),
                Map.of("conditionJson", "{\"field\":\"departmentId\",\"operator\":\"equals\",\"value\":91}"),
                Map.of("actionJson", "{\"action\":\"assign_team\",\"department\":{\"id\":91}}"),
                Map.of("actionJson", "{\"action\":\"assign_team\",\"team\":\"Support\"}"));
        for (Map<String, Object> change : changes) {
            Map<String, Object> payload = new HashMap<>(change);
            payload.put("id", 90L);
            payload.put("name", "changed");
            assertThrows(SecurityException.class, () -> service.saveAutomationRule(7L, payload));
        }
        assertEquals("original", rule.getName());
        assertEquals(VALID_ACTION, rule.getActionJson());
        assertEquals(VALID_CONDITION, rule.getConditionJson());
        verify(rules, never()).save(any());
        verifyNoInteractions(audits);
    }

    @Test
    void newRulesRequireMeaningfulConfigurationInsteadOfSeededDefaults() {
        assertThrows(IllegalArgumentException.class, () -> service.saveAutomationRule(7L, Map.of("name", "No configuration")));
        assertThrows(IllegalArgumentException.class, () -> service.saveAutomationRule(7L,
                Map.of("conditionJson", VALID_CONDITION, "actionJson", "{}")));
        verify(rules, never()).save(any());
        verifyNoInteractions(audits);
    }

    private AutomationRule configuredRule() {
        AutomationRule rule = new AutomationRule();
        rule.setId(90L);
        rule.setCompany(company);
        rule.setName("original");
        rule.setEventTrigger(AutomationRule.EventTrigger.TICKET_CREATED);
        rule.setConditionJson(VALID_CONDITION);
        rule.setActionJson(VALID_ACTION);
        rule.setIsActive(true);
        rule.setPriorityOrder(10);
        return rule;
    }

    private void actor(String role) {
        TenantContext.setContext(7L, 44L, role, "actor@example.invalid");
    }

    private User currentAdmin() {
        User user = new User();
        user.setId(44L);
        user.setCompany(company);
        user.setEmail("actor@example.invalid");
        user.setIsActive(true);
        user.setStatus("ACTIVE");
        user.setPasswordHash("encoded-actor-password");
        Role role = new Role();
        role.setRoleType(Role.RoleType.COMPANY_ADMIN);
        user.setRole(role);
        return user;
    }

    private Company company(Long id) {
        Company value = new Company();
        value.setId(id);
        value.setName("Synthetic workspace");
        value.setSubdomain("synthetic");
        return value;
    }

    private Department department(Long id, Company owner) {
        Department value = new Department();
        value.setId(id);
        value.setCompany(owner);
        value.setIsActive(true);
        return value;
    }

    private CannedResponse response(Company owner, Long creatorId, boolean shared) {
        CannedResponse value = new CannedResponse();
        value.setCompany(owner);
        value.setCreatedByUserId(creatorId);
        value.setIsShared(shared);
        return value;
    }
}
