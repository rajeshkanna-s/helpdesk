package com.kuwy.helpdesk.services;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class RateLimiterServiceTest {
    @Test
    void authenticationLimitsFollowIdentityAcrossIpsAndExpire() {
        MutableClock clock = new MutableClock();
        RateLimiterService limiter = new RateLimiterService(clock);
        for (int i = 0; i < 20; i++) assertTrue(limiter.allowAuthentication("ip-" + i, " Person@example.invalid ", "login"));
        assertFalse(limiter.allowAuthentication("different-ip", "person@example.invalid", "login"));
        assertTrue(limiter.allowAuthentication("ip-0", "other@example.invalid", "login"));
        clock.now = clock.now.plusSeconds(600);
        assertTrue(limiter.allowAuthentication("ip-0", "person@example.invalid", "login"));
    }

    @Test
    void otpRequestsAreBoundedByIpAndNormalizedEmail() {
        RateLimiterService limiter = new RateLimiterService(new MutableClock());
        for (int i = 0; i < 10; i++) assertTrue(limiter.allowOtpRequest("shared-ip", "person" + i + "@example.invalid"));
        assertFalse(limiter.allowOtpRequest("shared-ip", "new-person@example.invalid"));
        assertTrue(limiter.allowOtpRequest("other-ip", " PERSON0@example.invalid "));
        assertTrue(limiter.allowOtpRequest("third-ip", "person0@example.invalid"));
        assertFalse(limiter.allowOtpRequest("fourth-ip", "person0@example.invalid"));
    }

    @Test
    void limiterKeysDoNotContainRawIdentitiesAndTheMapIsBounded() {
        MutableClock clock = new MutableClock();
        RateLimiterService limiter = new RateLimiterService(clock);
        for (int i = 0; i < 6000; i++) limiter.allowAuthentication("ip-" + i, "person" + i + "@example.invalid", "login");
        Map<?, ?> history = (Map<?, ?>) ReflectionTestUtils.getField(limiter, "requestHistory");
        assertNotNull(history);
        assertTrue(history.size() <= 10000);
        assertFalse(history.keySet().stream().anyMatch(key -> key.toString().contains("example.invalid")));
        clock.now = clock.now.plusSeconds(601);
        limiter.cleanup();
        assertTrue(history.isEmpty());
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-04T06:00:00Z");

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
