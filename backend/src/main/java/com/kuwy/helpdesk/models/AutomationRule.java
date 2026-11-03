package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "automation_rules")
@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class AutomationRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    @JsonIgnore
    private Company company;

    @Column(nullable = false, length = 150)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_trigger", nullable = false)
    private EventTrigger eventTrigger = EventTrigger.TICKET_CREATED;

    @Column(name = "condition_json", columnDefinition = "JSON")
    private String conditionJson;

    @Column(name = "action_json", columnDefinition = "JSON")
    private String actionJson;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "priority_order", nullable = false)
    private Integer priorityOrder = 10;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;

    public enum EventTrigger {
        TICKET_CREATED, TICKET_UPDATED, CUSTOMER_REPLIED, SLA_BREACHED, TIME_INACTIVE
    }
}

