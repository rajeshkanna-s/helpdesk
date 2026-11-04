package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.SignupChallenge;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface SignupChallengeRepository extends JpaRepository<SignupChallenge, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from SignupChallenge c where c.email = :email")
    Optional<SignupChallenge> lockByEmail(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from SignupChallenge c where c.id = :id")
    Optional<SignupChallenge> lockById(@Param("id") UUID id);
}
