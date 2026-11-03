package com.kuwy.helpdesk.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TicketReplyDto {
    private String body;
    private Boolean isPrivate = false;
    private Long senderUserId;
    private String senderEmail;
    private String senderName;
}
