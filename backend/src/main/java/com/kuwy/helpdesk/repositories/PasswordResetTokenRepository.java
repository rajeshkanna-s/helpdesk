package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    Optional<PasswordResetToken> findByTokenHashAndIsUsedFalseAndExpiresAtAfter(String tokenHash, LocalDateTime now);
    Optional<PasswordResetToken> findByTokenHash(String tokenHash);
    List<PasswordResetToken> findByUserIdAndIsUsedFalse(Long userId);
}

