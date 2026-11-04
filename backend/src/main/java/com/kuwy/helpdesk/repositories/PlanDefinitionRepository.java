package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.PlanDefinition;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PlanDefinitionRepository extends JpaRepository<PlanDefinition, String> {
    List<PlanDefinition> findByStatusOrderByMonthlyPriceAscCodeAsc(PlanDefinition.Status status);
    List<PlanDefinition> findAllByOrderByCodeAsc();
}
