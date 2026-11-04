package com.kuwy.helpdesk.config;

import com.kuwy.helpdesk.tenant.TenantFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class MultiTenantSecurityConfig {

    private final TenantFilter tenantFilter;

    @Value("${kuwy.security.allowed-origins:http://localhost:5173,http://localhost:5174}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .httpBasic(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            // Current staff authentication is bearer-only; cookie sessions must enable CSRF.
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/error").permitAll()
                .requestMatchers(HttpMethod.GET,
                        "/api/v1/auth/lookup-workspace", "/api/v1/onboarding/check-subdomain",
                        "/api/v1/onboarding/plans", "/api/v1/portal/*", "/api/v1/portal/*/kb/articles").permitAll()
                .requestMatchers(HttpMethod.POST,
                        "/api/v1/auth/login", "/api/v1/auth/verify-2fa",
                        "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password",
                        "/api/v1/auth/validate-reset-token", "/api/v1/invitations/validate",
                        "/api/v1/invitations/accept", "/api/v1/onboarding/send-verification",
                        "/api/v1/onboarding/signup", "/api/v1/onboarding/calculate-checkout",
                        "/api/v1/portal/*/request-otp", "/api/v1/portal/*/verify-otp",
                        "/api/v1/portal/*/demo-login", "/api/v1/portal/*/kb/articles/*/vote").permitAll()
                // These integrations must remain closed until their proof checks are implemented.
                .requestMatchers("/api/v1/webhooks/**").denyAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/subscriptions/checkout").denyAll()
                .requestMatchers("/api/v1/portal/**").hasRole("CUSTOMER")
                .requestMatchers("/api/v1/admin/**").hasRole("SUPER_ADMIN")
                .requestMatchers("/api/v1/invitations/**").hasAnyRole("SUPER_ADMIN", "COMPANY_ADMIN")
                .requestMatchers("/api/v1/auth/2fa/**").hasAnyRole("SUPER_ADMIN", "COMPANY_ADMIN", "TEAM_LEAD", "AGENT", "LIGHT_AGENT")
                .requestMatchers(HttpMethod.GET, "/api/**").hasAnyRole("SUPER_ADMIN", "COMPANY_ADMIN", "TEAM_LEAD", "AGENT", "LIGHT_AGENT")
                .requestMatchers("/api/**").hasAnyRole("SUPER_ADMIN", "COMPANY_ADMIN", "TEAM_LEAD", "AGENT")
                .anyRequest().denyAll()
            )
            .exceptionHandling(errors -> errors
                    .authenticationEntryPoint((request, response, exception) -> {
                        response.setStatus(401);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"error\":\"Authentication is required.\"}");
                    })
                    .accessDeniedHandler((request, response, exception) -> {
                        response.setStatus(403);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"error\":\"This action is not permitted.\"}");
                    }))
            .addFilterBefore(tenantFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim).filter(origin -> !origin.isEmpty()).toList();
        if (origins.isEmpty() || origins.stream().anyMatch(origin -> origin.contains("*"))) {
            throw new IllegalStateException("Explicit trusted web origins must be configured.");
        }
        configuration.setAllowedOrigins(origins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new CredentialPasswordEncoder();
    }
}
