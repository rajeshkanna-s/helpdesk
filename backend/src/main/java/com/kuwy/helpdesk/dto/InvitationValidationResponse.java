package com.kuwy.helpdesk.dto;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Builder
public class InvitationValidationResponse {
    private boolean valid;
    private String status; // VALID, EXPIRED, USED, REVOKED, NOT_FOUND, LIMIT_REACHED
    private String message;
    private String email;
    private String name;
    private String companyName;
    private String companySubdomain;
    private String companyLogo;
    private String roleName;
    private String inviterName;
}

