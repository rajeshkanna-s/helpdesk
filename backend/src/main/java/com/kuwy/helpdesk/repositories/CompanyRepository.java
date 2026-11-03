package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.Company;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CompanyRepository extends JpaRepository<Company, Long> {
    Optional<Company> findBySubdomain(String subdomain);
    Optional<Company> findByCompanyCode(String companyCode);
}
