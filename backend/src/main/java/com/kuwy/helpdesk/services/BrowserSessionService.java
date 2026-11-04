package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * Open methods are internal post-verification handoffs, never public token-exchange endpoints.
 * Controllers must bind list/revoke arguments to an authenticated Identity and check mutation CSRF.
 * Bootstrap requires same-origin cookie proof, restrictive CORS and a no-store response, not URL tokens.
 */
@Service
@RequiredArgsConstructor
public class BrowserSessionService {
    public record Tokens(String sessionId, @JsonIgnore String accessToken, @JsonIgnore String refreshToken,
                         String csrfToken, long accessMaxAge, long refreshMaxAge) {
        @Override public String toString() { return "Tokens[redacted]"; }
    }
    public record Identity(String sessionId, String kind, Long subjectId, Long companyId,
                           String email, String role, Long authVersion) {}

    private static final long DAY = 86_400L;
    private static final int MAX_SESSIONS = 10;
    private final BrowserSessionRepository sessions;
    private final UserRepository users;
    private final ContactRepository contacts;
    private final CompanyRepository companies;
    private final JwtTokenProvider jwt;
    private final SecretCryptoService crypto;
    private final SecureRandom random = new SecureRandom();
    private Clock clock = Clock.systemUTC();

    @Transactional
    public Tokens openStaff(String freshlyVerifiedStaffJwt, boolean remember, HttpServletRequest request) {
        requireCrypto();
        Claims claims = claims(freshlyVerifiedStaffJwt);
        if (!"STAFF".equals(claims.get("type"))) throw invalid();
        Identity supplied = claimedIdentity(claims, null, "STAFF", "userId");
        Identity current = staff(users.findForAuthenticationById(supplied.subjectId()).orElseThrow(this::invalid), null);
        if (!supplied.equals(current)) throw invalid();
        requireCompany(current);
        if (!clock.instant().isBefore(claims.getExpiration().toInstant())) throw invalid();
        return create(current, remember, request);
    }

    @Transactional
    public Tokens openCustomer(Contact verifiedContact, HttpServletRequest request) {
        requireCrypto();
        Identity supplied = customer(verifiedContact, null);
        Identity current = customer(sessions.lockContact(supplied.subjectId()).orElseThrow(this::invalid), null);
        if (!supplied.equals(current)) throw invalid();
        requireCompany(current);
        return create(current, true, request);
    }

