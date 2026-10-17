/**
 * Verification Test: Phase 6 UI/UX & Administrative Enhancements
 *
 * Verifies:
 * 1. Admin & Coordinator Direct Topic Creation with Faculty Assignment (`createDirectProjectTopic`).
 * 2. Automatic PUGID sequence generation for newly created topics.
 * 3. Immediate "approved" status on direct creation without pending queue.
 * 4. System notification dispatch to the assigned faculty supervisor.
 */

import "dotenv/config";
import { DBStorage } from "../server/db-storage";
import { UserRole, projectTopics, notifications } from "@shared/schema";
import { db } from "../server/db";
import { eq } from "drizzle-orm";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runPhase6Verification() {
  console.log("🚀 Starting Phase 6 Enhancements Verification...\n");
  const storage = new DBStorage();

  // Find a supervisor in database to assign
  const supervisors = await storage.getUsersByRole(UserRole.SUPERVISOR);
  assert(supervisors.length > 0, "At least one supervisor exists in database");
  const targetSupervisor = supervisors[0];

  console.log(`Target Supervisor for Direct Topic Allotment: ${targetSupervisor.firstName} ${targetSupervisor.lastName} (ID: ${targetSupervisor.id})`);

  // --- Test 1: Direct Topic Creation & Auto-Approval ---
  console.log("\nTest 1: Admin Direct Topic Creation with Faculty Assignment");
  const directTopic = await storage.createDirectProjectTopic({
    title: "__TEST_DIRECT_AI_IOT_PROJECT__",
    description: "Automated test project for verifying direct admin/coordinator topic creation.",
    technology: "Python, PyTorch, MQTT, Raspberry Pi",
    projectType: "IoT & Embedded Systems",
    course: "BCA",
    estimatedComplexity: "Hard",
    facultyId: targetSupervisor.id,
    creatorName: "Super Admin",
  });

  assert(!!directTopic.id, "Topic created and returned an ID");
  assert(directTopic.status === "approved", "Topic status is directly 'approved'");
  assert(directTopic.submittedById === targetSupervisor.id, "Topic assigned to chosen supervisor");
  assert(!!directTopic.topicCode && directTopic.topicCode.startsWith("PUGID26"), "Topic received valid sequential PUGID code");
  console.log(`  ✅ Direct topic created with ID ${directTopic.id} and code ${directTopic.topicCode} with status: ${directTopic.status}`);

  // --- Test 2: Notification Dispatch ---
  console.log("\nTest 2: Notification Dispatched to Assigned Faculty");
  const facultyNotifications = await storage.getUserNotifications(targetSupervisor.id);
  const foundNotification = facultyNotifications.find(n => n.title === "Project Topic Assigned" && n.message.includes(directTopic.title));
  assert(!!foundNotification, "Notification was successfully created for the assigned supervisor");
  console.log(`  ✅ Notification verified: "${foundNotification?.message}"`);

  // --- Clean Up ---
  console.log("\nCleaning up test topic...");
  await db.delete(projectTopics).where(eq(projectTopics.id, directTopic.id));
  if (foundNotification) {
    await db.delete(notifications).where(eq(notifications.id, foundNotification.id));
  }
  console.log("  ✅ Test records cleaned up successfully.");

  console.log("\n🎉 ALL PHASE 6 ADMINISTRATIVE ENHANCEMENT TESTS PASSED SUCCESSFULLY!\n");
  process.exit(0);
}

runPhase6Verification().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
