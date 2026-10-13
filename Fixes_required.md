# Fixes and Improvements Required

This document outlines suggested architectural, security, and maintenance improvements for the APMS project. These fixes are intended to enhance the codebase's scalability, maintainability, and security.

---

## 📋 Table of Contents
- [🚨 Priority Bugs & Issues to be Resolved](#priority-bugs--issues-to-be-resolved)
  - [🟠 High Priority](#high-priority)
  - [🟡 Medium Priority](#medium-priority)
  - [⚪ Low Priority](#low-priority)
- [💡 Long-Term & Architectural Improvements](#long-term--architectural-improvements)
  - [🏰 Secure like Fort Knox](#secure-like-fort-knox)
  - [🏎️ Fast like a Bugatti (Performance & Speed)](#fast-like-a-bugatti-performance--speed)
  - [⚡ Agile like a Porsche (Developer Experience & Flexibility)](#agile-like-a-porsche-developer-experience--flexibility)
  - [📐 Futuristic like a Cybertruck (UI/UX & Innovation)](#futuristic-like-a-cybertruck-uiux--innovation)
  - [1. Authentication Modernization](#1-authentication-modernization)
  - [2. Code Quality and Testing](#2-code-quality-and-testing)
  - [3. Frontend Architecture](#3-frontend-architecture)
  - [4. Performance](#4-performance)
  - [5. DevOps & Deployment](#5-devops--deployment)
  - [6. UX & Feature Gaps](#6-ux--feature-gaps)
  - [7. System Architecture & Scalability](#7-system-architecture--scalability)
  - [8. Extended Administrative Capabilities](#8-extended-administrative-capabilities)
  - [9. Frontend Polish](#9-frontend-polish)
- [✅ Resolved Issues & Release Changelog](#resolved-issues--release-changelog)
  - [v2.3.2 - Completed & Verified](#v232---completed--verified)
  - [v2.3.1 - Completed & Verified](#v231---completed--verified)
  - [v2.3.0 - Completed & Verified](#v230---completed--verified)
  - [v2.2.0 - Completed & Verified](#v220---completed--verified)
  - [v2.1.0 - Completed & Verified](#v210---completed--verified)
  - [v2.0.1 - Completed & Verified](#v201---completed--verified)
  - [v2.0.0 / v2 - Completed & Verified](#v200--v2---completed--verified)
  - [v1.9.7 - Completed & Verified](#v197---completed--verified)
  - [v1.9.6 - Completed & Verified](#v196---completed--verified)
  - [v1.9.5 - Completed & Verified](#v195---completed--verified)
  - [v1.9.4 - Completed & Verified](#v194---completed--verified)
  - [v1.9.3 - Completed & Verified](#v193---completed--verified)
  - [v1.9.2 - Completed & Verified](#v192---completed--verified)
  - [v1.9.1 - Completed & Verified](#v191---completed--verified)
  - [v1.9.0 - Completed & Verified](#v190---completed--verified)
  - [v1.6.0 - Completed & Security Audit](#v160---completed--security-audit)
  - [v1.4.1 Hotfixes](#v141-hotfixes)
  - [v1.4.0](#v140)
  - [v1.3.0](#v130)
  - [v1.2.0](#v120)
  - [v1.1.2](#v112)
  - [v1.0.1](#v101)

---

## 🚨 Priority Bugs & Issues to be Resolved

### 🟠 High Priority

- [x] **Fix Multi-Word Search with Spaces & Implement Indexed / Index-Behaving Search** (Resolved in v2.1.0)
  - **Issue Description:** System-wide search functionality is currently broken when a query contains multiple words separated by spaces. The search parameter logic ignores or drops any word after the space (e.g. searching "Machine Learning" only searches "Machine" or fails to evaluate subsequent tokens), resulting in omitted or incorrect results across data grids, card catalogs, and selection dialogs.
  - **Affected Areas:**
    - Student Topics catalog search (`client/src/pages/student-topics.tsx`) & Projects page search (`client/src/pages/projects.tsx`)
    - Manage Project / Project Management search & Assign/Change Topic modals (`client/src/pages/manage-project.tsx`)
    - Team Management directory search (`client/src/pages/team-management.tsx`)
    - Supervisor Management search & cohort filtering (`client/src/pages/supervisor-management.tsx`)
    - User Management search (`client/src/pages/user-management.tsx`)
    - Track Progress table search (`client/src/pages/track-progress.tsx`)
    - Change/Select Supervisor dialogs & student selection inputs
    - Server-side search query parsers and database query filters (`server/db-storage.ts`, `server/routes/*.ts`)
  - **Proposed Implementation:**
    - Overhaul the entire search parameter parsing logic on both client and server.
    - Tokenize search strings on whitespace (handling arbitrary spaces, multi-term queries) and match each token across all relevant searchable fields (Title, PUGID, Description, Tech Stack, Supervisor Name, Student Name, Roll/Enrollment Number, Department).
    - Implement an indexed or index-like search architecture (e.g. PostgreSQL full-text search using `to_tsvector`/`to_tsquery` with GIN indexes, or efficient normalized multi-field token indexing/caching in storage layer) to ensure search is fast, responsive, and handles multi-word phrases cleanly.

---

### 🟡 Medium Priority

- [x] **Admin & Coordinator Direct Topic Creation with Faculty Assignment (`/topics` / Approve Topics)** (Resolved in v2.1.0)
  - **Location:** Admin & Coordinator section -> Approve Topics page (`client/src/pages/approve-topics.tsx`, `server/routes/topics.ts`, `server/db-storage.ts`).
  - **Requirement:** On the Approve Topics page, add an option allowing Administrators and Coordinators to directly create and submit project topics.
  - **Scope & Functional Details:**
    - The topic creation parameters must mirror the supervisor topic submission form (Topic Title, Description, Course [BCA/MCA], Category/Domain, Required Technologies/Tech Stack, Complexity Level, Prerequisites, etc.).
    - Faculty Selection: Instead of authoring as the logged-in user, provide a Faculty/Supervisor selector so the Admin or Coordinator can select any registered faculty member.
    - Direct Assignment & Auto-Approval: Directly save that project topic as already **Approved** and assign it to the selected faculty supervisor upon creation (bypassing the supervisor submission & approval queue).

- [x] **IU-APMP Project Renaming & Comprehensive A-Z Backup, Restore & Multi-Page Excel System**
  - **Project Renaming:** Rename the project to **IU-APMP (Integral University Academic Project Management Portal)** across application headers, navigation sidebar, document titles, and package metadata.
    - *(CRITICAL CONSTRAINT: Do NOT change the Login Page `client/src/pages/auth-page.tsx`. Its existing institutional branding, logos, and layout must remain 100% untouched).*
  - **Issue Background:** Current `exportData()` in `server/db-storage.ts` only exports 5 tables, completely omitting `project_assessments` (marks/evaluations), `project_milestones`, and `notifications`. In addition, `importData()` attempts to insert `users` prior to `student_groups`, which causes foreign key constraint violations on `users.group_id -> student_groups.id`, resulting in silent drops of student records during restores.
  - **Core Requirements (3 Key Deliverables):**
    1. **Complete A-Z Backup & Export (Folder / Archive Export):**
       - A dedicated "Backup & Export" button that extracts 100% of portal data (A-Z data of the entire portal) without omission:
         - All 8 database tables: `student_groups`, `users`, `student_group_members`, `project_topics`, `student_projects`, `project_assessments`, `project_milestones`, `notifications`.
         - Packages data into a downloadable archive / folder structure containing:
           - Individual JSON files per table (`users.json`, `student_groups.json`, etc.)
           - Consolidated full-system snapshot `portal_database_dump.json`
           - Raw PostgreSQL dump / insert script `backup.sql` for emergency terminal recovery
           - Integrity manifest `manifest.json` (timestamp, portal version `IU-APMP`, schema version, record counts per table, checksum)
         - Automatically retains a local copy in the server's `database/backups/` directory with timestamped filenames for immediate server-side recovery.
    2. **High-Fidelity Import & Restore Section (Exact Portal & Database Replication):**
       - A dedicated Import Section in the UI that accepts uploaded backup files (ZIP archive or consolidated JSON) and restores the portal to an exact replica of the backup.
       - **Topological Dependency Order Insertion:** Strictly order table restoration to respect all foreign key relationships:
         `student_groups` → `users` → `student_group_members` → `project_topics` → `student_projects` → `project_assessments` → `project_milestones` → `notifications`.
       - **PostgreSQL Sequence Synchronization:** Automatically execute `setval(pg_get_serial_sequence(...))` to align sequences past `MAX(id) + 1` across all 8 tables to prevent duplicate key collisions on future insertions.
       - **Transactional Integrity:** Wrap entire restore operation in an atomic database transaction (`db.transaction`). If any table or record fails, roll back completely to prevent database corruption.
       - **Session Preservation:** Preserve the active administrator's session so they are not abruptly locked out upon restore completion.
       - **Automatic Pre-Restore Safety Snapshot:** Automatically generate a safety snapshot of the live database prior to applying any restore, guaranteeing 100% rollback capability.
       - **Real-Time Streaming Telemetry & Date Type Safety (v2.2.0):**
         - Live Server-Sent Events (SSE) progress bar with percentage and stage updates.
         - Monospace live terminal feed with timestamped logs of every restore step.
         - Resolved Drizzle ORM PostgreSQL driver `value.toISOString is not a function` error by explicitly parsing and converting ISO date strings to native `Date` objects across all 8 tables.
         - High-visibility in-modal diagnostic error display with automatic rollback guarantee and pre-restore snapshot retention.
    3. **Multi-Page University Excel Export (Single Workbook with Multiple Sheets):**
       - A one-click export button that compiles and downloads an official University Excel workbook (`.xlsx`) containing multiple dedicated worksheets:
         - **Sheet 1: Overview & Summary** — High-level statistics: total students, supervisors, teams, topics proposed/approved/pending, BCA vs MCA breakdown, completion metrics.
         - **Sheet 2: Student Details** — SNo., TeamID, Enrollment, Student Name, Mobile No., Email Id, Project (Code & Title), Allotment (Supervisor Name, Designation, Mobile, Email). Naturally grouped by Team ID with vertically merged team cohort cells.
         - **Sheet 3: Faculty Supervisors** — Emp ID, Name (with Prefix), Designation, Department, Email, Mobile, Topics Submitted, Approved Topics, Assigned Teams, Mentorship Load (e.g., 3/5).
         - **Sheet 4: Project Teams / Groups** — Team ID, Team Name, Course, Size, Leader Name & Enrollment, Complete Member Roster, Assigned Supervisor, Assigned Topic Code & Title.
         - **Sheet 5: Project Topics Catalog** — Topic Code (PUGID), Title, Description, Course, Project Type, Technology Stack, Complexity, Proposing Supervisor, Approval Status, Allotted Group.
         - **Sheet 6: Student Projects & Progress** — Project ID, Student Name, Enrollment, Course, Topic Code & Title, Supervisor, Overall Progress %, Status, Allocation Date.
         - **Sheet 7: Evaluations & Assessments** — Student Name, Enrollment, Course, Topic, Evaluator Supervisor, Score / Marks Obtained, Feedback Comments, Assessment Timestamp.
         - **Sheet 8: Milestones & Deadlines** — Project Title, Student/Team, Milestone Title, Description, Due Date, Status, Completion Date.
       - Professional layout: styled header rows, formatted column widths, and institutional metadata banner ("Integral University Academic Project Management Portal - IU-APMP").
  - **Critical Production Safety & Compatibility Constraints:**
    - The live PostgreSQL database is already running with live student and faculty records and no external fallback backup.
    - **Zero Destructive Migrations:** No altering, dropping, or truncating live production tables during normal operations.
    - **Read-Only Data Extraction:** All export and backup operations must be non-blocking, pure read queries against existing schema.
    - **Safe Non-Destructive Testing:** Test and verify all backup, restore, and export logic using dedicated mock/isolated test datasets without touching production records.
    - **Full Backward Compatibility:** Must be 100% compatible with existing frontend pages, active user sessions, and running system state.

- [ ] **Dashboard "Recent Activity" Is Fake** — `server/routes/stats.ts`
  `GET /api/activities` returns a hardcoded mock list shown to Coordinators/Admins as if it were live department activity.
  *Fix:* Derive from recent rows (topics approved, teams created, assessments posted) or remove the widget until implemented.

---

### ⚪ Low Priority

- [x] **Navigation Pane Reorganization & Label Renaming** (Resolved in v2.1.0)
  - **Location:** Sidebar Navigation Pane (`client/src/components/layout/sidebar.tsx`).
  - **Requirements:**
    1. Rename section header **"Main Navigation"** to **"Navigation"**.
    2. Rename **"Manage Project"** to **"Project Management"** and move it under the **"Management"** section (alongside User Management, Team Management, and Supervisor Management).
    3. Rename **"Setting"** to **"Account Setting"**.

- [x] **Notification Preferences Stub** — `server/routes/users.ts:41` (Resolved in v2.1.0)
  `PATCH /api/user/notifications` returns success without persisting anything.

- [x] **Misleading Import Success Message** — `client/src/pages/system-management.tsx` (Resolved in v2.1.0)
  Toast says "Please log in again" and force-redirects to `/auth`, but imports now preserve the importing admin's session server-side.

- [ ] **Dead Code: Redundant HTTP Server** — `server/routes/index.ts:26`
  `registerRoutes()` builds its own `http.Server` that `index.ts` discards and recreates. Confusing for maintainers; delete it.

---

## 💡 Long-Term & Architectural Improvements

### 🏰 Secure like Fort Knox
- **Zero Trust Architecture**: Implement strict zero-trust network boundaries, rigorous API payload validation (using Zod with strict mode), and mTLS for internal services if introduced.
- **Advanced Threat Protection**: Integrate WAF (Web Application Firewall), automated DDoS protection, and IP anomaly detection to prevent malicious traffic.
- **End-to-End Encryption (E2EE)**: Implement client-side encryption for highly sensitive fields (like personal data) before it even hits the server.
- **Biometric / WebAuthn Support**: Add Passkeys and hardware security key support (YubiKey, TouchID, FaceID) for un-phishable multi-factor authentication.

### 🏎️ Fast like a Bugatti (Performance & Speed)
- **Edge Caching & CDN**: Serve all static assets and localized frontend builds directly from edge nodes (e.g., Cloudflare/Vercel) to achieve sub-50ms latency globally.
- **Database Read Replicas & In-Memory Caching**: Configure cross-region read replicas with aggressive query caching using Redis to handle read-heavy dashboard loads instantly.
- **Wasm (WebAssembly) Processing**: Move heavy client-side computations (e.g., parsing massive Excel sheets) to WebAssembly modules for near-native execution speed.
- **Streaming SSR**: Implement server-side rendering with suspense streaming so users see critical UI immediately while data fetches in the background.

### ⚡ Agile like a Porsche (Developer Experience & Flexibility)
- **Feature Flags & Canary Deployments**: Introduce a robust feature-flagging system to instantly toggle features, enabling trunk-based development and risk-free experiments.
- **Micro-Frontends**: Decouple the React app into module-federated micro-frontends allowing independent domains (like Admin vs Student portals) to ship rapidly.
- **Fully Automated CI/CD Pipelines**: Implement multi-stage workflows with auto-provisioned preview environments for every pull request, running complete E2E test suites in parallel.
- **Event-Driven Architecture**: Refactor core state changes to use event sourcing and message queues (like RabbitMQ or Kafka), making the backend highly decoupled and extremely adaptable.

### 📐 Futuristic like a Cybertruck (UI/UX & Innovation)
- **AI-Powered Analytics (Chat with your Data)**: Integrate LLM-based chat interfaces directly into the dashboard so admins can type natural language queries (e.g., "Show me all pending MCA topics").
- [x] **Spatial / Glassmorphic UI**: Implement a cutting-edge design system utilizing glassmorphism, dynamic backdrop filters, and fluid micro-animations that feel like a modern Spatial OS.
- [x] **3D / WebGL Visualizations**: Replace standard charts with interactive, hardware-accelerated 3D data visualizations (using Three.js) for a stunning, sci-fi data experience.
- **Predictive Prefetching**: Use machine learning to predict user navigation paths and pre-load data/assets before they even click the button.
- **Voice-Driven Navigation & Commands**: Integrate Web Speech API for voice-activated navigation and hands-free dashboard control, making the UI feel like interacting with a sci-fi AI assistant.
- [x] **Dynamic Context Pill**: Implement a floating, animated status pill at the top of the UI (inspired by iOS Dynamic Island) that smoothly expands to show background tasks, active uploads, or incoming notifications (intercepting global toasts) without obscuring the main view.
- [x] **Holographic Data Grids**: Upgrade standard data tables to holographic grids with perspective tilting (using `framer-motion` 3D transforms) when hovered, giving flat data a tactile, augmented-reality feel.
- **Cursor-Tracking Spotlight**: Implement a radial gradient spotlight that follows the user's mouse cursor across the dashboard, gently illuminating the borders of cards and interactive elements as the mouse passes over them.
- [x] **Physics-Based Micro-Interactions**: Use advanced physics-based spring animations for every button press, drag-and-drop, and modal open, making the interface feel heavy, responsive, and physically grounded.
- [x] **Animated Auth Splash Screens**: Implement professional, university-grade animated splash screens for Login and Logout events, utilizing intense glassmorphism, Framer Motion, and Spatial OS aesthetics.
- **Generative UI Soundscapes**: Introduce subtle, toggleable UI sound design (using the Web Audio API) where hovering, clicking, and page transitions generate soft, futuristic sci-fi sound effects that provide auditory feedback for physical interactions.
- **Biometric Passkeys (WebAuthn)**: Enable fingerprint and Face ID login for ultra-fast, passwordless authentication using the WebAuthn API.
- **Offline-First PWA Mode**: Convert the portal into a Progressive Web App (PWA) with Service Workers to allow users to view project data offline and auto-sync when reconnected.
- **AI Form Auto-Completion**: Use an LLM to pre-fill lengthy forms (like project topic submissions) based on a single sentence description provided by the user.

### 1. Authentication Modernization
- **Password Policy Enforcement**: Add validation for minimum password length (8+ chars), complexity requirements (uppercase, number, special char), and prevent common passwords.

### 2. Code Quality and Testing
- **Automated Testing Suite**: There are currently no unit tests or E2E tests.
  - `Vitest` for unit testing utility functions, Zod schemas, and React hooks.
  - `Playwright` or `Cypress` for end-to-end testing of critical workflows (Topic Approval, Group Formation, Login).
- **Controller Separation**: Business logic currently lives inside route handler callbacks in `server/auth.ts` and `server/routes.ts`. Extract this into dedicated controller files (e.g., `server/controllers/topicController.ts`, `server/controllers/userController.ts`) for better testability and separation of concerns.
- **Input Sanitization**: Add server-side sanitization (e.g., `xss` or `DOMPurify` on the server) for user-generated text fields (topic descriptions, feedback, group names) to prevent stored XSS attacks.

### 3. Frontend Architecture
- **React Suspense for Data**: Leverage React Suspense with TanStack Query's `useSuspenseQuery` for a more declarative loading state approach, reducing boilerplate `isLoading` checks.
- **Form Validation UX**: Ensure all forms display inline validation errors as the user types (not just on submit), using `react-hook-form`'s `mode: 'onBlur'` or `mode: 'onChange'`.

### 4. Performance
- **Image Optimization**: If profile pictures or file uploads are added in the future, implement server-side compression and responsive image serving.

### 5. DevOps & Deployment
- **Environment Variable Validation**: Use Zod to validate all required environment variables at server startup (e.g., `DATABASE_URL`, `SESSION_SECRET`), failing fast with clear error messages if any are missing.
- **Health Check Endpoint**: Add a `/api/health` endpoint that returns the server status and database connectivity, useful for load balancers and monitoring.
- **Structured Logging**: Replace `console.log` / `console.error` calls with a structured logger (e.g., `pino` or `winston`) that supports log levels, JSON output, and timestamps for production debugging.
- **Docker Support**: Add a `Dockerfile` and `docker-compose.yml` for containerized development and deployment with PostgreSQL.

### 6. UX & Feature Gaps
- **Email Notifications**: Integrate an email service (e.g., `nodemailer` + SMTP or a transactional email API) for critical events like group invitations and topic approval/rejection.
- **File Uploads**: Allow students to upload project reports/documents attached to milestones.
- **Audit Log**: Maintain a system-wide audit trail recording who performed what action and when, especially for admin operations like database resets and user deletions.

### 7. System Architecture & Scalability
- **Background Jobs System**: Integrate a message queue (e.g., `BullMQ` or `pg-boss`) for offloading long-running tasks like batch email notifications, generating heavy Excel/PDF reports, or processing periodic project progress summaries.
- **Advanced Rate Limiting**: Extend the current rate limiting beyond just authentication. Implement distinct limits for expensive endpoints (e.g., large data exports) and write-heavy endpoints (e.g., topic submissions) to prevent system abuse.
- **API Documentation**: Auto-generate OpenAPI/Swagger documentation directly from Zod schemas (using `zod-openapi` and `swagger-ui-express`) to create a live API testing interface for developers.

### 8. Extended Administrative Capabilities
- **Multi-Department Support**: Lay the groundwork for multi-tenant behavior so a single APMS instance can manage completely isolated data for multiple departments (e.g., CS, IT, Mechanical) under different Department Heads.
- **Granular RBAC System**: Migrate from simple role arrays (e.g., `requireRole([Admin, Coordinator])`) to a more granular, attribute-based access control system (like `CASL`) where permissions can be dynamically defined at the database level.

### 9. Frontend Polish
- **Mobile Responsiveness Audit**: Conduct a comprehensive pass on complex data grids (Project Table, User Management) and multi-step dialogs to ensure they are fully usable on smaller mobile viewports.
- **PDF Export Capabilities**: Supplement the existing Excel exports with client-side or server-side PDF generation (e.g., `react-pdf` or `Puppeteer`) for official, print-ready reports.

---

## ✅ Resolved Issues & Release Changelog

### v2.3.2 - Completed & Verified

- [x] **Faculty Supervisors Excel Worksheet Sorting by EmpID** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `scripts/verify_backup_and_excel_export.ts`
  - **Resolution:** Re-ordered the "Faculty Supervisors" sheet (Sheet 3) in `generateUniversityExcelReport()` using natural/alphanumeric ascending sort on `empId` (`F00039`, `F00124`, `F00157`, etc.). Aligned `S.No` sequential numbering (`1..62`). Added automated verification assertions in `scripts/verify_backup_and_excel_export.ts` confirming strictly sorted alphanumeric order.
- [x] **Supervisor Conflict Cross-Team Circular Loop & Dual-Membership Prevention** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `server/db.ts`, `shared/schema.ts`, `scripts/verify_supervisor_conflict_and_pugid_fix.ts`
  - **Resolution:** Resolved critical circular conflict between Team F-04 and Team F-06 caused by duplicate accepted membership of student 309 ("Aryan Singh"). Pruned duplicate membership, realigned F-04 to supervisor Usmani (727) and F-06 to supervisor Afaq (726), purged 35 phantom topics, and resynchronized topic code sequence to `PUGID26340`. Created partial unique PostgreSQL index `idx_student_group_members_unique_accepted` on `student_group_members(user_id) WHERE status = 'accepted'` preventing any student from joining multiple teams concurrently. Added cross-team student overlap validation in `resolveSupervisorConflict`.
- [x] **100% Student Mobile Numbers Population from Official Excel Roster** — **COMPLETED**
  - **Affected Files:** `scripts/update_student_mobiles_from_excel.ts`
  - **Resolution:** Ingested official departmental cohort file `CA321_Project Lab_Team_Formation_2026-27.xlsx`, extracted student contact records, and matched all 701 active students by enrollment number (`users.username` / `users.enrollmentNumber`). Cleaned and populated valid 10-digit phone numbers in `users.mobile` with zero data loss and zero impact on other records.
- [x] **Live Student Project Status & Supervisor Topics Telemetry in User Management** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `client/src/pages/user-management.tsx`, `scripts/verify_user_project_status.ts`
  - **Resolution:** Enriched `getAllUsers` and `getPaginatedUsers` in `server/db-storage.ts` to query accepted team memberships, student projects, and assigned project topics. Corrected the Students tab displaying "No Project" despite students holding active projects; now renders live color-coded status badges ('Active', 'Completed', 'No Project') with hover tooltips showing allotted topic code and title. Populated approved topic count for supervisors.

---

### v2.3.1 - Completed & Verified

- [x] **Atomic Database Transactions & Concurrency Advisory Locking for Conflict Resolution** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`
  - **Resolution:** Wrapped topic cloning, group reassignment, and student project mapping in an atomic database transaction (`db.transaction(async (tx) => { ... })`). Serialized sequential PUGID generation across concurrent conflict resolution requests using transaction-scoped PostgreSQL advisory locking (`SELECT pg_advisory_xact_lock(26001)`). Wrapped migration branch in an atomic transaction and deferred all notification dispatches until post-commit.
- [x] **Accepted Membership Roster Precision in Conflict Resolver** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`
  - **Resolution:** Replaced generic user group filtering with a direct database query on `student_group_members` filtering strictly by `status = 'accepted'` and `groupId = group.id`, harmonizing member retrieval with conflict detection logic.
- [x] **Client-Side Resolution Fallbacks & Missing Supervisor Validation** — **COMPLETED**
  - **Affected Files:** `client/src/pages/team-management.tsx`, `client/src/pages/manage-project.tsx`, `client/src/components/admin/supervisor-conflict-modal.tsx`
  - **Resolution:** Guarded conflict resolution buttons to disable/prevent execution if no supervisor is assigned or supervisor ID resolves to 0. Sanitized `newSupervisorId` (`undefined` when `<= 0`) in the modal to avoid ID mismatch with backend fallbacks.
- [x] **Supervisor Management Summary RBAC Hardening** — **COMPLETED**
  - **Affected Files:** `server/routes/admin.ts`, `client/src/pages/supervisor-management.tsx`, `client/src/App.tsx`, `client/src/components/layout/sidebar.tsx`
  - **Resolution:** Restricted `/api/admin/supervisors-summary` strictly to `UserRole.ADMIN` and `UserRole.COORDINATOR` to prevent unauthorized supervisor access to unfiltered faculty directory and team telemetry. Synchronized query `enabled` flags on `client/src/pages/supervisor-management.tsx` to execute exclusively for Administrators and Coordinators matching page route access.
- [x] **University Excel Export Layout Alignment & Natural Team ID Cohort Grouping** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `client/src/pages/system-management.tsx`, `scripts/verify_backup_and_excel_export.ts`
  - **Resolution:** Updated Sheet 2 of the official university workbook (`generateUniversityExcelReport()`) to the standardized "Student Details" worksheet. Enforced natural alphanumeric Team ID sorting (`A-01` before `A-02` before `A-10`, followed by `B-01`, etc.), displaying complete team rosters consecutively with team leaders first. Implemented vertical cell merging for team-level parameters (`TeamID`, `Project`, and `Allotment`) across all members of each cohort, matching the official administrative template. Formatted supervisor allotment details with clean multi-line wrapping and centered alignment while maintaining continuous 1-based sequential student numbering (`SNo.`). Verified with 78/78 automated test assertions with zero data mutations.

---

### v2.3.0 - Completed & Verified

- [x] **Interactive Dual-Action Supervisor Conflict Resolution Engine** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `server/routes/admin.ts`, `client/src/components/admin/supervisor-conflict-modal.tsx`, `client/src/pages/dashboard.tsx`, `client/src/pages/supervisor-management.tsx`, `client/src/pages/team-management.tsx`, `client/src/pages/manage-project.tsx`
  - **Resolution:** Resolved critical supervisor mentorship conflict bug where assigning a new supervisor to a student team without changing topic ownership caused the group to appear under both the original topic submitter and the newly assigned supervisor. Implemented automated conflict detection via `GET /api/admin/supervisor-conflicts`. Created dual-action resolution endpoint `POST /api/admin/supervisor-conflicts/:groupId/resolve` providing Option 1 (Copy / Clone Topic under a new `PUGID26xxx` code for the new supervisor and free the original topic for re-allotment) and Option 2 (Migrate Topic Ownership to the new supervisor). Integrated real-time alert banners on Dashboard and Supervisor Management alongside an interactive resolution modal.

- [x] **Dynamic Supervisor Telemetry Ratio & Workload Capacity Formulation** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `client/src/pages/supervisor-management.tsx`, `client/src/pages/team-management.tsx`, `client/src/pages/manage-project.tsx`
  - **Resolution:** Overhauled the broken "Number of Teams Allotted" metric on `/supervisor-management` to dynamically compute and display `Active Teams Allotted / Total Projects Submitted` (e.g., `5/6 Teams (High)`). Re-engineered `getSupervisorsWithSummary` to calculate capacity dynamically against submitted topic volume ($0 \to$ `Available`, $\ge C \to$ `Maximum`, $\ge \lceil C \times 0.7 \rceil \to$ `High`, else $\to$ `Optimal`). Added cross-page React Query cache invalidation for `/api/admin/supervisors-summary` on team and project updates.

- [x] **Faculty Supervisor Access to Supervisor Directory** — **COMPLETED**
  - **Affected Files:** `client/src/App.tsx`, `client/src/components/layout/sidebar.tsx`
  - **Resolution:** Granted `UserRole.SUPERVISOR` access to `/supervisor-management` as a read-only "Faculty Directory" in sidebar navigation and route protection, allowing faculty members to view departmental peers, research areas, and mentoring loads.

---

### v2.2.0 - Completed & Verified

- [x] **IU-APMP Institutional Rebranding** — **COMPLETED**
  - **Affected Files:** `client/index.html`, `client/src/components/layout/sidebar.tsx`, `client/src/pages/creator-info.tsx`, `package.json`, `start-network.sh`, `start_server.bat`
  - **Resolution:** Rebranded portal to IU-APMP across all headers, sidebar navigation, metadata, and scripts while preserving the authentication page layout intact.

- [x] **Complete A-Z Backup, Safe Topological Restore & Multi-Page University Excel Reporting** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `server/routes/admin.ts`, `client/src/pages/system-management.tsx`, `scripts/verify_backup_and_excel_export.ts`
  - **Resolution:** Implemented full system export packaging (.zip) covering all 8 tables, foreign-key ordered topological transactional restore with pre-restore safety snapshotting, sequence realignment, admin session retention, real-time SSE progress streaming with live terminal event viewer, and 8-sheet master Excel workbook generation.

---

### v2.1.0 - Completed & Verified

- [x] **Universal Multi-Word & Tokenized Search Engine (`client/src/lib/search-index.ts`)** — **COMPLETED**
  - **Affected Files:** `client/src/lib/search-index.ts`, `server/db-storage.ts`, `client/src/pages/student-topics.tsx`, `client/src/pages/projects.tsx`, `client/src/pages/approve-topics.tsx`, `client/src/pages/track-progress.tsx`, `client/src/pages/manage-project.tsx`, `client/src/pages/team-management.tsx`, `client/src/pages/supervisor-management.tsx`, `client/src/pages/user-management.tsx`, `client/src/pages/supervisor-evaluations.tsx`, `client/src/pages/notifications.tsx`, `scripts/verify_search_indexing.ts`
  - **Resolution:** Designed and implemented a dedicated multi-word search engine utility (`client/src/lib/search-index.ts`) providing tokenization, diacritic normalization, unified document creation, cross-attribute multi-token matching, and sub-millisecond in-memory search index caching (`createSearchIndex`). Eliminated previous bug where spaces broke search queries or dropped subsequent terms across 10 client pages and database query filters. Fully verified via automated test suite `scripts/verify_search_indexing.ts`.

- [x] **Admin & Coordinator Direct Topic Creation with Faculty Assignment (`/approve-topics`)** — **COMPLETED**
  - **Affected Files:** `client/src/pages/approve-topics.tsx`, `server/routes/topics.ts`, `server/db-storage.ts`, `scripts/verify_phase_6_enhancements.ts`
  - **Resolution:** Added dedicated "Add Topic" modal for Administrators and Coordinators on the Approve Topics page. Admins/Coordinators can select any registered faculty supervisor from a dropdown, configure topic parameters (Title, Description, Technology, Project Type, Course, Estimated Complexity), and submit. The backend directly generates the next sequential `PUGID26xxx` topic code, saves the topic as immediately **Approved**, links it to the selected faculty supervisor, and automatically dispatches a system notification to the assigned faculty member.

- [x] **Navigation Pane Reorganization & Label Renaming** — **COMPLETED**
  - **Affected Files:** `client/src/components/layout/sidebar.tsx`
  - **Resolution:** Renamed section header `"Main Navigation"` to `"Navigation"`. Renamed `"Manage Project"` to `"Project Management"` and moved it under the `"Management"` section (alongside User Management, Team Management, and Supervisor Management). Renamed `"Setting"` to `"Account Setting"`.

- [x] **Misleading Import Success Message Fixed** — **COMPLETED**
  - **Affected Files:** `client/src/pages/system-management.tsx`
  - **Resolution:** Updated database restore/import success toast to `"Database restored and synchronized successfully."` and removed unnecessary forced logout and redirect to `/auth`, allowing active administrators to continue seamlessly while refreshing cached data in-place.

- [x] **Notification Preferences Database Persistence & Safekeeping** — **COMPLETED**
  - **Affected Files:** `server/routes/users.ts`, `server/db-storage.ts`, `server/db.ts`, `shared/schema.ts`, `client/src/pages/settings.tsx`
  - **Resolution:** Upgraded from in-memory cache to a dedicated PostgreSQL table `user_notification_preferences` with non-destructive idempotent table creation in `runMigrations()`, defensive copying on write and return to prevent caller mutation bugs, RESTful GET endpoint, and UI state synchronization. Zero-data-loss verified across existing database tables.

---

### v2.0.1 - Completed & Verified

- [x] **Project Technologies Full Visibility During Student Topic Selection (`/student-topics`, `/projects`)** — **COMPLETED**
  - **Affected Files:** `client/src/pages/student-topics.tsx`, `client/src/components/projects/topic-card.tsx`, `client/src/pages/projects.tsx`
  - **Resolution:** Removed single-line ellipsis truncation (`line-clamp-1`) which caused long technology stacks to be truncated with `...`. Rendered technologies as flexible, responsive badges/chips with word-break wrapping, ensuring students can clearly inspect all technologies involved in a project topic before selection.

- [x] **Universal Project Topic & Supervisor Reflection Across Dashboards & Accounts** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `server/routes/projects.ts`, `client/src/pages/dashboard.tsx`, `client/src/pages/projects.tsx`, `client/src/pages/student-groups.tsx`, `client/src/pages/manage-project.tsx`, `client/src/pages/supervisor-management.tsx`
  - **Resolution:** Fixed issue where Admin or Coordinator changes to project topics and supervisor assignments only reflected in the "Project Team" section. Resolved assigned group supervisor dynamically in `getStudentProjects`, prioritized assigned group supervisor in supervisor evaluations (`GET /api/projects/supervisor`), added "Assigned Project Topic" section in student groups, and added automated team project self-healing with real-time React Query cache invalidation across the app.

---

### v2.0.0 / v2 - Completed & Verified

- [x] **Supervisor Management Portal for Admins & Coordinators (`/supervisor-management`)** — **COMPLETED**
  - **Affected Files:** `client/src/App.tsx`, `client/src/pages/supervisor-management.tsx`, `client/src/components/layout/sidebar.tsx`, `client/src/components/layout/header.tsx`, `server/routes/admin.ts`, `server/routes/topics.ts`, `server/routes/groups.ts`, `server/db-storage.ts`
  - **Resolution:** Added dedicated Supervisor Management console allowing Administrators and Coordinators to inspect faculty supervisor profiles, topic submissions, team allotments, and mentorship loads with live metric tiles and cohort filtering.

- [x] **Direct Specific Group Allotment under Supervisor Topics & Safe Topic Unassignment** — **COMPLETED**
  - **Affected Files:** `server/routes/groups.ts`, `server/db-storage.ts`, `client/src/pages/supervisor-management.tsx`
  - **Resolution:** Added direct team assignment modal allowing Admins/Coordinators to assign specific student teams directly to specific topics under the submitting supervisor (`PATCH /api/student-groups/:groupId/topic`), along with one-click safe topic unassignment (`DELETE /api/student-groups/:groupId/topic`) preserving student group records and account integrity.

- [x] **Fully Reactive UI & Elimination of Horizontal Scroll for Manage/Edit/View Actions** — **COMPLETED**
  - **Affected Files:** `client/src/pages/supervisor-management.tsx`
  - **Resolution:** Replaced rigid multi-column table constraint with a default responsive **Cards View** reflowing smoothly across all viewports (mobile, tablet, laptop, desktop). Positioned Manage, Edit, and View actions prominently in the supervisor header, ensuring they are always visible without horizontal scrolling. Added a **Table View Toggle** with pinned sticky right actions for tabular review.

- [x] **Display All Submitted Topics Without Truncation** — **COMPLETED**
  - **Affected Files:** `client/src/pages/supervisor-management.tsx`
  - **Resolution:** Removed the two-topic truncation limit and collapse/expand toggle, directly mapping and displaying all submitted topics per supervisor with their associated team allotments, tech stack, and approval status.

---

### v1.9.7 - Completed & Verified

- [x] **Enrollment Number Conflict Detection & Resolution UI on Dashboard & User Management** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `server/routes/admin.ts`, `client/src/pages/dashboard.tsx`, `client/src/pages/user-management.tsx`, `shared/schema.ts`
  - **Resolution:** Implemented `GET /api/admin/enrollment-conflicts` and `POST /api/admin/resolve-enrollment-conflict`. On the Dashboard and in User Management, Administrators and Coordinators receive real-time conflict alert cards. In User Management, conflicted students are highlighted with amber left borders and badges across All Users and Students tables, with direct "Resolve" action buttons and a dedicated "Conflicts" directory tab. The resolution modal dynamically updates student enrollment numbers and aligns usernames with zero data loss.

- [x] **Admin Single User Creation Error (`POST /api/admin/users`)** — **COMPLETED**
  - **Affected Files:** `server/routes/admin.ts`, `server/db-storage.ts`
  - **Resolution:** Sanitized and normalized input payloads for manual user creation, ensuring proper default password generation, hashing, and avoiding constraint violations.

- [x] **Rename "Current supervisor" to "Tentative Supervisor"** — **COMPLETED**
  - **Affected Files:** `client/src/pages/manage-project.tsx`
  - **Resolution:** Renamed supervisor allotment labels in `/manage-project` to "Tentative Supervisor" to clearly communicate the academic status prior to final topic confirmation.

- [x] **Student Phone Numbers Backfilled and Exposed across System** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `client/src/pages/manage-project.tsx`, `client/src/pages/user-management.tsx`, `client/src/pages/supervisor-evaluations.tsx`, `client/src/pages/team-management.tsx`, `client/src/pages/projects.tsx`, `client/src/components/student-select.tsx`, `client/src/components/projects/project-table.tsx`
  - **Resolution:** Backfilled student phone numbers for 702 students from master institutional Excel sheets into `users.mobile` and exposed contact information to Administrators, Coordinators, and Supervisors.

- [x] **Change / Assign Project Topic for Teams in Manage Project** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `server/routes/groups.ts`, `client/src/pages/manage-project.tsx`
  - **Resolution:** Added `PATCH /api/student-groups/:groupId/topic` and an interactive "Change Topic" / "Assign Topic" modal in `/manage-project` with live topic search and course filtering. Automatically dispatches system notifications to team members upon topic reassignment.

---

### v1.9.6 - Completed & Verified

- [x] **Team Management Portal for Admins & Coordinators (`/team-management`)** — **COMPLETED**
  - **Affected Files:** `client/src/App.tsx`, `client/src/pages/team-management.tsx`, `client/src/components/layout/sidebar.tsx`, `client/src/components/layout/header.tsx`, `server/routes/groups.ts`, `server/db-storage.ts`
  - **Resolution:** Implemented a full-featured `/team-management` console accessible by Admins and Coordinators. Includes 5 status tabs (`All Teams`, `Pending Topics`, `Assigned Topics`, `With Supervisor`, `Without Supervisor`), global course filtering (BCA/MCA), live search across names, enrollments, topics, and supervisors, inline team editing (`PATCH /api/student-groups/:groupId`), member management (`POST /api/student-groups/:groupId/members` and `DELETE /api/student-groups/:groupId/members/:userId`), and team dissolution.

- [x] **Safe Team Dissolution with 100% Student User Account Retention** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `server/routes/groups.ts`, `client/src/pages/manage-project.tsx`, `client/src/pages/team-management.tsx`
  - **Resolution:** Added safe team dissolution (`DELETE /api/student-groups/:groupId`) which unlinks all student members (`users.groupId = null`), cleans up project milestones/assessments, sends automated notifications to members, and frees up students to join or form new teams while preserving their user accounts completely intact. Added confirmation dialogs in both `/team-management` and `/manage-project`.

- [x] **Decoupled & Optional Supervisor Allotment at Team Creation** — **COMPLETED**
  - **Affected Files:** `server/routes/groups.ts`, `client/src/pages/student-groups.tsx`, `client/src/components/create-team-dialog.tsx`
  - **Resolution:** Decoupled supervisor allotment from team creation to match academic procedures where supervisors are assigned upon topic selection. Made supervisor selection optional across student and administrator team creation forms, defaulted missing values to `null`, and updated supervisor assignment route to support unassigning.

---

### v1.9.5 - Completed & Verified

- [x] **Student Unable to Login After Admin/Coordinator Password Reset & Route Shadowing** — **COMPLETED**
  - **Affected Files:** `server/auth.ts`, `server/routes/admin.ts`, `client/src/lib/queryClient.ts`, `client/src/pages/auth-page.tsx`, `client/src/pages/user-management.tsx`, `client/src/hooks/use-auth.tsx`
  - **Root Cause Analysis:**
    1. Route Shadowing: `setupAuth()` in `server/auth.ts` registered `PATCH /api/admin/users/:id` (Admin-only) before `server/routes/admin.ts` mounted the intended Admin+Coordinator route.
    2. Coordinators received `403 Forbidden`, meaning user password changes by coordinators were rejected.
    3. Admins bypassed password hashing: the handler in `auth.ts` saved `req.body.password` directly in plaintext to the database.
    4. Plaintext passwords caused `comparePasswords()` to crash on `scryptAsync` due to `salt` being undefined (`TypeError: The "salt" argument must be of type string`). Because `/api/login` lacked error handling, the request hung or failed without a JSON response ("no error nothing, no response").
    5. `forcePasswordReset` was not cleared when passwords were reset by admins, threatening to trap students in the first-login dialog requiring their enrollment number.
  - **Resolution Implemented:**
    1. Consolidated all `/api/admin/users` routes (`POST`, `PATCH`, `DELETE`) into `server/routes/admin.ts`, removing duplicate shadowed routes from `server/auth.ts`.
    2. Added password hashing (`await hashPassword()`), validation (min 6 chars), and explicit `forcePasswordReset = false` clearing in `PATCH /api/admin/users/:id`.
    3. Updated `comparePasswords()` to gracefully evaluate both scrypt hashes and legacy plaintext passwords without throwing exceptions.
    4. Added automatic security migration in `LocalStrategy`: when a user with a plaintext password logs in, their password is automatically upgraded to an scrypt hash in the database.
    5. Added granular error codes (`USER_NOT_FOUND`, `INVALID_PASSWORD`, `ACCOUNT_DEACTIVATED`, `AUTH_INTERNAL_ERROR`, `SESSION_CREATION_FAILED`, etc.) across server and client for precise diagnostic telemetry.
    6. Updated `client/src/lib/queryClient.ts` with `ApiError` to parse JSON messages and error codes, and enhanced `client/src/pages/auth-page.tsx` with error banner telemetry.
    7. Added One-Click "Reset Password to Default" button for Admins and Coordinators in User Management (`POST /api/admin/users/:id/reset-password`):
       - Students: resets to their official `enrollmentNumber`.
       - Supervisors: resets to their official `empId`.
       - Automatically sets `forcePasswordReset: true` so the user is intercepted on their next login and prompted to choose a new secure password.
       - Enforces RBAC safety: Coordinators are strictly prevented from resetting Admin or Coordinator passwords (`FORBIDDEN_TARGET_STAFF`).
       - Sends notification to all system Administrators whenever a Coordinator performs a default password reset.
       - Action buttons available across All Users, Students, Supervisors tabs, and within the Edit User dialog.
    8. Login Screen Institutional Branding & Creator Attribution:
       - Added the official `Department_Logo.png` in a responsive framed container above the login card.
       - Updated the portal header typography to the university standard:
         - `(I.U.A.P.M.P)`
         - `Integral University Academic Project Management Portal`
         - `Department of Computer Application`
         - `INTEGRAL UNIVERSITY`
       - Added institutional footer at the bottom (plain text):
         - `❤️ Powered By : Binary Battalion.ai ❤️`
         - `💻 Designed and Developed by : SWETABH SINGH 💻`
    9. Registration Closed Frontend Layover:
       - Added a frontend overlay over the Register tab on the login page stating `"Registrations are closed as of now, Teams have already been allotted."`.
       - Clicking the Register tab or anywhere on the overlay displays a destructive toast notification informing the user that registrations are closed.
       - Implemented strictly on the frontend (`IS_REGISTRATION_OPEN = false`) with zero backend modifications, preserving the registration pipeline for future re-enabling.

---

### v1.9.4 - Completed & Verified

- [x] **Supervisor Search Bar in Admin & Coordinator Change Supervisor Dialog** — **COMPLETED**
  - **Affected Files:** `client/src/pages/manage-project.tsx`
  - **Resolution:** Refactored the supervisor reassignment interface to a single high-performance dialog equipped with a real-time search input. Admins and Coordinators can search across all 60+ supervisors by name, title prefix, department, designation, and email address, with visual selection states, current assignment indicators, and keyboard accessibility.

---

### v1.9.3 - Completed & Verified

- [x] **Supervisor Project section overhaul: show only own submitted topics & team details** — **COMPLETED**
  - **Affected Files:** `server/db-storage.ts`, `server/routes/projects.ts`, `client/src/pages/projects.tsx`
  - **Resolution:** Implemented `getSupervisorTopicsWithTeams(supervisorId)` query in `db-storage.ts` and `GET /api/projects/supervisor/my-topics` endpoint. Replaced multi-tab view with dedicated "My Topics & Teams" view displaying topic status, PUGID code, course, complexity, and allotted team details. General project topics catalog removed from supervisor view.

- [x] **Student Topic Selection Confirmation Popup** — **COMPLETED**
  - **Affected Files:** `client/src/pages/student-topics.tsx`
  - **Resolution:** Added `AlertDialog` confirmation dialog before BCA students can finalize selecting a topic, stating project title, group allotment, irreversibility warning, and coordinator contact instructions.

- [x] **Manage Project Tabs: Pending & Assigned for Admin & Coordinator** — **COMPLETED**
  - **Affected Files:** `client/src/pages/manage-project.tsx`
  - **Resolution:** Added two dedicated tabs (`Pending` for teams with no project selected and `Assigned` for teams with a project selected) with live count badges, status icons, and search filtering across both tabs.

---

### v1.9.2 - Completed & Verified

- [x] **As soon as start_server.bat runs for step 5, cmd closes instantly.** — **FIXED**
  - **Affected Files:** `start_server.bat`
  - **Root Cause Analysis:**
    - In Windows command prompt (`cmd.exe`), double quotes do not escape parentheses inside an `if (...)` compound block.
    - Step 5 contained rule names and echo statements with parentheses such as `(Port 3000)` and `(requires Administrator privileges)`.
    - `cmd.exe` parsed the first closing parenthesis `)` as terminating the `if errorlevel 1 (` block prematurely, causing a fatal syntax parsing error (`"" dir=in was unexpected at this time."`) that terminated the batch interpreter instantly before reaching `pause`.
  - **Resolution Implemented:**
    - Refactored Step 5 to use label-based control flow (`goto :fw_done`) instead of nested parenthesized `if/else` blocks.
    - Renamed the firewall rule to `APMS Server Port 3000` (removing parentheses).
    - Removed all unescaped parentheses from echo statements inside conditional blocks.

---

### v1.9.1 - Completed & Verified

- [x] **On Windows Server, the page isn't loading, just circular animation.** — **FIXED**
  - **Affected Files:** `server/index.ts`, `server/db.ts`, `server/db-storage.ts`, `client/index.html`, `client/src/lib/queryClient.ts`
  - **Root Cause Analysis:**
    1. In production mode, Helmet default headers included HSTS (`Strict-Transport-Security`) and CSP `upgrade-insecure-requests`, which forced browsers to upgrade plain HTTP requests to HTTPS on port 3000. This caused `/api/user`, dynamic chunk imports, and WebSockets to fail or hang on plain HTTP, leaving React `<Suspense fallback={<PageLoader />}>` indefinitely showing the circular spinner.
    2. `client/index.html` contained a synchronous `<script src="https://replit.com/public/js/replit-dev-banner.js">` that blocked HTML parsing or timed out on servers with restricted internet connectivity.
    3. Connecting to `localhost` on Node.js 18+ on Windows attempted IPv6 `::1` DNS resolution, which could hang or delay when PostgreSQL only listened on IPv4 `127.0.0.1`.
  - **Resolution Implemented:**
    1. Configured Helmet for local/LAN HTTP deployments (`contentSecurityPolicy: false`, `hsts: false`, `crossOriginResourcePolicy: { policy: "cross-origin" }`).
    2. Removed legacy third-party script from `client/index.html`.
    3. Normalized `localhost` to `127.0.0.1` in `server/db.ts` and `winenv`, and added `connectionTimeoutMillis: 5000` to `pg.Pool`.
    4. Added 15-second `AbortSignal` timeout handling to `apiRequest` and `getQueryFn` in `client/src/lib/queryClient.ts`.

- [x] **Local remote network PC are unable to access the site: http://192.168.6.11:3000.** — **FIXED**
  - **Affected Files:** `server/index.ts`, `start_server.bat`
  - **Root Cause Analysis:**
    1. `server.listen(Number(port))` omitted the host argument, causing Node on Windows to bind exclusively to `::` (IPv6), dropping inbound IPv4 connections from remote LAN devices.
    2. Windows Defender Firewall blocks inbound connections on port 3000 by default unless an Inbound Rule is added.
    3. Remote browsers receiving HSTS headers attempted to connect over HTTPS, causing `ERR_SSL_PROTOCOL_ERROR`.
  - **Resolution Implemented:**
    1. Updated `server.listen(Number(port), "0.0.0.0", ...)` in `server/index.ts` to bind to all IPv4 interfaces.
    2. Updated `start_server.bat` to automatically check and configure the inbound Windows Defender Firewall rule for TCP Port 3000 (`netsh advfirewall firewall add rule name="APMS Server (Port 3000)" dir=in action=allow protocol=TCP localport=3000`).
    3. Displayed local and LAN access URLs prominently in the startup batch console.

---

### v1.9.0 - Completed & Verified

- [x] **In student Account, No project mentor name (rename it as Supervisor) in Project teams Section.** — **FIXED**
  - **Affected Files:**
    - `client/src/pages/student-groups.tsx` (lines 203–216, 334–350, 413–439, 466, 505)
    - `client/src/pages/projects.tsx` (line 345)
    - `server/routes/groups.ts` (lines 227–250)
    - `server/db-storage.ts` (`getAllStudentGroups`, `getUserGroupMembership`)
  - **Root Cause Analysis:**
    1. **Outdated Terminology:** The student portal still used outdated terms: `"Project Mentor"` and `"Proposed Project Mentor"` instead of the system-standard term `"Supervisor"`.
    2. **Missing Supervisor UI Fallback:** All 154 auto-provisioned student teams in the database had `studentGroups.supervisorId` initialized to `null`. When `userGroup.supervisor` was `null`, `student-groups.tsx` rendered `{userGroup.supervisor?.firstName}` and avatar initials `{userGroup.supervisor?.firstName[0]}`, which evaluated to empty blank whitespace without any fallback indicator.
    3. **Missing Auto-Linkage on Topic Selection:** When a student team selected an approved project topic in `server/routes/projects.ts`, the server created records in `studentProjects`, but failed to set `studentGroups.supervisorId = topic.submittedById`.
    4. **Storage Fallback Resolution Gap:** If `studentGroups.supervisorId` was `null`, neither `GET /api/student-groups/my-group` nor `storage.getAllStudentGroups()` inspected the group's members' assigned project topics in `studentProjects` to dynamically resolve the supervisor.
  - **Resolution Implemented:**
    1. Standardized all UI labels in `client/src/pages/student-groups.tsx` and `client/src/pages/projects.tsx` from `"Project Mentor"` / `"Proposed Project Mentor"` to `"Supervisor"`.
    2. Implemented defensive conditional rendering in `client/src/pages/student-groups.tsx`:
       - When `userGroup.supervisor` exists: renders supervisor initials avatar, full name, department/designation, and email.
       - When `userGroup.supervisor` is `null`: renders an informative placeholder card with an amber/outline `<Badge>Not Assigned</Badge>` and explanatory guidance.
    3. Updated `server/routes/projects.ts` to automatically synchronize `studentGroups.supervisorId = topic.submittedById` upon topic selection.
    4. Added dynamic fallback resolution and database self-healing in both `server/routes/groups.ts` (`GET /api/student-groups/my-group`) and `server/db-storage.ts` (`getAllStudentGroups`).

- [x] **the topic section is completely empty in student section.** — **FIXED**
  - **Affected Files:**
    - `client/src/pages/student-topics.tsx` (lines 61–66, 148–152, 215–236)
    - `client/src/pages/projects.tsx` (lines 39–47)
    - `client/src/pages/dashboard.tsx` (line 180)
    - `server/routes/topics.ts` (lines 32–48)
  - **Root Cause Analysis:**
    1. **TanStack Query Key Collision & Cache Shape Corruption:**
       - In `client/src/pages/projects.tsx`, `useQuery` used `queryKey: ["/api/topics/approved"]` (when course was default), returning a flat array `ProjectTopic[]`.
       - In `client/src/pages/student-topics.tsx`, `useQuery` used the exact same key `["/api/topics/approved"]`, but expected an object `ApprovedTopicsResponse` (`{ hasSelectedTopic, myTopic, availableTopics, takenTopics }`).
       - Cache sharing caused `student-topics.tsx` to read the cached flat array, where `topicsData.availableTopics` was `undefined`, defaulting to `[]` and rendering: *"No available topics at the moment. All topics have been taken."*
    2. **Dashboard Navigation Mismatch:** On `client/src/pages/dashboard.tsx` line 180, "Browse Topics" linked to `<Link href="/topics">` (supervisor-only page where queries were disabled for students) instead of `<Link href="/student-topics">`.
    3. **Course Isolation & Case Sensitivity:** In `server/routes/topics.ts`, unsanitized student course strings could result in empty array responses.
  - **Resolution Implemented:**
    1. Isolated query keys: `client/src/pages/projects.tsx` now uses `[`/api/projects/approved-topics${getCourseQuery() ? `?${getCourseQuery()}` : ''}`]`, and `client/src/pages/student-topics.tsx` uses dedicated key `["/api/topics/approved", "student"]` with an explicit `queryFn`.
    2. Defensively normalized `topicsData` in `student-topics.tsx` to support both flat array and categorized object cache structures.
    3. Corrected dashboard link to `<Link href="/student-topics">`.
    4. Sanitized and normalized course filtering in `server/routes/topics.ts` (`studentCourse = ((req.user as any).course || '').trim().toUpperCase()`).

- [x] **in admin and coordinator acc, even after selecting the project, under the manage project section the assigned supervisor is says not assigned even after assigning them.** — **FIXED**
  - **Affected Files:**
    - `server/routes/projects.ts` (lines 88–98)
    - `server/db-storage.ts` (`getAllStudentGroups`, lines 528–554)
    - `server/routes/groups.ts` (lines 292–340)
    - `client/src/pages/manage-project.tsx` (lines 40–72, 149–163, 219–235)
  - **Root Cause Analysis:**
    1. **Missing Group Supervisor Sync on Topic Selection:**
       - In `server/routes/projects.ts` (POST `/api/projects`), when students select a project topic, the server executes `storage.createStudentProject(...)` for all team members, but never updates `studentGroups.supervisorId`.
       - Because `studentGroups.supervisorId` remains `NULL`, the Manage Project page (`/manage-project`) reads `group.supervisor === null`, displaying: `Current Supervisor: Not Assigned`.
    2. **Storage Gap in `getAllStudentGroups()`:**
       - In `server/db-storage.ts`, `getAllStudentGroups()` loads `group.supervisorId`. If it is `null`, it does not check if any member of the group has an active project in `studentProjects` with a supervisor who proposed the topic.
    3. **Query Invalidation Key Mismatch on Supervisor Reassignment:**
       - In `client/src/pages/manage-project.tsx`, the groups query key includes dynamic course query params: `[`/api/student-groups/all${getCourseQuery() ? `?${getCourseQuery()}` : ''}`]` (e.g., `["/api/student-groups/all?course=BCA"]`).
       - In `changeSupervisorMutation.onSuccess` (line 61), it calls:
         `queryClient.invalidateQueries({ queryKey: ["/api/student-groups/all"] });`
       - TanStack Query exact prefix matching treats `"/api/student-groups/all?course=BCA"` as a distinct string. Exact array key matching fails, so the query is never invalidated or re-fetched.
       - Consequently, even after an admin assigns a supervisor via the dialog and the backend updates successfully, the UI continues to display `Not Assigned` without updating.
    4. **Historical Database Sync:**
       - Existing groups that already selected a topic (e.g. Group 1 with Topic 2023, submitted by Supervisor 720 Ms. Fiza Afreen) currently have `supervisorId = null` in the `student_groups` table.
  - **Resolution Implemented:**
    1. In `server/routes/projects.ts`, automatically synchronized `studentGroups.supervisorId = topic.submittedById` whenever a topic is selected.
    2. In `server/db-storage.ts` (`getAllStudentGroups()`) and `server/routes/groups.ts`, added fallback resolution: if `group.supervisorId` is `null`, it looks up whether group members have an active project in `studentProjects`, resolves the supervisor from `topic.submittedById`, and self-heals the group record in PostgreSQL.
    3. In `client/src/pages/manage-project.tsx`, switched to predicate-based query invalidation (`key.startsWith('/api/student-groups')` and `key.startsWith('/api/projects')`), ensuring all parameterized queries instantly refresh when a supervisor is reassigned.
    4. Added automated end-to-end regression test suite (`scripts/verify_priority_bug_fixes.ts`) to `npm test`.

- [x] **In Student account, Project section must show only their selected project progress and detail** — **FIXED**
  - **Affected Files:** `client/src/pages/projects.tsx`
  - **Resolution:** For student users (`user.role === UserRole.STUDENT`), bypassed supervisor/admin `<Tabs>` and topic catalog exploration. Isolated view directly renders the student's selected project details, milestone timeline (5 phases), supervisor contact card, and team roster. When no project is selected, presents an informative empty state guiding the student to `/student-topics`. Query for approved topics is disabled for students on this page, saving bandwidth.

- [x] **In Student account, Topic section must see both available and unavailable topics** — **FIXED**
  - **Affected Files:** `client/src/pages/student-topics.tsx`
  - **Resolution:** Added live search filtering (title, PUGID, tech stack, description) and filter tabs (`All Topics`, `Available`, `Unavailable`). In both scenarios (whether the student already selected a topic or hasn't yet), both available and taken topics are listed with distinct colored status badges (`Available` in emerald, `Unavailable / Taken` in red/amber).

- [x] **Topic Card Expandability (descriptions cropped with line-clamp-3)** — **FIXED**
  - **Affected Files:** `client/src/components/projects/topic-card.tsx`, `client/src/pages/student-topics.tsx`
  - **Resolution:** Made topic cards interactive and clickable. Clicking anywhere on the card or the "Read full description" toggle smoothly expands the card to show unabridged text with `whitespace-pre-line text-foreground/90 leading-relaxed`. Added `e.stopPropagation()` on action buttons to prevent accidental card toggles.

- [x] **Admin account and Coordinator account doesn’t show anything about selected project. The Track progress section is empty and projects section doesn’t show student project.** — **FIXED**
  - **Affected Files:**
    - `server/db-storage.ts` (`getAllProjects`, `getPaginatedProjects`, `getAllStudentGroups`)
    - `server/routes/projects.ts` (GET `/api/projects`)
    - `server/routes/users.ts` (GET `/api/supervisors`)
    - `client/src/pages/projects.tsx` (default active tab & data fetching)
    - `client/src/pages/track-progress.tsx` (queryFn with `apiRequest`, 8-column table with supervisor details, multi-tab support)
    - `client/src/pages/manage-project.tsx` (team selected project card, supervisor prefix)
    - `client/src/components/projects/project-table.tsx` (supervisor prefix & department display)
    - `client/src/hooks/use-auth.tsx` (query cache purge on login)
    - `client/src/lib/queryClient.ts` (default staleTime 5s)
    - `scripts/verify_priority_bug_fixes.ts` & `scripts/verify_bulk_topic_onboarding.ts` (scoped cleanup to prevent wiping DB student projects)
  - **Root Cause Analysis:**
    1. **Unscoped Test Script Deletions:** `scripts/verify_priority_bug_fixes.ts` and `scripts/verify_bulk_topic_onboarding.ts` unconditionally ran `await db.delete(studentProjects);` whenever `npm test` was executed. This wiped all active student projects across the entire system behind the scenes.
    2. **Default Tab Mismatch on Projects Page:** `/projects` defaulted to `<Tabs defaultValue="topics">` for all non-students, showing Topic Proposals instead of student projects by default.
    3. **Uncredentialed / Misconfigured Axios Fetching:** In `client/src/pages/track-progress.tsx`, raw `axios.get` was used instead of `apiRequest`, risking missing session cookies and returning truncated paginated shapes without parsing.
    4. **Unsynchronized Supervisor Allotment in Projects Query:** `getPaginatedProjects` previously only checked `topic.submittedById`. If a team was reassigned to a new supervisor by the Coordinator, `getPaginatedProjects` did not resolve the group's allotted supervisor.
    5. **Stale Query Cache Across Sessions:** `staleTime` was set to `Infinity` and `queryClient.clear()` was only called on logout, allowing stale query responses from prior logins to persist across accounts.
  - **Resolution Implemented:**
    1. Scoped test cleanups: Replaced wholesale `await db.delete(studentProjects);` with isolated, test-member-only deletes (`inArray(...)`), guaranteeing real student projects are never deleted by test suites.
    2. Changed default tab in `client/src/pages/projects.tsx` so Admin and Coordinator immediately land on the "Student Projects" table (`defaultValue={user?.role === UserRole.SUPERVISOR ? "topics" : "projects"}`).
    3. Refactored `client/src/pages/track-progress.tsx` to use authenticated `apiRequest`, fetch `limit=all`, and render a rich 8-column table with student name, enrollment number, PUGID code, topic title, assigned supervisor (with prefix and department), progress bar, and working details modal.
    4. Enhanced `getAllProjects()` and `getPaginatedProjects()` in `server/db-storage.ts` to resolve group supervisor from `studentGroupMembers` + `studentGroups.supervisorId` with fallback to `projectTopics.submittedById`, populating full supervisor contact details (prefix, name, department, designation).
    5. Upgraded `client/src/pages/manage-project.tsx` to display each team's selected project badge (e.g. `PUGID26001`), topic title, status, and formatted supervisor name with honorific prefix.
    6. Added `queryClient.clear()` on login and set `staleTime: 5000` to guarantee fresh data synchronization across page navigations and account switches.
    7. Verified with comprehensive test script (`scripts/verify_admin_coordinator_projects.ts`) and full test suite (`npm test`).

---

### v1.6.0 - Completed & Security Audit

#### Critical Security Fixes
- [x] **Privilege Escalation via `/auth/register`** — `server/routes/auth.ts` — **FIXED**
  The duplicate registration endpoint performed **no role validation**: any anonymous caller could `POST /auth/register` with `"role": "admin"` and gain full administrator access. The primary `/api/register` route correctly enforces the single-Admin/single-Coordinator rule, but this shadow surface bypassed it entirely.
  *Resolution:* `/auth/register` deleted. All registration now flows through `/api/register` exclusively.

- [x] **Password Hash Exposure via `/auth/login`** — `server/routes/auth.ts` — **FIXED**
  Returned `{ user: req.user }` — the raw database row **including the scrypt password hash**.
  *Resolution:* Response now strips the `password` field. (Kept for dev/test script compatibility; the client uses `/api/login`.)

- [x] **Unauthenticated Supervisor Enumeration with Hashes** — `server/routes/users.ts` — **FIXED**
  `GET /api/supervisors` had no auth guard and returned complete user rows. Anyone on the network — no login required — could enumerate every supervisor's username, email, and password hash.
  *Resolution:* Endpoint now requires authentication (students still have access for team formation) and returns only `{ id, firstName, lastName, email }`.

- [x] **Progress IDOR** — `server/routes/projects.ts` — **FIXED**
  `PUT /api/projects/:id/progress` checked only that *some* user was logged in — any authenticated user could set any project's progress by ID.
  *Resolution:* Now requires authentication plus role-based ownership: the project owner (student), the supervising faculty (topic proposer **or** current group supervisor), or Coordinator/Admin. Removed the request-body console logging.

#### High Priority Security & Stability Fixes
- [x] **Notification Inbox Is Non-Functional End-to-End** — multiple files — **FIXED**
  There was no `GET /api/notifications` endpoint anywhere on the server, yet the WebSocket hook invalidated that exact query key, and both the `/notifications` page and header bell rendered hardcoded mock arrays. Real notifications persisted to the DB but were never visible except as transient ContextPill toasts.
  *Resolution:* Added `GET /api/notifications`, `PATCH /api/notifications/:id/read` (ownership-enforced), `POST /api/notifications/read-all`, and `DELETE /api/notifications`. Storage gained `markNotificationAsReadForUser`, `markAllNotificationsAsRead`, and `deleteAllNotificationsForUser`. Both UI components now use TanStack Query against the live API; live WebSocket pushes still invalidate the cache.

- [x] **WebSocket Identity Spoofing** — `server/websocket.ts` — **FIXED**
  Clients self-declared identity via `/ws?userId=N` with zero verification — anyone could subscribe to another user's real-time notifications.
  *Resolution:* The handshake now validates the signed `connect.sid` session cookie against the PostgreSQL session store (timing-safe un-signing, same secret as `setupAuth`) and derives the userId server-side. The query parameter is ignored; unauthenticated handshakes are closed with code 1008.

- [x] **Unauthenticated Dashboard Statistics** — `server/routes/stats.ts` — **FIXED** *(found during the follow-up audit)*
  `GET /api/stats` had no auth guard, leaking institution-wide statistics (student counts, project progress, department stats) to anonymous users.
  *Resolution:* Added `isAuthenticatedRequest` guard (all roles may read; data is course-filtered per existing logic).

#### Medium Priority Fixes
- [x] **Anonymous Access to Approved Topics List** — `server/routes/topics.ts:24` — **FIXED**
  `GET /api/topics/approved` previously served topics to unauthenticated callers.
  *Resolution:* Added `isAuthenticatedRequest` check requiring active authentication. Strict course isolation for students and private cache-control headers are enforced.

- [x] **Bulk Upload Dispatcher Error (`dispatcher.useMemo`)** — `client/src/components/admin/bulk-onboarding-modal.tsx` — **FIXED**
  Submitting an Excel file for bulk upload intermittently crashed with `null is not an object (evaluating 'dispatcher.useMemo')` due to rapid re-renders of Radix UI context hooks during Server-Sent Event (SSE) streaming updates.
  *Resolution:* Replaced Radix progress and switch with lightweight accessible native components, consolidated streaming progress into an atomic state object, and added Vite `dedupe: ["react", "react-dom"]`.

- [x] **User Management Truncating Accounts (Page Limit = 50)** — `server/routes/admin.ts` & `client/src/pages/user-management.tsx` — **FIXED**
  User Management only showed 50 accounts even though 700+ users were present in the database, because `GET /api/users` applied an unrequested default pagination limit.
  *Resolution:* Modified `GET /api/users` to return all accounts if pagination is not explicitly requested or `limit=all` is specified. User Management now requests all accounts and displays live tab counters.

- [x] **Course Filter (BCA / MCA) Returning Zero Accounts & Groups** — `server/db-storage.ts` & `server/routes/groups.ts` — **FIXED**
  Selecting "BCA" or "MCA" in the header course filter returned 0 student groups and 0 accounts because member courses were missing from SQL projections and course matching was case-sensitive.
  *Resolution:* Included member course in `getAllStudentGroups()` projection, added case-insensitive matching across users and groups, and preserved admin accounts in user queries.

- [x] **Coordinator User-Edits Silently Fail (Route Shadowing)** — `server/auth.ts` vs `server/routes/admin.ts` — **FIXED**
  `setupAuth()` registered `PATCH /api/admin/users/:id` (Admin-only) at app level **before** `registerRoutes()` mounted the intended Admin+Coordinator version. Express matched the first handler, causing Coordinator edits to return 403 and Admin edits to bypass password hashing.
  *Resolution:* Removed redundant routes from `server/auth.ts` and consolidated `POST`, `PATCH`, and `DELETE /api/admin/users` into `server/routes/admin.ts` with proper password hashing, length validation, `forcePasswordReset` clearing, and coordinator guardrails.

#### Hard Reset & Backup Integrity
- [x] **True Fresh-Install Reset** — Transactional `TRUNCATE ... RESTART IDENTITY`; sequences restart at 1; default admin recreated via canonical seeding; live WebSocket sockets disconnected; admin password verified before wipe; session destroyed + cookie cleared.
- [x] **Import Safety** — Sequences re-synced past imported `MAX(id)` (no silent PK collisions); importer session preserved.

#### Production Deployment (Windows Server)
- [x] **Fail-Fast Schema Verification** — Startup now verifies all 9 core tables exist; a fresh database no longer boots into a broken state (`relation "users" does not exist`).
- [x] **Unified DB Configuration** — `DATABASE_URL` is the single source of truth across the runtime, drizzle-kit, and bootstrap tooling; `DB_*` variables supported as fallback. Split-brain (schema tooling and server targeting different databases) is impossible by construction.
- [x] **`npm run db:ensure`** — Non-destructive bootstrap: connectivity diagnostics, schema creation only when missing, safe schema sync on updates.
- [x] **One-Click `start_server.bat`** — Node check, `.env` bootstrap, dependency install, database preparation, build, and start with full error trapping (previous version could not chain commands).

---

### v1.4.1 Hotfixes

#### Bug Fixes
- [x] **Frontend Array Mapping Crash (`.map is not a function`)**: Fixed a downstream bug caused by v1.4.0 server-side pagination. Frontend tables (`projects.tsx`, `user-management.tsx`, `track-progress.tsx`, etc.) were expecting arrays but received `PaginatedResponse` objects. Updated the React Query `queryFn` extractors to safely parse `.data || data`.
- [x] **Vite Build Configuration Error**: Fixed a build failure caused by `react-router-dom` missing from dependencies despite being included in `vite.config.ts` manual chunks. Replaced with `wouter` to match the project's actual router.

---

### v1.4.0

#### MCA Topic Selection Workflow
- [x] **MCA Student Suggestions** — MCA students can now propose multiple topics directly to their assigned supervisor.
- [x] **Supervisor Endorsement** — Supervisors have a dedicated tab to review, endorse, or reject topics proposed by their MCA students.
- [x] **Auto-Project Assignment** — When a Coordinator or Admin approves an endorsed MCA topic, the system automatically transitions the project status to active.

#### Performance
- [x] **Server-Side Pagination** — Implemented for large list endpoints to reduce payload size.
- [x] **API Response Caching** — Added `Cache-Control` headers for read-heavy endpoints like `/api/topics/approved`.
- [x] **Bundle Size Optimization** — Audited and optimized client bundle dependencies.

#### Database and ORM
- [x] **N+1 Query Problem** — Replaced `Promise.all` loops with Drizzle ORM `leftJoin` and `innerJoin` in data access methods (e.g. `getStudentProjects`, `getPendingTopics`).
- [x] **Database Indexing** — Added single and composite indexes on frequently queried columns (`username`, `email`, `status`+`is_deleted`) to significantly improve read performance.

---

### v1.3.0

#### Course Segregation & Project Team Management
- [x] **Strict Size Constraints** — BCA student teams restricted to 2-5 members; MCA student teams restricted to 1-2 members.
- **Course Isolation** — Implemented strict course isolation so BCA students can only group with BCA students, and MCA with MCA.
- [x] **Member Management API** — New `PATCH /api/student-groups/:groupId/members` allows Admins, Coordinators, and the designated Supervisor to edit team memberships globally.
- [x] **Management UI Overhaul** — Added a "Create Team" and "Manage Members" Dialog in the `manage-project` page, providing Admins/Coordinators powerful autocomplete search tools for team curation.
- [x] **Real-Time Edit Notifications** — Added WebSocket notifications to Admins, Coordinators, and the Team Supervisor whenever a team's members are edited.

#### Frontend Architecture & Accessibility
- [x] **Accessibility (a11y)** — Audited the app for WCAG compliance, ensured proper ARIA labels on all interactive elements (icon buttons, search inputs), validated keyboard navigation support, and verified sufficient color contrast ratios.

---

### v1.2.0

#### Manage Project & Supervisor Allotment
- [x] **Manage Project Page** — New standalone page (`/manage-project`) for Admins and Coordinators to view all student groups, their members, and assigned supervisors.
- [x] **Manual Supervisor Reassignment** — Admins and Coordinators can change the supervisor assigned to any student group via a "Change Supervisor" dialog with a dropdown of all available supervisors.
- [x] **Reassignment Notifications** — Both the newly assigned and previously assigned supervisors receive real-time notifications when a reassignment occurs.
- [x] **Backend APIs** — Added `GET /api/student-groups` and `PATCH /api/student-groups/:groupId/supervisor` endpoints (Admin/Coordinator only).
- [x] **Sidebar Navigation** — Added "Manage Project" link under Main Navigation for Admin/Coordinator roles.

---

### v1.1.2

#### UX & Feature Enhancements
- [x] **Real-Time Notifications** — Added real-time notifications via WebSockets. Replaced polling mechanism with instant updates. Implemented role-based routing (e.g. students don't see topic approvals; admins see coordinator modifications).
- [x] **Interactive Dashboard Widgets** — StatsCards are now clickable, routing users directly to respective detail pages with hover animations.
- [x] **UI & Theming Revamp** — Overhauled the color palette for AAA high-contrast standards. Created a unified slate-based color scheme across Light and Dark themes.

#### Terminology & Deployment
- [x] **Terminology Refactoring** — Renamed "Faculty" and "Teacher" keywords to "Supervisor" throughout the entire system (DB columns, roles, UI components, API endpoints).
- [x] **Windows Server Deployment** — Created `start_server.bat` for one-click production deployments on Windows.

---

### v1.0.1

#### Security Enhancements
- [x] **Rate Limiting** — Added `express-rate-limit` on `/api/login` and `/api/register` (5 requests per 15-min window per IP).
- [x] **Security Headers** — Integrated `helmet` middleware for robust HTTP headers (X-Frame-Options, HSTS, CSP in production, etc.).

#### Database and ORM
- [x] **Soft Deletes** — Implemented `is_deleted` boolean on `users` and `project_topics` tables. `deleteUser()` and `deleteProjectTopic()` now perform `UPDATE ... SET is_deleted = true` instead of `DELETE`. All query methods filter out soft-deleted records.
- [x] **Migration Pipeline** — Stripped broken file-based migrator in `db.ts` and formally standardized on `drizzle-kit push` for schema synchronization.

#### Frontend Architecture
- [x] **Error Boundaries** — Created a global `ErrorBoundary` component wrapping the entire app in `App.tsx`. Unhandled JS errors now show a styled fallback UI with a retry button instead of crashing the page.
- [x] **Optimistic UI Updates** — Approve and Reject mutations on the Topic Approval page now use TanStack Query's `onMutate` for instant cache updates with automatic rollback on failure.
