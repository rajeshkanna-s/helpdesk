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
    @lombok.ToString.Exclude
    @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY)
    private String tempToken;
    @NotBlank
    @Size(max = 64)
    @lombok.ToString.Exclude
    @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY)
    private String code;
    private Boolean isBackupCode = false;
    private Boolean trustDevice30Days = false;
}
