# Requirements: IU-APMP (Integral University Academic Project Management Portal)

**Defined:** 2026-10-06
**Version:** v2.3.1
**Core Value:** Streamline and govern the academic project lifecycle with strict course isolation (BCA vs MCA), balanced faculty mentorship workload limits, and transparent real-time status reflection across all departmental stakeholders.

## Completed Requirements (Archived in v2.1.0)

See [milestones/v2.1.0-REQUIREMENTS.md](milestones/v2.1.0-REQUIREMENTS.md) for full audit.

- [x] **SEARCH-01**: Multi-word and space-separated query tokenization across all client and server search interfaces
- [x] **SEARCH-02**: High-performance index-behaving search engine module (`client/src/lib/search-index.ts`) with multi-attribute normalization, pre-indexing, and instant lookup
- [x] **UI-01**: Admin and Coordinator Direct Topic Creation with Faculty Assignment in `/topics` (Approve Topics)
- [x] **UI-02**: Navigation Pane Reorganization & Label Renaming (Main Navigation -> Navigation, Manage Project -> Project Management, Setting -> Account Setting)
- [x] **UI-03**: Fix misleading import success message on `/system-management`
- [x] **UI-04**: Implement or safely stub Notification Preferences in `server/routes/users.ts`

## Active Requirements (Milestone v2.2.0)

### Project Branding & Identity

- [x] **RENAME-01**: Rename portal to IU-APMP (Integral University Academic Project Management Portal) across sidebar, page titles, navigation, and package metadata, strictly leaving login page (`auth-page.tsx`) untouched

### Data Integrity, A-Z Backup & Restore

- [x] **BACKUP-01**: Complete A-Z Backup Export archives all 8 database tables (groups, users, members, topics, projects, assessments, milestones, notifications) plus metadata manifest
- [x] **BACKUP-02**: Backup export packages data into downloadable folder/archive containing individual JSON files per table, full database dump, and SQL fallback script, auto-saving to `database/backups/`
- [x] **BACKUP-03**: Topological restore engine reconstructs database with exact fidelity in foreign key dependency order without constraint violations
- [x] **BACKUP-04**: Atomic transaction restore with automated pre-restore safety snapshot, PostgreSQL sequence synchronization past MAX(id), and active admin session retention

### University Reporting & Exports

- [x] **EXCEL-01**: Multi-sheet university Excel workbook export generating 8 dedicated worksheets (Overview & Summary, Student Details, Faculty Supervisors, Project Teams, Project Topics, Student Projects, Assessments, Milestones) with natural Team ID cohort grouping and vertically merged team cells for institutional use

### Security & Access Control

- [ ] **SEC-01**: Server-side registration closure toggle in `/api/register` rejects unauthorized registration requests
- [ ] **SEC-02**: Server-side input sanitization cleans user text fields (topic descriptions, student feedback) before persistence

### System Observability & Activity

- [ ] **AUDIT-01**: Dynamic audit event logging replaces static mock list in `GET /api/activities`
- [ ] **AUDIT-02**: Dashboard displays real department events (topic approvals, team allotments, password resets)

### Architecture & Modularity

- [ ] **ARCH-01**: Route handlers delegate business logic to decoupled service modules
- [ ] **ARCH-02**: Remove redundant HTTP server instantiation in `server/routes/index.ts`

## Deferred Requirements

### Performance & Scaling

- **PERF-01**: Redis pub/sub adapter for multi-instance WebSocket broadcasting
- **PERF-02**: Worker threads or streaming parser for massive multi-megabyte Excel workbooks

### Features

- **FEAT-01**: Transactional email dispatch (SMTP/Nodemailer) for offline alerts
- **FEAT-02**: PDF export capabilities for official student project allocation sheets

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Public Cloud Storage (S3/GCS) | System is intentionally built for self-contained institutional on-premise and LAN deployments |
| Third-party OAuth / Social Login | Identity relies exclusively on verified university enrollment numbers and employee IDs |
| Client-Side Registration Bypasses | Registration closure must be enforced strictly server-side |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEARCH-01 | Archived v2.1.0 | Complete |
| SEARCH-02 | Archived v2.1.0 | Complete |
| UI-01 | Archived v2.1.0 | Complete |
| UI-02 | Archived v2.1.0 | Complete |
| UI-03 | Archived v2.1.0 | Complete |
| UI-04 | Archived v2.1.0 | Complete |
| BACKUP-01 | Phase 1 | Pending |
| BACKUP-02 | Phase 1 | Pending |
| BACKUP-03 | Phase 1 | Pending |
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 2 | Pending |
| AUDIT-01 | Phase 3 | Pending |
| AUDIT-02 | Phase 3 | Pending |
| ARCH-01 | Phase 4 | Pending |
| ARCH-02 | Phase 4 | Pending |

**Coverage:**
- Active v2.2.0 requirements: 9 total
- Archived v2.1.0 requirements: 6 total
- Unmapped: 0

---
*Last updated: 2026-10-06 after archiving Milestone v2.1.0*
