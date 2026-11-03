package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.BulkUpdateDto;
import com.kuwy.helpdesk.dto.ScenarioExecuteDto;
import com.kuwy.helpdesk.dto.TicketCreateDto;
import com.kuwy.helpdesk.dto.TicketReplyDto;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.models.TicketThread;
import com.kuwy.helpdesk.services.SubscriptionService;
import com.kuwy.helpdesk.services.TicketService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/v1/tickets")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class TicketController {

    private final TicketService ticketService;
    private final SubscriptionService subscriptionService;

    @GetMapping
    public ResponseEntity<Page<Ticket>> listTickets(
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long agentId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String order
    ) {
        Long targetCompanyId;
        // Anti-leak: If caller is not Super Admin, strictly enforce their signed tenant ID
        if (TenantContext.isSuperAdmin()) {
            targetCompanyId = (companyId != null) ? companyId : (TenantContext.getCompanyId() != null ? TenantContext.getCompanyId() : 1L);
        } else {
            targetCompanyId = TenantContext.getCompanyId();
            if (targetCompanyId == null) {
                targetCompanyId = 1L; // Fallback
            }
        }

        Sort.Direction direction = "asc".equalsIgnoreCase(order) ? Sort.Direction.ASC : Sort.Direction.DESC;
        String sortField = "createdAt";
        if ("priority".equalsIgnoreCase(sortBy)) sortField = "priority";
        else if ("status".equalsIgnoreCase(sortBy)) sortField = "status";
        else if ("updatedAt".equalsIgnoreCase(sortBy)) sortField = "updatedAt";
        else if ("lastMessageAt".equalsIgnoreCase(sortBy)) sortField = "updatedAt";

        Page<Ticket> tickets = ticketService.getCompanyTickets(
                targetCompanyId,
                status,
                agentId,
                PageRequest.of(page, size, Sort.by(direction, sortField))
        );
        return ResponseEntity.ok(tickets);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Ticket> getTicket(@PathVariable Long id) {
        Ticket ticket = ticketService.getTicketById(id);
        TenantContext.assertAccessTo(ticket.getCompany().getId());
        return ResponseEntity.ok(ticket);
    }

    @GetMapping("/{id}/threads")
    public ResponseEntity<List<TicketThread>> getTicketThreads(@PathVariable Long id) {
        Ticket ticket = ticketService.getTicketById(id);
        TenantContext.assertAccessTo(ticket.getCompany().getId());
        return ResponseEntity.ok(ticketService.getTicketThreads(id));
    }

    @PostMapping
    public ResponseEntity<Ticket> createTicket(@RequestBody TicketCreateDto dto) {
        Long companyId = TenantContext.isSuperAdmin() && dto.getCompanyId() != null
                ? dto.getCompanyId()
                : (TenantContext.getCompanyId() != null ? TenantContext.getCompanyId() : 1L);

        // Enforce Subscription Status and Monthly Ticket Quota
        subscriptionService.assertCanCreateTicket(companyId);

        dto.setCompanyId(companyId);
        return ResponseEntity.ok(ticketService.createTicket(dto));
    }

    @PostMapping("/{id}/replies")
    public ResponseEntity<TicketThread> addReply(
            @PathVariable Long id,
            @RequestBody TicketReplyDto dto
    ) {
        Ticket ticket = ticketService.getTicketById(id);
        TenantContext.assertAccessTo(ticket.getCompany().getId());

        // Check if workspace is locked (read-only mode)
        if (subscriptionService.isWorkspaceLocked(ticket.getCompany().getId())) {
            throw new IllegalStateException("Workspace is locked due to past due subscription. Cannot post replies.");
        }

        return ResponseEntity.ok(ticketService.addReply(id, dto));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<Ticket> updateStatus(
            @PathVariable Long id,
            @RequestParam String status
    ) {
        Ticket ticket = ticketService.getTicketById(id);
        TenantContext.assertAccessTo(ticket.getCompany().getId());
        return ResponseEntity.ok(ticketService.updateStatus(id, Ticket.TicketStatus.valueOf(status.toUpperCase())));
    }

    @PatchMapping("/{id}/priority")
    public ResponseEntity<Ticket> updatePriority(
            @PathVariable Long id,
            @RequestParam String priority
    ) {
        Ticket ticket = ticketService.getTicketById(id);
        TenantContext.assertAccessTo(ticket.getCompany().getId());
        return ResponseEntity.ok(ticketService.updatePriority(id, Ticket.TicketPriority.valueOf(priority.toUpperCase())));
    }

    @PatchMapping("/{id}/department")
    public ResponseEntity<Ticket> updateDepartment(
            @PathVariable Long id,
            @RequestParam Long departmentId
    ) {
        Ticket ticket = ticketService.getTicketById(id);
        TenantContext.assertAccessTo(ticket.getCompany().getId());
        return ResponseEntity.ok(ticketService.updateDepartment(id, departmentId));
    }

    @PatchMapping("/{id}/assign")
    public ResponseEntity<Ticket> assignAgent(
            @PathVariable Long id,
            @RequestParam Long agentId
    ) {
        Ticket ticket = ticketService.getTicketById(id);
        TenantContext.assertAccessTo(ticket.getCompany().getId());
        return ResponseEntity.ok(ticketService.assignAgent(id, agentId));
    }

    @PostMapping("/bulk")
    public ResponseEntity<String> bulkUpdateTickets(@RequestBody BulkUpdateDto dto) {
        // Enforce that all tickets in the bulk list belong to the caller's tenant
        if (dto.getTicketIds() != null) {
            for (Long ticketId : dto.getTicketIds()) {
                Ticket t = ticketService.getTicketById(ticketId);
                TenantContext.assertAccessTo(t.getCompany().getId());
            }
        }
        ticketService.bulkUpdate(dto);
        return ResponseEntity.ok("Bulk update completed successfully");
    }

    @PostMapping("/{id}/execute-scenario")
    public ResponseEntity<Ticket> executeScenario(
            @PathVariable Long id,
            @RequestBody ScenarioExecuteDto dto
    ) {
        Ticket ticket = ticketService.getTicketById(id);
        TenantContext.assertAccessTo(ticket.getCompany().getId());
        return ResponseEntity.ok(ticketService.executeScenario(id, dto));
    }
}
