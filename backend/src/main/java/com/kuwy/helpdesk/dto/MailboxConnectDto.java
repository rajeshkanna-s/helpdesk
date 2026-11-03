package com.kuwy.helpdesk.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class MailboxConnectDto {
    private Long companyId;
    private Long departmentId;
    private String mailboxName;
    private String emailAddress;
    private String msTenantId;
    private String msClientId;
    private String msClientSecret;
}
