package com.kuwy.helpdesk.dto;

import lombok.Data;

import java.util.HashSet;
import java.util.List;

@Data
public class BulkUpdateDto {
    public static final int MAX_TICKET_IDS = 100;

    private List<Long> ticketIds;
    private String status;
    private String priority;
    private Long agentId;
    private Long departmentId;

    public void validate() {
        if (ticketIds == null || ticketIds.isEmpty() || ticketIds.size() > MAX_TICKET_IDS) {
            throw new IllegalArgumentException("Provide between 1 and " + MAX_TICKET_IDS + " ticket IDs.");
        }
        if (ticketIds.stream().anyMatch(id -> id == null || id <= 0)
                || new HashSet<>(ticketIds).size() != ticketIds.size()) {
            throw new IllegalArgumentException("Ticket IDs must be positive and unique.");
        }
        if (agentId != null && agentId <= 0 || departmentId != null && departmentId <= 0) {
            throw new IllegalArgumentException("Replacement IDs must be positive.");
        }
        if (status != null && status.length() > 32 || priority != null && priority.length() > 16) {
            throw new IllegalArgumentException("Invalid status or priority.");
        }
        if ((status == null || status.isBlank()) && (priority == null || priority.isBlank())
                && agentId == null && departmentId == null) {
            throw new IllegalArgumentException("At least one bulk update is required.");
        }
    }
}
