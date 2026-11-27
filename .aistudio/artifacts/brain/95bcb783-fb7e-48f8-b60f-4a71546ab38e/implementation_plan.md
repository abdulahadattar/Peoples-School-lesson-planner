# Unify Portal Dropdowns & Menus Implementation Plan

## Overview
Unify all select fields, datalists, and floating action menus across the portal into a polished, accessible, and scroll-stable component system (`SelectField`, `DropdownMenu`, and `ActionMenu`) adhering to Apple-grade clean card aesthetics with zero unexpected page jumping or list scrolling.

## User Review & Critical Decisions
> [!IMPORTANT]
> - **Unified Components**: All select controls, table filters, settings modals (`ClassEditorModal` teacher datalist), and export action menus will share a single robust popover and placement engine.
> - **Scroll Stability**: Placement engine (`useDropdownPlacement`) will calculate fixed coordinates without stealing scroll focus or shifting ancestor containers.

## 1. Technical Architecture & Strategy
1. **Refine `useDropdownPlacement` & `SelectDropdownMenu`**:
   - Prevent parent window scroll stealing when opening dropdowns.
   - Standardize animation (`animate-scaleIn`), glass surface tokens, and consistent max-height with clean custom scrollbars.
2. **Replace Native/Fallback Datalists**:
   - Replace `<datalist>` in `ClassEditorModal` and other settings forms with `SelectField` or a reusable searchable combo dropdown so teachers experience consistent styling everywhere.
3. **Unify Action Menus**:
   - Ensure `SpreadsheetExportMenu` and other action popovers use the same portal popover backdrop and styling as `SelectField`.

## 2. Verification Plan
- Run unit test suite (`npm run test:unit`) and compile (`compile_applet`).
- Verify dropdown interaction in headless Chromium (`playwright-cli`).
