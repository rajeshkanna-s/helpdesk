package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.models.AccountEmailOutbox;
import com.kuwy.helpdesk.repositories.AccountEmailOutboxRepository;
import jakarta.annotation.PreDestroy;
import jakarta.mail.internet.InternetAddress;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static com.kuwy.helpdesk.models.AccountEmailOutbox.DeliveryStatus.*;
import static com.kuwy.helpdesk.models.AccountEmailOutbox.ErrorCode.DELIVERY_FAILED;

@Service
public class AccountEmailService {
    private static final int BATCH_SIZE = 10;
    private static final int MAX_ATTEMPTS = 5;
    private static final int MAX_PAYLOAD_BYTES = 32_768;
    private static final String PURPOSE = "account-email:";
    private final AccountEmailOutboxRepository outbox;
    private final SecretCryptoService crypto;
    private final ObjectProvider<JavaMailSender> senders;
    private final TransactionTemplate transactions;
    private final boolean deliveryEnabled;
    private final String from;
    private final Clock clock;
    private final long sendTimeoutMillis;
    private final ObjectMapper json = new ObjectMapper();
    private final AtomicBoolean working = new AtomicBoolean();
    private final AtomicBoolean delivering = new AtomicBoolean();
    private final ThreadPoolExecutor deliveryExecutor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(1), task -> {
                Thread thread = new Thread(task, "account-email-delivery");
                thread.setDaemon(true);
                return thread;
            });

    @Autowired
    public AccountEmailService(AccountEmailOutboxRepository outbox, SecretCryptoService crypto,
            ObjectProvider<JavaMailSender> senders, PlatformTransactionManager transactionManager,
            @Value("${kuwy.mail.delivery-enabled:false}") boolean deliveryEnabled,
            @Value("${kuwy.mail.from:}") String from) {
        this(outbox, crypto, senders, transactionManager, deliveryEnabled, from, Clock.systemUTC(), 10_000);
    }

    AccountEmailService(AccountEmailOutboxRepository outbox, SecretCryptoService crypto,
            ObjectProvider<JavaMailSender> senders, PlatformTransactionManager transactionManager,
            boolean deliveryEnabled, String from, Clock clock, long sendTimeoutMillis) {
        this.outbox = outbox;
        this.crypto = crypto;
        this.senders = senders;
        this.deliveryEnabled = deliveryEnabled;
        this.from = from;
        this.clock = clock;
        this.sendTimeoutMillis = sendTimeoutMillis;
        transactions = new TransactionTemplate(transactionManager);
        transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transactions.setTimeout(5);
    }

    public boolean isReady() {
        return readySender() != null;
    }

    public void requireReady() {
        if (!isReady()) {
            throw new IllegalStateException("ACCOUNT_EMAIL_NOT_READY");
        }
    }

    @Transactional
    public String enqueue(Long companyId, String recipient, String subject, String html, String idempotencyKey) {
        requireReady();
        if ((companyId != null && companyId <= 0) || idempotencyKey == null
                || !idempotencyKey.matches("[A-Za-z0-9][A-Za-z0-9:._-]{0,127}")) {
            throw new IllegalArgumentException("INVALID_ACCOUNT_EMAIL");
        }
        Payload payload = new Payload(recipient, subject, html);
        validate(payload);
        try {
            var existing = outbox.findByIdempotencyKey(idempotencyKey);
            if (existing.isPresent()) {
                if (!Objects.equals(companyId, existing.get().getCompanyId())) {
                    throw new IllegalStateException("ACCOUNT_EMAIL_ENQUEUE_FAILED");
                }
                return existing.get().getId();
            }
            String plaintext = json.writeValueAsString(payload);
            checkPayloadSize(plaintext);
            String id = UUID.randomUUID().toString();
            String encrypted = crypto.encrypt(plaintext, PURPOSE + id);
            if (encrypted == null || encrypted.isBlank() || encrypted.length() > 60_000) {
                throw new IllegalStateException("ACCOUNT_EMAIL_ENQUEUE_FAILED");
            }
            AccountEmailOutbox row = new AccountEmailOutbox();
            row.setId(id);
            row.setCompanyId(companyId);
            row.setIdempotencyKey(idempotencyKey);
            row.setEncryptedPayload(encrypted);
            row.setCreatedAt(clock.instant());
            row.setNextAttemptAt(row.getCreatedAt());
            outbox.saveAndFlush(row);
            return id;
        } catch (Exception ignored) {
            // A unique-key race must retry the caller's transaction, not reuse a rollback-only transaction.
            throw new IllegalStateException("ACCOUNT_EMAIL_ENQUEUE_FAILED");
        }
    }

    @Scheduled(fixedDelay = 15_000)
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void processDueMessages() {
        if (!working.compareAndSet(false, true)) {
            return;
        }
        try {
            JavaMailSender sender = readySender();
            if (sender == null || deliveryExecutor.isShutdown() || delivering.get()) {
                return;
            }
            for (int i = 0; i < BATCH_SIZE && !Thread.currentThread().isInterrupted(); i++) {
                Claim claim = transactions.execute(transaction -> claimNext());
                if (claim == null) {
                    break;
                }
                if (!claim.deliver()) {
                    continue;
                }
                boolean sent = deliver(sender, claim);
                transactions.executeWithoutResult(transaction -> complete(claim, sent));
                if (!sent && delivering.get()) {
                    break;
                }
            }
        } catch (RuntimeException ignored) {
            // Leave an uncommitted completion to lease recovery; never expose callback exception content.
        } finally {
            working.set(false);
        }
    }

    private Claim claimNext() {
        Instant now = clock.instant();
        var due = outbox.findDueForUpdate(List.of(QUEUED, PROCESSING), now, PageRequest.of(0, 1));
        if (due.isEmpty()) {
            return null;
        }
        AccountEmailOutbox row = due.get(0);
        if (row.getAttemptCount() < 0 || row.getAttemptCount() >= MAX_ATTEMPTS) {
            row.setStatus(FAILED);
            row.setLastErrorCode(DELIVERY_FAILED);
        } else {
            row.setStatus(PROCESSING);
            row.setAttemptCount(row.getAttemptCount() + 1);
            // Only one row is leased before each network call; later batch entries cannot expire in a queue.
            row.setNextAttemptAt(now.plusSeconds(120));
        }
        outbox.save(row);
        return new Claim(row.getId(), row.getEncryptedPayload(), row.getAttemptCount(), row.getStatus() == PROCESSING);
    }

    private boolean deliver(JavaMailSender sender, Claim claim) {
        Future<?> task = null;
        try {
            task = deliveryExecutor.submit(() -> {
                delivering.set(true);
                try {
                    String plaintext = crypto.decrypt(claim.encryptedPayload(), PURPOSE + claim.id());
                    checkPayloadSize(plaintext);
                    Payload payload = json.readValue(plaintext, Payload.class);
                    validate(payload);
                    MimeMessageHelper message = new MimeMessageHelper(sender.createMimeMessage(), false, "UTF-8");
                    message.setFrom(from);
                    message.setTo(payload.recipient());
                    message.setSubject(payload.subject());
                    message.setText(payload.html(), true);
                    if (Thread.currentThread().isInterrupted() || deliveryExecutor.isShutdown()) {
                        throw new IllegalStateException(DELIVERY_FAILED.name());
                    }
                    sender.send(message.getMimeMessage());
                } catch (Exception ignored) {
                    throw new IllegalStateException(DELIVERY_FAILED.name());
                } finally {
                    delivering.set(false);
                }
            });
            task.get(sendTimeoutMillis, TimeUnit.MILLISECONDS);
            return true;
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
            return false;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (task != null && !task.isDone()) {
                task.cancel(true);
            }
        }
    }

    private void complete(Claim claim, boolean sent) {
        outbox.findByIdForUpdate(claim.id()).ifPresent(row -> {
            // The attempt number fences completion from a worker whose expired lease was reclaimed.
            if (row.getStatus() != PROCESSING || row.getAttemptCount() != claim.attempt()) {
                return;
            }
            row.setStatus(sent ? SENT : row.getAttemptCount() >= MAX_ATTEMPTS ? FAILED : QUEUED);
            row.setLastErrorCode(sent ? null : DELIVERY_FAILED);
            row.setNextAttemptAt(sent || row.getStatus() == FAILED ? clock.instant()
                    : clock.instant().plusSeconds(30L << (row.getAttemptCount() - 1)));
            outbox.save(row);
        });
    }

    private JavaMailSender readySender() {
        try {
            return deliveryEnabled && validAddress(from) && crypto.isConfigured() ? senders.getIfAvailable() : null;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static boolean validAddress(String address) {
        if (address == null || address.length() > 254 || address.indexOf('@') <= 0
                || address.chars().anyMatch(Character::isISOControl)) {
            return false;
        }
        try {
            InternetAddress parsed = new InternetAddress(address, true);
            parsed.validate();
            return !parsed.isGroup() && parsed.getPersonal() == null && address.equals(parsed.getAddress());
        } catch (Exception ignored) {
            return false;
        }
    }

    private static void validate(Payload payload) {
        if (payload == null || !validAddress(payload.recipient()) || payload.subject() == null
                || payload.subject().isBlank() || payload.subject().length() > 200
                || payload.subject().chars().anyMatch(Character::isISOControl) || payload.html() == null
                || payload.html().isBlank() || payload.html().length() > 16_384) {
            throw new IllegalArgumentException("INVALID_ACCOUNT_EMAIL");
        }
    }

    private static void checkPayloadSize(String plaintext) {
        if (plaintext == null || plaintext.length() > MAX_PAYLOAD_BYTES
                || plaintext.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) {
            throw new IllegalArgumentException("INVALID_ACCOUNT_EMAIL");
        }
    }

    @PreDestroy
    void stopWorker() {
        deliveryExecutor.shutdownNow();
    }

    private record Payload(String recipient, String subject, String html) { }
    private record Claim(String id, String encryptedPayload, int attempt, boolean deliver) { }
}
