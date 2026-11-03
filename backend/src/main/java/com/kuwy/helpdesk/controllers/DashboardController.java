package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.DashboardStatsDto;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.repositories.CompanyMailboxRepository;
import com.kuwy.helpdesk.repositories.TicketRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class DashboardController {

    private final TicketRepository ticketRepository;
    private final UserRepository userRepository;
    private final CompanyMailboxRepository mailboxRepository;

    @GetMapping("/stats")
    public ResponseEntity<DashboardStatsDto> getDashboardStats(@RequestParam(required = false) Long companyId) {
        Long targetId = TenantContext.isSuperAdmin() && companyId != null
                ? companyId
                : (TenantContext.getCompanyId() != null ? TenantContext.getCompanyId() : 1L);
        TenantContext.assertAccessTo(targetId);

        DashboardStatsDto stats = DashboardStatsDto.builder()
                .totalTickets(ticketRepository.countByCompanyId(targetId))
                .openTickets(ticketRepository.countByCompanyIdAndStatus(targetId, Ticket.TicketStatus.OPEN))
                .inProgressTickets(ticketRepository.countByCompanyIdAndStatus(targetId, Ticket.TicketStatus.IN_PROGRESS))
                .resolvedTickets(ticketRepository.countByCompanyIdAndStatus(targetId, Ticket.TicketStatus.RESOLVED))
                .breachedSlaTickets(ticketRepository.countBreachedSla(targetId))
                .activeAgents(userRepository.findByCompanyIdAndIsActiveTrue(targetId).size())
                .connectedMailboxes(mailboxRepository.findByCompanyId(targetId).size())
                .build();

        return ResponseEntity.ok(stats);
    }
}
