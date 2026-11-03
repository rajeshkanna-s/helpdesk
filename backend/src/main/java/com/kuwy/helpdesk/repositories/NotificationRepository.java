package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByCompanyIdOrderByCreatedAtDesc(Long companyId);
    List<Notification> findByCompanyIdAndUserIdOrderByCreatedAtDesc(Long companyId, Long userId);
    long countByCompanyIdAndIsReadFalse(Long companyId);
}

