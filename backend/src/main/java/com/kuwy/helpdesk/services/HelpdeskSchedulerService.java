package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.repositories.TicketRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class HelpdeskSchedulerService {

    private final TicketRepository ticketRepository;

    /**
     * SLA Breach Monitor: Runs every 60 seconds to detect tickets exceeding first-response SLAs.
     */
    @Scheduled(fixedRate = 60000)
    @Transactional
    public void monitorSlaBreaches() {
        LocalDateTime now = LocalDateTime.now();
        List<Ticket> openTickets = ticketRepository.findAll().stream()
                .filter(t -> (t.getStatus() == Ticket.TicketStatus.OPEN || t.getStatus() == Ticket.TicketStatus.IN_PROGRESS)
                        && t.getSlaStatus() == Ticket.SlaStatus.WITHIN_SLA
                        && t.getFirstResponseDueAt() != null
                        && t.getFirstResponseDueAt().isBefore(now))
                .toList();

        for (Ticket ticket : openTickets) {
            ticket.setSlaStatus(Ticket.SlaStatus.BREACHED);
            ticketRepository.save(ticket);
            log.warn("SLA BREACH DETECTED: Ticket #{} exceeded first response deadline of {}",
                    ticket.getTicketNumber(), ticket.getFirstResponseDueAt());
        }
    }

    /**
     * Auto-Close Engine: Runs every 10 minutes to close tickets that have been RESOLVED for > 48 hours.
     */
    @Scheduled(fixedRate = 600000)
    @Transactional
    public void autoCloseResolvedTickets() {
        LocalDateTime cutoff = LocalDateTime.now().minusHours(48);
        List<Ticket> resolvedToClose = ticketRepository.findAll().stream()
                .filter(t -> t.getStatus() == Ticket.TicketStatus.RESOLVED
                        && t.getResolvedAt() != null
                        && t.getResolvedAt().isBefore(cutoff))
                .toList();

        for (Ticket ticket : resolvedToClose) {
            ticket.setStatus(Ticket.TicketStatus.CLOSED);
            ticketRepository.save(ticket);
            log.info("Auto-closed resolved ticket #{} after 48 hours of inactivity", ticket.getTicketNumber());
        }
    }
}
