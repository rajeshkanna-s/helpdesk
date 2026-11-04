package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.CompanySubscription;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.CompanySubscriptionRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/v1/subscriptions")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class SubscriptionController {

    private final CompanySubscriptionRepository subscriptionRepository;
    private final CompanyRepository companyRepository;

    @GetMapping("/current")
    public ResponseEntity<CompanySubscription> getCurrentSubscription(
            @RequestParam(required = false) Long companyId
    ) {
        Long targetCompanyId = (companyId != null) ? companyId : TenantContext.getCompanyId();
        TenantContext.assertAccessTo(targetCompanyId);

        final Long resolvedCompanyId = targetCompanyId;
        CompanySubscription sub = subscriptionRepository.findByCompanyId(resolvedCompanyId)
                .orElseGet(() -> {
                    Company company = companyRepository.findById(resolvedCompanyId).orElse(null);
                    CompanySubscription newSub = new CompanySubscription();
                    newSub.setCompany(company);
                    newSub.setPlanTier(CompanySubscription.PlanTier.STARTER);
                    newSub.setAmount(BigDecimal.valueOf(2499.00));
                    newSub.setAgentLimit(5);
                    newSub.setTicketLimitMonthly(1000);
                    newSub.setStatus(CompanySubscription.SubscriptionStatus.ACTIVE);
                    return subscriptionRepository.save(newSub);
                });

        return ResponseEntity.ok(sub);
    }

    @PostMapping("/checkout")
    public ResponseEntity<CompanySubscription> upgradeSubscription(
            @RequestBody CheckoutDto dto,
            @RequestParam(required = false) Long companyId
    ) {
        Long targetCompanyId = companyId != null ? companyId : TenantContext.getCompanyId();
        TenantContext.assertCompanyAdminAccessTo(targetCompanyId);

        Company company = companyRepository.findById(targetCompanyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found: " + targetCompanyId));

        CompanySubscription.PlanTier tier = CompanySubscription.PlanTier.valueOf(dto.getPlanTier().toUpperCase());

        CompanySubscription sub = subscriptionRepository.findByCompanyId(targetCompanyId)
                .orElseGet(() -> {
                    CompanySubscription newSub = new CompanySubscription();
                    newSub.setCompany(company);
                    return newSub;
                });

        sub.setPlanTier(tier);
        sub.setGatewayProvider(dto.getGateway() != null ? dto.getGateway() : "RAZORPAY");
        sub.setGatewaySubscriptionId("order_" + System.currentTimeMillis());

        if (tier == CompanySubscription.PlanTier.FREE) {
            sub.setAmount(BigDecimal.ZERO);
            sub.setAgentLimit(2);
            sub.setTicketLimitMonthly(100);
            sub.setStatus(CompanySubscription.SubscriptionStatus.ACTIVE);
            sub.setCurrentPeriodStart(LocalDateTime.now());
            sub.setCurrentPeriodEnd(LocalDateTime.now().plusYears(1));
            company.setPlanName(tier.name());
            company.setMaxAgents(sub.getAgentLimit());
            companyRepository.save(company);
        } else {
            // For paid plans: Set to TRIAL / PENDING until payment webhook verifies capture
            if (tier == CompanySubscription.PlanTier.STARTER) {
                sub.setAmount(BigDecimal.valueOf(2499.00));
                sub.setAgentLimit(5);
                sub.setTicketLimitMonthly(1000);
            } else {
                sub.setAmount(BigDecimal.valueOf(5999.00));
                sub.setAgentLimit(25);
                sub.setTicketLimitMonthly(5000);
            }
            sub.setStatus(CompanySubscription.SubscriptionStatus.TRIAL);
            sub.setCurrentPeriodStart(LocalDateTime.now());
            sub.setCurrentPeriodEnd(LocalDateTime.now().plusDays(14));
            company.setPlanName(tier.name());
            company.setMaxAgents(sub.getAgentLimit());
            companyRepository.save(company);
        }

        return ResponseEntity.ok(subscriptionRepository.save(sub));
    }

    @Data
    public static class CheckoutDto {
        private String planTier;
        private String gateway;
    }
}
