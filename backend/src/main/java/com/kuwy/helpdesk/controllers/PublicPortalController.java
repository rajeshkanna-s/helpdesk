package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.config.BrowserSessionCookies;
import com.kuwy.helpdesk.services.PortalLoginService;
import com.kuwy.helpdesk.dto.PortalTicketDto;
import com.kuwy.helpdesk.dto.KbArticleDto;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.services.CustomerOtpService;
import com.kuwy.helpdesk.services.EmailService;
import com.kuwy.helpdesk.services.RateLimiterService;
import com.kuwy.helpdesk.services.SubscriptionService;
import com.kuwy.helpdesk.services.TicketService;
import com.kuwy.helpdesk.services.PortalTicketService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

/**
 * Public Customer Support Portal Controller with:
 * - Anti-spam Honeypot detection
 * - Client IP and email rate limiting (anti-abuse)
 * - Strict multi-tenant subdomain scoping
 * - Cryptographic Customer JWT authentication
 * - One-time password (OTP) verification with max attempts
 * - Whitelist-based HTML sanitization against Stored XSS
 * - Private notes filtering (prevents internal data leaks to customers)
 * - Subscription status and quota enforcement
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/portal")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class PublicPortalController {

    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final TicketRepository ticketRepository;
    private final TicketThreadRepository threadRepository;
    private final TicketService ticketService;
    private final RateLimiterService rateLimiterService;
    private final SubscriptionService subscriptionService;
    private final JdbcTemplate jdbcTemplate;
    private final CustomerOtpService customerOtpService;
    private final EmailService emailService;
    private final JwtTokenProvider jwtTokenProvider;
    private final PortalTicketService portalTicketService;
    private final PortalLoginService portalLoginService;
    private final BrowserSessionCookies browserCookies;

    @GetMapping("/{subdomain}")
    public ResponseEntity<Map<String, Object>> getPortalInfo(@PathVariable String subdomain) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found: " + subdomain));

        List<Department> departments = departmentRepository.findByCompanyIdAndIsActiveTrue(company.getId());

        Map<String, Object> resp = new HashMap<>();
        resp.put("companyId", company.getId());
        resp.put("companyName", company.getName());
        resp.put("companyCode", company.getCompanyCode());
        resp.put("subdomain", company.getSubdomain());
        resp.put("primaryColor", company.getPrimaryColor());
        resp.put("logoUrl", company.getLogoUrl());
        resp.put("departments", departments);
        resp.put("isLocked", subscriptionService.isWorkspaceLocked(company.getId()));
        resp.put("supportEmail", "support@" + company.getSubdomain() + ".kuwy.in");
        resp.put("supportPhone", "+91 44 6612 8000");
        resp.put("businessHours", "Mon - Sat: 09:00 AM - 07:00 PM IST");
        resp.put("announcementBanner", "Helpdesk Operational Advisory: All systems operating normally. Average first response time is under 15 minutes.");
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/{subdomain}/request-otp")
    public ResponseEntity<Map<String, Object>> requestOtp(
            @PathVariable String subdomain,
            @RequestBody Map<String, String> body,
            HttpServletRequest request
    ) {
        String cleanEmail;
        try {
            cleanEmail = CustomerOtpService.canonicalEmail(body == null ? null : body.get("email"));
        } catch (IllegalArgumentException invalid) {
            return ResponseEntity.badRequest().body(Map.of("error", "Valid email address required"));
        }
        Company company = requireOtpCompany(subdomain);
        String clientIp = extractClientIp(request);

        // Anti-Abuse Rate Limiting on OTP generation
        if (!rateLimiterService.allowOtpRequest(clientIp, company.getId() + ":" + cleanEmail)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of(
                    "error", "Too many OTP verification requests. Please wait a few minutes before trying again."
            ));
        }

        try {
            customerOtpService.generateAndDispatchOtp(company.getId(), cleanEmail, company.getName());
        } catch (RuntimeException unavailable) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "error", "Verification email could not be queued. Please try again later."));
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", "A verification email has been queued. Check your inbox for a 6-digit code.");
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/{subdomain}/verify-otp")
    public ResponseEntity<Map<String, Object>> verifyOtp(
            @PathVariable String subdomain,
            @RequestBody Map<String, String> body,
            HttpServletRequest request
    ) {
        boolean browser = "1".equals(request.getHeader("X-Browser-Session"));
        if (browser) browserCookies.requireBrowserMutation(request);
        String cleanEmail;
        try {
            cleanEmail = CustomerOtpService.canonicalEmail(body == null ? null : body.get("email"));
        } catch (IllegalArgumentException invalid) {
            return ResponseEntity.badRequest().body(Map.of("error", "Valid email address required"));
        }
        String otp = body.get("otp");
        if (otp == null || !otp.matches("[0-9]{6}")) {
            return ResponseEntity.badRequest().body(Map.of("error", "A 6-digit verification code is required"));
        }
        Company company = requireOtpCompany(subdomain);
        if (!rateLimiterService.allowAuthentication(extractClientIp(request), company.getId() + ":" + cleanEmail,
                "customer-otp-verify")) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of(
                    "error", "Too many verification attempts. Please wait before trying again."));
        }

        boolean valid = customerOtpService.verifyOtp(company.getId(), cleanEmail, otp);
        if (!valid) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid or expired verification code"));
        }

        if (browser) {
            var session = portalLoginService.openVerifiedSession(company, cleanEmail, request);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("browserSession", true);
            result.put("csrfToken", session.csrfToken());
            result.put("sessionId", session.sessionId());
            result.put("email", cleanEmail);
            result.put("companyId", company.getId());
            return ResponseEntity.ok().headers(browserCookies.issue(session, "CUSTOMER")).body(result);
        }

        // Issue signed, tamper-proof Customer JWT
        String customerJwt = jwtTokenProvider.generateCustomerToken(cleanEmail, company.getId(),
                company.getSubdomain().toLowerCase(Locale.ROOT));

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("token", customerJwt);
        resp.put("email", cleanEmail);
        resp.put("companyId", company.getId());
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/{subdomain}/demo-login")
    public ResponseEntity<Map<String, Object>> demoCustomerLogin(
            @PathVariable String subdomain,
            @RequestBody(required = false) Map<String, String> body
    ) {
        return ResponseEntity.status(HttpStatus.GONE).body(Map.of(
                "error", "Demo sign-in is unavailable. Use verified email sign-in to request and verify a code."));
    }

    private Company requireOtpCompany(String subdomain) {
        if (subdomain == null || !subdomain.matches("[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,98}[a-zA-Z0-9])?")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found");
        }
        String canonicalSubdomain = subdomain.toLowerCase(Locale.ROOT);
        Company company = companyRepository.findBySubdomain(canonicalSubdomain)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        if (company.getId() == null || company.getId() <= 0 || company.getSubdomain() == null
                || !canonicalSubdomain.equals(company.getSubdomain().toLowerCase(Locale.ROOT))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found");
        }
        if (company.getStatus() != Company.CompanyStatus.ACTIVE && company.getStatus() != Company.CompanyStatus.TRIAL) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer sign-in is unavailable for this company");
        }
        return company;
    }

    @PostMapping("/{subdomain}/tickets")
    public ResponseEntity<PortalTicketDto> createPublicTicket(
            @PathVariable String subdomain,
            @RequestBody PublicTicketCreateDto dto,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok(portalTicketService.create(subdomain, dto, extractClientIp(request)));
    }

    @GetMapping("/{subdomain}/tickets")
    public ResponseEntity<Page<PortalTicketDto>> getCustomerTickets(
            @PathVariable String subdomain,
            @RequestParam(required = false) String email,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok(portalTicketService.list(subdomain, email, page, size, q, status));
    }

    @GetMapping("/{subdomain}/tickets/{ticketNumber}")
    public ResponseEntity<PortalTicketDto> getCustomerTicketDetail(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestParam(required = false) String email,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok(portalTicketService.detail(subdomain, ticketNumber, email));
    }

    @PostMapping("/{subdomain}/tickets/{ticketNumber}/reply")
    public ResponseEntity<PortalTicketDto> customerReply(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok(portalTicketService.reply(subdomain, ticketNumber, body));
    }

    @PostMapping("/{subdomain}/tickets/{ticketNumber}/reopen")
    public ResponseEntity<PortalTicketDto> customerReopen(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestParam(required = false) String email,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok(portalTicketService.reopen(subdomain, ticketNumber, email));
    }

    @PostMapping("/{subdomain}/tickets/{ticketNumber}/close")
    public ResponseEntity<PortalTicketDto> closeTicketByCustomer(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestParam(required = false) String email,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok(portalTicketService.close(subdomain, ticketNumber, email));
    }

    @PostMapping("/{subdomain}/tickets/{ticketNumber}/csat")
    public ResponseEntity<PortalTicketDto.Csat> submitCsat(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok(portalTicketService.csat(subdomain, ticketNumber, body));
    }

    @GetMapping("/{subdomain}/export-data")
    public ResponseEntity<Map<String, Object>> exportCustomerData(
            @PathVariable String subdomain,
            @RequestParam(required = false) String email,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok(portalTicketService.export(subdomain, email, page, size));
    }

    @GetMapping("/{subdomain}/kb/articles")
    public ResponseEntity<List<KbArticleDto>> getPublicKbArticles(
            @PathVariable String subdomain,
            @RequestParam(required = false) String query
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found: " + subdomain));

        String sql;
        List<Object> params = new ArrayList<>();
        params.add(company.getId());

        if (query != null && !query.isBlank()) {
            sql = "SELECT a.id, a.category_id, c.name as category_name, a.title, a.slug, a.content_html, a.view_count, a.helpful_votes " +
                  "FROM kb_articles a " +
                  "JOIN kb_categories c ON a.category_id = c.id " +
                  "WHERE a.company_id = ? AND a.status = 'PUBLISHED' " +
                  "AND (LOWER(a.title) LIKE ? OR LOWER(a.content_html) LIKE ? OR LOWER(c.name) LIKE ?) " +
                  "ORDER BY c.display_order ASC, a.view_count DESC";
            String qLike = "%" + query.trim().toLowerCase() + "%";
            params.add(qLike);
            params.add(qLike);
            params.add(qLike);
        } else {
            sql = "SELECT a.id, a.category_id, c.name as category_name, a.title, a.slug, a.content_html, a.view_count, a.helpful_votes " +
                  "FROM kb_articles a " +
                  "JOIN kb_categories c ON a.category_id = c.id " +
                  "WHERE a.company_id = ? AND a.status = 'PUBLISHED' " +
                  "ORDER BY c.display_order ASC, a.view_count DESC";
        }

        List<KbArticleDto> articles = jdbcTemplate.query(sql, (rs, rowNum) -> {
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
        }, params.toArray());

        return ResponseEntity.ok(articles);
    }

    @PostMapping("/{subdomain}/kb/articles/{id}/vote")
    public ResponseEntity<Map<String, Object>> voteKbArticle(
            @PathVariable String subdomain,
            @PathVariable Long id,
            @RequestParam(defaultValue = "true") boolean helpful
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found: " + subdomain));

        if (helpful) {
            jdbcTemplate.update("UPDATE kb_articles SET helpful_votes = helpful_votes + 1, view_count = view_count + 1 WHERE id = ? AND company_id = ?", id, company.getId());
        } else {
            jdbcTemplate.update("UPDATE kb_articles SET unhelpful_votes = unhelpful_votes + 1, view_count = view_count + 1 WHERE id = ? AND company_id = ?", id, company.getId());
        }

        return ResponseEntity.ok(Map.of("success", true, "message", "Feedback recorded. Thank you!"));
    }

    private String requireVerifiedCustomerEmail(HttpServletRequest request, Long companyId, String requestedEmail) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Customer authentication token required. Please sign in.");
        }
        String token = authHeader.substring(7).trim();
        if (!jwtTokenProvider.validateCustomerToken(token, companyId, requestedEmail)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired customer session. Please sign in again.");
        }
        Claims claims = jwtTokenProvider.getClaimsFromToken(token);
        return claims.getSubject();
    }

    private String extractClientIp(HttpServletRequest request) {
        String remoteAddr = request == null ? null : request.getRemoteAddr();
        return remoteAddr == null || remoteAddr.isBlank() ? "unknown" : remoteAddr;
    }

    @Data
    public static class PublicTicketCreateDto {
        private String requesterName;
        private String requesterEmail;
        private Long departmentId;
        private String subject;
        private String description;
        private Ticket.TicketPriority priority;

        // Honeypot fields (hidden in UI)
        private String websiteUrl;
        private String hpToken;
    }
}
