# IU-APMP (Integral University Academic Project Management Portal)

## What This Is

Integral University Academic Project Management Portal (IU-APMP v2.3.1) is a specialized web platform for students, faculty supervisors, project coordinators, and administrators in the Department of Computer Application. It centralizes and automates the entire academic final-year project lifecycle including team formation, supervisor allotment, project topic approval, student topic selection, milestone tracking, and supervisor evaluations.

## Core Value

Streamline and govern the academic project lifecycle with strict course isolation (BCA vs MCA), balanced faculty mentorship workload limits, and transparent real-time status reflection across all departmental stakeholders.

## Requirements

### Validated

- ✓ **RBAC**: Multi-role authentication & authorization (Admin, Coordinator, Supervisor, Student) with session security and first-login password resets — existing (v2.0.1)
- ✓ **COHORT**: Strict course segregation between BCA and MCA students, topics, and teams — existing (v2.0.1)
- ✓ **TEAMS**: Project team creation, roster management, capacity validation (BCA 2-5, MCA 1-2), and safe dissolution retaining student accounts — existing (v2.0.1)
- ✓ **SUPERVISOR-MGMT**: Dedicated Supervisor Management portal (`/supervisor-management`) with workload caps, reactive cards/table layout, and direct team-to-topic allotment — existing (v2.0.1)
- ✓ **TOPICS**: Supervisor topic proposals, Coordinator approval, sequential PUGID code generation, and interactive student topic selection with full tech stack visibility — existing (v2.0.1)
- ✓ **ONBOARDING**: High-performance multi-sheet Excel bulk onboarding with real-time SSE progress streaming and employee ID/enrollment credential generation — existing (v2.0.1)
- ✓ **CONFLICTS**: Enrollment number conflict detection and interactive resolution UI on Dashboard and User Management — existing (v2.0.1)
- ✓ **NOTIFS**: Real-time WebSocket notifications with persistent user inboxes — existing (v2.0.1)
- ✓ **TRACKING**: Student project progress dashboards, 5-phase milestones, and supervisor evaluations — existing (v2.0.1)
- ✓ **SEARCH-ENGINE**: Multi-word whitespace tokenized matching and sub-millisecond in-memory search indexing across 10 catalogs and modals — validated (v2.1.0)
- ✓ **DIRECT-TOPIC-ASSIGNMENT**: Admin & Coordinator direct topic authoring, auto-approval, and immediate faculty allotment — validated (v2.1.0)
- ✓ **NAV-REORG**: Reorganized sidebar navigation hierarchy with Project Management grouping and Account Settings — validated (v2.1.0)

- ✓ **BACKUP-RESTORE**: Upgrade backup export/import to include all 8 tables with topological foreign key insertion order, ZIP archive packaging, and pre-restore snapshots — validated (v2.2.0)
- ✓ **EXCEL-REPORTING**: Official 8-sheet master university Excel report generator (`.xlsx`) with natural TeamID cohort grouping, custom 8-column layout, and vertically merged team cells — validated (v2.3.1)
- ✓ **SUPERVISOR-CONFLICT-RESOLUTION**: Dual-action supervisor conflict detection and resolution modal (Option 1 clone with new PUGID vs Option 2 migrate) with atomic transactions, advisory locking, and accepted member precision — validated (v2.3.1)
- ✓ **DYNAMIC-TELEMETRY**: Real-time supervisor mentorship telemetry ratio (`Active Teams Allotted / Total Projects Submitted`) and dynamic workload capacity formula — validated (v2.3.0)
- ✓ **SUPERVISOR-MGMT-RBAC**: Strict Administrator and Coordinator governance over `/supervisor-management` and `/api/admin/supervisors-summary` — validated (v2.3.1)

### Future Goals (Next Milestones)

- [ ] **SERVER-SEC-REG**: Enforce server-side registration closure toggle in `/api/register` matching the client-side overlay — from Fixes_required.md
- [ ] **ACTIVITY-FEED**: Replace static mock activity list in `GET /api/activities` with dynamic database events — from Fixes_required.md
- [ ] **INPUT-SANITIZATION**: Add server-side HTML/XSS sanitization on user-submitted text fields (topic descriptions, feedback) — from Fixes_required.md
- [ ] **CONTROLLER-MODULARITY**: Extract business logic from Express route handlers into domain services for clean SOLID separation of concerns — from Fixes_required.md


### Out of Scope

- **Public Cloud Storage (S3 / GCS)** — Deployment is designed for self-contained institutional on-premise servers and LAN intranets with local filesystem storage.
- **Micro-Frontend Architecture** — A unified modular React SPA with Vite chunk splitting is simpler, easier to maintain, and meets all current performance needs.
- **External OAuth / Social Logins** — System relies strictly on official institutional credentials (Enrollment Numbers and Employee IDs).

## Context

- **Technical Environment**: React 18, Vite 6, Tailwind CSS, Radix UI, Express 4, Drizzle ORM, PostgreSQL (14+), Node.js v20+ ESM.
- **Institutional Context**: Integral University, Department of Computer Application. Manages 700+ students and 60+ faculty supervisors across BCA and MCA degree programs.
- **Documentation & History**: Detailed architectural evolution documented in `Fixes_required.md`, `README.md`, `AI_CONTEXT.md`, and evidence-backed codebase maps in `.planning/codebase/`.

## Constraints

- **Single-Source Database Config**: `DATABASE_URL` is the single source of truth; Drizzle ORM and Express session store must connect to the same PostgreSQL instance.
- **Role Constraints**: Maximum 5 allotted student teams per faculty supervisor.
- **Course Isolation**: BCA students and MCA students cannot share teams or select topics outside their registered course.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Drizzle ORM over Prisma | Zero-overhead, SQL-like query builder, seamless TypeScript inference, fast runtime | ✓ Good |
| Session-backed WebSockets | Eliminates identity spoofing by validating signed session cookies against PostgreSQL store | ✓ Good |
| Decoupled Supervisor Allotment | Allows student teams to form before selecting topics; supervisors assigned upon topic confirmation | ✓ Good |
| In-Memory Excel Ingestion | Processes 700+ student accounts in <1s with real-time SSE progress telemetry | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-06 after initialization*
