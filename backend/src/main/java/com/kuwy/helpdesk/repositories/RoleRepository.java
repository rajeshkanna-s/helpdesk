package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RoleRepository extends JpaRepository<Role, Long> {
    Optional<Role> findFirstByRoleType(Role.RoleType roleType);
    Optional<Role> findByCompanyIdAndRoleType(Long companyId, Role.RoleType roleType);
    List<Role> findByCompanyIdOrIsSystemRoleTrue(Long companyId);
}
