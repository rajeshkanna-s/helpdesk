package com.kuwy.helpdesk.models;

import com.kuwy.helpdesk.dto.PublicPlan;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "plan_definitions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlanDefinition {
    @Id @Column(length = 30, updatable = false) private String code;
    @Column(name = "display_name", nullable = false, length = 100) private String displayName;
    @Column(nullable = false, length = 2000) private String description;
    @Enumerated(EnumType.STRING)
    @Column(name = "base_tier", nullable = false, length = 16, columnDefinition = "VARCHAR(16)") private BaseTier baseTier;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16, columnDefinition = "VARCHAR(16)") private Status status;
    @Column(nullable = false, length = 3) private String currency;
    @Column(name = "monthly_price", nullable = false, precision = 14, scale = 2) private BigDecimal monthlyPrice;
    @Column(name = "yearly_price", nullable = false, precision = 14, scale = 2) private BigDecimal yearlyPrice;
    @Column(name = "included_agents", nullable = false) private int includedAgents;
    @Column(name = "ticket_limit_monthly", nullable = false) private int ticketLimitMonthly;
    @Column(name = "trial_days", nullable = false) private int trialDays;
    @Column(name = "storage_bytes", nullable = false) private long storageBytes;
    @Column(name = "features_json", nullable = false, columnDefinition = "JSON") private String featuresJson;
    @Column(nullable = false) private long revision;
    @Version @Column(name = "row_version", nullable = false) private Long rowVersion;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by_user_id") private Long updatedByUserId;

    public PlanDefinition(String code) {
        PublicPlan.requireCode(code);
        this.code = code;
    }

    public void revise(PublicPlan terms, String featuresJson, Long actorId, Instant at) {
        if (!code.equals(terms.code()) || terms.revision() != Math.addExact(revision, 1)
                || actorId == null || actorId <= 0 || at == null)
            throw new IllegalArgumentException("A new revision and current actor are required.");
        displayName = terms.displayName();
        description = terms.description();
        baseTier = terms.baseTier();
        status = terms.status();
        currency = terms.currency();
        monthlyPrice = terms.monthlyPrice();
        yearlyPrice = terms.yearlyPrice();
        includedAgents = terms.includedAgents();
        ticketLimitMonthly = terms.ticketLimitMonthly();
        trialDays = terms.trialDays();
        storageBytes = terms.storageBytes();
        this.featuresJson = featuresJson;
        revision = terms.revision();
        updatedAt = at;
        updatedByUserId = actorId;
    }

    public enum BaseTier { FREE, STARTER, PRO, ENTERPRISE }
    public enum Status { DRAFT, PUBLIC, HIDDEN, RETIRED }
}
