package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kuwy.helpdesk.controllers.GlobalExceptionHandler;
import com.kuwy.helpdesk.controllers.PlanCatalogController;
import com.kuwy.helpdesk.dto.PublicPlan;
import com.kuwy.helpdesk.dto.PublicPlan.PlanUpdate;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.Version;
import org.hibernate.annotations.Immutable;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PlanCatalogServiceTest {
    private final ObjectMapper json = new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    private PlanDefinitionRepository plans;
    private PlanRevisionRepository revisions;
    private UserRepository users;
    private PasswordEncoder passwords;
    private TwoFactorAuthService twoFactor;
    private SecretCryptoService crypto;
    private SecurityAuditService audit;
    private EntityManager em;
    private PlanCatalogService service;
    private User actor;

    @BeforeEach void setup() {
        plans = mock(PlanDefinitionRepository.class); revisions = mock(PlanRevisionRepository.class);
        users = mock(UserRepository.class); passwords = mock(PasswordEncoder.class);
        twoFactor = mock(TwoFactorAuthService.class); crypto = mock(SecretCryptoService.class);
        audit = mock(SecurityAuditService.class); em = mock(EntityManager.class);
        service = new PlanCatalogService(plans, revisions, users, passwords, twoFactor, crypto, audit, em);
        Company company = new Company(); company.setId(7L);
        Role role = new Role(); role.setRoleType(Role.RoleType.SUPER_ADMIN);
        actor = new User(); actor.setId(9L); actor.setCompany(company); actor.setRole(role);
        actor.setEmail("admin@example.invalid"); actor.setPasswordHash("encoded-fixture");
        TenantContext.setContext(7L, 9L, "SUPER_ADMIN", actor.getEmail());
        when(users.findById(9L)).thenReturn(Optional.of(actor));
        when(users.findForAuthenticationById(9L)).thenReturn(Optional.of(actor));
        when(passwords.matches("current-fixture", "encoded-fixture")).thenReturn(true);
        when(plans.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @AfterEach void clear() { TenantContext.clear(); }

    @Test void emptyPublicReadsNeverSeedOrConsultAnActor() {
        TenantContext.clear();
        assertTrue(service.publicPlans().isEmpty());
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> service.requirePlan("MISSING")).getStatusCode().value());
        verify(plans, never()).saveAndFlush(any());
        verifyNoInteractions(revisions, users, passwords, twoFactor, crypto, audit, em);
    }

    @Test void visibilityAndAnnualAmountRemainAuthoritative() throws Exception {
        for (PlanDefinition.Status status : PlanDefinition.Status.values()) {
            PlanDefinition plan = definition(status);
            when(plans.findById("STARTER")).thenReturn(Optional.of(plan));
            if (status == PlanDefinition.Status.PUBLIC) {
                PublicPlan found = service.requirePublicPlan("STARTER");
                assertEquals(new BigDecimal("23990.40"), found.yearlyPrice());
                assertEquals("INR", found.currency()); assertTrue(found.gstExclusive());
                assertThrows(UnsupportedOperationException.class, () -> found.features().put("api", true));
                when(plans.findByStatusOrderByMonthlyPriceAscCodeAsc(status)).thenReturn(List.of(plan));
                assertEquals(List.of(found), service.publicPlans());
            } else assertThrows(ResponseStatusException.class, () -> service.requirePublicPlan("STARTER"));
            if (status == PlanDefinition.Status.RETIRED) assertThrows(ResponseStatusException.class, () -> service.requirePlan("STARTER"));
            else assertEquals(status, service.requirePlan("STARTER").status());
        }
        verifyNoInteractions(revisions, audit);
    }

    @ParameterizedTest @ValueSource(strings = {"-0.01", "0.001", "1000000000000", "1E+100", "0E-100000"})
    void invalidMoneyCannotReachPersistence(String amount) throws Exception {
        PlanUpdate input = json.treeToValue(body().put("monthlyPrice", amount), PlanUpdate.class);
        assertThrows(IllegalArgumentException.class, () -> service.save(input));
        verifyNoInteractions(plans, revisions, audit);
    }

    @Test void limitsCurrencyCodeAndUnknownOverridesFailClosed() {
        Map<String, Object> invalid = Map.of("currency", "USD", "code", "pro", "includedAgents", 10001,
                "ticketLimitMonthly", 10000001, "trialDays", -1, "storageBytes", -1,
                "expectedRevision", Long.MAX_VALUE, "defaultAmount", 1);
        invalid.forEach((field, value) -> assertThrows(Exception.class, () -> {
            ObjectNode input = body(); input.set(field, json.valueToTree(value));
            service.save(json.treeToValue(input, PlanUpdate.class));
        }));
        assertThrows(Exception.class, () -> json.treeToValue(body().put("includedAgents", 1.5), PlanUpdate.class));
        assertThrows(Exception.class, () -> json.treeToValue(body().put("storageBytes", "9223372036854775808"), PlanUpdate.class));
        assertThrows(Exception.class, () -> json.treeToValue(body().put("storageBytes", new java.math.BigInteger("9223372036854775808")), PlanUpdate.class));
        verifyNoInteractions(plans, revisions, audit);
    }

    @Test void customCodesCanExplicitlyUseEnterpriseEntitlements() throws Exception {
        PublicPlan plan = service.save(json.treeToValue(body().put("code", "CUSTOM-TEAM_01").put("baseTier", "ENTERPRISE"), PlanUpdate.class));
        assertEquals("CUSTOM-TEAM_01", plan.code());
        assertEquals(PlanDefinition.BaseTier.ENTERPRISE, plan.baseTier());
    }

    @Test void featuresRejectCoercionUnknownKeysDuplicatesAndCorruptStorage() throws Exception {
        for (String features : List.of("{\"api\":\"true\"}", "{\"api\":1}", "{\"unknown\":true}",
                "{\"api\":null}", "{\"api\":{}}", "[]", "{\"api\":true,\"api\":false}")) {
            String input = body().toString().replace("{\"sla\":true}", features);
            assertThrows(Exception.class, () -> json.readValue(input, PlanUpdate.class).validated());
        }
        assertThrows(IllegalArgumentException.class, () -> PublicPlan.checkedFeatures(Map.of("api", "true")));
        PlanDefinition plan = definition(PlanDefinition.Status.PUBLIC);
        ReflectionTestUtils.setField(plan, "featuresJson", "{\"api\":\"true\"}");
        when(plans.findById("STARTER")).thenReturn(Optional.of(plan));
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> service.requirePlan("STARTER")).getStatusCode().value());
        verifyNoInteractions(revisions, audit);
    }

    @Test void anonymousLegacySuperAndNonSuperRolesCannotAdministerPlans() throws Exception {
        PlanUpdate input = json.treeToValue(body(), PlanUpdate.class);
        TenantContext.clear();
        assertThrows(SecurityException.class, service::adminPlans);
        assertThrows(SecurityException.class, () -> service.save(input));
        for (String role : List.of("SUPER", "COMPANY_ADMIN", "AGENT", "CUSTOMER")) {
            TenantContext.setContext(7L, 9L, role, actor.getEmail());
            assertThrows(SecurityException.class, () -> service.save(input));
        }
        TenantContext.setContext(7L, null, "SUPER_ADMIN", actor.getEmail());
        assertThrows(SecurityException.class, () -> service.save(input));
        verifyNoInteractions(users, plans, revisions, passwords, audit);
    }

    @ParameterizedTest @ValueSource(strings = {"disabled", "status", "email", "role", "scope", "company", "refresh"})
    void liveActorChangesAreRejectedBeforeTouchingCatalog(String change) throws Exception {
        switch (change) {
            case "disabled" -> actor.setIsActive(false);
            case "status" -> actor.setStatus("INACTIVE");
            case "email" -> actor.setEmail("changed@example.invalid");
            case "role" -> actor.getRole().setRoleType(Role.RoleType.COMPANY_ADMIN);
            case "scope" -> TenantContext.setCompanyId(8L);
            case "company" -> actor.getCompany().setStatus(Company.CompanyStatus.SUSPENDED);
            case "refresh" -> doAnswer(call -> { actor.setIsActive(false); return null; }).when(em).refresh(actor, LockModeType.PESSIMISTIC_WRITE);
        }
        PlanUpdate input = json.treeToValue(body(), PlanUpdate.class);
        assertThrows(SecurityException.class, () -> service.save(input));
        verifyNoInteractions(plans, revisions, passwords, audit);
    }

    @Test void proofUsesCurrentEncodedHashAndEncryptedActorBoundTotp() throws Exception {
        assertThrows(SecurityException.class, () -> service.save(json.treeToValue(body().put("currentPassword", "encoded-fixture"), PlanUpdate.class)));
        actor.setIsTwoFactorEnabled(true); actor.setTwoFactorSecret("encrypted-fixture");
        when(crypto.decrypt("encrypted-fixture", "staff-mfa:9")).thenReturn("decrypted-fixture");
        PlanUpdate input = json.treeToValue(body(), PlanUpdate.class);
        assertThrows(SecurityException.class, () -> service.save(input));
        verifyNoInteractions(plans, revisions, audit);
        when(twoFactor.verifyTotpCode("decrypted-fixture", "654321")).thenReturn(true);
        assertEquals(1, service.save(input).revision());
        verify(twoFactor, times(2)).verifyTotpCode("decrypted-fixture", "654321");
        assertFalse(json.writeValueAsString(input).contains("current-fixture"));
        assertFalse(json.writeValueAsString(input).contains("654321"));
        assertEquals("PlanUpdate[credentials redacted]", input.toString());
    }

    @Test void updatesAppendSnapshotsWithoutRepricingPreviouslyReadTerms() throws Exception {
        PlanDefinition plan = definition(PlanDefinition.Status.PUBLIC);
        PublicPlan old = json.treeToValue(body(), PlanUpdate.class).validated();
        when(plans.findById("STARTER")).thenReturn(Optional.of(plan));
        PlanUpdate update = json.treeToValue(body().put("expectedRevision", 1).put("monthlyPrice", "3000.00"), PlanUpdate.class);
        assertEquals(2, service.save(update).revision());
        ArgumentCaptor<PlanRevision> snapshots = ArgumentCaptor.forClass(PlanRevision.class);
        verify(revisions, times(2)).save(snapshots.capture());
        PlanRevision before = snapshots.getAllValues().get(0), after = snapshots.getAllValues().get(1);
        assertEquals(1, before.getRevision()); assertEquals(2, after.getRevision());
        assertEquals(new BigDecimal("2499.00"), old.monthlyPrice());
        assertEquals(0, old.monthlyPrice().compareTo(json.readTree(before.getSnapshotJson()).get("monthlyPrice").decimalValue()));
        assertEquals(3000, json.readTree(after.getSnapshotJson()).get("monthlyPrice").intValue());
        assertEquals(9L, after.getActorUserId()); assertNotNull(after.getCreatedAt());
        verify(audit).recordEvent(7L, 9L, "PLAN_CATALOG_SAVED", actor.getEmail(), "code=STARTER;revision=2", null);
        assertTrue(PlanRevision.class.isAnnotationPresent(Immutable.class));
        assertNotNull(PlanDefinition.class.getDeclaredField("rowVersion").getAnnotation(Version.class));
        assertNull(PlanDefinition.class.getDeclaredField("revision").getAnnotation(Version.class));
        assertFalse(PlanCatalogService.class.getMethod("save", PlanUpdate.class).getAnnotation(Transactional.class).readOnly());
        when(revisions.existsByCodeAndRevision("STARTER", 2)).thenReturn(true);
        service.save(json.treeToValue(body().put("expectedRevision", 2), PlanUpdate.class));
        verify(revisions, times(3)).save(any()); // Existing immutable revision 2 is not reinserted.
    }

    @Test void staleUpdatesAndDatabaseConflictsCannotEmitSuccessAudit() throws Exception {
        PlanDefinition plan = definition(PlanDefinition.Status.PUBLIC);
        when(plans.findById("STARTER")).thenReturn(Optional.of(plan));
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> service.save(json.treeToValue(body(), PlanUpdate.class))).getStatusCode().value());
        assertEquals(1, plan.getRevision()); verifyNoInteractions(revisions, audit);
        when(plans.findById("STARTER")).thenReturn(Optional.empty());
        when(plans.saveAndFlush(any())).thenThrow(new org.springframework.dao.DataIntegrityViolationException("synthetic collision"));
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> service.save(json.treeToValue(body(), PlanUpdate.class))).getStatusCode().value());
        verifyNoInteractions(revisions, audit);
    }

    @Test void httpContractKeepsPublicReadsSeparateFromProtectedWrites() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new PlanCatalogController(service)).setControllerAdvice(new GlobalExceptionHandler()).build();
        TenantContext.clear();
        mvc.perform(get("/api/v1/plans")).andExpect(status().isOk()).andExpect(content().string("[]"));
        mvc.perform(get("/api/v1/plans/admin")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/plans").contentType("application/json").content(body().toString())).andExpect(status().isForbidden());
        TenantContext.setContext(7L, 9L, "SUPER_ADMIN", actor.getEmail());
        String result = mvc.perform(post("/api/v1/plans").contentType("application/json").content(body().toString()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode payload = json.readTree(result);
        assertEquals("INR", payload.get("currency").asText()); assertFalse(payload.has("currentPassword"));
        assertEquals(0, new BigDecimal("23990.40").compareTo(payload.get("yearlyPrice").decimalValue()));
        mvc.perform(put("/api/v1/plans/PRO").contentType("application/json").content(body().put("expectedRevision", 1).toString())).andExpect(status().isBadRequest());
    }

    private ObjectNode body() {
        PlanUpdate input = new PlanUpdate("STARTER", "Starter", "Baseline", PlanDefinition.BaseTier.STARTER,
                PlanDefinition.Status.PUBLIC, "INR", new BigDecimal("2499"), new BigDecimal("23990.4"),
                5, 1500, 14, 0L, Map.of("sla", true), 0L, "current-fixture", "654321");
        return json.<ObjectNode>valueToTree(input).put("currentPassword", "current-fixture").put("totpCode", "654321");
    }

    private PlanDefinition definition(PlanDefinition.Status status) throws Exception {
        PlanDefinition plan = new PlanDefinition("STARTER");
        plan.revise(json.treeToValue(body().put("status", status.name()), PlanUpdate.class).validated(),
                "{\"sla\":true}", 9L, Instant.parse("2026-11-04T00:00:00Z"));
        return plan;
    }
}
