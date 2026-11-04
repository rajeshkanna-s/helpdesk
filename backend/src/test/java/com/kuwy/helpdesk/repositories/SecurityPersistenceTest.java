package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.AccountEmailOutbox;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.ContextConfiguration;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(showSql = false, properties = {
        "spring.datasource.url=jdbc:h2:mem:security-persistence;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        "logging.level.org.hibernate.SQL=OFF",
        "logging.level.org.hibernate.orm.jdbc.bind=OFF"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ContextConfiguration(classes = SecurityPersistenceTest.JpaConfiguration.class)
class SecurityPersistenceTest {
    @Configuration(proxyBeanMethods = false)
    @EntityScan(basePackageClasses = User.class)
    @EnableJpaRepositories(basePackageClasses = UserRepository.class)
    static class JpaConfiguration {}

    @Autowired private TestEntityManager entityManager;
    @Autowired private UserRepository users;
    @Autowired private AccountEmailOutboxRepository outbox;
    @Autowired private BrowserSessionRepository browserSessions;
    @Autowired private ContactRepository contacts;
    @Autowired private CompanyRepository companies;

    @Test
    void securityEpochAndOptimisticVersionPersistIndependently() {
        User user = user(company("first"), "person@example.invalid");
        entityManager.persistAndFlush(user);
        Long initialRowVersion = user.getRowVersion();
        assertEquals(0L, user.getAuthVersion());
        user.invalidateAuthentication();
        entityManager.flush();
        Long id = user.getId();
        entityManager.clear();

        User reloaded = users.findById(id).orElseThrow();
        assertEquals(1L, reloaded.getAuthVersion());
        assertTrue(reloaded.getRowVersion() > initialRowVersion);
    }

    @Test
    void authenticationRepositoryQueriesKeepDuplicateEmailsTenantScoped() {
        Company first = company("first");
        Company second = company("second");
        User firstUser = entityManager.persistAndFlush(user(first, "shared@example.invalid"));
        User secondUser = entityManager.persistAndFlush(user(second, "shared@example.invalid"));
        entityManager.clear();

        assertEquals(firstUser.getId(), users.findForAuthenticationByCompanyAndEmail(first.getId(), "shared@example.invalid").orElseThrow().getId());
        assertEquals(secondUser.getId(), users.findForAuthenticationByCompanyAndEmail(second.getId(), "shared@example.invalid").orElseThrow().getId());
        assertEquals(2, users.findForAuthenticationByEmail("shared@example.invalid").size());
        assertTrue(users.findForAuthenticationByCompanyAndEmail(first.getId(), "missing@example.invalid").isEmpty());
        assertEquals(firstUser.getId(), users.findForAuthenticationById(firstUser.getId()).orElseThrow().getId());
    }

    @Test
    void outboxClaimsAreQueryableAndIdempotencyIsDatabaseEnforced() {
        AccountEmailOutbox first = message("request-one");
        outbox.saveAndFlush(first);
        var due = outbox.findDueForUpdate(List.of(AccountEmailOutbox.DeliveryStatus.QUEUED), Instant.now(), PageRequest.of(0, 1));
        assertEquals(1, due.size());
        assertEquals(first.getId(), due.getFirst().getId());
        assertEquals(first.getId(), outbox.findByIdForUpdate(first.getId()).orElseThrow().getId());
        assertThrows(DataIntegrityViolationException.class, () -> outbox.saveAndFlush(message("request-one")));
    }

    @Test
    void browserSessionRotationAndRevocationPersistInTheDatabase() {
        User user = entityManager.persistAndFlush(user(company("session-workspace"), "session@example.invalid"));
        com.kuwy.helpdesk.config.JwtTokenProvider tokens = new com.kuwy.helpdesk.config.JwtTokenProvider();
        org.springframework.test.util.ReflectionTestUtils.setField(tokens, "jwtSecret", java.util.Base64.getEncoder().encodeToString(new byte[32]));
        org.springframework.test.util.ReflectionTestUtils.setField(tokens, "jwtExpirationMs", 60_000L);
        com.kuwy.helpdesk.services.SecretCryptoService crypto = new com.kuwy.helpdesk.services.SecretCryptoService(java.util.Base64.getEncoder().encodeToString(new byte[32]));
        var service = new com.kuwy.helpdesk.services.BrowserSessionService(browserSessions, users, contacts, companies, tokens, crypto);
        var first = service.openStaff(tokens.generateToken(user), false, new org.springframework.mock.web.MockHttpServletRequest());
        entityManager.flush(); entityManager.clear();
        assertEquals(user.getId(), service.authenticate(first.accessToken(), "STAFF", first.csrfToken(), true).subjectId());
        var second = service.refresh(first.refreshToken(), "STAFF", first.csrfToken());
        entityManager.flush(); entityManager.clear();
        assertNotEquals(first.refreshToken(), second.refreshToken());
        assertEquals(1, service.listActive(user.getId(), "STAFF", second.sessionId()).size());
        var row = browserSessions.findById(java.util.UUID.fromString(second.sessionId())).orElseThrow();
        assertFalse(row.getRefreshHash().contains(second.refreshToken()));
        assertFalse(row.getEncryptedCsrf().contains(second.csrfToken()));
        service.revokeAll(user.getId(), "STAFF");
        entityManager.flush(); entityManager.clear();
        assertTrue(service.listActive(user.getId(), "STAFF", second.sessionId()).isEmpty());
        assertThrows(org.springframework.security.core.AuthenticationException.class,
                () -> service.authenticate(second.accessToken(), "STAFF", null, false));
        assertEquals(1L, users.findById(user.getId()).orElseThrow().getAuthVersion());
    }

    private Company company(String slug) {
        Company company = new Company();
        company.setCompanyCode(slug.toUpperCase(java.util.Locale.ROOT));
        company.setName("Synthetic " + slug);
        company.setSubdomain(slug);
        return entityManager.persistAndFlush(company);
    }

    private User user(Company company, String email) {
        Role role = new Role();
        role.setCompany(company);
        role.setName("Agent");
        role.setRoleType(Role.RoleType.AGENT);
        entityManager.persistAndFlush(role);
        User user = new User();
        user.setCompany(company);
        user.setRole(role);
        user.setEmail(email);
        user.setFirstName("Synthetic");
        user.setDisplayName("Synthetic Person");
        user.setPasswordHash("synthetic-hash-for-persistence-only");
        return user;
    }

    private AccountEmailOutbox message(String key) {
        AccountEmailOutbox message = new AccountEmailOutbox();
        message.setId(UUID.randomUUID().toString());
        message.setIdempotencyKey(key);
        message.setEncryptedPayload("enc:v1:synthetic-ciphertext-for-persistence-only");
        message.setCreatedAt(Instant.now().minusSeconds(2));
        message.setNextAttemptAt(Instant.now().minusSeconds(1));
        return message;
    }
}
