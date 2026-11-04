package com.kuwy.helpdesk.tenant;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.config.BrowserSessionCookies;
import com.kuwy.helpdesk.services.BrowserSessionService;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.UserRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class TenantFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final UserRepository userRepository;
    private final BrowserSessionService browserSessions;
    private final BrowserSessionCookies browserCookies;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
        try {
            if (isPublicIdentityEndpoint(request)) {
                filterChain.doFilter(request, response);
                return;
            }
            String authHeader = request.getHeader("Authorization");
            String token = null;

            if (authHeader == null) {
                String kind = request.getRequestURI().startsWith("/api/v1/portal/") ? "CUSTOMER" : "STAFF";
                String access = browserCookies.access(request, kind);
                if (access != null) {
                    try {
                        boolean mutation = !Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod());
                        BrowserSessionService.Identity identity = browserSessions.authenticate(access, kind,
                                request.getHeader(BrowserSessionCookies.CSRF_HEADER), mutation);
                        if ("STAFF".equals(kind) && !isAccountSecurityRoute(request)
                                && com.kuwy.helpdesk.util.AccountSecurityPolicy.needsSetup(userRepository.findById(identity.subjectId())
                                .orElseThrow(() -> new org.springframework.security.authentication.BadCredentialsException("Account unavailable.")))) {
                            reject(response, 403, "Authenticator setup is required before using this workspace.");
                            return;
                        }
                        Long companyId = identity.companyId();
                        if ("SUPER_ADMIN".equals(identity.role())) companyId = platformOverride(request, companyId);
                        TenantContext.setContext(companyId, identity.subjectId(), identity.role(), identity.email());
                        TenantContext.setBrowserSessionId(identity.sessionId());
                        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(identity.email(), null,
                                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + identity.role()))));
                    } catch (SecurityException invalidCsrf) {
                        reject(response, 403, "Session verification failed.");
                        return;
                    } catch (AuthenticationException | IllegalArgumentException invalidSession) {
                        reject(response, 401, "Sign in again to continue.");
                        return;
                    } catch (RuntimeException unavailable) {
                        reject(response, 503, "Authentication service unavailable.");
                        return;
                    }
                    filterChain.doFilter(request, response);
                    return;
                }
            }

            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                token = authHeader.substring(7).trim();
            }

            if (token != null) {
                String email;
                Long userId;
                Long tokenCompanyId;
                Long authVersion;
                Role.RoleType role;
                try {
                    if (!jwtTokenProvider.validateToken(token)) {
                        response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid authentication.");
                        return;
                    }
                    Claims claims = jwtTokenProvider.getClaimsFromToken(token);
                    Object roleObj = claims.get("role");
                    if ("CUSTOMER".equals(roleObj) || "BROWSER_SESSION".equals(claims.get("type"))) throw new IllegalArgumentException("Use the appropriate cookie session.");

                    userId = requiredLongClaim(claims, "userId", 1);
                    tokenCompanyId = requiredLongClaim(claims, "companyId", 1);
                    authVersion = requiredLongClaim(claims, "authVersion", 0);
                    if (!(claims.get(Claims.SUBJECT) instanceof String subject) || subject.isBlank()
                            || !subject.equals(subject.trim())
                            || !(roleObj instanceof String roleName)) {
                        throw new IllegalArgumentException("Invalid token claims.");
                    }
                    email = subject;
                    role = Role.RoleType.valueOf(roleName);
                } catch (RuntimeException invalidToken) {
                    response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid authentication.");
                    return;
                }

                try {
                    User user = userRepository.findById(userId).orElse(null);
                    if (user == null || !userId.equals(user.getId())
                            || !Boolean.TRUE.equals(user.getIsActive())
                            || !"ACTIVE".equalsIgnoreCase(user.getStatus())
                            || !email.equals(user.getEmail())
                            || !authVersion.equals(user.getAuthVersion())
                            || user.getRole() == null || user.getRole().getRoleType() != role
                            || user.getCompany() == null || !tokenCompanyId.equals(user.getCompany().getId())
                            || user.getCompany().getStatus() == null
                            || (role != Role.RoleType.SUPER_ADMIN
                                && user.getCompany().getStatus() != Company.CompanyStatus.ACTIVE
                                && user.getCompany().getStatus() != Company.CompanyStatus.TRIAL)) {
                        response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid authentication.");
                        return;
                    }
                    if (com.kuwy.helpdesk.util.AccountSecurityPolicy.needsSetup(user) && !isAccountSecurityRoute(request)) {
                        reject(response, 403, "Authenticator setup is required before using this workspace.");
                        return;
                    }
                } catch (RuntimeException authenticationUnavailable) {
                    response.sendError(HttpServletResponse.SC_SERVICE_UNAVAILABLE, "Authentication service unavailable.");
                    return;
                }

                Long resolvedCompanyId = tokenCompanyId;

                // Only a current, verified platform administrator may override the signed tenant.
                if (role == Role.RoleType.SUPER_ADMIN) {
                    String overrideHeader = request.getHeader("X-Company-ID");
                    if (overrideHeader != null && !overrideHeader.isBlank()) {
                        try {
                            long requestedId = Long.parseLong(overrideHeader.trim());
                            if (requestedId > 0) {
                                resolvedCompanyId = requestedId;
                            }
                        } catch (NumberFormatException ignored) {}
                    }
                }

                TenantContext.setContext(resolvedCompanyId, userId, role.name(), email);

                if (TenantContext.isAuthenticated()) {
                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                            email,
                            null,
                            Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + TenantContext.getUserRole()))
                    );
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                } else {
                    TenantContext.clear();
                    response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid authentication.");
                    return;
                }
            }

            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            SecurityContextHolder.clearContext();
        }
    }

    private Long platformOverride(HttpServletRequest request, Long signedCompanyId) {
        String override = request.getHeader("X-Company-ID");
        try {
            long parsed = override == null ? 0 : Long.parseLong(override.trim());
            return parsed > 0 ? parsed : signedCompanyId;
        } catch (NumberFormatException invalid) {
            return signedCompanyId;
        }
    }

    private void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }

    private boolean isPublicIdentityEndpoint(HttpServletRequest request) {
        if ("OPTIONS".equals(request.getMethod())) return true;
        String path = request.getRequestURI();
        if ("GET".equals(request.getMethod()) && "/api/v1/plans".equals(path)) return true;
        if (Set.of("/api/v1/auth/login", "/api/v1/auth/verify-2fa", "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password",
                "/api/v1/auth/validate-reset-token", "/api/v1/auth/lookup-workspace", "/api/v1/auth/session", "/api/v1/auth/refresh",
                "/api/v1/auth/logout", "/api/v1/invitations/validate", "/api/v1/invitations/accept").contains(path)) return true;
        return path.startsWith("/api/v1/onboarding/") || path.matches("/api/v1/portal/[^/]+/(request-otp|verify-otp|demo-login|session|refresh|logout)")
                || ("GET".equals(request.getMethod()) && (path.matches("/api/v1/portal/[^/]+") || path.matches("/api/v1/portal/[^/]+/kb/articles")));
    }

    private boolean isAccountSecurityRoute(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/v1/auth/2fa/") || path.startsWith("/api/v1/auth/sessions")
                || Set.of("/api/v1/auth/account", "/api/v1/auth/change-password", "/api/v1/auth/logout-all").contains(path);
    }

    private Long requiredLongClaim(Claims claims, String name, long minimum) {
        Object value = claims.get(name);
        // Do not coerce strings or truncate fractional/out-of-range JSON numbers into identities.
        if (!(value instanceof Long || value instanceof Integer || value instanceof Short || value instanceof Byte)
                || ((Number) value).longValue() < minimum) {
            throw new IllegalArgumentException("Invalid token claims.");
        }
        return ((Number) value).longValue();
    }
}
