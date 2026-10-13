<p align="center">
  <h1 align="center">🎓 IU-APMP (Integral University Academic Project Management Portal)</h1>
  <p align="center">
    A comprehensive academic project management portal for Integral University — streamlining project topic approval, student group formation, supervisor mentoring, progress tracking, complete A-Z backup & restore, and official multi-page university reporting.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.3.2-blue.svg" alt="Version 2.3.2" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Express.js-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

---

## 📋 Table of Contents

- [✨ Key Features](#key-features)
- [📊 System Architecture & Workflow](#system-architecture--workflow)
- [🏗️ Tech Stack](#tech-stack)
- [📁 Project Structure](#project-structure)
- [🚀 Getting Started](#getting-started)
  - [Quick Start (Recommended)](#quick-start-recommended)
  - [Manual Installation](#manual-installation)
  - [Gracefully Updating an Existing Application](#gracefully-updating-an-existing-application)
- [⚙️ Configuration](#configuration)
- [📜 Available Scripts](#available-scripts)
- [👥 User Roles](#user-roles)
- [🤝 Contributing](#contributing)
- [📄 License](#license)
- [🤖 AI Context & Future Fixes](#ai-context--future-fixes)

---

## ✨ Key Features

- **Role-Based Access Control** — Four distinct roles: Admin, Coordinator, Supervisor, Student.
- **Project Topic Workflows** — Dynamic selection paths based on student course:
  - **BCA**: Supervisors submit topics → Coordinators approve → Students select.
  - **MCA**: Coordinators assign Supervisors → Students suggest topics → Supervisors endorse → Coordinators approve.
- **Admin & Coordinator Direct Topic Creation with Faculty Assignment** — Administrators and Coordinators can author approved project topics directly from `/approve-topics`, select any registered faculty supervisor, and assign the topic with instant auto-approval and sequential PUGID generation.
- **Multi-Word Search Engine & In-Memory Indexing** — Fast, tokenized multi-attribute search across all catalogs, data tables, and modals (`client/src/lib/search-index.ts`). Handles multiple words separated by whitespace, ignores typing spaces gracefully, and executes sub-millisecond lookups.
- **Course Segregation (BCA / MCA)** — Strict isolation of student accounts, project topics, and project teams based on their registered course.
- **Project Team Management** — Create project teams, invite members, assign supervisor mentors. Constraints strictly enforced (BCA: 2-5 members, MCA: 1-2 members). Admins & Coordinators have exclusive ability to manage team members directly and form single-member BCA teams. Students and supervisors do not have permission to modify rosters or leave teams.
- **Dedicated Team Management Portal (`/team-management`)** — Centralized administrative console for Admins and Coordinators to oversee all student project teams with five distinct status tabs (`All Teams`, `Pending Topics`, `Assigned Topics`, `With Supervisor`, `Without Supervisor`), global course filtering (BCA/MCA), live search across names, enrollments, topics, and supervisors, inline team detail editing, member addition/removal with course and capacity validation, and safe team dissolution preserving student user accounts intact.
- **Dedicated Supervisor Management Portal (`/supervisor-management`)** — Comprehensive governance portal for Administrators and Coordinators to monitor faculty workloads, topic proposals, and group assignments. Features real-time metric tiles (Supervisors, Active Mentors, Available, Topics, Allotments), dynamic telemetry ratios (`Active Teams Allotted / Total Projects Submitted`), global course filtering, direct team-to-topic allotment under supervisor submitted topics, safe topic unassignment with student account preservation, supervisor profile editing, and topic review/approval. Includes a fully reactive layout with a default **Cards View** (zero horizontal boundary overflow, with View, Edit, and Manage actions always accessible) and a **Table View Toggle** with pinned sticky actions.
- **Interactive Dual-Action Supervisor Conflict Resolution Engine & Single-Team Guard** — Intelligent conflict detection engine detecting when an Admin or Coordinator changes a student group's supervisor without updating the underlying project topic author. Wrapped in atomic database transactions (`db.transaction`) with PostgreSQL transaction-level advisory locking (`pg_advisory_xact_lock(26001)`) to serialize sequential PUGID generation (`PUGID26xxx`). Supported by a partial unique database index (`idx_student_group_members_unique_accepted`) guaranteeing students cannot hold multiple accepted team memberships concurrently, completely preventing circular cross-team conflict loops. Features real-time alert banners on the Dashboard and Supervisor Management, plus an interactive dual-action modal: **Option 1 (Copy & Assign Cloned Project)** creates a duplicated topic with a new PUGID (`PUGID26xxx`) for the new mentor while unassigning the original topic, and **Option 2 (Migrate Topic Ownership)** transfers topic authorship cleanly with zero data loss.
- **Dynamic Supervisor Mentorship Telemetry & Workload Capacity Formulation** — Accurately tracks faculty project engagement by calculating active allocations against total submitted proposals ($C$). Telemetry displays dynamic statuses ($0 \to$ `Available`, $\ge C \to$ `Maximum`, $\ge \lceil C \times 0.7 \rceil \to$ `High`, else $\to$ `Optimal`) with descriptive tooltips and real-time cache invalidation across team and project updates.
- **Decoupled & Optional Supervisor Allotment** — Reflecting institutional workflows where faculty supervisors are assigned upon project topic selection, supervisor assignment during team creation is fully optional. If unselected, teams are provisioned cleanly without a supervisor and seamlessly assigned once a project topic is chosen.
- **Manage Project (Pending & Assigned Tabs + Supervisor Search)** — Admins & Coordinators can view all project teams segmented into "Pending" (unallotted) and "Assigned" tabs with live count badges under the reorganized "Management" section. Includes a unified modal featuring real-time faculty directory search across 60+ supervisors by name, prefix, department, designation, and email.
- **Dedicated Supervisor Portal ("My Topics & Teams")** — Supervisors enjoy an exclusive dashboard displaying only their proposed topics, real-time allotment status (`Picked` vs `Available`), PUGID codes, and full team roster details.
- **Student Topic Confirmation Dialog** — Non-reversible confirmation alert dialog ensuring students review topic details, confirm team allotment, and prevent accidental selections.
- **Progress Tracking** — Real-time dashboards with charts and department statistics.
- **Project Assessments** — Supervisor grading with score and feedback.
- **Real-Time Notifications** — WebSocket-powered instant notifications with role-based routing, plus a persistent per-user inbox (bell dropdown + notifications page with read/unread state).
- **Enrollment Number Conflict Detection & Resolution UI** — Intelligent conflict detection across cohorts that highlights students sharing duplicate enrollment numbers. Administrators and Coordinators are alerted on the Dashboard and User Management with live conflict cards, amber row highlighting, a dedicated "Conflicts" directory tab, and an interactive modal to reassign unique enrollment numbers and synchronize credentials without data loss.
- **Admin & Coordinator Project Topic Reassignment** — Dynamic topic modification in `/manage-project` allowing Admins and Coordinators to change or assign project topics for groups, complete with live search, course filters, and real-time student team notification dispatch.
- **100% Student Contact Directory & Verified Mobile Population** — 100% of student accounts (701/701) are provisioned with clean 10-digit mobile numbers from the official university roster (`CA321_Project Lab_Team_Formation_2026-27.xlsx`), accessible across Admin, Coordinator, and Supervisor portals (team management, project views, and user directories).
- **User Management, Dynamic Project Status & One-Click Password Reset** — Admin panel for bulk user operations, role changes, and one-click default password resets with automatic `forcePasswordReset` enforcement. Features live student project status badges (`Active` with green badge and topic tooltip, `Completed` with blue badge, or `No Project` with gray badge) and live supervisor approved topic counts, replacing static placeholders with real-time relational data.
- **Excel Bulk Onboarding & Real-Time Progress Streaming** — Coordinators and Admins can upload multi-sheet Excel files (`.xlsx`) to provision entire cohorts at once. Features real-time SSE progress telemetry with a smooth progress bar and collapsible live event terminal, automatic team linking by `projectTeamId`, institutional email generation, high-performance in-memory batching (700+ accounts provisioned in <1s), and downloadable demo Excel templates.
- **Dedicated Supervisor Onboarding & Faculty Directory** — Isolated workflow with a distinct "Bulk Upload Supervisor" console supporting official staff lists (`.xls` and `.xlsx`). Extracts Employee ID, academic titles/prefixes, designation, mobile, and official email. Generates exact-match demo templates and provisions accounts with Employee ID credentials.
- **Bulk Project Topic Upload & Sequential PUGID Generation** — Ingest Google Forms response spreadsheets (`.xlsx`) to bulk-upload faculty project suggestions. Cross-checks faculty Name and Email against existing supervisor accounts in PostgreSQL, skips unmatched records with an explicit Failure Report, and auto-generates sequential unique IDs (`PUGID26001`, `PUGID26002`, etc.) visible throughout topic approval and student views.
- **First-Login Security Enforcement** — Students and faculty supervisors onboarded via Excel or default password reset receive temporary initial passwords matching their identifier; upon first login, a non-dismissible modal and backend security interceptor enforce a mandatory password change before granting system access.
- **Institutional Branding & Registration Gate** — Features the official Department logo, university typography headers, creator attributions, and a registration closed overlay on the authentication page (`IS_REGISTRATION_OPEN = false`).
- **Academic Profile Management & Designation RBAC** — Profile settings displays the supervisor's designation directly beneath their name. Faculty can update personal prefixes, name details, email, and mobile, while academic designation remains protected and immutable except by authorized administrators.
- **Complete A-Z Backup & Archive Export (.zip)** — One-click backup extracting 100% of portal state across all 8 database tables (`student_groups`, `users`, `student_group_members`, `project_topics`, `student_projects`, `project_assessments`, `project_milestones`, `notifications`), individual per-table JSONs, consolidated full dump, integrity manifest, and SQL emergency recovery scripts with automatic server-side retention in `database/backups/`.
- **High-Fidelity Topological Restore Engine** — Restores the portal replicating original state exactly in strict foreign key dependency order with atomic transaction protection (`db.transaction`), PostgreSQL sequence synchronization (`setval`), session retention, and automatic pre-restore safety snapshots.
- **Official Multi-Page University Excel Report (.xlsx)** — Generates an official 8-sheet master workbook (Overview KPIs, Student Details with natural TeamID cohort ordering and vertically merged team cells, Faculty Supervisors sorted in natural alphanumeric order by EmpID with sequential numbering, Project Teams, Topics Catalog, Student Allocations, Assessments & Marks, Milestones & Deadlines) for departmental and university administrative use.
- **System Management Console Upgrade** — Interactive console with pre-flight file inspection (badges, timestamp, record count previews), live progress bar, stage indicator, event logs, and in-dialog error diagnosis.
- **Security Hardened** — Helmet HTTP headers, rate-limited auth endpoints, soft-delete data retention, session-authenticated WebSockets, automatic scrypt password migration, per-resource ownership checks, and password-verified destructive operations.
- **Error Resilient** — Global React Error Boundaries with graceful fallback UI and standardized machine-readable API error codes.
- **Cybertruck Spatial UI** — Glassmorphism, dynamic context pill (iOS-style), holographic data grids, physics-based micro-interactions, and animated cinematic splash screens.
- **Dark/Light Theme** — System-aware with manual toggle.
- **Synchronized Project Topic & Supervisor Reflection** — Ensures topic updates and supervisor reassignments made by Admins and Coordinators reflect synchronously across student dashboards, project views, and supervisor evaluation portals.
- **Complete Technology Stack Visibility** — Responsive badges and word-wrap chip formatting for project technologies, eliminating single-line ellipsis clipping (`...`) during student topic selection and on project dashboards.
- **Responsive Design** — Mobile-friendly layouts with collapsible sidebar.

---

## 📊 System Architecture & Workflow

The following graph outlines how different users interact within the APMS ecosystem, from topic creation to final grading:

```mermaid
graph TD
    %% Styling
    classDef default fill:#111,stroke:#333,stroke-width:2px,color:#fff;
    classDef user fill:#0369a1,stroke:#bae6fd,stroke-width:2px,color:#fff;
    classDef core fill:#047857,stroke:#6ee7b7,stroke-width:2px,color:#fff;
    classDef output fill:#be185d,stroke:#fbcfe8,stroke-width:2px,color:#fff;

    %% Nodes
    A[Student]:::user -->|Submit Topic - MCA| B(Topic Proposal)
    A -->|Select Topic - BCA| B
    A -->|Form Team| C(Project Team)
    
    D[Supervisor]:::user -->|Submit Topic - BCA| B
    D -->|Endorse Topic - MCA| B
    D -->|Evaluate| E(Project Milestone)
    D -->|Grade| F[Final Assessment]:::output
    
    G[Coordinator/Admin]:::user -->|Approve| B
    G -->|Assign Supervisor - MCA| C
    G -->|Monitor| H(Progress Tracking)
    
    B -->|Verified| I{Core Database}:::core
    C -->|Registered| I
    E -->|Logged| I
    I --> H
    H --> F
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, wouter (routing), TanStack Query, Framer Motion |
| **UI Components** | shadcn/ui (Radix UI primitives), TailwindCSS, Recharts |
| **Backend** | Express.js, Node.js |
| **Authentication** | Passport.js (Local Strategy), express-session, connect-pg-simple |
| **Database** | PostgreSQL, Drizzle ORM |
| **Validation** | Zod, drizzle-zod |
| **Language** | TypeScript (end-to-end) |

---

## 📁 Project Structure

```
APMS/
├── client/                 # Frontend SPA
│   ├── src/
│   │   ├── pages/          # 17 route pages (auth, dashboard, projects, team-management, supervisor-management, etc.)
│   │   ├── components/     # UI components (shadcn/ui + custom)
│   │   │   ├── ui/         # 48 shadcn/ui primitives
│   │   │   ├── layout/     # MainLayout, Sidebar, Header
│   │   │   └── dashboard/  # Dashboard-specific components
│   │   ├── hooks/          # useAuth, useToast, useNotifications, useMobile
│   │   └── lib/            # QueryClient, search-index.ts, utils, ProtectedRoute
│   └── index.html
├── server/                 # Backend API
│   ├── index.ts            # Express app entry point & route aggregation
│   ├── auth.ts             # Passport.js auth setup (RBAC)
│   ├── db.ts               # Database connection, unified config resolution, boot-time schema verification
│   ├── db-storage.ts       # Storage layer (repository pattern over Drizzle ORM)
│   ├── websocket.ts        # Session-authenticated WebSocket server for real-time notifications
│   └── routes/             # Modular API routes (auth, users, projects, topics, groups, notifications, etc.)
├── shared/                 # Shared code
│   └── schema.ts           # Drizzle table definitions + Zod schemas + TypeScript types
├── scripts/                # Database utilities & verification suites
│   ├── ensure_db.ts        # Production-safe bootstrap (schema check + non-destructive setup)
│   ├── setup_db.ts         # Full database reset (destructive)
│   ├── backup_schema.ts    # Schema backup
│   ├── restore_schema.ts   # Schema restore
│   ├── verify_search_indexing.ts          # Search engine tokenization & benchmark suite
│   ├── verify_phase_6_enhancements.ts    # Direct topic creation & UI suite
│   ├── verify_password_reset_and_login.ts # Password reset, scrypt hashing & RBAC suite
│   ├── verify_priority_bug_fixes.ts       # Priority bug fixes verification suite
│   ├── verify_team_management_and_supervisor_fix.ts # Team management suite
│   ├── verify_topic_selection_and_routing.ts        # Student topic confirmation & routing suite
│   ├── verify_onboarding_and_access_control.ts      # Student bulk onboarding suite
│   ├── verify_supervisor_onboarding_and_rbac.ts     # Supervisor onboarding suite
│   ├── verify_bulk_topic_onboarding.ts              # Topic bulk upload & PUGID suite
│   └── e2e_verify.ts                                # End-to-end integration test suite
└── Setup_Assistant/        # Cross-platform installation scripts
```

---

## 🚀 Getting Started

### Quick Start (Recommended)

For the simplest setup experience, use the automated Setup Assistant. It will automatically install dependencies, set up the database, and start the server.

**Step 1: Get the Code**
```bash
git clone https://github.com/SwetabhSingh17/IU-APMP.git
cd IU-APMP
```

**Step 2: Run the Setup Assistant**

**Windows Users:**
1. Open the `Setup_Assistant` folder.
2. Double-click `INSTALL_WINDOWS.bat`.

**Mac / Linux Users:**
1. Open Terminal and navigate to the `Setup_Assistant` folder.
2. Run the installation script:
```bash
chmod +x install_mac_linux.sh
./install_mac_linux.sh
```

---

### Manual Installation

If you prefer to run the steps manually:

1. **Clone the repository**
   ```bash
   git clone https://github.com/SwetabhSingh17/IU-APMP.git
   cd IU-APMP
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Copy the example environment file and update it with your credentials:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your PostgreSQL connection string and a secure session secret. See [Configuration](#️-configuration) for details.

4. **Set up the database**
   
   Initialize the database schema and default admin account:
   ```bash
   npm run db:ensure
   ```
   *(Safe to re-run at any time — it only creates what is missing and never wipes data. Use `npm run db:setup` for a full destructive reset.)*

5. **Start the development server**
   ```bash
   npm run dev
   ```
   
   The app will be available at `http://localhost:3000`.

---

### Gracefully Updating an Existing Application

If you already have a running instance and want to pull the latest code without losing your database state:

**Windows Server (one click):** Just double-click `start_server.bat` — it installs dependencies, safely syncs the database schema (`db:ensure` never wipes data), rebuilds, and restarts.

**Manual:**
1. **Stop the server** (`Ctrl + C`).
2. **Get the latest code** using `git pull origin main` (or extract a new ZIP, remembering to copy over your `.env` file from the old folder).
3. **Install new dependencies**:
   ```bash
   npm install
   ```
4. **Apply safe schema updates**:
   ```bash
   npm run db:ensure
   ```
5. **Restart your server**.

---

## ⚙️ Configuration

All configuration is managed through a `.env` file at the project root.

| Variable | Required | Description | Example |
|---|:---:|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string — the canonical config used by both the server and database tooling (optional if `DB_*` individual variables are used) | `postgres://user:pass@localhost:5432/integral_project_hub` |
| `SESSION_SECRET` | ✅ | Secret key for session encryption | A long random string |
| `PORT` | ❌ | Server port (default: `3000`) | `3000` |
| `NODE_ENV` | ❌ | Environment mode | `development` / `production` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | ❌ | Alternative individual database settings when `DATABASE_URL` is omitted (requires `DB_HOST`, `DB_NAME`, `DB_USER`; defaults `DB_PORT` to 5432 and `DB_PASSWORD` to empty string) | `localhost`, `5432`, `integral_project_hub`... |

> [!NOTE]
> See `.env.example` for a ready-to-use template. On first run, `start_server.bat` creates `.env` from this template automatically.

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (Vite HMR + Express) |
| `npm run build` | Build for production (client + server) |
| `npm start` | Start production server |
| `npm run check` | Run TypeScript type checking (`tsc`) |
| `npm test` | Run TypeScript check and complete automated test suite across all 10 test suites |
| `npm run test:backup` | Run complete A-Z backup export, topological restore ordering, and multi-sheet university excel verification suite |
| `npm run test:search` | Run multi-word search engine tokenization & sub-millisecond benchmark suite |
| `npm run test:admin-topics` | Run direct topic creation with faculty assignment verification suite |
| `npm run test:teams` | Run team management CRUD, safe dissolution & supervisor optional verification suite |
| `npm run test:password` | Run password reset, default credentials, RBAC & login verification suite |
| `npm run test:fixes` | Run priority bug fixes verification suite |
| `npm run test:selection` | Run student topic selection, confirmation & routing verification suite |
| `npm run test:onboarding` | Run automated student Excel onboarding and access control verification suite |
| `npm run test:supervisor` | Run automated supervisor onboarding and profile RBAC verification suite |
| `npm run test:topics` | Run bulk topic onboarding, supervisor validation & sequential PUGID verification suite |
| `npm run test:e2e` | Run end-to-end integration flow tests |
| `npm run db:ensure` | ✅ Safe database bootstrap — verifies connectivity, creates missing tables + default admin, syncs schema changes. Never wipes data |
| `npm run db:setup` | Clean install schema and initialize default admin (⚠️ wipes all data) |
| `npm run db:push` | Push non-destructive schema changes to existing database |
| `npm run db:backup` | Backup database schema and data |
| `npm run db:restore` | Restore database from backup |
| `npm run db:hard-reset` | ⚠️ Full database reset (destructive) |

---

## 👥 User Roles

| Role | Capabilities |
|---|---|
| **Admin** | Full system access, user management, direct topic creation & assignment, team management, supervisor management, safe team dissolution, database operations, Excel reports, supervisor reassignment |
| **Coordinator** | Approve/reject topics, direct topic creation & assignment, track progress, manage users, team management, supervisor management, roster modification, safe team dissolution, view statistics, reassign supervisors, filter by course context |
| **Supervisor** | Submit project topics (tied to specific course), evaluate assigned projects, view student progress |
| **Student** | Browse & select topics specific to their course, form project teams within their course, invite members, track own progress |

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🤖 AI Context & Future Fixes

- **AI Context**: A dedicated context file (`AI_CONTEXT.md`) provides LLMs and AI assistants with a comprehensive overview of the architecture, stack, and workflows.
- **Fixes Required**: A list of architectural, security, and maintenance suggestions is maintained in `Fixes_required.md`. Contributors can refer to it for planned refactoring.
