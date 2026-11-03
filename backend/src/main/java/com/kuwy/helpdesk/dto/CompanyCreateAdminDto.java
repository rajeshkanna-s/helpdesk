package com.kuwy.helpdesk.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class CompanyCreateAdminDto {
    private String companyCode;
    private String name;
    private String subdomain;
    private String customDomain;
    private String planName;
    private Integer maxAgents;
    private String primaryColor;

    // Initial Company Administrator Credentials created right from the Admin Portal!
    private String adminFirstName;
    private String adminLastName;
    private String adminEmail;
    private String adminPassword;
    private String adminPhone;
}
