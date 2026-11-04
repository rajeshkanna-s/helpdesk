package com.kuwy.helpdesk.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Verify2FaRequest {
    @NotBlank
    @Size(max = 128)
    private String tempToken;
    @NotBlank
    @Size(max = 64)
    private String code;
    private Boolean isBackupCode = false;
    private Boolean trustDevice30Days = false;
}
