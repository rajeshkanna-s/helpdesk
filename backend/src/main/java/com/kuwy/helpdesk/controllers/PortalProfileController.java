package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Contact;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.services.CustomerOtpService;
import com.kuwy.helpdesk.services.SecurityAuditService;
import com.kuwy.helpdesk.tenant.TenantContext;
import com.kuwy.helpdesk.util.HtmlSanitizer;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/portal/{subdomain}/profile")
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PortalProfileController {
    private static final Set<String> FIELDS = Set.of("firstName", "lastName", "phone", "organizationName",
            "timeZone", "language", "notifications");
    private final CompanyRepository companies;
    private final EntityManager em;
    private final SecurityAuditService audit;

    @GetMapping
    public ResponseEntity<Profile> get(@PathVariable String subdomain) {
        return response(currentContact(subdomain, false));
    }

    @PatchMapping
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ResponseEntity<Profile> patch(@PathVariable String subdomain, @RequestBody Map<String, Object> body,
                                         HttpServletRequest request) {
        Contact contact = currentContact(subdomain, true);
        if (body == null || !FIELDS.containsAll(body.keySet())) throw invalid("Unsupported profile field");
        String first = body.containsKey("firstName") ? text(body.get("firstName"), "First name", 100, true) : contact.getFirstName();
        String last = body.containsKey("lastName") ? text(body.get("lastName"), "Last name", 100, false) : contact.getLastName();
        String phone = body.containsKey("phone") ? text(body.get("phone"), "Phone", 30, false) : contact.getPhone();
        String organization = body.containsKey("organizationName")
                ? text(body.get("organizationName"), "Organization", 150, false) : contact.getOrganizationName();
        String zone = contact.getTimeZone();
        if (body.containsKey("timeZone")) {
            zone = text(body.get("timeZone"), "Time zone", 64, true);
            try { zone = ZoneId.of(zone).getId(); }
            catch (DateTimeException invalidZone) { throw invalid("Choose a valid time zone, such as UTC or Asia/Kolkata"); }
        }
        String language = contact.getLanguage();
        if (body.containsKey("language")) {
            language = text(body.get("language"), "Language", 10, true);
            if (!"en".equals(language)) throw invalid("Only English (en) is currently supported");
        }
        Object preferences = body.containsKey("notifications") ? body.get("notifications") : Map.of();
        if (!(preferences instanceof Map<?, ?> notifications)
                || !Set.of("replies", "resolved", "surveys").containsAll(notifications.keySet())) {
            throw invalid("Unsupported notification preferences");
        }
        boolean replies = preference(notifications, "replies", contact.getNotifyReplies());
        boolean resolved = preference(notifications, "resolved", contact.getNotifyResolved());
        boolean surveys = preference(notifications, "surveys", contact.getNotifySurveys());
        // Validate everything before changing the managed row; identity and account association are never patched.
        contact.setFirstName(first);
        contact.setLastName(last);
        contact.setPhone(phone);
        contact.setOrganizationName(organization);
        contact.setTimeZone(zone);
        contact.setLanguage(language);
        contact.setNotifyReplies(replies);
        contact.setNotifyResolved(resolved);
        contact.setNotifySurveys(surveys);
        em.flush();
        // Audit actors reference staff users, not contacts. Keep the customer target separate and omit profile values.
        audit.recordEvent(contact.getCompany().getId(), null, "CUSTOMER_PROFILE_UPDATED", null,
                "contact:" + contact.getId(), request);
        return response(contact);
    }

    private Contact currentContact(String subdomain, boolean lock) {
        if (subdomain == null || !subdomain.matches("[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,98}[a-zA-Z0-9])?")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found");
        }
        Company company = companies.findBySubdomain(subdomain.toLowerCase(Locale.ROOT))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        if (company.getId() == null || company.getId() <= 0 || !subdomain.equalsIgnoreCase(company.getSubdomain())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found");
        }
        Long id;
        try { id = TenantContext.requireCustomerId(company.getId()); }
        catch (SecurityException denied) { throw unauthorized(); }
        if (TenantContext.getBrowserSessionId() == null || TenantContext.getBrowserSessionId().isBlank()) throw unauthorized();
        Contact contact = em.find(Contact.class, id);
        if (contact == null) throw unauthorized();
        // Refresh under the lock so a contact loaded during cookie authentication cannot hide a concurrent block/change.
        if (lock) em.refresh(contact, LockModeType.PESSIMISTIC_WRITE, Map.of("jakarta.persistence.lock.timeout", 2000));
        String email;
        try { email = CustomerOtpService.canonicalEmail(contact.getEmail()); }
        catch (IllegalArgumentException invalidEmail) { throw unauthorized(); }
        if (!Objects.equals(contact.getId(), id) || contact.getCompany() == null
                || !company.getId().equals(contact.getCompany().getId())
                || !Boolean.TRUE.equals(contact.getIsPortalUser()) || !Boolean.FALSE.equals(contact.getIsBlocked())
                || !email.equalsIgnoreCase(TenantContext.getUserEmail().trim())) throw unauthorized();
        return contact;
    }

    private static String text(Object raw, String field, int max, boolean required) {
        if (!(raw instanceof String value) || value.length() > max || value.codePoints().anyMatch(Character::isISOControl)) {
            throw invalid(field + " must be text of at most " + max + " characters without control characters");
        }
        String clean = HtmlSanitizer.cleanToPlainText(value).strip();
        if (clean.length() > max || clean.codePoints().anyMatch(Character::isISOControl) || required && clean.isBlank()) {
            throw invalid(field + " is invalid or empty");
        }
        return clean;
    }

    private static boolean preference(Map<?, ?> values, String key, Boolean current) {
        if (!values.containsKey(key)) return Boolean.TRUE.equals(current);
        if (!(values.get(key) instanceof Boolean value)) throw invalid("Notification choices must be true or false");
        return value;
    }

    private static ResponseEntity<Profile> response(Contact contact) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Profile(
                HtmlSanitizer.cleanToPlainText(contact.getFirstName()), HtmlSanitizer.cleanToPlainText(contact.getLastName()),
                contact.getEmail(), HtmlSanitizer.cleanToPlainText(contact.getPhone()),
                HtmlSanitizer.cleanToPlainText(contact.getOrganizationName()), contact.getTimeZone(), contact.getLanguage(),
                new Notifications(Boolean.TRUE.equals(contact.getNotifyReplies()), Boolean.TRUE.equals(contact.getNotifyResolved()),
                        Boolean.TRUE.equals(contact.getNotifySurveys()))));
    }

    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException unauthorized() { return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Verified customer sign-in required"); }
    public record Profile(String firstName, String lastName, String email, String phone, String organizationName,
                          String timeZone, String language, Notifications notifications) {}
    public record Notifications(boolean replies, boolean resolved, boolean surveys) {}
}
