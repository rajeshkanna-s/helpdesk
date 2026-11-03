package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "company_subscriptions")
@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class CompanySubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    @JsonIgnore
    private Company company;

    @Enumerated(EnumType.STRING)
    @Column(name = "plan_tier", nullable = false)
    private PlanTier planTier = PlanTier.STARTER;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", nullable = false)
    private BillingCycle billingCycle = BillingCycle.MONTHLY;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal amount = BigDecimal.valueOf(2999.00);

    @Column(nullable = false, length = 10)
    private String currency = "INR";

    @Column(name = "gateway_provider", length = 50)
    private String gatewayProvider = "RAZORPAY";

    @Column(name = "gateway_subscription_id", length = 100)
    private String gatewaySubscriptionId;

    @Column(name = "agent_limit", nullable = false)
    private Integer agentLimit = 5;

    @Column(name = "ticket_limit_monthly", nullable = false)
    private Integer ticketLimitMonthly = 1000;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SubscriptionStatus status = SubscriptionStatus.ACTIVE;

    @Column(name = "current_period_start", nullable = false)
    private LocalDateTime currentPeriodStart = LocalDateTime.now();

    @Column(name = "current_period_end", nullable = false)
    private LocalDateTime currentPeriodEnd = LocalDateTime.now().plusDays(30);

    @Column(name = "grace_period_ends_at")
    private LocalDateTime gracePeriodEndsAt;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;

    @Transient
    private Long companyId;

    public Long getCompanyId() {
        return company != null ? company.getId() : companyId;
    }

    public enum PlanTier {
        FREE, STARTER, PRO, ENTERPRISE
    }

    public enum BillingCycle {
        MONTHLY, ANNUAL
    }

    public enum SubscriptionStatus {
        ACTIVE, TRIAL, PAST_DUE, CANCELLED, LOCKED
    }
}

