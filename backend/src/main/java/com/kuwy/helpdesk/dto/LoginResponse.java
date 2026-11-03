package com.kuwy.helpdesk.dto;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Role;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Builder
public class LoginResponse {
    private String token;
    private Long userId;
    private String email;
    private String firstName;
    private String lastName;
    private String displayName;
    private String roleType;
    private String roleName;
    private CompanyInfo company;

    @Getter
    @Setter
    @Builder
    public static class CompanyInfo {
        private Long id;
        private String companyCode;
        private String name;
        private String subdomain;
        private String status;
        private String primaryColor;
    }
}
