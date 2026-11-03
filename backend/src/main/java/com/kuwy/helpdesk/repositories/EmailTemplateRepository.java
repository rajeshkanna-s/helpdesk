package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.EmailTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EmailTemplateRepository extends JpaRepository<EmailTemplate, Long> {

    @Query("SELECT e FROM EmailTemplate e WHERE e.company.id = :companyId")
    List<EmailTemplate> findByCompanyId(@Param("companyId") Long companyId);

    @Query("SELECT e FROM EmailTemplate e WHERE e.company.id = :companyId AND e.templateType = :templateType")
    Optional<EmailTemplate> findByCompanyIdAndTemplateType(@Param("companyId") Long companyId, @Param("templateType") EmailTemplate.TemplateType templateType);
}
