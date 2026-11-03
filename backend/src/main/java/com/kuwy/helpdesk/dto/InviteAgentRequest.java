package com.kuwy.helpdesk.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class InviteAgentRequest {
    private String email;
    private String name;
    private Long roleId;
    private Long primaryDepartmentId;
}
