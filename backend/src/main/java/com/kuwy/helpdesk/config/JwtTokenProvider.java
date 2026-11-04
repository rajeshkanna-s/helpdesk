package com.kuwy.helpdesk.config;

import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;

@Component
public class JwtTokenProvider {

    @Value("${kuwy.jwt.secret}")
    private String jwtSecret;

    @Value("${kuwy.jwt.expiration-ms}")
    private long jwtExpirationMs;

    private SecretKey getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(jwtSecret);
        return Keys.hmacShaKeyFor(keyBytes);
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
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(getSigningKey())
                .compact();
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

    public Claims getClaimsFromToken(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
