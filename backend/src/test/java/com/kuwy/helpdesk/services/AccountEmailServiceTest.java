package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.models.AccountEmailOutbox;
import com.kuwy.helpdesk.models.AccountEmailOutbox.DeliveryStatus;
import com.kuwy.helpdesk.repositories.AccountEmailOutboxRepository;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Pageable;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import static com.kuwy.helpdesk.models.AccountEmailOutbox.DeliveryStatus.*;
import static com.kuwy.helpdesk.models.AccountEmailOutbox.ErrorCode.DELIVERY_FAILED;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AccountEmailServiceTest {
    private static final String FROM = "accounts@example.invalid";
    private static final String RECIPIENT = "recipient@example.invalid";
    private static final String SUBJECT = "Reset your account";
    private static final String HTML = "<a href=\"https://example.invalid/reset?token=unit-test-token\">Reset</a>";
    private static final String KEY = "reset:42";
    private final Map<String, AccountEmailOutbox> rows = new LinkedHashMap<>();
    private final Map<String, String> protectedPayloads = new ConcurrentHashMap<>();
    private final List<AccountEmailService> services = new ArrayList<>();
    private final MutableClock clock = new MutableClock();
    private final FakeTransactions transactions = new FakeTransactions();
    private AccountEmailOutboxRepository outbox;
    private SecretCryptoService crypto;
    private ObjectProvider<JavaMailSender> senders;
    private JavaMailSender sender;
    private AccountEmailService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        outbox = mock(AccountEmailOutboxRepository.class);
        crypto = mock(SecretCryptoService.class);
        senders = mock(ObjectProvider.class);
        sender = mock(JavaMailSender.class);
        when(crypto.isConfigured()).thenReturn(true);
        when(senders.getIfAvailable()).thenReturn(sender);
        when(sender.createMimeMessage()).thenAnswer(call -> new MimeMessage(Session.getInstance(new Properties())));
        when(crypto.encrypt(anyString(), anyString())).thenAnswer(call -> {
            String ciphertext = "opaque-ciphertext-" + UUID.randomUUID();
            protectedPayloads.put(call.getArgument(1) + "|" + ciphertext, call.getArgument(0));
            return ciphertext;
        });
        when(crypto.decrypt(anyString(), anyString())).thenAnswer(call -> {
            String plaintext = protectedPayloads.get(call.getArgument(1) + "|" + call.getArgument(0));
            if (plaintext == null) {
                throw new IllegalStateException("Synthetic authentication tag failure");
            }
            return plaintext;
        });
        when(outbox.findByIdempotencyKey(anyString())).thenAnswer(call -> rows.values().stream()
                .filter(row -> row.getIdempotencyKey().equals(call.getArgument(0))).findFirst());
        when(outbox.saveAndFlush(any(AccountEmailOutbox.class))).thenAnswer(call -> store(call.getArgument(0)));
        when(outbox.save(any(AccountEmailOutbox.class))).thenAnswer(call -> {
            assertTrue(transactions.active, "Worker writes must be inside a short transaction");
            return store(call.getArgument(0));
        });
        when(outbox.findDueForUpdate(anyCollection(), any(Instant.class), any(Pageable.class))).thenAnswer(call -> {
            assertTrue(transactions.active);
            Collection<DeliveryStatus> statuses = call.getArgument(0);
            Instant now = call.getArgument(1);
            Pageable page = call.getArgument(2);
            assertEquals(List.of(QUEUED, PROCESSING), List.copyOf(statuses));
            assertEquals(0, page.getPageNumber());
            assertEquals(1, page.getPageSize(), "Claim only the row about to be delivered");
            return rows.values().stream().filter(row -> statuses.contains(row.getStatus()))
                    .filter(row -> !row.getNextAttemptAt().isAfter(now))
                    .sorted(Comparator.comparing(AccountEmailOutbox::getNextAttemptAt)
                            .thenComparing(AccountEmailOutbox::getCreatedAt).thenComparing(AccountEmailOutbox::getId))
                    .limit(page.getPageSize()).toList();
        });
        when(outbox.findByIdForUpdate(anyString())).thenAnswer(call -> {
            assertTrue(transactions.active);
            return Optional.ofNullable(rows.get(call.getArgument(0)));
        });
        service = newService(true, FROM, 10_000);
    }

    @AfterEach
    void stopWorkers() {
        services.forEach(AccountEmailService::stopWorker);
    }

    @Test
    void enqueueStoresOnlyCiphertextAndBindsEncryptionToTheOutboxUuid() throws Exception {
        String id = enqueue(KEY);
        AccountEmailOutbox row = rows.get(id);
        assertEquals(id, UUID.fromString(id).toString());
        assertEquals(7L, row.getCompanyId());
        assertEquals(KEY, row.getIdempotencyKey());
        assertEquals(QUEUED, row.getStatus());
        assertEquals(0, row.getAttemptCount());
        assertEquals(clock.instant(), row.getCreatedAt());
        assertEquals(clock.instant(), row.getNextAttemptAt());
        assertNull(row.getLastErrorCode());
        assertTrue(row.getEncryptedPayload().startsWith("opaque-ciphertext-"));
        assertFalse(row.getEncryptedPayload().contains("unit-test-token"));
        assertFalse(row.getEncryptedPayload().contains(RECIPIENT));
        ArgumentCaptor<String> plaintext = ArgumentCaptor.forClass(String.class);
        verify(crypto).encrypt(plaintext.capture(), eq("account-email:" + id));
        JsonNode payload = new ObjectMapper().readTree(plaintext.getValue());
        assertEquals(3, payload.size());
        assertEquals(RECIPIENT, payload.get("recipient").asText());
        assertEquals(SUBJECT, payload.get("subject").asText());
        assertEquals(HTML, payload.get("html").asText());
        verifyNoInteractions(sender);
        assertEquals(0, transactions.started, "Enqueue must not open an independent worker transaction");
    }

    @Test
    void repeatedKeyReturnsTheOriginalRowWithoutReencryptingOrSending() {
        String id = enqueue(KEY);
        assertEquals(id, service.enqueue(7L, "other@example.invalid", "Other subject", "<p>Other</p>", KEY));
        assertEquals(1, rows.size());
        verify(outbox).saveAndFlush(any(AccountEmailOutbox.class));
        verify(crypto).encrypt(anyString(), eq("account-email:" + id));
        verifyNoInteractions(sender);
        assertEquals(QUEUED, rows.get(id).getStatus());
    }

    @Test
    void nullableCompanyIsSupportedButAnExistingKeyCannotCrossCompanies() {
        String id = service.enqueue(null, RECIPIENT, SUBJECT, HTML, KEY);
        assertNull(rows.get(id).getCompanyId());
        assertEquals(id, service.enqueue(null, RECIPIENT, SUBJECT, HTML, KEY));
        assertSafeFailure(() -> service.enqueue(7L, RECIPIENT, SUBJECT, HTML, KEY));
        verify(outbox).saveAndFlush(any(AccountEmailOutbox.class));
    }

    @Test
    void deliveryRequiresExplicitEnablementEvenWithAConfiguredSender() {
        assertUnavailable(newService(false, FROM, 10_000));
        verifyNoInteractions(crypto, senders);
    }

    @Test
    void missingCryptoOrSenderDisablesEnqueueAndTheWorker() {
        when(crypto.isConfigured()).thenReturn(false);
        assertUnavailable(service);
        when(crypto.isConfigured()).thenReturn(true);
        when(senders.getIfAvailable()).thenReturn(null);
        assertUnavailable(service);
    }

    @Test
    void readinessProviderFailuresAreSanitized() {
        when(senders.getIfAvailable()).thenThrow(new IllegalStateException(HTML));
        assertUnavailable(service);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "not-an-address", "Display <sender@example.invalid>",
            "sender@example.invalid\r\nBcc: other@example.invalid", "a@example.invalid,b@example.invalid"})
    void invalidConfiguredFromDisablesAllActivity(String from) {
        assertUnavailable(newService(true, from, 10_000));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", ":reset", "a b", "reset/42", "reset?token=unit-test-token",
            "recipient@example.invalid", "reset\r\nBcc:recipient"})
    void rejectsInvalidIdempotencyKeysBeforePersistence(String key) {
        assertThrows(IllegalArgumentException.class, () -> enqueue(key));
        verifyNoInteractions(outbox, sender);
        verify(crypto, never()).encrypt(anyString(), anyString());
    }

    @ParameterizedTest
    @MethodSource("invalidPayloads")
    void rejectsInvalidPayloadsBeforePersistence(String recipient, String subject, String html) {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.enqueue(7L, recipient, subject, html, KEY));
        assertEquals("INVALID_ACCOUNT_EMAIL", error.getMessage());
        assertNull(error.getCause());
        verifyNoInteractions(outbox, sender);
        verify(crypto, never()).encrypt(anyString(), anyString());
    }

    static Stream<Arguments> invalidPayloads() {
        return Stream.of(Arguments.of(null, SUBJECT, HTML), Arguments.of("", SUBJECT, HTML),
                Arguments.of("invalid", SUBJECT, HTML), Arguments.of("a@example.invalid,b@example.invalid", SUBJECT, HTML),
                Arguments.of("a@example.invalid\nBcc:b@example.invalid", SUBJECT, HTML),
                Arguments.of("a".repeat(255) + "@example.invalid", SUBJECT, HTML),
                Arguments.of(RECIPIENT, null, HTML), Arguments.of(RECIPIENT, " ", HTML),
                Arguments.of(RECIPIENT, "Subject\r\nBcc: b@example.invalid", HTML),
                Arguments.of(RECIPIENT, "a\tb", HTML), Arguments.of(RECIPIENT, "s".repeat(201), HTML),
                Arguments.of(RECIPIENT, SUBJECT, null), Arguments.of(RECIPIENT, SUBJECT, " "),
                Arguments.of(RECIPIENT, SUBJECT, "h".repeat(16_385)));
    }

    @Test
    void enforcesCompanyKeyAndUtf8PayloadBounds() {
        assertThrows(IllegalArgumentException.class, () -> enqueue("k".repeat(129)));
        assertThrows(IllegalArgumentException.class, () -> service.enqueue(0L, RECIPIENT, SUBJECT, HTML, KEY));
        assertThrows(IllegalArgumentException.class, () -> service.enqueue(-1L, RECIPIENT, SUBJECT, HTML, KEY));
        assertSafeFailure(() -> service.enqueue(7L, RECIPIENT, SUBJECT, "\u20ac".repeat(11_000), KEY));
        verify(crypto, never()).encrypt(anyString(), anyString());
        assertNotNull(service.enqueue(7L, RECIPIENT, "s".repeat(200), "h".repeat(16_384), "k".repeat(128)));
        verifyNoInteractions(sender);
    }

    @Test
    void encryptionAndPersistenceFailuresNeverExposePlaintextOrCauses() {
        doThrow(new IllegalStateException(HTML)).when(crypto).encrypt(anyString(), anyString());
        assertSafeFailure(() -> enqueue(KEY));
        verify(outbox, never()).saveAndFlush(any());
        doReturn("x".repeat(60_001)).when(crypto).encrypt(anyString(), anyString());
        assertSafeFailure(() -> enqueue(KEY));
        doReturn("opaque").when(crypto).encrypt(anyString(), anyString());
        doThrow(new DataIntegrityViolationException(HTML)).when(outbox).saveAndFlush(any());
        assertSafeFailure(() -> enqueue(KEY));
        assertTrue(rows.isEmpty());
        verifyNoInteractions(sender);
    }

    @Test
    void firstInsertCollisionFailsSafelyAndAFreshRetryReturnsTheWinningRow() {
        String winner = enqueue(KEY);
        doReturn(Optional.empty(), Optional.of(rows.get(winner))).when(outbox).findByIdempotencyKey(KEY);
        doThrow(new DataIntegrityViolationException(HTML)).when(outbox).saveAndFlush(any());
        assertSafeFailure(() -> enqueue(KEY));
        assertEquals(winner, enqueue(KEY));
        assertEquals(1, rows.size());
        verifyNoInteractions(sender);
    }

    @Test
    void marksSentOnlyAfterSendReturnsAndNeverHoldsATransactionAcrossSmtp() throws Exception {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        doAnswer(call -> {
            assertFalse(transactions.active);
            assertTrue(transactions.committed >= 1, "The claim must commit before SMTP");
            assertEquals(PROCESSING, row.getStatus());
            assertEquals(1, row.getAttemptCount());
            assertEquals(clock.instant().plusSeconds(120), row.getNextAttemptAt());
            MimeMessage message = call.getArgument(0);
            assertEquals(FROM, message.getFrom()[0].toString());
            assertEquals(RECIPIENT, message.getRecipients(Message.RecipientType.TO)[0].toString());
            assertEquals(1, message.getAllRecipients().length);
            assertNull(message.getRecipients(Message.RecipientType.CC));
            assertNull(message.getRecipients(Message.RecipientType.BCC));
            assertEquals(SUBJECT, message.getSubject());
            assertTrue(message.getDataHandler().getContentType().startsWith("text/html"));
            assertEquals(HTML, message.getContent());
            return null;
        }).when(sender).send(any(MimeMessage.class));
        service.processDueMessages();
        assertEquals(SENT, row.getStatus());
        assertEquals(1, row.getAttemptCount());
        assertNull(row.getLastErrorCode());
        assertFalse(transactions.active);
        verify(crypto).decrypt(row.getEncryptedPayload(), "account-email:" + row.getId());
        verify(sender).send(any(MimeMessage.class));
        verify(outbox).findByIdForUpdate(row.getId());
    }

    @Test
    void retriesUseBoundedExponentialBackoffAndStopAfterFiveAttempts() {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        doThrow(new MailSendException(HTML)).when(sender).send(any(MimeMessage.class));
        for (int attempt = 1; attempt <= 5; attempt++) {
            Instant now = clock.instant();
            service.processDueMessages();
            assertEquals(attempt, row.getAttemptCount());
            assertEquals(DELIVERY_FAILED, row.getLastErrorCode());
            assertEquals(attempt == 5 ? FAILED : QUEUED, row.getStatus());
            if (attempt < 5) {
                assertEquals(now.plusSeconds(30L << (attempt - 1)), row.getNextAttemptAt());
                service.processDueMessages();
                verify(sender, times(attempt)).send(any(MimeMessage.class));
                clock.now = row.getNextAttemptAt();
            }
        }
        clock.advanceSeconds(86_400);
        service.processDueMessages();
        verify(sender, times(5)).send(any(MimeMessage.class));
        assertEquals(FAILED, row.getStatus());
    }

    @Test
    void aSuccessfulRetryClearsTheSafeErrorCode() {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        doThrow(new MailSendException(HTML)).doNothing().when(sender).send(any(MimeMessage.class));
        service.processDueMessages();
        assertEquals(QUEUED, row.getStatus());
        assertEquals(DELIVERY_FAILED, row.getLastErrorCode());
        clock.now = row.getNextAttemptAt();
        service.processDueMessages();
        assertEquals(SENT, row.getStatus());
        assertEquals(2, row.getAttemptCount());
        assertNull(row.getLastErrorCode());
    }

    @Test
    void recoversExpiredProcessingLeasesButDoesNotStealAnActiveLease() {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        row.setStatus(PROCESSING);
        row.setAttemptCount(2);
        row.setNextAttemptAt(clock.instant().plusSeconds(120));
        service.processDueMessages();
        verifyNoInteractions(sender);
        clock.advanceSeconds(120);
        service.processDueMessages();
        assertEquals(SENT, row.getStatus());
        assertEquals(3, row.getAttemptCount());
        verify(sender).send(any(MimeMessage.class));
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 5, 6})
    void exhaustedOrCorruptLeasesFailWithoutAnotherSend(int attempts) {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        row.setStatus(PROCESSING);
        row.setAttemptCount(attempts);
        service.processDueMessages();
        assertEquals(FAILED, row.getStatus());
        assertEquals(attempts, row.getAttemptCount());
        assertEquals(DELIVERY_FAILED, row.getLastErrorCode());
        verifyNoInteractions(sender);
        verify(crypto, never()).decrypt(anyString(), anyString());
    }

    @Test
    void futureAndTerminalRowsAreNotDelivered() {
        rows.get(enqueue("future")).setNextAttemptAt(clock.instant().plusSeconds(1));
        rows.get(enqueue("sent")).setStatus(SENT);
        rows.get(enqueue("failed")).setStatus(FAILED);
        service.processDueMessages();
        verifyNoInteractions(sender);
        verify(outbox, never()).save(any());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void staleCompletionCannotOverwriteAReclaimedLease(boolean sendSucceeds) {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        doAnswer(call -> {
            row.setAttemptCount(2);
            row.setNextAttemptAt(clock.instant().plusSeconds(240));
            if (!sendSucceeds) {
                throw new MailSendException(HTML);
            }
            return null;
        }).when(sender).send(any(MimeMessage.class));
        service.processDueMessages();
        assertEquals(PROCESSING, row.getStatus());
        assertEquals(2, row.getAttemptCount());
        assertEquals(clock.instant().plusSeconds(240), row.getNextAttemptAt());
        assertNull(row.getLastErrorCode());
        verify(outbox).save(row);
    }

    @Test
    void decryptFailureCannotReachTheSender() {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        doThrow(new IllegalStateException(HTML)).when(crypto).decrypt(anyString(), anyString());
        service.processDueMessages();
        assertEquals(QUEUED, row.getStatus());
        assertEquals(DELIVERY_FAILED, row.getLastErrorCode());
        verifyNoInteractions(sender);
    }

    @ParameterizedTest
    @MethodSource("invalidStoredPayloads")
    void invalidDecryptedPayloadCannotReachTheSender(String plaintext) {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        doReturn(plaintext).when(crypto).decrypt(anyString(), anyString());
        service.processDueMessages();
        assertEquals(QUEUED, row.getStatus());
        assertEquals(DELIVERY_FAILED, row.getLastErrorCode());
        verifyNoInteractions(sender);
    }

    static Stream<String> invalidStoredPayloads() throws Exception {
        return Stream.of(null, "not-json", "null", "{}", "x".repeat(32_769),
                new ObjectMapper().writeValueAsString(Map.of("recipient", RECIPIENT,
                        "subject", "Reset\r\nBcc: other@example.invalid", "html", HTML)));
    }

    @Test
    void limitsEachInvocationToTenClaimsAndIgnoresOverlappingInvocations() {
        for (int i = 0; i < 11; i++) {
            enqueue("batch:" + i);
        }
        doAnswer(call -> {
            service.processDueMessages();
            return null;
        }).when(sender).send(any(MimeMessage.class));
        service.processDueMessages();
        verify(sender, times(10)).send(any(MimeMessage.class));
        verify(outbox, times(10)).findDueForUpdate(anyCollection(), any(), any());
        assertEquals(10, rows.values().stream().filter(row -> row.getStatus() == SENT).count());
        assertEquals(1, rows.values().stream().filter(row -> row.getStatus() == QUEUED).count());
    }

    @Test
    void aClaimCommitFailurePreventsSending() {
        enqueue(KEY);
        transactions.failNextCommit = true;
        assertDoesNotThrow(service::processDueMessages);
        verifyNoInteractions(sender);
    }

    @Test
    void completionFailureLeavesALeaseForCrashRecoveryWithoutLeakingTheCallbackError() {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        doThrow(new IllegalStateException(HTML)).doReturn(Optional.of(row)).when(outbox).findByIdForUpdate(row.getId());
        assertDoesNotThrow(service::processDueMessages);
        assertEquals(PROCESSING, row.getStatus());
        assertFalse(transactions.active);
        clock.advanceSeconds(120);
        service.processDueMessages();
        assertEquals(SENT, row.getStatus());
        assertEquals(2, row.getAttemptCount());
        verify(sender, times(2)).send(any(MimeMessage.class));
    }

    @Test
    void aTimedOutSenderIgnoringInterruptsCannotCreateMoreUncontrolledSends() throws Exception {
        AccountEmailOutbox row = rows.get(enqueue(KEY));
        AccountEmailService bounded = newService(true, FROM, 1_000);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch exited = new CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            try {
                for (;;) {
                    try {
                        if (!release.await(5, TimeUnit.SECONDS)) {
                            throw new IllegalStateException("Synthetic sender was not released");
                        }
                        return null;
                    } catch (InterruptedException ignored) {
                        // Deliberately model an SMTP transport that does not honor cancellation.
                    }
                }
            } finally {
                exited.countDown();
            }
        }).when(sender).send(any(MimeMessage.class));
        try {
            assertTimeout(Duration.ofSeconds(3), bounded::processDueMessages);
            assertEquals(0, entered.getCount());
            assertEquals(QUEUED, row.getStatus());
            assertEquals(DELIVERY_FAILED, row.getLastErrorCode());
            for (int i = 0; i < 20; i++) {
                clock.advanceSeconds(120);
                bounded.processDueMessages();
            }
            verify(sender).send(any(MimeMessage.class));
            verify(outbox).findDueForUpdate(anyCollection(), any(), any());
            assertEquals(1, row.getAttemptCount());
        } finally {
            release.countDown();
            assertTrue(exited.await(2, TimeUnit.SECONDS));
        }
        assertEquals(QUEUED, row.getStatus(), "Late SMTP return cannot retroactively mark a timed-out task SENT");
    }

    @Test
    void aStoppedWorkerCannotSend() {
        enqueue(KEY);
        service.stopWorker();
        service.processDueMessages();
        verifyNoInteractions(sender);
        assertEquals(0, transactions.started);
    }

    private AccountEmailService newService(boolean enabled, String from, long timeoutMillis) {
        AccountEmailService value = new AccountEmailService(outbox, crypto, senders, transactions,
                enabled, from, clock, timeoutMillis);
        services.add(value);
        return value;
    }

    private String enqueue(String key) {
        return service.enqueue(7L, RECIPIENT, SUBJECT, HTML, key);
    }

    private AccountEmailOutbox store(AccountEmailOutbox row) {
        rows.put(row.getId(), row);
        return row;
    }

    private void assertUnavailable(AccountEmailService value) {
        assertFalse(value.isReady());
        IllegalStateException error = assertThrows(IllegalStateException.class, value::requireReady);
        assertEquals("ACCOUNT_EMAIL_NOT_READY", error.getMessage());
        assertNull(error.getCause());
        assertThrows(IllegalStateException.class, () -> value.enqueue(7L, RECIPIENT, SUBJECT, HTML, KEY));
        value.processDueMessages();
        verifyNoInteractions(outbox, sender);
        verify(crypto, never()).encrypt(anyString(), anyString());
        assertEquals(0, transactions.started);
    }

    private void assertSafeFailure(Runnable operation) {
        IllegalStateException error = assertThrows(IllegalStateException.class, operation::run);
        assertEquals("ACCOUNT_EMAIL_ENQUEUE_FAILED", error.getMessage());
        assertNull(error.getCause());
    }

    private static final class MutableClock extends Clock {
        private volatile Instant now = Instant.parse("2026-11-04T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
        void advanceSeconds(long seconds) { now = now.plusSeconds(seconds); }
    }

    private static final class FakeTransactions implements PlatformTransactionManager {
        private volatile boolean active;
        private int started;
        private int committed;
        private boolean failNextCommit;

        @Override
        public TransactionStatus getTransaction(TransactionDefinition definition) {
            assertFalse(active);
            assertNotNull(definition);
            assertEquals(TransactionDefinition.PROPAGATION_REQUIRES_NEW, definition.getPropagationBehavior());
            assertEquals(5, definition.getTimeout());
            active = true;
            started++;
            return new SimpleTransactionStatus();
        }

        @Override
        public void commit(TransactionStatus status) {
            assertTrue(active);
            active = false;
            if (failNextCommit) {
                failNextCommit = false;
                throw new IllegalStateException("Synthetic commit failure");
            }
            committed++;
        }

        @Override
        public void rollback(TransactionStatus status) {
            active = false;
        }
    }
}
