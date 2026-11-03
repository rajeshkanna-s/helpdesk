package com.kuwy.helpdesk.dto;

import lombok.Data;

@Data
public class KbArticleDto {
    private Long id;
    private Long categoryId;
    private String categoryName;
    private String title;
    private String slug;
    private String contentHtml;
    private int viewCount;
    private int helpfulVotes;
}

