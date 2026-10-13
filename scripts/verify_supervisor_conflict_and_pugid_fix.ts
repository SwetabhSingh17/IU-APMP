import 'dotenv/config';
import assert from 'node:assert';
import { db } from '../server/db';
import { storage } from '../server/db-storage';
import { sql, eq } from 'drizzle-orm';
import { studentGroups, projectTopics, studentProjects, users, studentGroupMembers, notifications } from '../shared/schema';

async function verify() {
  console.log('=== VERIFYING SUPERVISOR CONFLICT & PUGID FIX ===\n');

  // Test 1: Team F-04 verification
  console.log('Test 1: Verify Team F-04 State');
  const groupF04 = await storage.getGroup(70);
  assert(groupF04, 'Group F-04 must exist');
  assert.strictEqual(groupF04.projectTeamId, 'F-04');
  assert.strictEqual(groupF04.supervisorId, 727, 'F-04 supervisor must be Dr. Mohd. Arif Ali Usmani (727)');

  const membersF04 = await storage.getStudentGroupMembers(70);
  assert.strictEqual(membersF04.length, 4, 'F-04 must have exactly 4 members');
  const memberIdsF04 = membersF04.map(m => m.id).sort((a, b) => a - b);
  assert.deepStrictEqual(memberIdsF04, [306, 307, 308, 312], 'F-04 members must be [306, 307, 308, 312]');
  // Ensure student 309 is NOT in F-04
  assert(!memberIdsF04.includes(309), 'Student 309 must NOT be in F-04');

  for (const mId of memberIdsF04) {
    const sp = await storage.getStudentProjects(mId);
    assert(sp.length > 0 && sp[0].topic, `Member ${mId} must have an allotted topic`);
    assert.strictEqual(sp[0].topic.submittedById, 727, `F-04 topic must be submitted by supervisor 727 (Dr. Mohd. Arif Ali Usmani)`);
  }
  console.log('  ✅ Team F-04 is cleanly mapped to topic under Dr. Mohd. Arif Ali Usmani.');

  // Test 2: Team F-06 verification
  console.log('\nTest 2: Verify Team F-06 State');
  const groupF06 = await storage.getGroup(72);
  assert(groupF06, 'Group F-06 must exist');
  assert.strictEqual(groupF06.projectTeamId, 'F-06');
  assert.strictEqual(groupF06.supervisorId, 726, 'F-06 supervisor must be Dr. Syed Adnan Afaq (726)');

  const membersF06 = await storage.getStudentGroupMembers(72);
  assert.strictEqual(membersF06.length, 5, 'F-06 must have exactly 5 members');
  const memberIdsF06 = membersF06.map(m => m.id).sort((a, b) => a - b);
  assert.deepStrictEqual(memberIdsF06, [309, 316, 317, 318, 319], 'F-06 members must be [309, 316, 317, 318, 319]');
  assert(memberIdsF06.includes(309), 'Student 309 must be in F-06');

  for (const mId of memberIdsF06) {
    const sp = await storage.getStudentProjects(mId);
    assert(sp.length > 0 && sp[0].topic, `Member ${mId} must have an allotted topic`);
    assert.strictEqual(sp[0].topic.submittedById, 726, `Topic must be submitted by supervisor 726 (Dr. Syed Adnan Afaq)`);
  }
  console.log('  ✅ Team F-06 is cleanly mapped to topic under Dr. Syed Adnan Afaq.');

  // Test 3: System conflicts verification
  console.log('\nTest 3: Verify Zero Active Conflicts in System');
  const conflicts = await storage.getSupervisorConflicts();
  assert.strictEqual(conflicts.length, 0, `Expected 0 conflicts, got ${conflicts.length}`);
  console.log('  ✅ storage.getSupervisorConflicts() returns 0 active conflicts.');

  // Test 4: PUGID sequential allocation
  console.log('\nTest 4: Verify Next PUGID Code');
  const nextTopicCode = await storage.getNextTopicCode();
  assert(nextTopicCode.startsWith('PUGID263'), `Expected sequential PUGID263xx, got ${nextTopicCode}`);
  console.log(`  ✅ Next sequential PUGID is correctly ${nextTopicCode} (infinite inflation resolved).`);

  // Test 5: Verify Database Partial Unique Index blocks duplicate accepted memberships
  console.log('\nTest 5: Verify Duplicate Membership Constraint');
  let duplicateRejected = false;
  try {
    await db.insert(studentGroupMembers).values({
      userId: 309,
      groupId: 70,
      status: 'accepted',
    });
  } catch (err: any) {
    duplicateRejected = true;
    console.log(`  ✅ Database correctly rejected duplicate accepted membership with constraint: ${err.code || err.message}`);
  }
  assert(duplicateRejected, 'Database must reject duplicate accepted membership for student 309');

  // Test 6: Verify Conflict Resolution doesn't loop or affect other teams
  console.log('\nTest 6: Verify Single-Step Conflict Resolution');
  let mockGroupId: number | null = null;
  let testStudentId: number | null = null;
  let copiedTopicId: number | null = null;

  try {
    // Create a temporary mock group with supervisor 726 (Afaq)
    const [mockGroup] = await db.insert(studentGroups).values({
      name: '__TEST_CONFLICT_TEAM__',
      projectTeamId: 'TEST-01',
      course: 'BCA',
      supervisorId: 726,
    }).returning();
    mockGroupId = mockGroup.id;

    // Create temporary student
    const [testStudent] = await db.insert(users).values({
      username: '__test_student_conflict_user__',
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Student',
      email: 'test_student_conflict_user@example.com',
      role: 'student',
      course: 'BCA',
      groupId: mockGroup.id,
    }).returning();
    testStudentId = testStudent.id;

    await db.insert(studentGroupMembers).values({
      userId: testStudent.id,
      groupId: mockGroup.id,
      status: 'accepted',
    });

    // Assign topic 246 (submitted by 727, Usmani) -> creates conflict because group supervisor is 726 (Afaq)!
    await db.insert(studentProjects).values({
      studentId: testStudent.id,
      topicId: 246,
    });

    // Check conflict detected for this mock group
    const mockConflicts = await storage.getSupervisorConflicts(mockGroup.id);
    assert.strictEqual(mockConflicts.length, 1, 'Mock group must have 1 conflict');
    assert.strictEqual(mockConflicts[0].groupId, mockGroup.id);
    console.log(`  ✅ Conflict correctly detected for mock group: topic by Usmani, supervisor Afaq.`);

    // Resolve conflict via copy
    const nextCodeBefore = await storage.getNextTopicCode();
    assert(nextCodeBefore.startsWith('PUGID263'));

    const result = await storage.resolveSupervisorConflict(mockGroup.id, 'copy', {
      newSupervisorId: 726,
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.resolution, 'copy');
    assert.strictEqual(result.newTopicCode, nextCodeBefore);
    copiedTopicId = result.topic.id;
    console.log(`  ✅ Conflict resolved cleanly with Option 1: Copy. New topic code: ${result.newTopicCode}.`);

    // Verify conflict for mock group is now 0
    const mockConflictsAfter = await storage.getSupervisorConflicts(mockGroup.id);
    assert.strictEqual(mockConflictsAfter.length, 0, 'Mock group must have 0 conflicts after resolution');

    // Verify Team F-04 and F-06 are STILL 0 conflicts (no cross-contamination!)
    const allConflicts = await storage.getSupervisorConflicts();
    assert.strictEqual(allConflicts.length, 0, 'Total conflicts must still be 0');
    console.log('  ✅ No cross-contamination: F-04 and F-06 remained completely unaffected with 0 conflicts.');

  } finally {
    // Clean up test records
    if (testStudentId) {
      await db.delete(notifications).where(eq(notifications.userId, testStudentId));
      await db.delete(studentProjects).where(eq(studentProjects.studentId, testStudentId));
      await db.delete(studentGroupMembers).where(eq(studentGroupMembers.userId, testStudentId));
      await db.delete(users).where(eq(users.id, testStudentId));
    }
    if (mockGroupId) {
      await db.execute(sql`DELETE FROM notifications WHERE message ILIKE '%__TEST_CONFLICT_TEAM__%'`);
      await db.delete(studentGroups).where(eq(studentGroups.id, mockGroupId));
    }
    if (copiedTopicId) {
      await db.delete(projectTopics).where(eq(projectTopics.id, copiedTopicId));
    }
    console.log('  ✅ Test records cleaned up.');
  }

  // Verify final PUGID code after cleanup
  const finalTopicCode = await storage.getNextTopicCode();
  assert(finalTopicCode.startsWith('PUGID263'), `Expected sequential PUGID263xx, got ${finalTopicCode}`);
  console.log(`  ✅ PUGID sequence remains intact: ${finalTopicCode}.`);

  console.log('\n🎉 ALL VERIFICATION TESTS PASSED PERFECTLY!\n');
  process.exit(0);
}

verify().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
