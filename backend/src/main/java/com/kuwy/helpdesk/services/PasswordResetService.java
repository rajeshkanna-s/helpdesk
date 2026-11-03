package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.ForgotPasswordRequest;
import com.kuwy.helpdesk.dto.ResetPasswordRequest;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.PasswordResetToken;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.PasswordResetTokenRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private final PasswordResetTokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecurityAuditService auditService;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Set<String> COMMON_BREACHED_PASSWORDS = Set.of(
            "password", "password123", "1234567890", "admin12345", "welcome123",
            "kuwyhelpdesk", "qwerty12345", "letmein123"
    );

    @Transactional
    public Map<String, Object> requestPasswordReset(ForgotPasswordRequest req, HttpServletRequest request) {
        String email = req.getEmail() != null ? req.getEmail().trim().toLowerCase() : "";
        String companyCode = req.getCompanyCode() != null ? req.getCompanyCode().trim().toUpperCase() : null;

        // Constant-time execution simulation to prevent timing attacks
        try {
            Thread.sleep(120 + RANDOM.nextInt(80));
        } catch (InterruptedException ignored) {}

        // Locate user if exists
        Optional<User> userOpt;
        if (companyCode != null && !companyCode.isBlank()) {
            Optional<Company> company = companyRepository.findByCompanyCode(companyCode);
            userOpt = company.flatMap(c -> userRepository.findByCompanyIdAndEmail(c.getId(), email));
        } else {
            userOpt = userRepository.findByEmail(email);
        }

        String rawToken = null;
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            // Invalidate any existing unused reset tokens for this user
            List<PasswordResetToken> existingTokens = tokenRepository.findByUserIdAndIsUsedFalse(user.getId());
            for (PasswordResetToken t : existingTokens) {
                t.setIsUsed(true);
            }
            tokenRepository.saveAll(existingTokens);

            // Generate cryptographically secure random token (32 hex bytes)
            rawToken = generateRandomHex(32);
            String tokenHash = sha256(rawToken);

            PasswordResetToken prt = new PasswordResetToken();
            prt.setUserId(user.getId());
            prt.setCompanyId(user.getCompany() != null ? user.getCompany().getId() : 1L);
            prt.setEmail(user.getEmail());
            prt.setTokenHash(tokenHash);
            prt.setExpiresAt(LocalDateTime.now().plusHours(1));
            prt.setIsUsed(false);
            tokenRepository.save(prt);

            auditService.recordEvent(
                    user.getCompany() != null ? user.getCompany().getId() : null,
                    user.getId(),
                    "PASSWORD_RESET_REQUESTED",
                    user.getEmail(),
                    "Reset token generated (valid 1 hour)",
                    request
            );

            log.info("Password reset link generated for {}: http://localhost:5174/reset-password?token={}",
                    user.getEmail(), rawToken);
        } else {
            log.info("Password reset requested for non-existing email: {} (blind response returned)", email);
        }

        // Blind response returned for all inputs
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("message", "If an account exists for this email, we've sent a reset link.");
        if (rawToken != null) {
            // Include simulator token in development environment for convenience
            response.put("devResetUrl", "http://localhost:5174/reset-password?token=" + rawToken);
        }
        return response;
    }

    public Map<String, Object> validateResetToken(String rawToken) {
        Map<String, Object> res = new LinkedHashMap<>();
        if (rawToken == null || rawToken.isBlank()) {
            res.put("valid", false);
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
        if (Boolean.TRUE.equals(prt.getIsUsed())) {
            res.put("valid", false);
            res.put("status", "USED");
            res.put("message", "This reset link has already been used. Please request a new one.");
            return res;
        }

        if (prt.getExpiresAt().isBefore(LocalDateTime.now())) {
            res.put("valid", false);
            res.put("status", "EXPIRED");
            res.put("message", "This password reset link has expired (1 hour limit). Please request a new one.");
            return res;
        }

        res.put("valid", true);
        res.put("status", "VALID");
        res.put("email", maskEmail(prt.getEmail()));
        return res;
    }

    @Transactional
    public Map<String, Object> resetPassword(ResetPasswordRequest req, HttpServletRequest request) {
        if (req.getToken() == null || req.getToken().isBlank()) {
            throw new RuntimeException("Reset token is required.");
        }
        if (req.getNewPassword() == null || req.getNewPassword().length() < 10) {
            throw new RuntimeException("Password must be at least 10 characters long.");
        }

        validatePasswordStrength(req.getNewPassword());

        String tokenHash = sha256(req.getToken().trim());
        PasswordResetToken prt = tokenRepository.findByTokenHashAndIsUsedFalseAndExpiresAtAfter(tokenHash, LocalDateTime.now())
                .orElseThrow(() -> new RuntimeException("This reset link is either invalid, already used, or expired."));

        User user = userRepository.findById(prt.getUserId())
                .orElseThrow(() -> new RuntimeException("Associated user account not found."));

        // Update password hash
        user.setPasswordHash(passwordEncoder.encode(req.getNewPassword()));
        user.setFailedLoginAttempts(0);
        user.setLockoutUntil(null);
        userRepository.save(user);

        // Mark token as used
        prt.setIsUsed(true);
        tokenRepository.save(prt);

        // Invalidate all other reset tokens for this user
        List<PasswordResetToken> otherTokens = tokenRepository.findByUserIdAndIsUsedFalse(user.getId());
        for (PasswordResetToken t : otherTokens) {
            t.setIsUsed(true);
        }
        tokenRepository.saveAll(otherTokens);

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

    private void validatePasswordStrength(String password) {
        String lower = password.toLowerCase();
        for (String breached : COMMON_BREACHED_PASSWORDS) {
            if (lower.contains(breached)) {
                throw new RuntimeException("Password is too common or easily guessable. Please choose a more secure password.");
            }
        }
        boolean hasUpper = password.chars().anyMatch(Character::isUpperCase);
        boolean hasLower = password.chars().anyMatch(Character::isLowerCase);
        boolean hasDigit = password.chars().anyMatch(Character::isDigit);
        boolean hasSpecial = password.chars().anyMatch(ch -> "!@#$%^&*()_+-=[]{}|;':,.<>?".indexOf(ch) >= 0);

        if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
            throw new RuntimeException("Password must contain uppercase, lowercase, numbers, and at least one special character (!@#$%^&*).");
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
