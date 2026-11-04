package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.AccountEmailOutbox;
import com.kuwy.helpdesk.models.AccountEmailOutbox.DeliveryStatus;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface AccountEmailOutboxRepository extends JpaRepository<AccountEmailOutbox, String> {
    Optional<AccountEmailOutbox> findByIdempotencyKey(String idempotencyKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints({@QueryHint(name = "jakarta.persistence.lock.timeout", value = "2000"),
            @QueryHint(name = "jakarta.persistence.query.timeout", value = "5000")})
    @Query("select e from AccountEmailOutbox e where e.status in :statuses and e.nextAttemptAt <= :now "
            + "order by e.nextAttemptAt, e.createdAt, e.id")
    List<AccountEmailOutbox> findDueForUpdate(@Param("statuses") Collection<DeliveryStatus> statuses,
            @Param("now") Instant now, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints({@QueryHint(name = "jakarta.persistence.lock.timeout", value = "2000"),
            @QueryHint(name = "jakarta.persistence.query.timeout", value = "5000")})
    @Query("select e from AccountEmailOutbox e where e.id = :id")
    Optional<AccountEmailOutbox> findByIdForUpdate(@Param("id") String id);
}
