package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.models.AccountEmailOutbox;
import com.kuwy.helpdesk.repositories.AccountEmailOutboxRepository;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.LockModeType;
import jakarta.persistence.Table;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

class AccountEmailOutboxContractTest {
    @Test
    void mappingHasOnlyMetadataAndEncryptedContentWithUniqueBoundedKeys() {
        Map<String, Field> fields = Arrays.stream(AccountEmailOutbox.class.getDeclaredFields())
                .filter(field -> !Modifier.isStatic(field.getModifiers()) && !field.isSynthetic())
                .collect(Collectors.toMap(Field::getName, field -> field));
        assertEquals(Set.of("id", "companyId", "idempotencyKey", "encryptedPayload", "createdAt",
                "nextAttemptAt", "attemptCount", "status", "lastErrorCode"), fields.keySet());
        Table table = AccountEmailOutbox.class.getAnnotation(Table.class);
        assertEquals("account_email_outbox", table.name());
        assertEquals("status,next_attempt_at", table.indexes()[0].columnList());
        assertEquals(36, fields.get("id").getAnnotation(Column.class).length());
        assertTrue(fields.get("companyId").getAnnotation(Column.class).nullable());
        Column key = fields.get("idempotencyKey").getAnnotation(Column.class);
        assertEquals("idempotency_key", key.name());
        assertTrue(key.unique());
        assertFalse(key.nullable());
        assertFalse(key.updatable());
        assertEquals(128, key.length());
        assertEquals("TEXT", fields.get("encryptedPayload").getAnnotation(Column.class).columnDefinition());
        assertFalse(fields.get("encryptedPayload").getAnnotation(Column.class).updatable());
        assertEquals(Instant.class, fields.get("createdAt").getType());
        assertEquals(Instant.class, fields.get("nextAttemptAt").getType());
        assertEquals(EnumType.STRING, fields.get("status").getAnnotation(Enumerated.class).value());
        assertEquals(EnumType.STRING, fields.get("lastErrorCode").getAnnotation(Enumerated.class).value());
        assertEquals("VARCHAR(16)", fields.get("status").getAnnotation(Column.class).columnDefinition());
        assertEquals("VARCHAR(32)", fields.get("lastErrorCode").getAnnotation(Column.class).columnDefinition());
        assertArrayEquals(new AccountEmailOutbox.ErrorCode[]{AccountEmailOutbox.ErrorCode.DELIVERY_FAILED},
                AccountEmailOutbox.ErrorCode.values());
    }

    @Test
    void normalEntitySerializationCannotExposeEvenTheEncryptedPayload() throws Exception {
        AccountEmailOutbox row = new AccountEmailOutbox();
        row.setId("synthetic-id");
        row.setEncryptedPayload("synthetic-ciphertext");
        String json = new ObjectMapper().writeValueAsString(row);
        assertFalse(json.contains("encryptedPayload"));
        assertFalse(json.contains("synthetic-ciphertext"));
        assertFalse(json.contains("recipient"));
        assertFalse(json.contains("subject"));
        assertFalse(json.contains("html"));
        assertFalse(row.toString().contains("synthetic-ciphertext"));
    }

    @Test
    void bothWorkerQueriesRequireWriteLocksAndBoundedLockAndQueryTimeouts() throws Exception {
        var due = AccountEmailOutboxRepository.class.getMethod("findDueForUpdate", Collection.class,
                Instant.class, Pageable.class);
        var complete = AccountEmailOutboxRepository.class.getMethod("findByIdForUpdate", String.class);
        for (var method : Set.of(due, complete)) {
            assertEquals(LockModeType.PESSIMISTIC_WRITE, method.getAnnotation(Lock.class).value());
            var hints = Arrays.stream(method.getAnnotation(QueryHints.class).value())
                    .collect(Collectors.toMap(hint -> hint.name(), hint -> hint.value()));
            assertEquals("2000", hints.get("jakarta.persistence.lock.timeout"));
            assertEquals("5000", hints.get("jakarta.persistence.query.timeout"));
        }
        String query = due.getAnnotation(Query.class).value();
        assertTrue(query.contains("e.status in :statuses"));
        assertTrue(query.contains("e.nextAttemptAt <= :now"));
        assertTrue(query.contains("order by e.nextAttemptAt, e.createdAt, e.id"));
    }

    @Test
    void publicEntrypointsPreserveTransactionalAndDisabledByDefaultContracts() throws Exception {
        var enqueue = AccountEmailService.class.getMethod("enqueue", Long.class,
                String.class, String.class, String.class, String.class);
        assertEquals(String.class, enqueue.getReturnType());
        assertEquals(Propagation.REQUIRED, enqueue.getAnnotation(Transactional.class).propagation());
        var worker = AccountEmailService.class.getMethod("processDueMessages");
        assertEquals(Propagation.NOT_SUPPORTED, worker.getAnnotation(Transactional.class).propagation());
        assertEquals(15_000, worker.getAnnotation(Scheduled.class).fixedDelay());
        assertEquals(boolean.class, AccountEmailService.class.getMethod("isReady").getReturnType());
        assertEquals(void.class, AccountEmailService.class.getMethod("requireReady").getReturnType());
        var constructor = AccountEmailService.class.getConstructors()[0];
        assertEquals("${kuwy.mail.delivery-enabled:false}", constructor.getParameters()[4]
                .getAnnotation(Value.class).value());
        assertEquals("${kuwy.mail.from:}", constructor.getParameters()[5].getAnnotation(Value.class).value());
    }
}
