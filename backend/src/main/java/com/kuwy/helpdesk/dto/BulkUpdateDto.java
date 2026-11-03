package com.kuwy.helpdesk.dto;

import lombok.Data;
import java.util.List;

@Data
public class BulkUpdateDto {
    private List<Long> ticketIds;
    private String status;
    private String priority;
    private Long agentId;
    private Long departmentId;
}

