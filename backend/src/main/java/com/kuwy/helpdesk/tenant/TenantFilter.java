package com.kuwy.helpdesk.tenant;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

@Slf4j
@Component
@RequiredArgsConstructor
public class TenantFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            String authHeader = request.getHeader("Authorization");
            String token = null;

            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                token = authHeader.substring(7).trim();
            }

            if (token != null && jwtTokenProvider.validateToken(token)) {
                Claims claims = jwtTokenProvider.getClaimsFromToken(token);
                String email = claims.getSubject();
                Long userId = claims.get("userId", Long.class);
                Long tokenCompanyId = claims.get("companyId", Long.class);
                String role = claims.get("role", String.class);
                if (role == null) role = "AGENT";

                Long resolvedCompanyId = tokenCompanyId;

                // Only SUPER_ADMIN is allowed to switch tenants via X-Company-ID header
                if ("SUPER_ADMIN".equalsIgnoreCase(role)) {
                    String overrideHeader = request.getHeader("X-Company-ID");
                    if (overrideHeader != null && !overrideHeader.isBlank()) {
                        try {
                            resolvedCompanyId = Long.parseLong(overrideHeader.trim());
                        } catch (NumberFormatException ignored) {}
                    }
                } else {
                    // For all normal company admins and agents, NEVER trust X-Company-ID if it differs from the signed JWT!
                    String untrustedHeader = request.getHeader("X-Company-ID");
                    if (untrustedHeader != null && !untrustedHeader.isBlank()) {
                        try {
                            Long requestedId = Long.parseLong(untrustedHeader.trim());
                            if (tokenCompanyId != null && !tokenCompanyId.equals(requestedId)) {
                                log.warn("SECURITY ALERT: User [{}] from company [{}] attempted to spoof X-Company-ID [{}]! Blocked override.",
                                        email, tokenCompanyId, requestedId);
                            }
                        } catch (NumberFormatException ignored) {}
                    }
                }

                TenantContext.setContext(resolvedCompanyId, userId, role, email);

                // Set Spring Security context
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        email,
                        null,
                        Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role))
                );
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } else {
                // Unauthenticated request (Public portal, webhooks, or health checks)
                String companyIdHeader = request.getHeader("X-Company-ID");
                if (companyIdHeader != null && !companyIdHeader.isBlank()) {
                    try {
                        TenantContext.setCompanyId(Long.parseLong(companyIdHeader.trim()));
                    } catch (NumberFormatException ignored) {}
                }
            }

            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            SecurityContextHolder.clearContext();
        }
    }
}
