package com.kuwy.helpdesk.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MisTrackItemDto {
    private Long id;
    private String ticketNumber;
    private Long companyId;
    private String companyCode;
    private Long departmentId;
    private String departmentName;
    private String departmentCode;
    private String subject;
    private String requesterName;
    private String requesterEmail;
    private String assignedAgentName;
    private String status;
    private String priority;
    private String channel;
    private String slaStatus;
    private LocalDateTime createdAt;
    private LocalDateTime firstResponseDueAt;
    private LocalDateTime firstResponseAt;
    private LocalDateTime resolutionDueAt;
    private LocalDateTime resolvedAt;
    private Double turnaroundHours;
}
