package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.CompanySubscription;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.CompanySubscriptionRepository;
import com.kuwy.helpdesk.repositories.TicketRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class SubscriptionService {

    private final CompanyRepository companyRepository;
    private final CompanySubscriptionRepository subscriptionRepository;
    private final TicketRepository ticketRepository;
    private final UserRepository userRepository;

    /**
     * Checks if a tenant workspace is locked due to expired subscription or suspension.
     */
    public boolean isWorkspaceLocked(Long companyId) {
        Company company = companyRepository.findById(companyId).orElse(null);
        if (company == null || company.getStatus() == Company.CompanyStatus.SUSPENDED || company.getStatus() == Company.CompanyStatus.INACTIVE) {
            return true;
        }

        Optional<CompanySubscription> subOpt = subscriptionRepository.findByCompanyId(companyId);
        if (subOpt.isEmpty()) return true;
        if (subOpt.isPresent()) {
            CompanySubscription sub = subOpt.get();
            if (sub.getStatus() == CompanySubscription.SubscriptionStatus.LOCKED) {
                return true;
            }
            boolean freeActive = sub.getPlanTier() == CompanySubscription.PlanTier.FREE && sub.getStatus() == CompanySubscription.SubscriptionStatus.ACTIVE;
            if (!freeActive && sub.getStatus() != CompanySubscription.SubscriptionStatus.PAST_DUE
                    && (sub.getCurrentPeriodEnd() == null || !sub.getCurrentPeriodEnd().isAfter(LocalDateTime.now()))) return true;
            if (sub.getStatus() == CompanySubscription.SubscriptionStatus.PAST_DUE && sub.getCurrentPeriodEnd() == null) return true;
            // Check if past due beyond 7-day grace period
            if (sub.getStatus() == CompanySubscription.SubscriptionStatus.PAST_DUE &&
                sub.getCurrentPeriodEnd() != null &&
                sub.getCurrentPeriodEnd().plusDays(7).isBefore(LocalDateTime.now())) {
                return true;
            }
        }
        return false;
    }

    /**
     * Asserts that a company can create new tickets.
     * Enforces active subscription status and monthly ticket quota limits.
     */
    public void assertCanCreateTicket(Long companyId) {
        if (isWorkspaceLocked(companyId)) {
            throw new IllegalStateException(
                "Workspace is currently locked due to past due or suspended subscription. " +
                "Please contact your administrator or update your billing details."
            );
        }

        Optional<CompanySubscription> subOpt = subscriptionRepository.findByCompanyId(companyId);
        if (subOpt.isPresent()) {
            CompanySubscription sub = subOpt.get();
            int limit = sub.getTicketLimitMonthly();

            // Calculate start of current month
            LocalDateTime startOfMonth = LocalDateTime.now().with(TemporalAdjusters.firstDayOfMonth()).withHour(0).withMinute(0).withSecond(0);
            long ticketsThisMonth = ticketRepository.countByCompanyIdAndCreatedAtAfter(companyId, startOfMonth);

            if (ticketsThisMonth >= limit) {
                log.warn("Tenant [{}] reached monthly ticket quota: {}/{}", companyId, ticketsThisMonth, limit);
                throw new IllegalStateException(
                    "Monthly ticket limit of " + limit + " tickets reached for this plan. " +
                    "Please upgrade your subscription to Enterprise Pro to continue creating tickets."
                );
            }
        }
    }

    /**
     * Asserts that a company can add more support agents.
     */
    public void assertCanAddAgent(Long companyId) {
        if (isWorkspaceLocked(companyId)) {
            throw new IllegalStateException("Workspace is locked. Cannot add support agents.");
        }

        Optional<CompanySubscription> subOpt = subscriptionRepository.findByCompanyId(companyId);
        if (subOpt.isPresent()) {
            CompanySubscription sub = subOpt.get();
            int limit = sub.getAgentLimit();
            long activeAgents = userRepository.countByCompanyIdAndIsActiveTrue(companyId);

            if (activeAgents >= limit) {
                log.warn("Tenant [{}] reached agent seat limit: {}/{}", companyId, activeAgents, limit);
                throw new IllegalStateException(
                    "Support agent seat limit of " + limit + " agents reached. " +
                    "Please upgrade your subscription to add more engineers."
                );
            }
        }
    }

    /**
     * Webhook Handler: Payment Succeeded / Subscription Renewed
     */
    @Transactional
    public void handlePaymentSuccess(String gatewaySubId, String paymentId, BigDecimal amount) {
        Optional<CompanySubscription> subOpt = subscriptionRepository.findByGatewaySubscriptionId(gatewaySubId);
        if (subOpt.isEmpty()) {
            log.warn("Webhook payment success received for unknown gatewaySubscriptionId: {}", gatewaySubId);
            return;
        }

        CompanySubscription sub = subOpt.get();
        sub.setStatus(CompanySubscription.SubscriptionStatus.ACTIVE);
        sub.setCurrentPeriodStart(LocalDateTime.now());
        sub.setCurrentPeriodEnd(LocalDateTime.now().plusDays(30));
        subscriptionRepository.save(sub);

        // Reactivate company workspace if it was suspended
        Company company = sub.getCompany();
        if (company.getStatus() == Company.CompanyStatus.SUSPENDED) {
            company.setStatus(Company.CompanyStatus.ACTIVE);
            companyRepository.save(company);
            log.info("Reactivated company workspace [{}] following successful payment {}", company.getName(), paymentId);
        }

        log.info("Successfully renewed subscription for company [{}] via gateway reference {}", company.getName(), gatewaySubId);
    }

    /**
     * Webhook Handler: Payment Failed / Past Due
     */
    @Transactional
    public void handlePaymentFailed(String gatewaySubId, String reason) {
        Optional<CompanySubscription> subOpt = subscriptionRepository.findByGatewaySubscriptionId(gatewaySubId);
        if (subOpt.isEmpty()) return;

        CompanySubscription sub = subOpt.get();
        sub.setStatus(CompanySubscription.SubscriptionStatus.PAST_DUE);
        subscriptionRepository.save(sub);

        log.warn("Subscription marked PAST_DUE for company [{}] due to: {}", sub.getCompany().getName(), reason);
    }

    /**
     * Webhook Handler: Subscription Cancelled or Terminated -> LOCK WORKSPACE
     */
    @Transactional
    public void handleSubscriptionLocked(String gatewaySubId) {
        Optional<CompanySubscription> subOpt = subscriptionRepository.findByGatewaySubscriptionId(gatewaySubId);
        if (subOpt.isEmpty()) return;

        CompanySubscription sub = subOpt.get();
        sub.setStatus(CompanySubscription.SubscriptionStatus.LOCKED);
        subscriptionRepository.save(sub);

        Company company = sub.getCompany();
        company.setStatus(Company.CompanyStatus.SUSPENDED);
        companyRepository.save(company);

        log.warn("LOCKED workspace for company [{}] due to subscription cancellation.", company.getName());
    }
}
