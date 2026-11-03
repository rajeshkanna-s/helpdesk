package com.kuwy.helpdesk.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class AcceptInvitationRequest {
    private String token;
    private String name;
    private String password;
    private Boolean agreedToTerms = false;
}

