package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.PublicPlan;
import com.kuwy.helpdesk.dto.PublicPlan.PlanUpdate;
import com.kuwy.helpdesk.services.PlanCatalogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/plans")
@RequiredArgsConstructor
public class PlanCatalogController {
    private final PlanCatalogService catalog;

    @GetMapping
    public List<PublicPlan> publicPlans() { return catalog.publicPlans(); }

    @GetMapping("/admin")
    public List<PublicPlan> adminPlans() { return catalog.adminPlans(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PublicPlan create(@RequestBody PlanUpdate update) {
        if (!Long.valueOf(0).equals(update.expectedRevision()))
            throw new IllegalArgumentException("New plans require expectedRevision 0.");
        return catalog.save(update);
    }

    @PutMapping("/{code}")
    public PublicPlan update(@PathVariable String code, @RequestBody PlanUpdate update) {
        if (!code.equals(update.code()) || update.expectedRevision() == null || update.expectedRevision() < 1)
            throw new IllegalArgumentException("Plan code must match the path and an existing revision is required.");
        return catalog.save(update);
    }
}
