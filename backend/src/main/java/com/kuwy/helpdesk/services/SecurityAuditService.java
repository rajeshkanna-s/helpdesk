package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.SecurityAuditLog;
import com.kuwy.helpdesk.repositories.SecurityAuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class SecurityAuditService {

    private final SecurityAuditLogRepository auditLogRepository;

    @Transactional
    public void recordEvent(Long companyId, Long userId, String action, String email, String details, HttpServletRequest request) {
        try {
            SecurityAuditLog logEntry = new SecurityAuditLog();
            logEntry.setCompanyId(companyId);
            logEntry.setUserId(userId);
            logEntry.setAction(action);
            logEntry.setEmail(email);
            logEntry.setDetails(details);

            if (request != null) {
                String ip = request.getHeader("X-Forwarded-For");
                if (ip == null || ip.isBlank()) {
                    ip = request.getRemoteAddr();
                } else if (ip.contains(",")) {
                    ip = ip.split(",")[0].trim();
                }
                logEntry.setIpAddress(ip);
                String ua = request.getHeader("User-Agent");
                logEntry.setUserAgent(ua != null && ua.length() > 300 ? ua.substring(0, 300) : ua);
            }

            auditLogRepository.save(logEntry);
            log.info("Security Audit [{}] for email: {}, companyId: {}", action, email, companyId);
        } catch (Exception e) {
            log.error("Failed to write security audit log: {}", e.getMessage());
        }
    }
}

