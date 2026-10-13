import 'dotenv/config';
import assert from 'node:assert';
import { storage } from '../server/db-storage';
import { UserRole } from '../shared/schema';

async function testUserProjectStatus() {
  console.log('=== VERIFYING USER PROJECT STATUS & TOPICS COUNT FIX ===\n');

  // 1. Test getAllUsers
  console.log('Test 1: Verify storage.getAllUsers() enrichment');
  const allUsers = await storage.getAllUsers();
  assert(allUsers.length > 0, 'Must return users');

  const students = allUsers.filter(u => u.role === UserRole.STUDENT);
  assert(students.length > 0, 'Must have students');

  const withProject = students.filter(s => s.projectStatus);
  const withoutProject = students.filter(s => !s.projectStatus);

  console.log(`  Total students: ${students.length}`);
  console.log(`  Students with projectStatus: ${withProject.length}`);
  console.log(`  Students without project: ${withoutProject.length}`);

  assert(withProject.length > 600, `Expected over 600 students with projects, got ${withProject.length}`);
  assert(withoutProject.length > 0 && withoutProject.length < 20, `Expected small number without projects, got ${withoutProject.length}`);

  // Check sample student with project has valid status and topic info
  const sampleStudentWithProj = withProject[0];
  assert(sampleStudentWithProj.projectStatus, 'Sample student must have projectStatus');
  console.log(`  ✅ Student #${sampleStudentWithProj.id} has projectStatus="${sampleStudentWithProj.projectStatus}", code="${sampleStudentWithProj.topicCode}"`);

  // Check sample student without project has null projectStatus
  const sampleStudentWithoutProj = withoutProject[0];
  assert.strictEqual(sampleStudentWithoutProj.projectStatus, null, 'Student without project must have null projectStatus');
  console.log(`  ✅ Student #${sampleStudentWithoutProj.id} has null projectStatus`);

  // 2. Test getPaginatedUsers
  console.log('\nTest 2: Verify storage.getPaginatedUsers() enrichment');
  const paginated = await storage.getPaginatedUsers(1, 20);
  assert.strictEqual(paginated.data.length, 20, 'Must return 20 items for limit=20');
  const paginatedStudents = paginated.data.filter(u => u.role === UserRole.STUDENT);
  if (paginatedStudents.length > 0) {
    const studentWithProjInPage = paginatedStudents.find(s => s.projectStatus);
    if (studentWithProjInPage) {
      assert(studentWithProjInPage.projectStatus, 'Paginated student must have projectStatus');
      console.log(`  ✅ Paginated Student #${studentWithProjInPage.id} has projectStatus="${studentWithProjInPage.projectStatus}"`);
    }
  }

  // 3. Test supervisors topicsCount
  console.log('\nTest 3: Verify supervisors topicsCount');
  const supervisors = allUsers.filter(u => u.role === UserRole.SUPERVISOR);
  assert(supervisors.length > 0, 'Must have supervisors');
  const supervisorsWithTopics = supervisors.filter(s => typeof s.topicsCount === 'number' && s.topicsCount > 0);
  console.log(`  Supervisors with topicsCount > 0: ${supervisorsWithTopics.length} / ${supervisors.length}`);
  assert(supervisorsWithTopics.length > 0, 'Supervisors must have non-zero topicsCount');
  console.log(`  ✅ Supervisor #${supervisorsWithTopics[0].id} has topicsCount=${supervisorsWithTopics[0].topicsCount}`);

  console.log('\n🎉 ALL PROJECT STATUS ENRICHMENT TESTS PASSED PERFECTLY!\n');
}

testUserProjectStatus().then(() => process.exit(0)).catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
