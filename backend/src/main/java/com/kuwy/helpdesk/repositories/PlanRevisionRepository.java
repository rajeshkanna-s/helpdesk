package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.PlanRevision;
import org.springframework.data.repository.Repository;
import java.util.Optional;

public interface PlanRevisionRepository extends Repository<PlanRevision, Long> {
    boolean existsByCodeAndRevision(String code, long revision);
    Optional<PlanRevision> findByCodeAndRevision(String code, long revision);
    PlanRevision save(PlanRevision revision);
}
