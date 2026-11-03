package com.kuwy.helpdesk.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DepartmentDetailDto {
    private Long id;
    private Long companyId;
    private String name;
    private String code;
    private String description;
    private boolean isActive;
    private long agentCount;
    private long openTicketCount;
}
