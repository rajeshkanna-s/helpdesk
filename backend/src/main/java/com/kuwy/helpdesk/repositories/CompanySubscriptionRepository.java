package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.CompanySubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CompanySubscriptionRepository extends JpaRepository<CompanySubscription, Long> {

    @Query("SELECT s FROM CompanySubscription s WHERE s.company.id = :companyId")
    Optional<CompanySubscription> findByCompanyId(@Param("companyId") Long companyId);
}
