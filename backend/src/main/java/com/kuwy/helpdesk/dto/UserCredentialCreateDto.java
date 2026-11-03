package com.kuwy.helpdesk.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class UserCredentialCreateDto {
    private Long companyId;
    private String email;
    private String password;
    private String firstName;
    private String lastName;
    private String phone;
    private String roleType; // "COMPANY_ADMIN", "AGENT"
    private Long departmentId;
}
