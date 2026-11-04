package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.SignupChallenge;
import com.kuwy.helpdesk.repositories.SignupChallengeRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SignupVerificationService {
    private final SignupChallengeRepository challenges;
    private final AccountEmailService emails;
    private final PasswordEncoder passwordEncoder;
    private final RateLimiterService limiter;
    private final SecureRandom random = new SecureRandom();
    private Clock clock = Clock.systemUTC();

    @Transactional
    public Map<String, Object> send(String email, HttpServletRequest request) {
        String canonical = CustomerOtpService.canonicalEmail(email);
        emails.requireReady();
        String ip = request == null ? "unknown" : request.getRemoteAddr();
        if (!limiter.allowOtpRequest(ip, "signup:" + canonical)) throw new LockedException("Too many verification requests. Please try again later.");
        SignupChallenge challenge = challenges.lockByEmail(canonical).orElseGet(SignupChallenge::new);
        if (challenge.getSentAt() != null && clock.instant().isBefore(challenge.getSentAt().plusSeconds(60))) {
            throw new LockedException("Wait one minute before requesting another code.");
        }
        String code = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        challenge.setEmail(canonical);
        challenge.setCodeHash(passwordEncoder.encode(code));
        challenge.setSentAt(clock.instant());
        challenge.setExpiresAt(clock.instant().plusSeconds(600));
        challenge.setConsumedAt(null);
        challenge.setAttempts(0);
        challenges.saveAndFlush(challenge);
        emails.enqueue(null, canonical, "Verify your workspace email",
                "<p>Use this code to verify your email and create your workspace:</p><p><strong>" + code
                        + "</strong></p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>",
                "signup-code:" + challenge.getId() + ":" + UUID.randomUUID());
        return Map.of("success", true, "message", "If the address is eligible, a verification email has been queued.",
                "challengeId", challenge.getId().toString(), "expiresInSeconds", 600, "resendAfterSeconds", 60);
    }

    @Transactional(propagation = Propagation.MANDATORY, noRollbackFor = AuthenticationException.class)
    public void consume(String challengeId, String email, String code, HttpServletRequest request) {
        String canonical = CustomerOtpService.canonicalEmail(email);
        if (challengeId == null || challengeId.length() != 36 || code == null || !code.matches("[0-9]{6}")) throw invalid();
        UUID id;
        try { id = UUID.fromString(challengeId); } catch (IllegalArgumentException malformed) { throw invalid(); }
        String ip = request == null ? "unknown" : request.getRemoteAddr();
        if (!limiter.allowAuthentication(ip, "signup:" + canonical, "signup-verification")) throw invalid();
        SignupChallenge challenge = challenges.lockById(id).orElseThrow(SignupVerificationService::invalid);
        if (!canonical.equals(challenge.getEmail()) || challenge.getConsumedAt() != null || challenge.getAttempts() >= 5
                || challenge.getExpiresAt() == null || !clock.instant().isBefore(challenge.getExpiresAt())) throw invalid();
        challenge.setAttempts(challenge.getAttempts() + 1);
        challenges.save(challenge);
        if (!passwordEncoder.matches(code, challenge.getCodeHash())) throw invalid();
        challenge.setConsumedAt(clock.instant());
        challenges.save(challenge);
    }

    private static BadCredentialsException invalid() {
        return new BadCredentialsException("Verification failed or expired. Request a new code and try again.");
    }
}
