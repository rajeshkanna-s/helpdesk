package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.KbArticleDto;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.DepartmentRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CompanyService {

    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final JdbcTemplate jdbcTemplate;

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

    @Transactional(readOnly = true)
    public List<KbArticleDto> getKbArticles(Long companyId) {
        String sql = "SELECT a.id, a.category_id, c.name as category_name, a.title, a.slug, a.content_html, a.view_count, a.helpful_votes " +
                     "FROM kb_articles a " +
                     "JOIN kb_categories c ON a.category_id = c.id " +
                     "WHERE a.company_id = ? AND a.status = 'PUBLISHED' " +
                     "ORDER BY c.display_order ASC, a.title ASC";
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            KbArticleDto dto = new KbArticleDto();
            dto.setId(rs.getLong("id"));
            dto.setCategoryId(rs.getLong("category_id"));
            dto.setCategoryName(rs.getString("category_name"));
            dto.setTitle(rs.getString("title"));
            dto.setSlug(rs.getString("slug"));
            dto.setContentHtml(rs.getString("content_html"));
            dto.setViewCount(rs.getInt("view_count"));
            dto.setHelpfulVotes(rs.getInt("helpful_votes"));
            return dto;
        }, companyId);
    }
}
