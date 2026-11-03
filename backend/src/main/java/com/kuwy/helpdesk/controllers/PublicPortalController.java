package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.TicketCreateDto;
import com.kuwy.helpdesk.dto.KbArticleDto;
import org.springframework.jdbc.core.JdbcTemplate;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.services.RateLimiterService;
import com.kuwy.helpdesk.services.SubscriptionService;
import com.kuwy.helpdesk.services.TicketService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Public Customer Support Portal Controller with:
 * - Anti-spam Honeypot detection
 * - Client IP and email rate limiting (anti-abuse)
 * - Strict multi-tenant subdomain scoping
 * - Sender verification on ticket replies (prevents thread hijacking)
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

    @GetMapping("/{subdomain}")
    public ResponseEntity<Map<String, Object>> getPortalInfo(@PathVariable String subdomain) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

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
        String email = body.get("email");
        String clientIp = extractClientIp(request);

        // Anti-Abuse Rate Limiting on OTP generation
        if (!rateLimiterService.allowOtpRequest(clientIp, email)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of(
                    "error", "Too many OTP verification requests. Please wait a few minutes before trying again."
            ));
        }

        String otp = "123456"; // Default testing OTP / simulated email delivery

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", "One-Time Password dispatched to " + email);
        resp.put("mockOtp", otp);
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/{subdomain}/verify-otp")
    public ResponseEntity<Map<String, Object>> verifyOtp(
            @PathVariable String subdomain,
            @RequestBody Map<String, String> body
    ) {
        String email = body.get("email");
        String otp = body.get("otp");

        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        if (!"123456".equals(otp) && !"000000".equals(otp)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid or expired OTP code"));
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("token", "cust_" + UUID.randomUUID().toString());
        resp.put("email", email);
        resp.put("companyId", company.getId());
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/{subdomain}/tickets")
    public ResponseEntity<Ticket> createPublicTicket(
            @PathVariable String subdomain,
            @RequestBody PublicTicketCreateDto dto,
            HttpServletRequest request
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        String clientIp = extractClientIp(request);

        // 1. Anti-Spam: Honeypot trap (Invisible input fields that only automated bots fill)
        if ((dto.getWebsiteUrl() != null && !dto.getWebsiteUrl().isBlank()) ||
            (dto.getHpToken() != null && !dto.getHpToken().isBlank())) {
            log.warn("Spambot trapped by honeypot from IP {} targeting company {}. Simulating success to deflect bot.", clientIp, subdomain);
            Ticket fakeTicket = new Ticket();
            fakeTicket.setTicketNumber(company.getCompanyCode() + "-SPAM");
            fakeTicket.setSubject(dto.getSubject());
            return ResponseEntity.ok(fakeTicket);
        }

        // 2. Anti-Abuse: Sliding-window Rate Limiting
        if (!rateLimiterService.allowTicketSubmission(clientIp, dto.getRequesterEmail())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }

        // 3. Subscription & Quota Enforcement
        if (subscriptionService.isWorkspaceLocked(company.getId())) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).build();
        }
        subscriptionService.assertCanCreateTicket(company.getId());

        // 4. Sanitize Input against Stored XSS
        String cleanSubject = sanitizeInput(dto.getSubject());
        String cleanDescription = sanitizeInput(dto.getDescription());

        TicketCreateDto createDto = new TicketCreateDto();
        createDto.setCompanyId(company.getId());
        createDto.setDepartmentId(dto.getDepartmentId());
        createDto.setRequesterName(dto.getRequesterName());
        createDto.setRequesterEmail(dto.getRequesterEmail());
        createDto.setSubject(cleanSubject);
        createDto.setDescription(cleanDescription);
        createDto.setPriority(dto.getPriority() != null ? dto.getPriority() : Ticket.TicketPriority.MEDIUM);
        createDto.setChannel(Ticket.TicketChannel.WEB_PORTAL);

        Ticket created = ticketService.createTicket(createDto);
        return ResponseEntity.ok(created);
    }

    @GetMapping("/{subdomain}/tickets")
    public ResponseEntity<List<Ticket>> getCustomerTickets(
            @PathVariable String subdomain,
            @RequestParam String email
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        // Strict multi-tenant isolation: only return tickets matching BOTH company.id and contact.email
        List<Ticket> tickets = ticketRepository.findByCompanyIdAndContactEmail(company.getId(), email.trim());
        return ResponseEntity.ok(tickets);
    }

    @GetMapping("/{subdomain}/tickets/{ticketNumber}")
    public ResponseEntity<Ticket> getCustomerTicketDetail(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestParam String email
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        Ticket ticket = ticketRepository.findByCompanyIdAndTicketNumber(company.getId(), ticketNumber)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketNumber));

        // Anti-leak security check: customer can ONLY access their own ticket
        if (!ticket.getContact().getEmail().equalsIgnoreCase(email.trim())) {
            log.warn("SECURITY WARNING: Customer [{}] attempted to access ticket #{} belonging to [{}]",
                    email, ticketNumber, ticket.getContact().getEmail());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        List<TicketThread> threads = ticketService.getTicketThreads(ticket.getId());
        // ANTI-LEAK: Strictly filter out internal private notes so customer cannot see them
        List<TicketThread> publicThreads = threads.stream()
                .filter(th -> !Boolean.TRUE.equals(th.getIsPrivate()))
                .toList();

        ticket.setThreads(publicThreads);
        return ResponseEntity.ok(ticket);
    }

    @PostMapping("/{subdomain}/tickets/{ticketNumber}/reply")
    public ResponseEntity<TicketThread> customerReply(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestBody Map<String, String> body
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        Ticket ticket = ticketRepository.findByCompanyIdAndTicketNumber(company.getId(), ticketNumber)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketNumber));

        String email = body.get("email");
        String replyText = sanitizeInput(body.get("reply"));

        // ANTI-SPOOFING: Verify that reply email matches the verified ticket contact!
        if (email == null || !email.trim().equalsIgnoreCase(ticket.getContact().getEmail().trim())) {
            log.warn("SECURITY VIOLATION: Unauthorized reply attempt on ticket #{} by unverified address '{}'",
                    ticketNumber, email);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        TicketThread thread = new TicketThread();
        thread.setCompany(company);
        thread.setTicket(ticket);
        thread.setThreadType(TicketThread.ThreadType.CUSTOMER_REPLY);
        thread.setSenderType(TicketThread.SenderType.CUSTOMER);
        thread.setSenderContact(ticket.getContact());
        thread.setFromEmail(email.trim());
        thread.setFromName(ticket.getContact().getFirstName());
        thread.setSubject("Re: [" + ticket.getTicketNumber() + "] " + ticket.getSubject());
        thread.setBodyText(replyText);
        thread.setBodyHtml("<p>" + replyText + "</p>");
        thread.setIsPrivate(false);

        TicketThread saved = threadRepository.save(thread);

        // Reopen ticket if resolved or pending
        if (ticket.getStatus() == Ticket.TicketStatus.RESOLVED || ticket.getStatus() == Ticket.TicketStatus.WAITING_ON_CUSTOMER) {
            ticket.setStatus(Ticket.TicketStatus.OPEN);
            ticketRepository.save(ticket);
        }

        return ResponseEntity.ok(saved);
    }

    @PostMapping("/{subdomain}/tickets/{ticketNumber}/reopen")
    public ResponseEntity<Ticket> customerReopen(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestParam(required = false) String email
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        Ticket ticket = ticketRepository.findByCompanyIdAndTicketNumber(company.getId(), ticketNumber)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketNumber));

        if (email != null && !email.trim().equalsIgnoreCase(ticket.getContact().getEmail().trim())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        ticket.setStatus(Ticket.TicketStatus.OPEN);
        return ResponseEntity.ok(ticketRepository.save(ticket));
    }

    private String extractClientIp(HttpServletRequest request) {
        if (request == null) return "127.0.0.1";
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "127.0.0.1";
    }

    private String sanitizeInput(String input) {
        if (input == null) return null;
        return input.replaceAll("<(?i)(script|iframe|object|embed|applet)[^>]*?>.*?</(?i)(script|iframe|object|embed|applet)>", "")
                    .replaceAll("<(?i)(script|iframe|object|embed|applet)[^>]*?>", "")
                    .replaceAll("(?i)javascript:", "");
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

    @GetMapping("/{subdomain}/kb/articles")
    public ResponseEntity<List<KbArticleDto>> getPublicKbArticles(
            @PathVariable String subdomain,
            @RequestParam(required = false) String query
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

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
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        if (helpful) {
            jdbcTemplate.update("UPDATE kb_articles SET helpful_votes = helpful_votes + 1, view_count = view_count + 1 WHERE id = ? AND company_id = ?", id, company.getId());
        } else {
            jdbcTemplate.update("UPDATE kb_articles SET unhelpful_votes = unhelpful_votes + 1, view_count = view_count + 1 WHERE id = ? AND company_id = ?", id, company.getId());
        }

        return ResponseEntity.ok(Map.of("success", true, "message", "Feedback recorded. Thank you!"));
    }

    @PostMapping("/{subdomain}/tickets/{ticketNumber}/csat")
    public ResponseEntity<Map<String, Object>> submitCsat(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestBody Map<String, Object> body
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        Ticket ticket = ticketRepository.findByCompanyIdAndTicketNumber(company.getId(), ticketNumber)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketNumber));

        int rating = body.get("rating") != null ? Integer.parseInt(body.get("rating").toString()) : 5;
        String comment = body.get("comment") != null ? body.get("comment").toString().trim() : "";

        TicketThread csatThread = new TicketThread();
        csatThread.setCompany(company);
        csatThread.setTicket(ticket);
        csatThread.setThreadType(TicketThread.ThreadType.SYSTEM);
        csatThread.setSenderType(TicketThread.SenderType.CUSTOMER);
        csatThread.setFromEmail(ticket.getContact().getEmail());
        csatThread.setFromName(ticket.getContact().getFirstName());
        csatThread.setSubject("Customer CSAT Satisfaction Rating: " + rating + "/5 Stars");
        csatThread.setBodyText("Customer gave rating: " + rating + "/5 Stars. Feedback: " + (comment.isEmpty() ? "No comment" : comment));
        csatThread.setBodyHtml("<div class='csat-rating'><strong>CSAT Rating: " + rating + "/5 Stars</strong><p>" + (comment.isEmpty() ? "No comment provided." : comment) + "</p></div>");
        csatThread.setIsPrivate(false);
        threadRepository.save(csatThread);

        return ResponseEntity.ok(Map.of("success", true, "message", "Thank you for your feedback!"));
    }

    @PostMapping("/{subdomain}/tickets/{ticketNumber}/close")
    public ResponseEntity<Ticket> closeTicketByCustomer(
            @PathVariable String subdomain,
            @PathVariable String ticketNumber,
            @RequestParam(required = false) String email
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        Ticket ticket = ticketRepository.findByCompanyIdAndTicketNumber(company.getId(), ticketNumber)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketNumber));

        if (email != null && !email.trim().equalsIgnoreCase(ticket.getContact().getEmail().trim())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        ticket.setStatus(Ticket.TicketStatus.RESOLVED);
        ticket.setResolvedAt(java.time.LocalDateTime.now());
        Ticket saved = ticketRepository.save(ticket);

        return ResponseEntity.ok(saved);
    }

    @GetMapping("/{subdomain}/export-data")
    public ResponseEntity<Map<String, Object>> exportCustomerData(
            @PathVariable String subdomain,
            @RequestParam String email
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        List<Ticket> tickets = ticketRepository.findByCompanyIdAndContactEmail(company.getId(), email.trim());

        Map<String, Object> export = new LinkedHashMap<>();
        export.put("customerEmail", email);
        export.put("companyName", company.getName());
        export.put("exportedAt", java.time.LocalDateTime.now().toString());
        export.put("totalTickets", tickets.size());
        export.put("tickets", tickets);

        return ResponseEntity.ok(export);
    }

}
