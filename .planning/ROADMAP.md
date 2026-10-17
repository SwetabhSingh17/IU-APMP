# Roadmap: IU-APMP (Integral University Academic Project Management Portal)

## Overview

This roadmap defines the evolution cycle of the Integral University Academic Project Management Portal (IU-APMP v2.3.2). It tracks delivered capabilities across search engine indexing, A-Z backup/topological restore, multi-sheet Excel reporting, dual-action supervisor conflict resolution, dynamic telemetry, transactional atomicity, and ongoing architectural hardening.

## Completed Milestones

- [v2.1.0: Multi-Word Search & UI/UX Enhancements](milestones/v2.1.0-ROADMAP.md) (2 phases, 4 plans completed 2026-10-06)
- **v2.2.0: IU-APMP Institutional Rebranding, Complete A-Z Backup & Multi-Page Excel Export** (Completed 2026-10-07)
- **v2.3.0: Dual-Action Supervisor Conflict Resolution & Dynamic Mentorship Telemetry** (Completed 2026-10-11)
- **v2.3.1: Transactional Conflict Atomicity, Advisory PUGID Serialization & Governance Hardening** (Completed 2026-10-11)
- **v2.3.2: Excel Faculty EmpID Ordering, Dual-Membership Guard, Mobile Backfill & User Status Live Telemetry** (Completed 2026-10-14)

## Future Phases

- [x] **Phase 1: IU-APMP Renaming, A-Z Backup, Topological Restore & Multi-Page Excel Export** - Complete 8-table archive export, safe transactional restore, 8-sheet university Excel reporting, and IU-APMP project rebranding (login page unchanged)
- [ ] **Phase 2: Security Hardening & Registration Controls** - Enforce server-side registration locks and input sanitization on user submissions
- [ ] **Phase 3: Live Activity & Audit Trail** - Replace mock activity feeds with persistent departmental audit event streams
- [ ] **Phase 4: Architecture Modularity & Clean Services** - Decouple route handlers into domain services and clean up dead server instances

## Phase Details

### Phase 1: IU-APMP Renaming, A-Z Backup, Topological Restore & Multi-Page Excel Export

**Goal**: Deliver a 100% complete A-Z backup & restore system with foreign key dependency order, an official 8-sheet university Excel export, and standardize portal branding as IU-APMP (leaving login page untouched) with zero production data loss.
**Depends on**: Nothing (first phase)
**Requirements**: RENAME-01, BACKUP-01, BACKUP-02, BACKUP-03, BACKUP-04, EXCEL-01
**Success Criteria** (what must be TRUE):
  1. Project rebranded as IU-APMP (Integral University Academic Project Management Portal) across navigation, sidebar, titles, and metadata while strictly preserving `auth-page.tsx` untouched.
  2. Backup & Export button generates a complete archive (zip/folder) containing all 8 tables (`student_groups`, `users`, `student_group_members`, `project_topics`, `student_projects`, `project_assessments`, `project_milestones`, `notifications`), manifest with counts, and SQL insert dump, saving a copy in `database/backups/`.
  3. Import & Restore reconstructs the portal with exact fidelity in topological order (`groups` → `users` → `members` → `topics` → `projects` → `assessments` → `milestones` → `notifications`) inside an atomic transaction with automated pre-restore safety snapshot.
  4. PostgreSQL sequence counters are safely aligned past imported maximum IDs across all tables.
  5. Multi-Page Excel Export generates an official single `.xlsx` workbook containing 8 dedicated worksheets (including naturally sorted Student Details with merged team cohort cells) for departmental and university administrative reporting.
  6. All operations maintain 100% backward compatibility and zero disruption to the active running production database.

**Plans**: 4 plans

Plans:
- [x] 01-01: A-Z Complete Portal Backup Engine & Server Archive Packaging
- [x] 01-02: High-Fidelity Topological Restore Engine with Atomic Transaction & Pre-Restore Snapshot
- [x] 01-03: Multi-Sheet University Excel Report Generator & Project Renaming to IU-APMP (with Natural TeamID Cohort Alignment & Vertical Cell Merging)
- [x] 01-04: System Management UI Console Upgrade & Non-Destructive Test Suite

### Phase 2: Security Hardening & Registration Controls

**Goal**: Close registration bypass vectors and sanitize user text fields against XSS.
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. `POST /api/register` checks server-side registration open flag and returns 403 when registration is closed.
  2. User text inputs in topic proposals and feedback are sanitized before storage in PostgreSQL.

**Plans**: 2 plans

Plans:
- [ ] 02-01: Add server-side registration toggle middleware/check in `server/routes/auth.ts`
- [ ] 02-02: Implement text sanitization helper and integrate into topic and review endpoints

### Phase 3: Live Activity & Audit Trail

**Goal**: Deliver a transparent live audit and activity feed on the dashboard.
**Depends on**: Phase 2
**Requirements**: AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):
  1. `GET /api/activities` queries real recent records from PostgreSQL.
  2. Coordinators and Admins see live timestamped actions (topic approvals, supervisor allotments, default password resets).

**Plans**: 1 plan

Plans:
- [ ] 03-01: Implement dynamic activity aggregator in `server/routes/stats.ts`

### Phase 4: Architecture Modularity & Clean Services

**Goal**: Decouple Express route handlers into domain services following SOLID principles.
**Depends on**: Phase 3
**Requirements**: ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):
  1. Route handlers in `server/routes/` delegate complex business logic to dedicated services.
  2. Redundant `createServer(app)` call removed from `server/routes/index.ts`.

**Plans**: 2 plans

Plans:
- [ ] 04-01: Remove dead HTTP server instance in `server/routes/index.ts`
- [ ] 04-02: Extract topic and group business logic into modular service layers

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. IU-APMP Renaming, A-Z Backup, Topological Restore & Multi-Page Excel Export | 4/4 | Complete | 2026-10-07 |
| 2. Security Hardening & Registration Controls | 0/2 | Not started | - |
| 3. Live Activity & Audit Trail | 0/1 | Not started | - |
| 4. Architecture Modularity & Clean Services | 0/2 | Not started | - |

