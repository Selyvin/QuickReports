# Implementation Plan

## Overview

This plan implements the Astro migration defined in `docs/requirements.md`. Each item maps directly to one or more requirements and is grouped by concern so the work can be executed incrementally while preserving the original converter behavior.

## Plan Items

### P1. Establish Astro project structure

- **Priority:** High
- **Requirements:** R3, R4, R7
- Create the Astro project structure at the repository root.
- Configure core project files such as `package.json`, `astro.config.mjs`, `tsconfig.json`, and basic ignore rules.
- Create page, layout, component, public asset, and style directories needed for a maintainable Astro site.

### P2. Build shared layout and navigation

- **Priority:** High
- **Requirements:** R1, R2, R3, R4
- Implement a base layout that wraps all pages with shared metadata, header, footer, and global styles.
- Create a reusable header with navigation for the main page and converter page.
- Create a reusable footer with consistent branding and page links.

### P3. Extract reusable visual components

- **Priority:** High
- **Requirements:** R2, R3, R4, R6
- Create reusable components for Hero, Sidebar, and generic content panels.
- Adapt the original HTML styling into shared CSS tokens and component-friendly classes.
- Ensure reusable components support both the landing page and converter page without duplicating structure.

### P4. Implement the main landing page

- **Priority:** Medium
- **Requirements:** R1, R3, R4
- Build `/` as a polished entry page using the shared layout and components.
- Add overview content, page links, and calls to action that route users to the converter.
- Keep the page visually aligned with the converter page.

### P5. Implement the converter page UI

- **Priority:** High
- **Requirements:** R2, R4, R5, R6
- Build `/excel-to-qbo-converter` using the shared layout plus converter-specific content.
- Preserve the original page sections: hero, sidebar guidance, upload area, mapping form, preview table, and conversion action.
- Keep the page responsive and preserve clear state feedback.

### P6. Migrate the client-side converter behavior

- **Priority:** High
- **Requirements:** R2, R5, R6
- Move the spreadsheet parsing and QBO generation logic into a browser script served by the Astro app.
- Ensure upload, mapping, preview, validation, error handling, and download behavior continue to work.
- Keep processing client-side and avoid server persistence.

### P7. Produce traceable documentation artifacts

- **Priority:** Medium
- **Requirements:** R7
- Write a requirements document, implementation plan, and phased task checklist.
- Add concise guidelines explaining how to maintain the task checklist and traceability links.

### P8. Validate the migrated project

- **Priority:** High
- **Requirements:** R1, R2, R4, R5, R7
- Run Astro validation/build commands to confirm the site compiles.
- Review for any obvious structural or syntax issues after migration.
- Confirm the documentation files exist and align with the implemented scope.