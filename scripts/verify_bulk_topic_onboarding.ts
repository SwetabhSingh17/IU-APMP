import "dotenv/config";
import fs from "fs";
import path from "path";
import { parseTopicOnboardingFile, generateTopicDemoFormatExcel } from "../server/services/topic-onboarding-parser";
import { DBStorage } from "../server/db-storage";
import { UserRole, projectTopics, studentProjects, users, ITopicOnboardingRow } from "@shared/schema";
import { db } from "../server/db";
import { eq, and, like, isNotNull, inArray, gt } from "drizzle-orm";

async function runVerification() {
  console.log("==================================================================");
  console.log("🚀 STARTING BULK TOPIC ONBOARDING, VALIDATION & PUGID VERIFICATION");
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
      throw new Error(`Assertion failed: ${testName}${detail ? ` (${detail})` : ""}`);
    }
  }

  const filePath = path.resolve(process.cwd(), "BCA Final Project Suggestions 2026-27 (Responses).xlsx");
  assert(fs.existsSync(filePath), "Target file 'BCA Final Project Suggestions 2026-27 (Responses).xlsx' exists on disk");

  const fileBuffer = fs.readFileSync(filePath);

  // -------------------------------------------------------------
  // TEST 1: Parsing Excel File Verbatim
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: Parsing 'BCA Final Project Suggestions 2026-27 (Responses).xlsx' ---");
  const parsed = parseTopicOnboardingFile(fileBuffer);

  assert(parsed.success === true, "Parser returned success=true");
  assert(parsed.totalRows === 61, "Extracted exactly 61 faculty rows", `Found ${parsed.totalRows}`);

  let totalExtractedTopics = 0;
  for (const row of parsed.rows) {
    totalExtractedTopics += row.topics.length;
  }
  assert(totalExtractedTopics === 305, "Extracted exactly 305 project topics (5 per faculty member)", `Found ${totalExtractedTopics}`);

  // Inspect first faculty row
  const firstRow = parsed.rows[0];
  assert(firstRow.facultyName === "Dr. Syed Adnan Afaq", "First faculty name matches 'Dr. Syed Adnan Afaq'", firstRow.facultyName);
  assert(firstRow.facultyEmail === "saafaq@iul.ac.in", "First faculty email matches 'saafaq@iul.ac.in'", firstRow.facultyEmail);
  assert(firstRow.topics.length === 5, "First faculty row contains exactly 5 topics");
  assert(firstRow.topics[0].title === "Requirement Change Impact Prediction System", "Topic 1 title extracted cleanly", firstRow.topics[0].title);
  assert(firstRow.topics[0].projectType.length > 0, "Topic 1 project type is non-empty", firstRow.topics[0].projectType);
  assert(firstRow.topics[0].technology.length > 0, "Topic 1 technology stack is non-empty", firstRow.topics[0].technology);
  assert(firstRow.topics[0].description.length > 20, "Topic 1 description is detailed and non-empty");

  // -------------------------------------------------------------
  // TEST 2: Demo Template Generation
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: Topic Suggestions Demo Format Generation ---");
  const demoBuffer = await generateTopicDemoFormatExcel();
  assert(Buffer.isBuffer(demoBuffer) && demoBuffer.length > 0, "Demo template generated non-empty buffer", `${demoBuffer.length} bytes`);

  const parsedDemo = parseTopicOnboardingFile(demoBuffer);
  assert(parsedDemo.success === true, "Demo template parses cleanly with topic onboarding parser");
  assert(parsedDemo.totalRows >= 1, "Demo template contains sample faculty suggestions");

  // -------------------------------------------------------------
  // TEST 3: Database Supervisor Cross-Checking
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: Database Cross-Checking Against Supervisor Accounts ---");
  const allDbSupervisors = await storage.getUsersByRole(UserRole.SUPERVISOR);
  assert(allDbSupervisors.length >= 62, "PostgreSQL contains at least 62 registered supervisors", `Found ${allDbSupervisors.length}`);

  const supervisorsByEmail = new Map<string, typeof allDbSupervisors[0]>();
  for (const s of allDbSupervisors) {
    if (s.email) supervisorsByEmail.set(s.email.toLowerCase().trim(), s);
  }

  let matchedFacultyCount = 0;
  for (const row of parsed.rows) {
    if (supervisorsByEmail.has(row.facultyEmail.toLowerCase().trim())) {
      matchedFacultyCount++;
    }
  }
  assert(matchedFacultyCount === 61, "All 61 faculty rows from the Excel file match existing supervisor accounts in DB", `Matched ${matchedFacultyCount}/61`);

  // -------------------------------------------------------------
  // TEST 4: Error Handling & Failure Reporting Simulation
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Error Handling & Failure Reporting Simulation ---");

  // Clean any leftover test topics from previous failed test runs
  await db.delete(projectTopics).where(like(projectTopics.title, "[SIMULATED_TEST]%"));

  // Construct mixed test dataset with 2 valid rows and 2 intentionally failing rows
  const mixedTestRows: ITopicOnboardingRow[] = [
    // Valid Row 1
    {
      ...parsed.rows[0],
      topics: parsed.rows[0].topics.map(t => ({ ...t, title: `[SIMULATED_TEST] ${t.title}` }))
    },
    // Valid Row 2
    {
      ...parsed.rows[1],
      topics: parsed.rows[1].topics.map(t => ({ ...t, title: `[SIMULATED_TEST] ${t.title}` }))
    },
    // Invalid Row A: Unregistered Email
    {
      rowNumber: 998,
      facultyName: "Prof. Unknown Visitor",
      facultyEmail: "nonexistent.faculty@iul.ac.in",
      topics: [
        { slot: 1, title: "Unregistered Topic 1", projectType: "Web Application", technology: "Node.js", description: "Test description" }
      ],
    },
    // Invalid Row B: Mismatched Name for existing email
    {
      rowNumber: 999,
      facultyName: "John Doe Unrelated Person",
      facultyEmail: "saafaq@iul.ac.in", // Real email of Dr. Syed Adnan Afaq
      topics: [
        { slot: 1, title: "Mismatched Name Topic 1", projectType: "Web Application", technology: "Python", description: "Test description" }
      ],
    },
  ];

  // Clean any previous test topics for a clean slate
  await db.delete(projectTopics).where(like(projectTopics.title, "%Unregistered Topic%"));
  await db.delete(projectTopics).where(like(projectTopics.title, "%Mismatched Name Topic%"));

  const testBatchResult = await storage.bulkUploadProjectTopics("BCA", mixedTestRows, { autoApprove: true });

  assert(testBatchResult.totalRows === 4, "Processed 4 test batch rows", `Got ${testBatchResult.totalRows}`);
  assert(testBatchResult.matchedSupervisors === 2, "Exactly 2 valid supervisors matched", `Got ${testBatchResult.matchedSupervisors}`);
  assert(testBatchResult.unmatchedSupervisors === 2, "Exactly 2 unmatched faculty records detected", `Got ${testBatchResult.unmatchedSupervisors}`);
  assert(testBatchResult.failureRecords.length === 2, "Failure report contains exactly 2 failure entries");

  // Check Failure Record 1: Email not found
  const emailFail = testBatchResult.failureRecords.find(f => f.facultyEmail === "nonexistent.faculty@iul.ac.in");
  assert(emailFail !== undefined, "Failure report captured unregistered email failure");
  assert(emailFail?.reason === "Upload Failed: Supervisor email not found in database", "Failure reason matches 'Supervisor email not found in database'", emailFail?.reason);
  assert(emailFail?.rowNumber === 998, "Failure report captured row 998");

  // Check Failure Record 2: Name mismatch
  const nameFail = testBatchResult.failureRecords.find(f => f.facultyEmail === "saafaq@iul.ac.in");
  assert(nameFail !== undefined, "Failure report captured name mismatch failure");
  assert(nameFail?.reason.includes("Upload Failed: Supervisor name") === true, "Failure reason indicates name mismatch with expected record", nameFail?.reason);
  assert(nameFail?.rowNumber === 999, "Failure report captured row 999");

  // Verify topics for unmatched rows were NEVER inserted
  const leakedTopics = await db.select().from(projectTopics).where(like(projectTopics.title, "%Unregistered Topic%"));
  assert(leakedTopics.length === 0, "Topics for unmatched email were strictly NOT inserted into PostgreSQL");

  const leakedNameTopics = await db.select().from(projectTopics).where(like(projectTopics.title, "%Mismatched Name Topic%"));
  assert(leakedNameTopics.length === 0, "Topics for mismatched name were strictly NOT inserted into PostgreSQL");

  // -------------------------------------------------------------
  // TEST 5: Auto-Incrementing Unique Sequential IDs (PUGID26xxx)
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: Sequential PUGID26xxx Unique ID Generation ---");

  // Inspect generated IDs from the 2 verified test supervisors (10 topics total)
  const generatedCodes: string[] = [];
  for (const rec of testBatchResult.successRecords) {
    generatedCodes.push(...rec.topicCodes);
  }

  assert(generatedCodes.length === 10, "Generated exactly 10 topic codes for the 2 verified supervisors", `Got ${generatedCodes.length}`);
  const firstSeqNum = parseInt(generatedCodes[0].replace(/^PUGID26/i, ""), 10);
  assert(!isNaN(firstSeqNum), "First generated code has valid numeric sequence", generatedCodes[0]);

  // Assert sequential order
  for (let i = 0; i < generatedCodes.length; i++) {
    const expectedNumStr = String(firstSeqNum + i).padStart(3, "0");
    const expectedCode = `PUGID26${expectedNumStr}`;
    assert(generatedCodes[i] === expectedCode, `Code ${i + 1} matches sequential format: ${expectedCode}`, generatedCodes[i]);
  }

  // Verify range reporting
  assert(testBatchResult.generatedIdRange?.start === generatedCodes[0], "Result correctly reports start of PUGID range");
  assert(testBatchResult.generatedIdRange?.end === generatedCodes[generatedCodes.length - 1], "Result correctly reports end of PUGID range");

  // Clean up ONLY test batch topics generated in Test 4
  if (generatedCodes.length > 0) {
    await db.delete(projectTopics).where(inArray(projectTopics.topicCode, generatedCodes));
  }

  // -------------------------------------------------------------
  // TEST 6: Complete Bulk Ingestion or Verification of All 61 Faculty Rows
  // -------------------------------------------------------------
  console.log("\n--- TEST 6: Complete Bulk Ingestion / Verification (All 61 Faculty, 305 Topics) ---");
  let dbTopics = await db.select().from(projectTopics).where(and(isNotNull(projectTopics.topicCode), like(projectTopics.topicCode, "PUGID26%"), eq(projectTopics.isDeleted, false)));

  if (dbTopics.length < 305) {
    const fullResult = await storage.bulkUploadProjectTopics("BCA", parsed.rows, { autoApprove: true });
    assert(fullResult.success === true, "Full bulk onboarding completed successfully");
    assert(fullResult.matchedSupervisors === 61, "All 61 supervisors matched and verified", `Got ${fullResult.matchedSupervisors}`);
    assert(fullResult.unmatchedSupervisors === 0, "Zero supervisors unmatched in full dataset", `Got ${fullResult.unmatchedSupervisors}`);
    assert(fullResult.totalTopicsCreated === 305, "All 305 project topics successfully inserted into PostgreSQL", `Got ${fullResult.totalTopicsCreated}`);
    dbTopics = await db.select().from(projectTopics).where(and(isNotNull(projectTopics.topicCode), like(projectTopics.topicCode, "PUGID26%"), eq(projectTopics.isDeleted, false)));
  }

  // Verify database state: query all topics from PostgreSQL
  assert(dbTopics.length >= 305, "Database contains at least 305 topics with PUGID26xxx codes", `Found ${dbTopics.length}`);

  // Verify distinct topic codes (no duplicates)
  const uniqueCodes = new Set(dbTopics.map(t => t.topicCode));
  assert(uniqueCodes.size === dbTopics.length, "All topic codes are strictly unique", `Unique: ${uniqueCodes.size}/${dbTopics.length}`);

  // Verify supervisor association for a sample topic
  const sampleTopic = dbTopics.find(t => t.topicCode === "PUGID26001");
  assert(sampleTopic !== undefined, "Sample topic PUGID26001 exists in database");
  assert(sampleTopic?.course === "BCA", "Sample topic course is strictly 'BCA'");
  assert(sampleTopic?.status === "approved", "Sample topic status is 'approved'");

  const submitter = await storage.getUser(sampleTopic!.submittedById);
  assert(submitter !== undefined && submitter.role === UserRole.SUPERVISOR, "Topic submitter is a verified supervisor");
  assert(submitter?.email === "saafaq@iul.ac.in", "Topic submitter email matches 'saafaq@iul.ac.in'");

  console.log("\n==================================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED WITH 100% SUCCESS!`);
  console.log("==================================================================\n");
  process.exit(0);
}

runVerification().catch((err) => {
  console.error("FATAL: Verification failed:", err);
  process.exit(1);
});
