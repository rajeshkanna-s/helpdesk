package com.kuwy.helpdesk.services;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.time.Clock;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

/**
 * Thread-safe rate limiter service providing sliding-window throttling
 * to protect public forms (ticket submission, OTP generation) from spam bots and DDoS.
 */
@Slf4j
@Service
public class RateLimiterService {

    // Maps: RateLimitKey -> timestamps of requests in current window
    private final Map<String, Window> requestHistory = new ConcurrentHashMap<>();
    private final Clock clock;
    private long lastCleanup;
    private static final int MAX_KEYS = 10000;

    private static final class Window {
        private final Deque<Long> timestamps = new ArrayDeque<>();
        private final long duration;

        private Window(long duration) {
            this.duration = duration;
        }
    }

    public RateLimiterService() {
        this(Clock.systemUTC());
    }

    RateLimiterService(Clock clock) {
        this.clock = clock;
    }

    private static final int MAX_TICKETS_PER_WINDOW = 5;
    private static final long TICKET_WINDOW_MS = 10 * 60 * 1000L; // 10 minutes

    private static final int MAX_OTP_PER_WINDOW = 3;
    private static final long OTP_WINDOW_MS = 10 * 60 * 1000L; // 10 minutes

    /**
     * Checks rate limit for ticket submission from a client IP or email.
     * @return true if request is allowed, false if rate limited.
     */
    public boolean allowTicketSubmission(String clientIp, String email) {
        String keyIp = "ticket:ip:" + fingerprint(clientIp);
        String keyEmail = "ticket:email:" + fingerprint(email);

        boolean ipAllowed = checkRate(keyIp, MAX_TICKETS_PER_WINDOW, TICKET_WINDOW_MS);
        if (!ipAllowed) return false;
        boolean emailAllowed = checkRate(keyEmail, MAX_TICKETS_PER_WINDOW, TICKET_WINDOW_MS);

        if (!ipAllowed || !emailAllowed) {
            log.warn("Rate limit exceeded for ticket creation.");
            return false;
        }
        return true;
    }

    /**
     * Checks rate limit for OTP requests.
     */
    public boolean allowOtpRequest(String clientIp, String email) {
        if (!checkRate("otp:ip:" + fingerprint(clientIp), 10, OTP_WINDOW_MS)) return false;
        String key = "otp:email:" + fingerprint(email);
        boolean allowed = checkRate(key, MAX_OTP_PER_WINDOW, OTP_WINDOW_MS);
        if (!allowed) {
            log.warn("Rate limit exceeded for OTP requests.");
        }
        return allowed;
    }

    public boolean allowAuthentication(String clientIp, String identity, String operation) {
        String scope = operation == null ? "auth" : operation;
        if (!checkRate(scope + ":ip:" + fingerprint(clientIp), 100, OTP_WINDOW_MS)) return false;
        return checkRate(scope + ":identity:" + fingerprint(identity), 20, OTP_WINDOW_MS);
    }

    private synchronized boolean checkRate(String key, int maxRequests, long windowMs) {
        long now = clock.millis();
        if (now - lastCleanup >= 60000) cleanup();
        if (!requestHistory.containsKey(key) && requestHistory.size() >= MAX_KEYS) {
            if (now - lastCleanup >= 1000) cleanup();
            if (requestHistory.size() >= MAX_KEYS) return false;
        }
        Window window = requestHistory.computeIfAbsent(key, k -> new Window(windowMs));
        Deque<Long> timestamps = window.timestamps;

        // Evict expired timestamps
        while (!timestamps.isEmpty() && now - timestamps.peekFirst() >= window.duration) {
            timestamps.pollFirst();
        }

        if (timestamps.size() >= maxRequests) {
            return false;
        }

        timestamps.addLast(now);
        return true;
    }

    /**
     * Periodic cleanup of stale keys
     */
    public synchronized void cleanup() {
        long now = clock.millis();
        requestHistory.entrySet().removeIf(entry -> {
            Window window = entry.getValue();
            return window.timestamps.isEmpty() || now - window.timestamps.peekLast() >= window.duration;
        });
        lastCleanup = now;
    }

    private String fingerprint(String value) {
        String normalized = value == null ? "unknown" : value.trim().toLowerCase(Locale.ROOT);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalized.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("Required digest is unavailable.", unavailable);
        }
    }
}
