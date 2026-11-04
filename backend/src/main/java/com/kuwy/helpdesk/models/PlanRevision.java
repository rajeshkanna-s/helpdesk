package com.kuwy.helpdesk.models;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;
import java.time.Instant;

@Entity
@Immutable
@Table(name = "plan_revisions", uniqueConstraints = @UniqueConstraint(columnNames = {"code", "revision"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlanRevision {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, updatable = false, length = 30) private String code;
    @Column(nullable = false, updatable = false) private long revision;
    @Column(name = "snapshot_json", nullable = false, updatable = false, columnDefinition = "JSON") private String snapshotJson;
    @Column(name = "actor_user_id", updatable = false) private Long actorUserId;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;

    public PlanRevision(PlanDefinition plan, String snapshotJson) {
        code = plan.getCode();
        revision = plan.getRevision();
        this.snapshotJson = snapshotJson;
        actorUserId = plan.getUpdatedByUserId();
        createdAt = plan.getUpdatedAt();
    }
}
