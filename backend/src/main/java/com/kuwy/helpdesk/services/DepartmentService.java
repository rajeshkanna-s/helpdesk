package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.DepartmentCreateDto;
import com.kuwy.helpdesk.dto.DepartmentDetailDto;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.DepartmentRepository;
import com.kuwy.helpdesk.repositories.TicketRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final CompanyRepository companyRepository;
    private final UserRepository userRepository;
    private final TicketRepository ticketRepository;

    @Transactional(readOnly = true)
    public List<DepartmentDetailDto> getDepartmentsWithDetails(Long companyId) {
        List<Department> depts = departmentRepository.findByCompanyId(companyId);
        List<Ticket> allTickets = ticketRepository.findAll().stream()
                .filter(t -> t.getCompany().getId().equals(companyId))
                .collect(Collectors.toList());

        return depts.stream().map(d -> {
            long agentCount = userRepository.findByCompanyId(companyId).stream()
                    .filter(u -> u.getPrimaryDepartment() != null && u.getPrimaryDepartment().getId().equals(d.getId()))
                    .count();

            long openTickets = allTickets.stream()
                    .filter(t -> t.getDepartment() != null && t.getDepartment().getId().equals(d.getId()))
                    .filter(t -> t.getStatus() != Ticket.TicketStatus.RESOLVED && t.getStatus() != Ticket.TicketStatus.CLOSED)
                    .count();

            return DepartmentDetailDto.builder()
                    .id(d.getId())
                    .companyId(d.getCompany() != null ? d.getCompany().getId() : null)
                    .name(d.getName())
                    .code(d.getCode())
                    .description(d.getDescription())
                    .isActive(Boolean.TRUE.equals(d.getIsActive()))
                    .agentCount(agentCount)
                    .openTicketCount(openTickets)
                    .build();
        }).collect(Collectors.toList());
    }

    @Transactional
    public Department createDepartment(DepartmentCreateDto dto) {
        Company company = companyRepository.findById(dto.getCompanyId())
                .orElseThrow(() -> new RuntimeException("Company not found: " + dto.getCompanyId()));

        Department dept = new Department();
        dept.setCompany(company);
        dept.setName(dto.getName());
        dept.setCode(dto.getCode() != null ? dto.getCode().toUpperCase() : dto.getName().substring(0, Math.min(3, dto.getName().length())).toUpperCase());
        dept.setDescription(dto.getDescription());
        dept.setIsActive(true);

        return departmentRepository.save(dept);
    }

    @Transactional
    public Department toggleDepartmentActive(Long departmentId) {
        Department dept = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new RuntimeException("Department not found: " + departmentId));
        dept.setIsActive(!Boolean.TRUE.equals(dept.getIsActive()));
        return departmentRepository.save(dept);
    }
}
