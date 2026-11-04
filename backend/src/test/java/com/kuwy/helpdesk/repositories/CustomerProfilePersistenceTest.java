package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.controllers.PortalProfileController;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Contact;
import com.kuwy.helpdesk.models.CustomerAccount;
import com.kuwy.helpdesk.services.SecurityAuditService;
import com.kuwy.helpdesk.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.ContextConfiguration;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(showSql = false, properties = {
        "spring.datasource.url=jdbc:h2:mem:customer-profile;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never",
        "logging.level.org.hibernate.SQL=OFF", "logging.level.org.hibernate.orm.jdbc.bind=OFF"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ContextConfiguration(classes = CustomerProfilePersistenceTest.JpaConfiguration.class)
class CustomerProfilePersistenceTest {
    @Configuration(proxyBeanMethods = false)
    @EntityScan(basePackageClasses = Contact.class)
    @EnableJpaRepositories(basePackageClasses = ContactRepository.class)
    @Import({PortalProfileController.class, SecurityAuditService.class})
    static class JpaConfiguration {}

    @Autowired private TestEntityManager em;
    @Autowired private PortalProfileController profiles;
    @Autowired private SecurityAuditLogRepository audits;

    @AfterEach void clear() { TenantContext.clear(); }

    @Test void profileChoicesSurviveReloadWithoutMovingTheContactOrInvalidatingItsSession() {
        Company company = company("acme"), foreign = company("other");
        CustomerAccount account = new CustomerAccount(); account.setCompany(company); account.setAccountName("Existing association");
        em.persistAndFlush(account);
        Contact contact = contact(company); contact.setAccount(account); contact.setAuthVersion(7L);
        em.persistAndFlush(contact);
        Contact other = em.persistAndFlush(contact(foreign));
        Long id = contact.getId(), accountId = account.getId(), companyId = company.getId(), otherId = other.getId();
        TenantContext.setContext(companyId, id, "CUSTOMER", contact.getEmail());
        TenantContext.setBrowserSessionId("synthetic-session");
        em.clear();

        var initial = profiles.get("acme").getBody();
        assertNotNull(initial); assertEquals("UTC", initial.timeZone()); assertEquals("en", initial.language());
        assertEquals(new PortalProfileController.Notifications(true, true, true), initial.notifications());
        assertEquals(0, audits.count());
        var request = new MockHttpServletRequest(); request.setRemoteAddr("192.0.2.15"); request.addHeader("User-Agent", "Profile persistence test");
        var saved = profiles.patch("acme", Map.of("firstName", " <b>Grace</b> ", "lastName", "Hopper", "phone", "+1 555 0100",
                "organizationName", "Unrelated label", "timeZone", "Asia/Kolkata", "language", "en",
                "notifications", Map.of("replies", false, "resolved", false, "surveys", false)), request).getBody();
        em.flush(); em.clear();

        Contact reloaded = em.find(Contact.class, id);
        assertEquals("Grace", reloaded.getFirstName()); assertEquals("Hopper", reloaded.getLastName());
        assertEquals("+1 555 0100", reloaded.getPhone()); assertEquals("Unrelated label", reloaded.getOrganizationName());
        assertEquals("Asia/Kolkata", reloaded.getTimeZone()); assertEquals("en", reloaded.getLanguage());
        assertFalse(reloaded.getNotifyReplies()); assertFalse(reloaded.getNotifyResolved()); assertFalse(reloaded.getNotifySurveys());
        assertEquals(accountId, reloaded.getAccount().getId()); assertEquals(companyId, reloaded.getCompany().getId());
        assertEquals("person@example.invalid", reloaded.getEmail()); assertEquals(7L, reloaded.getAuthVersion());
        assertTrue(reloaded.getIsPortalUser()); assertFalse(reloaded.getIsBlocked());
        assertEquals("Ada", em.find(Contact.class, otherId).getFirstName());
        assertEquals(id, TenantContext.requireCustomerId(companyId)); assertEquals(saved, profiles.get("acme").getBody());
        var events = audits.findTop50ByCompanyIdOrderByCreatedAtDesc(companyId);
        assertEquals(1, events.size()); var event = events.getFirst();
        assertEquals("CUSTOMER_PROFILE_UPDATED", event.getAction()); assertNull(event.getUserId()); assertNull(event.getEmail());
        assertEquals("contact:" + id, event.getDetails()); assertEquals("192.0.2.15", event.getIpAddress());
        assertEquals("Profile persistence test", event.getUserAgent());
    }

    private Company company(String slug) {
        Company company = new Company(); company.setSubdomain(slug); company.setCompanyCode(slug.toUpperCase(java.util.Locale.ROOT));
        company.setName("Synthetic " + slug); return em.persistAndFlush(company);
    }

    private Contact contact(Company company) {
        Contact contact = new Contact(); contact.setCompany(company); contact.setFirstName("Ada");
        contact.setEmail("person@example.invalid"); contact.setIsPortalUser(true); return contact;
    }
}
