package com.kuwy.helpdesk.tenant;

import com.kuwy.helpdesk.config.JwtTokenProvider;
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
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.List;

@Component
@RequiredArgsConstructor
public class TenantFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
        try {
            String authHeader = request.getHeader("Authorization");
            String token = null;

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
                    if ("CUSTOMER".equals(roleObj)) {
                        String uri = request.getRequestURI();
                        if (uri == null || !uri.startsWith("/api/v1/portal/")) {
                            throw new IllegalArgumentException("Invalid staff role.");
                        }
                        String custEmail = claims.getSubject();
                        Long custCompanyId = requiredLongClaim(claims, "companyId", 1);
                        TenantContext.setContext(custCompanyId, 0L, "CUSTOMER", custEmail);
                        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                                custEmail,
                                null,
                                List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER"))
                        );
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                        filterChain.doFilter(request, response);
                        return;
                    }

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
