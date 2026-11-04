package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.dto.AcceptInvitationRequest;
import com.kuwy.helpdesk.dto.ForgotPasswordRequest;
import com.kuwy.helpdesk.dto.InviteAgentRequest;
import com.kuwy.helpdesk.dto.ResetPasswordRequest;
import com.kuwy.helpdesk.services.AccountEmailService;
import com.kuwy.helpdesk.services.AgentInvitationService;
import com.kuwy.helpdesk.services.PasswordResetService;
import jakarta.persistence.LockModeType;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RecoveryRepositoryLockTest {
    @Test
    void consumptionAndManagementHaveSeparatePessimisticWriteLookups() throws Exception {
        for (Method method : List.of(
                PasswordResetTokenRepository.class.getMethod("findForConsumptionByTokenHash", String.class),
                AgentInvitationRepository.class.getMethod("findForConsumptionByTokenHash", String.class),
                AgentInvitationRepository.class.getMethod("findForUpdateByIdAndCompanyId", Long.class, Long.class))) {
            assertNotNull(method.getAnnotation(Lock.class), method.getName());
            assertEquals(LockModeType.PESSIMISTIC_WRITE, method.getAnnotation(Lock.class).value());
            assertNotNull(method.getAnnotation(Query.class), method.getName());
        }
        assertTrue(AgentInvitationRepository.class.getMethod("findForUpdateByIdAndCompanyId", Long.class, Long.class)
                .getAnnotation(Query.class).value().contains("i.companyId = :companyId"));
        assertNull(PasswordResetTokenRepository.class.getMethod("findByTokenHash", String.class).getAnnotation(Lock.class));
        assertNull(AgentInvitationRepository.class.getMethod("findByTokenHash", String.class).getAnnotation(Lock.class));
    }

    @Test
    void lockOrderingHintsReadScalarIdsInsteadOfCachingMutableTokens() throws Exception {
        Method userHint = PasswordResetTokenRepository.class.getMethod("findUserIdByTokenHash", String.class);
        Method tokenCompanyHint = AgentInvitationRepository.class.getMethod("findCompanyIdByTokenHash", String.class);
        Method idCompanyHint = AgentInvitationRepository.class.getMethod("findCompanyIdByInvitationId", Long.class);
        assertTrue(userHint.getAnnotation(Query.class).value().startsWith("SELECT t.userId "));
        for (Method method : List.of(tokenCompanyHint, idCompanyHint)) {
            assertTrue(method.getAnnotation(Query.class).value().startsWith("SELECT i.companyId "));
        }
        for (Method method : List.of(userHint, tokenCompanyHint, idCompanyHint)) {
            assertEquals("java.util.Optional<java.lang.Long>", method.getGenericReturnType().getTypeName());
            assertNull(method.getAnnotation(Lock.class));
        }
    }

    @Test
    void tokenWritesSeatDecisionsAndConsumptionRunInsideRequiredTransactions() throws Exception {
        for (Method method : List.of(
                PasswordResetService.class.getMethod("requestPasswordReset", ForgotPasswordRequest.class, HttpServletRequest.class),
                PasswordResetService.class.getMethod("resetPassword", ResetPasswordRequest.class, HttpServletRequest.class),
                AgentInvitationService.class.getMethod("inviteAgent", InviteAgentRequest.class, Long.class, Long.class, HttpServletRequest.class),
                AgentInvitationService.class.getMethod("acceptInvitation", AcceptInvitationRequest.class, HttpServletRequest.class),
                AgentInvitationService.class.getMethod("resendInvitation", Long.class, Long.class, HttpServletRequest.class),
                AgentInvitationService.class.getMethod("revokeInvitation", Long.class, Long.class, HttpServletRequest.class))) {
            Transactional transaction = method.getAnnotation(Transactional.class);
            assertNotNull(transaction, method.getName());
            assertFalse(transaction.readOnly(), method.getName());
            assertEquals(Propagation.REQUIRED, transaction.propagation(), method.getName());
            assertEquals(Isolation.READ_COMMITTED, transaction.isolation(), method.getName());
            assertEquals(0, transaction.noRollbackFor().length, method.getName());
            assertEquals(0, transaction.noRollbackForClassName().length, method.getName());
        }
        Transactional enqueue = AccountEmailService.class.getMethod("enqueue", Long.class, String.class, String.class,
                String.class, String.class).getAnnotation(Transactional.class);
        assertNotNull(enqueue);
        assertEquals(Propagation.REQUIRED, enqueue.propagation(), "The outbox must join the token transaction");
    }

    @Test
    void validationRemainsReadOnlyAndSeatCountingExcludesExpiredAndReplacedInvitations() throws Exception {
        assertTrue(PasswordResetService.class.getMethod("validateResetToken", String.class)
                .getAnnotation(Transactional.class).readOnly());
        assertTrue(AgentInvitationService.class.getMethod("validateInvitation", String.class)
                .getAnnotation(Transactional.class).readOnly());
        String query = AgentInvitationRepository.class.getMethod("countLiveInvitationsExcludingEmail", Long.class,
                com.kuwy.helpdesk.models.AgentInvitation.InvitationStatus.class, java.time.LocalDateTime.class, String.class)
                .getAnnotation(Query.class).value();
        assertTrue(query.contains("i.companyId = :companyId"));
        assertTrue(query.contains("i.status = :status"));
        assertTrue(query.contains("i.expiresAt > :now"));
        assertTrue(query.contains("LOWER(i.email) <> LOWER(:email)"));
    }
}
