# Technical Task List

## Phase 1 — Project Setup

1. [ ] Create the Astro project structure and root configuration files.  
   **Plan Item:** P1  
   **Requirements:** R3, R4, R7
2. [ ] Configure npm scripts and ignore rules for Astro development and builds.  
   **Plan Item:** P1  
   **Requirements:** R3, R7
3. [ ] Create base source folders for layouts, components, pages, styles, and public browser scripts.  
   **Plan Item:** P1  
   **Requirements:** R3, R7

## Phase 2 — Shared UI Foundation

4. [ ] Implement a shared base layout with metadata, header, footer, and global stylesheet loading.  
   **Plan Item:** P2  
   **Requirements:** R1, R2, R3, R4
5. [ ] Build the reusable `Header` component with navigation for the home and converter pages.  
   **Plan Item:** P2  
   **Requirements:** R1, R2, R3
6. [ ] Build the reusable `Footer` component with consistent branding and links.  
   **Plan Item:** P2  
   **Requirements:** R2, R3, R4
7. [ ] Create shared visual styles based on the original HTML palette, typography, spacing, and panel patterns.  
   **Plan Item:** P3  
   **Requirements:** R3, R4
8. [ ] Implement reusable `Hero`, `Sidebar`, and generic content panel components.  
   **Plan Item:** P3  
   **Requirements:** R2, R3, R4, R6

## Phase 3 — Page Implementation

9. [ ] Build the `/` landing page using shared components and consistent calls to action.  
   **Plan Item:** P4  
   **Requirements:** R1, R3, R4
10. [ ] Build the `/excel-to-qbo-converter` page using the original HTML content as the migration source.  
    **Plan Item:** P5  
    **Requirements:** R2, R4, R6
11. [ ] Preserve the original converter page structure, including upload, mapping, preview, and download sections.  
    **Plan Item:** P5  
    **Requirements:** R2, R5, R6

## Phase 4 — Client-Side Converter Logic

12. [ ] Move spreadsheet parsing and QBO generation logic into a browser script served by Astro.  
    **Plan Item:** P6  
    **Requirements:** R5
13. [ ] Reconnect file upload, drag-and-drop, mapping, preview, and conversion event handlers.  
    **Plan Item:** P6  
    **Requirements:** R5, R6
14. [ ] Preserve client-side validation and user-facing success/error feedback for invalid files and missing mappings.  
    **Plan Item:** P6  
    **Requirements:** R4, R5, R6

## Phase 5 — Documentation and Validation

15. [ ] Write `docs/requirements.md` with user stories and acceptance criteria.  
    **Plan Item:** P7  
    **Requirements:** R7
16. [ ] Write `docs/plan.md` with priorities and requirement traceability.  
    **Plan Item:** P7  
    **Requirements:** R7
17. [ ] Write `docs/tasks.md` as a phased checklist linked to requirements and plan items.  
    **Plan Item:** P7  
    **Requirements:** R7
18. [ ] Add concise task-checklist maintenance guidance in the guidelines file.  
    **Plan Item:** P7  
    **Requirements:** R7
19. [ ] Run Astro validation/build commands and resolve any issues found.  
    **Plan Item:** P8  
    **Requirements:** R1, R2, R4, R5, R7