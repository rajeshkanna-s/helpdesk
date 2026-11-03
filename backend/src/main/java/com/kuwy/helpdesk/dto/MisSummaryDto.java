package com.kuwy.helpdesk.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MisSummaryDto {
    private long totalTickets;
    private long openTickets;
    private long inProgressTickets;
    private long resolvedTickets;
    private long closedTickets;
    private long breachedTickets;
    private double slaCompliancePercentage;
    private double avgResolutionHours;
    private Map<String, Long> departmentBreakdown;
    private Map<String, Long> priorityBreakdown;
}
