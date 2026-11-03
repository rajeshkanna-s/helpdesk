package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.AutomationRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AutomationRuleRepository extends JpaRepository<AutomationRule, Long> {

    @Query("SELECT a FROM AutomationRule a WHERE a.company.id = :companyId AND a.isActive = true ORDER BY a.priorityOrder ASC")
    List<AutomationRule> findByCompanyIdAndIsActiveTrueOrderByPriorityOrderAsc(@Param("companyId") Long companyId);

    @Query("SELECT a FROM AutomationRule a WHERE a.company.id = :companyId ORDER BY a.priorityOrder ASC")
    List<AutomationRule> findByCompanyIdOrderByPriorityOrderAsc(@Param("companyId") Long companyId);
}
