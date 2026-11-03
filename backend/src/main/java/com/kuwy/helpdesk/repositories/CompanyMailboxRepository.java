package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.CompanyMailbox;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CompanyMailboxRepository extends JpaRepository<CompanyMailbox, Long> {
    List<CompanyMailbox> findByCompanyId(Long companyId);
    Optional<CompanyMailbox> findByEmailAddress(String emailAddress);
    Optional<CompanyMailbox> findByGraphSubscriptionId(String graphSubscriptionId);
}
