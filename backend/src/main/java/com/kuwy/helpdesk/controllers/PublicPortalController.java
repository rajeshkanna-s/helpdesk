package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.TicketCreateDto;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.services.TicketService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

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
    private final ContactRepository contactRepository;

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
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/{subdomain}/request-otp")
    public ResponseEntity<Map<String, Object>> requestOtp(
            @PathVariable String subdomain,
            @RequestBody Map<String, String> body
    ) {
        String email = body.get("email");
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
            @RequestBody PublicTicketCreateDto dto
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        TicketCreateDto createDto = new TicketCreateDto();
        createDto.setCompanyId(company.getId());
        createDto.setDepartmentId(dto.getDepartmentId());
        createDto.setRequesterName(dto.getRequesterName());
        createDto.setRequesterEmail(dto.getRequesterEmail());
        createDto.setSubject(dto.getSubject());
        createDto.setDescription(dto.getDescription());
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

        List<Ticket> tickets = ticketRepository.findByCompanyIdAndContactEmail(company.getId(), email);
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

        // Security check: customer only accesses their own ticket
        if (!ticket.getContact().getEmail().equalsIgnoreCase(email.trim())) {
            return ResponseEntity.status(403).build();
        }

        List<TicketThread> threads = ticketService.getTicketThreads(ticket.getId());
        // Filter out private notes so customer cannot see them
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
        String replyText = body.get("reply");

        TicketThread thread = new TicketThread();
        thread.setCompany(company);
        thread.setTicket(ticket);
        thread.setThreadType(TicketThread.ThreadType.CUSTOMER_REPLY);
        thread.setSenderType(TicketThread.SenderType.CUSTOMER);
        thread.setSenderContact(ticket.getContact());
        thread.setFromEmail(email);
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
            @PathVariable String ticketNumber
    ) {
        Company company = companyRepository.findBySubdomain(subdomain.toLowerCase())
                .orElseThrow(() -> new RuntimeException("Company not found: " + subdomain));

        Ticket ticket = ticketRepository.findByCompanyIdAndTicketNumber(company.getId(), ticketNumber)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketNumber));

        ticket.setStatus(Ticket.TicketStatus.OPEN);
        return ResponseEntity.ok(ticketRepository.save(ticket));
    }

    @Data
    public static class PublicTicketCreateDto {
        private String requesterName;
        private String requesterEmail;
        private Long departmentId;
        private String subject;
        private String description;
        private Ticket.TicketPriority priority;
    }
}

