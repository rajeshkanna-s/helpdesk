---
name: inspo-uiux
description: Guide for utilizing the Inspo MCP server (Nutlope/inspo) to elevate UI/UX design with real-world website design systems, component patterns, and palettes.
---

# Inspo MCP: UI/UX Design System Guide

The **Inspo MCP** server ([Nutlope/inspo](https://github.com/Nutlope/inspo)) provides access to a curated archive of over 2,300+ captured pages across 830+ production websites, their extracted design systems (`DESIGN.md`), and canonical UI component references.

## Configured MCP Endpoints

Inspo MCP is configured and active in Antigravity via:
- **Streamable HTTP Endpoint:** `https://inspomcp.dev/api/mcp`
- **Local Stdio Command:** `npx -y inspo-mcp`
- **Config Files:**
  - Workspace: `.agents/mcp_config.json` & `.agent/mcp_config.json`
  - Global: `~/.gemini/config/mcp_config.json` & `~/.gemini/antigravity-ide/mcp_config.json`
  - Client IDEs: `~/.cursor/mcp.json` & Claude Desktop config

## Available Inspo MCP Tools

| Tool | Purpose | Use Case |
| :--- | :--- | :--- |
| `search_screens` | Query real-world website designs by category, keyword, or vibe. | Search for "helpdesk dashboard", "ticket creation modal", "status tracker", "SaaS pricing table". |
| `find_components` | Locate real-world reference implementations for specific component types. | Heroes, pricing grids, ticket filters, timeline conversation views, modals, navigation bars, footers. |
| `get_design_system` | Retrieve extracted `DESIGN.md` for a reference site. | Extract semantic color palettes, type ramps, spacing scale, CSS variables, and layout constraints. |
| `find_by_color` | Find sites using specific hex color palettes (OKLAB distance). | Find design systems complementary to Kuwy's primary `#0d6efd` blue and neutral slates. |
| `find_similar` | Find nearest design neighbors via semantic embeddings. | Discover layouts with similar visual hierarchy and density. |
| `compare` | Cross-analyze 2 to 4 captured sites. | Establish consistent typography, padding rhythms, and component styling. |

## Application to Kuwy HelpDesk
Use Inspo to refine and elevate:
1. **Agent & Admin Workspace:** High-density keyboard-friendly layouts, collapsible sidebars, multi-attribute ticket filter bars, and quick reply macros.
2. **Customer Portal:** Clean public-facing ticket tracking timelines, search heroes, and category cards.
3. **Admin Settings Console:** Clear categorization, sticky save action footers, and accessible configuration inputs.
