---
last_mapped_commit: a672e1e53b1e5280fad2d5fdeb2795de95133954
last_mapped_at: 2026-10-06
---
# Testing Patterns

**Analysis Date:** 2026-10-06

## Test Framework

**Runner:**
- `tsx` (TypeScript Execute) running automated standalone TypeScript verification scripts
- Runner engine: Node.js + `tsx` 4.19.3
- Config: Configured via `package.json` scripts

**Assertion Library:**
- Custom lightweight assertion harness embedded in verification scripts with formatted emoji output (`✅ [PASS]`, `❌ [FAIL]`)
- TypeScript compiler static type check (`tsc`)

**Run Commands:**

```bash
npm test                                              # Type check + all verification test suites
npm run check                                         # TypeScript compilation & type checking
npm run test:backup                                   # Full system backup, restore & university Excel export suite
npm run test:search                                   # Multi-word search tokenization & engine benchmark
npm run test:admin-topics                             # Direct admin topic creation & PUGID suite
npm run test:teams                                    # Team management & supervisor optional test
npm run test:fixes                                    # Priority bug fixes verification
npm run test:password                                 # Password reset & login verification
npm run test:onboarding                               # Student onboarding & RBAC verification
npm run test:supervisor                               # Supervisor onboarding & RBAC verification
npm run test:topics                                   # Bulk topic onboarding verification
npm run test:selection                                # Topic selection & routing verification
npm run test:e2e                                      # End-to-end multi-role verification
```

## Test File Organization

**Location:**
- Verification test scripts are centralized in `scripts/`.
- No separate `__tests__` or `*.test.ts` directories are co-located in `src/` to prevent cluttering application modules.

**Naming:**
- Verification scripts follow the snake_case convention prefixed with `verify_` or `test_`:
  - `scripts/verify_team_management_and_supervisor_fix.ts`
  - `scripts/verify_priority_bug_fixes.ts`
  - `scripts/verify_password_reset_and_login.ts`
  - `scripts/verify_onboarding_and_access_control.ts`
  - `scripts/verify_supervisor_onboarding_and_rbac.ts`
  - `scripts/verify_bulk_topic_onboarding.ts`
  - `scripts/verify_topic_selection_and_routing.ts`
  - `scripts/verify_admin_coordinator_projects.ts`
  - `scripts/e2e_verify.ts`

**Structure:**

```
scripts/
├── e2e_verify.ts
├── verify_admin_coordinator_projects.ts
├── verify_backup_and_excel_export.ts
├── verify_bulk_topic_onboarding.ts
├── verify_onboarding_and_access_control.ts
├── verify_password_reset_and_login.ts
├── verify_phase_6_enhancements.ts
├── verify_priority_bug_fixes.ts
├── verify_search_indexing.ts
├── verify_supervisor_onboarding_and_rbac.ts
├── verify_team_management_and_supervisor_fix.ts
└── verify_topic_selection_and_routing.ts
```

## Test Structure

**Suite Organization:**

```typescript
import "dotenv/config";
import { DBStorage } from "../server/db-storage";
import { UserRole, users, studentGroups } from "@shared/schema";
import { db } from "../server/db";
import { eq, inArray } from "drizzle-orm";

async function runVerification() {
  console.log("==================================================================");
  console.log("🚀 VERIFYING WORKFLOW OR BUG FIX");
  console.log("==================================================================\n");

  const storage = new DBStorage();
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    }
  }

  try {
    // 1. Arrange & Act
    // 2. Assert
    // 3. Scoped Clean Up
  } finally {
    process.exit(totalTests === passedTests ? 0 : 1);
  }
}
```

**Patterns:**
- **Setup Pattern:** Reads credentials from `.env`, initializes `DBStorage`, and discovers or provisions scoped test entities with timestamped unique keys (`TEST_USER_${Date.now()}`).
- **Teardown Pattern:** Scoped deletions (`inArray(...)`) targeted strictly at created test entity IDs, preventing wholesale data loss of production or demo records.
- **Assertion Pattern:** Explicit assertions verifying state in PostgreSQL, checking HTTP response codes, and validating schema invariants.

## Mocking

**Framework:**
- No external mocking library (e.g. Sinon, Jest mocks) is used.
- Tests execute real integration queries against the target PostgreSQL test database instance to ensure real foreign-key and transaction integrity.

**What to Mock:**
- Email delivery services or external webhooks if implemented in future phases.

**What NOT to Mock:**
- Database operations: Run real Drizzle ORM queries against PostgreSQL to test actual SQL constraints, cascades, indexes, and triggers.
- Authentication hashing: Use real `scrypt` hashing and timing-safe verification.

## Fixtures and Factories

**Test Data:**

```typescript
const timestamp = Date.now();
const testEnrollment = `TEST_ENROLL_${timestamp}`;
const testUsername = `test_student_${timestamp}`;
const [testStudent] = await db.insert(users).values({
  username: testUsername,
  password: await hashPassword("TestPassword123!"), // Use hashPassword() for standard fixtures; plaintext is only used when testing legacy password migration
  firstName: "Test",
  lastName: "Student",
  email: `${testUsername}@example.com`,
  role: UserRole.STUDENT,
  enrollmentNumber: testEnrollment,
  course: "BCA",
  groupId: null,
}).returning();
```

**Location:**
- Built dynamically inline within each verification script in `scripts/`.
- Seed data helper: `scripts/seed_test_data.ts` and `scripts/seed_demo_selected_project.ts`.

## Coverage

**Requirements:**
- No formal percentage coverage threshold (e.g. 80% line coverage) enforced via Istanbul/c8.
- 100% pass requirement on all verification scripts during `npm test` before deployment.

**View Coverage:**
- Run `npm test` to view full test report and assertion counts across all suites.

## Test Types

**Unit Tests:**
- Type correctness verified across entire codebase via `tsc` (`npm run check`).

**Integration Tests:**
- Verification scripts in `scripts/` test end-to-end flows between `DBStorage`, Express route handlers, Drizzle ORM, and PostgreSQL.

**E2E Tests:**
- `scripts/e2e_verify.ts` simulates multi-role lifecycle:
  1. Admin user onboarding
  2. Supervisor account provisioning
  3. Student team creation & course restriction checks
  4. Project topic proposal, review, and approval
  5. Student group topic selection and dynamic supervisor linking
  6. Milestone and assessment updates

## Common Patterns

**Async Testing:**

```typescript
const result = await storage.createStudentGroup(groupData, adminId, memberEnrollments, true);
assert(result !== undefined, "Team created asynchronously");
```

**Error Testing:**

```typescript
try {
  await storage.createStudentGroup({ ...invalidData }, adminId, [], true);
  assert(false, "Should have thrown validation error");
} catch (error: any) {
  assert(error !== undefined, "Expected error was caught successfully");
}
```

---

*Testing analysis: 2026-10-06*
