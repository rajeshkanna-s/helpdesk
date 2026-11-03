package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.TicketCreateDto;
import com.kuwy.helpdesk.dto.TicketReplyDto;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.models.TicketThread;
import com.kuwy.helpdesk.services.TicketService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/tickets")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class TicketController {

    private final TicketService ticketService;

    @GetMapping
    public ResponseEntity<Page<Ticket>> listTickets(
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long agentId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "15") int size
    ) {
        Long targetCompanyId = (companyId != null) ? companyId : TenantContext.getCompanyId();
        if (targetCompanyId == null) {
            targetCompanyId = 1L; // Fallback
        }

        Page<Ticket> tickets = ticketService.getCompanyTickets(
                targetCompanyId,
                status,
                agentId,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"))
        );
        return ResponseEntity.ok(tickets);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Ticket> getTicket(@PathVariable Long id) {
        return ResponseEntity.ok(ticketService.getTicketById(id));
    }

    @GetMapping("/{id}/threads")
    public ResponseEntity<java.util.List<TicketThread>> getTicketThreads(@PathVariable Long id) {
        return ResponseEntity.ok(ticketService.getTicketThreads(id));
    }

    @PostMapping
    public ResponseEntity<Ticket> createTicket(@RequestBody TicketCreateDto dto) {
        if (dto.getCompanyId() == null) {
            dto.setCompanyId(TenantContext.getCompanyId() != null ? TenantContext.getCompanyId() : 1L);
        }
        return ResponseEntity.ok(ticketService.createTicket(dto));
    }

    @PostMapping("/{id}/replies")
    public ResponseEntity<TicketThread> addReply(
            @PathVariable Long id,
            @RequestBody TicketReplyDto dto
    ) {
        return ResponseEntity.ok(ticketService.addReply(id, dto));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<Ticket> updateStatus(
            @PathVariable Long id,
            @RequestParam String status
    ) {
        return ResponseEntity.ok(ticketService.updateStatus(id, Ticket.TicketStatus.valueOf(status.toUpperCase())));
    }

    @PatchMapping("/{id}/assign")
    public ResponseEntity<Ticket> assignAgent(
            @PathVariable Long id,
            @RequestParam Long agentId
    ) {
        return ResponseEntity.ok(ticketService.assignAgent(id, agentId));
    }
}
