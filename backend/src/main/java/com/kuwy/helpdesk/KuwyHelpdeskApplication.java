package com.kuwy.helpdesk;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableJpaAuditing
@EnableScheduling
public class KuwyHelpdeskApplication {

    public static void main(String[] args) {
        SpringApplication.run(KuwyHelpdeskApplication.class, args);
        System.out.println("=================================================================");
        System.out.println("  KUWY HELPDESK BACKEND STARTED SUCCESSFULLY ON PORT 8080");
        System.out.println("  Multi-Tenant Mode: ACTIVE | Database: kuwy_helpdesk (MySQL 8.4)");
        System.out.println("=================================================================");
    }
}
