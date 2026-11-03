package com.kuwy.helpdesk.dto;

import lombok.Data;

@Data
public class SaveKbArticleRequest {
    private Long categoryId;
    private String title;
    private String contentHtml;
    private String slug;
    private String status;
}
