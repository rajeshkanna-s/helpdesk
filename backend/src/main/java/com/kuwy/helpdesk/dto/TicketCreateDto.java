package com.kuwy.helpdesk.dto;

import com.kuwy.helpdesk.models.Ticket;
import lombok.Getter;
import lombok.Setter;

import java.util.regex.Pattern;

@Getter
@Setter
public class TicketCreateDto {
    public static final int MAX_BODY_LENGTH = 100_000;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private Long companyId;
    private Long departmentId;
    private String requesterName;
    private String requesterEmail;
    private String subject;
    private String description;
    private Ticket.TicketPriority priority = Ticket.TicketPriority.MEDIUM;
    private Long assignedAgentId;
    private Ticket.TicketChannel channel = Ticket.TicketChannel.WEB_PORTAL;

    public void validate() {
        if (companyId != null && companyId <= 0) {
            throw new IllegalArgumentException("companyId must be positive.");
        }
        if (departmentId == null || departmentId <= 0) {
            throw new IllegalArgumentException("A positive departmentId is required.");
        }
        if (assignedAgentId != null && assignedAgentId <= 0) {
            throw new IllegalArgumentException("assignedAgentId must be positive.");
        }
        if (requesterName != null && requesterName.length() > 100) {
            throw new IllegalArgumentException("requesterName must not exceed 100 characters.");
        }
        if (requesterEmail == null || requesterEmail.length() > 254 || !EMAIL.matcher(requesterEmail).matches()) {
            throw new IllegalArgumentException("A valid requesterEmail is required (maximum 254 characters).");
        }
        if (subject == null || subject.isBlank() || subject.length() > 500) {
            throw new IllegalArgumentException("subject must contain 1 to 500 characters.");
        }
        if (description == null || description.isBlank() || description.length() > MAX_BODY_LENGTH) {
            throw new IllegalArgumentException("description must contain 1 to " + MAX_BODY_LENGTH + " characters.");
        }
    }
}
