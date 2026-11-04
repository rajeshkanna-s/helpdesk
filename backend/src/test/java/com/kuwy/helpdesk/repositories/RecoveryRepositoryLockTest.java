package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.dto.AcceptInvitationRequest;
import com.kuwy.helpdesk.dto.ForgotPasswordRequest;
import com.kuwy.helpdesk.dto.InviteAgentRequest;
import com.kuwy.helpdesk.dto.ResetPasswordRequest;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.PasswordResetToken;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.services.AccountEmailService;
import com.kuwy.helpdesk.services.AgentInvitationService;
import com.kuwy.helpdesk.services.PasswordResetService;
import com.kuwy.helpdesk.services.RateLimiterService;
import com.kuwy.helpdesk.services.SecurityAuditService;
import jakarta.persistence.LockModeType;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

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

    @Test
    void theTransactionInterceptorRollsBackWhenQueueingFailsAndCommitsOnlyOnSuccess() {
        PasswordResetTokenRepository tokens = mock(PasswordResetTokenRepository.class);
        UserRepository users = mock(UserRepository.class);
        AccountEmailService emails = mock(AccountEmailService.class);
        SecurityAuditService audits = mock(SecurityAuditService.class);
        RateLimiterService rates = mock(RateLimiterService.class);
        PasswordResetService target = new PasswordResetService(tokens, users, mock(CompanyRepository.class),
                mock(PasswordEncoder.class), audits, emails, rates);
        ReflectionTestUtils.setField(target, "frontendUrl", "https://example.invalid");
        RecordingTransactions transactions = new RecordingTransactions();
        ProxyFactory factory = new ProxyFactory(target);
        factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        PasswordResetService service = (PasswordResetService) factory.getProxy();

        Company company = new Company();
        company.setId(7L);
        Role role = new Role();
        role.setRoleType(Role.RoleType.AGENT);
        role.setIsSystemRole(true);
        User user = new User();
        user.setId(44L);
        user.setCompany(company);
        user.setRole(role);
        user.setEmail("invitee@example.invalid");
        when(users.findForAuthenticationByEmail(user.getEmail())).thenReturn(List.of(user));
        when(rates.allowAuthentication(any(), anyString(), anyString())).thenReturn(true);
        when(tokens.save(any(PasswordResetToken.class))).thenAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            PasswordResetToken token = call.getArgument(0);
            token.setId(90L);
            return token;
        });
        doAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            throw new IllegalStateException("ACCOUNT_EMAIL_ENQUEUE_FAILED");
        }).when(emails).enqueue(eq(7L), eq(user.getEmail()), anyString(), anyString(), eq("password-reset:44:90"));
        ForgotPasswordRequest request = new ForgotPasswordRequest();
        request.setEmail(user.getEmail());
        assertThrows(IllegalStateException.class, () -> service.requestPasswordReset(request, null));
        assertEquals(1, transactions.rollbacks);
        assertEquals(0, transactions.commits);
        assertEquals(TransactionDefinition.ISOLATION_READ_COMMITTED, transactions.isolation);
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        verifyNoInteractions(audits);

        doAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            return "opaque-outbox-id";
        }).when(emails).enqueue(eq(7L), eq(user.getEmail()), anyString(), anyString(), eq("password-reset:44:90"));
        assertEquals(true, service.requestPasswordReset(request, null).get("success"));
        assertEquals(1, transactions.commits);
        assertEquals(1, transactions.rollbacks);
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
    }

    private static class RecordingTransactions extends AbstractPlatformTransactionManager {
        int commits;
        int rollbacks;
        int isolation;

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            isolation = definition.getIsolationLevel();
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++;
        }
    }
}
