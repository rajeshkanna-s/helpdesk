package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByCompanyIdAndEmail(Long companyId, String email);
    Optional<User> findByEmail(String email);
    List<User> findByCompanyIdAndIsActiveTrue(Long companyId);
    List<User> findByCompanyId(Long companyId);
    long countByCompanyId(Long companyId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.company.id = :companyId AND u.email = :email")
    Optional<User> findForAuthenticationByCompanyAndEmail(@Param("companyId") Long companyId,
                                                        @Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.email = :email")
    List<User> findForAuthenticationByEmail(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.id = :id")
    Optional<User> findForAuthenticationById(@Param("id") Long id);

    @Query("SELECT COUNT(u) FROM User u WHERE u.company.id = :companyId AND u.isActive = true")
    long countByCompanyIdAndIsActiveTrue(@Param("companyId") Long companyId);
}
