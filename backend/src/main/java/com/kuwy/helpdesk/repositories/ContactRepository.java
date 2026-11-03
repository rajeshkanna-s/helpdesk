package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.Contact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ContactRepository extends JpaRepository<Contact, Long> {
    Optional<Contact> findByCompanyIdAndEmail(Long companyId, String email);
}
