package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.ForgotPasswordRequest;
import com.kuwy.helpdesk.dto.ResetPasswordRequest;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.PasswordResetToken;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.PasswordResetTokenRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.util.PasswordPolicy;
import jakarta.mail.internet.InternetAddress;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.web.util.HtmlUtils;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private final PasswordResetTokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecurityAuditService auditService;
    private final AccountEmailService accountEmailService;
    private final RateLimiterService rateLimiterService;

    @Value("${kuwy.frontend-url:http://localhost:5174}")
    private String frontendUrl;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String INVALID_RESET = "This reset link is invalid, already used, or expired.";

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Map<String, Object> requestPasswordReset(ForgotPasswordRequest req, HttpServletRequest request) {
        String email = req != null && req.getEmail() != null ? req.getEmail().trim().toLowerCase(Locale.ROOT) : "";
        String companyCode = req != null && req.getCompanyCode() != null
                ? req.getCompanyCode().trim().toUpperCase(Locale.ROOT) : "";

        // Configuration and throttling failures must not depend on whether an account exists.
        accountEmailService.requireReady();
        String baseUrl = frontendBaseUrl();
        if (!rateLimiterService.allowAuthentication(request != null ? request.getRemoteAddr() : null,
                companyCode + ":" + email, "password-reset-request")) {
            throw new IllegalStateException("PASSWORD_RESET_RATE_LIMITED");
        }
        Map<String, Object> response = Map.of("success", true, "message",
                "If an eligible account exists for this email, a password reset email has been queued.");
        if (!validEmail(email) || companyCode.length() > 50) {
            return response;
        }

        Optional<User> userOpt;
        if (!companyCode.isBlank()) {
            userOpt = companyRepository.findByCompanyCode(companyCode)
                    .flatMap(c -> userRepository.findForAuthenticationByCompanyAndEmail(c.getId(), email))
                    .filter(u -> u.getCompany() != null && companyCode.equals(u.getCompany().getCompanyCode()));
        } else {
            List<User> matches = userRepository.findForAuthenticationByEmail(email);
            // Without a workspace identifier, never choose arbitrarily between tenant identities.
            userOpt = matches.size() == 1 ? Optional.of(matches.get(0)) : Optional.empty();
        }
        if (userOpt.isEmpty() || !eligibleUser(userOpt.get())
                || !email.equalsIgnoreCase(userOpt.get().getEmail())) {
            return response;
        }

        User user = userOpt.get();
        invalidateRequests(user.getId());
        String rawToken = generateRandomHex(32);
        PasswordResetToken token = new PasswordResetToken();
        token.setUserId(user.getId());
        token.setCompanyId(user.getCompany().getId());
        token.setEmail(user.getEmail());
        token.setTokenHash(sha256(rawToken));
        token.setExpiresAt(LocalDateTime.now().plusHours(1));
        token.setIsUsed(false);
        PasswordResetToken saved = tokenRepository.save(token);
        if (saved.getId() == null) {
            throw new IllegalStateException("ACCOUNT_EMAIL_ENQUEUE_FAILED");
        }
        String resetUrl = baseUrl + "/reset-password?token=" + rawToken;
        accountEmailService.enqueue(token.getCompanyId(), user.getEmail(), "Reset your Helpdesk password",
                "<p>A password reset was requested for your Helpdesk account.</p>"
                        + "<p><a href=\"" + HtmlUtils.htmlEscape(resetUrl) + "\">Reset your password</a></p>"
                        + "<p>This link expires in one hour and can be used only once. "
                        + "If you did not request this, ignore this email.</p>",
                "password-reset:" + user.getId() + ":" + saved.getId());
        auditService.recordEvent(token.getCompanyId(), null, "PASSWORD_RESET_REQUESTED", user.getEmail(),
                "Password reset email queued; link valid for one hour.", request);
        return response;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> validateResetToken(String rawToken) {
        Map<String, Object> res = new LinkedHashMap<>();
        if (!validToken(rawToken)) {
            res.put("valid", false);
            res.put("status", "NOT_FOUND");
            res.put("message", "Invalid or missing password reset link.");
            return res;
        }

        String tokenHash = sha256(rawToken.trim());
        Optional<PasswordResetToken> tokenOpt = tokenRepository.findByTokenHash(tokenHash);

        if (tokenOpt.isEmpty()) {
            res.put("valid", false);
            res.put("status", "NOT_FOUND");
            res.put("message", "This password reset link is invalid or does not exist.");
            return res;
        }

        PasswordResetToken prt = tokenOpt.get();
        if (!Boolean.FALSE.equals(prt.getIsUsed())) {
            res.put("valid", false);
            res.put("status", "USED");
            res.put("message", "This reset link has already been used. Please request a new one.");
            return res;
        }

        if (prt.getExpiresAt() == null || !prt.getExpiresAt().isAfter(LocalDateTime.now())) {
            res.put("valid", false);
            res.put("status", "EXPIRED");
            res.put("message", "This password reset link has expired (1 hour limit). Please request a new one.");
            return res;
        }

        User user = prt.getUserId() != null ? userRepository.findById(prt.getUserId()).orElse(null) : null;
        if (!matchesAccount(prt, user)) {
            return Map.of("valid", false, "status", "NOT_FOUND", "message", INVALID_RESET);
        }

        res.put("valid", true);
        res.put("status", "VALID");
        res.put("email", maskEmail(prt.getEmail()));
        return res;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Map<String, Object> resetPassword(ResetPasswordRequest req, HttpServletRequest request) {
        if (req == null || !validToken(req.getToken())) {
            throw new IllegalArgumentException(INVALID_RESET);
        }
        PasswordPolicy.validate(req.getNewPassword());

        String tokenHash = sha256(req.getToken().trim());
        // Issuance and consumption both lock the user first. The scalar hint avoids caching a stale token.
        Long userId = tokenRepository.findUserIdByTokenHash(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_RESET));
        User user = userRepository.findForAuthenticationById(userId)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_RESET));
        PasswordResetToken prt = tokenRepository.findForConsumptionByTokenHash(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_RESET));
        if (!tokenHash.equals(prt.getTokenHash()) || !Boolean.FALSE.equals(prt.getIsUsed())
                || prt.getExpiresAt() == null || !prt.getExpiresAt().isAfter(LocalDateTime.now())
                || !matchesAccount(prt, user)) {
            throw new IllegalArgumentException(INVALID_RESET);
        }

        user.setPasswordHash(passwordEncoder.encode(req.getNewPassword()));
        user.setFailedLoginAttempts(0);
        user.setLockoutUntil(null);
        user.invalidateAuthentication();
        userRepository.save(user);

        prt.setIsUsed(true);
        tokenRepository.save(prt);
        invalidateRequests(user.getId());

        auditService.recordEvent(
                prt.getCompanyId(),
                user.getId(),
                "PASSWORD_RESET_COMPLETED",
                user.getEmail(),
                "Password changed successfully via reset token",
                request
        );

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("success", true);
        res.put("message", "Password updated successfully. Please sign in with your new credentials.");
        return res;
    }

    private void invalidateRequests(Long userId) {
        List<PasswordResetToken> unused = tokenRepository.findByUserIdAndIsUsedFalse(userId);
        unused.forEach(token -> token.setIsUsed(true));
        tokenRepository.saveAll(unused);
    }

    private boolean matchesAccount(PasswordResetToken token, User user) {
        return eligibleUser(user) && Objects.equals(token.getUserId(), user.getId())
                && Objects.equals(token.getCompanyId(), user.getCompany().getId())
                && user.getEmail().equalsIgnoreCase(token.getEmail());
    }

    private boolean eligibleUser(User user) {
        if (user == null || user.getId() == null || user.getId() <= 0 || !validEmail(user.getEmail())
                || !Boolean.TRUE.equals(user.getIsActive()) || !"ACTIVE".equalsIgnoreCase(user.getStatus())
                || user.getCompany() == null || user.getCompany().getId() == null || user.getCompany().getId() <= 0
                || (user.getCompany().getStatus() != Company.CompanyStatus.ACTIVE
                    && user.getCompany().getStatus() != Company.CompanyStatus.TRIAL)
                || user.getRole() == null || user.getRole().getRoleType() == null
                || user.getRole().getRoleType() == Role.RoleType.CUSTOMER) {
            return false;
        }
        Role role = user.getRole();
        return role.getCompany() == null ? Boolean.TRUE.equals(role.getIsSystemRole())
                : user.getCompany().getId().equals(role.getCompany().getId());
    }

    private boolean validToken(String rawToken) {
        return rawToken != null && rawToken.length() <= 256 && rawToken.trim().matches("[0-9a-f]{64}");
    }

    private boolean validEmail(String email) {
        if (email == null || email.length() > 254 || email.indexOf('@') <= 0
                || email.chars().anyMatch(Character::isISOControl)) {
            return false;
        }
        try {
            InternetAddress address = new InternetAddress(email, true);
            address.validate();
            return !address.isGroup() && address.getPersonal() == null && email.equals(address.getAddress());
        } catch (Exception invalid) {
            return false;
        }
    }

    private String frontendBaseUrl() {
        try {
            URI uri = URI.create(frontendUrl);
            if (frontendUrl.length() > 2048 || !uri.isAbsolute() || uri.getHost() == null
                    || (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme()))
                    || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || uri.getPort() == 0 || uri.getPort() > 65535 || !uri.equals(uri.normalize())
                    || uri.getPath().chars().anyMatch(Character::isISOControl)) {
                throw new IllegalArgumentException();
            }
            return uri.toASCIIString().replaceAll("/+$", "");
        } catch (RuntimeException invalid) {
            throw new IllegalStateException("ACCOUNT_EMAIL_NOT_READY");
        }
    }

    private String generateRandomHex(int byteLength) {
        byte[] bytes = new byte[byteLength];
        RANDOM.nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    public String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encodedHash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : encodedHash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }

    private String maskEmail(String email) {
        if (email == null || email.indexOf('@') <= 0) return "***";
        int atIdx = email.indexOf('@');
        String namePart = email.substring(0, atIdx);
        String domainPart = email.substring(atIdx);
        if (namePart.length() <= 2) {
            return namePart.charAt(0) + "***" + domainPart;
        }
        return namePart.charAt(0) + "***" + namePart.charAt(namePart.length() - 1) + domainPart;
    }
}
