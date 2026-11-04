package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "signup_challenges", uniqueConstraints = @UniqueConstraint(name = "uk_signup_challenge_email", columnNames = "email"))
@Getter @Setter @NoArgsConstructor
public class SignupChallenge {
    @Id @JdbcTypeCode(SqlTypes.CHAR) @Column(length = 36)
    private UUID id = UUID.randomUUID();
    @Column(nullable = false, length = 254)
    private String email;
    @JsonIgnore @Column(name = "code_hash", nullable = false, length = 255)
    private String codeHash;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;
    @Column(name = "consumed_at")
    private Instant consumedAt;
    @Column(nullable = false)
    private int attempts;
    @Version @JsonIgnore @Column(name = "row_version")
    private Long rowVersion;
}
