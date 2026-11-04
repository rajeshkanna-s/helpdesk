package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.config.BrowserSessionCookies;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.dto.PublicPlan;
import com.kuwy.helpdesk.services.*;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.AuthenticationException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/onboarding")
@RequiredArgsConstructor
public class OnboardingController {
    private final WorkspaceProvisioningService workspaces;
    private final SignupVerificationService verification;
    private final PlanCatalogService plans;
    private final AccountEmailService emails;
    private final CaptchaVerificationService captcha;
    private final RateLimiterService limiter;
    private final BrowserSessionService sessions;
    private final BrowserSessionCookies cookies;

    @GetMapping("/config")
    public Map<String, Object> configuration() {
        return Map.of("signupEnabled", emails.isReady() && captcha.isReady() && !plans.publicPlans().isEmpty(), "captchaSiteKey", captcha.publicSiteKey(),
                "googleEnabled", false, "microsoftEnabled", false);
    }

    @GetMapping("/check-subdomain")
    public ResponseEntity<?> checkSubdomain(@RequestParam String slug, HttpServletRequest request) {
        if (!limiter.allowAuthentication(request.getRemoteAddr(), request.getRemoteAddr(), "workspace-availability")) {
            return ResponseEntity.status(429).body(Map.of("available", false, "reason", "Too many requests. Please wait before trying again."));
        }
        return ResponseEntity.ok(workspaces.availability(slug));
    }

    @GetMapping("/plans")
    public List<PublicPlan> publicPlans() { return plans.publicPlans(); }

    @PostMapping("/send-verification")
    public ResponseEntity<?> sendVerification(@RequestBody Map<String, String> body, HttpServletRequest request) {
        cookies.requireBrowserMutation(request);
        captcha.verify(body.get("captchaToken"), request.getRemoteAddr(), "signup");
        return ResponseEntity.ok().headers(BrowserSessionCookies.noStore()).body(verification.send(body.get("email"), request));
    }

    @PostMapping("/signup")
    @Transactional(noRollbackFor = AuthenticationException.class)
    public ResponseEntity<LoginResponse> signup(@RequestBody WorkspaceProvisioningService.Signup request, HttpServletRequest httpRequest) {
        cookies.requireBrowserMutation(httpRequest);
        LoginResponse response = workspaces.provision(request, httpRequest);
        var session = sessions.openStaff(response.getToken(), false, httpRequest);
        response.setToken(null); response.setBrowserSession(true); response.setCsrfToken(session.csrfToken()); response.setSessionId(session.sessionId());
        return ResponseEntity.ok().headers(cookies.issue(session, "STAFF")).body(response);
    }

    public record CheckoutCalculation(String planTier, Boolean isAnnual, Integer agentCount, String currency) {}

    @PostMapping("/calculate-checkout")
    public Map<String, Object> calculate(@RequestBody CheckoutCalculation input) {
        if (input.currency() != null && !"INR".equals(input.currency())) throw new IllegalArgumentException("Only INR billing is currently supported.");
        PublicPlan plan = plans.requirePublicPlan(input.planTier());
        if (input.agentCount() != null && (input.agentCount() < 1 || input.agentCount() > plan.includedAgents())) {
            throw new IllegalArgumentException("Choose a plan with enough included staff seats.");
        }
        boolean annual = Boolean.TRUE.equals(input.isAnnual());
        BigDecimal subtotal = annual ? plan.yearlyPrice() : plan.monthlyPrice();
        BigDecimal tax = subtotal.multiply(new BigDecimal("0.18")).setScale(2, RoundingMode.HALF_UP);
        return Map.of("planCode", plan.code(), "planRevision", plan.revision(), "currency", "INR", "billingCycle", annual ? "ANNUAL" : "MONTHLY",
                "subtotal", subtotal, "gst", tax, "total", subtotal.add(tax), "includedAgents", plan.includedAgents());
    }
}
