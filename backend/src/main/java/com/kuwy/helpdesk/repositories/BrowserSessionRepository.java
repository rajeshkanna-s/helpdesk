package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.BrowserSession;
import com.kuwy.helpdesk.models.Contact;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BrowserSessionRepository extends JpaRepository<BrowserSession, UUID> {
    String ACTIVE = "select s from BrowserSession s where s.subjectId = :subjectId and s.kind = :kind "
            + "and s.revokedAt is null and s.absoluteExpiresAt > :now and s.idleExpiresAt > :now "
            + "order by s.createdAt asc, s.id asc";

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from BrowserSession s where s.id = :id")
    Optional<BrowserSession> findForUpdate(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Contact c where c.id = :id")
    Optional<Contact> lockContact(@Param("id") Long id);

    @Query(ACTIVE)
    List<BrowserSession> findActive(@Param("subjectId") Long subjectId, @Param("kind") String kind,
                                    @Param("now") Instant now, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(ACTIVE)
    List<BrowserSession> findActiveForUpdate(@Param("subjectId") Long subjectId, @Param("kind") String kind,
                                             @Param("now") Instant now, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from BrowserSession s where s.subjectId = :subjectId and s.kind = :kind "
            + "and s.revokedAt is null order by s.createdAt asc, s.id asc")
    List<BrowserSession> findUnrevokedForUpdate(@Param("subjectId") Long subjectId,
                                                @Param("kind") String kind, Pageable pageable);
}
