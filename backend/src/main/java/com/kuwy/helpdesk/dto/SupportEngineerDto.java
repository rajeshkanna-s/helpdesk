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
public class SupportEngineerDto {
    private Long id;
    private Long companyId;
    private String companyCode;
    private Long departmentId;
    private String departmentName;
    private String departmentCode;
    private String firstName;
    private String lastName;
    private String displayName;
    private String email;
    private String phone;
    private String roleType;
    private String roleName;
    private boolean isActive;
    private long activeTicketsCount;
    private LocalDateTime createdAt;
}
