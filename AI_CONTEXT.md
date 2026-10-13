# IU-APMP (Integral University Academic Project Management Portal) - AI Context

## Purpose
This document provides comprehensive context about the APMS project. It is intended to be read by LLMs and AI assistants to quickly understand the project's architecture, technologies, data flow, and workflows, avoiding the need to explore every file.

---

## 📋 Table of Contents

- [1. Project Overview & Core Workflows](#1-project-overview--core-workflows)
- [2. Technology Stack](#2-technology-stack)
- [3. Project Structure](#3-project-structure)
- [4. Database Schema (Drizzle ORM)](#4-database-schema-drizzle-orm)
- [5. Real-Time Notification System & Routing Logic](#5-real-time-notification-system--routing-logic)
- [6. Architectural Patterns & Guidelines](#6-architectural-patterns--guidelines)
- [7. Access Control (RBAC)](#7-access-control-rbac)

---

## 1. Project Overview & Core Workflows

APMS is a comprehensive web-based project management system for educational institutions. It streamlines project topic approval, project team formation, supervisor mentoring, and progress tracking.

### Core Workflows:

1. **Topic Proposals & Student Topic Confirmation**: 
   - **BCA**: Supervisors submit project topics. Coordinators review and approve them. Students then select from the approved pool. An `AlertDialog` confirmation modal prompts students before selection is finalized, warning that topic selection is irreversible and automatically binds their entire project team.
   - **MCA**: Coordinators assign Supervisors to Students. MCA Students propose multiple topics directly to their assigned Supervisor. Supervisors use a dedicated "Student Suggestions" tab to review, endorse, or reject topics. Once endorsed by the Supervisor and approved by the Coordinator/Admin, the project status automatically transitions to active (Auto-Project Assignment).

2. **Project Teams & Dedicated Team Management Portal (`/team-management`)**:
   - Students form groups, invite peers, and select approved topics. Strict course-based size limits are enforced: BCA teams must have 2 to 5 members, while MCA teams must have 1 to 2 members. Admins and Coordinators have exclusive authority to create single-member BCA teams and manage team members globally. Students and Supervisors do not have access to modify team rosters or leave teams; only Administrators and Coordinators can add, edit, or remove team members.
   - **Dedicated Team Management Console (`/team-management`)**: Admins and Coordinators have a centralized portal with five distinct categorization tabs:
     - `All Teams`: Complete directory of student project teams with live count badges.
     - `Pending Topics`: Teams that have not yet selected a project topic.
     - `Assigned Topics`: Teams with an active, confirmed project topic.
     - `With Supervisor`: Teams with an allotted faculty mentor.
     - `Without Supervisor`: Teams awaiting supervisor allotment (post topic selection).
   - Features real-time search across team names, descriptions, member names, enrollment numbers, supervisor names, and topic codes/titles, plus global course filtering (BCA/MCA).
   - **Administrative Operations**:
     - *Edit Team Details (`PATCH /api/student-groups/:groupId`)*: Update team name, description, and course context.
     - *Manage Members*: Add students by enrollment number or user ID (`POST /api/student-groups/:groupId/members`) with course consistency and capacity guards (BCA max 5, MCA max 2); remove individual members (`DELETE /api/student-groups/:groupId/members/:userId`) with account preservation.
     - *Safe Team Dissolution (`DELETE /api/student-groups/:groupId`)*: Dissolves the team while **preserving student accounts 100% intact** (unlinks `users.groupId`, cleans up project references, notifies members, and frees students to join or form new teams). Team deletion is also accessible via `/manage-project` cards with safety confirmation dialogs.

3. **Decoupled & Optional Supervisor Allotment**:
   - Reflecting institutional academic procedures, faculty supervisors are officially allotted to student teams when a project topic is chosen.
   - Supervisor selection during team creation (both on the student portal `/student-groups` and coordinator/admin dialogs) is optional with a default `"None (Allotted after topic selection)"` fallback.
   - Backend `POST /api/student-groups` gracefully stores `supervisorId: null` when not specified, and `PATCH /api/student-groups/:groupId/supervisor` supports assigning or unassigning supervisors (`supervisorId: null`).

4. **Supervisor Dedicated Project View ("My Topics & Teams")**: Supervisors navigating to `/projects` are given an isolated, focused portal showing only their submitted topics, live allotment status (`Picked` vs `Available`), PUGID codes, course, and allotted team rosters with enrollment numbers.

5. **Manage Project (Pending & Assigned Tabs + Real-Time Supervisor Search)**: Admins and Coordinators view all project teams categorized into "Pending" (teams without an allotted topic) and "Assigned" tabs with live count badges. The Change Supervisor dialog features a high-performance, real-time search input filtering across 60+ faculty supervisors by name, title prefix, department, designation, and email. Includes direct team deletion with safety confirmation.

6. **Course Segregation**: The system strictly segregates operations based on the Student's course (BCA or MCA). Students are isolated to their course context, while Admins, Coordinators, and Supervisors use a global UI `CourseFilterContext` toggle to switch contexts. Course filtering across users, groups, and topics employs case-insensitive matching (`UPPER(course)`) and includes member-level affiliations while preserving administrative visibility.

7. **Administration & One-Click Default Password Reset**: Admins and Coordinators manage users with full roster visibility (`limit=all`), role segmentation, and one-click default password resets (`POST /api/admin/users/:id/reset-password`). Students reset to their enrollment number, supervisors to their employee ID, with `forcePasswordReset: true` enforced on next login. Strict RBAC prevents Coordinators from resetting Admin/Coordinator accounts (`FORBIDDEN_TARGET_STAFF`), and all staff resets notify Administrators.

8. **Bulk Excel Onboarding, Real-Time Progress & First-Login Security**: Coordinators and Admins can bulk-provision cohorts from multi-sheet Excel files with live SSE progress streaming (tracking network upload, multi-sheet parsing, cryptographic account batching, and team formation). Built with an atomic progress state and native UI elements to eliminate React hook dispatcher desynchronization. The system automatically provisions accounts with initial passwords set to their identifier, forms project teams by `projectTeamId`, and sets `forcePasswordReset = true`. A non-dismissible modal and backend security interceptor enforce a mandatory password change on first login before operational APIs are accessible.

9. **Institutional Branding & Registration Gate**: Features official institutional branding (`Department_Logo.png`), standardized University typography headers, creator attributions, and a registration closed overlay on the authentication screen (`IS_REGISTRATION_OPEN = false`).

10. **Authentication Route Consolidation & Password Migration**: All user mutation routes (`POST`, `PATCH`, `DELETE`) are consolidated into `server/routes/admin.ts`. Legacy plaintext passwords are automatically upgraded to scrypt hashes on login, and standardized machine-readable error codes (`USER_NOT_FOUND`, `INVALID_PASSWORD`, `ACCOUNT_DEACTIVATED`, etc.) provide clean telemetry.

11. **Enrollment Conflict Detection & Interactive Resolution UI**: Multiple students erroneously assigned the same university enrollment number are automatically detected via `GET /api/admin/enrollment-conflicts`. Both the main Dashboard and `/user-management` display alert cards with live conflict metrics. In `/user-management`, conflicted students are visually highlighted with amber accents, given a dedicated "Conflicts" tab with inline resolution, and supported by a resolution modal (`POST /api/admin/resolve-enrollment-conflict`) that safely updates both enrollment numbers and login credentials without data loss.

12. **Project Topic Change & Notification Dispatch**: Admins and Coordinators can change or assign project topics for groups directly from `/manage-project` cards using a real-time topic picker. Updates `student_groups.projectTopicId` via `PATCH /api/student-groups/:groupId/topic` and dispatches automated notifications to all team members.

13. **Student Contact Numbers**: Student mobile phone numbers are backfilled and exposed across Admin, Coordinator, and Supervisor interfaces (team management, project tables, user management, and evaluation sheets).

14. **Tentative Supervisor Nomenclature**: Supervisor labels prior to final topic confirmation are explicitly designated as "Tentative Supervisor" on `/manage-project` to prevent student/faculty ambiguity during the team formation stage.

15. **Dedicated Supervisor Management Portal (`/supervisor-management`)**:
    - Centralized administrative console for Administrators and Coordinators to govern faculty supervisors, review topic submissions, and manage team allotments.
    - **Backend Endpoints**: `GET /api/admin/supervisors-summary` (aggregates supervisor profiles, topics, assigned teams, and mentorship metrics), `PUT /api/topics/:id` (topic status and metadata updates by admins), `DELETE /api/student-groups/:groupId/topic` (safe topic unassignment).
    - **Direct Specific Group Topic Allotment**: Displays all submitted project topics directly under each supervisor with associated student group details (team name, ID, member count, member list with enrollment numbers). Provides modal dialog to assign specific student teams directly to supervisor topics (`PATCH /api/student-groups/:groupId/topic`), along with change and unassign operations that preserve student group and account records.
    - **Fully Reactive Multi-Mode Layout**: Default responsive **Cards View** reflows smoothly on all screen widths with View, Edit, and Manage Topics actions permanently accessible in the supervisor header (no horizontal scrollbar or boundary clipping). Includes a **Table View Toggle** with pinned sticky right actions for users preferring tabular format.
    - **Workload Governance**: Tracks 5-team mentorship caps, visual capacity progress bars, student counts, and status indicators (`available`, `optimal`, `high`, `maxed`).

16. **Synchronized Project Topic & Supervisor Reflection**: Ensures project topic assignments or changes made by Administrators or Coordinators reflect immediately everywhere across Student accounts (Dashboard, Projects page, Team page) and Supervisor accounts (Evaluations, "My Topics & Teams"). Dynamic supervisor attribution prioritizes assigned team mentors over topic submitters.

17. **Full Project Technology Stack Visibility**: Topic selection cards and project detail dashboards display full technology stacks as flexible badges with word-break wrapping, eliminating single-line ellipsis truncations (`line-clamp-1`) so students can thoroughly evaluate project tech requirements before selection.

18. **Multi-Word Search Engine & In-Memory Indexing (`client/src/lib/search-index.ts`)**:
    - Resolves multi-word search query handling where words after spaces were previously ignored.
    - Tokenizes queries on whitespace into discrete lowercase terms with trailing-whitespace typing tolerance.
    - Generates multi-attribute search documents aggregating titles, codes, descriptions, technologies, member names, and supervisors.
    - Provides high-performance in-memory caching and sub-millisecond retrieval (0.21ms benchmark across 1,000 items) across 10 client pages and catalogs.
    - Matches server-side whitespace tokenization in `searchProjects` (`server/db-storage.ts`).

19. **Admin & Coordinator Direct Topic Creation with Faculty Assignment (`/approve-topics`)**:
    - Dedicated creation modal on the Approve Topics page for Administrators and Coordinators.
    - Features a faculty supervisor dropdown selector populated with registered faculty members.
    - Accepts all standard topic parameters (Title, Course, Category, Technologies, Complexity, Prerequisites, Description).
    - Directly saves the topic as already **Approved** and assigned to the selected faculty supervisor (`POST /api/topics/direct`), auto-generating sequential PUGID codes (`PUGID26xxx`) and dispatching instant notifications to the assigned faculty member.

20. **Reorganized Navigation Pane Hierarchy**:
    - Sidebar navigation header "Main Navigation" updated to "Navigation".
    - "Manage Project" updated to "Project Management" and grouped under the "Management" section alongside User Management, Team Management, and Supervisor Management.
    - "Setting" updated to "Account Setting".

21. **Dual-Action Supervisor Conflict Resolution System**:
    - **Detection**: `GET /api/admin/supervisor-conflicts` detects teams where the assigned faculty mentor (`student_groups.supervisorId`) differs from the project topic author (`project_topics.supervisorId`).
    - **Resolution**: `POST /api/admin/supervisor-conflicts/:groupId/resolve` supports two administrative resolution pathways:
      - `copy`: Clones the original project topic for the new supervisor with a generated institutional code (`PUGID26xxx`), re-allots the team to the clone (`isAssigned: true`), and frees the previous supervisor's original topic (`isAssigned: false`) for other student groups.
      - `migrate`: Transfers topic authorship (`supervisorId` on `project_topics`) directly to the new supervisor.
    - **Transaction Atomicity & Advisory Locking**: Both resolution pathways are wrapped in atomic database transactions (`db.transaction(async (tx) => { ... })`). PUGID generation is serialized using PostgreSQL transaction-level advisory locking (`SELECT pg_advisory_xact_lock(26001)`), completely preventing duplicate topic code allocation under concurrency. Roster member retrieval is queried strictly from `student_group_members` where `status = 'accepted'`, and all notification dispatches are deferred until post-commit.
    - **UI**: Interactive resolution modal (`client/src/components/admin/supervisor-conflict-modal.tsx`) and high-visibility warning banners on the Admin Dashboard and Supervisor Management page.

22. **Dynamic Supervisor Telemetry Ratio & Workload Capacity Formulation**:
    - **Metric**: Displays `Active Teams Allotted / Total Projects Submitted` (e.g., `5/6 Teams (High)`).
    - **Calculation**: Computes faculty workload relative to submitted proposals ($C$): $0 \to$ `available`, $\ge C \to$ `maxed`, $\ge \lceil C \times 0.7 \rceil \to$ `high`, else `optimal`.
    - **Cache Invalidation**: Cross-page mutations in `/team-management` and `/manage-project` automatically invalidate `/api/admin/supervisors-summary` and `/api/admin/supervisor-conflicts`.

23. **Supervisor Governance & Strict RBAC Enforcement**:
    - `/supervisor-management` and the summary aggregation endpoint `GET /api/admin/supervisors-summary` are strictly restricted to `Admin` and `Coordinator` roles to protect comprehensive faculty telemetry and student group rosters.
    - Faculty supervisors manage their submitted topics, review allotment statuses, and inspect assigned student teams through their dedicated `/projects` ("My Topics & Teams") portal.

24. **Multi-Sheet University Excel Reporting & Aligned Student Details Layout (`/api/admin/export-excel`)**:
    - Generates an official 8-sheet master Excel workbook (`.xlsx`) via `generateUniversityExcelReport()` in `server/db-storage.ts` using ExcelJS.
    - **Sheet 2: Student Details**: Formats the student directory with the exact standard 8 columns: `SNo.`, `TeamID`, `Enrollment`, `Student Name`, `Mobile No.`, `Email Id`, `Project`, and `Allotment`.
    - **Natural Team ID Sorting**: Groups students strictly by Team ID in natural alphanumeric order (`A-01` before `A-02` before `A-10`, followed by `B-01`, etc.), displaying complete student team rosters consecutively with team leaders first.
    - **Vertical Cell Merging**: Applies multi-row vertical cell merging across `TeamID` (bold, centered), `Project` (centered, text-wrapped), and `Allotment` (centered, multi-line wrapped supervisor name, designation, and contact details) for each team cohort, while maintaining sequential 1-based numbering in `SNo.`.
    - Completely read-only with non-blocking database queries and zero data mutations.

---

## 2. Technology Stack

- **Frontend**: React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, wouter (routing), TanStack Query, Framer Motion, Recharts.
- **Backend**: Node.js, Express.js.
- **Database**: PostgreSQL (Neon Serverless / Vercel Postgres compatible).
- **ORM & Validation**: Drizzle ORM, Zod, drizzle-zod.
- **File Parsing & Generation**: ExcelJS (multi-sheet workbook support with merged-cell safety).
- **Database Sync**: `drizzle-kit push` is used for schema synchronization (no file-based migrations).
- **Authentication**: Passport.js (Local Strategy), express-session, connect-pg-simple.
- **Security & Resilience**: Helmet (HTTP headers), express-rate-limit, React Error Boundaries, first-login security interceptor.

---

## 3. Project Structure

The repository is structured as a monorepo-style full-stack application:

```
APMS/
├── client/                     # Frontend React application
│   └── src/
│       ├── pages/              # Route-level components (team-management.tsx, manage-project.tsx, etc.)
│       ├── components/ui/      # Shadcn UI primitives
│       ├── components/admin/   # Admin modals (bulk-onboarding-modal.tsx, etc.)
│       ├── components/auth/    # Authentication components (force-password-reset-modal.tsx)
│       ├── components/layout/  # Application shell (sidebar, header)
│       └── lib/                # Utilities, Query client, search-index.ts, and protected route logic
├── server/                     # Backend Express API
│   ├── index.ts                # Application entry point
│   ├── auth.ts                 # Authentication, passport setup, security interceptor, rate-limiting
│   ├── routes/                 # Modular API route files (auth, users, projects, topics, groups, admin)
│   ├── services/               # Service layer (onboarding-parser.ts, etc.)
│   ├── db.ts                   # Database connection with unified config resolution
│   ├── db-storage.ts           # Database interaction layer using Drizzle ORM
│   └── websocket.ts            # Session-authenticated WebSocket server for real-time notifications
├── shared/                     # Shared code
│   └── schema.ts               # Core Drizzle tables, Zod schemas, TypeScript interfaces
└── scripts/                    # DB seeding, backup, restore, setup, and verification test suites
    ├── ensure_db.ts            # Production-safe bootstrap used by start_server.bat (npm run db:ensure)
    ├── setup_db.ts             # Full destructive reset (npm run db:hard-reset)
    ├── verify_search_indexing.ts          # Search engine tokenization & benchmark suite (npm run test:search)
    ├── verify_phase_6_enhancements.ts    # Direct topic creation & UI suite (npm run test:admin-topics)
    ├── verify_password_reset_and_login.ts # Password reset & RBAC suite (npm run test:password)
    ├── verify_priority_bug_fixes.ts       # Priority bug fixes verification suite (npm run test:fixes)
    ├── verify_team_management_and_supervisor_fix.ts # Team management suite (npm run test:teams)
    ├── verify_topic_selection_and_routing.ts        # Topic confirmation & routing suite (npm run test:selection)
    ├── verify_onboarding_and_access_control.ts      # Student bulk onboarding suite (npm run test:onboarding)
    ├── verify_supervisor_onboarding_and_rbac.ts     # Faculty onboarding suite (npm run test:supervisor)
    ├── verify_bulk_topic_onboarding.ts              # Topic bulk upload & PUGID suite (npm run test:topics)
    ├── verify_backup_and_excel_export.ts            # Backup, topological restore & university Excel export suite (npm run test:backup)
    └── e2e_verify.ts                                # End-to-end integration test suite (npm run test:e2e)
```

---

## 4. Database Schema (Drizzle ORM)

The application relies on several core tables defined in `shared/schema.ts`:

- **users**: Stores all accounts with role-based access (`admin`, `coordinator`, `supervisor`, `student`). Student roles have a required `course` column (`BCA` or `MCA`), `enrollmentNumber`, and `forcePasswordReset` boolean flag. Soft deletes are implemented via an `is_deleted` column.
- **student_groups**: Student project groups containing `course` (`BCA` or `MCA`), `projectTeamId` (e.g., `A-01`), `supervisorId`, `maxSize`, and `createdById`.
- **student_group_members**: Manages team memberships and invitation statuses (`pending`, `accepted`, `rejected`).
- **project_topics**: Topics proposed by supervisors or created directly by admins, requiring a `course` property (`BCA` or `MCA`), sequential `topicCode` (`PUGID26xxx`), and a `status` (`pending`/`approved`/`rejected`/`pending_supervisor`).
- **student_projects**: Maps groups/students to topics with progress tracking.
- **project_assessments**: Grades and feedback provided by supervisor.
- **project_milestones**: Distinct checkpoints for student projects.
- **notifications**: In-app notifications for users.
- **sessions**: Session storage for `express-session`.

---

## 5. Real-Time Notification System & Routing Logic

APMS includes a robust real-time notification system powered by WebSockets with a persistent per-user inbox:

- **Infrastructure**: A `WebSocketServer` runs on the same HTTP port (path `/ws`). The handshake is session-authenticated: the server un-signs the `connect.sid` cookie (timing-safe, same secret as `setupAuth`), loads the session from PostgreSQL, and derives the userId from `session.passport.user`. Unauthenticated handshakes are closed with code 1008. The system broadcasts `NOTIFICATION` events strictly to the target user's active socket connections.
- **Persistence & API**: Notifications are stored in the `notifications` table and served via `GET /api/notifications` (newest first). Supporting endpoints: `PATCH /api/notifications/:id/read` (ownership-enforced), `POST /api/notifications/read-all`, and `DELETE /api/notifications` (clear own). The header bell dropdown and the `/notifications` page consume these via TanStack Query.
- **Frontend Integration**: The `useNotifications` hook in `client/src/App.tsx` establishes the connection. When a notification is received, it triggers a UI `toast()` popup ("notification blob") and automatically invalidates the `["/api/notifications"]` TanStack Query cache to instantly refresh the bell dropdown and notifications page.
- **Advanced Routing Rules**: Only relevant stakeholders receive notifications.
  - *Supervisor Allocation*: When a Supervisor is assigned or reassigned to a Project Team, the newly assigned, previously assigned, and specific group's Students are notified.
  - *Topic Approvals & Direct Allotment*: When a Coordinator approves a topic or an Admin directly assigns a topic to faculty, the assigned Supervisor and all Admins receive notifications.
  - *Account Changes*: If a Coordinator creates or modifies an account, all Admins are instantly notified.
  - *Team Edit Notifications*: Admins, Coordinators, and the relevant Supervisor are notified whenever a team's members are modified.
  - *MCA Endorsements*: Supervisors are alerted of new student suggestions, and students are alerted of endorsement/approval decisions.

---

## 6. Architectural Patterns & Guidelines

1. **API Communication**: The frontend uses TanStack Query (`@tanstack/react-query`) for data fetching, caching, and state synchronization with the Express backend.
2. **Pagination**: APIs utilize server-side pagination, returning `PaginatedResponse` objects instead of raw arrays for tables to handle large datasets efficiently.
3. **Routing**: The application uses `wouter` for lightweight client-side routing.
4. **Styling**: Tailwind CSS is used extensively alongside Radix UI primitives encapsulated in `shadcn/ui` components.
5. **Form Handling & Validation**: `react-hook-form` is used in combination with `@hookform/resolvers/zod`. Zod schemas defined in `shared/schema.ts` act as the single source of truth for both frontend form validation and backend request validation.
6. **Database Queries**: All database interactions go through Drizzle ORM. Raw SQL is discouraged. Data access logic is encapsulated in `server/db-storage.ts`. Soft deletes are implemented via the `is_deleted` column across major tables, so queries must filter `eq(table.isDeleted, false)`.
7. **UI Design System (Spatial OS)**: The application features a highly premium, Cybertruck/Spatial OS-inspired aesthetic utilizing intense glassmorphism, dynamic backdrop filters, and fluid micro-animations. Key elements include:
   - *Animated Auth Splash Screens* (e.g., "WELCOME_ [USERNAME]") intercepting login/logout events.
   - *Dynamic Context Pill*: Floating, iOS Dynamic Island-inspired context pill replacing traditional bottom toasts.
   - *Holographic Data Grids*: Tables featuring perspective tilting via Framer Motion 3D transforms.
   - *Physics-Based Micro-Interactions*: Spring animations for button presses, hover states, and modals.
8. **Performance & Caching**: Cache headers are implemented for read-heavy API endpoints to reduce database queries.
9. **Database Configuration & Bootstrap**: `DATABASE_URL` is the single source of truth — parsed by the runtime (`server/db.ts`), `drizzle.config.ts`, and `scripts/ensure_db.ts`. The `DB_*` variables act as a fallback style. `ensure_db.ts` injects the runtime-resolved URL into drizzle-kit child processes, so schema operations can never target a different database than the running server. `npm run db:ensure` is safe to run on every start (creates missing tables + default admin, syncs schema changes, never wipes).
10. **Destructive Operations**: The hard reset (`POST /api/admin/reset`) requires the admin's password (verified via scrypt) and performs a transactional `TRUNCATE ... RESTART IDENTITY CASCADE` — sequences restart at 1 and the default admin is recreated, yielding exact `npm run db:setup` parity. Backup import re-syncs table sequences past imported `MAX(id)` values to prevent PK collisions.
11. **Documentation & Future Roadmap**: `Fixes_required.md` serves as the backlog for architectural and feature proposals (e.g., Background Jobs, Advanced Rate Limiting, OpenAPI generation, Multi-Department Support, PDF generation).

---

## 7. Access Control (RBAC)

- **Student**: Can browse and search topics specific to their course (BCA/MCA), form groups, invite members, and submit milestones. Segregated by Course. Cannot leave or modify group rosters once formed.
- **Supervisor**: Has dedicated "My Topics & Teams" view (`/projects`) showing only own proposed topics and assigned student teams with rosters. Can evaluate assigned groups, grade milestones, and manage MCA topic endorsements. Cannot modify team memberships.
- **Coordinator**: Can approve/reject topic proposals, directly author approved topics and assign to faculty, oversee all projects, view department stats, manage student project teams (modify rosters, rename teams, safe team dissolution), manage faculty supervisors via `/supervisor-management` (inspect faculty loads, assign specific groups to topics, review/approve/reject topics), and manually reassign supervisors to project teams with real-time faculty search. Can reset student and supervisor passwords to defaults, but is strictly prohibited from resetting or modifying Administrator or Coordinator accounts (`FORBIDDEN_TARGET_STAFF`).
- **Admin**: Has full system access, can perform destructive actions (DB resets), manage all users and roles, direct topic creation and faculty assignment, full team management, supervisor governance via `/supervisor-management` (edit profiles, direct group topic allotment, safe unassignment), safe dissolution, reset any user's password, and reassign supervisors.
