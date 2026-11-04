package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.dto.LoginRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.dto.Verify2FaRequest;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final TwoFactorAuthService twoFactorAuthService;
    private final SecurityAuditService auditService;
    private final RateLimiterService rateLimiterService;
    private final SecretCryptoService secretCryptoService;

    private static final String BACKUP_FORMAT = "BCRYPT_V1:";
    private static final int MAX_PENDING_CHALLENGES = 10000;
    private final Map<String, TempSession> tempSessions = new ConcurrentHashMap<>();
    private final Map<Long, Enrollment> enrollments = new ConcurrentHashMap<>();
    private Clock clock = Clock.systemDefaultZone();

    private static final class TempSession {
        private final Long userId;
        private final Long authVersion;
        private final Long companyId;
        private final Role.RoleType role;
        private final String email;
        private final Instant expiresAt;
        private int attempts;

        private TempSession(User user, Instant expiresAt) {
            this.userId = user.getId();
            this.authVersion = user.getAuthVersion();
            this.companyId = user.getCompany().getId();
            this.role = user.getRole().getRoleType();
            this.email = user.getEmail();
            this.expiresAt = expiresAt;
        }
    }

    private static final class Enrollment {
        private final String secret;
        private final Long authVersion;
        private final Instant expiresAt;
        private int attempts;

        private Enrollment(String secret, Long authVersion, Instant expiresAt) {
            this.secret = secret;
            this.authVersion = authVersion;
            this.expiresAt = expiresAt;
        }
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public LoginResponse login(LoginRequest request, HttpServletRequest httpRequest) {
        String email = request.getEmail() != null ? request.getEmail().trim().toLowerCase(Locale.ROOT) : "";
        String rawPassword = request.getPassword() != null ? request.getPassword() : "";
        if (!rateLimiterService.allowAuthentication(clientIp(httpRequest), email, "login")) {
            throw new LockedException("Too many sign-in attempts. Please try again later.");
        }

        // 1. Locate User by Company and Email
        User user = null;
        Company targetCompany = null;
        if (request.getCompanyCode() != null && !request.getCompanyCode().isBlank()) {
            Optional<Company> compOpt = companyRepository.findByCompanyCode(request.getCompanyCode().trim().toUpperCase(Locale.ROOT));
            if (compOpt.isPresent()) {
                targetCompany = compOpt.get();
                user = userRepository.findForAuthenticationByCompanyAndEmail(targetCompany.getId(), email).orElse(null);
            }
        } else {
            List<User> candidates = userRepository.findForAuthenticationByEmail(email);
            user = candidates.size() == 1 ? candidates.getFirst() : null;
            if (user != null) {
                targetCompany = user.getCompany();
            }
        }

        // 2. Uniform timing check if account does not exist to prevent enumeration
        if (user == null) {
            // Run dummy BCrypt to normalize timing
            passwordEncoder.matches("dummy", "$2a$10$7EqJtq98hPqEX7fNZaFWoO.K7D5R1xLz4u8MvY2s0G/D.01mE4KqO");
            auditService.recordEvent(
                    targetCompany != null ? targetCompany.getId() : null,
                    null,
                    "LOGIN_FAILED",
                    email,
                    "Attempt with unknown email in workspace",
                    httpRequest
            );
            throw new BadCredentialsException("Email or password is incorrect.");
        }

        // 3. Brute force lockout check (5 failed attempts -> 15 min lock)
        if (user.getLockoutUntil() != null && user.getLockoutUntil().isAfter(LocalDateTime.now(clock))) {
            auditService.recordEvent(
                    user.getCompany() != null ? user.getCompany().getId() : null,
                    user.getId(),
                    "ACCOUNT_LOCKED",
                    email,
                    "Login rejected due to active lockout until " + user.getLockoutUntil(),
                    httpRequest
            );
            throw new LockedException("Too many attempts. Try again in 15 minutes, or reset your password.");
        }
        if (user.getLockoutUntil() != null) {
            user.setLockoutUntil(null);
            user.setFailedLoginAttempts(0);
        }

        // 4. Validate Password
        boolean matches = matchesPassword(rawPassword, user.getPasswordHash());

        if (!matches) {
            int attempts = (user.getFailedLoginAttempts() != null ? user.getFailedLoginAttempts() : 0) + 1;
            user.setFailedLoginAttempts(attempts);
            if (attempts >= 5) {
                user.setLockoutUntil(LocalDateTime.now(clock).plusMinutes(15));
                userRepository.save(user);
                auditService.recordEvent(
                        user.getCompany() != null ? user.getCompany().getId() : null,
                        user.getId(),
                        "ACCOUNT_LOCKED",
                        email,
                        "Account locked after 5 consecutive failed attempts",
                        httpRequest
                );
                throw new LockedException("Too many attempts. Try again in 15 minutes, or reset your password.");
            }
            userRepository.save(user);

            auditService.recordEvent(
                    user.getCompany() != null ? user.getCompany().getId() : null,
                    user.getId(),
                    "LOGIN_FAILED",
                    email,
                    "Incorrect password provided (Attempt " + attempts + "/5)",
                    httpRequest
            );
            throw new BadCredentialsException("Email or password is incorrect.");
        }

        Role.RoleType roleType = requireActiveStaff(user);
        Company company = user.getCompany();

        // 7. Check if Two-Factor Authentication (2FA) is enabled for user
        if (Boolean.TRUE.equals(user.getIsTwoFactorEnabled())) {
            String tempToken = UUID.randomUUID().toString().replace("-", "");
            cleanExpiredTempSessions();
            Long userId = user.getId();
            tempSessions.entrySet().removeIf(entry -> entry.getValue().userId.equals(userId));
            if (tempSessions.size() >= MAX_PENDING_CHALLENGES) {
                throw new LockedException("Sign-in is temporarily busy. Please try again later.");
            }
            tempSessions.put(tempToken, new TempSession(user, clock.instant().plusSeconds(300)));

            auditService.recordEvent(
                    company != null ? company.getId() : null,
                    user.getId(),
                    "2FA_CHALLENGE",
                    user.getEmail(),
                    "Credentials accepted, 2FA challenge issued",
                    httpRequest
            );

            return LoginResponse.builder()
                    .twoFactorRequired(true)
                    .tempToken(tempToken)
                    .maskedEmail(maskEmail(user.getEmail()))
                    .company(buildCompanyInfo(company))
                    .build();
        }

        // 8. Successful Login (No 2FA required)
        return finalizeLogin(user, company, roleType, httpRequest);
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public LoginResponse verify2Fa(Verify2FaRequest request, HttpServletRequest httpRequest) {
        if (request.getTempToken() == null || request.getTempToken().isBlank() || request.getTempToken().length() > 128) {
            throw new BadCredentialsException("Session expired. Please sign in again.");
        }
        TempSession session = tempSessions.get(request.getTempToken());
        if (session == null || !rateLimiterService.allowAuthentication(clientIp(httpRequest), String.valueOf(session.userId), "mfa")) {
            throw new BadCredentialsException("Authentication session is unavailable. Please sign in again.");
        }
        synchronized (session) {
            if (tempSessions.get(request.getTempToken()) != session || !clock.instant().isBefore(session.expiresAt) || session.attempts >= 5) {
                tempSessions.remove(request.getTempToken(), session);
                throw new BadCredentialsException("Authentication session has timed out. Please sign in again.");
            }
            User user = userRepository.findForAuthenticationById(session.userId)
                    .orElseThrow(() -> new BadCredentialsException("Authentication session is no longer valid."));
            Role.RoleType roleType = requireActiveStaff(user);
            if (!Boolean.TRUE.equals(user.getIsTwoFactorEnabled()) || !Objects.equals(session.authVersion, user.getAuthVersion())
                    || !Objects.equals(session.companyId, user.getCompany().getId()) || session.role != roleType
                    || !Objects.equals(session.email, user.getEmail())) {
                tempSessions.remove(request.getTempToken(), session);
                throw new BadCredentialsException("Account security changed. Please sign in again.");
            }
            session.attempts++;
            boolean verified = Boolean.TRUE.equals(request.getIsBackupCode())
                    ? consumeBackupCode(user, request.getCode())
                    : twoFactorAuthService.verifyTotpCode(readMfaSecret(user), request.getCode());
            if (!verified) {
                if (session.attempts >= 5) tempSessions.remove(request.getTempToken(), session);
                auditService.recordEvent(user.getCompany().getId(), user.getId(), "2FA_FAILED", user.getEmail(), "Invalid second factor", httpRequest);
                throw new BadCredentialsException("Invalid authentication code. Please try again.");
            }
            if (!tempSessions.remove(request.getTempToken(), session)) {
                throw new BadCredentialsException("Authentication session has already been used.");
            }
            if (secretCryptoService.isConfigured() && user.getTwoFactorSecret() != null && !user.getTwoFactorSecret().startsWith("enc:v1:")) {
                user.setTwoFactorSecret(secretCryptoService.encrypt(user.getTwoFactorSecret(), mfaPurpose(user.getId())));
            }
            auditService.recordEvent(
                    user.getCompany().getId(), user.getId(), "2FA_SUCCESS", user.getEmail(), "Second factor verified", httpRequest);
            return finalizeLogin(user, user.getCompany(), roleType, httpRequest);
        }
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public Map<String, Object> setup2Fa(Long userId, String password, String currentCode, HttpServletRequest request) {
        User user = requireSelf(userId);
        requirePassword(user, password, request);
        if (!secretCryptoService.isConfigured()) throw new IllegalStateException("Authenticator encryption is not configured.");
        if (Boolean.TRUE.equals(user.getIsTwoFactorEnabled()) && !twoFactorAuthService.verifyTotpCode(readMfaSecret(user), currentCode)) {
            throw new BadCredentialsException("Verify your current authenticator before replacing it.");
        }
        cleanExpiredTempSessions();
        if (enrollments.size() >= MAX_PENDING_CHALLENGES && !enrollments.containsKey(userId)) {
            throw new LockedException("Account setup is temporarily busy. Please try again later.");
        }
        String secret = twoFactorAuthService.generateSecretKey();
        String companyName = user.getCompany().getName();
        String otpAuthUrl = twoFactorAuthService.getOtpAuthUrl(companyName, user.getEmail(), secret);
        Instant expiresAt = clock.instant().plusSeconds(300);
        enrollments.put(userId, new Enrollment(secretCryptoService.encrypt(secret, mfaPurpose(userId)), user.getAuthVersion(), expiresAt));
        auditService.recordEvent(user.getCompany().getId(), userId, "2FA_SETUP_STARTED", user.getEmail(), "Authenticator setup requested", request);
        return Map.of("secret", secret, "otpAuthUrl", otpAuthUrl, "expiresAt", expiresAt.toString());
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public Map<String, Object> enable2Fa(Long userId, String code, HttpServletRequest request) {
        User user = requireSelf(userId);
        Enrollment enrollment = enrollments.get(userId);
        if (enrollment == null) throw new BadCredentialsException("Start authenticator setup again.");
        synchronized (enrollment) {
            if (enrollments.get(userId) != enrollment || !clock.instant().isBefore(enrollment.expiresAt) || !Objects.equals(enrollment.authVersion, user.getAuthVersion())) {
                enrollments.remove(userId, enrollment);
                throw new BadCredentialsException("Authenticator setup expired. Please start again.");
            }
            enrollment.attempts++;
            if (enrollment.attempts > 5 || !twoFactorAuthService.verifyTotpCode(secretCryptoService.decrypt(enrollment.secret, mfaPurpose(userId)), code)) {
                if (enrollment.attempts >= 5) enrollments.remove(userId, enrollment);
                throw new BadCredentialsException("Verification code is incorrect.");
            }
            List<String> backupCodes = new ArrayList<>();
            for (int i = 0; i < 10; i++) backupCodes.add(UUID.randomUUID().toString().replace("-", "").toUpperCase(Locale.ROOT));
            user.setIsTwoFactorEnabled(true);
            user.setTwoFactorSecret(enrollment.secret);
            user.setBackupCodes(encodeBackupCodes(backupCodes));
            user.invalidateAuthentication();
            userRepository.save(user);
            enrollments.remove(userId, enrollment);
            auditService.recordEvent(user.getCompany().getId(), userId, "2FA_ENABLED", user.getEmail(), "Authenticator enrollment confirmed", request);
            return Map.of("success", true, "backupCodes", backupCodes, "signInRequired", true, "message", "Authenticator enabled. Store these recovery codes securely and sign in again.");
        }
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public Map<String, Object> disable2Fa(Long userId, String password, String code, HttpServletRequest request) {
        User user = requireSelf(userId);
        requirePassword(user, password, request);
        if (user.getRole().getRoleType() == Role.RoleType.SUPER_ADMIN) {
            throw new SecurityException("Two-factor authentication cannot be disabled for platform administrators.");
        }
        if (Boolean.TRUE.equals(user.getIsTwoFactorEnabled()) && !twoFactorAuthService.verifyTotpCode(readMfaSecret(user), code)) {
            throw new BadCredentialsException("Verify your current authenticator to disable it.");
        }
        user.setIsTwoFactorEnabled(false);
        user.setTwoFactorSecret(null);
        user.setBackupCodes(null);
        user.invalidateAuthentication();
        userRepository.save(user);
        enrollments.remove(userId);
        auditService.recordEvent(user.getCompany().getId(), userId, "2FA_DISABLED", user.getEmail(), "Authenticator disabled by verified account owner", request);
        return Map.of("success", true, "signInRequired", true, "message", "Authenticator disabled. Please sign in again.");
    }

    private LoginResponse finalizeLogin(User user, Company company, Role.RoleType roleType, HttpServletRequest httpRequest) {
        // Clear failed attempts & lockout
        user.setFailedLoginAttempts(0);
        user.setLockoutUntil(null);
        user.setLastLoginAt(LocalDateTime.now(clock));
        userRepository.save(user);

        // Audit Log
        auditService.recordEvent(
                company != null ? company.getId() : null,
                user.getId(),
                "LOGIN_SUCCESS",
                user.getEmail(),
                "Staff signed in successfully as " + roleType.name(),
                httpRequest
        );

        // Generate JWT
        String token = jwtTokenProvider.generateToken(user);

        return LoginResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .displayName(user.getDisplayName())
                .roleType(roleType.name())
                .roleName(user.getRole() != null ? user.getRole().getName() : "Agent")
                .company(buildCompanyInfo(company))
                .twoFactorRequired(false)
                .build();
    }

    private LoginResponse.CompanyInfo buildCompanyInfo(Company company) {
        if (company == null) return null;
        return LoginResponse.CompanyInfo.builder()
                .id(company.getId())
                .companyCode(company.getCompanyCode())
                .name(company.getName())
                .subdomain(company.getSubdomain())
                .status(company.getStatus().name())
                .primaryColor(company.getPrimaryColor())
                .build();
    }

    private void cleanExpiredTempSessions() {
        Instant now = clock.instant();
        tempSessions.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expiresAt));
        enrollments.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expiresAt));
    }

    private Role.RoleType requireActiveStaff(User user) {
        if (user == null || user.getId() == null || user.getId() <= 0 || user.getEmail() == null || user.getEmail().isBlank()
                || !Boolean.TRUE.equals(user.getIsActive()) || !"ACTIVE".equalsIgnoreCase(user.getStatus())
                || user.getRole() == null || user.getRole().getRoleType() == null || user.getAuthVersion() == null || user.getAuthVersion() < 0
                || user.getCompany() == null || user.getCompany().getId() == null || user.getCompany().getId() <= 0) {
            throw new DisabledException("This staff account is unavailable.");
        }
        Role.RoleType role = user.getRole().getRoleType();
        if (role == Role.RoleType.CUSTOMER) throw new BadCredentialsException("Use the customer portal to sign in.");
        if (role != Role.RoleType.SUPER_ADMIN && user.getCompany().getStatus() != Company.CompanyStatus.ACTIVE
                && user.getCompany().getStatus() != Company.CompanyStatus.TRIAL) {
            throw new DisabledException("Your workspace is currently unavailable. Contact your administrator.");
        }
        if (user.getLockoutUntil() != null && user.getLockoutUntil().isAfter(LocalDateTime.now(clock))) {
            throw new LockedException("This account is temporarily locked. Please try again later.");
        }
        return role;
    }

    private User requireSelf(Long userId) {
        if (!Objects.equals(TenantContext.requireUserId(), userId)) {
            throw new SecurityException("You can only manage your own authentication settings.");
        }
        User user = userRepository.findForAuthenticationById(userId)
                .orElseThrow(() -> new BadCredentialsException("Staff account is unavailable."));
        requireActiveStaff(user);
        if (!Objects.equals(user.getRole().getRoleType().name(), TenantContext.getUserRole())
                || !Objects.equals(user.getEmail(), TenantContext.getUserEmail())) {
            throw new SecurityException("Account identity changed. Sign in again.");
        }
        TenantContext.assertAccessTo(user.getCompany().getId());
        return user;
    }

    private void requirePassword(User user, String password, HttpServletRequest request) {
        if (!rateLimiterService.allowAuthentication(clientIp(request), String.valueOf(user.getId()), "reauth")
                || !matchesPassword(password, user.getPasswordHash())) {
            throw new BadCredentialsException("Password verification failed.");
        }
    }

    private boolean matchesPassword(String raw, String encoded) {
        if (raw == null || raw.isEmpty() || raw.length() > 1024 || encoded == null) return false;
        try {
            return passwordEncoder.matches(raw, encoded);
        } catch (IllegalArgumentException malformedHash) {
            return false;
        }
    }

    private String encodeBackupCodes(List<String> codes) {
        return BACKUP_FORMAT + String.join(",", codes.stream().map(passwordEncoder::encode).toList());
    }

    private boolean consumeBackupCode(User user, String code) {
        String stored = user.getBackupCodes();
        if (stored == null || code == null || code.length() > 64) return false;
        if (!stored.startsWith(BACKUP_FORMAT)) {
            if (!twoFactorAuthService.verifyBackupCode(stored, code)) return false;
            String remaining = twoFactorAuthService.removeUsedBackupCode(stored, code);
            List<String> legacyCodes = Arrays.stream(remaining.split(",")).map(String::trim).filter(value -> value.matches("[0-9]{6}")).toList();
            user.setBackupCodes(encodeBackupCodes(legacyCodes));
            return true;
        }
        String normalized = code.trim().replace("-", "").toUpperCase(Locale.ROOT);
        List<String> hashes = new ArrayList<>(Arrays.asList(stored.substring(BACKUP_FORMAT.length()).split(",")));
        int matched = -1;
        for (int i = 0; i < hashes.size(); i++) {
            if (matchesPassword(normalized, hashes.get(i))) matched = i;
        }
        if (matched < 0) return false;
        hashes.remove(matched);
        user.setBackupCodes(BACKUP_FORMAT + String.join(",", hashes));
        return true;
    }

    private String clientIp(HttpServletRequest request) {
        return request == null ? "unknown" : request.getRemoteAddr();
    }

    private String readMfaSecret(User user) {
        String stored = user.getTwoFactorSecret();
        return stored != null && stored.startsWith("enc:v1:")
                ? secretCryptoService.decrypt(stored, mfaPurpose(user.getId())) : stored;
    }

    private String mfaPurpose(Long userId) {
        return "staff-mfa:" + userId;
    }

    private String maskEmail(String email) {
        if (email == null || !email.contains("@")) return email;
        int atIdx = email.indexOf('@');
        String namePart = email.substring(0, atIdx);
        String domainPart = email.substring(atIdx);
        if (namePart.length() <= 2) {
            return namePart.charAt(0) + "***" + domainPart;
        }
        return namePart.charAt(0) + "***" + namePart.charAt(namePart.length() - 1) + domainPart;
    }
}
