package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.CustomerAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CustomerAccountRepository extends JpaRepository<CustomerAccount, Long> {
    List<CustomerAccount> findByCompanyIdOrderByIdDesc(Long companyId);
}
