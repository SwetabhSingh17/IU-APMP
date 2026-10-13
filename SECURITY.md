# Security Policy

This document outlines the security policies, supported versions, protective measures, and vulnerability reporting procedures for the Academic Project Management System (APMS).

---

## 📋 Table of Contents

- [Supported Versions](#supported-versions)
- [Security Posture (v2.3.2)](#security-posture-v232)
  - [Authentication & Cryptography](#authentication--cryptography)
  - [Access Control & Authorization](#access-control--authorization)
  - [Network & Infrastructure Security](#network--infrastructure-security)
  - [Data Protection & Account Retention](#data-protection--account-retention)
- [Reporting a Vulnerability](#reporting-a-vulnerability)

---

## Supported Versions

Currently, the following versions of this project are actively supported with security updates:

| Version | Supported | Notes |
|:---|:---:|:---|
| **v2.x** | ✅ | Actively supported (Current production release: v2.3.2) |
| **v1.9.x** | ✅ | Critical security maintenance |
| **v1.8.x** | ✅ | Legacy security maintenance |
| **< v1.8** | ❌ | Unsupported; please upgrade to v2.x |

---

## Security Posture (v2.3.2)

IU-APMP ships with the following protections in place:

### Authentication & Cryptography
- **Authentication & Cryptography** — Passport.js local strategy with scrypt password hashing; PostgreSQL-backed sessions (`connect-pg-simple`) with a 15-minute rolling inactivity expiry.
- **Automated Password Migration** — Automatic detection of legacy plaintext records upon login, upgrading them to salted scrypt hashes in-place with zero user friction.
- **Default Password Reset with Strict RBAC Protection** — One-click password reset endpoint (`POST /api/admin/users/:id/reset-password`) sets credentials to official identifiers (students: enrollment number, supervisors: employee ID) and flags `forcePasswordReset: true`. Coordinators are strictly forbidden from modifying or resetting Admin/Coordinator accounts (`FORBIDDEN_TARGET_STAFF`), and all staff resets trigger instant audit notifications to Administrators.
- **First-Login Password Reset Interceptor** — Accounts provisioned via Excel or default reset are flagged with `forcePasswordReset: true`. Operational APIs (topic browsing, team interactions, submissions) are intercepted with HTTP 403 `PASSWORD_RESET_REQUIRED` and frontend non-dismissible modals until default credentials are replaced.
- **Granular Error Codes & Leakage Prevention** — Standardized machine-readable error codes (`USER_NOT_FOUND`, `INVALID_PASSWORD`, `ACCOUNT_DEACTIVATED`, etc.) prevent internal stack trace leakage while providing clear diagnostic telemetry. Password hashes and internal salts are strictly stripped from all API responses.

### Access Control & Authorization
- **Authorization** — Role-based access control (Admin / Coordinator / Supervisor / Student) enforced server-side via `requireRole()` plus per-resource ownership checks (projects, assessments, notifications).
- **Single-Team Integrity & Concurrency Guard** — Partial unique database index (`idx_student_group_members_unique_accepted` on `student_group_members(user_id) WHERE status = 'accepted'`) guarantees at the database level that a student can never concurrently belong to multiple accepted teams.
- **Consolidated Route Authorization & Shadowing Elimination** — User management routes (`POST`, `PATCH`, `DELETE` under `/api/admin/users`) are strictly consolidated into `server/routes/admin.ts` with explicit RBAC checks, eliminating route-shadowing vulnerabilities.
- **Strict Cohort/Program Isolation** — BCA and MCA topic visibility, team rosters, and proposal catalogs are strictly partitioned; students are isolated to their registered curriculum to prevent cross-cohort data leakage.
- **Team Access Control, Safe Dissolution & Account Retention** — Students and Supervisors are prohibited from modifying or leaving project teams. Only Administrators and Coordinators have authorization to modify team rosters, reassign supervisor mentorship, or dissolve teams. Team dissolution strictly retains member student user accounts intact without data loss, safely unlinking team associations and milestones so students remain active and eligible for future team allotment.
- **Supervisor Mentorship Conflict Prevention & Isolation** — Strict integrity validation on group-to-topic and group-to-supervisor relationships detects and alerts when a team's supervisor is changed without updating project ownership. Dual-action resolution enforces either isolated topic cloning (`PUGID26xxx`) or clean topic ownership migration, maintaining database referential integrity and preventing unauthorized cross-supervisor data access.

### Network & Infrastructure Security
- **Rate Limiting** — `express-rate-limit` on `/api/login` and `/api/register`.
- **Security Headers & Network Hardening** — Helmet middleware with intranet/LAN-calibrated cross-origin policies, private caching headers on sensitive endpoints, and host adapter binding (`0.0.0.0`).
- **Session-Authenticated WebSockets** — Real-time notification sockets validate the signed session cookie server-side; identity cannot be spoofed via query parameters.

### Data Protection & Account Retention
- **Soft Deletes** — Users and topics are retained via an `is_deleted` flag; queries filter them automatically.
- **Hardened Destructive Operations** — Database reset requires the admin to re-enter their password (verified against the scrypt hash) and fully destroys the server session afterward.

---

## Reporting a Vulnerability

We take the security of our project seriously. If you discover a security vulnerability, please follow these steps:

1. **Do not open a public issue.** This ensures the vulnerability is not exploited before a patch is available.
2. Please report the vulnerability privately by emailing us at `security@example.com` or by opening a Draft Security Advisory on GitHub.
3. Provide a clear description of the vulnerability, including steps to reproduce it and the potential impact.

We will strive to acknowledge your report within 48 hours, and will provide an expected timeline for a fix and a coordinated release. Thank you for helping keep this project safe!
