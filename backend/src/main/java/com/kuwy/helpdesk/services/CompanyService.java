package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.DepartmentRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CompanyService {

    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<Company> getAllCompanies() {
        return companyRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Company getCompanyById(Long id) {
        return companyRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Company not found: " + id));
    }

    @Transactional(readOnly = true)
    public Company getCompanyBySubdomain(String subdomain) {
        return companyRepository.findBySubdomain(subdomain)
                .orElseThrow(() -> new RuntimeException("Company not found for subdomain: " + subdomain));
    }

    @Transactional(readOnly = true)
    public List<Department> getDepartments(Long companyId) {
        return departmentRepository.findByCompanyIdAndIsActiveTrue(companyId);
    }

    @Transactional(readOnly = true)
    public List<User> getAgents(Long companyId) {
        return userRepository.findByCompanyIdAndIsActiveTrue(companyId);
    }
}
