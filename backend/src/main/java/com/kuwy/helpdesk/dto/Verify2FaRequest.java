package com.kuwy.helpdesk.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Verify2FaRequest {
    private String tempToken;
    private String code;
    private Boolean isBackupCode = false;
    private Boolean trustDevice30Days = false;
}

