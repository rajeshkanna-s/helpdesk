package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.Department;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DepartmentRepository extends JpaRepository<Department, Long> {
    List<Department> findByCompanyId(Long companyId);
    List<Department> findByCompanyIdAndIsActiveTrue(Long companyId);
}
