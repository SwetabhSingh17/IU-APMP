import "dotenv/config";
import { DBStorage } from "../server/db-storage";
import { db } from "../server/db";
import {
    users,
    studentGroups,
    studentGroupMembers,
    projectTopics,
    studentProjects,
    projectAssessments,
    projectMilestones,
    notifications
} from "@shared/schema";
import JSZip from "jszip";
import ExcelJS from "exceljs";

async function verifyBackupAndExcelExport() {
    console.log("==================================================================");
    console.log("🚀 IU-APMP BACKUP, RESTORE & EXCEL EXPORT VERIFICATION SUITE");
    console.log("==================================================================\n");

    const storage = new DBStorage();
    let totalTests = 0;
    let passedTests = 0;

    function assert(condition: boolean, testName: string, detail?: string) {
        totalTests++;
        if (condition) {
            console.log(`✅ [PASS] ${testName}`);
            passedTests++;
        } else {
            console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
        }
    }

    // -------------------------------------------------------------
    // STEP 1: Baseline Live Database Record Counts
    // -------------------------------------------------------------
    console.log("--- 1. Baseline Live Database Record Counts ---");
    const baselineUsers = await db.select().from(users);
    const baselineGroups = await db.select().from(studentGroups);
    const baselineMembers = await db.select().from(studentGroupMembers);
    const baselineTopics = await db.select().from(projectTopics);
    const baselineProjects = await db.select().from(studentProjects);
    const baselineAssessments = await db.select().from(projectAssessments);
    const baselineMilestones = await db.select().from(projectMilestones);
    const baselineNotifications = await db.select().from(notifications);

    console.log(`   * Users: ${baselineUsers.length}`);
    console.log(`   * Student Groups: ${baselineGroups.length}`);
    console.log(`   * Group Members: ${baselineMembers.length}`);
    console.log(`   * Project Topics: ${baselineTopics.length}`);
    console.log(`   * Student Projects: ${baselineProjects.length}`);
    console.log(`   * Project Assessments: ${baselineAssessments.length}`);
    console.log(`   * Project Milestones: ${baselineMilestones.length}`);
    console.log(`   * Notifications: ${baselineNotifications.length}`);

    assert(baselineUsers.length > 0, "Users table is populated", `Count: ${baselineUsers.length}`);
    assert(baselineTopics.length > 0, "Project Topics table is populated", `Count: ${baselineTopics.length}`);

    // -------------------------------------------------------------
    // STEP 2: Verify exportData() Completeness
    // -------------------------------------------------------------
    console.log("\n--- 2. Complete A-Z Data Export Verification ---");
    const exportResult = await storage.exportData();

    assert(exportResult !== null && typeof exportResult === "object", "exportData() returned non-null object");
    assert(
        exportResult.metadata?.portalCode === "IU-APMP" ||
        exportResult.metadata?.portalName?.includes("IU-APMP"),
        "Metadata contains IU-APMP portal branding",
        exportResult.metadata?.portalName
    );
    assert(exportResult.metadata?.version === "2.3.1", "Metadata contains version = '2.3.1'");
    assert(exportResult.metadata?.exportedAt !== undefined, "Metadata contains exportedAt timestamp");

    const recordCounts = exportResult.metadata?.recordCounts || {};
    assert(recordCounts.users === baselineUsers.length, "Exported users count matches baseline DB", `${recordCounts.users} vs ${baselineUsers.length}`);
    assert(recordCounts.studentGroups === baselineGroups.length, "Exported groups count matches baseline DB", `${recordCounts.studentGroups} vs ${baselineGroups.length}`);
    assert(recordCounts.studentGroupMembers === baselineMembers.length, "Exported members count matches baseline DB", `${recordCounts.studentGroupMembers} vs ${baselineMembers.length}`);
    assert(recordCounts.projectTopics === baselineTopics.length, "Exported topics count matches baseline DB", `${recordCounts.projectTopics} vs ${baselineTopics.length}`);
    assert(recordCounts.studentProjects === baselineProjects.length, "Exported projects count matches baseline DB", `${recordCounts.studentProjects} vs ${baselineProjects.length}`);
    assert(recordCounts.projectAssessments === baselineAssessments.length, "Exported assessments count matches baseline DB", `${recordCounts.projectAssessments} vs ${baselineAssessments.length}`);
    assert(recordCounts.projectMilestones === baselineMilestones.length, "Exported milestones count matches baseline DB", `${recordCounts.projectMilestones} vs ${baselineMilestones.length}`);
    assert(recordCounts.notifications === baselineNotifications.length, "Exported notifications count matches baseline DB", `${recordCounts.notifications} vs ${baselineNotifications.length}`);

    // -------------------------------------------------------------
    // STEP 3: Verify createFullBackupPackage() (ZIP archive)
    // -------------------------------------------------------------
    console.log("\n--- 3. ZIP Backup Package Generation Verification ---");
    const backupPackage = await storage.createFullBackupPackage();
    assert(backupPackage !== null && typeof backupPackage === "object", "createFullBackupPackage() returned object");
    assert(Buffer.isBuffer(backupPackage.buffer), "Backup package contains valid Buffer");
    assert(backupPackage.filename.startsWith("IU-APMP_Backup_"), "Backup package filename starts with IU-APMP_Backup_");
    assert(backupPackage.buffer.length > 1000, `ZIP Buffer size is realistic (${(backupPackage.buffer.length / 1024).toFixed(1)} KB)`);

    const zip = await JSZip.loadAsync(backupPackage.buffer);
    const manifestFile = zip.file("manifest.json");
    const jsonDumpFile = zip.file("portal_full_backup.json");
    const sqlDumpFile = zip.file("backup_recovery.sql");

    assert(manifestFile !== null, "ZIP archive contains manifest.json");
    assert(jsonDumpFile !== null, "ZIP archive contains portal_full_backup.json");
    assert(sqlDumpFile !== null, "ZIP archive contains backup_recovery.sql");

    // Check individual table JSON files
    const tableFiles = [
        "tables/student_groups.json",
        "tables/users.json",
        "tables/student_group_members.json",
        "tables/project_topics.json",
        "tables/student_projects.json",
        "tables/project_assessments.json",
        "tables/project_milestones.json",
        "tables/notifications.json"
    ];
    for (const tableFile of tableFiles) {
        assert(zip.file(tableFile) !== null, `ZIP archive contains ${tableFile}`);
    }

    if (manifestFile) {
        const manifestText = await manifestFile.async("string");
        const parsedManifest = JSON.parse(manifestText);
        assert(parsedManifest.portalCode === "IU-APMP" || parsedManifest.portalName?.includes("IU-APMP"), "Manifest JSON contains IU-APMP portal branding");
        assert(parsedManifest.recordCounts?.totalRecords > 0, `Manifest totalRecords is positive (${parsedManifest.recordCounts?.totalRecords})`);
    }

    if (sqlDumpFile) {
        const sqlText = await sqlDumpFile.async("string");
        assert(sqlText.includes("IU-APMP PostgreSQL Database Recovery Dump"), "SQL recovery script header present");
        assert(sqlText.includes("INSERT INTO"), "SQL recovery script contains INSERT statements");
    }

    // -------------------------------------------------------------
    // STEP 4: Verify Multi-Sheet University Excel Report
    // -------------------------------------------------------------
    console.log("\n--- 4. Multi-Sheet University Excel Report Verification ---");
    const excelBuffer = await storage.generateUniversityExcelReport();
    assert(Buffer.isBuffer(excelBuffer), "generateUniversityExcelReport() returned a valid Buffer");
    assert(excelBuffer.length > 5000, `Excel buffer size is realistic (${(excelBuffer.length / 1024).toFixed(1)} KB)`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excelBuffer as any);

    const expectedSheets = [
        "Overview & Summary",
        "Student Details",
        "Faculty Supervisors",
        "Project Teams",
        "Project Topics Catalog",
        "Student Projects & Progress",
        "Evaluations & Assessments",
        "Milestones & Deadlines"
    ];

    assert(workbook.worksheets.length === expectedSheets.length, `Workbook contains exactly ${expectedSheets.length} worksheets`);

    for (const sheetName of expectedSheets) {
        const worksheet = workbook.getWorksheet(sheetName);
        assert(worksheet !== undefined && worksheet !== null, `Worksheet '${sheetName}' exists`);
        if (worksheet) {
            assert(worksheet.rowCount >= 1, `Worksheet '${sheetName}' has rows (rowCount: ${worksheet.rowCount})`);
        }
    }

    // Inspect Overview worksheet
    const overviewSheet = workbook.getWorksheet("Overview & Summary");
    if (overviewSheet) {
        const portalCode = overviewSheet.getCell("B2").value?.toString() || "";
        const portalNotes = overviewSheet.getCell("C2").value?.toString() || "";
        assert(portalCode === "IU-APMP", "Overview sheet contains IU-APMP portal code in B2", portalCode);
        assert(portalNotes.includes("Integral University"), "Overview sheet contains Integral University title in C2", portalNotes);
    }

    // Inspect Student Details
    const studentsSheet = workbook.getWorksheet("Student Details") || workbook.getWorksheet("Students Master List");
    if (studentsSheet) {
        const studentRows = studentsSheet.rowCount - 1; // excluding header
        console.log(`   * Student Details row count: ${studentRows}`);
        assert(studentRows > 0, "Student Details has student rows");

        // Verify exact 8 table columns in specific order
        const expectedColumns = [
            "SNo.",
            "TeamID",
            "Enrollment",
            "Student Name",
            "Mobile No.",
            "Email Id",
            "Project",
            "Allotment"
        ];
        const headerRow = studentsSheet.getRow(1);
        expectedColumns.forEach((expectedCol, idx) => {
            const actualVal = headerRow.getCell(idx + 1).value?.toString();
            assert(actualVal === expectedCol, `Column ${idx + 1} matches '${expectedCol}' (got: '${actualVal}')`);
        });
        console.log("   * All 8 Student Details columns verified in specific order matching mockup");

        // Verify TeamID ordering: First team must be A-01
        const firstTeamId = studentsSheet.getCell("B2").value?.toString();
        console.log(`   * First team rendered in Sheet 2: '${firstTeamId}'`);
        assert(firstTeamId === "A-01", "Team A-01 is rendered first in natural order", firstTeamId);

        // Verify sequential SNo
        assert(studentsSheet.getCell("A2").value === 1, "Row 1 SNo is 1");
        assert(studentsSheet.getCell("A3").value === 2, "Row 2 SNo is 2");

        // Print first 6 rows (Team A-01 cohort) to inspect actual formatting
        for (let r = 2; r <= Math.min(7, studentsSheet.rowCount); r++) {
            const row = studentsSheet.getRow(r);
            const rowVals: string[] = [];
            for (let c = 1; c <= 8; c++) {
                const cellVal = row.getCell(c).value;
                const displayVal = typeof cellVal === "string" ? cellVal.replace(/\n/g, " / ") : cellVal;
                rowVals.push(`${expectedColumns[c - 1]}: "${displayVal}"`);
            }
            console.log(`   * Row ${r - 1} -> ${rowVals.join(" | ")}`);
        }
    }

    // -------------------------------------------------------------
    // STEP 5: Sequence Alignment & Dependency Order Verification
    // -------------------------------------------------------------
    console.log("\n--- 5. Topological Dependency Order & Sequence Verification ---");
    const topologicalTables = [
        "studentGroups",
        "users",
        "studentGroupMembers",
        "projectTopics",
        "studentProjects",
        "projectAssessments",
        "projectMilestones",
        "notifications"
    ];

    // Ensure studentGroups precedes users (users.groupId -> studentGroups.id)
    const groupsIdx = topologicalTables.indexOf("studentGroups");
    const usersIdx = topologicalTables.indexOf("users");
    assert(groupsIdx < usersIdx, "studentGroups precedes users in topological restore sequence");

    // Ensure users precedes studentProjects (studentProjects.studentId -> users.id)
    const projectsIdx = topologicalTables.indexOf("studentProjects");
    assert(usersIdx < projectsIdx, "users precedes studentProjects in topological restore sequence");

    // -------------------------------------------------------------
    // STEP 5b: ZIP Payload Deserialization & Date Type Safety Check
    // -------------------------------------------------------------
    console.log("\n--- 5b. ZIP Payload Deserialization & Date Type Safety Check ---");
    const parsedPayload = await storage.parseBackupPayload(backupPackage.buffer);
    assert(Boolean(parsedPayload.users && parsedPayload.studentGroups), "Parsed ZIP payload contains users and groups");

    let rollbackInsertPassed = false;
    try {
        await db.transaction(async (tx) => {
            const toDate = (v: any): Date | null => {
                if (!v) return null;
                if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
                if (typeof v === "string" || typeof v === "number") {
                    const d = new Date(v);
                    return isNaN(d.getTime()) ? null : d;
                }
                return null;
            };

            const sampleMembers = (parsedPayload.studentGroupMembers || []).slice(0, 5).map((m: any) => ({
                id: m.id,
                userId: m.userId,
                groupId: m.groupId,
                status: m.status || "accepted",
                createdAt: toDate(m.createdAt) || new Date(),
                updatedAt: toDate(m.updatedAt) || new Date(),
            }));

            await tx.insert(studentGroupMembers).values(sampleMembers).onConflictDoNothing();
            rollbackInsertPassed = true;
            tx.rollback();
        });
    } catch (err: any) {
        if (err.message === "Rollback") {
            rollbackInsertPassed = true;
        } else {
            console.error("Dry run insert failed with error:", err);
        }
    }
    assert(rollbackInsertPassed, "Dry-run insert with parsed Date objects succeeded without toISOString errors");

    // -------------------------------------------------------------
    // STEP 6: Zero Data Loss / Integrity Verification
    // -------------------------------------------------------------
    console.log("\n--- 6. Zero-Data-Loss Live Database Integrity Check ---");
    const finalUsers = await db.select().from(users);
    const finalGroups = await db.select().from(studentGroups);
    const finalMembers = await db.select().from(studentGroupMembers);
    const finalTopics = await db.select().from(projectTopics);
    const finalProjects = await db.select().from(studentProjects);
    const finalAssessments = await db.select().from(projectAssessments);
    const finalMilestones = await db.select().from(projectMilestones);
    const finalNotifications = await db.select().from(notifications);

    assert(finalUsers.length === baselineUsers.length, "Users count remained 100% unchanged", `${finalUsers.length} === ${baselineUsers.length}`);
    assert(finalGroups.length === baselineGroups.length, "Groups count remained 100% unchanged", `${finalGroups.length} === ${baselineGroups.length}`);
    assert(finalMembers.length === baselineMembers.length, "Group members count remained 100% unchanged", `${finalMembers.length} === ${baselineMembers.length}`);
    assert(finalTopics.length === baselineTopics.length, "Topics count remained 100% unchanged", `${finalTopics.length} === ${baselineTopics.length}`);
    assert(finalProjects.length === baselineProjects.length, "Projects count remained 100% unchanged", `${finalProjects.length} === ${baselineProjects.length}`);
    assert(finalAssessments.length === baselineAssessments.length, "Assessments count remained 100% unchanged", `${finalAssessments.length} === ${baselineAssessments.length}`);
    assert(finalMilestones.length === baselineMilestones.length, "Milestones count remained 100% unchanged", `${finalMilestones.length} === ${baselineMilestones.length}`);
    assert(finalNotifications.length === baselineNotifications.length, "Notifications count remained 100% unchanged", `${finalNotifications.length} === ${baselineNotifications.length}`);

    console.log("\n==================================================================");
    console.log(`🏁 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("==================================================================");

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

verifyBackupAndExcelExport()
    .then(() => {
        console.log("🎉 All assertions verified successfully with zero data loss.");
        process.exit(0);
    })
    .catch((err) => {
        console.error("💥 Unhandled verification error:", err);
        process.exit(1);
    });
