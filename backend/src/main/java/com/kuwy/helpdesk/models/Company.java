package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "companies")
@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Company {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_code", nullable = false, unique = true, length = 50)
    private String companyCode;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true, length = 100)
    private String subdomain;

    @Column(name = "custom_domain")
    private String customDomain;

    @Column(name = "logo_url", length = 500)
    private String logoUrl;

    @Column(name = "primary_color", length = 20)
    private String primaryColor = "#0d6efd";

    @Column(length = 60)
    private String timezone = "Asia/Kolkata";

    @Column(name = "default_language", length = 10)
    private String defaultLanguage = "en";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CompanyStatus status = CompanyStatus.ACTIVE;

    @Column(name = "plan_name", length = 50)
    private String planName = "ENTERPRISE";

    @Column(name = "max_agents")
    private Integer maxAgents = 50;

    @Column(name = "legal_name")
    private String legalName;

    @Column(name = "support_email")
    private String supportEmail;

    @Column(name = "support_phone")
    private String supportPhone;

    @Column(name = "support_address")
    private String supportAddress;

    @Column(name = "business_hours_text")
    private String businessHoursText;

    @Column(name = "portal_name")
    private String portalName;

    @Column(name = "portal_welcome_message", columnDefinition = "TEXT")
    private String portalWelcomeMessage;

    @Column(name = "accent_color", length = 30)
    private String accentColor = "#6366f1";

    @Column(name = "powered_by_badge")
    private Boolean poweredByBadge = true;

    @Column(name = "custom_domain_status", length = 40)
    private String customDomainStatus = "ACTIVE";

    @Column(name = "settings_json", columnDefinition = "LONGTEXT")
    private String settingsJson;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;

    public enum CompanyStatus {
        ACTIVE, TRIAL, SUSPENDED, INACTIVE
    }
}
