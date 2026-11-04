package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.config.BrowserSessionCookies;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.ContactRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.services.BrowserSessionService;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class BrowserSessionController {
    private final BrowserSessionService sessions;
    private final BrowserSessionCookies cookies;
    private final UserRepository users;
    private final ContactRepository contacts;
    private final CompanyRepository companies;

    @GetMapping("/auth/session")
    public ResponseEntity<LoginResponse> staffSession(HttpServletRequest request) {
        Map<String, Object> state = sessions.bootstrap(cookies.refresh(request, "STAFF"), "STAFF");
        return ResponseEntity.ok().headers(BrowserSessionCookies.noStore()).body(staffResponse(state));
    }

    @PostMapping("/auth/refresh")
    public ResponseEntity<LoginResponse> refreshStaff(HttpServletRequest request) {
        cookies.requireBrowserMutation(request);
        var tokens = sessions.refresh(cookies.refresh(request, "STAFF"), "STAFF", request.getHeader(BrowserSessionCookies.CSRF_HEADER));
        return ResponseEntity.ok().headers(cookies.issue(tokens, "STAFF"))
                .body(staffResponse(sessions.bootstrap(tokens.refreshToken(), "STAFF")));
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Map<String, Object>> logoutStaff(HttpServletRequest request) {
        cookies.requireBrowserMutation(request);
        logout(request, "STAFF", null);
        return ResponseEntity.ok().headers(cookies.clear("STAFF")).body(Map.of("success", true));
    }

    @GetMapping("/auth/sessions")
    public ResponseEntity<?> staffSessions() {
        return ResponseEntity.ok().headers(BrowserSessionCookies.noStore())
                .body(sessions.listActive(TenantContext.requireUserId(), "STAFF", TenantContext.getBrowserSessionId()));
    }

    @GetMapping("/auth/account")
    public ResponseEntity<?> account() {
        User user = users.findById(TenantContext.requireUserId()).orElseThrow(() -> new BadCredentialsException("Account unavailable."));
        return ResponseEntity.ok().headers(BrowserSessionCookies.noStore()).body(Map.of(
                "email", user.getEmail(), "displayName", java.util.Objects.toString(user.getDisplayName(), user.getEmail()),
                "twoFactorEnabled", Boolean.TRUE.equals(user.getIsTwoFactorEnabled()),
                "twoFactorRequired", com.kuwy.helpdesk.util.AccountSecurityPolicy.requiresTwoFactor(user),
                "sessionId", java.util.Objects.toString(TenantContext.getBrowserSessionId(), "")));
    }

    @DeleteMapping("/auth/sessions/{sessionId}")
    public ResponseEntity<?> revokeStaffSession(@PathVariable String sessionId) {
        sessions.revoke(sessionId, TenantContext.requireUserId(), "STAFF");
        return ResponseEntity.ok().body(Map.of("success", true));
    }

    @PostMapping("/auth/logout-all")
    public ResponseEntity<?> logoutAllStaff() {
        sessions.revokeAll(TenantContext.requireUserId(), "STAFF");
        return ResponseEntity.ok().headers(cookies.clear("STAFF")).body(Map.of("success", true));
    }

    @GetMapping("/portal/{subdomain}/session")
    public ResponseEntity<?> customerSession(@PathVariable String subdomain, HttpServletRequest request) {
        return ResponseEntity.ok().headers(BrowserSessionCookies.noStore())
                .body(customerResponse(subdomain, sessions.bootstrap(cookies.refresh(request, "CUSTOMER"), "CUSTOMER")));
    }

    @PostMapping("/portal/{subdomain}/refresh")
    public ResponseEntity<?> refreshCustomer(@PathVariable String subdomain, HttpServletRequest request) {
        cookies.requireBrowserMutation(request);
        customerResponse(subdomain, sessions.bootstrap(cookies.refresh(request, "CUSTOMER"), "CUSTOMER"));
        var tokens = sessions.refresh(cookies.refresh(request, "CUSTOMER"), "CUSTOMER", request.getHeader(BrowserSessionCookies.CSRF_HEADER));
        return ResponseEntity.ok().headers(cookies.issue(tokens, "CUSTOMER"))
                .body(customerResponse(subdomain, sessions.bootstrap(tokens.refreshToken(), "CUSTOMER")));
    }

    @PostMapping("/portal/{subdomain}/logout")
    public ResponseEntity<?> logoutCustomer(@PathVariable String subdomain, HttpServletRequest request) {
        cookies.requireBrowserMutation(request);
        logout(request, "CUSTOMER", subdomain);
        return ResponseEntity.ok().headers(cookies.clear("CUSTOMER")).body(Map.of("success", true));
    }

    private void logout(HttpServletRequest request, String kind, String subdomain) {
        String refresh = cookies.refresh(request, kind);
        if (refresh == null) return;
        Map<String, Object> state = sessions.bootstrap(refresh, kind);
        if (subdomain != null) customerResponse(subdomain, state);
        if (!java.security.MessageDigest.isEqual(String.valueOf(state.get("csrfToken")).getBytes(java.nio.charset.StandardCharsets.UTF_8),
                String.valueOf(request.getHeader(BrowserSessionCookies.CSRF_HEADER)).getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            throw new SecurityException("Session verification failed.");
        }
        BrowserSessionService.Identity identity = (BrowserSessionService.Identity) state.get("identity");
        sessions.revoke(identity.sessionId(), identity.subjectId(), kind);
    }

    private LoginResponse staffResponse(Map<String, Object> state) {
        BrowserSessionService.Identity identity = (BrowserSessionService.Identity) state.get("identity");
        User user = users.findById(identity.subjectId()).orElseThrow(() -> new BadCredentialsException("Session unavailable."));
        return LoginResponse.builder().userId(user.getId()).email(user.getEmail()).firstName(user.getFirstName())
                .lastName(user.getLastName()).displayName(user.getDisplayName()).roleName(user.getRole().getName())
                .roleType(user.getRole().getRoleType().name()).browserSession(true).csrfToken(String.valueOf(state.get("csrfToken")))
                .sessionId(identity.sessionId()).company(LoginResponse.CompanyInfo.builder()
                        .id(user.getCompany().getId()).companyCode(user.getCompany().getCompanyCode()).name(user.getCompany().getName())
                        .subdomain(user.getCompany().getSubdomain()).customDomain(user.getCompany().getCustomDomain())
                        .status(user.getCompany().getStatus().name()).logoUrl(user.getCompany().getLogoUrl())
                        .primaryColor(user.getCompany().getPrimaryColor()).planName(user.getCompany().getPlanName()).build())
                .mfaSetupRequired(com.kuwy.helpdesk.util.AccountSecurityPolicy.needsSetup(user)).build();
    }

    private Map<String, Object> customerResponse(String subdomain, Map<String, Object> state) {
        BrowserSessionService.Identity identity = (BrowserSessionService.Identity) state.get("identity");
        var company = companies.findBySubdomain(subdomain.toLowerCase(java.util.Locale.ROOT))
                .orElseThrow(() -> new BadCredentialsException("Customer workspace is unavailable."));
        if (!company.getId().equals(identity.companyId())) throw new BadCredentialsException("Sign in to this customer workspace.");
        var contact = contacts.findById(identity.subjectId()).orElseThrow(() -> new BadCredentialsException("Customer session is unavailable."));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("browserSession", true);
        result.put("csrfToken", state.get("csrfToken"));
        result.put("sessionId", identity.sessionId());
        result.put("companyId", company.getId());
        result.put("email", contact.getEmail());
        result.put("name", (contact.getFirstName() + " " + (contact.getLastName() == null ? "" : contact.getLastName())).trim());
        result.put("contactId", contact.getId());
        return result;
    }
}
