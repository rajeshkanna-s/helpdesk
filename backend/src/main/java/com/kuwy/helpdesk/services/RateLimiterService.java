package com.kuwy.helpdesk.services;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Thread-safe rate limiter service providing sliding-window throttling
 * to protect public forms (ticket submission, OTP generation) from spam bots and DDoS.
 */
@Slf4j
@Service
public class RateLimiterService {

    // Maps: RateLimitKey -> timestamps of requests in current window
    private final Map<String, Deque<Long>> requestHistory = new ConcurrentHashMap<>();

    private static final int MAX_TICKETS_PER_WINDOW = 5;
    private static final long TICKET_WINDOW_MS = 10 * 60 * 1000L; // 10 minutes

    private static final int MAX_OTP_PER_WINDOW = 3;
    private static final long OTP_WINDOW_MS = 10 * 60 * 1000L; // 10 minutes

    /**
     * Checks rate limit for ticket submission from a client IP or email.
     * @return true if request is allowed, false if rate limited.
     */
    public boolean allowTicketSubmission(String clientIp, String email) {
        String keyIp = "ticket:ip:" + (clientIp != null ? clientIp.trim() : "unknown");
        String keyEmail = "ticket:email:" + (email != null ? email.trim().toLowerCase() : "unknown");

        boolean ipAllowed = checkRate(keyIp, MAX_TICKETS_PER_WINDOW, TICKET_WINDOW_MS);
        boolean emailAllowed = checkRate(keyEmail, MAX_TICKETS_PER_WINDOW, TICKET_WINDOW_MS);

        if (!ipAllowed || !emailAllowed) {
            log.warn("Rate limit exceeded for ticket creation. IP: {}, Email: {}", clientIp, email);
            return false;
        }
        return true;
    }

    /**
     * Checks rate limit for OTP requests.
     */
    public boolean allowOtpRequest(String clientIp, String email) {
        String key = "otp:" + (email != null ? email.trim().toLowerCase() : clientIp);
        boolean allowed = checkRate(key, MAX_OTP_PER_WINDOW, OTP_WINDOW_MS);
        if (!allowed) {
            log.warn("Rate limit exceeded for OTP request. Key: {}", key);
        }
        return allowed;
    }

    private synchronized boolean checkRate(String key, int maxRequests, long windowMs) {
        long now = System.currentTimeMillis();
        Deque<Long> timestamps = requestHistory.computeIfAbsent(key, k -> new ArrayDeque<>());

        // Evict expired timestamps
        while (!timestamps.isEmpty() && now - timestamps.peekFirst() > windowMs) {
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
    public void cleanup() {
        long now = System.currentTimeMillis();
        requestHistory.entrySet().removeIf(entry -> {
            Deque<Long> q = entry.getValue();
            synchronized (this) {
                return q.isEmpty() || (now - q.peekLast() > TICKET_WINDOW_MS);
            }
        });
    }
}

