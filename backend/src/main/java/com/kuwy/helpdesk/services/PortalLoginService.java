package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Contact;
import com.kuwy.helpdesk.repositories.ContactRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Called only after the controller has verified the email one-time code. */
@Service
@RequiredArgsConstructor
public class PortalLoginService {
    private final ContactRepository contacts;
    private final EntityManager entityManager;
    private final BrowserSessionService sessions;

    @Transactional
    public BrowserSessionService.Tokens openVerifiedSession(Company verifiedCompany, String verifiedEmail, HttpServletRequest request) {
        if (verifiedCompany == null || verifiedCompany.getId() == null) throw new BadCredentialsException("Customer workspace is unavailable.");
        Company company = entityManager.find(Company.class, verifiedCompany.getId(), LockModeType.PESSIMISTIC_WRITE);
        if (company == null || company.getStatus() != Company.CompanyStatus.ACTIVE && company.getStatus() != Company.CompanyStatus.TRIAL) {
            throw new BadCredentialsException("Customer workspace is unavailable.");
        }
        String email = CustomerOtpService.canonicalEmail(verifiedEmail);
        Contact contact = contacts.findByCompanyIdAndEmail(company.getId(), email).orElse(null);
        if (contact != null && (Boolean.TRUE.equals(contact.getIsBlocked()) || contact.getCompany() == null
                || !company.getId().equals(contact.getCompany().getId()))) {
            throw new BadCredentialsException("Customer sign-in is unavailable for this account.");
        }
        if (contact == null) {
            contact = new Contact();
            contact.setCompany(company);
            contact.setEmail(email);
            contact.setFirstName(email.substring(0, email.indexOf('@')).substring(0, Math.min(100, email.indexOf('@'))));
        }
        contact.setIsPortalUser(true);
        contacts.saveAndFlush(contact);
        return sessions.openCustomer(contact, request);
    }
}
