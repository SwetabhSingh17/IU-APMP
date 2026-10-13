import 'dotenv/config';
import fs from "fs";
import ExcelJS from "exceljs";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

function getCellString(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  try {
    const val = cell.value;
    if (val === null || val === undefined) return "";
    if (typeof val === "object") {
      if ("result" in val && val.result !== undefined && val.result !== null) return String(val.result).trim();
      if ("hyperlink" in (val as any)) {
        const hVal = val as any;
        if (hVal.text && typeof hVal.text === "string") return hVal.text.trim();
        if (hVal.hyperlink && typeof hVal.hyperlink === "string") return hVal.hyperlink.replace(/^mailto:/i, "").trim();
      }
      if ("richText" in val && Array.isArray(val.richText)) return val.richText.map((t) => t.text).join("").trim();
      if ("text" in val && typeof (val as any).text === "string") return (val as any).text.trim();
      return "";
    }
    return String(val).trim();
  } catch {
    return "";
  }
}

function normalizeMobile(raw: string): string | null {
  let digits = String(raw || "").replace(/[^0-9]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.length === 10 ? digits : (digits || null);
}

export async function runMobileUpdate(applyChanges: boolean = false) {
  console.log(`=== STUDENT MOBILE NUMBER UPDATE FROM EXCEL ===`);
  console.log(`Mode: ${applyChanges ? "APPLY (Writing to DB)" : "DRY RUN (Read Only)"}\n`);

  const filePath = "/Users/swetabhsingh/Developer/IntegralProjectHub/CA321_Project Lab_Team_Formation_2026-27.xlsx";
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found at: ${filePath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fs.readFileSync(filePath));

  // Map of clean enrollment number -> normalized mobile & metadata
  const enrollmentToMobileMap = new Map<string, { mobile: string; name: string; sheet: string }>();

  for (const sheet of workbook.worksheets) {
    let enrollCol = -1;
    let mobileCol = -1;
    let nameCol = -1;

    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      row.eachCell((cell, colNumber) => {
        const text = getCellString(cell).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (text.includes("enrollment")) enrollCol = colNumber;
        if (text.includes("mobile") || text.includes("phone")) mobileCol = colNumber;
        if (text.includes("name") && !text.includes("team")) nameCol = colNumber;
      });
      if (enrollCol !== -1 && mobileCol !== -1) break;
    }

    if (enrollCol === -1 || mobileCol === -1) continue;

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const rawEnroll = getCellString(row.getCell(enrollCol)).replace(/\s+/g, "");
      if (!rawEnroll || rawEnroll.toLowerCase().includes("enrollment")) continue;

      const rawName = nameCol !== -1 ? getCellString(row.getCell(nameCol)).trim() : "";
      const rawMobile = getCellString(row.getCell(mobileCol)).trim();
      const cleanMobile = normalizeMobile(rawMobile);

      if (!cleanMobile) continue;

      // Handle the 3 disambiguations where the Excel file had an enrollment typo in one row:
      if (rawEnroll === '2400101960' && !rawName.toLowerCase().includes('hammad')) {
        continue; // Hammad Afraz is the true owner of 2400101960 in DB
      }
      if (rawEnroll === '2400101894' && !rawName.toLowerCase().includes('nafees')) {
        continue; // Nafees khan is the true owner of 2400101894 in DB
      }
      if (rawEnroll === '2400104148' && !rawName.toLowerCase().includes('ovais')) {
        continue; // Mohammad Ovais is the true owner of 2400104148 in DB
      }

      enrollmentToMobileMap.set(rawEnroll, {
        mobile: cleanMobile,
        name: rawName,
        sheet: sheet.name
      });
    }
  }

  // Also map Hera Fatima to her correct enrollment number (2400103612 in DB)
  enrollmentToMobileMap.set('2400103612', {
    mobile: normalizeMobile('7275121578')!,
    name: 'Hera fatima',
    sheet: 'Group-C'
  });

  console.log(`Discovered ${enrollmentToMobileMap.size} valid student mobile mappings from Excel.\n`);

  // Fetch all students currently in the database
  const allDbStudents = await db.select({
    id: users.id,
    enrollmentNumber: users.enrollmentNumber,
    firstName: users.firstName,
    lastName: users.lastName,
    mobile: users.mobile,
    role: users.role,
    groupId: users.groupId,
  }).from(users).where(eq(users.role, "student"));

  console.log(`Found ${allDbStudents.length} student records in database.`);

  interface IPendingUpdate {
    userId: number;
    enrollmentNumber: string;
    studentName: string;
    oldMobile: string | null;
    newMobile: string;
  }

  const updatesToApply: IPendingUpdate[] = [];
  let alreadyMatchingCount = 0;
  let notInExcelCount = 0;

  for (const student of allDbStudents) {
    if (!student.enrollmentNumber) continue;
    const cleanEnroll = student.enrollmentNumber.trim();
    const excelEntry = enrollmentToMobileMap.get(cleanEnroll);

    if (!excelEntry) {
      notInExcelCount++;
      continue;
    }

    if (student.mobile === excelEntry.mobile) {
      alreadyMatchingCount++;
      continue;
    }

    updatesToApply.push({
      userId: student.id,
      enrollmentNumber: cleanEnroll,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      oldMobile: student.mobile,
      newMobile: excelEntry.mobile,
    });
  }

  console.log(`\nAnalysis Summary:`);
  console.log(`- Students already having the correct mobile: ${alreadyMatchingCount}`);
  console.log(`- Students needing mobile update: ${updatesToApply.length}`);
  console.log(`- Students not in Excel (already have mobile): ${notInExcelCount}`);
  console.log(`- Total coverage: ${alreadyMatchingCount + updatesToApply.length + notInExcelCount} / ${allDbStudents.length}`);

  if (updatesToApply.length > 0) {
    console.log(`\nSample first 5 updates:`);
    for (let i = 0; i < Math.min(5, updatesToApply.length); i++) {
      const u = updatesToApply[i];
      console.log(`  [${i + 1}] User #${u.userId} (${u.studentName}, Enroll: ${u.enrollmentNumber}): "${u.oldMobile || 'NULL'}" -> "${u.newMobile}"`);
    }
  }

  if (!applyChanges) {
    console.log(`\nDRY RUN complete. No changes were written to the database.`);
    return { applied: false, updatesCount: updatesToApply.length };
  }

  // Batch update execution to ensure persistence and zero connection drop
  console.log(`\nApplying updates to database in concurrent batches...`);
  const BATCH_SIZE = 50;
  for (let i = 0; i < updatesToApply.length; i += BATCH_SIZE) {
    const batch = updatesToApply.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((update) =>
        db
          .update(users)
          .set({ mobile: update.newMobile })
          .where(eq(users.id, update.userId))
      )
    );
  }

  console.log(`✅ Successfully updated mobile numbers for ${updatesToApply.length} students!`);

  // Post-update verification
  const postCheck = await db.select({
    id: users.id,
    mobile: users.mobile,
  }).from(users).where(eq(users.role, "student"));

  const withValidMobile = postCheck.filter(s => s.mobile && s.mobile.length === 10);
  console.log(`Post-update verification: ${withValidMobile.length} / ${allDbStudents.length} students now have 10-digit mobile numbers.`);

  return { applied: true, updatesCount: updatesToApply.length };
}

// Execute if run directly
const isApply = process.argv.includes("--apply");
runMobileUpdate(isApply)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Execution failed:", err);
    process.exit(1);
  });
