package com.kuwy.helpdesk.config;

import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;

@Slf4j
@Component
public class JwtTokenProvider {

    private static final String COMPROMISED_SECRET = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";

    @Value("${kuwy.jwt.secret:}")
    private String jwtSecret;

    @Value("${kuwy.jwt.expiration-ms:86400000}")
    private long jwtExpirationMs;

    private SecretKey signingKey;

    @PostConstruct
    public void init() {
        // Enforce secret rotation: if the committed/leaked secret is detected or no env secret is supplied,
        // automatically generate a secure random 256-bit runtime key.
        if (jwtSecret == null || jwtSecret.isBlank() || COMPROMISED_SECRET.equalsIgnoreCase(jwtSecret.trim())) {
            signingKey = Jwts.SIG.HS256.key().build();
            log.warn("SECURITY NOTICE: The committed JWT secret has been revoked and rotated. Initialized a secure 256-bit runtime signing key.");
        } else {
            try {
                byte[] keyBytes = Decoders.BASE64.decode(jwtSecret.trim());
                if (keyBytes.length < 32) {
                    signingKey = Jwts.SIG.HS256.key().build();
                    log.warn("Provided JWT secret had insufficient entropy (< 256 bits). Generated secure random key.");
                } else {
                    signingKey = Keys.hmacShaKeyFor(keyBytes);
                    log.info("Initialized JWT signing key from secure environment configuration.");
                }
            } catch (Exception e) {
                signingKey = Jwts.SIG.HS256.key().build();
                log.warn("Failed to decode JWT secret. Initialized secure runtime key.");
            }
        }
    }

    private SecretKey getSigningKey() {
        if (signingKey == null) {
            init();
        }
        return signingKey;
    }

    public String generateToken(User user) {
        if (user == null || user.getId() == null || user.getId() <= 0
                || user.getEmail() == null || user.getEmail().isBlank()
                || !user.getEmail().equals(user.getEmail().trim())
                || user.getCompany() == null || user.getCompany().getId() == null
                || user.getCompany().getId() <= 0
                || user.getRole() == null || user.getRole().getRoleType() == null
                || user.getRole().getRoleType() == Role.RoleType.CUSTOMER
                || user.getAuthVersion() == null || user.getAuthVersion() < 0) {
            throw new IllegalArgumentException("Cannot issue a token for an incomplete staff identity.");
        }

        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpirationMs);

        return Jwts.builder()
                .subject(user.getEmail())
                .claim("userId", user.getId())
                .claim("displayName", user.getDisplayName())
                .claim("companyId", user.getCompany().getId())
                .claim("companyCode", user.getCompany().getCompanyCode())
                .claim("role", user.getRole().getRoleType().name())
                .claim("authVersion", user.getAuthVersion())
                .claim("type", "STAFF")
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(getSigningKey())
                .compact();
    }

    public String generateCustomerToken(String email, Long companyId, String subdomain) {
        if (email == null || email.isBlank() || companyId == null || companyId <= 0) {
            throw new IllegalArgumentException("Cannot issue customer token without valid identity.");
        }
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpirationMs);

        return Jwts.builder()
                .subject(email.trim().toLowerCase())
                .claim("companyId", companyId)
                .claim("subdomain", subdomain)
                .claim("role", "CUSTOMER")
                .claim("type", "PORTAL_CUSTOMER")
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(getSigningKey())
                .compact();
    }

    public String generateBrowserToken(String sessionId, String kind, Long subjectId, Long companyId,
                                       String email, String role, Long authVersion, long expirationSeconds) {
        if (sessionId == null || !sessionId.matches("[0-9a-fA-F-]{36}")
                || !("STAFF".equals(kind) || "CUSTOMER".equals(kind))
                || subjectId == null || subjectId <= 0 || companyId == null || companyId <= 0
                || email == null || email.isBlank() || !email.equals(email.trim())
                || role == null || authVersion == null || authVersion < 0 || expirationSeconds < 1 || expirationSeconds > 900) {
            throw new IllegalArgumentException("Cannot issue a browser token for an incomplete session.");
        }
        Role.RoleType roleType = Role.RoleType.valueOf(role);
        if ("CUSTOMER".equals(kind) != (roleType == Role.RoleType.CUSTOMER)) {
            throw new IllegalArgumentException("Session audience and role must match.");
        }
        Date now = new Date();
        return Jwts.builder().subject(email).claim("type", "BROWSER_SESSION")
                .claim("kind", kind).claim("sid", sessionId).claim("subjectId", subjectId)
                .claim("companyId", companyId).claim("role", role).claim("authVersion", authVersion)
                .issuedAt(now).expiration(new Date(now.getTime() + expirationSeconds * 1000))
                .signWith(getSigningKey()).compact();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token);
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    public boolean validateCustomerToken(String token, Long expectedCompanyId, String expectedEmail) {
        try {
            Claims claims = getClaimsFromToken(token);
            String role = claims.get("role", String.class);
            String type = claims.get("type", String.class);
            Long companyId = ((Number) claims.get("companyId")).longValue();
            String email = claims.getSubject();

            if (!"CUSTOMER".equals(role) || !"PORTAL_CUSTOMER".equals(type)) {
                return false;
            }
            if (expectedCompanyId != null && !expectedCompanyId.equals(companyId)) {
                return false;
            }
            if (expectedEmail != null && !expectedEmail.trim().equalsIgnoreCase(email)) {
                return false;
            }
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    public Claims getClaimsFromToken(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
