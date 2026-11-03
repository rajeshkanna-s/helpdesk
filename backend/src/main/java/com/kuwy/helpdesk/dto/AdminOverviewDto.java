package com.kuwy.helpdesk.dto;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Builder
public class AdminOverviewDto {
    private long totalCompanies;
    private long activeCompanies;
    private long suspendedCompanies;
    private long trialCompanies;
    private long paidCompanies;
    private long totalTickets;
    private long totalAgents;
    private double mrr;
    private double arr;
    private long ticketsToday;
    private double apiErrorRate;
    private int avgResponseTimeMs;
    private int failedPaymentsCount;
}
