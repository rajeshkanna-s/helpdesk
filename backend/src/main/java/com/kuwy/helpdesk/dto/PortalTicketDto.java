package com.kuwy.helpdesk.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.models.TicketThread;

import java.time.LocalDateTime;
import java.util.List;

public record PortalTicketDto(
        Long id, String ticketNumber, String subject, String descriptionText,
        Ticket.TicketStatus status, Ticket.TicketPriority priority, Ticket.TicketChannel channel,
        LocalDateTime createdAt, LocalDateTime updatedAt, ContactView contact, DepartmentView department,
        List<ThreadView> threads, List<AttachmentView> attachments,
        @JsonInclude(JsonInclude.Include.NON_NULL) String emailNotification) {

    public record ContactView(Long id, String firstName, String lastName, String email) { }
    public record DepartmentView(Long id, String name, String code) { }
    public record AttachmentView(Long id, String fileName, Long fileSizeBytes, String contentType,
                                 LocalDateTime createdAt) { }
    public record ThreadView(Long id, TicketThread.ThreadType threadType, TicketThread.SenderType senderType,
                             String fromName, String fromEmail, String bodyText, String bodyHtml,
                             boolean isPrivate, LocalDateTime createdAt, List<AttachmentView> attachments) { }
    public record Csat(boolean success, int rating, String comment, LocalDateTime createdAt) { }
}
