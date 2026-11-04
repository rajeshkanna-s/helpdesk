package com.kuwy.helpdesk.services;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.controllers.PublicPortalController;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.repositories.*;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CustomerOtpServiceSecurityTest {
    private static final String EMAIL = "person@example.invalid";
    private static final String FIRST = "135790";
    private static final String SECOND = "135791";
    private final MutableClock clock = new MutableClock();
    private final Map<String, String> hashInputs = new ConcurrentHashMap<>();
    private AccountEmailService emails;
    private PasswordEncoder encoder;
    private SecureRandom random;
    private CustomerOtpService service;
    private Logger logger;
    private Level previousLevel;
    private ListAppender<ILoggingEvent> logs;

    @BeforeEach
    void setUp() {
        emails = mock(AccountEmailService.class);
        encoder = mock(PasswordEncoder.class);
        random = mock(SecureRandom.class);
        AtomicInteger codes = new AtomicInteger(135790);
        AtomicInteger hashes = new AtomicInteger();
        when(random.nextInt(1_000_000)).thenAnswer(call -> codes.getAndIncrement());
        when(encoder.encode(any(CharSequence.class))).thenAnswer(call -> {
            String hash = "opaque-hash-" + hashes.incrementAndGet();
            hashInputs.put(hash, call.<CharSequence>getArgument(0).toString());
            return hash;
        });
        when(encoder.matches(any(CharSequence.class), anyString())).thenAnswer(call ->
                call.<CharSequence>getArgument(0).toString().equals(hashInputs.get(call.<String>getArgument(1))));
        when(emails.enqueue(anyLong(), anyString(), anyString(), anyString(), anyString())).thenReturn("queued-row");
        service = new CustomerOtpService(emails, encoder, clock, random);
        logger = (Logger) LoggerFactory.getLogger(CustomerOtpService.class);
        previousLevel = logger.getLevel();
        logger.setLevel(Level.ALL);
        logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void noOtpLogging() {
        logger.detachAppender(logs);
        logger.setLevel(previousLevel);
        logs.stop();
        assertTrue(logs.list.isEmpty(), "OTP delivery and verification must not log codes or callback exceptions");
    }

    @Test
    void queuesRandomCodeOnlyInHtmlAndStoresOnlyTheInjectedEncoderHash() {
        service.generateAndDispatchOtp(7L, " PERSON+Tag@Example.invalid ", "A&B <Support>");
        ArgumentCaptor<String> html = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        var order = inOrder(emails, random, encoder);
        order.verify(emails).requireReady();
        order.verify(random).nextInt(1_000_000);
        order.verify(encoder).encode(FIRST);
        order.verify(emails).enqueue(eq(7L), eq("person+tag@example.invalid"),
                eq("Your sign-in verification code"), html.capture(), key.capture());
        assertTrue(html.getValue().contains("<strong>" + FIRST + "</strong>"));
        assertTrue(html.getValue().contains("A&amp;B &lt;Support&gt;"));
        assertFalse(html.getValue().contains("A&B <Support>"));
        assertTrue(key.getValue().startsWith("customer-otp:"));
        assertNotNull(UUID.fromString(key.getValue().substring("customer-otp:".length())));
        Object entry = stored(7L, "person+tag@example.invalid");
        assertEquals("opaque-hash-1", ReflectionTestUtils.getField(entry, "hashedOtp"));
        assertEquals(clock.instant().plusSeconds(300), ReflectionTestUtils.getField(entry, "expiresAt"));
        assertEquals(5, ReflectionTestUtils.getField(entry, "remainingAttempts"));
        assertEquals(3, entry.getClass().getDeclaredFields().length, "No raw code is retained in the entry");
        verifyNoMoreInteractions(emails);
    }

    @Test
    void usesFreshRandomValuesForResendsIncludingLeadingZeros() {
        when(random.nextInt(1_000_000)).thenReturn(42, 712345);
        generate();
        generate();
        ArgumentCaptor<String> html = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        verify(emails, times(2)).enqueue(eq(7L), eq(EMAIL), eq("Your sign-in verification code"),
                html.capture(), key.capture());
        assertTrue(html.getAllValues().get(0).contains("<strong>000042</strong>"));
        assertTrue(html.getAllValues().get(1).contains("<strong>712345</strong>"));
        assertNotEquals(key.getAllValues().get(0), key.getAllValues().get(1));
        assertFalse(service.verifyOtp(7L, EMAIL, "000042"));
        assertTrue(service.verifyOtp(7L, EMAIL, "712345"));
        assertFalse(service.verifyOtp(7L, EMAIL, "712345"));
    }

    @Test
    void defaultConstructionNeedsNoClockBeanAndEnqueueCannotJoinACallersTransaction() throws Exception {
        CustomerOtpService defaultService = new CustomerOtpService(emails, encoder);
        assertInstanceOf(SecureRandom.class, ReflectionTestUtils.getField(defaultService, "random"));
        var generate = CustomerOtpService.class.getMethod("generateAndDispatchOtp", Long.class, String.class, String.class);
        assertEquals(void.class, generate.getReturnType());
        assertEquals(Propagation.NOT_SUPPORTED, generate.getAnnotation(Transactional.class).propagation());
    }

    @ParameterizedTest
    @CsvSource({"299,true", "300,false", "301,false"})
    void expiryIsEnforcedAtTheExactFiveMinuteBoundary(long seconds, boolean valid) {
        generate();
        clock.advanceSeconds(seconds);
        assertEquals(valid, service.verifyOtp(7L, EMAIL, FIRST));
        assertNull(stored(7L, EMAIL));
        verify(encoder, times(valid ? 1 : 0)).matches(any(), anyString());
    }

    @Test
    void aCodeExpiringDuringHashVerificationCannotBeConsumed() {
        generate();
        when(encoder.matches(eq(FIRST), anyString())).thenAnswer(call -> {
            clock.advanceSeconds(300);
            return true;
        });
        assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
        assertNull(stored(7L, EMAIL));
    }

    @Test
    void resendInvalidatesTheOldCodeAndStartsANewExpiry() {
        generate();
        clock.advanceSeconds(299);
        generate();
        assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
        clock.advanceSeconds(299);
        assertTrue(service.verifyOtp(7L, " PERSON@EXAMPLE.INVALID ", SECOND));
        assertFalse(service.verifyOtp(7L, EMAIL, SECOND));
    }

    @Test
    void fiveFailedAttemptsRemoveTheEntryAndNeverAllowReplay() {
        generate();
        for (int i = 0; i < 8; i++) {
            assertFalse(service.verifyOtp(7L, EMAIL, "999999"));
        }
        assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
        verify(encoder, times(5)).matches("999999", "opaque-hash-1");
        verify(encoder, never()).matches(eq(FIRST), anyString());
        assertNull(stored(7L, EMAIL));
    }

    @Test
    void theFifthAttemptCanSucceedButCannotBeReplayed() {
        generate();
        for (int i = 0; i < 4; i++) {
            assertFalse(service.verifyOtp(7L, EMAIL, "999999"));
        }
        assertTrue(service.verifyOtp(7L, EMAIL, FIRST));
        assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
    }

    @ParameterizedTest
    @ValueSource(strings = {"123456", "000000", "999999"})
    void familiarSixDigitValuesAreNotAutomaticBypasses(String code) {
        assertFalse(service.verifyOtp(7L, EMAIL, code));
        generate();
        assertFalse(service.verifyOtp(7L, EMAIL, code));
        assertTrue(service.verifyOtp(7L, EMAIL, FIRST));
    }

    @Test
    void codesAreScopedToBothCompanyAndCanonicalEmail() {
        generate();
        service.generateAndDispatchOtp(8L, EMAIL, "Other company");
        service.generateAndDispatchOtp(7L, "other@example.invalid", "Example");
        assertFalse(service.verifyOtp(8L, EMAIL, FIRST));
        assertFalse(service.verifyOtp(7L, "other@example.invalid", FIRST));
        assertFalse(service.verifyOtp(7L, EMAIL, SECOND));
        assertTrue(service.verifyOtp(7L, EMAIL, FIRST));
        assertTrue(service.verifyOtp(8L, EMAIL, SECOND));
        assertTrue(service.verifyOtp(7L, "other@example.invalid", "135792"));
    }

    @Test
    void unconfiguredEmailFailsBeforeRandomnessHashingOrPublishing() {
        doThrow(new IllegalStateException("ACCOUNT_EMAIL_NOT_READY " + FIRST)).when(emails).requireReady();
        assertQueueFailure(this::generate);
        assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
        verify(emails, never()).enqueue(any(), any(), any(), any(), any());
        verifyNoInteractions(random, encoder);
        assertTrue(partitions().stream().allMatch(Map::isEmpty));
    }

    @Test
    void enqueueFailureCannotPublishACodeOrExposeItsExceptionPayload() {
        doAnswer(call -> {
            throw new IllegalStateException(call.<String>getArgument(3));
        }).when(emails).enqueue(anyLong(), anyString(), anyString(), anyString(), anyString());
        assertQueueFailure(this::generate);
        assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
        assertNull(stored(7L, EMAIL));
        verify(encoder, never()).matches(any(), anyString());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void failedResendPreservesThePreviousCodeExpiryAndAttemptCount(boolean readinessFailure) {
        generate();
        assertFalse(service.verifyOtp(7L, EMAIL, "999999"));
        Object previous = stored(7L, EMAIL);
        Object expiresAt = ReflectionTestUtils.getField(previous, "expiresAt");
        clock.advanceSeconds(299);
        if (readinessFailure) {
            doThrow(new IllegalStateException(SECOND)).when(emails).requireReady();
        } else {
            doThrow(new IllegalStateException(SECOND)).when(emails)
                    .enqueue(anyLong(), anyString(), anyString(), anyString(), anyString());
        }
        assertQueueFailure(this::generate);
        assertSame(previous, stored(7L, EMAIL));
        assertEquals(expiresAt, ReflectionTestUtils.getField(previous, "expiresAt"));
        assertEquals(4, ReflectionTestUtils.getField(previous, "remainingAttempts"));
        assertTrue(service.verifyOtp(7L, EMAIL, FIRST));
        assertFalse(service.verifyOtp(7L, EMAIL, SECOND));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" "})
    void missingQueueReceiptIsNotSuccessfulDelivery(String receipt) {
        doReturn(receipt).when(emails).enqueue(anyLong(), anyString(), anyString(), anyString(), anyString());
        assertQueueFailure(this::generate);
        assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
        assertNull(stored(7L, EMAIL));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", FIRST})
    void missingOrPlaintextHashesNeverReachTheOutbox(String hash) {
        doReturn(hash).when(encoder).encode(any());
        assertQueueFailure(this::generate);
        verify(emails, never()).enqueue(any(), any(), any(), any(), any());
        assertNull(stored(7L, EMAIL));
    }

    @Test
    void encoderFailuresAreSanitizedAndVerificationFailsClosed() {
        doThrow(new IllegalStateException(FIRST)).when(encoder).encode(any());
        assertQueueFailure(this::generate);
        verify(emails, never()).enqueue(any(), any(), any(), any(), any());
        doReturn("opaque-hash").when(encoder).encode(any());
        generate();
        doThrow(new IllegalStateException(SECOND)).when(encoder).matches(any(), anyString());
        assertFalse(service.verifyOtp(7L, EMAIL, SECOND));
        assertNull(stored(7L, EMAIL));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "not-an-email", "a@", "@example.invalid", "a@@example.invalid",
            "a b@example.invalid", "a@localhost", ".a@example.invalid", "a..b@example.invalid",
            "a.@example.invalid", "a@-example.invalid", "a@example-.invalid", "a@example..invalid",
            "a@example_.invalid", "Person <a@example.invalid>", "a@example.invalid,b@example.invalid",
            "a@example.invalid\r\nBcc: b@example.invalid", "a@example.invalid\n", "\ta@example.invalid",
            "a\u200b@example.invalid", "\u00e9@example.invalid"})
    void malformedEmailsCannotQueueOrVerify(String email) {
        assertThrows(IllegalArgumentException.class, () -> service.generateAndDispatchOtp(7L, email, "Example"));
        assertFalse(service.verifyOtp(7L, email, FIRST));
        verifyNoInteractions(emails, random, encoder);
    }

    @Test
    void emailLocalPartDomainLabelsAndOverallLengthAreBounded() {
        String longest = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61);
        assertEquals(254, longest.length());
        assertEquals(longest, CustomerOtpService.canonicalEmail(longest));
        for (String invalid : List.of("a".repeat(65) + "@example.invalid", "a@" + "b".repeat(64) + ".invalid",
                longest + "d", " ".repeat(255) + EMAIL)) {
            assertThrows(IllegalArgumentException.class, () -> CustomerOtpService.canonicalEmail(invalid));
        }
        verifyNoInteractions(emails, random, encoder);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(longs = {0, -1})
    void invalidCompanyIdsCannotQueueOrVerify(Long companyId) {
        assertThrows(IllegalArgumentException.class, () -> service.generateAndDispatchOtp(companyId, EMAIL, "Example"));
        assertFalse(service.verifyOtp(companyId, EMAIL, FIRST));
        verifyNoInteractions(emails, random, encoder);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "13579", "1357900", "13579a", "135 790", "+135790", "-135790",
            " 135790", "135790 ", "135790\n", "135790\t", "\u0661\u0663\u0665\u0667\u0669\u0660"})
    void malformedCodesCannotReachHashVerificationOrConsumeAnEntry(String code) {
        generate();
        Object entry = stored(7L, EMAIL);
        assertFalse(service.verifyOtp(7L, EMAIL, code));
        verify(encoder, never()).matches(any(), anyString());
        assertSame(entry, stored(7L, EMAIL));
        assertEquals(5, ReflectionTestUtils.getField(entry, "remainingAttempts"));
        assertTrue(service.verifyOtp(7L, EMAIL, FIRST));
    }

    @Test
    void cacheAndLocksStayBoundedWithoutEvictingLiveCodesAndExpiredSlotsAreReused() {
        assertEquals(64, partitions().size());
        List<String> colliding = IntStream.range(0, 100_000).mapToObj(i -> "person" + i + "@example.invalid")
                .filter(email -> Math.floorMod(("7:" + email).hashCode(), 64) == 0).limit(129).toList();
        assertEquals(129, colliding.size());
        for (int i = 0; i < 128; i++) {
            service.generateAndDispatchOtp(7L, colliding.get(i), "Example");
        }
        Object live = stored(7L, colliding.get(1));
        assertQueueFailure(() -> service.generateAndDispatchOtp(7L, colliding.get(128), "Example"));
        assertEquals(128, partitions().get(0).size());
        assertSame(live, stored(7L, colliding.get(1)));
        verify(emails, times(128)).enqueue(any(), any(), any(), any(), any());
        service.generateAndDispatchOtp(7L, colliding.get(0), "Example");
        assertEquals(128, partitions().get(0).size(), "Resend replaces rather than allocating another entry");
        clock.advanceSeconds(300);
        service.generateAndDispatchOtp(7L, colliding.get(128), "Example");
        assertEquals(1, partitions().stream().mapToInt(Map::size).sum());
        assertEquals(64, partitions().size());
    }

    @Test
    void concurrentCorrectVerificationsHaveExactlyOneWinner() throws Exception {
        generate();
        CountDownLatch checking = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch secondStarted = new CountDownLatch(1);
        AtomicInteger checks = new AtomicInteger();
        doAnswer(call -> {
            if (checks.incrementAndGet() == 1) {
                checking.countDown();
                assertTrue(release.await(5, TimeUnit.SECONDS));
            }
            return true;
        }).when(encoder).matches(FIRST, "opaque-hash-1");
        var pool = Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> service.verifyOtp(7L, EMAIL, FIRST));
            assertTrue(checking.await(5, TimeUnit.SECONDS));
            var second = pool.submit(() -> {
                secondStarted.countDown();
                return service.verifyOtp(7L, EMAIL, FIRST);
            });
            assertTrue(secondStarted.await(5, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class, () -> second.get(100, TimeUnit.MILLISECONDS));
            release.countDown();
            assertTrue(first.get(5, TimeUnit.SECONDS));
            assertFalse(second.get(5, TimeUnit.SECONDS));
            assertEquals(1, checks.get());
            assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
        } finally {
            release.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    @Test
    void consumingAnOldEntryCannotRemoveAConcurrentResend() throws Exception {
        generate();
        CountDownLatch checking = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch resendStarted = new CountDownLatch(1);
        doAnswer(call -> {
            checking.countDown();
            assertTrue(release.await(5, TimeUnit.SECONDS));
            return true;
        }).when(encoder).matches(FIRST, "opaque-hash-1");
        var pool = Executors.newFixedThreadPool(2);
        try {
            var verification = pool.submit(() -> service.verifyOtp(7L, EMAIL, FIRST));
            assertTrue(checking.await(5, TimeUnit.SECONDS));
            var resend = pool.submit(() -> {
                resendStarted.countDown();
                generate();
            });
            assertTrue(resendStarted.await(5, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class, () -> resend.get(100, TimeUnit.MILLISECONDS));
            release.countDown();
            assertTrue(verification.get(5, TimeUnit.SECONDS));
            resend.get(5, TimeUnit.SECONDS);
            assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
            assertTrue(service.verifyOtp(7L, EMAIL, SECOND));
        } finally {
            release.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void pendingResendCannotPublishOrRaceVerificationBeforeQueueAcceptance(boolean succeeds) throws Exception {
        generate();
        Object previous = stored(7L, EMAIL);
        CountDownLatch queuing = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch verificationStarted = new CountDownLatch(1);
        doAnswer(call -> {
            assertSame(previous, stored(7L, EMAIL), "The replacement must not be visible before enqueue returns");
            queuing.countDown();
            assertTrue(release.await(5, TimeUnit.SECONDS));
            if (!succeeds) {
                throw new IllegalStateException(call.<String>getArgument(3));
            }
            return "replacement-row";
        }).when(emails).enqueue(anyLong(), anyString(), anyString(), anyString(), anyString());
        var pool = Executors.newFixedThreadPool(2);
        try {
            var resend = pool.submit(() -> {
                if (succeeds) {
                    generate();
                } else {
                    assertQueueFailure(this::generate);
                }
            });
            assertTrue(queuing.await(5, TimeUnit.SECONDS));
            var verification = pool.submit(() -> {
                verificationStarted.countDown();
                return service.verifyOtp(7L, EMAIL, FIRST);
            });
            assertTrue(verificationStarted.await(5, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class, () -> verification.get(100, TimeUnit.MILLISECONDS));
            release.countDown();
            resend.get(5, TimeUnit.SECONDS);
            assertEquals(!succeeds, verification.get(5, TimeUnit.SECONDS).booleanValue());
            assertEquals(succeeds, service.verifyOtp(7L, EMAIL, SECOND));
            assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
        } finally {
            release.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    @Test
    void concurrentWrongGuessesCannotExceedTheAttemptBudget() throws Exception {
        generate();
        CountDownLatch ready = new CountDownLatch(12);
        CountDownLatch start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(12);
        try {
            var results = IntStream.range(0, 12).mapToObj(i -> pool.submit(() -> {
                ready.countDown();
                assertTrue(start.await(5, TimeUnit.SECONDS));
                return service.verifyOtp(7L, EMAIL, "999999");
            })).toList();
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            for (var result : results) {
                assertFalse(result.get(5, TimeUnit.SECONDS));
            }
            verify(encoder, times(5)).matches("999999", "opaque-hash-1");
            assertFalse(service.verifyOtp(7L, EMAIL, FIRST));
        } finally {
            start.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    @Test
    void queuedCodeIsAbsentFromResponsesAndOnlyItsOneTimeProofProducesASignedCustomerJwt() {
        CompanyRepository companies = mock(CompanyRepository.class);
        Company company = new Company();
        company.setId(7L);
        company.setSubdomain("acme");
        company.setName("Acme Support");
        when(companies.findBySubdomain("acme")).thenReturn(Optional.of(company));
        RateLimiterService limits = mock(RateLimiterService.class);
        when(limits.allowOtpRequest(anyString(), anyString())).thenReturn(true);
        when(limits.allowAuthentication(anyString(), anyString(), anyString())).thenReturn(true);
        JwtTokenProvider tokens = new JwtTokenProvider();
        ReflectionTestUtils.setField(tokens, "signingKey", Keys.hmacShaKeyFor(
                "customer-otp-test-signing-key-0001".getBytes(StandardCharsets.US_ASCII)));
        ReflectionTestUtils.setField(tokens, "jwtExpirationMs", 60_000L);
        PublicPortalController controller = new PublicPortalController(companies, mock(DepartmentRepository.class),
                mock(TicketRepository.class), mock(TicketThreadRepository.class), mock(TicketService.class), limits,
                mock(SubscriptionService.class), mock(JdbcTemplate.class), service, mock(EmailService.class), tokens,
                mock(PortalTicketService.class), mock(PortalLoginService.class), mock(com.kuwy.helpdesk.config.BrowserSessionCookies.class));
        MockHttpServletRequest http = new MockHttpServletRequest();
        http.setRemoteAddr("198.51.100.23");
        var queued = controller.requestOtp("ACME", Map.of("email", " PERSON@EXAMPLE.INVALID "), http);
        assertEquals(200, queued.getStatusCode().value());
        assertEquals(Set.of("success", "message"), queued.getBody().keySet());
        assertFalse(queued.getBody().toString().contains(FIRST));
        assertTrue(queued.getBody().get("message").toString().contains("queued"));
        assertEquals(400, controller.verifyOtp("acme", Map.of("email", EMAIL, "otp", "999999"), http)
                .getStatusCode().value());
        var verified = controller.verifyOtp("acme", Map.of("email", EMAIL, "otp", FIRST), http);
        assertEquals(200, verified.getStatusCode().value());
        assertEquals(Set.of("success", "token", "email", "companyId"), verified.getBody().keySet());
        String token = (String) verified.getBody().get("token");
        assertTrue(tokens.validateCustomerToken(token, 7L, EMAIL));
        assertFalse(tokens.validateCustomerToken(token, 8L, EMAIL));
        assertFalse(tokens.validateCustomerToken(token, 7L, "other@example.invalid"));
        var claims = tokens.getClaimsFromToken(token);
        assertEquals(EMAIL, claims.getSubject());
        assertEquals("CUSTOMER", claims.get("role"));
        assertEquals("PORTAL_CUSTOMER", claims.get("type"));
        assertEquals("acme", claims.get("subdomain"));
        assertEquals(Set.of("sub", "companyId", "subdomain", "role", "type", "iat", "exp"), claims.keySet());
        var replay = controller.verifyOtp("acme", Map.of("email", EMAIL, "otp", FIRST), http);
        assertEquals(400, replay.getStatusCode().value());
        assertEquals(Set.of("error"), replay.getBody().keySet());
    }

    private void generate() {
        service.generateAndDispatchOtp(7L, EMAIL, "Example");
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> partitions() {
        return (List<Map<String, Object>>) ReflectionTestUtils.getField(service, "otpStores");
    }

    private Object stored(Long companyId, String email) {
        String key = companyId + ":" + email;
        return partitions().get(Math.floorMod(key.hashCode(), partitions().size())).get(key);
    }

    private void assertQueueFailure(Runnable operation) {
        IllegalStateException failure = assertThrows(IllegalStateException.class, operation::run);
        assertEquals("CUSTOMER_OTP_UNAVAILABLE", failure.getMessage());
        assertNull(failure.getCause());
    }

    private static final class MutableClock extends Clock {
        private volatile Instant now = Instant.parse("2026-11-04T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
        void advanceSeconds(long seconds) { now = now.plusSeconds(seconds); }
    }
}
