package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.CannedResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CannedResponseRepository extends JpaRepository<CannedResponse, Long> {

    @Query("SELECT c FROM CannedResponse c WHERE c.company.id = :companyId ORDER BY c.title ASC")
    List<CannedResponse> findByCompanyIdOrderByTitleAsc(@Param("companyId") Long companyId);

    @Query("SELECT c FROM CannedResponse c WHERE c.company.id = :companyId AND c.department IS NULL ORDER BY c.title ASC")
    List<CannedResponse> findByCompanyIdAndDepartmentIdIsNullOrderByTitleAsc(@Param("companyId") Long companyId);
}
