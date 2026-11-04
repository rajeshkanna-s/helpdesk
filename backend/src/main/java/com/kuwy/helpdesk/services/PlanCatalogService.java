package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.dto.PublicPlan;
import com.kuwy.helpdesk.dto.PublicPlan.PlanUpdate;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlanCatalogService {
    private static final ObjectMapper JSON = new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private final PlanDefinitionRepository plans;
    private final PlanRevisionRepository revisions;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final TwoFactorAuthService twoFactor;
    private final SecretCryptoService crypto;
    private final SecurityAuditService audit;
    private final EntityManager entityManager;

    public List<PublicPlan> publicPlans() {
        return plans.findByStatusOrderByMonthlyPriceAscCodeAsc(PlanDefinition.Status.PUBLIC).stream().map(this::view).toList();
    }

    public PublicPlan requirePublicPlan(String code) {
        PublicPlan plan = requirePlan(code);
        if (plan.status() != PlanDefinition.Status.PUBLIC) throw unavailable();
        return plan;
    }

    public PublicPlan requirePlan(String code) {
        PublicPlan.requireCode(code);
        PlanDefinition plan = plans.findById(code).orElseThrow(this::unavailable);
        if (plan.getStatus() == PlanDefinition.Status.RETIRED) throw unavailable();
        return view(plan);
    }

    public List<PublicPlan> adminPlans() {
        requireActor(false);
        return plans.findAllByOrderByCodeAsc().stream().map(this::view).toList();
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PublicPlan save(PlanUpdate update) {
        User actor = requireActor(true);
        if (update == null) throw new IllegalArgumentException("Plan terms are required.");
        PublicPlan next = update.validated();
        requireProof(actor, update);
        PlanDefinition current = plans.findById(next.code()).orElse(null);
        if ((current == null ? 0 : current.getRevision()) != update.expectedRevision())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Plan changed; reload its current revision.");
        try {
            // Preserve imported/current terms too; no subscription is changed by a catalog edit.
            if (current != null && !revisions.existsByCodeAndRevision(current.getCode(), current.getRevision()))
                revisions.save(new PlanRevision(current, json(view(current))));
            if (current == null) current = new PlanDefinition(next.code());
            current.revise(next, json(next.features()), actor.getId(), Instant.now());
            current = plans.saveAndFlush(current);
            revisions.save(new PlanRevision(current, json(next)));
            plans.flush();
        } catch (DataIntegrityViolationException conflict) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Plan changed or conflicts with catalog constraints.");
        }
        audit.recordEvent(actor.getCompany().getId(), actor.getId(), "PLAN_CATALOG_SAVED", actor.getEmail(),
                "code=" + next.code() + ";revision=" + next.revision(), null);
        return next;
    }

    private User requireActor(boolean mutation) {
        Long id = TenantContext.requireUserId();
        if (!TenantContext.isSuperAdmin()) throw new SecurityException("A current platform administrator is required.");
        User actor = (mutation ? users.findForAuthenticationById(id) : users.findById(id))
                .orElseThrow(() -> new SecurityException("Administrator access is unavailable."));
        // Refresh defeats a stale persistence-context identity loaded before acquiring the lock.
        entityManager.refresh(actor, mutation ? LockModeType.PESSIMISTIC_WRITE : LockModeType.NONE);
        if (actor.getCompany() != null) entityManager.refresh(actor.getCompany(), mutation ? LockModeType.PESSIMISTIC_READ : LockModeType.NONE);
        if (actor.getRole() != null) entityManager.refresh(actor.getRole(), mutation ? LockModeType.PESSIMISTIC_READ : LockModeType.NONE);
        if (!id.equals(actor.getId()) || !Boolean.TRUE.equals(actor.getIsActive())
                || !"ACTIVE".equalsIgnoreCase(actor.getStatus()) || !Objects.equals(TenantContext.getUserEmail(), actor.getEmail())
                || actor.getRole() == null || actor.getRole().getRoleType() != Role.RoleType.SUPER_ADMIN
                || actor.getCompany() == null || !Objects.equals(TenantContext.getCompanyId(), actor.getCompany().getId())
                || actor.getCompany().getId() == null || actor.getCompany().getId() <= 0
                || (actor.getCompany().getStatus() != Company.CompanyStatus.ACTIVE && actor.getCompany().getStatus() != Company.CompanyStatus.TRIAL)
                || (actor.getRole().getCompany() != null && !actor.getCompany().getId().equals(actor.getRole().getCompany().getId()))
                || (actor.getLockoutUntil() != null && actor.getLockoutUntil().isAfter(LocalDateTime.now())))
            throw new SecurityException("Administrator identity or workspace scope changed; sign in again.");
        return actor;
    }

    private void requireProof(User actor, PlanUpdate update) {
        boolean valid = false;
        try {
            String password = update.currentPassword();
            valid = password != null && !password.isEmpty() && password.length() <= 1024
                    && actor.getPasswordHash() != null && passwords.matches(password, actor.getPasswordHash());
            if (valid && Boolean.TRUE.equals(actor.getIsTwoFactorEnabled()))
                valid = update.totpCode() != null && update.totpCode().matches("[0-9]{6}")
                        && twoFactor.verifyTotpCode(crypto.decrypt(actor.getTwoFactorSecret(), "staff-mfa:" + actor.getId()), update.totpCode());
        } catch (IllegalArgumentException | IllegalStateException invalidProof) {
            valid = false;
        }
        if (!valid) throw new SecurityException("Current password and, when enabled, authenticator proof are required.");
    }

    private PublicPlan view(PlanDefinition plan) {
        try {
            if (plan.getFeaturesJson() == null || plan.getFeaturesJson().length() > 2048) throw new IllegalArgumentException();
            Map<String, Object> features = JSON.readValue(plan.getFeaturesJson(), new TypeReference<>() {});
            return new PublicPlan(plan.getCode(), plan.getDisplayName(), plan.getDescription(), plan.getBaseTier(),
                    plan.getStatus(), plan.getCurrency(), true, plan.getMonthlyPrice(), plan.getYearlyPrice(),
                    plan.getIncludedAgents(), plan.getTicketLimitMonthly(), plan.getTrialDays(), plan.getStorageBytes(),
                    PublicPlan.checkedFeatures(features), plan.getRevision());
        } catch (JsonProcessingException | IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Stored plan terms are invalid; catalog correction is required.");
        }
    }

    private String json(Object value) {
        try { return JSON.writeValueAsString(value); }
        catch (JsonProcessingException failure) { throw new IllegalStateException("Plan serialization unavailable."); }
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Plan is not available.");
    }
}
