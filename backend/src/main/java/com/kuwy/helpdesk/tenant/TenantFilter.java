package com.kuwy.helpdesk.tenant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class TenantFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            String companyIdHeader = request.getHeader("X-Company-ID");
            if (companyIdHeader != null && !companyIdHeader.isBlank()) {
                try {
                    TenantContext.setCompanyId(Long.parseLong(companyIdHeader.trim()));
                } catch (NumberFormatException ignored) {
                }
            } else {
                // Default to Company 1 (Kuwy) if not explicitly set for development
                TenantContext.setCompanyId(1L);
            }
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}
