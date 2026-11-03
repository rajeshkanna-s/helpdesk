package com.kuwy.helpdesk.dto;

import lombok.Data;

@Data
public class CustomerContactDto {
    private Long id;
    private String firstName;
    private String lastName;
    private String displayName;
    private String email;
    private String phone;
    private String organization;
    private Long accountId;
    private int totalTickets;
    private int openTickets;
    private String createdAt;
}
