package com.kuwy.helpdesk.dto;

import com.kuwy.helpdesk.models.Ticket;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TicketCreateDto {
    private Long companyId;
    private Long departmentId;
    private String requesterName;
    private String requesterEmail;
    private String subject;
    private String description;
    private Ticket.TicketPriority priority = Ticket.TicketPriority.MEDIUM;
    private Long assignedAgentId;
    private Ticket.TicketChannel channel = Ticket.TicketChannel.WEB_PORTAL;
}
