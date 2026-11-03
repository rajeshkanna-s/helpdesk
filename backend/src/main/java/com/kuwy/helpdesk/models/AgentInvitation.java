package com.kuwy.helpdesk.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "agent_invitations")
@Getter
@Setter
@NoArgsConstructor
public class AgentInvitation {

    public enum InvitationStatus {
        PENDING,
        ACCEPTED,
        REVOKED,
        EXPIRED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_id", nullable = false)
    private Long companyId;

    @Column(name = "invited_by_user_id", nullable = false)
    private Long invitedByUserId;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(name = "role_id", nullable = false)
    private Long roleId;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InvitationStatus status = InvitationStatus.PENDING;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}