    @Transactional
    public Identity authenticate(String accessJwt, String expectedKind, String csrfHeader, boolean mutation) {
        requireCrypto();
        requireKind(expectedKind);
        Claims claims = claims(accessJwt);
        if (!"BROWSER_SESSION".equals(claims.get("type")) || !expectedKind.equals(claims.get("kind"))) throw invalid();
        UUID id = uuid(text(claims, "sid"));
        Identity supplied = claimedIdentity(claims, id.toString(), expectedKind, "subjectId");
        BrowserSession session = sessions.findForUpdate(id).orElseThrow(this::invalid);
        requireLive(session, id, expectedKind, clock.instant());
        Identity current = current(session);
        if (!supplied.equals(current)) throw invalid();
        String csrf = csrf(session);
        if (mutation) checkCsrf(csrfHeader, csrf);
        Instant now = clock.instant();
        requireLive(session, id, expectedKind, now);
        if (!now.isBefore(claims.getExpiration().toInstant())) throw invalid();
        touch(session, now);
        sessions.save(session);
        return current;
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public Tokens refresh(String refreshCookie, String expectedKind, String csrfHeader) {
        requireCrypto();
        requireKind(expectedKind);
        UUID id = refreshId(refreshCookie);
        BrowserSession session = sessions.findForUpdate(id).orElseThrow(this::invalid);
        requireLive(session, id, expectedKind, clock.instant());
        String csrf = csrf(session);
        checkCsrf(csrfHeader, csrf);
        String presented = hash(refreshCookie);
        if (sameHash(presented, session.getPreviousRefreshHash())) {
            session.setRevokedAt(clock.instant());
            sessions.save(session);
            throw invalid(); // This revocation must commit even though authentication failed.
        }
        if (!sameHash(presented, session.getRefreshHash())) throw invalid();
        current(session);
        Instant now = clock.instant();
        requireLive(session, id, expectedKind, now);
        String replacement = id + "." + randomToken();
        Tokens result = tokens(session, replacement, csrf, now);
        session.setPreviousRefreshHash(session.getRefreshHash());
        session.setRefreshHash(hash(replacement));
        touch(session, now);
        sessions.save(session);
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> bootstrap(String refreshCookie, String expectedKind) {
        requireCrypto();
        requireKind(expectedKind);
        UUID id = refreshId(refreshCookie);
        BrowserSession session = sessions.findById(id).orElseThrow(this::invalid);
        requireLive(session, id, expectedKind, clock.instant());
        if (!sameHash(hash(refreshCookie), session.getRefreshHash())) throw invalid();
        Identity identity = current(session);
        String csrf = csrf(session);
        requireLive(session, id, expectedKind, clock.instant());
        return Map.of("identity", identity, "csrfToken", csrf);
    }

    @Transactional
    public void revoke(String sessionId, Long subjectId, String kind) {
        requireSubject(subjectId);
        requireKind(kind);
        BrowserSession session = sessions.findForUpdate(uuid(sessionId)).orElseThrow(this::invalid);
        if (!subjectId.equals(session.getSubjectId()) || !kind.equals(session.getKind())) throw invalid();
        if (session.getRevokedAt() == null) {
            session.setRevokedAt(clock.instant());
            sessions.save(session);
        }
    }

    @Transactional
    public void revokeAll(Long subjectId, String kind) {
        requireSubject(subjectId);
        requireKind(kind);
        if ("STAFF".equals(kind)) {
            User user = users.findForAuthenticationById(subjectId).orElseThrow(this::invalid);
            user.invalidateAuthentication();
            users.save(user);
        } else {
            Contact contact = sessions.lockContact(subjectId).orElseThrow(this::invalid);
            contact.setAuthVersion(Math.addExact(contact.getAuthVersion() == null ? 0L : contact.getAuthVersion(), 1L));
            contacts.save(contact);
        }
        List<BrowserSession> batch;
        do {
            batch = sessions.findUnrevokedForUpdate(subjectId, kind, PageRequest.of(0, 100));
            Instant now = clock.instant();
            batch.forEach(session -> session.setRevokedAt(now));
            sessions.saveAll(batch);
            sessions.flush(); // Dirty checking advances @Version; the next page excludes this batch.
        } while (batch.size() == 100);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listActive(Long subjectId, String kind, String currentSessionId) {
        requireSubject(subjectId);
        requireKind(kind);
        return sessions.findActive(subjectId, kind, clock.instant(), PageRequest.of(0, MAX_SESSIONS)).stream()
                .map(s -> Map.<String, Object>of("sessionId", s.getId().toString(), "kind", s.getKind(),
                        "deviceLabel", s.getDeviceLabel(), "remoteAddr", s.getRemoteAddr(),
                        "createdAt", s.getCreatedAt(), "lastSeenAt", s.getLastSeenAt(),
                        "absoluteExpiresAt", s.getAbsoluteExpiresAt(), "idleExpiresAt", s.getIdleExpiresAt(),
                        "current", s.getId().toString().equals(currentSessionId))).toList();
    }

    private Tokens create(Identity identity, boolean remember, HttpServletRequest request) {
        Instant now = clock.instant();
        boolean superAdmin = "SUPER_ADMIN".equals(identity.role());
        boolean longLived = !superAdmin && (remember || "CUSTOMER".equals(identity.kind()));
        BrowserSession session = new BrowserSession();
        session.setId(UUID.randomUUID());
        session.setKind(identity.kind());
        session.setSubjectId(identity.subjectId());
        session.setCompanyId(identity.companyId());
        session.setEmail(identity.email());
        session.setRole(identity.role());
        session.setAuthVersion(identity.authVersion());
        session.setCreatedAt(now);
        session.setLastSeenAt(now);
        session.setAbsoluteExpiresAt(now.plusSeconds(superAdmin ? 8 * 3600L : longLived ? 30 * DAY : 12 * 3600L));
        session.setIdleExpiresAt(now.plusSeconds(longLived ? 7 * DAY : 1800));
        session.setDeviceLabel(bounded(request == null ? null : request.getHeader("User-Agent"), 160, "Unknown browser"));
        session.setRemoteAddr(bounded(request == null ? null : request.getRemoteAddr(), 64, "unknown"));
        String csrf = randomToken();
        session.setEncryptedCsrf(crypto.encrypt(csrf, "browser-session:" + session.getId()));
        if (session.getEncryptedCsrf() == null || session.getEncryptedCsrf().isBlank()) throw invalid();
        String refresh = session.getId() + "." + randomToken();
        session.setRefreshHash(hash(refresh));
        Tokens result = tokens(session, refresh, csrf, now);
        // Subject row is already locked, including the first-ever session, so parallel opens cannot exceed the cap.
        List<BrowserSession> active = sessions.findActiveForUpdate(identity.subjectId(), identity.kind(), now,
                PageRequest.of(0, MAX_SESSIONS));
        if (active.size() == MAX_SESSIONS) {
            active.get(0).setRevokedAt(now);
            sessions.save(active.get(0));
        }
        sessions.save(session);
        return result;
    }

    private Tokens tokens(BrowserSession session, String refresh, String csrf, Instant now) {
        long refreshAge = Duration.between(now, session.getAbsoluteExpiresAt()).getSeconds();
        long accessAge = Math.min(900, refreshAge);
        if (accessAge <= 0) throw invalid();
        String access = jwt.generateBrowserToken(session.getId().toString(), session.getKind(), session.getSubjectId(),
                session.getCompanyId(), session.getEmail(), session.getRole(), session.getAuthVersion(), accessAge);
        if (access == null || access.isBlank()) throw new IllegalStateException("Browser session issuance unavailable.");
        return new Tokens(session.getId().toString(), access, refresh, csrf, accessAge, refreshAge);
    }

    private Identity current(BrowserSession session) {
        String id = session.getId().toString();
        Identity snapshot = checked(new Identity(id, session.getKind(), session.getSubjectId(), session.getCompanyId(),
                session.getEmail(), session.getRole(), session.getAuthVersion()));
        Identity current = "STAFF".equals(snapshot.kind())
                ? staff(users.findById(snapshot.subjectId()).orElseThrow(this::invalid), id)
                : customer(contacts.findById(snapshot.subjectId()).orElseThrow(this::invalid), id);
        if (!snapshot.equals(current)) throw invalid();
        requireCompany(current);
        return current;
    }

    private Identity staff(User user, String sessionId) {
        if (user == null || !Boolean.TRUE.equals(user.getIsActive()) || !"ACTIVE".equalsIgnoreCase(user.getStatus())
                || user.getCompany() == null || user.getRole() == null || user.getRole().getRoleType() == null
                || user.getRole().getRoleType() == Role.RoleType.CUSTOMER) throw invalid();
        return checked(new Identity(sessionId, "STAFF", user.getId(), user.getCompany().getId(), user.getEmail(),
                user.getRole().getRoleType().name(), user.getAuthVersion()));
    }

    private Identity customer(Contact contact, String sessionId) {
        if (contact == null || contact.getCompany() == null || !Boolean.TRUE.equals(contact.getIsPortalUser())
                || !Boolean.FALSE.equals(contact.getIsBlocked())) throw invalid();
        return checked(new Identity(sessionId, "CUSTOMER", contact.getId(), contact.getCompany().getId(),
                contact.getEmail(), "CUSTOMER", contact.getAuthVersion()));
    }

    private Identity checked(Identity identity) {
        requireKind(identity.kind());
        requireSubject(identity.subjectId());
        requireSubject(identity.companyId());
        if (identity.email() == null || identity.email().isBlank() || identity.email().length() > 254
                || !identity.email().equals(identity.email().trim()) || identity.role() == null
                || identity.authVersion() == null || identity.authVersion() < 0) throw invalid();
        return identity;
    }

    private void requireCompany(Identity identity) {
        Company company = companies.findById(identity.companyId()).orElseThrow(this::invalid);
        if (!identity.companyId().equals(company.getId()) || company.getStatus() == null
                || (!"SUPER_ADMIN".equals(identity.role()) && company.getStatus() != Company.CompanyStatus.ACTIVE
                && company.getStatus() != Company.CompanyStatus.TRIAL)) throw invalid();
    }

    private void requireLive(BrowserSession session, UUID id, String kind, Instant now) {
        if (!id.equals(session.getId()) || !kind.equals(session.getKind()) || session.getRevokedAt() != null
                || session.getCreatedAt() == null || session.getLastSeenAt() == null
                || session.getAbsoluteExpiresAt() == null || session.getIdleExpiresAt() == null
                || !now.isBefore(session.getAbsoluteExpiresAt()) || !now.isBefore(session.getIdleExpiresAt())
                || !session.getLastSeenAt().isBefore(session.getIdleExpiresAt())) throw invalid();
    }

    private void touch(BrowserSession session, Instant now) {
        // Once capped by absolute expiry, this smaller idle window still always caps at that same deadline.
        Instant idle = now.plus(Duration.between(session.getLastSeenAt(), session.getIdleExpiresAt()));
        session.setLastSeenAt(now);
        session.setIdleExpiresAt(idle.isBefore(session.getAbsoluteExpiresAt()) ? idle : session.getAbsoluteExpiresAt());
    }

    private String csrf(BrowserSession session) {
        try {
            String csrf = crypto.decrypt(session.getEncryptedCsrf(), "browser-session:" + session.getId());
            if (csrf == null || !csrf.matches("[A-Za-z0-9_-]{43}")) throw invalid();
            return csrf;
        } catch (RuntimeException failure) { throw invalid(); }
    }

    private void checkCsrf(String supplied, String expected) {
        if (supplied == null || supplied.length() > 256 || !sameHash(hash(supplied), hash(expected))) {
            throw new SecurityException("Browser session verification failed.");
        }
    }

    private Claims claims(String token) {
        try {
            if (token == null || token.isBlank() || token.length() > 8192) throw invalid();
            Claims claims = jwt.getClaimsFromToken(token);
            if (claims == null || claims.getExpiration() == null
                    || !clock.instant().isBefore(claims.getExpiration().toInstant())) throw invalid();
            return claims;
        } catch (RuntimeException failure) { throw invalid(); }
    }

    private Identity claimedIdentity(Claims claims, String id, String kind, String subjectKey) {
        return checked(new Identity(id, kind, number(claims, subjectKey, 1), number(claims, "companyId", 1),
                text(claims, Claims.SUBJECT), text(claims, "role"), number(claims, "authVersion", 0)));
    }

    private Long number(Claims claims, String key, long minimum) {
        Object value = claims.get(key);
        if (!(value instanceof Long || value instanceof Integer || value instanceof Short || value instanceof Byte)
                || ((Number) value).longValue() < minimum) throw invalid();
        return ((Number) value).longValue();
    }

    private String text(Claims claims, String key) {
        if (!(claims.get(key) instanceof String value) || value.isBlank()) throw invalid();
        return value;
    }

    private UUID refreshId(String value) {
        if (value == null || value.length() != 80 || value.charAt(36) != '.'
                || !value.substring(37).matches("[A-Za-z0-9_-]{43}")) throw invalid();
        return uuid(value.substring(0, 36));
    }

    private UUID uuid(String value) {
        try {
            if (value == null || value.length() != 36) throw invalid();
            UUID id = UUID.fromString(value);
            if (!id.toString().equals(value)) throw invalid();
            return id;
        } catch (IllegalArgumentException failure) { throw invalid(); }
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException failure) { throw new IllegalStateException("Session hashing unavailable."); }
    }

    private boolean sameHash(String left, String right) {
        return left != null && right != null && MessageDigest.isEqual(
                left.getBytes(StandardCharsets.US_ASCII), right.getBytes(StandardCharsets.US_ASCII));
    }

    private String bounded(String value, int limit, String fallback) {
        return value == null || value.isBlank() ? fallback
                : value.substring(0, Math.min(limit, value.length())).replaceAll("[^\\x20-\\x7e]", " ");
    }

    private void requireCrypto() { if (!crypto.isConfigured()) throw invalid(); }
    private void requireKind(String kind) { if (!"STAFF".equals(kind) && !"CUSTOMER".equals(kind)) throw invalid(); }
    private void requireSubject(Long id) { if (id == null || id <= 0) throw invalid(); }
    private BadCredentialsException invalid() { return new BadCredentialsException("Invalid browser session."); }
}
