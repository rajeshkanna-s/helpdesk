package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "contacts")
@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Contact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private CustomerAccount account;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", length = 100)
    private String lastName;

    @Column(nullable = false)
    private String email;

    @Column(length = 30)
    private String phone;

    @Column(name = "organization_name", length = 150)
    private String organizationName;

    @Column(name = "time_zone", nullable = false, length = 64, columnDefinition = "VARCHAR(64) DEFAULT 'UTC'")
    private String timeZone = "UTC";

    @Column(nullable = false, length = 10, columnDefinition = "VARCHAR(10) DEFAULT 'en'")
    private String language = "en";

    @Column(name = "notify_replies", nullable = false, columnDefinition = "BOOLEAN DEFAULT TRUE")
    private Boolean notifyReplies = true;

    @Column(name = "notify_resolved", nullable = false, columnDefinition = "BOOLEAN DEFAULT TRUE")
    private Boolean notifyResolved = true;

    @Column(name = "notify_surveys", nullable = false, columnDefinition = "BOOLEAN DEFAULT TRUE")
    private Boolean notifySurveys = true;

    @Column(name = "is_portal_user", nullable = false)
    private Boolean isPortalUser = false;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @Column(name = "auth_version", nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private Long authVersion = 0L;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @Column(name = "is_blocked", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private Boolean isBlocked = false;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;
}
