package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.CustomerContactDto;
import com.kuwy.helpdesk.dto.KbArticleDto;
import com.kuwy.helpdesk.dto.SaveKbArticleRequest;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.Notification;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.DepartmentRepository;
import com.kuwy.helpdesk.repositories.NotificationRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CompanyService {

    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final NotificationRepository notificationRepository;
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

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getKbCategories(Long companyId) {
        String sql = "SELECT id, name, slug, description, display_order FROM kb_categories WHERE company_id = ? ORDER BY display_order ASC";
        return jdbcTemplate.queryForList(sql, companyId);
    }

    @Transactional
    public KbArticleDto createKbArticle(Long companyId, SaveKbArticleRequest req) {
        String slug = req.getSlug();
        if (slug == null || slug.isBlank()) {
            slug = req.getTitle().toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        }
        Long catId = req.getCategoryId() != null ? req.getCategoryId() : 1L;
        String status = req.getStatus() != null ? req.getStatus() : "PUBLISHED";
        Long authorId = com.kuwy.helpdesk.tenant.TenantContext.getUserId() != null
            ? com.kuwy.helpdesk.tenant.TenantContext.getUserId()
            : 1L;

        jdbcTemplate.update(
            "INSERT INTO kb_articles (company_id, category_id, author_id, title, slug, content_html, status, view_count, helpful_votes, unhelpful_votes, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NOW(), NOW())",
            companyId, catId, authorId, req.getTitle(), slug, req.getContentHtml(), status
        );
        Long id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        
        String catName = jdbcTemplate.queryForObject(
            "SELECT name FROM kb_categories WHERE id = ?", String.class, catId
        );

        KbArticleDto dto = new KbArticleDto();
        dto.setId(id);
        dto.setCategoryId(catId);
        dto.setCategoryName(catName != null ? catName : "General");
        dto.setTitle(req.getTitle());
        dto.setSlug(slug);
        dto.setContentHtml(req.getContentHtml());
        dto.setViewCount(0);
        dto.setHelpfulVotes(0);
        return dto;
    }

    @Transactional(readOnly = true)
    public List<CustomerContactDto> getCustomers(Long companyId) {
        String sql = "SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.created_at, " +
                     "       a.id as account_id, a.account_name, " +
                     "       COUNT(t.id) as total_tickets, " +
                     "       SUM(CASE WHEN t.status IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER') THEN 1 ELSE 0 END) as open_tickets " +
                     "FROM contacts c " +
                     "LEFT JOIN customer_accounts a ON c.account_id = a.id " +
                     "LEFT JOIN tickets t ON t.contact_id = c.id AND t.company_id = c.company_id " +
                     "WHERE c.company_id = ? " +
                     "GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, c.created_at, a.id, a.account_name " +
                     "ORDER BY c.id DESC";
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            CustomerContactDto dto = new CustomerContactDto();
            dto.setId(rs.getLong("id"));
            dto.setFirstName(rs.getString("first_name"));
            dto.setLastName(rs.getString("last_name"));
            String first = dto.getFirstName() != null ? dto.getFirstName() : "";
            String last = dto.getLastName() != null ? dto.getLastName() : "";
            dto.setDisplayName((first + " " + last).trim());
            dto.setEmail(rs.getString("email"));
            dto.setPhone(rs.getString("phone"));
            dto.setAccountId(rs.getObject("account_id") != null ? rs.getLong("account_id") : null);
            dto.setOrganization(rs.getString("account_name") != null ? rs.getString("account_name") : "Individual Customer");
            dto.setTotalTickets(rs.getInt("total_tickets"));
            dto.setOpenTickets(rs.getInt("open_tickets"));
            dto.setCreatedAt(rs.getString("created_at"));
            return dto;
        }, companyId);
    }

    @Transactional
    public CustomerContactDto createCustomer(Long companyId, CustomerContactDto req) {
        Long accountId = req.getAccountId();
        if (accountId == null && req.getOrganization() != null && !req.getOrganization().isBlank()) {
            List<Long> accIds = jdbcTemplate.query(
                "SELECT id FROM customer_accounts WHERE company_id = ? AND account_name = ?",
                (rs, rowNum) -> rs.getLong("id"), companyId, req.getOrganization().trim()
            );
            if (!accIds.isEmpty()) {
                accountId = accIds.get(0);
            } else {
                jdbcTemplate.update(
                    "INSERT INTO customer_accounts (company_id, account_name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
                    companyId, req.getOrganization().trim()
                );
                accountId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
            }
        }

        jdbcTemplate.update(
            "INSERT INTO contacts (company_id, account_id, first_name, last_name, email, phone, is_portal_user, is_active, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW())",
            companyId, accountId, req.getFirstName(), req.getLastName(), req.getEmail().trim(), req.getPhone()
        );
        Long contactId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        req.setId(contactId);
        return req;
    }

    @Transactional
    public List<Notification> getNotifications(Long companyId, Long userId) {
        List<Notification> list = notificationRepository.findByCompanyIdOrderByCreatedAtDesc(companyId);
        if (list.isEmpty()) {
            // Seed a few realistic operational notifications
            jdbcTemplate.update(
                "INSERT INTO notifications (company_id, user_id, ticket_id, title, message, is_read, created_at) VALUES " +
                "(?, ?, 1, 'New Ticket Raised', 'Priya Natarajan raised #KUWY-1012: Need urgent verification of vehicle registration certificate', 0, NOW()), " +
                "(?, ?, 2, 'SLA Resolution Advisory', 'Ticket #KUWY-1010 has 2 hours remaining before resolution SLA threshold', 0, NOW()), " +
                "(?, ?, 3, 'Inbound Reply Recorded', 'Customer reply received on ticket #KUWY-1002 from Rajesh Sundaram', 0, NOW())",
                companyId, (userId != null ? userId : 1L),
                companyId, (userId != null ? userId : 1L),
                companyId, (userId != null ? userId : 1L)
            );
            list = notificationRepository.findByCompanyIdOrderByCreatedAtDesc(companyId);
        }
        return list;
    }

    @Transactional
    public void markNotificationRead(Long id) {
        notificationRepository.findById(id).ifPresent(n -> {
            n.setIsRead(true);
            notificationRepository.save(n);
        });
    }

    @Transactional
    public void markAllNotificationsRead(Long companyId) {
        jdbcTemplate.update("UPDATE notifications SET is_read = 1 WHERE company_id = ?", companyId);
    }
}
