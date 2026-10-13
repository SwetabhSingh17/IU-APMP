# Version History

## 📋 Table of Contents
- [Version 2.3.1 (Current)](#version-231-current)
- [Version 2.3.0](#version-230)
- [Version 2.2.0](#version-220)
- [Version 2.1.0](#version-210)
- [Version 2.0.1](#version-201)
- [Version 2.0.0 [v2]](#version-200-v2)
- [Version 1.9.7](#version-197)
- [Version 1.9.6](#version-196)
- [Version 1.9.5](#version-195)
- [Version 1.9.4](#version-194)
- [Version 1.9.3](#version-193)
- [Version 1.9.2](#version-192)
- [Version 1.9.1](#version-191)
- [Version 1.9.0](#version-190)
- [Version 1.8.1](#version-181)
- [Version 1.8.0](#version-180)
- [Version 1.7.2](#version-172)
- [Version 1.7.1](#version-171)
- [Version 1.7.0](#version-170)
- [Version 1.6.0](#version-160)
- [Version 1.5.0](#version-150)
- [Version 1.4.1](#version-141)
- [Version 1.3.0](#version-130)
- [Version 1.2.0](#version-120)
- [Version 1.1.2](#version-112)
- [Version 1.1.1](#version-111)
- [Version 1.1.0](#version-110)
- [Version 1.0.1](#version-101)
- [Planned Features](#planned-features)
- [Known Issues](#known-issues)
- [Dependencies](#dependencies)

---

## Version 2.3.1 (Current)
### Transactional Conflict Atomicity, Advisory PUGID Serialization & Governance Hardening
1. **Atomic Database Transactions & Race-Free Advisory PUGID Locking** —
   - **Transaction Isolation**: Wrapped topic cloning, group supervisor update, and `studentProjects` re-pointing inside an atomic PostgreSQL transaction (`db.transaction(async (tx) => { ... })`) using the dedicated `tx` executor across all database writes.
   - **Concurrency Serialization**: Applied PostgreSQL transaction-level advisory locking (`SELECT pg_advisory_xact_lock(26001)`) to serialize sequential PUGID allocation (`PUGID26xxx`), completely preventing concurrent race conditions or duplicated topic codes.
   - **Transactional Migration Branch**: Wrapped topic authorship reassignment and team supervisor assignment in an atomic database transaction.
   - **Post-Commit Notification Dispatch**: Deferred all system notifications until transactions commit successfully, guaranteeing zero phantom alerts if a write operation fails.
2. **Accepted Membership Roster Precision in Conflict Resolver** —
   - Replaced general user group membership filtering with a direct database query on `student_group_members` where `status = 'accepted'` and `groupId = group.id`, aligning with the exact condition evaluated by `getSupervisorConflicts()`.
3. **Client-Side Resolution Fallbacks & Missing Supervisor Guards** —
   - Added validation guards in `client/src/pages/team-management.tsx` and `client/src/pages/manage-project.tsx` preventing conflict resolution if no supervisor is assigned to the group or if the supervisor ID resolves to 0.
   - Guarded `client/src/components/admin/supervisor-conflict-modal.tsx` to omit `newSupervisorId` (`undefined`) when its ID is `<= 0`, allowing backend fallback resolution without ID mismatch.
4. **Supervisor Management Summary RBAC Hardening** —
   - Restricted `/api/admin/supervisors-summary` strictly to `UserRole.ADMIN` and `UserRole.COORDINATOR` to prevent unauthorized supervisor access to unfiltered faculty directory and team telemetry.
   - Synchronized query `enabled` flags on `client/src/pages/supervisor-management.tsx` to execute exclusively for Administrators and Coordinators matching page route access.
5. **Institutional Excel Report Layout Alignment & Natural Team ID Cohort Grouping** —
   - **Student Details Worksheet Standardisation**: Structured Sheet 2 with exact columns in specific order: `SNo.`, `TeamID`, `Enrollment`, `Student Name`, `Mobile No.`, `Email Id`, `Project`, and `Allotment`.
   - **Natural Team ID Cohort Sorting**: Implemented natural alphanumeric sorting on team identifiers (`A-01` before `A-02` before `A-10`, followed by `B-01`, etc.), displaying complete student team rosters consecutively with team leaders first.
   - **Vertical Cell Merging**: Applied multi-row vertical cell merging across `TeamID` (bold, centered), `Project` (centered, text-wrapped), and `Allotment` (centered, multi-line wrapped supervisor name, designation, and contact details) for each team cohort.
   - **Sequential Student Indexing**: Preserved continuous sequential row numbering (`1, 2, 3...`) across individual student rows while neatly appending unassigned students at the bottom.
   - **Automated Verification**: Expanded `scripts/verify_backup_and_excel_export.ts` to 78 automated test assertions verifying column order, cohort sorting, and data integrity with zero database modifications.

---

## Version 2.3.0
### Dual-Action Supervisor Conflict Resolution Engine & Dynamic Telemetry Ratio
1. **Interactive Dual-Action Supervisor Conflict Resolution System** —
   - **Root Cause Resolution**: Resolved critical mentorship isolation anomaly where changing a student group's supervisor without updating topic ownership caused the group to appear under both the previous supervisor (topic author) and new supervisor (mentorship assignee).
   - **Real-Time Automated Conflict Detection**: Implemented `getSupervisorConflicts()` in `server/db-storage.ts` and exposed `GET /api/admin/supervisor-conflicts`. Detects mismatches between `groups.supervisorId` and the allotted `project_topics.supervisorId` across all active teams.
   - **Two Administrative Resolution Pathways (`POST /api/admin/supervisor-conflicts/:groupId/resolve`)**:
     - **Option 1 (Copy & Assign Cloned Project)**: Clones the project topic for the new supervisor with an institutional identifier (`PUGID26xxx`), assigns the team to this cloned topic, and marks the previous supervisor's original topic as unassigned (`isAssigned: false`), leaving it available for new student teams.
     - **Option 2 (Migrate Project Topic Ownership)**: Directly reassigns topic authorship (`supervisorId` on `project_topics`) to the new supervisor, preserving project title, tech stack, and milestone data under one unified record.
   - **Interactive Conflict Modal (`client/src/components/admin/supervisor-conflict-modal.tsx`)**: Built a comprehensive administrative resolution dialog with detailed side-by-side comparison (Group Name, Project Title, Previous vs. New Supervisor), choice selectors, and real-time resolution triggers.
   - **High-Visibility Alert Banners**: Integrated instant conflict warning banners on both the Admin Dashboard (`client/src/pages/dashboard.tsx`) and Supervisor Management page (`client/src/pages/supervisor-management.tsx`).
2. **Dynamic Supervisor Telemetry Ratio & Workload Capacity Formulation** —
   - **Active vs. Submitted Ratio**: Overhauled the "Teams Allotted" metric on `client/src/pages/supervisor-management.tsx` to display **Active Teams Allotted / Total Projects Submitted** (e.g. `5/6 Teams (High)`).
   - **Dynamic Workload Status Calculation**: Re-engineered `getSupervisorsWithSummary()` in `server/db-storage.ts` to compute capacity relative to faculty topic submissions:
     - $0$ assigned $\to$ `Available`
     - $\ge \text{Capacity}$ assigned $\to$ `Maximum`
     - $\ge \lceil \text{Capacity} \times 0.7 \rceil$ assigned $\to$ `High`
     - Else $\to$ `Optimal`
   - **Descriptive Telemetry Badges & Tooltips**: Added informative tooltips clarifying assigned teams, unassigned projects, and total submitted project capacity.
3. **Cross-Page Mutation Cache Invalidation & Seamless State Synchronization** —
   - Invalidate `/api/admin/supervisors-summary` cache key on all team supervisor updates in `client/src/pages/team-management.tsx` and `client/src/pages/manage-project.tsx`.
   - Invalidate `supervisor-conflicts` query cache immediately upon conflict resolution so warning badges and summary metrics update instantly without requiring manual page refresh.
4. **Zero-Data-Loss & Live Production Compatibility** —
   - All migrations, queries, and endpoints strictly adhere to non-destructive transaction safety, preserving live database records across the active semester deployment.

---

## Version 2.2.0
### IU-APMP Renaming, Comprehensive A-Z Backup, Topological Restore & Multi-Page University Excel Reporting
1. **IU-APMP Project Renaming (Login Page Intact)** —
   - Rebranded project as **IU-APMP (Integral University Academic Project Management Portal)** across application header titles (`client/index.html`), navigation sidebar (`client/src/components/layout/sidebar.tsx`), creator documentation (`client/src/pages/creator-info.tsx`), and package metadata (`package.json`).
   - Strictly preserved the login page (`client/src/pages/auth-page.tsx`) **100% untouched**, protecting institutional branding, logos, and layout.
2. **Complete A-Z Backup & Export (All 8 Database Tables & Archive Packaging)** —
   - Overhauled `exportData()` in `server/db-storage.ts` to export all 8 system tables: `student_groups`, `users`, `student_group_members`, `project_topics`, `student_projects`, `project_assessments` (evaluations & grades), `project_milestones` (deliverables & deadlines), and `notifications`.
   - Implemented `createFullBackupPackage()` generating a standalone `.zip` archive containing:
     - `manifest.json`: Verification manifest with timestamp, portal identification, schema version, and record counts.
     - `portal_full_backup.json`: Consolidated full-system JSON snapshot for fast programmatic restoration.
     - `tables/*.json`: Individual table JSON dumps for modular inspection.
     - `backup_recovery.sql`: Formatted SQL insert statements with deferred constraints and sequence resets for emergency terminal recovery.
     - Automatically retains a server-side copy in `database/backups/`.
   - Endpoint: `POST /api/admin/export` streams the complete `.zip` archive by default or consolidated JSON when requested with `?format=json`.
3. **High-Fidelity Topological Restore Engine & Zero-Data-Loss Safety** —
   - **Pre-Restore Safety Snapshot**: Automatically creates a timestamped safety snapshot of the live database in `database/backups/pre_restore_snapshot_[TIMESTAMP].json` before applying any restore.
   - **Topological Dependency Order**: Restores tables inside an atomic transaction (`db.transaction`) in strict foreign key order (`student_groups` → `users` → `student_group_members` → `project_topics` → `student_projects` → `project_assessments` → `project_milestones` → `notifications`), eliminating FK constraint errors where users with `groupId` were previously dropped.
   - **Sequence Synchronization**: Executes `setval(pg_get_serial_sequence(...))` to align PostgreSQL sequences past $\max(\text{id}) + 1$ across all 8 tables.
   - **Admin Session Retention**: Preserves active administrator authentication cookies (`preserveSessions: true`), preventing session loss post-restore.
   - Endpoint: `POST /api/admin/import` configured with `multer` supporting multipart `.zip` or `.json` file uploads.
4. **Official Multi-Page University Excel Report Generator (`.xlsx`)** —
   - Implemented `generateUniversityExcelReport()` in `server/db-storage.ts` using `ExcelJS` producing an official institutional 8-sheet master workbook:
     - **Sheet 1: Overview & Summary**: High-level KPIs, BCA vs MCA distribution, completion rates, and department statistics.
     - **Sheet 2: Student Details**: 700+ student directory ordered by natural TeamID cohorts (e.g. A-01, A-02) with vertically merged team cells (TeamID, Project, Allotment) and individual student records.
     - **Sheet 3: Faculty Supervisors**: 60+ supervisor directory with employee IDs, designations, departments, contact info, and mentorship loads.
     - **Sheet 4: Project Teams**: 150+ team directory with full member rosters, assigned supervisors, and topic allotments.
     - **Sheet 5: Project Topics Catalog**: 300+ topic directory with PUGID codes, courses, tech stacks, complexity levels, supervisors, and approval statuses.
     - **Sheet 6: Student Projects & Progress**: Student allocations, progress percentages, and status flags.
     - **Sheet 7: Evaluations & Assessments**: Complete grading records, evaluation scores, and feedback comments.
     - **Sheet 8: Milestones & Deadlines**: Deliverables, milestones, due dates, and completion timestamps.
   - Endpoint: `POST /api/admin/export-excel?multiSheet=true` and `GET /api/admin/export-excel` streams the formatted binary `.xlsx` workbook, while maintaining backward compatibility for legacy queries.
5. **System Management UI Console & Automated Verification Suite** —
   - Upgraded `client/src/pages/system-management.tsx` with dedicated cards for A-Z Backup, University Excel Report, and Safe Restore.
   - Built a pre-flight inspection modal parsing `.zip` and `.json` files to display record counts (Users, Teams, Topics, Projects) and backup metadata before confirmation.
   - Created `scripts/verify_backup_and_excel_export.ts` (`npm run test:backup`) covering 67 automated test assertions with 100% pass rate and zero live data loss.
6. **Real-Time Streaming Restoration & Live Diagnostic Telemetry** —
   - Replaced silent batch operations with Server-Sent Events (SSE) streaming (`POST /api/admin/import?stream=true`).
   - Integrated live animated progress bar, percentage tracker, and active stage indicators directly in the import modal.
   - Built an interactive collapsible terminal viewer streaming timestamped events for every restore phase (upload, parsing, snapshot creation, table batches, sequence alignment, completion).
   - High-visibility in-modal error recovery providing exact diagnostic error messages, reassuring that pre-restore snapshots and current data are preserved with zero data loss.
   - Enhanced ZIP parsing with magic-byte detection (`0x50, 0x4B`) for 100% reliability across operating systems and browsers.
   - Resolved ISO string serialization issue in Drizzle PostgreSQL driver (`value.toISOString is not a function`) by sanitizing and converting string dates to native `Date` objects across all 8 tables.
7. **Database-Backed User Notification Preferences with Defensive Copying** —
   - **PostgreSQL Persistence**: Replaced the per-process in-memory `Map` with a dedicated PostgreSQL table (`user_notification_preferences`) linked to users via foreign key with cascading delete, ensuring preferences persist across server restarts and multi-instance deployments.
   - **Defensive Copying & Immutability**: Stored and returned defensive copies in `updateUserNotificationPreferences` so subsequent caller mutations cannot alter saved database state or internal storage values.
   - **REST API & UI Synchronization**: Added `GET /api/user/notifications` in `server/routes/users.ts` and integrated `useQuery` synchronization in `client/src/pages/settings.tsx`, ensuring user preferences persist and correctly reflect on page load.
   - **Zero-Data-Loss & Live System Compatibility**: Designed with 100% non-destructive idempotent table migration in `runMigrations()` and `CORE_TABLES`, preserving live database records with zero data loss.

---

## Version 2.1.0
### Multi-Word Search Engine & In-Memory Indexing, Admin Direct Topic Allotment & UI/UX Enhancements
1. **Multi-Word Search Engine & In-Memory Indexing (`client/src/lib/search-index.ts`)** —
   - **Multi-Token Space-Separated Matching**: Overhauled search query parsing logic to tokenize on whitespace, matching each token across all searchable fields (Title, PUGID, Description, Technologies, Supervisor Name, Student Names, and Enrollment Numbers) and resolving the bug where words following spaces were ignored.
   - **Whitespace & Typing Tolerance**: Normalizes arbitrary spaces and handles trailing whitespace during real-time typing without clearing search results.
   - **Sub-Millisecond In-Memory Index**: Implemented an in-memory document search index with automatic caching, benchmarked at **0.218ms** across 1,000 records.
   - **System-Wide Integration**: Integrated across 10 client pages, catalogs, and selection dialogs (`student-topics.tsx`, `projects.tsx`, `approve-topics.tsx`, `track-progress.tsx`, `manage-project.tsx`, `team-management.tsx`, `supervisor-management.tsx`, `user-management.tsx`, `supervisor-evaluations.tsx`, `notifications.tsx`).
   - **Server-Side Tokenization**: Updated `searchProjects` in `server/db-storage.ts` to tokenize search queries into individual words and match each token across all project fields.
2. **Admin & Coordinator Direct Topic Creation with Faculty Assignment (`/approve-topics`)** —
   - **Direct Authoring & Assignment**: Added an "Add & Assign Topic" dialog allowing Administrators and Coordinators to author project topics directly on the Approve Topics page.
   - **Faculty Supervisor Selector**: Includes a faculty selection dropdown listing all registered faculty members with academic designations and departments.
   - **Instant Auto-Approval**: Bypasses the supervisor proposal and coordinator review queue, directly saving the topic with status `'approved'` (`POST /api/topics/direct`).
   - **Sequential PUGID Generation & Notifications**: Automatically assigns the next sequential topic code (`PUGID26xxx`) and dispatches an instant real-time notification to the allotted faculty supervisor.
3. **Sidebar Navigation Reorganization & Label Renaming (`client/src/components/layout/sidebar.tsx`)** —
   - Renamed header section **"Main Navigation"** → **"Navigation"**.
   - Renamed **"Manage Project"** → **"Project Management"** and moved it under the **"Management"** section (alongside User Management, Team Management, and Supervisor Management).
   - Renamed **"Setting"** → **"Account Setting"**.
4. **System Management Import Feedback & Notification Preferences Safekeeping** —
   - Updated `client/src/pages/system-management.tsx` to remove the forced redirect to `/auth` on successful database imports, clarifying that the administrator's active session is preserved.
   - Updated `server/routes/users.ts` and `server/db-storage.ts` to persist user notification preferences in-memory via `storage.updateUserNotificationPreferences`, eliminating database schema risk.
5. **Production Safety & Live Database Compatibility** —
   - 100% backward-compatible database queries and storage functions.
   - Zero database migrations or schema alterations required, preserving ongoing live production system state.

---

## Version 2.0.1
### Topic Technologies Full Visibility & Universal Project Topic & Supervisor Reflection Across Dashboards
1. **Full Technology Stack Visibility in Topic Selection (`/student-topics`, `/projects`)** —
   - **Eliminated Single-Line Ellipsis Truncation**: Removed `line-clamp-1` and rigid grid width limits that previously truncated project technology stacks with ellipsis (`...`).
   - **Responsive Technology Badges**: Formatted technologies into clean, responsive badges/chips with word-break wrapping, ensuring students can clearly inspect all technologies involved before topic selection.
   - **Consistent Technology Display Across Views**: Updated topic cards and the student project details view (`/projects`) so comprehensive technology stacks remain fully readable.
2. **Synchronized Project Topic & Supervisor Reflection Across Dashboards & Accounts** —
   - **Cross-Account Synchronization**: Fixed issue where Admin or Coordinator changes to project topics only reflected in the "Project Team" view and not on the Student Dashboard (`/`) or Projects page (`/projects`).
   - **Dynamic Supervisor Attribution**: Updated `getStudentProjects` in `server/db-storage.ts` and frontend dashboards to prioritize the assigned group supervisor (`studentGroups.supervisorId`) over the original topic submitter, displaying the supervisor's prefix, name, department, and email.
   - **Supervisor Portal & Evaluations Alignment**: Updated `getSupervisorTopicsWithTeams` and `GET /api/projects/supervisor` so supervisors can view and evaluate all teams assigned to them, even for topics submitted by another faculty member.
   - **Assigned Topic Section in Team View**: Added an "Assigned Project Topic" section to the student groups portal (`/student-groups`), showing topic code, course, status, description, tech stack, and direct navigation to `/projects`.
   - **Automated Self-Healing & Instant Query Cache Invalidation**: Automatic project row linking for newly joined group members, combined with reactive query invalidations on topic and supervisor reassignments.
3. **Production Safety & Zero Data Loss Guarantee** —
   - Built with 100% backward-compatible database queries and storage functions.
   - Zero database migrations or schema alterations required, preserving ongoing live production system state.

## Version 2.0.0 [v2]
### Major Release (v2.0): Supervisor Management Portal, Reactive Roster, Specific Group Topic Allotment & Workload Governance
1. **Dedicated Supervisor Management Portal (`/supervisor-management`)** —
   - **Centralized Faculty Governance Console**: Added a full-featured administrative portal accessible by Administrators and Coordinators from the sidebar navigation (`GraduationCap` icon) and header sync.
   - **Real-Time Key Metrics Cards**: Displays live metric tiles for Total Supervisors, Active Mentors, Available Supervisors, Proposed Topics, Approved Topics, and Teams Supervised.
   - **Cohort & Status Segmentation**: Integrated with global `CourseFilterContext` (BCA, MCA, All Cohorts) and categorized tabs (`All`, `Active Mentors`, `Available`, `Pending Topics`).
   - **Comprehensive Supervisor Profiles**: Displays faculty initials avatar, full name with honorific prefix, employee ID, academic designation, department, email, and mobile phone number.
   - **Mentorship Load & Capacity Tracking**: Visual progress bar tracking assigned teams against the 5-team institutional capacity ceiling, total students mentored, and automatic workload status flags (`available`, `optimal`, `high`, `maxed`).
2. **Direct Specific Group Allotment under Supervisor Submitted Topics** —
   - Displays all submitted project topics directly under each supervisor without truncation, showing topic code, title, course, tech stack, complexity, and approval status.
   - Directly displays the assigned student group beside/below each topic, including team name, project team ID, member count, and full member roster with university enrollment numbers.
   - **Direct Assignment Modal**: Interactive dialog (`PATCH /api/student-groups/:groupId/topic`) allowing Admins/Coordinators to search, filter (unassigned/assigned/all), and assign a specific student team directly to a specific topic under the faculty member who submitted it.
   - **Change & Unassign Controls**: Easy team reassignment and one-click topic unassignment (`DELETE /api/student-groups/:groupId/topic`), preserving student group records, accounts, and project links with zero data loss.
3. **Fully Reactive UI & Zero Horizontal Boundary Overflow** —
   - **Default Responsive Cards View**: Renders each supervisor as a standalone responsive card that reflows gracefully on all viewports from mobile (375px) to 4K displays.
   - **Manage, Edit, and View Actions Prominently Positioned**: The primary governance actions (`View`, `Edit`, `Manage Topics`) are placed directly in the supervisor card header beside the workload widget, remaining immediately accessible on any screen width without horizontal scrolling.
   - **Table View Toggle with Sticky Actions**: Includes a view switcher (`Cards View` / `Table View`). In Table View, the Actions column is pinned sticky (`sticky right-0 bg-background z-10 border-l shadow-sm`) with additional shortcut actions in Column 1, guaranteeing that actions are never clipped or pushed out of boundary.
4. **Supervisor & Topic Management Operations** —
   - **Edit Faculty Profile (`PATCH /api/admin/users/:id`)**: Edit supervisor prefix, names, emp ID, designation, department, email, and contact number.
   - **Review, Approve & Reject Topics (`PUT /api/topics/:id`)**: Direct approval, rejection with coordinator feedback dialog, and inline topic details editing (title, tech stack, course, complexity).
   - **General Team Allotment**: Modal to allot student teams to supervisors with live group search.
5. **Production Safety & Non-Destructive Live System Compatibility** —
   - Built with 100% backward-compatible database queries and storage functions.
   - Zero database migrations or schema alterations required, preserving ongoing live production system state.

## Version 1.9.7
### Enrollment Conflict Detection & Resolution UI, Project Topic Reassignment, Student Phone Numbers & Tentative Supervisor
1. **Enrollment Conflict Detection & Interactive Resolution UI (`/` & `/user-management`)** —
   - **Root Cause & Detection**: When importing student data via Excel, discrepancies in raw university spreadsheets can assign the same enrollment number to multiple distinct students, causing login credential overlap. Implemented automatic detection via `GET /api/admin/enrollment-conflicts` querying grouped active student accounts with duplicate enrollment numbers.
   - **Dashboard Interactive Alert**: Prominent alert card for Administrators and Coordinators with live conflict counts, conflict details (shared enrollment number, students involved, team assignments), and a direct modal launcher.
   - **User Management Integration (`/user-management`)**:
     - **Interactive Warning Card**: Displays live conflict count with "Show Conflicted Only ({count})" toggle and "Resolve Enrolment Conflict" button.
     - **Direct Row Highlighting**: Conflicted student rows are highlighted with an amber border and background (`border-l-4 border-l-amber-500 bg-amber-500/10`) with `Conflict` badges across All Users and Students tables.
     - **Direct Action Buttons**: In both All Users and Students tables, conflicted rows display a direct "Resolve" button for quick access.
     - **Dedicated Conflicts Tab**: Added a dedicated `Conflicts ({count})` tab trigger in `TabsList` that directly displays a full directory of conflict groups, each student, email, phone number, and inline input with one-click "Update" button.
     - **Resolution Modal**: Interactive dialog (`POST /api/admin/resolve-enrollment-conflict`) allowing Admins/Coordinators to assign unique enrollment numbers to conflicted students, automatically synchronizing their `username` and login credentials without data loss.
2. **Fixed Admin Single User Creation Error (`POST /api/admin/users`)** —
   - Hardened user creation in `server/routes/admin.ts` to ensure default passwords, roles, usernames, and courses are sanitized and normalized before insertion.
   - Fixed schema and database constraints that previously caused validation or duplication errors when creating single accounts.
3. **Frontend Renaming: "Current supervisor" to "Tentative Supervisor"** —
   - Updated supervisor display labels in `/manage-project` cards and headers to "Tentative Supervisor" to accurately reflect that faculty supervisor allotments prior to topic confirmation are tentative.
4. **Student Mobile Phone Numbers Backfilled & Exposed** —
   - Backfilled mobile phone numbers for 702 students from institutional Excel master records into PostgreSQL `users.mobile` column.
   - Exposed student phone numbers to Administrators, Coordinators, and Supervisors across:
     - Manage Project (`/manage-project`)
     - User Management (`/user-management`)
     - Supervisor Evaluations (`/supervisor-evaluations`)
     - Team Management (`/team-management`)
     - Projects Directory (`/projects`)
     - Student Selection dialogs (`client/src/components/student-select.tsx`)
     - Project Tables (`client/src/components/projects/project-table.tsx`)
5. **Project Topic Change & Reassignment for Teams (`/manage-project`)** —
   - Added "Change Topic" / "Assign Topic" button and interactive modal dialog on team cards in `/manage-project`.
   - Allows Admins and Coordinators to search through approved topics with course filtering, view topic PUGID, title, description, and supervisor.
   - Updates `student_groups.projectTopicId` via `PATCH /api/student-groups/:groupId/topic`, resynchronizes project milestones, and dispatches automated real-time notifications to all team members informing them of the topic change.
6. **Zero Data Loss Guarantee & Live System Compatibility** —
   - Executed full database backup before applying modifications.
   - All migrations and backfills were strictly non-destructive and backward compatible with running database state.

## Version 1.9.6
### Team Management Portal, Safe Team Dissolution with Account Retention & Optional Supervisor Allotment
1. **Dedicated Team Management Portal for Admins & Coordinators (`/team-management`)** —
   - Added a dedicated, full-featured Team Management portal accessible to Administrators and Coordinators from the sidebar navigation (`Users2` icon) and header.
   - Comprehensive team categorization tabs:
     - **All Teams**: Full directory of student project teams with live count badges.
     - **Pending Topics**: Teams that have not yet selected or been allotted a project topic.
     - **Assigned Topics**: Teams with an active, confirmed project topic.
     - **With Supervisor**: Teams that currently have an assigned faculty supervisor mentor.
     - **Without Supervisor**: Teams awaiting supervisor allotment (post topic selection).
   - Global course filter integration (`CourseFilterContext`: All, BCA, MCA).
   - High-performance live search across team names, descriptions, member names, enrollment numbers, supervisor names, and topic codes/titles.
   - Detailed team card previews showing:
     - Project team ID, course badge, and member capacity counter.
     - Assigned project topic with PUGID code, topic title, and status.
     - Assigned supervisor details with honorific prefix, department, and email.
     - Member roster with initials avatars, full names, and university enrollment numbers.
2. **Comprehensive Team Administration Operations** —
   - **Edit Team Details (`PATCH /api/student-groups/:groupId`)**: Allows Admins and Coordinators to modify team name, description, and registered course context with instant UI update.
   - **Manage Team Members Dialog**:
     - **Add Member (`POST /api/student-groups/:groupId/members`)**: Add students by university enrollment number or user ID with real-time validation (ensuring the student is not already in another team, course consistency matches the team, and team capacity limits are respected: BCA max 5, MCA max 2).
     - **Remove Member (`DELETE /api/student-groups/:groupId/members/:userId`)**: Safely removes individual students from a team, unlinking their project references, resetting their `groupId` to `null`, and notifying the student, while preserving their student account completely active.
   - **Safe Team Dissolution (`DELETE /api/student-groups/:groupId`)**:
     - Allows Admins and Coordinators to dissolve/remove a team entirely.
     - **Preserves student user accounts 100% intact**: Unlinks all members (`users.groupId = null`), deletes group project linkages and assessments to prevent orphaned references, and frees up all former members to join or form new teams.
     - Dispatches automated notifications to all former team members and the assigned supervisor.
     - Integrated a direct "Remove Team" button on team cards in `/manage-project` with an explicit confirmation dialog detailing that student accounts are not deleted.
3. **Decoupled & Optional Supervisor Allotment at Team Creation** —
   - Updated the team formation workflow to reflect academic guidelines: supervisors are allotted after students select their project topic.
   - Updated student team creation (`client/src/pages/student-groups.tsx`):
     - Supervisor selection marked "Optional" with a new default option: `"None (Allotted after topic selection)"`.
     - Informative guidance note explaining that supervisors are allotted upon topic selection.
   - Updated Admin/Coordinator Create Team Dialog (`client/src/components/create-team-dialog.tsx`):
     - Made supervisor selection optional with `"None (Allotted after topic selection)"` fallback.
   - Backend route hardening (`server/routes/groups.ts`):
     - Updated `POST /api/student-groups` to accept optional/null `supervisorId`, properly defaulting `parsedSupervisorId` to `null`.
     - Updated `PATCH /api/student-groups/:groupId/supervisor` to allow explicit unassignment or assignment (`targetSupervisorId = supervisorId === null || supervisorId === 0 ? null : supervisorId`).
4. **Automated Verification Test Suite (`npm run test:teams`)** —
   - Created `scripts/verify_team_management_and_supervisor_fix.ts` covering 17 automated assertions:
     - Verification of team creation without supervisor (`supervisorId: null`).
     - Verification of updating team name, description, and course.
     - Verification of removing individual members and account preservation.
     - Verification of re-adding members with course and capacity checks.
     - Verification of team dissolution with 100% active student account retention.

## Version 1.9.5
### Default Password Reset, Route Consolidation, Institutional Branding & Registration Lock
1. **One-Click Default Password Reset for Admins & Coordinators (`/user-management`)** —
   - Added a dedicated "Reset Password to Default" button for Admins and Coordinators across All Users, Students, and Supervisors tables, as well as inside the Edit User dialog (`POST /api/admin/users/:id/reset-password`).
   - Dynamically determines the official default credential based on user role:
     - **Students**: Resets password to their university `enrollmentNumber`.
     - **Supervisors**: Resets password to their university Employee ID (`empId`).
   - Automatically sets `forcePasswordReset: true` in the database so that the user is intercepted on their next login and prompted with a mandatory reset dialog to configure a new password.
   - Implemented strict RBAC protection: Coordinators are strictly prevented from resetting Admin or Coordinator passwords (`FORBIDDEN_TARGET_STAFF`).
   - Automatically dispatches a system audit notification to all Administrators whenever a Coordinator executes a default password reset.
2. **Authentication Route Shadowing & Route Consolidation** —
   - Consolidated all `/api/admin/users` routes (`POST`, `PATCH`, `DELETE`) into `server/routes/admin.ts`.
   - Removed duplicate, shadowed route registrations from `server/auth.ts`, fixing the issue where Coordinators received `403 Forbidden` when attempting to edit users or reset passwords.
3. **Cryptographic Password Hashing & Automatic Scrypt Upgrade Migration** —
   - Added password hashing (`await hashPassword()`) and validation (min 6 characters) in `PATCH /api/admin/users/:id` to ensure no passwords can be saved in plaintext.
   - Updated `comparePasswords()` in `server/auth.ts` to gracefully evaluate both scrypt hashes and legacy plaintext records without throwing undefined-salt exceptions.
   - Integrated automatic security migration in `LocalStrategy`: when a user with a legacy plaintext password logs in, their password is automatically upgraded in-place to an scrypt hash in PostgreSQL.
4. **Granular Machine-Readable Error Codes & UI Diagnostic Telemetry** —
   - Introduced standardized, machine-readable error codes across backend endpoints and frontend hooks (`USER_NOT_FOUND`, `INVALID_PASSWORD`, `ACCOUNT_DEACTIVATED`, `AUTH_INTERNAL_ERROR`, `SESSION_CREATION_FAILED`, `FORBIDDEN_TARGET_STAFF`, etc.).
   - Enhanced `client/src/lib/queryClient.ts` with custom `ApiError` class extracting structured error codes from JSON responses.
   - Enhanced `client/src/pages/auth-page.tsx` with high-contrast diagnostic error banners and alert badges for faster student troubleshooting.
5. **Institutional Branding & Layout Refinement on Login Page** —
   - Added the official `Department_Logo.png` in a responsive framed container above the login card.
   - Updated the portal header typography to official university standards:
     - `(I.U.A.P.M.P)`
     - `Integral University Academic Project Management Portal`
     - `Department of Computer Application`
     - `INTEGRAL UNIVERSITY`
   - Added institutional footer attributions:
     - `❤️ Powered By : Binary Battalion.ai ❤️`
     - `💻 Designed and Developed by : SWETABH SINGH 💻`
   - Refined badge and typography sizing across mobile and desktop viewports.
6. **Registration Closed Layover & Guard** —
   - Implemented an aesthetic overlay over the Register tab on the login screen stating: `"Registrations are closed as of now, Teams have already been allotted."`.
   - Displays a warning toast informing students that cohorts and accounts have already been provisioned if the Register tab is clicked.
   - Controlled via frontend flag (`IS_REGISTRATION_OPEN = false`), keeping the backend registration pipeline intact for future academic cycles.

## Version 1.9.4
### Supervisor Search Bar in Admin & Coordinator Change Supervisor Dialog
1. **Searchable Supervisor Directory in Change Supervisor Modal (`/manage-project`)** —
   - Added a real-time name and department search bar to the Change Supervisor dialog accessible by Admin and Coordinator accounts.
   - Enables instant filtering across 60+ faculty supervisors by full name, prefix (Dr., Prof., Mr., Ms.), first name, last name, department, designation, and email address.
   - Refactored the UI from individual nested card dialogs to a single unified modal with:
     - Prominent search input with leading search icon, instant `autoFocus`, and one-click clear button (`✕`).
     - "Currently Assigned" supervisor banner displaying the team's active supervisor with title and department.
     - Live count badge showing the number of available faculty matching the query.
     - Scrollable supervisor directory list with initials avatar, full name with prefix, "Current" badge indicator, and department/email.
     - Visual active selection state with high-contrast primary border and checkmark (`Check`) icon.
     - Friendly empty state when no supervisors match the search term.
     - Full keyboard accessibility (`role="button"`, `tabIndex={0}`, Enter / Space key selection).
     - Save Changes button disabled when the selected supervisor is already the currently assigned supervisor.

## Version 1.9.3
### Supervisor Project View Overhaul, Student Confirmation Dialog & Manage Project Tabs
1. **Supervisor Projects Overhaul (`/projects`)** —
   - Replaced general topic catalog tabs with an exclusive, dedicated "My Topics & Teams" view for supervisor accounts.
   - Each topic displays real-time allotment status (`Picked` vs `Available`), PUGID code, course, complexity, and technology stack.
   - For picked topics, displays full team details: project team ID, group name, completion progress bar, and member roster with enrollment numbers.
   - Added live summary stat cards (Total Topics, Picked by Teams, Still Available) and topic proposal modal integration.
   - Implemented backend endpoint `GET /api/projects/supervisor/my-topics` in `server/routes/projects.ts` and `getSupervisorTopicsWithTeams` in `server/db-storage.ts`.
2. **Student Topic Confirmation Modal (`/student-topics`)** —
   - Added an `AlertDialog` confirmation dialog before BCA students can finalize selecting a topic.
   - Clearly alerts students to the selected project title, that the topic will be assigned to their entire project team, that the action is irreversible, and to contact their department coordinator for issues.
3. **Manage Project Section Tabs for Admin & Coordinator (`/manage-project`)** —
   - Added two dedicated tabs to categorize project teams:
     - **Pending**: Teams that have not yet selected a project topic (`!group.project`), with live count badge and amber `Clock` icon. Set as default tab.
     - **Assigned**: Teams that have selected and been allotted a project topic (`!!group.project`), with live count badge and green `CheckCircle2` icon.
   - Comprehensive search filter covering team names, descriptions, project team IDs, topic titles, topic codes, supervisor names, and student names/enrollment numbers across both tabs.

## Version 1.9.2
### Windows Server Batch Startup Script Fix
1. **Resolved CMD Instant Close on Step 5** — Fixed a fatal syntax parsing error in `start_server.bat` caused by unescaped parentheses within nested batch `if` blocks during the Windows Firewall configuration check. Refactored Step 5 to use clean label-based jumps and safe rule naming (`APMS Server Port 3000`).

## Version 1.9.1
### Windows Server Loading Loop & LAN Remote Access Fixes
1. **Intranet/LAN HTTP Header Calibration (Helmet)** —
   - Disabled automatic HSTS (`Strict-Transport-Security`) and CSP `upgrade-insecure-requests` on HTTP deployments.
   - Resolved the infinite circular loading animation on Windows server caused by browsers upgrading subresources (`/api/user`, dynamic Vite chunks, WebSockets) to HTTPS on a plain HTTP port.
   - Configured `crossOriginResourcePolicy: { policy: "cross-origin" }` to enable remote LAN PCs to load static assets without cross-origin blocking.
2. **Explicit Network Interface Binding (`0.0.0.0`)** —
   - Updated `server.listen(Number(port), "0.0.0.0")` in `server/index.ts` to ensure binding to all IPv4 network adapters on Windows, resolving inaccessible endpoints from remote LAN devices (`http://192.168.6.11:3000`).
3. **Automated Windows Defender Firewall Configuration (`start_server.bat`)** —
   - Added automated verification and Inbound Rule creation for TCP Port 3000 in `start_server.bat` (`netsh advfirewall firewall add rule name="APMS Server (Port 3000)" dir=in action=allow protocol=TCP localport=3000`).
   - Added clear console access indicators displaying local (`http://localhost:3000`) and LAN IP (`http://192.168.6.11:3000`) access URLs.
4. **Database & Session Store Connection Hardening** —
   - Normalized database host to `127.0.0.1` across `server/db.ts` and `winenv`, preventing Node 18+ on Windows from stalling on IPv6 `::1` DNS resolution.
   - Added `connectionTimeoutMillis: 5000` to `pg.Pool` and error handlers on `pool` and `sessionStore` to fail fast and prevent silent request hanging.
5. **Client Request Timeouts & Cleanup** —
   - Added 15-second `AbortSignal` timeouts to `apiRequest` and `getQueryFn` in `client/src/lib/queryClient.ts` to prevent UI hanging on dropped network packets.
   - Removed obsolete third-party script `<script src="https://replit.com/public/js/replit-dev-banner.js"></script>` from `client/index.html`.

## Version 1.9.0
### Student Experience Overhaul, Admin/Coordinator Progress Visibility & Supervisor Attribution
1. **Student Account Project Isolation (`/projects`)** — Bypassed supervisor/admin `<Tabs>` and catalog exploration for student users. The page directly renders an isolated, focused dashboard for the team's selected project with academic milestone progress (5 phases), supervisor contact card, and team roster. When unassigned, displays an informative empty state pointing to topic discovery.
2. **Dual Topic Catalog Visibility (`/student-topics`)** — Students can now view and search both available and unavailable (taken) topics with distinct colored status badges, live keyword search, and dedicated filter tabs (`All Topics`, `Available`, `Unavailable`).
3. **Expandable Topic Cards** — Topic cards now feature smooth interactive expansion on click and a dedicated "Read full description" / "Show less" toggle, eliminating description truncation and preserving line breaks.
4. **Supervisor Honorific / Prefix Display** — Added `prefix` (Dr., Mr., Mrs., Ms., Prof.) to supervisor projections across all student team views, project dashboards, and user management.
5. **Admin & Coordinator Selected Project & Progress Tracking Overhaul** —
   - Changed default landing tab on `/projects` to `Student Projects` table for Admin and Coordinator accounts.
   - Refactored `/track-progress` with authenticated `apiRequest` and `limit=all` to render an 8-column table with student names, enrollment numbers, PUGID codes, topic titles, and supervisors with prefix and academic department.
   - Enhanced `Manage Projects` (`/manage-project`) so each team card displays their selected project badge, topic title, status, and supervisor honorific prefix.
   - Unified supervisor resolution in `server/db-storage.ts` (`getAllProjects`, `getPaginatedProjects`, `getAllStudentGroups`) across both assigned group supervisors and topic submitters.
6. **Query Cache Optimization & Test Sandbox Isolation** —
   - Added `queryClient.clear()` on login and set `staleTime: 5000ms` in `queryClient.ts` to prevent stale caches across user sessions and tab transitions.
   - Scoped test cleanups in `scripts/verify_priority_bug_fixes.ts` and `scripts/verify_bulk_topic_onboarding.ts` to prevent indiscriminate deletion of student projects in the database.

## Version 1.8.1
### Excel-Based Bulk Project Topic Upload, Supervisor Cross-Checking & Sequential PUGID Generation
1. **Verbatim File Parsing & Multi-Topic Extraction** — Implemented `server/services/topic-onboarding-parser.ts` configured specifically to parse `"BCA Final Project Suggestions 2026-27 (Responses).xlsx"`:
   - Accurately parses timestamp, faculty Name, and faculty Email from columns 0-2.
   - Extracts up to 5 submitted project topics per row across 20 topic columns (Title, Project Type, Technology, Description).
   - Intelligently trims inputs and applies safe fallbacks for optional fields (e.g. Technology defaulting to "General / Web Development") to comply with PostgreSQL schema constraints.
2. **Database Cross-Checking & Supervisor Account Validation** —
   - Implemented in `server/db-storage.ts` (`bulkUploadProjectTopics`): queries the PostgreSQL `users` table to verify that the extracted faculty Name and Email match an existing supervisor account.
   - Utilizes token-based name normalization and synonym mapping (handling honorifics like Dr., Prof., and variations such as "Mohammad" vs "Mohd." / "Nafees Akhter" vs "Nafees Akhtar") while strictly detecting true name mismatches (e.g., "John Doe").
   - If a faculty Name or Email fails validation, topics for that row are strictly skipped and not written to PostgreSQL.
3. **Auto-Incrementing Sequential Unique IDs (`PUGID26xxx`)** —
   - Added `topicCode: text("topic_code")` to `projectTopics` table in `shared/schema.ts` with `topic_code_idx` index.
   - Sequential topic ID generator dynamically queries current max sequence for `PUGID26%` in PostgreSQL and generates sequential IDs: `PUGID26001`, `PUGID26002`, `PUGID26003`, up to `PUGID26305`.
   - Topics inserted via bulk onboarding are immediately set to `status = 'approved'` and attributed to the verified supervisor's account ID.
4. **Post-Upload Failure & Success Reporting Modal** —
   - Built `client/src/components/admin/topic-bulk-onboarding-modal.tsx` with drag-and-drop file upload, course selector (BCA/MCA), and "Download Demo Format" button.
   - Post-upload report dynamically renders:
     - Metric cards: Verified Supervisors, Topics Provisioned, Unmatched Records, and Generated PUGID Range.
     - Dedicated Failure Report table displaying Row Number, Faculty Name, Faculty Email, and exact failure reason badge (e.g., `"Upload Failed: Supervisor email not found in database"` or `"Upload Failed: Supervisor name does not match record for this email"`).
     - Success Report table listing each verified faculty member and their assigned sequential PUGID topic codes.
5. **UI Badging & Topic Code Visibility** —
   - Added `topic.topicCode` badge (`PUGID26xxx`) to `client/src/pages/approve-topics.tsx` in Pending, Approved, and Rejected tabs.
   - Added `topic.topicCode` badge to `TopicCard` in `client/src/pages/topics.tsx` and `client/src/pages/student-topics.tsx`.
   - Added "Bulk Upload Topics" button to the Topic Approval toolbar.
6. **Demo Format Excel Generator** —
   - Implemented `GET /api/admin/onboarding/topics/demo-template` generating a downloadable Excel template matching the exact 23-column layout of the Google Forms responses spreadsheet.
7. **Comprehensive Automated Verification Suite** —
   - Created `scripts/verify_bulk_topic_onboarding.ts` with 57 automated test assertions verifying: verbatim parsing of 61 rows / 305 topics, demo template generation, supervisor cross-checking, error simulation with unmatched email and name, sequential `PUGID26xxx` code generation, and complete ingestion.
   - Full test suite (`npm test`) now validates 120 total test assertions across all modules with 100% success rate.

## Version 1.8.0
### Supervisor Bulk Onboarding, Faculty Directory & Multi-Course Access Control
1. **Dedicated Supervisor Bulk Onboarding Workflow** — Created a completely isolated onboarding module specifically for faculty supervisors:
   - Dedicated backend parser (`server/services/supervisor-onboarding-parser.ts`) supporting both legacy BIFF8 binary `.xls` (e.g. `Updated Staff List with all details.xls`) and modern `.xlsx`.
   - Automatically extracts `Emp. ID.`, `Employee Name` (with prefix separation: Dr., Mr., Mrs., Ms., Prof.), `Designation`, `Mobile`, `Official Email`, and Department title banner.
   - Separate API route `POST /api/admin/onboarding/supervisor/upload` with optional SSE real-time streaming telemetry.
   - In-memory optimized batch upsert in `server/db-storage.ts` (`bulkOnboardSupervisors`), auto-provisioning supervisor accounts with `username = empId`, initial temporary password = `empId` (scrypt hashed), `role = supervisor`, and `forcePasswordReset = true`.
2. **Multi-Course Supervisor Availability (BCA & MCA)** —
   - Updated `getAllUsers` and `getPaginatedUsers` in `server/db-storage.ts` so that supervisors, coordinators, and administrators remain visible and accessible when filtering by `BCA` or `MCA`, recognizing that faculty supervisors advise both BCA and MCA students.
   - Strict student cohort isolation is simultaneously preserved (BCA student queries never leak MCA students, and vice versa).
3. **User Management Interface Streamlining** —
   - Removed the redundant roles dropdown next to the search bar in `client/src/pages/user-management.tsx`.
   - Role filtering is now cleanly handled exclusively by the interactive visual tabs: `All Users`, `Admins`, `Supervisors`, `Coordinators`, and `Students`.
   - Expanded search input across the full card width for an uncluttered, modern layout.
4. **Strict UI Separation for Student & Supervisor Workflows** —
   - Rendered two distinct, prominent buttons in User Management: "Bulk Upload Student" and "Bulk Upload Supervisor".
   - Created `SupervisorBulkOnboardingModal` with custom progress bar, file drag-and-drop, live terminal logs, and onboarding summary metrics (Processed, Created, Updated).
5. **Supervisor Demo Template Generator** —
   - Implemented `GET /api/admin/onboarding/supervisor/demo-template` generating a downloadable Excel template matching the exact layout, header banner ("Department of Computer Application"), column styling, and Integral University sample faculty data as the official staff list.
6. **Database Schema & Migration** —
   - Added `emp_id`, `prefix`, `designation`, `mobile`, `department` columns and `emp_id_idx` index to the `users` table in PostgreSQL.
   - Verified non-destructive automatic schema verification in `server/db.ts`.
7. **Universal First-Login Security Enforcement** —
   - Extended the Express security interceptor in `server/auth.ts` to enforce `forcePasswordReset` for all users, requiring newly provisioned supervisors to update their initial password before accessing operational APIs.
   - Updated `ForcePasswordResetModal` to adaptively display "Employee ID" for faculty supervisors and "Enrollment Number" for students.
8. **Profile Settings Interface & RBAC on Designation** —
   - Updated Settings Profile view to visually display academic designation directly below the user's name in a styled badge alongside Employee ID and department.
   - Allowed faculty to mutate their own Name, Prefix, Email, and Mobile.
   - Strictly enforced RBAC: Designation input is disabled for supervisors; attempts to modify designation via `PATCH /api/user/profile` by non-administrators are rejected with HTTP 403 Forbidden.
9. **Automated Verification Suite** — Added `scripts/verify_supervisor_onboarding_and_rbac.ts` covering 44 comprehensive automated test assertions across parsing, template generation, provisioning, security interception, RBAC enforcement, and multi-course supervisor visibility with 100% pass rate (63 total test assertions across the project).

## Version 1.7.2
### Team Access Control & Permission Hardening
1. **Removed "Leave Project Team" Entirely** — Removed the "Leave Project Team" button and confirmation dialog from the student portal (`client/src/pages/student-groups.tsx`). Students in a team can now only view their assigned team, members, and project mentor without any option to leave.
2. **Restricted Team Modifications to Admins & Coordinators** —
   - `PATCH /api/student-groups/:groupId/members` in `server/routes/groups.ts` now strictly enforces `[UserRole.ADMIN, UserRole.COORDINATOR]`. Supervisors are completely blocked from modifying team members.
   - `POST /api/student-groups/:groupId/leave` is now permanently blocked with HTTP 403 Forbidden for students and supervisors.
   - Administrators and Coordinators retain exclusive authority to modify team rosters and reassign supervisors via the Manage Project console.

## Version 1.7.1
### Stability & Bug Fixes
1. **Resolved React Dispatcher Collision (`dispatcher.useMemo`)** — Fixed the `null is not an object (evaluating 'dispatcher.useMemo')` runtime error during bulk upload file submission:
   - Added Vite deduplication (`dedupe: ["react", "react-dom"]`) in `vite.config.ts` to prevent multiple React instance hook collisions.
   - Replaced context-heavy `@radix-ui/react-progress` with a native accessible progress bar in `bulk-onboarding-modal.tsx`.
   - Consolidated 5 discrete streaming state updates into a single atomic `IProgressState` object to eliminate React 18 render queue interleaving during SSE reads.
   - Replaced `@radix-ui/react-switch` with a native accessible toggle.
2. **User Management Full Account Visibility** — Resolved account truncation where User Management only displayed 50 records:
   - Modified `GET /api/users` in `server/routes/admin.ts` to return all accounts via `storage.getAllUsers(course)` when pagination is not requested or when `limit=all` is specified.
   - Updated `client/src/pages/user-management.tsx` with live dynamic count indicators on each tab (`All Users (${allUsersCount})`, `Supervisors (${supervisorsList.length})`, `Students (${studentsList.length})`, `Coordinators (${coordinatorsList.length})`) and clean empty-state rows.
3. **Course Filter Data Isolation (BCA & MCA)** — Fixed issue where selecting "BCA" or "MCA" in the header course filter returned 0 accounts or groups:
   - Updated `storage.getAllUsers(course)` and `getPaginatedUsers` in `server/db-storage.ts` to perform case-insensitive course matching (`UPPER(users.course) = UPPER(course)`) while preserving administrator visibility.
   - Fixed `storage.getAllStudentGroups` to include `course: m.course` in group member projections.
   - Updated `GET /api/student-groups` in `server/routes/groups.ts` to check both group-level course and member-level courses case-insensitively, correctly populating all 157 BCA groups and 2 MCA groups.

## Version 1.7.0
### Bulk Excel Onboarding & Automated Provisioning
1. **Multi-Sheet Excel Parser with ExcelJS** — Added `server/services/onboarding-parser.ts` to parse multi-sheet workbooks. Dynamically detects header rows, handles merged cells (`MergeValue`), extracts hyperlinks (avoiding `[object Object]` crashes), and extracts student details (`Enrollment Number`, `Student Name`, `Project TeamID`, `Mobile No.`, `Email Id`).
2. **Automated Account & Team Provisioning** — Implemented `bulkOnboardStudentsAndTeams` in `server/db-storage.ts`: provisions student accounts (`username = enrollmentNumber`, initial password = enrollment number hashed with scrypt, `forcePasswordReset = true`), automatically forms project teams in `student_groups`, and associates members in `student_group_members`. Optimized with O(1) in-memory maps and concurrent batching, executing 702 student imports in **under 1 second** (a 23x performance improvement).
3. **Real-Time Progress Bar & SSE Telemetry** — Added a real-time progress bar powered by Server-Sent Events (SSE) streaming updates from the server. Features an interactive toggle switch, live status messages, 4-step pipeline indicators, and a collapsible dark-mode live event terminal.
4. **Downloadable Demo Template** — Added `GET /api/admin/onboarding/demo-template` generating a styled multi-sheet Excel file with instructions, sample data, and guidelines with authenticated blob streaming.
5. **Mandatory Course Isolation Modal** — Created `BulkOnboardingModal` enforcing selection of `BCA` vs `MCA` before file processing to guarantee strict cohort isolation. Enforced `credentials: "include"` across all network requests.

### First-Login Security Enforcement
1. **Express Security Interceptor** — Middleware in `server/auth.ts` intercepts authenticated student requests when `forcePasswordReset === true`. Restricts access to `/api/user`, `/api/user/change-password`, and `/api/logout`, returning HTTP 403 `PASSWORD_RESET_REQUIRED` on all other endpoints.
2. **Non-Dismissible Password Reset Dialog** — Global `ForcePasswordResetModal` in React intercepts the session on first login. Validates current password, enforces minimum length of 6 characters, and updates password via `/api/user/change-password` which clears the flag.

### Strict Topic Visibility & Program Isolation
1. **Course-Enforced Topic Visibility** — `GET /api/topics/approved` strictly isolates approved topics based on the student's enrolled course (`BCA` or `MCA`), disabling public caching to prevent cross-course leakage.
2. **Individual Topic Guard** — `GET /api/topics/:id` verifies the topic belongs to the student's program and returns HTTP 403 if attempting to access another course's topic.

### Codebase & Documentation Standardization
1. **Standardized English** — Converted all comments, docstrings, UI labels, toasts, and API messages across the codebase to English.

## Version 1.6.0
### Critical & High Security Fixes
1. **Privilege Escalation Removed** — Deleted the shadow `/auth/register` endpoint that allowed anonymous users to create admin accounts with arbitrary roles. All registration now flows through `/api/register`, which enforces the single-Admin/single-Coordinator rule.
2. **Password Hash Exposure Patched** — `/auth/login` no longer returns the scrypt password hash. The unauthenticated `GET /api/supervisors` endpoint now requires authentication and returns only a safe projection (`id`, `firstName`, `lastName`, `email`).
3. **Progress IDOR Fixed** — `PUT /api/projects/:id/progress` now enforces role-based ownership: project owner (student), topic-proposing supervisor, current group supervisor, or Coordinator/Admin.
4. **WebSocket Identity Spoofing Fixed** — The `/ws` handshake validates the signed `connect.sid` session cookie against the PostgreSQL session store and derives the userId server-side. The client-supplied `?userId=` parameter is ignored; unauthenticated sockets are closed with code 1008.
5. **Dashboard Statistics Guarded** — `GET /api/stats` now requires authentication (previously leaked institution-wide statistics to anonymous callers).

### Functional Fixes
1. **Notification Inbox Now Works End-to-End** — Added `GET /api/notifications`, `PATCH /api/notifications/:id/read` (ownership-enforced), `POST /api/notifications/read-all`, and `DELETE /api/notifications`. The header bell dropdown and `/notifications` page were previously rendering hardcoded mock data; both now use the live API with real-time WebSocket cache invalidation.
2. **Hard Reset = True Fresh Install** — Rewritten as a transactional `TRUNCATE ... RESTART IDENTITY CASCADE`: all ID sequences restart at 1, the default admin is recreated through the canonical seeding path (admin id=1), all WebSocket connections are dropped, the admin's session is destroyed, and the confirmation password is now actually verified server-side. The UI shows an "Export your data first" popup when reset is clicked.
3. **Backup Import Hardened** — Table ID sequences are re-synced past imported `MAX(id)` values after a restore, preventing silent primary-key collisions. Imports no longer terminate the importing admin's session.

### Production Deployment (Windows Server)
1. **One-Click `start_server.bat`** — Fully rewritten: verifies Node.js, bootstraps `.env` from the template on first run, installs dependencies, prepares the database, builds, and starts — with error trapping at every step. (The previous version invoked `npm` without `call`, so it could never chain commands.)
2. **New `npm run db:ensure`** — Production-safe database bootstrap: verifies connectivity with actionable diagnostics, creates the schema + default admin **only if missing**, and safely syncs pending schema changes on updates. Never wipes data (unlike `db:setup`).
3. **Fail-Fast Startup** — `runMigrations()` now verifies all 9 core tables exist before serving traffic. A fresh database previously passed the connectivity-only check and then served `relation "users" does not exist` errors on every request.
4. **Unified Database Configuration** — `DATABASE_URL` is now the single source of truth (parsed by the runtime server, drizzle-kit, and `ensure_db`). The `DB_*` variables work as a fallback style. A conflicting `.env` can no longer point the schema tooling and the server at different databases. `drizzle.config.ts` and `.env.example` updated accordingly.

### Documentation
1. Updated README, Installation Guide, Security Policy, AI Context, and this changelog to reflect v1.6.0 architecture and workflows.

## Version 1.5.0
### Cybertruck Spatial UI Enhancements
1. **Spatial / Glassmorphic UI**: Overhauled the design system with dynamic backdrop filters, glassmorphism, and fluid micro-animations for a modern Spatial OS feel.
2. **Animated Auth Splash Screens**: Added professional, cinematic splash screens (e.g., "WELCOME_ [USERNAME]") that intercept login and logout events with a 2.5s delay.
3. **Dynamic Context Pill**: Replaced traditional bottom-toast notifications with a floating, iOS Dynamic Island-inspired context pill at the top of the UI that expands to display incoming notifications and global toasts.
4. **Holographic Data Grids**: Upgraded standard data tables to holographic grids featuring perspective tilting via Framer Motion 3D transforms when hovered.
5. **Physics-Based Micro-Interactions**: Integrated advanced physics-based spring animations for button presses, hover states, and modal interactions to make the interface feel heavy and responsive.

## Version 1.4.1
### MCA Topic Selection Workflow
1. **Dynamic Workflows by Course**: Introduced distinct topic selection workflows for BCA and MCA students.
2. **MCA Student Suggestions**: MCA students can now propose multiple topics directly to their assigned supervisor.
3. **Supervisor Endorsement**: Supervisors have a dedicated "Student Suggestions" tab to review, endorse, or reject topics proposed by their MCA students.
4. **Auto-Project Assignment**: When a Coordinator or Admin approves an endorsed MCA topic, the system automatically transitions the project status to active, assigning it to the student.
5. **Real-Time Notifications**: Integrated WebSocket notifications to instantly alert supervisors of new student suggestions, and students of endorsement/approval decisions.

### Performance & Accessibility Enhancements
1. **API Response Caching**: Added cache headers for read-heavy endpoints to reduce database queries.
2. **Accessibility Audit**: Ensured proper ARIA labels, keyboard navigation, and WCAG compliance across the application.

### Bug Fixes
1. **Frontend Array Mapping Crash**: Fixed a bug where `.map is not a function` errors would crash frontend tables (`/projects`, `/manage-project`, `/track-progress`, `/user-management`, etc.) because the components expected a raw array but received a `PaginatedResponse` object due to the server-side pagination enhancements in v1.4.0.
2. **Build Configuration Fix**: Corrected a dependency mismatch in `vite.config.ts` where `react-router-dom` was mistakenly referenced in `manualChunks` instead of `wouter`, which caused the production build to fail.

### Documentation
1. **Fixes Required Update**: Expanded the `Fixes_required.md` with new architectural and feature proposals, including Background Jobs, Advanced Rate Limiting, OpenAPI generation, Multi-Department Support, and PDF generation. Numbering anomalies in the document were also resolved.

## Version 1.3.0
### Course Segregation (BCA / MCA)
1. **Schema Update**: Added mandatory `course` field (BCA or MCA) to `users` (Student roles) and `project_topics` schema.
2. **Context-Aware Filtering**: Built a global `CourseFilterContext` accessible via a UI dropdown switch for Admins, Coordinators, and Supervisors to toggle the entire application view between BCA and MCA context.
3. **Strict Student Isolation**: The backend ensures that a BCA student only sees BCA-specific project topics and can only group with BCA students. The same strict isolation applies to MCA students.
4. **UI Indicators**: Added prominent Course Badges to User Management, Approve Topics, Dashboard tables, Manage Projects, and Track Progress pages to ensure clear attribution.
5. **Registration Constraint**: Account creation (signup and admin manual creation) now strictly enforces the selection of a course for Student roles.

### Project Team Management
1. **Terminology Update**: Renamed "Group" to "Project Team" across the entire application for consistency.
2. **Team Creation Constraints**: Implemented strict backend constraints ensuring BCA student teams must have 2 to 5 members and MCA student teams must have 1 to 2 members. Students can only team up with members in their own course.
3. **Special Management Provision**: Admins and Coordinators are granted the exclusive ability to form a BCA team with a single student (size of 1).
4. **Member Search & Editing**: Provided Admins and Coordinators with a powerful autocomplete member search and the ability to add, edit, or remove members in a team from the `/manage-project` page. Supervisors can edit members exclusively for teams they supervise.
5. **Team Edit Notifications**: Integrated automated real-time notifications to Admins, Coordinators, and the relevant Supervisor whenever a team's members are modified.

## Version 1.2.0
### Manual Supervisor Allotment & Manage Project
1. **Manage Project Page**: New dedicated page (`/manage-project`) for Admins and Coordinators to view all project teams, their members, and assigned supervisors in one place.
2. **Manual Supervisor Reassignment**: Admins and Coordinators can now seamlessly change the supervisor assigned to any project team via a "Change Supervisor" dialog with a searchable dropdown.
3. **Notification on Reassignment**: When a supervisor is changed, both the newly assigned and previously assigned supervisors receive real-time notifications.
4. **Sidebar Navigation Update**: "Manage Project" link added under Main Navigation for Admin and Coordinator roles, with a `FolderCog` icon.
5. **Backend APIs**: Added `GET /api/student-project teams` (list all project teams with members/supervisor) and `PATCH /api/student-project teams/:groupId/supervisor` (change supervisor allotment), both restricted to Admin/Coordinator roles.
6. **Storage Layer**: Added `getAllStudentGroups()` and `updateStudentGroupSupervisor()` methods to `db-storage.ts`.

## Version 1.1.2
### Notifications & UI
1. **Real-Time Notifications**: Integrated WebSocket server for instant, zero-polling popups when assignments, approvals, or account modifications occur.
2. **Notification Routing Rules**: Advanced logic applied so only relevant stakeholders receive notifications (e.g. students don't see topic approvals; admins see coordinator modifications).
3. **Interactive Dashboard Widgets**: Dashboard StatsCards are now clickable, routing users directly to respective detail pages with hover animations.
4. **Windows Server Setup**: Created `start_server.bat` for one-click production deployments on Windows Servers.
5. **UI & Theming Revamp**: Overhauled the color palette to ensure AAA high-contrast standards for users with poor eyesight. Removed the `shadcn-theme-json` plugin and manually implemented a unified slate-based color scheme across both Light and Dark themes to ensure perfect visual consistency.
6. **Terminology Refactoring**: System-wide renaming of "Faculty" and "Teacher" keywords to "Supervisor" to align with project management conventions. All roles, database columns, and frontend UI components now consistently use "Supervisor".

## Version 1.1.1

### Bug Fixes & Stability
1. **Migration Pipeline**: Removed the broken file-based migrator in `server/db.ts` that caused startup crashes when `migrations/_journal.json` was missing.
2. Standardized database schema synchronization on `drizzle-kit push` (`npm run db:push`).
3. Added a startup database connectivity check (`SELECT 1`) to ensure the PostgreSQL instance is reachable before serving traffic.

## Version 1.1.0
### Security Enhancements
1. Added `helmet` middleware for robust HTTP security headers (HSTS, X-Frame-Options, CSP, etc.)
2. Implemented `express-rate-limit` on `/api/login` and `/api/register` (5 req / 15 min per IP)

### Database & ORM
1. Implemented soft deletes on `users` and `project_topics` tables via `is_deleted` boolean column
2. `deleteUser()` and `deleteProjectTopic()` now perform UPDATE instead of DELETE
3. All query methods filter out soft-deleted records automatically

### Frontend Architecture
1. Created global `ErrorBoundary` component wrapping the entire app — unhandled errors now show a styled fallback UI instead of a white screen
2. Added optimistic UI updates to Topic Approval page (approve/reject) using TanStack Query `onMutate` with automatic rollback on failure

### Documentation
1. Updated `Fixes_required.md` with completed items and 20+ new improvement suggestions across 7 categories

## Version 1.0.1

### Database Schema Updates
1. Fixed duplicate users table definition in `shared/schema.ts`
2. Added proper foreign key references between tables
3. Updated schema types and relationships
4. Implemented proper table constraints and relationships

### Storage Layer Improvements
1. Replaced raw SQL queries with Drizzle ORM query builder in `server/storage/index.ts`
2. Updated storage functions to use proper table references
3. Implemented type-safe queries using Drizzle
4. Added proper error handling and return types

### UI/UX Enhancements
1. Updated Project Teams page layout and styling
   - Added MainLayout component integration
   - Improved card styling and consistency
   - Enhanced form layouts and input handling
   - Added proper loading states and error handling
   - Implemented proper spacing and typography

2. Added Project Team Information Feature
   - Implemented "Team Info" button for users not in project teams
   - Added dialog showing available project teams
   - Included detailed group information display:
     * Group name and description
     * Member count
     * Current members with profile pictures
     * Full names and enrollment numbers
     * Project mentor details

### General Improvements
1. Enhanced error handling across the application
2. Improved type safety with TypeScript
3. Updated component styling for consistency
4. Added proper loading states throughout the application

## Planned Features
1. Enhanced group collaboration tools
2. Advanced project tracking features
3. Email notification integration
4. File upload support for milestones
5. Audit log for admin operations

## Known Issues
- None reported in current version

## Dependencies
- Node.js (v18 or higher)
- PostgreSQL
- Yarn package manager
- React + Vite
- Drizzle ORM
- Express.js
- TypeScript
- Tailwind CSS
