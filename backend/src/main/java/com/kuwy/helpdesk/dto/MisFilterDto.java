package com.kuwy.helpdesk.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MisFilterDto {
    private Long companyId;
    private Long departmentId;
    private String status;
    private String priority;
    private String channel;
    private String slaStatus;
    private String search;
    private String dateRange; // TODAY, LAST_7_DAYS, LAST_30_DAYS, ALL_TIME
}
