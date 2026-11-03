package com.kuwy.helpdesk.dto;

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

    // 2FA Challenge fields
    private Boolean twoFactorRequired;
    private String tempToken;
    private String maskedEmail;

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
