package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.SecurityAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SecurityAuditLogRepository extends JpaRepository<SecurityAuditLog, Long> {
    List<SecurityAuditLog> findTop50ByCompanyIdOrderByCreatedAtDesc(Long companyId);
    List<SecurityAuditLog> findTop50ByUserIdOrderByCreatedAtDesc(Long userId);
}

