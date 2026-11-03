package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByCompanyIdAndEmail(Long companyId, String email);
    Optional<User> findByEmail(String email);
    List<User> findByCompanyIdAndIsActiveTrue(Long companyId);
    List<User> findByCompanyId(Long companyId);
    long countByCompanyId(Long companyId);
}
