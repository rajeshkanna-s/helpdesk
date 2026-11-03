package com.kuwy.helpdesk.dto;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Builder
public class AgentInvitationDto {
    private Long id;
    private String email;
    private String name;
    private Long roleId;
    private String roleName;
    private String inviterName;
    private String status;
    private LocalDateTime expiresAt;
    private LocalDateTime createdAt;
}

