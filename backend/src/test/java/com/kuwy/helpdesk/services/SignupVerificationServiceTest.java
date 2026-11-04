package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.SignupChallenge;
import com.kuwy.helpdesk.repositories.SignupChallengeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SignupVerificationServiceTest {
    private final SignupChallengeRepository challenges = mock(SignupChallengeRepository.class);
    private final AccountEmailService emails = mock(AccountEmailService.class);
    private final RateLimiterService limiter = mock(RateLimiterService.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final SignupVerificationService service = new SignupVerificationService(challenges, emails, encoder, limiter);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-04T09:00:00Z"), ZoneOffset.UTC);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    @BeforeEach void prepare() {
        ReflectionTestUtils.setField(service, "clock", clock);
        when(limiter.allowOtpRequest(any(), any())).thenReturn(true);
        when(limiter.allowAuthentication(any(), any(), any())).thenReturn(true);
        when(challenges.lockByEmail(any())).thenReturn(Optional.empty());
    }

    @Test
    void signupProofIsQueuedHashedAndSingleUse() {
        var result = service.send(" Person@example.invalid ", request);
        ArgumentCaptor<SignupChallenge> row = ArgumentCaptor.forClass(SignupChallenge.class);
        verify(challenges).saveAndFlush(row.capture());
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(emails).enqueue(isNull(), eq("person@example.invalid"), anyString(), body.capture(), anyString());
        var matcher = Pattern.compile("<strong>([0-9]{6})</strong>").matcher(body.getValue());
        assertTrue(matcher.find()); String code = matcher.group(1);
        assertTrue(encoder.matches(code, row.getValue().getCodeHash()));
        assertFalse(result.containsKey("mockCode")); assertFalse(result.containsKey("code"));
        when(challenges.lockById(row.getValue().getId())).thenReturn(Optional.of(row.getValue()));
        service.consume(row.getValue().getId().toString(), "person@example.invalid", code, request);
        assertNotNull(row.getValue().getConsumedAt());
        assertThrows(AuthenticationException.class, () -> service.consume(row.getValue().getId().toString(), "person@example.invalid", code, request));
    }

    @Test
    void expiryIdentityAndAttemptLimitsFailClosed() {
        SignupChallenge row = new SignupChallenge(); row.setEmail("person@example.invalid"); row.setCodeHash(encoder.encode("234567"));
        row.setExpiresAt(clock.instant().plusSeconds(600)); row.setSentAt(clock.instant());
        when(challenges.lockById(row.getId())).thenReturn(Optional.of(row));
        assertThrows(AuthenticationException.class, () -> service.consume(row.getId().toString(), "other@example.invalid", "234567", request));
        for (int i = 0; i < 5; i++) assertThrows(AuthenticationException.class, () -> service.consume(row.getId().toString(), row.getEmail(), "000000", request));
        assertEquals(5, row.getAttempts());
        assertThrows(AuthenticationException.class, () -> service.consume(row.getId().toString(), row.getEmail(), "234567", request));
        row.setAttempts(0); row.setExpiresAt(clock.instant());
        assertThrows(AuthenticationException.class, () -> service.consume(row.getId().toString(), row.getEmail(), "234567", request));
        assertThrows(AuthenticationException.class, () -> service.consume(UUID.randomUUID().toString(), row.getEmail(), "234567", request));
    }

    @Test
    void unavailableEmailCannotPretendToSendOrCreateAChallenge() {
        doThrow(new IllegalStateException("ACCOUNT_EMAIL_NOT_READY")).when(emails).requireReady();
        assertThrows(IllegalStateException.class, () -> service.send("person@example.invalid", request));
        verifyNoInteractions(challenges);
    }
}
