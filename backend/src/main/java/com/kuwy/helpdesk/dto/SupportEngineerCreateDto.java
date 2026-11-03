package com.kuwy.helpdesk.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupportEngineerCreateDto {
    private Long companyId;
    private Long departmentId;
    private String firstName;
    private String lastName;
    private String email;
    private String password;
    private String phone;
    private String specialization;
    private String roleType; // AGENT, COMPANY_ADMIN
}
