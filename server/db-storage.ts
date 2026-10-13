// Storage implementation
import {
  User, ProjectTopic, StudentProject, StudentGroup, ProjectMilestone, ProjectAssessment, Notification, UserRole,
  InsertUser, InsertProjectTopic, InsertStudentProject, InsertStudentGroup, InsertProjectAssessment, InsertNotification,
  users, projectTopics, studentProjects, studentGroups, projectAssessments, notifications, projectMilestones, studentGroupMembers,
  IStudentOnboardingRow, IOnboardingResult, IOnboardingProgress,
  ISupervisorOnboardingRow, ISupervisorOnboardingResult,
  ITopicOnboardingRow, ITopicOnboardingResult, ITopicOnboardingSuccessRecord, ITopicOnboardingFailureRecord,
  IEnrollmentConflict, IEnrollmentConflictStudent,
  ISupervisorConflict,
  userNotificationPreferences, IUserNotificationPreferences
} from "@shared/schema";
import { db } from "./db";
import { notifyUser, disconnectAllClients } from "./websocket";
import { eq, and, or, asc, desc, sql, inArray, not, ne, aliasedTable, SQL, like, isNotNull } from "drizzle-orm";
import connectPg from "connect-pg-simple";
import session from "express-session";
import { pool } from "./db";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import JSZip from "jszip";
import ExcelJS from "exceljs";

// Use the exact type that IStorage expects.
const PostgresSessionStore = connectPg(session);

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export class DBStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
    this.sessionStore.on('error', (err: any) => {
      console.error('Session store error:', err?.message || err);
    });
    // Removed synchronous initialization to prevent crashes if DB tables are missing.
    // It will be called explicitly during server startup.
  }

  public async initializeDefaultUser(): Promise<boolean> {
    try {
      const existingAdmin = await db.select().from(users)
        .where(eq(users.username, 'admin'));

      if (existingAdmin.length === 0) {
        const hashedPassword = await hashPassword("Admin@123");
        await db.insert(users).values({
          username: "admin",
          password: hashedPassword,
          firstName: "Admin",
          lastName: "User",
          email: "admin@example.com",
          role: UserRole.ADMIN,
          enrollmentNumber: null,
          groupId: null
        } as unknown as InsertUser);
        console.log("✅ Default admin user successfully created.");
      }
      return true;
    } catch (error: any) {
      if (error?.code === '42P01') {
        console.error("⚠️ Schema 'users' does not exist. Please run 'npm run db:setup' to prepare your database.");
      } else {
        console.error("❌ Failed to create default admin user:", error.message || error);
      }
      return false;
    }
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user as User | undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(and(eq(users.username, username), eq(users.isDeleted, false)));
    return user as User | undefined;
  }

  async getUserByEnrollmentNumber(enrollmentNumber: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(and(eq(users.enrollmentNumber, enrollmentNumber), eq(users.isDeleted, false)));
    return (user as User) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(and(eq(users.email, email.toLowerCase().trim()), eq(users.isDeleted, false)));
    return (user as User) || null;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user as User;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const existing = await this.getUser(id);
    if (!existing) return undefined;

    const updatePayload = { ...data };

    // Synchronize username when enrollment number is changed on student accounts
    if (updatePayload.enrollmentNumber && existing.role === UserRole.STUDENT) {
      const cleanEnrollment = String(updatePayload.enrollmentNumber).trim();
      updatePayload.enrollmentNumber = cleanEnrollment;

      const oldEnrollment = existing.enrollmentNumber;
      if (!updatePayload.username || updatePayload.username === existing.username) {
        if (
          existing.username === oldEnrollment ||
          (oldEnrollment && existing.username.startsWith(`${oldEnrollment}_`)) ||
          existing.username.includes("conflict")
        ) {
          const [taken] = await db.select().from(users).where(
            and(eq(users.username, cleanEnrollment), ne(users.id, id))
          );
          if (!taken) {
            updatePayload.username = cleanEnrollment;
          }
        }
      }
    }

    const [user] = await db.update(users).set(updatePayload).where(eq(users.id, id)).returning();
    return user as User | undefined;
  }

  async getEnrollmentConflicts(): Promise<IEnrollmentConflict[]> {
    const duplicates = await db.execute(sql`
      SELECT enrollment_number, COUNT(*) as count
      FROM users
      WHERE enrollment_number IS NOT NULL
        AND TRIM(enrollment_number) != ''
        AND is_deleted = false
        AND role = 'student'
      GROUP BY enrollment_number
      HAVING COUNT(*) > 1
      ORDER BY enrollment_number ASC
    `);

    const dupRows = Array.isArray(duplicates) ? duplicates : ((duplicates as any)?.rows || []);
    if (!dupRows || dupRows.length === 0) {
      return [];
    }

    const conflictingEnrollments = dupRows.map((d: any) => String(d.enrollment_number));
    const inListSql = sql.join(conflictingEnrollments.map((en: string) => sql`${en}`), sql`, `);

    const studentsWithTeams = await db.execute(sql`
      SELECT 
        u.id,
        u.username,
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.email,
        u.mobile,
        u.course,
        u.enrollment_number as "enrollmentNumber",
        u.created_at as "createdAt",
        sg.id as "groupId",
        sg.name as "groupName",
        sg.project_team_id as "projectTeamId"
      FROM users u
      LEFT JOIN student_group_members sgm ON sgm.user_id = u.id
      LEFT JOIN student_groups sg ON sg.id = sgm.group_id
      WHERE u.enrollment_number IN (${inListSql})
        AND u.is_deleted = false
        AND u.role = 'student'
      ORDER BY u.enrollment_number, u.id
    `);

    const conflictMap = new Map<string, IEnrollmentConflictStudent[]>();
    for (const row of studentsWithTeams as any[]) {
      const en = String(row.enrollmentNumber);
      if (!conflictMap.has(en)) {
        conflictMap.set(en, []);
      }
      conflictMap.get(en)!.push({
        id: Number(row.id),
        username: String(row.username),
        enrollmentNumber: en,
        firstName: String(row.firstName),
        lastName: String(row.lastName),
        email: String(row.email),
        course: row.course ? String(row.course) : null,
        groupId: row.groupId ? Number(row.groupId) : null,
        groupName: row.groupName ? String(row.groupName) : null,
        projectTeamId: row.projectTeamId ? String(row.projectTeamId) : null,
        createdAt: row.createdAt,
      });
    }

    return Array.from(conflictMap.entries()).map(([enrollmentNumber, students]) => ({
      enrollmentNumber,
      count: students.length,
      students,
    }));
  }

  async resolveEnrollmentConflict(userId: number, newEnrollmentNumber: string): Promise<User> {
    const cleanNewEnrollment = newEnrollmentNumber.trim();
    if (!cleanNewEnrollment) {
      throw new Error("New enrollment number cannot be empty");
    }

    const [existingUser] = await db.select().from(users).where(eq(users.id, userId));
    if (!existingUser) {
      throw new Error("Student record not found");
    }
    if (existingUser.role !== UserRole.STUDENT) {
      throw new Error("Only student accounts have enrollment numbers");
    }

    // Check if newEnrollmentNumber is already used by another active user
    const [inUse] = await db.select().from(users).where(
      and(
        eq(users.enrollmentNumber, cleanNewEnrollment),
        eq(users.isDeleted, false),
        ne(users.id, userId)
      )
    );
    if (inUse) {
      throw new Error(`Enrollment number ${cleanNewEnrollment} is already assigned to ${inUse.firstName} ${inUse.lastName}`);
    }

    let newUsername = existingUser.username;
    const oldEnrollment = existingUser.enrollmentNumber;

    if (
      existingUser.username === oldEnrollment ||
      (oldEnrollment && existingUser.username.startsWith(`${oldEnrollment}_`)) ||
      existingUser.username.includes("conflict")
    ) {
      const [usernameTaken] = await db.select().from(users).where(
        and(eq(users.username, cleanNewEnrollment), ne(users.id, userId))
      );
      if (!usernameTaken) {
        newUsername = cleanNewEnrollment;
      }
    }

    let newEmail = existingUser.email;
    if (oldEnrollment && existingUser.email.toLowerCase().startsWith(oldEnrollment.toLowerCase())) {
      const prospectiveEmail = `${cleanNewEnrollment.toLowerCase()}@student.iul.ac.in`;
      const [emailTaken] = await db.select().from(users).where(
        and(eq(users.email, prospectiveEmail), ne(users.id, userId))
      );
      if (!emailTaken) {
        newEmail = prospectiveEmail;
      }
    }

    const [updatedUser] = await db.update(users)
      .set({
        enrollmentNumber: cleanNewEnrollment,
        username: newUsername,
        email: newEmail,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser as User;
  }

  /**
   * Retrieves all active supervisor allotment conflicts.
   * A conflict occurs when a group has an assigned supervisor (student_groups.supervisor_id),
   * but the project topic assigned to the group was proposed by a different faculty member (project_topics.submitted_by_id).
   */
  async getSupervisorConflicts(filterGroupId?: number): Promise<ISupervisorConflict[]> {
    const whereClause = filterGroupId
      ? sql`sg.supervisor_id IS NOT NULL AND pt.submitted_by_id != sg.supervisor_id AND pt.is_deleted = false AND sg.id = ${filterGroupId}`
      : sql`sg.supervisor_id IS NOT NULL AND pt.submitted_by_id != sg.supervisor_id AND pt.is_deleted = false`;

    const result = await db.execute(sql`
      SELECT DISTINCT ON (sg.id)
        sg.id as "groupId",
        sg.name as "groupName",
        sg.project_team_id as "projectTeamId",
        sg.course as "course",
        pt.id as "topicId",
        pt.topic_code as "topicCode",
        pt.title as "topicTitle",
        pt.description as "topicDescription",
        pt.technology as "technology",
        pt.project_type as "projectType",
        pt.estimated_complexity as "estimatedComplexity",
        u_old.id as "oldSupervisorId",
        u_old.first_name as "oldSupervisorFirstName",
        u_old.last_name as "oldSupervisorLastName",
        u_old.prefix as "oldSupervisorPrefix",
        u_old.emp_id as "oldSupervisorEmpId",
        u_old.email as "oldSupervisorEmail",
        u_old.department as "oldSupervisorDepartment",
        u_old.designation as "oldSupervisorDesignation",
        u_new.id as "newSupervisorId",
        u_new.first_name as "newSupervisorFirstName",
        u_new.last_name as "newSupervisorLastName",
        u_new.prefix as "newSupervisorPrefix",
        u_new.emp_id as "newSupervisorEmpId",
        u_new.email as "newSupervisorEmail",
        u_new.department as "newSupervisorDepartment",
        u_new.designation as "newSupervisorDesignation",
        (
          SELECT COUNT(*)
          FROM student_group_members sgm2
          INNER JOIN users u2 ON u2.id = sgm2.user_id AND u2.group_id = sg.id AND u2.is_deleted = false
          WHERE sgm2.group_id = sg.id AND sgm2.status = 'accepted'
        ) as "membersCount"
      FROM student_groups sg
      INNER JOIN student_group_members sgm ON sgm.group_id = sg.id AND sgm.status = 'accepted'
      INNER JOIN users u_student ON u_student.id = sgm.user_id AND u_student.group_id = sg.id AND u_student.is_deleted = false
      INNER JOIN student_projects sp ON sp.student_id = sgm.user_id
      INNER JOIN project_topics pt ON pt.id = sp.topic_id
      INNER JOIN users u_old ON u_old.id = pt.submitted_by_id
      INNER JOIN users u_new ON u_new.id = sg.supervisor_id
      WHERE ${whereClause}
      ORDER BY sg.id ASC
    `);

    const rows = Array.isArray(result) ? result : ((result as any)?.rows || []);
    return rows.map((r: any) => ({
      groupId: Number(r.groupId),
      groupName: String(r.groupName),
      projectTeamId: r.projectTeamId ? String(r.projectTeamId) : null,
      course: r.course ? String(r.course) : null,
      topicId: Number(r.topicId),
      topicCode: r.topicCode ? String(r.topicCode) : null,
      topicTitle: String(r.topicTitle),
      topicDescription: r.topicDescription ? String(r.topicDescription) : null,
      technology: r.technology ? String(r.technology) : null,
      projectType: r.projectType ? String(r.projectType) : null,
      estimatedComplexity: r.estimatedComplexity ? String(r.estimatedComplexity) : null,
      oldSupervisor: {
        id: Number(r.oldSupervisorId),
        name: `${r.oldSupervisorPrefix ? `${r.oldSupervisorPrefix} ` : ""}${r.oldSupervisorFirstName} ${r.oldSupervisorLastName}`.trim(),
        prefix: r.oldSupervisorPrefix || null,
        empId: r.oldSupervisorEmpId || null,
        email: String(r.oldSupervisorEmail),
        department: r.oldSupervisorDepartment || null,
        designation: r.oldSupervisorDesignation || null,
      },
      newSupervisor: {
        id: Number(r.newSupervisorId),
        name: `${r.newSupervisorPrefix ? `${r.newSupervisorPrefix} ` : ""}${r.newSupervisorFirstName} ${r.newSupervisorLastName}`.trim(),
        prefix: r.newSupervisorPrefix || null,
        empId: r.newSupervisorEmpId || null,
        email: String(r.newSupervisorEmail),
        department: r.newSupervisorDepartment || null,
        designation: r.newSupervisorDesignation || null,
      },
      membersCount: Number(r.membersCount || 0),
    }));
  }

  /**
   * Resolves a supervisor allotment conflict using one of two user-chosen strategies:
   * 
   * Option 1 ("copy"):
   * Copies the exact same project, assigns it a new unique sequential PUGID (e.g. PUGID26306),
   * assigns that copied project to the New Supervisor, and updates the group's members to point
   * to this new project. Both Old and New Supervisor have the project showing on their respective
   * dashboards (Old Supervisor retains original PUGID as unpicked/available, New Supervisor has
   * the copied project with new PUGID and the allotted group).
   * 
   * Option 2 ("migrate"):
   * Migrates the same project with the same Project ID and PUGID from Old Supervisor to New Supervisor
   * by changing project_topics.submitted_by_id = newSupervisorId. The project is removed from the Old
   * Supervisor and is migrated to the New Supervisor.
   */
  async resolveSupervisorConflict(
    groupId: number,
    resolution: "copy" | "migrate",
    options?: {
      adminUser?: { id: number; firstName: string; lastName: string };
      newSupervisorId?: number;
    }
  ): Promise<{
    success: boolean;
    message: string;
    resolution: "copy" | "migrate";
    group: StudentGroup;
    topic: ProjectTopic;
    oldTopic?: ProjectTopic;
    newTopicCode?: string;
  }> {
    const group = await this.getGroup(groupId);
    if (!group) {
      throw new Error(`Project team with ID ${groupId} not found`);
    }

    const targetSupervisorId = options?.newSupervisorId || group.supervisorId;
    if (!targetSupervisorId) {
      throw new Error("No target supervisor specified to resolve this conflict");
    }

    const newSupervisor = await this.getUser(targetSupervisorId);
    if (!newSupervisor || newSupervisor.role !== UserRole.SUPERVISOR) {
      throw new Error("The selected user is not a valid faculty supervisor");
    }

    // Query studentGroupMembers with status set to accepted, matching getSupervisorConflicts
    const acceptedMembershipRows = await db
      .select({ userId: studentGroupMembers.userId })
      .from(studentGroupMembers)
      .innerJoin(users, eq(users.id, studentGroupMembers.userId))
      .where(and(
        eq(studentGroupMembers.groupId, group.id),
        eq(studentGroupMembers.status, "accepted"),
        eq(users.groupId, group.id),
        eq(users.isDeleted, false)
      ));
    const memberIds = acceptedMembershipRows.map(m => m.userId);

    if (memberIds.length === 0) {
      throw new Error("No accepted members found in this group");
    }

    // Find the current project assigned to any member
    let currentTopicId: number | null = null;
    for (const mId of memberIds) {
      const sp = await this.getStudentProjects(mId);
      if (sp.length > 0 && sp[0].topicId) {
        currentTopicId = sp[0].topicId;
        break;
      }
    }

    if (!currentTopicId) {
      // If group has no project allotted, just ensure group.supervisorId = targetSupervisorId
      const [updatedGroup] = await db.update(studentGroups)
        .set({ supervisorId: targetSupervisorId, updatedAt: new Date() })
        .where(eq(studentGroups.id, group.id))
        .returning();
      return {
        success: true,
        message: `Supervisor assigned to ${newSupervisor.firstName} ${newSupervisor.lastName} (no project topic was allotted).`,
        resolution,
        group: updatedGroup as StudentGroup,
        topic: null as any,
      };
    }

    const originalTopic = await this.getProjectTopic(currentTopicId);
    if (!originalTopic) {
      throw new Error(`Project topic ID ${currentTopicId} not found`);
    }

    const oldSupervisor = await this.getUser(originalTopic.submittedById);
    const oldSupervisorName = oldSupervisor
      ? `${oldSupervisor.prefix ? `${oldSupervisor.prefix} ` : ""}${oldSupervisor.firstName} ${oldSupervisor.lastName}`.trim()
      : "Previous Supervisor";
    const newSupervisorName = `${newSupervisor.prefix ? `${newSupervisor.prefix} ` : ""}${newSupervisor.firstName} ${newSupervisor.lastName}`.trim();
    const adminName = options?.adminUser ? `${options.adminUser.firstName} ${options.adminUser.lastName}` : "Administrator";

    if (resolution === "copy") {
      // OPTION 1: Copy the project, assign new PUGID, assign copied project to New Supervisor
      // Wrap topic insert, group update, and studentProjects reassignment in an atomic database transaction
      const { copiedTopic, updatedGroup, newTopicCode } = await db.transaction(async (tx) => {
        // Serialize topic-code allocation across concurrent operations
        await tx.execute(sql`SELECT pg_advisory_xact_lock(26001)`);

        const newTopicCode = await this.getNextTopicCode(tx);

        const [copiedTopic] = await tx.insert(projectTopics).values({
          topicCode: newTopicCode,
          title: originalTopic.title,
          description: originalTopic.description,
          technology: originalTopic.technology,
          projectType: originalTopic.projectType,
          course: originalTopic.course,
          estimatedComplexity: originalTopic.estimatedComplexity,
          submittedById: targetSupervisorId,
          status: "approved",
          feedback: originalTopic.feedback,
          isDeleted: false,
        }).returning();

        // Update student group supervisor
        const [updatedGroup] = await tx.update(studentGroups)
          .set({ supervisorId: targetSupervisorId, updatedAt: new Date() })
          .where(eq(studentGroups.id, group.id))
          .returning();

        // Re-point all team members' studentProjects to the new copied topic ID
        await tx.update(studentProjects)
          .set({ topicId: copiedTopic.id, updatedAt: new Date() })
          .where(inArray(studentProjects.studentId, memberIds));

        return { copiedTopic, updatedGroup, newTopicCode };
      });

      // Notifications sent only after successful transaction commit
      if (oldSupervisor && oldSupervisor.id !== targetSupervisorId) {
        await this.createNotification({
          userId: oldSupervisor.id,
          title: "Project Supervisor Reassigned",
          message: `Project team "${group.name}" has been reassigned to ${newSupervisorName} by ${adminName}. Your original project topic "${originalTopic.topicCode || ''} - ${originalTopic.title}" remains active under your profile.`,
        });
      }

      await this.createNotification({
        userId: targetSupervisorId,
        title: "New Project & Team Allotted (Copied Project)",
        message: `Project "${originalTopic.title}" has been cloned and allotted to you as "${newTopicCode}" with Project Team "${group.name}" by ${adminName}.`,
      });

      for (const mId of memberIds) {
        await this.createNotification({
          userId: mId,
          title: "Supervisor & Project Allotment Updated",
          message: `Your project supervisor has been updated to ${newSupervisorName} under project code ${newTopicCode}.`,
        });
      }

      return {
        success: true,
        message: `Project copied successfully with new ID ${newTopicCode}. Allotted to ${newSupervisorName}. Original project ${originalTopic.topicCode || ''} retained by ${oldSupervisorName}.`,
        resolution: "copy",
        group: updatedGroup as StudentGroup,
        topic: copiedTopic as ProjectTopic,
        oldTopic: originalTopic as ProjectTopic,
        newTopicCode,
      };

    } else {
      // OPTION 2: Migrate the same project with same Project ID from Old Supervisor to New Supervisor
      // Wrap migrate branch's topic and group writes in an atomic database transaction
      const { migratedTopic, updatedGroup } = await db.transaction(async (tx) => {
        const [migratedTopic] = await tx.update(projectTopics)
          .set({ submittedById: targetSupervisorId, updatedAt: new Date() })
          .where(eq(projectTopics.id, originalTopic.id))
          .returning();

        const [updatedGroup] = await tx.update(studentGroups)
          .set({ supervisorId: targetSupervisorId, updatedAt: new Date() })
          .where(eq(studentGroups.id, group.id))
          .returning();

        return { migratedTopic, updatedGroup };
      });

      // Notifications sent only after successful transaction commit
      if (oldSupervisor && oldSupervisor.id !== targetSupervisorId) {
        await this.createNotification({
          userId: oldSupervisor.id,
          title: "Project Topic Migrated",
          message: `Project "${originalTopic.topicCode || ''} - ${originalTopic.title}" and team "${group.name}" have been migrated to ${newSupervisorName} by ${adminName}.`,
        });
      }

      await this.createNotification({
        userId: targetSupervisorId,
        title: "Project Topic Transferred",
        message: `Project "${originalTopic.topicCode || ''} - ${originalTopic.title}" and team "${group.name}" have been transferred to your supervision by ${adminName}.`,
      });

      for (const mId of memberIds) {
        await this.createNotification({
          userId: mId,
          title: "Supervisor Updated",
          message: `Your project supervisor has been updated to ${newSupervisorName}.`,
        });
      }

      return {
        success: true,
        message: `Project ${originalTopic.topicCode || ''} migrated successfully to ${newSupervisorName}. Removed from ${oldSupervisorName}.`,
        resolution: "migrate",
        group: updatedGroup as StudentGroup,
        topic: migratedTopic as ProjectTopic,
      };
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    const [deleted] = await db.update(users).set({ isDeleted: true }).where(eq(users.id, id)).returning();
    return !!deleted;
  }

  async getAllUsers(course?: string): Promise<(User & { projectStatus?: string | null; topicCode?: string | null; topicTitle?: string | null; topicsCount?: number })[]> {
    let rawUsers: User[];
    if (course) {
      const normalizedCourse = course.trim().toUpperCase();
      rawUsers = (await db.select().from(users).where(
        and(
          eq(users.isDeleted, false),
          or(
            eq(sql`UPPER(${users.course})`, normalizedCourse),
            eq(users.role, UserRole.ADMIN),
            eq(users.role, UserRole.SUPERVISOR),
            eq(users.role, UserRole.COORDINATOR)
          )
        )
      ).orderBy(asc(users.id))) as User[];
    } else {
      rawUsers = (await db.select().from(users).where(eq(users.isDeleted, false)).orderBy(asc(users.id))) as User[];
    }
    return this.enrichUsersWithProjectAndTopicStatus(rawUsers);
  }

  /**
   * Enriches user objects with their live project allotment status and topic details for students,
   * as well as approved topics count for supervisors.
   */
  async enrichUsersWithProjectAndTopicStatus<T extends User>(
    usersList: T[]
  ): Promise<(T & { projectStatus?: string | null; topicCode?: string | null; topicTitle?: string | null; topicsCount?: number })[]> {
    if (usersList.length === 0) return [];

    const supervisorIds = usersList
      .filter((u) => u.role === UserRole.SUPERVISOR || u.role === "teacher")
      .map((u) => u.id);
    const studentUsers = usersList.filter((u) => u.role === UserRole.STUDENT);

    const studentProjectMap = new Map<number, { status: string; topicCode: string | null; topicTitle: string | null }>();
    const groupProjectMap = new Map<number, { status: string; topicCode: string | null; topicTitle: string | null }>();

    if (studentUsers.length > 0) {
      const allStudentProjects = await db
        .select({
          studentId: studentProjects.studentId,
          status: studentProjects.status,
          topicId: studentProjects.topicId,
          topicCode: projectTopics.topicCode,
          topicTitle: projectTopics.title,
        })
        .from(studentProjects)
        .leftJoin(projectTopics, eq(studentProjects.topicId, projectTopics.id));

      const studentGroupLookup = new Map<number, number>();
      for (const u of studentUsers) {
        if (u.groupId) {
          studentGroupLookup.set(u.id, u.groupId);
        }
      }

      for (const sp of allStudentProjects) {
        studentProjectMap.set(sp.studentId, {
          status: sp.status,
          topicCode: sp.topicCode,
          topicTitle: sp.topicTitle,
        });
        const gId = studentGroupLookup.get(sp.studentId);
        if (gId && !groupProjectMap.has(gId)) {
          groupProjectMap.set(gId, {
            status: sp.status,
            topicCode: sp.topicCode,
            topicTitle: sp.topicTitle,
          });
        }
      }
    }

    const supervisorTopicCountMap = new Map<number, number>();
    if (supervisorIds.length > 0) {
      const topicCounts = await db
        .select({
          supervisorId: projectTopics.submittedById,
          count: sql<number>`count(*)::int`,
        })
        .from(projectTopics)
        .where(
          and(
            eq(projectTopics.isDeleted, false),
            inArray(projectTopics.submittedById, supervisorIds)
          )
        )
        .groupBy(projectTopics.submittedById);

      for (const tc of topicCounts) {
        if (tc.supervisorId) {
          supervisorTopicCountMap.set(tc.supervisorId, Number(tc.count));
        }
      }
    }

    return usersList.map((u) => {
      let projectStatus: string | null = null;
      let topicCode: string | null = null;
      let topicTitle: string | null = null;

      if (u.role === UserRole.STUDENT) {
        const direct = studentProjectMap.get(u.id);
        if (direct) {
          projectStatus = direct.status;
          topicCode = direct.topicCode;
          topicTitle = direct.topicTitle;
        } else if (u.groupId && groupProjectMap.has(u.groupId)) {
          const grp = groupProjectMap.get(u.groupId)!;
          projectStatus = grp.status;
          topicCode = grp.topicCode;
          topicTitle = grp.topicTitle;
        }
      }

      const topicsCount =
        u.role === UserRole.SUPERVISOR || u.role === "teacher"
          ? supervisorTopicCountMap.get(u.id) || 0
          : undefined;

      return {
        ...u,
        projectStatus,
        topicCode,
        topicTitle,
        topicsCount,
      };
    });
  }

  async getUserProfile(id: number): Promise<User | undefined> {
    return this.getUser(id);
  }

  async updateUserProfile(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    return this.updateUser(id, data);
  }


  // Project topic operations
  async getProjectTopic(id: number): Promise<ProjectTopic | null> {
    const [topic] = await db.select().from(projectTopics).where(eq(projectTopics.id, id));
    if (!topic) return null;

    // Fetch submittedBy details
    const [submitter] = await db.select().from(users).where(eq(users.id, topic.submittedById));
    return { ...(topic as ProjectTopic), submittedBy: submitter as any };
  }

  async getTopicsBySupervisor(supervisorId: number): Promise<ProjectTopic[]> {
    return (await db.select().from(projectTopics).where(eq(projectTopics.submittedById, supervisorId))) as ProjectTopic[];
  }

  async getTopicsForSupervisorApproval(supervisorId: number): Promise<ProjectTopic[]> {
    const rows = await db.select({
      topic: projectTopics,
      submitter: users,
      group: studentGroups
    })
    .from(projectTopics)
    .innerJoin(users, eq(projectTopics.submittedById, users.id))
    .innerJoin(studentGroups, eq(users.groupId, studentGroups.id))
    .where(and(
       eq(projectTopics.status, "pending_supervisor"), 
       eq(projectTopics.isDeleted, false),
       eq(studentGroups.supervisorId, supervisorId)
    ));

    return rows.map(r => ({
      ...r.topic,
      submittedBy: r.submitter as any,
      groupName: r.group.name
    })) as ProjectTopic[];
  }

  async getPendingTopics(): Promise<ProjectTopic[]> {
    const rows = await db.select({
      topic: projectTopics,
      submitter: users,
    })
    .from(projectTopics)
    .innerJoin(users, eq(projectTopics.submittedById, users.id))
    .where(and(eq(projectTopics.status, "pending"), eq(projectTopics.isDeleted, false)));

    return rows.map(r => ({
      ...r.topic,
      submittedBy: r.submitter as any
    }));
  }

  async getApprovedTopics(): Promise<ProjectTopic[]> {
    const rows = await db.select({
      topic: projectTopics,
      submitter: users,
    })
    .from(projectTopics)
    .innerJoin(users, eq(projectTopics.submittedById, users.id))
    .where(and(eq(projectTopics.status, "approved"), eq(projectTopics.isDeleted, false)));

    const allottedTopicIds = (await db.select({ topicId: studentProjects.topicId }).from(studentProjects)).map(p => p.topicId);

    return rows.map(r => ({
      ...r.topic,
      submittedBy: r.submitter as any,
      isAllotted: allottedTopicIds.includes(r.topic.id)
    } as any as ProjectTopic));
  }

  async getRejectedTopics(): Promise<ProjectTopic[]> {
    return (await db.select().from(projectTopics).where(and(eq(projectTopics.status, "rejected"), eq(projectTopics.isDeleted, false)))) as ProjectTopic[];
  }

  async getAllTopics(): Promise<ProjectTopic[]> {
    return (await db.select().from(projectTopics).where(eq(projectTopics.isDeleted, false))) as ProjectTopic[];
  }

  async createProjectTopic(topic: InsertProjectTopic): Promise<ProjectTopic> {
    const [newTopic] = await db.insert(projectTopics).values(topic).returning();
    return newTopic as ProjectTopic;
  }

  async getNextTopicCode(txHandle?: any): Promise<string> {
    const executor = txHandle || db;
    const existingTopicsWithCodes = await executor
      .select({ topicCode: projectTopics.topicCode })
      .from(projectTopics)
      .where(and(
        isNotNull(projectTopics.topicCode),
        like(projectTopics.topicCode, "PUGID26%"),
        eq(projectTopics.isDeleted, false)
      ));

    let maxSequence = 0;
    for (const t of existingTopicsWithCodes) {
      if (t.topicCode) {
        const match = t.topicCode.match(/^PUGID26(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSequence) {
            maxSequence = num;
          }
        }
      }
    }
    const nextSequence = maxSequence + 1;
    const seqStr = String(nextSequence).padStart(3, "0");
    return `PUGID26${seqStr}`;
  }

  async createDirectProjectTopic(data: {
    title: string;
    description?: string | null;
    technology: string;
    projectType: string;
    course: string;
    estimatedComplexity?: string;
    facultyId: number;
    creatorName?: string;
  }): Promise<ProjectTopic> {
    const topicCode = await this.getNextTopicCode();

    const [topic] = await db
      .insert(projectTopics)
      .values({
        topicCode,
        title: data.title,
        description: data.description || null,
        submittedById: data.facultyId,
        technology: data.technology,
        projectType: data.projectType,
        course: data.course,
        estimatedComplexity: data.estimatedComplexity || "Medium",
        status: "approved",
      })
      .returning();

    const createdTopic = topic as ProjectTopic;

    // Notify the assigned faculty member
    await this.createNotification({
      userId: data.facultyId,
      title: "Project Topic Assigned",
      message: `A new approved project topic "${createdTopic.title}" (${createdTopic.topicCode}) has been created and assigned to you by ${data.creatorName || "the Project Coordinator"}.`
    });

    return createdTopic;
  }

  async approveProjectTopic(id: number, feedback?: string): Promise<ProjectTopic | undefined> {
    const [topic] = await db.update(projectTopics)
      .set({ status: "approved", feedback })
      .where(eq(projectTopics.id, id))
      .returning();

    if (topic) {
      // Notify the supervisor who submitted it
      await this.createNotification({
        userId: topic.submittedById,
        title: "Topic Approved",
        message: `Your topic "${topic.title}" has been approved.`
      });

      // Notify all admins
      const admins = await this.getUsersByRole("admin" as any);
      for (const admin of admins) {
        await this.createNotification({
          userId: admin.id,
          title: "Topic Approved by Coordinator/Admin",
          message: `Topic "${topic.title}" was approved.`
        });
      }
    }

    return topic as ProjectTopic | undefined;
  }

  async rejectProjectTopic(id: number, feedback: string): Promise<ProjectTopic | undefined> {
    const [topic] = await db.update(projectTopics)
      .set({ status: "rejected", feedback })
      .where(eq(projectTopics.id, id))
      .returning();
    return topic as ProjectTopic | undefined;
  }

  async updateProjectTopic(id: number, data: Partial<InsertProjectTopic> & { status?: string; feedback?: string }): Promise<ProjectTopic> {
    const [topic] = await db.update(projectTopics)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectTopics.id, id))
      .returning();
    return topic as ProjectTopic;
  }

  async updateProjectTopicStatus(id: number, status: string, feedback?: string): Promise<ProjectTopic> {
    const [topic] = await db.update(projectTopics)
      .set({ status, feedback })
      .where(eq(projectTopics.id, id))
      .returning();
    return topic as ProjectTopic;
  }

  async deleteProjectTopic(id: number): Promise<boolean> {
    const [deleted] = await db.update(projectTopics).set({ isDeleted: true }).where(eq(projectTopics.id, id)).returning();
    return !!deleted;
  }


  // Student project operations
  async getStudentProject(id: number): Promise<StudentProject | undefined> {
    const [project] = await db.select().from(studentProjects).where(eq(studentProjects.id, id));
    return project as StudentProject | undefined;
  }

  async getStudentProjects(studentId: number): Promise<(StudentProject & { topic: ProjectTopic | null; supervisor?: User })[]> {
    let rows = await db.select({
      project: studentProjects,
      topic: projectTopics,
      submitter: users
    })
    .from(studentProjects)
    .leftJoin(projectTopics, eq(studentProjects.topicId, projectTopics.id))
    .leftJoin(users, eq(projectTopics.submittedById, users.id))
    .where(eq(studentProjects.studentId, studentId))
    .orderBy(desc(studentProjects.updatedAt), desc(studentProjects.id));

    // Fallback self-healing: If no student_project exists, check if student belongs to a group with an allotted project
    if (rows.length === 0) {
      const membership = await this.getUserGroupMembership(studentId);
      if (membership && membership.group) {
        const groupMembers = await this.getStudentGroupMembers(membership.group.id);
        const siblingIds = groupMembers.map(m => m.id).filter(id => id !== studentId);
        if (siblingIds.length > 0) {
          const [siblingProject] = await db.select()
            .from(studentProjects)
            .where(inArray(studentProjects.studentId, siblingIds))
            .orderBy(desc(studentProjects.updatedAt), desc(studentProjects.id))
            .limit(1);

          if (siblingProject && siblingProject.topicId) {
            await db.insert(studentProjects).values({
              studentId,
              topicId: siblingProject.topicId,
              progress: siblingProject.progress || 0,
              status: siblingProject.status || "in_progress",
            });

            rows = await db.select({
              project: studentProjects,
              topic: projectTopics,
              submitter: users
            })
            .from(studentProjects)
            .leftJoin(projectTopics, eq(studentProjects.topicId, projectTopics.id))
            .leftJoin(users, eq(projectTopics.submittedById, users.id))
            .where(eq(studentProjects.studentId, studentId))
            .orderBy(desc(studentProjects.updatedAt), desc(studentProjects.id));
          }
        }
      }
    }

    // Resolve assigned group supervisor
    let groupSupervisor: User | undefined = undefined;
    const membership = await this.getUserGroupMembership(studentId);
    if (membership?.group?.supervisorId) {
      const sup = await this.getUser(membership.group.supervisorId);
      if (sup) groupSupervisor = sup;
    }

    return rows.map(r => {
      let topic = null;
      if (r.topic) {
        topic = {
          ...r.topic,
          submittedBy: r.submitter || undefined
        } as ProjectTopic;
      }
      return {
        ...r.project,
        topic,
        supervisor: groupSupervisor || (r.submitter as User | undefined)
      } as StudentProject & { topic: ProjectTopic | null; supervisor?: User };
    });
  }

  async createStudentProject(project: InsertStudentProject): Promise<StudentProject> {
    // Note: progress is not in InsertStudentProject, it defaults to 0 in DB.
    const [newProject] = await db.insert(studentProjects).values(project).returning();
    return newProject as StudentProject;
  }

  async updateStudentProject(id: number, data: Partial<InsertStudentProject>): Promise<StudentProject | undefined> {
    const [project] = await db.update(studentProjects).set(data).where(eq(studentProjects.id, id)).returning();
    return project as StudentProject | undefined;
  }

  async getAllProjects(course?: string): Promise<(StudentProject & { topic: ProjectTopic; student: User; supervisor?: User })[]> {
    const rows = await db.select({
      project: studentProjects,
      topic: projectTopics,
      student: users
    })
    .from(studentProjects)
    .innerJoin(projectTopics, eq(studentProjects.topicId, projectTopics.id))
    .innerJoin(users, eq(studentProjects.studentId, users.id))
    .where(course ? eq(projectTopics.course, course) : undefined);

    const submitterIds = Array.from(new Set(rows.map(r => r.topic.submittedById).filter(id => id != null) as number[]));

    const studentUserIds = rows.map(r => r.student.id);
    let groupSupervisorMap = new Map<number, number | null>();
    if (studentUserIds.length > 0) {
      const memberships = await db.select({
        studentId: studentGroupMembers.userId,
        supervisorId: studentGroups.supervisorId
      })
      .from(studentGroupMembers)
      .innerJoin(studentGroups, eq(studentGroupMembers.groupId, studentGroups.id))
      .where(and(
        inArray(studentGroupMembers.userId, studentUserIds),
        eq(studentGroupMembers.status, "accepted")
      ));
      memberships.forEach(m => groupSupervisorMap.set(m.studentId, m.supervisorId));
    }

    const groupSupervisorIds = Array.from(new Set(Array.from(groupSupervisorMap.values()).filter(id => id != null) as number[]));
    const allFacultyIds = Array.from(new Set([...submitterIds, ...groupSupervisorIds]));

    let allFaculty: User[] = [];
    if (allFacultyIds.length > 0) {
      allFaculty = await db.select().from(users).where(inArray(users.id, allFacultyIds));
    }
    const facultyMap = new Map(allFaculty.map(s => [s.id, s]));

    return rows.map(r => {
      const groupSupId = groupSupervisorMap.get(r.student.id);
      const supervisor = (groupSupId ? facultyMap.get(groupSupId) : undefined) ||
                         (r.topic.submittedById ? facultyMap.get(r.topic.submittedById) : undefined);
      return {
        ...(r.project as StudentProject),
        student: r.student as User,
        supervisor,
        topic: {
          ...(r.topic as ProjectTopic),
          submittedBy: r.topic.submittedById ? facultyMap.get(r.topic.submittedById) : undefined
        }
      };
    });
  }

  async isTopicAllotted(topicId: number): Promise<boolean> {
    const [project] = await db.select().from(studentProjects).where(eq(studentProjects.topicId, topicId)).limit(1);
    return !!project;
  }

  /**
   * Fetches all topics submitted by a supervisor, enriched with team details
   * for topics that have been picked by students.
   * Returns each topic with its allotment status and the team that picked it.
   */
  async getSupervisorTopicsWithTeams(supervisorId: number): Promise<{
    id: number;
    topic: ProjectTopic;
    isPicked: boolean;
    team?: {
      groupId: number;
      groupName: string;
      projectTeamId: string | null;
      course: string | null;
      isSupervisorConflict?: boolean;
      assignedSupervisorId?: number | null;
      members: { id: number; firstName: string; lastName: string; enrollmentNumber: string | null; email: string; mobile?: string | null }[];
      progress: number;
    };
  }[]> {
    // Step 1: Fetch all topics submitted by this supervisor
    const supervisorTopics = await db.select()
      .from(projectTopics)
      .where(and(
        eq(projectTopics.submittedById, supervisorId),
        eq(projectTopics.isDeleted, false)
      ))
      .orderBy(desc(projectTopics.createdAt));

    // Step 1b: Also find any student groups where this supervisor is assigned as the mentor
    const supervisedGroups = await db.select()
      .from(studentGroups)
      .where(eq(studentGroups.supervisorId, supervisorId));

    if (supervisedGroups.length > 0) {
      const supervisedGroupIds = supervisedGroups.map(g => g.id);
      const supervisedMembers = await db.select({
        userId: studentGroupMembers.userId,
        groupId: studentGroupMembers.groupId
      })
      .from(studentGroupMembers)
      .where(and(
        inArray(studentGroupMembers.groupId, supervisedGroupIds),
        eq(studentGroupMembers.status, "accepted")
      ));

      const supervisedUserIds = supervisedMembers.map(m => m.userId);
      if (supervisedUserIds.length > 0) {
        const supProjects = await db.select({ topicId: studentProjects.topicId })
          .from(studentProjects)
          .where(inArray(studentProjects.studentId, supervisedUserIds));

        const existingTopicIds = new Set(supervisorTopics.map(t => t.id));
        const additionalTopicIds = Array.from(new Set(
          supProjects.map(p => p.topicId).filter(id => !existingTopicIds.has(id))
        ));

        if (additionalTopicIds.length > 0) {
          const extraTopics = await db.select()
            .from(projectTopics)
            .where(and(
              inArray(projectTopics.id, additionalTopicIds),
              eq(projectTopics.isDeleted, false)
            ));
          supervisorTopics.push(...extraTopics);
        }
      }
    }

    if (supervisorTopics.length === 0) return [];

    const topicIds = supervisorTopics.map(t => t.id);

    // Step 2: Find all student_projects linked to these topics
    const projectRows = await db.select({
      project: studentProjects,
      studentId: studentProjects.studentId,
      topicId: studentProjects.topicId,
    })
    .from(studentProjects)
    .where(inArray(studentProjects.topicId, topicIds));

    // Step 3: Group projects by topicId and collect student IDs
    const topicProjectMap = new Map<number, { studentIds: number[]; progress: number }>();
    for (const row of projectRows) {
      const existing = topicProjectMap.get(row.topicId);
      if (existing) {
        existing.studentIds.push(row.studentId);
        // Average progress across team members
        existing.progress = Math.round((existing.progress + row.project.progress) / 2);
      } else {
        topicProjectMap.set(row.topicId, {
          studentIds: [row.studentId],
          progress: row.project.progress,
        });
      }
    }

    // Step 4: For picked topics, resolve the team (group) via student_group_members
    const allStudentIds = Array.from(new Set(projectRows.map(r => r.studentId)));

    // Map each student to their group
    let studentGroupMap = new Map<number, number>();
    if (allStudentIds.length > 0) {
      const memberships = await db.select({
        studentId: studentGroupMembers.userId,
        groupId: studentGroupMembers.groupId,
      })
      .from(studentGroupMembers)
      .where(and(
        inArray(studentGroupMembers.userId, allStudentIds),
        eq(studentGroupMembers.status, "accepted")
      ));
      memberships.forEach(m => studentGroupMap.set(m.studentId, m.groupId));
    }

    // Step 5: Fetch all relevant groups
    const groupIds = Array.from(new Set(Array.from(studentGroupMap.values())));
    let groupMap = new Map<number, { group: StudentGroup; members: User[] }>();
    if (groupIds.length > 0) {
      const groups = await db.select().from(studentGroups).where(inArray(studentGroups.id, groupIds));

      // Fetch all members for these groups
      const allMembers = await db.select({
        groupId: studentGroupMembers.groupId,
        user: users,
      })
      .from(studentGroupMembers)
      .innerJoin(users, eq(studentGroupMembers.userId, users.id))
      .where(and(
        inArray(studentGroupMembers.groupId, groupIds),
        eq(studentGroupMembers.status, "accepted")
      ));

      for (const g of groups) {
        const members = allMembers
          .filter(m => m.groupId === g.id)
          .map(m => m.user as User);
        groupMap.set(g.id, { group: g as StudentGroup, members });
      }
    }

    // Step 6: Assemble the result
    return supervisorTopics.map(topic => {
      const projectData = topicProjectMap.get(topic.id);
      const isPicked = !!projectData;

      if (!isPicked) {
        return { id: topic.id, topic: topic as ProjectTopic, isPicked: false };
      }

      // Find the group for this topic's students (prioritizing groups supervised by this supervisor)
      let matchedGroupId: number | undefined = undefined;
      for (const sid of projectData.studentIds) {
        const gid = studentGroupMap.get(sid);
        if (gid) {
          const gInfo = groupMap.get(gid);
          if (gInfo?.group.supervisorId === supervisorId) {
            matchedGroupId = gid;
            break;
          }
        }
      }
      if (!matchedGroupId && projectData.studentIds.length > 0) {
        matchedGroupId = studentGroupMap.get(projectData.studentIds[0]);
      }

      const groupData = matchedGroupId ? groupMap.get(matchedGroupId) : undefined;

      return {
        id: topic.id,
        topic: topic as ProjectTopic,
        isPicked: true,
        team: groupData ? {
          groupId: groupData.group.id,
          groupName: groupData.group.name,
          projectTeamId: groupData.group.projectTeamId,
          course: groupData.group.course,
          isSupervisorConflict: !!(groupData.group.supervisorId && groupData.group.supervisorId !== supervisorId),
          assignedSupervisorId: groupData.group.supervisorId,
          members: groupData.members.map(m => ({
            id: m.id,
            firstName: m.firstName,
            lastName: m.lastName,
            enrollmentNumber: m.enrollmentNumber,
            email: m.email,
            mobile: m.mobile,
          })),
          progress: projectData.progress,
        } : {
          // Fallback: individual student without a group
          groupId: 0,
          groupName: "Individual Assignment",
          projectTeamId: null,
          course: null,
          members: [],
          progress: projectData.progress,
        },
      };
    });
  }


  // Student Group operations
  async createStudentGroup(group: InsertStudentGroup, creatorId: number, invitedEnrollmentNumbers: string[], autoAccept: boolean = false): Promise<StudentGroup> {
    const [newGroup] = await db.insert(studentGroups).values({
      ...group,
      createdById: creatorId
    }).returning();

    const creator = await this.getUser(creatorId);
    const isStudent = creator?.role === UserRole.STUDENT;

    // Add creator as accepted member only if they are a student
    if (isStudent) {
      await db.delete(studentGroupMembers).where(and(
        eq(studentGroupMembers.userId, creatorId),
        ne(studentGroupMembers.groupId, newGroup.id)
      ));

      await db.insert(studentGroupMembers).values({
        userId: creatorId,
        groupId: newGroup.id,
        status: 'accepted'
      });

      // Update creator's groupId in users table
      await db.update(users).set({ groupId: newGroup.id }).where(eq(users.id, creatorId));
    }

    // Handle invites
    if (invitedEnrollmentNumbers.length > 0) {
      const invitedUsers = await db.select().from(users).where(inArray(users.enrollmentNumber, invitedEnrollmentNumbers));

      for (const invitedUser of invitedUsers) {
        if (invitedUser.id !== creatorId) {
          if (autoAccept) {
            await db.delete(studentGroupMembers).where(and(
              eq(studentGroupMembers.userId, invitedUser.id),
              ne(studentGroupMembers.groupId, newGroup.id)
            ));
          }

          // Add as pending or accepted member
          await db.insert(studentGroupMembers).values({
            userId: invitedUser.id,
            groupId: newGroup.id,
            status: autoAccept ? 'accepted' : 'pending'
          });
          // Update user's groupId
          await db.update(users).set({ groupId: newGroup.id }).where(eq(users.id, invitedUser.id));

          // Create notification
          await this.createNotification({
            userId: invitedUser.id,
            title: autoAccept ? "Added to Project Team" : "Project Team Invitation",
            message: autoAccept 
              ? `You have been added to the project team "${newGroup.name}".`
              : `You have been invited to join project team "${newGroup.name}".`
          });
        }
      }
    }

    // Notify the assigned supervisor
    if (newGroup.supervisorId) {
      await this.createNotification({
        userId: newGroup.supervisorId,
        title: "Assigned to New Group",
        message: `You have been assigned as the supervisor for the group "${newGroup.name}".`
      });
    }

    return newGroup as StudentGroup;
  }

  async getGroup(id: number): Promise<StudentGroup | undefined> {
    const [group] = await db.select().from(studentGroups).where(eq(studentGroups.id, id));
    return group as StudentGroup | undefined;
  }

  async getUserGroup(userId: number): Promise<StudentGroup | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || !user.groupId) return undefined;

    return this.getGroup(user.groupId);
  }

  async updateStudentGroupMembers(groupId: number, newEnrollmentNumbers: string[]): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error("Group not found");

    // Fetch current members
    const currentMembers = await this.getStudentGroupMembers(groupId);
    const currentEnrollmentNumbers = currentMembers.map((m: any) => m.enrollmentNumber);

    // Identify added and removed students
    const addedEnrollmentNumbers = newEnrollmentNumbers.filter(en => !currentEnrollmentNumbers.includes(en));
    const removedEnrollmentNumbers = currentEnrollmentNumbers.filter((en: string) => !newEnrollmentNumbers.includes(en));

    if (removedEnrollmentNumbers.length > 0) {
      const removedUsers = await db.select().from(users).where(inArray(users.enrollmentNumber, removedEnrollmentNumbers));
      for (const removedUser of removedUsers) {
        await this.removeStudentFromGroup(removedUser.id, groupId);
        await this.createNotification({
          userId: removedUser.id,
          title: "Removed from Project Team",
          message: `You have been removed from the project team "${group.name}".`
        });
      }
    }

    if (addedEnrollmentNumbers.length > 0) {
      const addedUsers = await db.select().from(users).where(inArray(users.enrollmentNumber, addedEnrollmentNumbers));
      for (const addedUser of addedUsers) {
        // Remove from any prior group memberships to prevent duplicate accepted memberships
        await db.delete(studentGroupMembers).where(and(
          eq(studentGroupMembers.userId, addedUser.id),
          ne(studentGroupMembers.groupId, groupId)
        ));

        const [existing] = await db.select()
          .from(studentGroupMembers)
          .where(and(
            eq(studentGroupMembers.userId, addedUser.id),
            eq(studentGroupMembers.groupId, groupId)
          ));

        if (existing) {
          if (existing.status !== 'accepted') {
            await db.update(studentGroupMembers).set({ status: 'accepted', updatedAt: new Date() }).where(eq(studentGroupMembers.id, existing.id));
          }
        } else {
          await db.insert(studentGroupMembers).values({
            userId: addedUser.id,
            groupId: groupId,
            status: 'accepted'
          });
        }
        await db.update(users).set({ groupId: groupId }).where(eq(users.id, addedUser.id));
        await this.createNotification({
          userId: addedUser.id,
          title: "Added to Project Team",
          message: `You have been added to the project team "${group.name}".`
        });
      }
    }
  }

  async getStudentGroupMembers(groupId: number): Promise<User[]> {
    const members = await db.select({ user: users })
      .from(studentGroupMembers)
      .innerJoin(users, eq(studentGroupMembers.userId, users.id))
      .where(and(
        eq(studentGroupMembers.groupId, groupId),
        eq(users.groupId, groupId),
        eq(users.isDeleted, false)
      ));

    return members.map(m => m.user as User);
  }

  async getAcceptedGroupMembers(groupId: number): Promise<User[]> {
    const members = await db.select({ user: users })
      .from(studentGroupMembers)
      .innerJoin(users, eq(studentGroupMembers.userId, users.id))
      .where(and(
        eq(studentGroupMembers.groupId, groupId),
        eq(studentGroupMembers.status, 'accepted'),
        eq(users.groupId, groupId),
        eq(users.isDeleted, false)
      ));
    return members.map(m => m.user as User);
  }

  async getUserGroupMembership(userId: number): Promise<{ group: StudentGroup, status: string } | undefined> {
    const [membership] = await db.select()
      .from(studentGroupMembers)
      .where(eq(studentGroupMembers.userId, userId));

    if (!membership) return undefined;

    const group = await this.getGroup(membership.groupId);
    if (!group) return undefined;

    return { group: group as StudentGroup, status: membership.status };
  }

  async addStudentToGroup(userId: number, groupId: number): Promise<boolean> {
    // Remove from any prior group memberships to prevent duplicate accepted memberships
    await db.delete(studentGroupMembers).where(and(
      eq(studentGroupMembers.userId, userId),
      ne(studentGroupMembers.groupId, groupId)
    ));

    const [existing] = await db.select()
      .from(studentGroupMembers)
      .where(and(
        eq(studentGroupMembers.userId, userId),
        eq(studentGroupMembers.groupId, groupId)
      ));

    if (existing) {
      if (existing.status !== 'accepted') {
        await db.update(studentGroupMembers).set({ status: 'accepted', updatedAt: new Date() }).where(eq(studentGroupMembers.id, existing.id));
      }
    } else {
      await db.insert(studentGroupMembers).values({
        userId,
        groupId,
        status: 'accepted'
      });
    }
    await db.update(users).set({ groupId }).where(eq(users.id, userId));

    // If group already has an active project, automatically link this student to that project
    const groupMembers = await this.getStudentGroupMembers(groupId);
    const otherMemberIds = groupMembers.map(m => m.id).filter(id => id !== userId);
    if (otherMemberIds.length > 0) {
      const [existingProj] = await db.select().from(studentProjects).where(inArray(studentProjects.studentId, otherMemberIds)).limit(1);
      if (existingProj && existingProj.topicId) {
        const [hasProj] = await db.select().from(studentProjects).where(eq(studentProjects.studentId, userId));
        if (!hasProj) {
          await db.insert(studentProjects).values({
            studentId: userId,
            topicId: existingProj.topicId,
            progress: existingProj.progress || 0,
            status: existingProj.status || "in_progress",
          });
        }
      }
    }

    return true;
  }

  async removeStudentFromGroup(userId: number, groupId: number): Promise<boolean> {
    // Unlink any student projects so the student does not have orphaned project references
    const projects = await db.select().from(studentProjects).where(eq(studentProjects.studentId, userId));
    for (const proj of projects) {
      await db.delete(projectAssessments).where(eq(projectAssessments.projectId, proj.id));
      await db.delete(projectMilestones).where(eq(projectMilestones.projectId, proj.id));
      await db.delete(studentProjects).where(eq(studentProjects.id, proj.id));
    }

    await db.delete(studentGroupMembers)
      .where(and(eq(studentGroupMembers.userId, userId), eq(studentGroupMembers.groupId, groupId)));
    await db.update(users).set({ groupId: null, updatedAt: new Date() }).where(eq(users.id, userId));
    return true;
  }

  async deleteStudentGroup(groupId: number): Promise<boolean> {
    const group = await this.getGroup(groupId);
    if (!group) return false;

    // Fetch members to clean up projects and notify
    const members = await this.getStudentGroupMembers(groupId);
    for (const member of members) {
      const projects = await db.select().from(studentProjects).where(eq(studentProjects.studentId, member.id));
      for (const proj of projects) {
        await db.delete(projectAssessments).where(eq(projectAssessments.projectId, proj.id));
        await db.delete(projectMilestones).where(eq(projectMilestones.projectId, proj.id));
        await db.delete(studentProjects).where(eq(studentProjects.id, proj.id));
      }

      await this.createNotification({
        userId: member.id,
        title: "Project Team Dissolved",
        message: `Your project team "${group.name}" has been removed by an administrator. Your student account remains active and you are now available to join or form a new team.`
      });
    }

    // Unlink all users associated with this group without deleting their user accounts
    await db.update(users).set({ groupId: null, updatedAt: new Date() }).where(eq(users.groupId, groupId));

    // Delete group membership records
    await db.delete(studentGroupMembers).where(eq(studentGroupMembers.groupId, groupId));

    // Notify supervisor if one was assigned
    if (group.supervisorId) {
      await this.createNotification({
        userId: group.supervisorId,
        title: "Project Team Removed",
        message: `The project team "${group.name}" has been removed by an administrator.`
      });
    }

    // Delete the group record itself
    await db.delete(studentGroups).where(eq(studentGroups.id, groupId));

    return true;
  }

  async updateStudentGroup(groupId: number, data: { name?: string; description?: string; course?: string; supervisorId?: number | null }): Promise<StudentGroup | undefined> {
    const updateData: any = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.course !== undefined) updateData.course = data.course;
    if (data.supervisorId !== undefined) updateData.supervisorId = data.supervisorId;

    const [updated] = await db.update(studentGroups)
      .set(updateData)
      .where(eq(studentGroups.id, groupId))
      .returning();
    return updated as StudentGroup | undefined;
  }

  async acceptGroupInvite(userId: number, groupId: number): Promise<boolean> {
    await db.update(studentGroupMembers)
      .set({ status: 'accepted' })
      .where(and(eq(studentGroupMembers.userId, userId), eq(studentGroupMembers.groupId, groupId)));
    await db.update(users).set({ groupId }).where(eq(users.id, userId));

    // If group already has an active project, automatically link this student to that project
    const groupMembers = await this.getStudentGroupMembers(groupId);
    const otherMemberIds = groupMembers.map(m => m.id).filter(id => id !== userId);
    if (otherMemberIds.length > 0) {
      const [existingProj] = await db.select().from(studentProjects).where(inArray(studentProjects.studentId, otherMemberIds)).limit(1);
      if (existingProj && existingProj.topicId) {
        const [hasProj] = await db.select().from(studentProjects).where(eq(studentProjects.studentId, userId));
        if (!hasProj) {
          await db.insert(studentProjects).values({
            studentId: userId,
            topicId: existingProj.topicId,
            progress: existingProj.progress || 0,
            status: existingProj.status || "in_progress",
          });
        }
      }
    }

    return true;
  }

  async rejectGroupInvite(userId: number, groupId: number): Promise<boolean> {
    await this.removeStudentFromGroup(userId, groupId);
    return true;
  }



  async getUsersByRole(role: UserRole): Promise<User[]> {
    return (await db.select().from(users).where(and(eq(users.role, role), eq(users.isDeleted, false)))) as User[];
  }

  async getAllStudentGroups(): Promise<any[]> {
    const groups = await db.select().from(studentGroups);
    const result = await Promise.all(groups.map(async (group) => {
      const members = await this.getStudentGroupMembers(group.id);
      let supervisor = group.supervisorId ? await this.getUser(group.supervisorId) : null;
      let project: { id: number; topicId: number; status: string; topicCode?: string | null; topicTitle?: string; submittedById?: number | null } | null = null;
      let topicProposer: { id: number; prefix?: string | null; firstName: string; lastName: string; empId?: string | null; email: string; department?: string | null; designation?: string | null } | null = null;
      let isSupervisorConflict = false;

      // Check if group members have an assigned project
      if (members.length > 0) {
        for (const m of members) {
          const mProjects = await this.getStudentProjects(m.id);
          if (mProjects.length > 0 && mProjects[0].topicId) {
            const topic = await this.getProjectTopic(mProjects[0].topicId);
            if (topic) {
              project = {
                id: mProjects[0].id,
                topicId: mProjects[0].topicId,
                status: mProjects[0].status,
                topicCode: topic.topicCode,
                topicTitle: topic.title,
                submittedById: topic.submittedById,
              };

              // Fallback resolution: If group.supervisorId is null, resolve supervisor from topic
              if (!supervisor && topic.submittedById) {
                supervisor = await this.getUser(topic.submittedById);
                // Self-heal the database record
                await this.updateStudentGroupSupervisor(group.id, topic.submittedById);
              }

              if (topic.submittedById) {
                const proposerUser = await this.getUser(topic.submittedById);
                if (proposerUser) {
                  topicProposer = {
                    id: proposerUser.id,
                    prefix: proposerUser.prefix,
                    firstName: proposerUser.firstName,
                    lastName: proposerUser.lastName,
                    empId: proposerUser.empId,
                    email: proposerUser.email,
                    department: proposerUser.department,
                    designation: proposerUser.designation,
                  };
                }
              }

              if (supervisor && topic.submittedById && supervisor.id !== topic.submittedById) {
                isSupervisorConflict = true;
              }
            }
            break;
          }
        }
      }

      return {
        ...group,
        supervisorId: supervisor ? supervisor.id : group.supervisorId,
        project,
        isSupervisorConflict,
        topicProposer,
        members: members.map(m => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email,
          enrollmentNumber: m.enrollmentNumber,
          mobile: m.mobile,
          role: m.role,
          course: m.course,
        })),
        supervisor: supervisor ? {
          id: supervisor.id,
          prefix: supervisor.prefix,
          firstName: supervisor.firstName,
          lastName: supervisor.lastName,
          email: supervisor.email,
          role: supervisor.role,
          department: supervisor.department,
          designation: supervisor.designation,
        } : null,
      };
    }));
    return result;
  }

  async updateStudentGroupSupervisor(groupId: number, supervisorId: number): Promise<StudentGroup | undefined> {
    const [updated] = await db.update(studentGroups)
      .set({ supervisorId, updatedAt: new Date() })
      .where(eq(studentGroups.id, groupId))
      .returning();
    return updated as StudentGroup | undefined;
  }

  async updateStudentGroupTopic(
    groupId: number,
    topicId: number,
    options?: {
      updateSupervisor?: boolean;
      adminUser?: { id: number; firstName: string; lastName: string };
    }
  ): Promise<{
    group: StudentGroup;
    topic: ProjectTopic;
    affectedStudentsCount: number;
  }> {
    const group = await this.getGroup(groupId);
    if (!group) {
      throw new Error("Project team not found");
    }

    const topic = await this.getProjectTopic(topicId);
    if (!topic) {
      throw new Error("Project topic not found");
    }
    if (topic.status !== "approved") {
      throw new Error("Selected topic is not approved");
    }

    const members = await this.getStudentGroupMembers(groupId);
    if (members.length === 0) {
      throw new Error("Cannot assign topic to a team with no members");
    }

    const memberIds = new Set(members.map(m => m.id));

    // Check if topic is already allotted to another team/student
    const existingProjectsWithTopic = await db.select()
      .from(studentProjects)
      .where(eq(studentProjects.topicId, topicId));

    const takenByOther = existingProjectsWithTopic.some(p => !memberIds.has(p.studentId));
    if (takenByOther) {
      throw new Error("This topic has already been selected by another project team");
    }

    // Update or insert student_projects for all team members
    for (const member of members) {
      const existingProjects = await db.select()
        .from(studentProjects)
        .where(eq(studentProjects.studentId, member.id));

      if (existingProjects.length > 0) {
        await db.update(studentProjects)
          .set({ topicId, updatedAt: new Date() })
          .where(eq(studentProjects.id, existingProjects[0].id));

        // Clean up any stale duplicate project rows for this student
        for (let i = 1; i < existingProjects.length; i++) {
          await db.delete(studentProjects).where(eq(studentProjects.id, existingProjects[i].id));
        }
      } else {
        await db.insert(studentProjects).values({
          studentId: member.id,
          topicId,
          progress: 0,
          status: "in_progress",
        });
      }
    }

    // Update group supervisor if requested (default to true if topic has submittedById)
    let updatedGroup = group;
    const shouldUpdateSupervisor = options?.updateSupervisor !== undefined ? options.updateSupervisor : true;
    if (shouldUpdateSupervisor && topic.submittedById) {
      const [ug] = await db.update(studentGroups)
        .set({ supervisorId: topic.submittedById, updatedAt: new Date() })
        .where(eq(studentGroups.id, groupId))
        .returning();
      if (ug) updatedGroup = ug as StudentGroup;
    } else {
      const [ug] = await db.update(studentGroups)
        .set({ updatedAt: new Date() })
        .where(eq(studentGroups.id, groupId))
        .returning();
      if (ug) updatedGroup = ug as StudentGroup;
    }

    // Notify all group members
    const changerName = options?.adminUser ? `${options.adminUser.firstName} ${options.adminUser.lastName}` : "the Academic Coordinator";
    for (const member of members) {
      await this.createNotification({
        userId: member.id,
        title: "Project Topic Updated",
        message: `Your project team's topic has been updated to "${topic.title}" (${topic.topicCode || 'Topic #' + topic.id}) by ${changerName}.`,
      });
    }

    // Also notify supervisor if assigned
    if (updatedGroup.supervisorId) {
      await this.createNotification({
        userId: updatedGroup.supervisorId,
        title: "Project Team Assigned",
        message: `Team "${group.name}" (${group.projectTeamId || ''}) has been assigned to topic "${topic.title}".`,
      });
    }

    return {
      group: updatedGroup,
      topic,
      affectedStudentsCount: members.length,
    };
  }

  async unassignStudentGroupTopic(groupId: number): Promise<boolean> {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error("Project team not found");

    const members = await this.getStudentGroupMembers(groupId);
    for (const member of members) {
      const projects = await db.select().from(studentProjects).where(eq(studentProjects.studentId, member.id));
      for (const proj of projects) {
        await db.delete(projectAssessments).where(eq(projectAssessments.projectId, proj.id));
        await db.delete(projectMilestones).where(eq(projectMilestones.projectId, proj.id));
        await db.delete(studentProjects).where(eq(studentProjects.id, proj.id));
      }
      await this.createNotification({
        userId: member.id,
        title: "Project Topic Unassigned",
        message: `The project topic for team "${group.name}" has been unassigned by the Academic Coordinator. The team is now open for a new topic assignment.`,
      });
    }
    return true;
  }

  async getSupervisorsSummary(courseFilter?: string): Promise<{
    supervisors: any[];
    stats: {
      totalSupervisors: number;
      activeSupervisors: number;
      availableSupervisors: number;
      totalTopicsSubmitted: number;
      totalTopicsApproved: number;
      totalTopicsAssigned: number;
      totalTeamsAssigned: number;
      totalStudentsSupervised: number;
    };
  }> {
    const normalizedCourse = courseFilter && courseFilter !== "all" ? courseFilter.trim().toUpperCase() : null;

    // 1. Fetch all supervisors
    const supervisorUsers = await db.select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      empId: users.empId,
      prefix: users.prefix,
      designation: users.designation,
      mobile: users.mobile,
      department: users.department,
      course: users.course,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.role, UserRole.SUPERVISOR), eq(users.isDeleted, false)))
    .orderBy(asc(users.firstName), asc(users.lastName));

    // 2. Fetch all non-deleted topics
    const allTopics = await db.select().from(projectTopics)
      .where(eq(projectTopics.isDeleted, false))
      .orderBy(desc(projectTopics.createdAt));

    // 3. Fetch all groups with members and project info
    const allGroups = await this.getAllStudentGroups();

    // Map: topicId -> assigned group info
    const topicToGroupMap = new Map<number, any>();
    for (const group of allGroups) {
      if (group.project && group.project.topicId) {
        topicToGroupMap.set(group.project.topicId, {
          id: group.id,
          name: group.name,
          projectTeamId: group.projectTeamId,
          course: group.course,
          maxSize: group.maxSize,
          memberCount: group.members?.length || 0,
          members: group.members || [],
          projectStatus: group.project.status,
          progress: group.project.progress || 0,
        });
      }
    }

    // Map: supervisorId -> assigned groups
    const supervisorToGroupsMap = new Map<number, any[]>();
    for (const group of allGroups) {
      const effectiveSupervisorId = group.supervisorId || (group.project?.submittedById ?? null);
      if (effectiveSupervisorId) {
        const list = supervisorToGroupsMap.get(effectiveSupervisorId) || [];
        if (!list.some(g => g.id === group.id)) {
          list.push({
            id: group.id,
            name: group.name,
            projectTeamId: group.projectTeamId,
            course: group.course,
            maxSize: group.maxSize,
            memberCount: group.members?.length || 0,
            members: group.members || [],
            project: group.project,
          });
        }
        supervisorToGroupsMap.set(effectiveSupervisorId, list);
      }
    }

    // Map: supervisorId -> submitted topics with assigned team info
    const supervisorToTopicsMap = new Map<number, any[]>();
    for (const topic of allTopics) {
      const list = supervisorToTopicsMap.get(topic.submittedById) || [];
      const assignedTeam = topicToGroupMap.get(topic.id) || null;
      list.push({
        ...topic,
        assignedTeam,
      });
      supervisorToTopicsMap.set(topic.submittedById, list);
    }

    // Compute summary per supervisor
    const supervisors = supervisorUsers.map(sup => {
      let supTopics = supervisorToTopicsMap.get(sup.id) || [];
      let supTeams = supervisorToGroupsMap.get(sup.id) || [];

      // Filter by course if specified
      if (normalizedCourse) {
        supTopics = supTopics.filter(t => (t.course || '').trim().toUpperCase() === normalizedCourse);
        supTeams = supTeams.filter(g => (g.course || '').trim().toUpperCase() === normalizedCourse);
      }

      const totalTopics = supTopics.length;
      const approvedTopics = supTopics.filter(t => t.status === "approved").length;
      const pendingTopics = supTopics.filter(t => t.status === "pending" || t.status === "pending_supervisor").length;
      const rejectedTopics = supTopics.filter(t => t.status === "rejected").length;
      const assignedTopics = supTopics.filter(t => !!t.assignedTeam).length;
      const availableTopics = supTopics.filter(t => t.status === "approved" && !t.assignedTeam).length;
      const assignedTeams = supTeams.length;
      const totalStudentsSupervised = supTeams.reduce((sum, g) => sum + (g.memberCount || 0), 0);

      const capacity = totalTopics > 0 ? totalTopics : 5;
      let workloadStatus: "available" | "optimal" | "high" | "maximum" = "available";
      if (assignedTeams === 0) {
        workloadStatus = "available";
      } else if (assignedTeams >= capacity) {
        workloadStatus = "maximum";
      } else if (assignedTeams >= Math.ceil(capacity * 0.7)) {
        workloadStatus = "high";
      } else {
        workloadStatus = "optimal";
      }

      return {
        ...sup,
        submittedTopics: supTopics,
        assignedTeams: supTeams,
        metrics: {
          totalTopics,
          approvedTopics,
          pendingTopics,
          rejectedTopics,
          assignedTopics,
          availableTopics,
          assignedTeams,
          totalStudentsSupervised,
          workloadStatus,
        }
      };
    });

    // Compute overall stats
    const totalSupervisors = supervisors.length;
    const activeSupervisors = supervisors.filter(s => s.metrics.assignedTeams > 0).length;
    const availableSupervisors = supervisors.filter(s => s.metrics.assignedTeams === 0).length;
    const totalTopicsSubmitted = supervisors.reduce((sum, s) => sum + s.metrics.totalTopics, 0);
    const totalTopicsApproved = supervisors.reduce((sum, s) => sum + s.metrics.approvedTopics, 0);
    const totalTopicsAssigned = supervisors.reduce((sum, s) => sum + s.metrics.assignedTopics, 0);
    const totalTeamsAssigned = supervisors.reduce((sum, s) => sum + s.metrics.assignedTeams, 0);
    const totalStudentsSupervised = supervisors.reduce((sum, s) => sum + s.metrics.totalStudentsSupervised, 0);

    return {
      supervisors,
      stats: {
        totalSupervisors,
        activeSupervisors,
        availableSupervisors,
        totalTopicsSubmitted,
        totalTopicsApproved,
        totalTopicsAssigned,
        totalTeamsAssigned,
        totalStudentsSupervised,
      }
    };
  }

  // Notification operations
  async getUserNotifications(userId: number): Promise<Notification[]> {
    return (await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt))) as Notification[];
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [n] = await db.insert(notifications).values(notification).returning();
    const createdNotification = n as Notification;
    // Broadcast via WebSocket
    if (createdNotification.userId) {
      notifyUser(createdNotification.userId, createdNotification);
    }
    return createdNotification;
  }

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const [n] = await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).returning();
    return n as Notification;
  }

  /**
   * Marks a notification as read ONLY if it belongs to the given user.
   * Returns the updated row, or undefined when the notification does not
   * exist or belongs to someone else (prevents cross-user IDOR).
   */
  async markNotificationAsReadForUser(id: number, userId: number): Promise<Notification | undefined> {
    const [n] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return n as Notification | undefined;
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  async deleteAllNotificationsForUser(userId: number): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }


  // Project Assessment operations
  async createProjectAssessment(assessment: InsertProjectAssessment): Promise<ProjectAssessment> {
    const [pa] = await db.insert(projectAssessments).values(assessment).returning();
    return pa as ProjectAssessment;
  }

  async getProjectAssessment(projectId: number, supervisorId: number): Promise<ProjectAssessment | undefined> {
    const [assessment] = await db.select().from(projectAssessments)
      .where(and(eq(projectAssessments.projectId, projectId), eq(projectAssessments.supervisorId, supervisorId)));
    return assessment as ProjectAssessment | undefined;
  }

  async updateProjectAssessment(id: number, data: InsertProjectAssessment): Promise<ProjectAssessment> {
    const [pa] = await db.update(projectAssessments)
      .set(data)
      .where(eq(projectAssessments.id, id))
      .returning();
    return pa as ProjectAssessment;
  }

  async getProjectAssessments(projectId: number): Promise<ProjectAssessment[]> {
    return (await db.select().from(projectAssessments).where(eq(projectAssessments.projectId, projectId))) as ProjectAssessment[];
  }


  // Search and report operations
  async searchProjects(criteria: {
    projectName?: string;
    supervisorName?: string;
    studentName?: string;
    enrollmentNumber?: string;
    department?: string;
    status?: string;
  }): Promise<(StudentProject & { topic: ProjectTopic, student: User, supervisor?: User })[]> {
    const allProjects = await this.getAllProjects();

    const normalizeText = (text?: string): string => {
      if (!text) return "";
      return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    };

    const tokenize = (q?: string): string[] => {
      if (!q) return [];
      return normalizeText(q)
        .trim()
        .split(/\s+/)
        .filter(t => t.length > 0);
    };

    const projectTokens = tokenize(criteria.projectName);
    const studentTokens = tokenize(criteria.studentName);
    const supervisorTokens = tokenize(criteria.supervisorName);
    const enrollmentTokens = tokenize(criteria.enrollmentNumber);

    return allProjects.filter(p => {
      // 1. Project name / topic token matching
      if (projectTokens.length > 0) {
        const topicDoc = normalizeText(`${p.topic.title} ${p.topic.description || ''} ${p.topic.technology || ''} ${p.topic.topicCode || ''}`);
        for (const token of projectTokens) {
          if (!topicDoc.includes(token)) return false;
        }
      }

      // 2. Student name token matching
      if (studentTokens.length > 0) {
        const studentDoc = normalizeText(`${p.student.firstName} ${p.student.lastName}`);
        for (const token of studentTokens) {
          if (!studentDoc.includes(token)) return false;
        }
      }

      // 3. Supervisor name token matching
      if (supervisorTokens.length > 0) {
        if (!p.supervisor) return false;
        const supervisorDoc = normalizeText(`${p.supervisor.prefix || ''} ${p.supervisor.firstName} ${p.supervisor.lastName} ${p.supervisor.department || ''}`);
        for (const token of supervisorTokens) {
          if (!supervisorDoc.includes(token)) return false;
        }
      }

      // 4. Enrollment number token matching
      if (enrollmentTokens.length > 0) {
        const enrollmentDoc = normalizeText(p.student.enrollmentNumber || '');
        for (const token of enrollmentTokens) {
          if (!enrollmentDoc.includes(token)) return false;
        }
      }

      if (criteria.department && p.student.department !== criteria.department) return false;
      if (criteria.status && p.status !== criteria.status) return false;
      return true;
    });
  }

  // Statistics
  async getDepartmentStats(): Promise<Record<string, { progress: number, studentCount: number, projectCount: number }>> {
    const projects = await this.getAllProjects();
    const stats: Record<string, { progress: number, studentCount: number, projectCount: number }> = {};

    for (const p of projects) {
      const dept = 'General';
      if (!stats[dept]) stats[dept] = { progress: 0, studentCount: 0, projectCount: 0 };

      stats[dept].projectCount++;
      stats[dept].progress += p.progress || 0;
      stats[dept].studentCount++; // Approximate
    }

    for (const dept in stats) {
      stats[dept].progress = Math.round(stats[dept].progress / (stats[dept].projectCount || 1));
    }
    return stats;
  }

  async getProjectMilestones(projectId: number): Promise<ProjectMilestone[]> {
    return (await db.select().from(projectMilestones).where(eq(projectMilestones.projectId, projectId))) as ProjectMilestone[];
  }

  // Admin operations
  async exportData(): Promise<any> {
    const groupsData = await db.select().from(studentGroups);
    const usersData = await db.select().from(users);
    const groupMembersData = await db.select().from(studentGroupMembers);
    const topicsData = await db.select().from(projectTopics);
    const projectsData = await db.select().from(studentProjects);
    const assessmentsData = await db.select().from(projectAssessments);
    const milestonesData = await db.select().from(projectMilestones);
    const notificationsData = await db.select().from(notifications);

    const timestamp = new Date().toISOString();
    const metadata = {
      portalName: "Integral University Academic Project Management Portal (IU-APMP)",
      portalCode: "IU-APMP",
      version: "2.3.2",
      exportedAt: timestamp,
      recordCounts: {
        studentGroups: groupsData.length,
        users: usersData.length,
        studentGroupMembers: groupMembersData.length,
        projectTopics: topicsData.length,
        studentProjects: projectsData.length,
        projectAssessments: assessmentsData.length,
        projectMilestones: milestonesData.length,
        notifications: notificationsData.length,
        totalRecords: (
          groupsData.length +
          usersData.length +
          groupMembersData.length +
          topicsData.length +
          projectsData.length +
          assessmentsData.length +
          milestonesData.length +
          notificationsData.length
        )
      }
    };

    return {
      metadata,
      users: usersData,
      studentGroups: groupsData,
      studentGroupMembers: groupMembersData,
      projectTopics: topicsData,
      studentProjects: projectsData,
      projectAssessments: assessmentsData,
      projectMilestones: milestonesData,
      notifications: notificationsData,
      timestamp
    };
  }

  generateSqlDump(data: any): string {
    const escapeSql = (val: any): string => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      if (typeof val === 'number') return String(val);
      if (val instanceof Date) return `'${val.toISOString()}'`;
      if (typeof val === 'object') {
        const jsonStr = JSON.stringify(val).replace(/'/g, "''");
        return `'${jsonStr}'::jsonb`;
      }
      return `'${String(val).replace(/'/g, "''")}'`;
    };

    const generateTableInserts = (tableName: string, rows: any[]): string => {
      if (!Array.isArray(rows) || rows.length === 0) {
        return `-- Table: "${tableName}" (0 records)\n`;
      }
      const columns = Object.keys(rows[0]);
      const quotedCols = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ');
      const statements: string[] = [`-- Table: "${tableName}" (${rows.length} records)`];
      for (const row of rows) {
        const values = columns.map(col => escapeSql(row[col])).join(', ');
        statements.push(`INSERT INTO "${tableName}" (${quotedCols}) VALUES (${values}) ON CONFLICT DO NOTHING;`);
      }
      return statements.join('\n') + '\n';
    };

    const header = [
      '--',
      '-- IU-APMP PostgreSQL Database Recovery Dump',
      '-- Portal: Integral University Academic Project Management Portal (IU-APMP)',
      `-- Generated at: ${data.timestamp || new Date().toISOString()}`,
      '--',
      'BEGIN;',
      'SET CONSTRAINTS ALL DEFERRED;\n'
    ].join('\n');

    const body = [
      generateTableInserts('student_groups', data.studentGroups || []),
      generateTableInserts('users', data.users || []),
      generateTableInserts('student_group_members', data.studentGroupMembers || []),
      generateTableInserts('project_topics', data.projectTopics || []),
      generateTableInserts('student_projects', data.studentProjects || []),
      generateTableInserts('project_assessments', data.projectAssessments || []),
      generateTableInserts('project_milestones', data.projectMilestones || []),
      generateTableInserts('notifications', data.notifications || [])
    ].join('\n');

    const sequences = [
      '-- Synchronize Sequence Counters',
      'SELECT setval(pg_get_serial_sequence(\'"users"\', \'id\'), COALESCE((SELECT MAX(id) FROM "users"), 0) + 1, false);',
      'SELECT setval(pg_get_serial_sequence(\'"student_groups"\', \'id\'), COALESCE((SELECT MAX(id) FROM "student_groups"), 0) + 1, false);',
      'SELECT setval(pg_get_serial_sequence(\'"student_group_members"\', \'id\'), COALESCE((SELECT MAX(id) FROM "student_group_members"), 0) + 1, false);',
      'SELECT setval(pg_get_serial_sequence(\'"project_topics"\', \'id\'), COALESCE((SELECT MAX(id) FROM "project_topics"), 0) + 1, false);',
      'SELECT setval(pg_get_serial_sequence(\'"student_projects"\', \'id\'), COALESCE((SELECT MAX(id) FROM "student_projects"), 0) + 1, false);',
      'SELECT setval(pg_get_serial_sequence(\'"project_assessments"\', \'id\'), COALESCE((SELECT MAX(id) FROM "project_assessments"), 0) + 1, false);',
      'SELECT setval(pg_get_serial_sequence(\'"project_milestones"\', \'id\'), COALESCE((SELECT MAX(id) FROM "project_milestones"), 0) + 1, false);',
      'SELECT setval(pg_get_serial_sequence(\'"notifications"\', \'id\'), COALESCE((SELECT MAX(id) FROM "notifications"), 0) + 1, false);',
      'COMMIT;\n'
    ].join('\n');

    return `${header}\n${body}\n${sequences}`;
  }

  async createFullBackupPackage(): Promise<{
    buffer: Buffer;
    filename: string;
    filePath: string;
    exportData: any;
  }> {
    const data = await this.exportData();
    const zip = new JSZip();

    // 1. Manifest
    zip.file("manifest.json", JSON.stringify(data.metadata, null, 2));

    // 2. Full consolidated dump for fast programmatic import
    zip.file("portal_full_backup.json", JSON.stringify(data, null, 2));

    // 3. Individual table files in tables/
    const tablesFolder = zip.folder("tables") || zip;
    tablesFolder.file("student_groups.json", JSON.stringify(data.studentGroups, null, 2));
    tablesFolder.file("users.json", JSON.stringify(data.users, null, 2));
    tablesFolder.file("student_group_members.json", JSON.stringify(data.studentGroupMembers, null, 2));
    tablesFolder.file("project_topics.json", JSON.stringify(data.projectTopics, null, 2));
    tablesFolder.file("student_projects.json", JSON.stringify(data.studentProjects, null, 2));
    tablesFolder.file("project_assessments.json", JSON.stringify(data.projectAssessments, null, 2));
    tablesFolder.file("project_milestones.json", JSON.stringify(data.projectMilestones, null, 2));
    tablesFolder.file("notifications.json", JSON.stringify(data.notifications, null, 2));

    // 4. SQL recovery script
    const sqlDump = this.generateSqlDump(data);
    zip.file("backup_recovery.sql", sqlDump);

    // Generate zip buffer
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    });

    // Save local copy to database/backups
    const backupsDir = path.join(process.cwd(), "database", "backups");
    await fs.mkdir(backupsDir, { recursive: true });

    const safeDate = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_");
    const filename = `IU-APMP_Backup_${safeDate}.zip`;
    const filePath = path.join(backupsDir, filename);

    await fs.writeFile(filePath, buffer);

    return {
      buffer,
      filename,
      filePath,
      exportData: data
    };
  }

  /**
   * Wipes all application data and restores the exact fresh-install state
   * (identical to `npm run db:setup`): empty tables, sequences restarted at 1,
   * sessions cleared, and the default admin (admin / Admin@123) recreated.
   *
   * TRUNCATE ... RESTART IDENTITY resets every serial sequence so new records
   * start from id=1, exactly like a fresh install. It also guarantees that a
   * subsequent backup Import cannot collide with stale high-water-mark IDs.
   */
  async resetDatabase(options?: { preserveSessions?: boolean }): Promise<boolean> {
    const preserveSessions = options?.preserveSessions === true;

    // Drop every live socket first: after IDs restart from 1, stale pre-reset
    // connections must not receive notifications addressed to recycled user IDs.
    disconnectAllClients();

    try {
      // TRUNCATE is transactional DDL in PostgreSQL — all-or-nothing.
      await db.transaction(async (tx) => {
        const dataTables = `"project_assessments", "project_milestones", "student_projects", "student_group_members", "student_groups", "project_topics", "notifications", "users"`;
        if (!preserveSessions) {
          await tx.execute(sql.raw(`TRUNCATE TABLE ${dataTables}, "session" RESTART IDENTITY CASCADE`));
        } else {
          await tx.execute(sql.raw(`TRUNCATE TABLE ${dataTables} RESTART IDENTITY CASCADE`));
        }
      });
    } catch (error) {
      console.error("Database truncate failed:", error);
      return false;
    }

    // Recreate the default admin through the canonical seeding path
    // (same one used by scripts/setup_db.ts on a fresh install).
    return this.initializeDefaultUser();
  }

  async createPreRestoreSnapshot(): Promise<string> {
    const data = await this.exportData();
    const backupsDir = path.join(process.cwd(), "database", "backups");
    await fs.mkdir(backupsDir, { recursive: true });

    const safeDate = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_");
    const filename = `pre_restore_snapshot_${safeDate}.json`;
    const filePath = path.join(backupsDir, filename);

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    return filePath;
  }

  async parseBackupPayload(data: any): Promise<any> {
    if (!data) throw new Error("No import data provided");

    if (Buffer.isBuffer(data)) {
      try {
        const isZip = data.length >= 2 && data[0] === 0x50 && data[1] === 0x4B;
        if (isZip) {
          const zip = await JSZip.loadAsync(data);

          // Find file in root or any subfolder
          const findZipFile = (name: string) => {
            const direct = zip.file(name);
            if (direct) return direct;
            const matches = zip.file(new RegExp(`(^|/)${name}$`, "i"));
            return matches && matches.length > 0 ? matches[0] : null;
          };

          const fullBackupFile = findZipFile("portal_full_backup.json");
          if (fullBackupFile) {
            const content = await fullBackupFile.async("string");
            return JSON.parse(content);
          }

          // Reconstruct from tables/ or root or nested
          const readTable = async (name: string) => {
            const f = findZipFile(`tables/${name}.json`) || findZipFile(`${name}.json`);
            if (f) {
              const text = await f.async("string");
              return JSON.parse(text);
            }
            return [];
          };

          return {
            studentGroups: await readTable("student_groups"),
            users: await readTable("users"),
            studentGroupMembers: await readTable("student_group_members"),
            projectTopics: await readTable("project_topics"),
            studentProjects: await readTable("student_projects"),
            projectAssessments: await readTable("project_assessments"),
            projectMilestones: await readTable("project_milestones"),
            notifications: await readTable("notifications"),
          };
        } else {
          const text = data.toString("utf-8");
          return JSON.parse(text);
        }
      } catch (err: any) {
        console.error("Failed to parse backup payload:", err);
        throw new Error(`Invalid or corrupted backup archive: ${err.message}`);
      }
    }

    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch (err: any) {
        throw new Error(`Invalid JSON import format: ${err.message}`);
      }
    }

    return data;
  }

  async importData(
    data: any,
    options?: {
      preserveSessions?: boolean;
      skipSnapshot?: boolean;
      onProgress?: (progress: { stage: string; percent: number; message: string; detail?: string }) => void;
    }
  ): Promise<boolean> {
    const preserveSessions = options?.preserveSessions !== false;
    const emit = (stage: string, percent: number, message: string, detail?: string) => {
      if (options?.onProgress) {
        try {
          options.onProgress({ stage, percent, message, detail });
        } catch (_) {}
      }
      console.log(`[Import ${percent}%] [${stage}] ${message}${detail ? ` - ${detail}` : ""}`);
    };

    // 1. Parse and validate input payload
    emit("parsing", 10, "Decompressing archive & validating manifest...", "Parsing backup file structure");
    const payload = await this.parseBackupPayload(data);

    if (!payload.users && !payload.studentGroups && !payload.projectTopics && !payload.studentProjects) {
      throw new Error("Invalid import payload: missing required database entities");
    }

    // 2. Automated Pre-Restore Safety Snapshot (ensures zero data loss)
    if (!options?.skipSnapshot) {
      emit("snapshot", 20, "Creating automated pre-restore safety snapshot...", "Backing up live database to database/backups");
      const snapshotFile = await this.createPreRestoreSnapshot();
      console.log(`✅ Pre-restore safety snapshot saved to: ${snapshotFile}`);
    }

    // Drop live WebSockets
    disconnectAllClients();

    const toDate = (v: any): Date | null => {
      if (!v) return null;
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
      if (typeof v === "string" || typeof v === "number") {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    };

    // 3. Execute atomic transaction
    try {
      emit("preparing", 30, "Preparing database transaction & deferred constraints...", "Resetting table state");
      await db.transaction(async (tx) => {
        // Step A: Truncate tables (preserving sessions if requested)
        const dataTables = `"project_assessments", "project_milestones", "student_projects", "student_group_members", "student_groups", "project_topics", "notifications", "users"`;
        if (!preserveSessions) {
          await tx.execute(sql.raw(`TRUNCATE TABLE ${dataTables}, "session" RESTART IDENTITY CASCADE`));
        } else {
          await tx.execute(sql.raw(`TRUNCATE TABLE ${dataTables} RESTART IDENTITY CASCADE`));
        }

        // Helper to insert in batches of 50 to prevent connection pool exhaustion and report progress
        const batchInsert = async (
          table: any,
          items: any[],
          tableName: string,
          startPct: number,
          endPct: number,
          batchSize = 50
        ) => {
          if (!Array.isArray(items) || items.length === 0) return;
          const totalBatches = Math.ceil(items.length / batchSize);
          for (let b = 0; b < totalBatches; b++) {
            const chunk = items.slice(b * batchSize, (b + 1) * batchSize);
            await tx.insert(table).values(chunk).onConflictDoNothing();
            const currentPct = Math.round(startPct + ((b + 1) / totalBatches) * (endPct - startPct));
            emit(
              "restoring",
              currentPct,
              `Restoring ${tableName}...`,
              `Processed ${Math.min((b + 1) * batchSize, items.length)} of ${items.length} records`
            );
          }
        };

        // Step B: Topological Dependency Order Insertion

        // 1. student_groups (Parent to user group references)
        const cleanGroups = (payload.studentGroups || []).map((group: any) => ({
          id: group.id,
          name: group.name,
          description: group.description ?? null,
          supervisorId: group.supervisorId ?? null,
          createdById: group.createdById ?? null,
          course: group.course ?? null,
          projectTeamId: group.projectTeamId ?? null,
          maxSize: group.maxSize ?? 5,
          createdAt: toDate(group.createdAt) || new Date(),
          updatedAt: toDate(group.updatedAt) || new Date(),
        }));
        await batchInsert(studentGroups, cleanGroups, "Student Project Teams", 35, 45);

        // 2. users (foreign key to student_groups.id is now guaranteed to exist!)
        const cleanUsers = (payload.users || []).map((user: any) => ({
          id: user.id,
          username: user.username,
          password: user.password,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          enrollmentNumber: user.enrollmentNumber ?? null,
          course: user.course ?? null,
          empId: user.empId ?? null,
          prefix: user.prefix ?? null,
          designation: user.designation ?? null,
          mobile: user.mobile ?? null,
          department: user.department ?? null,
          groupId: user.groupId ?? null,
          forcePasswordReset: Boolean(user.forcePasswordReset),
          isDeleted: Boolean(user.isDeleted),
          createdAt: toDate(user.createdAt) || new Date(),
          updatedAt: toDate(user.updatedAt) || new Date(),
        }));
        await batchInsert(users, cleanUsers, "User Accounts & Credentials", 45, 60);

        // 3. student_group_members (links users.id and student_groups.id)
        const cleanMembers = (payload.studentGroupMembers || []).map((member: any) => ({
          id: member.id,
          userId: member.userId,
          groupId: member.groupId,
          status: member.status || "accepted",
          createdAt: toDate(member.createdAt) || new Date(),
          updatedAt: toDate(member.updatedAt) || new Date(),
        }));
        await batchInsert(studentGroupMembers, cleanMembers, "Team Rosters & Memberships", 60, 70);

        // 4. project_topics (links submittedById -> users.id)
        const cleanTopics = (payload.projectTopics || []).map((topic: any) => ({
          id: topic.id,
          topicCode: topic.topicCode ?? null,
          title: topic.title,
          description: topic.description ?? null,
          submittedById: topic.submittedById,
          technology: topic.technology,
          projectType: topic.projectType,
          course: topic.course,
          estimatedComplexity: topic.estimatedComplexity || "Medium",
          status: topic.status || "pending",
          feedback: topic.feedback ?? null,
          isDeleted: Boolean(topic.isDeleted),
          createdAt: toDate(topic.createdAt) || new Date(),
          updatedAt: toDate(topic.updatedAt) || new Date(),
        }));
        await batchInsert(projectTopics, cleanTopics, "Project Topics Catalog", 70, 80);

        // 5. student_projects (links studentId -> users.id, topicId -> projectTopics.id)
        const cleanProjects = (payload.studentProjects || []).map((project: any) => ({
          id: project.id,
          studentId: project.studentId,
          topicId: project.topicId,
          progress: project.progress ?? 0,
          status: project.status || "in_progress",
          createdAt: toDate(project.createdAt) || new Date(),
          updatedAt: toDate(project.updatedAt) || new Date(),
        }));
        await batchInsert(studentProjects, cleanProjects, "Student Project Allocations", 80, 85);

        // 6. project_assessments (links projectId -> studentProjects.id, supervisorId -> users.id)
        const cleanAssessments = (payload.projectAssessments || []).map((assessment: any) => ({
          id: assessment.id,
          projectId: assessment.projectId,
          supervisorId: assessment.supervisorId,
          assessmentType: assessment.assessmentType,
          marks: assessment.marks,
          feedback: assessment.feedback ?? null,
          createdAt: toDate(assessment.createdAt) || new Date(),
          updatedAt: toDate(assessment.updatedAt) || new Date(),
        }));
        await batchInsert(projectAssessments, cleanAssessments, "Project Assessments & Marks", 85, 88);

        // 7. project_milestones (links projectId -> studentProjects.id)
        const cleanMilestones = (payload.projectMilestones || []).map((milestone: any) => ({
          id: milestone.id,
          projectId: milestone.projectId,
          title: milestone.title,
          description: milestone.description ?? null,
          dueDate: toDate(milestone.dueDate) || new Date(),
          completedAt: toDate(milestone.completedAt),
          isCompleted: Boolean(milestone.isCompleted),
          createdAt: toDate(milestone.createdAt) || new Date(),
          updatedAt: toDate(milestone.updatedAt) || new Date(),
        }));
        await batchInsert(projectMilestones, cleanMilestones, "Milestones & Deadlines", 88, 91);

        // 8. notifications (links userId -> users.id)
        const cleanNotifs = (payload.notifications || []).map((notif: any) => ({
          id: notif.id,
          userId: notif.userId,
          title: notif.title,
          message: notif.message,
          type: notif.type,
          isRead: Boolean(notif.isRead),
          metadata: notif.metadata ?? null,
          createdAt: toDate(notif.createdAt) || new Date(),
          updatedAt: toDate(notif.updatedAt) || new Date(),
        }));
        await batchInsert(notifications, cleanNotifs, "System Audit Notifications", 91, 94);

        // Step C: Sequence realign inside transaction
        emit("sequences", 96, "Synchronizing sequence counters...", "Aligning sequences past MAX(id)");
        await this.syncSequences(tx);
      });

      // Ensure default admin exists if user list lacked it
      await this.initializeDefaultUser();

      emit("complete", 100, "Database restored and synchronized successfully!", "All tables and sequences verified");
      console.log("🎉 Database restored and topological sync finished successfully.");
      return true;
    } catch (error: any) {
      console.error("❌ Database import transaction failed:", error);
      throw error;
    }
  }

  /**
   * Aligns each table's id sequence to MAX(id) + 1. Safe on empty tables.
   */
  async syncSequences(tx?: any): Promise<void> {
    const executor = tx || db;
    const tables = [
      "users",
      "student_groups",
      "student_group_members",
      "project_topics",
      "student_projects",
      "project_assessments",
      "project_milestones",
      "notifications"
    ];
    for (const table of tables) {
      try {
        await executor.execute(sql.raw(
          `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`
        ));
      } catch (err) {
        // Non-fatal: sequence helpers only exist for serial columns
        console.warn(`Sequence sync skipped for ${table}:`, err);
      }
    }
  }

  async generateExcelReport(): Promise<any[]> {
    const projects = await this.getAllProjects();

    const reportData = await Promise.all(projects.map(async (project) => {
      // Get assessments for this project
      const assessments = await this.getProjectAssessments(project.id);

      // Get group information
      let groupInfo = "Individual";
      if (project.student.groupId) {
        const group = await this.getGroup(project.student.groupId);
        const members = await this.getAcceptedGroupMembers(project.student.groupId);
        groupInfo = `${group?.name || 'N/A'} (${members.length} members)`;
      }

      // Calculate average marks
      const totalMarks = assessments.reduce((sum, a) => sum + (a.score || 0), 0);
      const avgMarks = assessments.length > 0 ? (totalMarks / assessments.length).toFixed(2) : 'N/A';

      // Get supervisor who assessed
      const supervisorNames = assessments.length > 0
        ? await Promise.all(assessments.map(async a => {
          if (!a.supervisorId) return 'Not Assigned';
          const supervisor = await this.getUser(a.supervisorId);
          return `${supervisor?.firstName} ${supervisor?.lastName}`;
        }))
        : ['Not Assigned'];

      return {
        'Student Name': `${project.student.firstName} ${project.student.lastName}`,
        'Enrollment Number': project.student.enrollmentNumber || 'N/A',
        'Email': project.student.email,
        'Group Details': groupInfo,
        'Project Title': project.topic.title,
        'Project Type': project.topic.projectType || 'N/A',
        'Technology': project.topic.technology,
        'Progress (%)': project.progress,
        'Status': project.status || 'In Progress',
        'Average Marks': avgMarks,
        'Supervisor Assigned': supervisorNames.join(', '),
        'Submission Status': project.progress >= 100 ? 'Completed' : project.progress >= 75 ? 'On Track' : 'At Risk',
      };
    }));

    return reportData;
  }

  async generateUniversityExcelReport(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Integral University Academic Project Management Portal (IU-APMP)";
    workbook.lastModifiedBy = "IU-APMP System";
    workbook.created = new Date();

    const headerFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" } // Deep navy blue
    };
    const headerFont: Partial<ExcelJS.Font> = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" }
    };
    const cellFont: Partial<ExcelJS.Font> = {
      name: "Calibri",
      size: 10
    };
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } }
    };

    const styleWorksheet = (sheet: ExcelJS.Worksheet) => {
      const headerRow = sheet.getRow(1);
      headerRow.height = 26;
      headerRow.eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.height = 20;
          row.eachCell((cell) => {
            cell.font = cellFont;
            cell.border = thinBorder;
            cell.alignment = { vertical: "middle" };
          });
        }
      });

      sheet.columns.forEach((column) => {
        let maxLen = 12;
        if (column.header) {
          maxLen = Math.max(maxLen, String(column.header).length);
        }
        column.eachCell?.({ includeEmpty: false }, (cell) => {
          const val = cell.value ? String(cell.value) : "";
          if (val.length > maxLen) {
            maxLen = Math.min(val.length, 65);
          }
        });
        column.width = Math.max(column.width || 0, maxLen + 4);
      });
    };

    // Query all database entities (strictly read-only)
    const allUsers = await db.select().from(users).where(eq(users.isDeleted, false));
    const allGroups = await db.select().from(studentGroups);
    const allMembers = await db.select().from(studentGroupMembers);
    const allTopics = await db.select().from(projectTopics).where(eq(projectTopics.isDeleted, false));
    const allProjects = await db.select().from(studentProjects);
    const allAssessments = await db.select().from(projectAssessments);
    const allMilestones = await db.select().from(projectMilestones);

    // Build lookup maps for fast association
    const userMap = new Map<number, typeof allUsers[0]>();
    allUsers.forEach(u => userMap.set(u.id, u));

    const groupMap = new Map<number, typeof allGroups[0]>();
    allGroups.forEach(g => groupMap.set(g.id, g));

    const topicMap = new Map<number, typeof allTopics[0]>();
    allTopics.forEach(t => topicMap.set(t.id, t));

    const membersByGroup = new Map<number, typeof allMembers>();
    allMembers.forEach(m => {
      const list = membersByGroup.get(m.groupId) || [];
      list.push(m);
      membersByGroup.set(m.groupId, list);
    });

    // Build reverse map from student user ID to group
    const studentGroupMap = new Map<number, typeof allGroups[0]>();
    allMembers.forEach(m => {
      if (groupMap.has(m.groupId)) {
        studentGroupMap.set(m.userId, groupMap.get(m.groupId)!);
      }
    });
    allUsers.forEach(u => {
      if (u.groupId && groupMap.has(u.groupId)) {
        studentGroupMap.set(u.id, groupMap.get(u.groupId)!);
      }
    });

    const students = allUsers.filter(u => u.role === UserRole.STUDENT);
    const supervisors = allUsers.filter(u => u.role === UserRole.SUPERVISOR || u.role === UserRole.COORDINATOR);

    // ==========================================
    // Sheet 1: Overview & Summary
    // ==========================================
    const ws1 = workbook.addWorksheet("Overview & Summary", { views: [{ showGridLines: true }] });
    ws1.columns = [
      { header: "Metric / Institutional Parameter", key: "param", width: 40 },
      { header: "Value / Statistic", key: "val", width: 35 },
      { header: "Notes / Description", key: "notes", width: 45 }
    ];

    const bcaStudents = students.filter(s => (s.course || "").toUpperCase() === "BCA").length;
    const mcaStudents = students.filter(s => (s.course || "").toUpperCase() === "MCA").length;
    const approvedTopics = allTopics.filter(t => t.status === "approved").length;
    const pendingTopics = allTopics.filter(t => t.status === "pending").length;
    const completedProjects = allProjects.filter(p => p.progress >= 100).length;
    const completedMilestones = allMilestones.filter(m => m.status === "completed").length;
    const totalMarks = allAssessments.reduce((acc, a) => acc + (a.score || 0), 0);
    const avgScore = allAssessments.length > 0 ? (totalMarks / allAssessments.length).toFixed(2) : "N/A";

    ws1.addRows([
      { param: "Portal Name", val: "IU-APMP", notes: "Integral University Academic Project Management Portal" },
      { param: "Department", val: "Department of Computer Application", notes: "Faculty of Computer Science & Applications" },
      { param: "Institution", val: "Integral University, Lucknow", notes: "Official Academic Year 2026-27" },
      { param: "Report Generation Timestamp", val: new Date().toISOString(), notes: "Generated via Administrator Console" },
      { param: "Total Registered Students", val: students.length, notes: `BCA: ${bcaStudents} | MCA: ${mcaStudents}` },
      { param: "Total Registered Faculty Supervisors", val: supervisors.length, notes: "Mentors & Project Coordinators" },
      { param: "Total Student Project Teams", val: allGroups.length, notes: "Formed cohorts across BCA & MCA" },
      { param: "Total Project Topics Proposed", val: allTopics.length, notes: `Approved: ${approvedTopics} | Pending: ${pendingTopics}` },
      { param: "Total Allocated Student Projects", val: allProjects.length, notes: `Completed: ${completedProjects} | In Progress: ${allProjects.length - completedProjects}` },
      { param: "Total Faculty Assessments Recorded", val: allAssessments.length, notes: `Average Score: ${avgScore}` },
      { param: "Total Project Milestones Defined", val: allMilestones.length, notes: `Completed: ${completedMilestones} | Pending: ${allMilestones.length - completedMilestones}` }
    ]);
    styleWorksheet(ws1);

    // ==========================================
    // Sheet 2: Student Details
    // ==========================================
    const ws2 = workbook.addWorksheet("Student Details", { views: [{ showGridLines: true }] });
    ws2.columns = [
      { header: "SNo.", key: "sno", width: 8 },
      { header: "TeamID", key: "teamId", width: 14 },
      { header: "Enrollment", key: "enrollment", width: 18 },
      { header: "Student Name", key: "studentName", width: 25 },
      { header: "Mobile No.", key: "mobile", width: 16 },
      { header: "Email Id", key: "email", width: 28 },
      { header: "Project", key: "project", width: 38 },
      { header: "Allotment", key: "allotment", width: 42 }
    ];

    const projectByStudent = new Map<number, typeof allProjects[0]>();
    allProjects.forEach(p => projectByStudent.set(p.studentId, p));

    // Group students by team
    const groupStudentsMap = new Map<number, typeof students>();
    const ungroupedStudents: typeof students = [];

    // Map member sequence for stable intra-team ordering matching registration/group creation
    const memberSequenceMap = new Map<number, number>();
    allMembers.forEach((m, idx) => {
      memberSequenceMap.set(m.userId, idx);
    });

    students.forEach((student) => {
      const group = studentGroupMap.get(student.id);
      if (group) {
        const list = groupStudentsMap.get(group.id) || [];
        list.push(student);
        groupStudentsMap.set(group.id, list);
      } else {
        ungroupedStudents.push(student);
      }
    });

    // Sort members within each group (creator/leader first, then by membership sequence, then enrollment)
    groupStudentsMap.forEach((members, groupId) => {
      const group = groupMap.get(groupId);
      members.sort((a, b) => {
        if (group?.createdById === a.id) return -1;
        if (group?.createdById === b.id) return 1;
        const seqA = memberSequenceMap.get(a.id) ?? 999999;
        const seqB = memberSequenceMap.get(b.id) ?? 999999;
        if (seqA !== seqB) return seqA - seqB;
        return (a.enrollmentNumber || "").localeCompare(b.enrollmentNumber || "");
      });
    });

    // Collect and naturally sort groups by TeamID (A-01, A-02, ..., B-01, etc.)
    const sortedGroups = Array.from(allGroups)
      .filter(g => (groupStudentsMap.get(g.id) || []).length > 0)
      .sort((a, b) => {
        const teamA = (a.projectTeamId || a.name || `GRP-${a.id}`).trim();
        const teamB = (b.projectTeamId || b.name || `GRP-${b.id}`).trim();
        return teamA.localeCompare(teamB, undefined, { numeric: true, sensitivity: "base" });
      });

    // Ungrouped students sorted by enrollment
    ungroupedStudents.sort((a, b) => (a.enrollmentNumber || "").localeCompare(b.enrollmentNumber || ""));

    let serialCounter = 1;

    const renderCohort = (
      teamIdDisplay: string,
      cohortMembers: typeof students,
      projectDisplay: string,
      allotmentDisplay: string
    ) => {
      if (cohortMembers.length === 0) return;

      const startRow = ws2.rowCount + 1;
      const cohortSize = cohortMembers.length;

      cohortMembers.forEach((student, idx) => {
        ws2.addRow({
          sno: serialCounter++,
          teamId: idx === 0 ? teamIdDisplay : "",
          enrollment: student.enrollmentNumber || "N/A",
          studentName: `${student.firstName || ''} ${student.lastName || ''}`.replace(/\s+/g, ' ').trim(),
          mobile: student.mobile || "N/A",
          email: student.email || "N/A",
          project: idx === 0 ? projectDisplay : "",
          allotment: idx === 0 ? allotmentDisplay : ""
        });
      });

      const endRow = startRow + cohortSize - 1;

      // Apply borders, row heights, and alignments to each cell in the cohort
      for (let r = startRow; r <= endRow; r++) {
        const row = ws2.getRow(r);
        row.height = 22;
        for (let c = 1; c <= 8; c++) {
          const cell = row.getCell(c);
          cell.font = cellFont;
          cell.border = thinBorder;
          cell.alignment = { vertical: "middle" };
        }
        row.getCell(1).alignment = { vertical: "middle", horizontal: "center" }; // SNo
        row.getCell(3).alignment = { vertical: "middle", horizontal: "center" }; // Enrollment
        row.getCell(4).alignment = { vertical: "middle", horizontal: "left" };   // Student Name
        row.getCell(5).alignment = { vertical: "middle", horizontal: "center" }; // Mobile
        row.getCell(6).alignment = { vertical: "middle", horizontal: "left" };   // Email
      }

      // If team has multiple members, merge TeamID, Project, and Allotment vertically
      if (cohortSize > 1) {
        ws2.mergeCells(startRow, 2, endRow, 2);
        ws2.mergeCells(startRow, 7, endRow, 7);
        ws2.mergeCells(startRow, 8, endRow, 8);
      }

      // Style merged / primary team cells
      const teamCell = ws2.getCell(startRow, 2);
      teamCell.font = { ...cellFont, bold: true };
      teamCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

      const projCell = ws2.getCell(startRow, 7);
      projCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

      const allotCell = ws2.getCell(startRow, 8);
      allotCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    };

    sortedGroups.forEach((group) => {
      const cohortMembers = groupStudentsMap.get(group.id) || [];
      if (cohortMembers.length === 0) return;

      const teamIdDisplay = group.projectTeamId || group.name || `GRP-${group.id}`;

      // Resolve topic for the group
      let topic: typeof allTopics[0] | undefined;
      for (const m of cohortMembers) {
        const p = projectByStudent.get(m.id);
        if (p && topicMap.has(p.topicId)) {
          topic = topicMap.get(p.topicId);
          break;
        }
      }

      let projectDisplay = "Not Assigned";
      if (topic) {
        const pCode = topic.topicCode || `PUGID${topic.id}`;
        projectDisplay = `${pCode} - ${topic.title}`;
      }

      // Resolve supervisor (from group mentor assignment or topic author)
      const supervisor = group.supervisorId
        ? userMap.get(group.supervisorId)
        : (topic?.submittedById ? userMap.get(topic.submittedById) : undefined);

      let allotmentDisplay = "Not Assigned";
      if (supervisor) {
        const supName = `${supervisor.prefix ? supervisor.prefix + ' ' : ''}${supervisor.firstName || ''} ${supervisor.lastName || ''}`.replace(/\s+/g, ' ').trim();
        const supDesig = supervisor.designation || "Faculty";
        const supMob = supervisor.mobile || "N/A";
        const supEmail = supervisor.email || "N/A";
        allotmentDisplay = `${supName}\n${supDesig}\n${supMob} / ${supEmail}`;
      }

      renderCohort(teamIdDisplay, cohortMembers, projectDisplay, allotmentDisplay);
    });

    // Add ungrouped/individual students at the end
    ungroupedStudents.forEach((student) => {
      const p = projectByStudent.get(student.id);
      const topic = p ? topicMap.get(p.topicId) : undefined;
      const supervisor = topic?.submittedById ? userMap.get(topic.submittedById) : undefined;

      let projectDisplay = "Not Assigned";
      if (topic) {
        const pCode = topic.topicCode || `PUGID${topic.id}`;
        projectDisplay = `${pCode} - ${topic.title}`;
      }

      let allotmentDisplay = "Not Assigned";
      if (supervisor) {
        const supName = `${supervisor.prefix ? supervisor.prefix + ' ' : ''}${supervisor.firstName || ''} ${supervisor.lastName || ''}`.replace(/\s+/g, ' ').trim();
        const supDesig = supervisor.designation || "Faculty";
        const supMob = supervisor.mobile || "N/A";
        const supEmail = supervisor.email || "N/A";
        allotmentDisplay = `${supName}\n${supDesig}\n${supMob} / ${supEmail}`;
      }

      renderCohort("Individual", [student], projectDisplay, allotmentDisplay);
    });

    // Style worksheet header row and columns
    const ws2HeaderRow = ws2.getRow(1);
    ws2HeaderRow.height = 26;
    ws2HeaderRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    ws2.columns.forEach((column) => {
      let maxLen = 10;
      if (column.header) {
        maxLen = Math.max(maxLen, String(column.header).length);
      }
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const val = cell.value ? String(cell.value) : "";
        const lines = val.split("\n");
        lines.forEach(line => {
          if (line.length > maxLen) {
            maxLen = Math.min(line.length, 50);
          }
        });
      });
      column.width = Math.max(column.width || 0, maxLen + 4);
    });

    // ==========================================
    // Sheet 3: Faculty Supervisors
    // ==========================================
    const ws3 = workbook.addWorksheet("Faculty Supervisors", { views: [{ showGridLines: true }] });
    ws3.columns = [
      { header: "S.No", key: "sno", width: 8 },
      { header: "Emp ID", key: "empId", width: 14 },
      { header: "Faculty Name", key: "name", width: 25 },
      { header: "Designation", key: "designation", width: 22 },
      { header: "Department", key: "department", width: 25 },
      { header: "Email Address", key: "email", width: 28 },
      { header: "Mobile Number", key: "mobile", width: 16 },
      { header: "Topics Proposed", key: "topicsProposed", width: 16 },
      { header: "Approved Topics", key: "approvedTopics", width: 16 },
      { header: "Mentored Teams", key: "mentoredTeams", width: 16 },
      { header: "Mentorship Load", key: "load", width: 18 }
    ];

    const sortedSupervisors = [...supervisors].sort((a, b) => {
      const idA = (a.empId || "").trim();
      const idB = (b.empId || "").trim();
      if (!idA && !idB) return a.id - b.id;
      if (!idA) return 1;
      if (!idB) return -1;
      return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: "base" });
    });

    sortedSupervisors.forEach((sup, idx) => {
      const supTopics = allTopics.filter(t => t.submittedById === sup.id);
      const supApproved = supTopics.filter(t => t.status === "approved").length;
      const mentored = allGroups.filter(g => g.supervisorId === sup.id).length;

      ws3.addRow({
        sno: idx + 1,
        empId: sup.empId || "N/A",
        name: `${sup.prefix || ''} ${sup.firstName} ${sup.lastName}`.trim(),
        designation: sup.designation || "Faculty",
        department: sup.department || "Computer Application",
        email: sup.email,
        mobile: sup.mobile || "N/A",
        topicsProposed: supTopics.length,
        approvedTopics: supApproved,
        mentoredTeams: mentored,
        load: `${mentored}/5`
      });
    });
    styleWorksheet(ws3);

    // ==========================================
    // Sheet 4: Project Teams
    // ==========================================
    const ws4 = workbook.addWorksheet("Project Teams", { views: [{ showGridLines: true }] });
    ws4.columns = [
      { header: "S.No", key: "sno", width: 8 },
      { header: "Team ID", key: "teamId", width: 16 },
      { header: "Team Name", key: "name", width: 25 },
      { header: "Course", key: "course", width: 10 },
      { header: "Size", key: "size", width: 10 },
      { header: "Assigned Supervisor", key: "supervisor", width: 25 },
      { header: "Assigned Topic Code", key: "topicCode", width: 18 },
      { header: "Assigned Topic Title", key: "topicTitle", width: 35 },
      { header: "Team Roster (Members & Enrollments)", key: "roster", width: 50 }
    ];

    allGroups.forEach((group, idx) => {
      const gMembers = membersByGroup.get(group.id) || [];
      const rosterStrings = gMembers.map(m => {
        const u = userMap.get(m.userId);
        return u ? `${u.firstName} ${u.lastName} (${u.enrollmentNumber || 'No Enroll'})` : `User#${m.userId}`;
      });

      let teamTopicCode = "N/A";
      let teamTopicTitle = "Not Assigned";
      for (const m of gMembers) {
        const p = projectByStudent.get(m.userId);
        if (p && topicMap.has(p.topicId)) {
          const t = topicMap.get(p.topicId)!;
          teamTopicCode = t.topicCode || "N/A";
          teamTopicTitle = t.title;
          break;
        }
      }

      const supervisor = group.supervisorId ? userMap.get(group.supervisorId) : undefined;
      const supervisorName = supervisor ? `${supervisor.prefix || ''} ${supervisor.firstName} ${supervisor.lastName}`.trim() : "Not Assigned";

      ws4.addRow({
        sno: idx + 1,
        teamId: group.projectTeamId || `GRP-${group.id}`,
        name: group.name,
        course: (group.course || "N/A").toUpperCase(),
        size: gMembers.length,
        supervisor: supervisorName,
        topicCode: teamTopicCode,
        topicTitle: teamTopicTitle,
        roster: rosterStrings.join("; ") || "No members"
      });
    });
    styleWorksheet(ws4);

    // ==========================================
    // Sheet 5: Project Topics Catalog
    // ==========================================
    const ws5 = workbook.addWorksheet("Project Topics Catalog", { views: [{ showGridLines: true }] });
    ws5.columns = [
      { header: "S.No", key: "sno", width: 8 },
      { header: "Topic Code", key: "code", width: 16 },
      { header: "Topic Title", key: "title", width: 35 },
      { header: "Course", key: "course", width: 10 },
      { header: "Project Type", key: "type", width: 16 },
      { header: "Technology Stack", key: "tech", width: 30 },
      { header: "Complexity", key: "complexity", width: 14 },
      { header: "Proposing Supervisor", key: "supervisor", width: 25 },
      { header: "Approval Status", key: "status", width: 16 },
      { header: "Description", key: "desc", width: 50 }
    ];

    allTopics.forEach((topic, idx) => {
      const supervisor = userMap.get(topic.submittedById);
      const supervisorName = supervisor ? `${supervisor.prefix || ''} ${supervisor.firstName} ${supervisor.lastName}`.trim() : "Unknown";

      ws5.addRow({
        sno: idx + 1,
        code: topic.topicCode || `PUGID${topic.id}`,
        title: topic.title,
        course: (topic.course || "N/A").toUpperCase(),
        type: topic.projectType || "N/A",
        tech: topic.technology || "N/A",
        complexity: topic.estimatedComplexity || "Medium",
        supervisor: supervisorName,
        status: (topic.status || "pending").toUpperCase(),
        desc: topic.description || "N/A"
      });
    });
    styleWorksheet(ws5);

    // ==========================================
    // Sheet 6: Student Projects & Progress
    // ==========================================
    const ws6 = workbook.addWorksheet("Student Projects & Progress", { views: [{ showGridLines: true }] });
    ws6.columns = [
      { header: "S.No", key: "sno", width: 8 },
      { header: "Project ID", key: "id", width: 12 },
      { header: "Student Name", key: "studentName", width: 25 },
      { header: "Enrollment Number", key: "enrollment", width: 18 },
      { header: "Course", key: "course", width: 10 },
      { header: "Topic Code", key: "topicCode", width: 16 },
      { header: "Topic Title", key: "topicTitle", width: 35 },
      { header: "Supervisor", key: "supervisor", width: 25 },
      { header: "Progress (%)", key: "progress", width: 14 },
      { header: "Status", key: "status", width: 16 },
      { header: "Allocation Date", key: "date", width: 18 }
    ];

    allProjects.forEach((proj, idx) => {
      const student = userMap.get(proj.studentId);
      const topic = topicMap.get(proj.topicId);
      const supervisor = topic ? userMap.get(topic.submittedById) : undefined;

      ws6.addRow({
        sno: idx + 1,
        id: proj.id,
        studentName: student ? `${student.firstName} ${student.lastName}`.trim() : "Unknown",
        enrollment: student?.enrollmentNumber || "N/A",
        course: (student?.course || "N/A").toUpperCase(),
        topicCode: topic?.topicCode || "N/A",
        topicTitle: topic?.title || "N/A",
        supervisor: supervisor ? `${supervisor.prefix || ''} ${supervisor.firstName} ${supervisor.lastName}`.trim() : "N/A",
        progress: `${proj.progress}%`,
        status: proj.status || "In Progress",
        date: proj.createdAt ? new Date(proj.createdAt).toLocaleDateString() : "N/A"
      });
    });
    styleWorksheet(ws6);

    // ==========================================
    // Sheet 7: Evaluations & Assessments
    // ==========================================
    const ws7 = workbook.addWorksheet("Evaluations & Assessments", { views: [{ showGridLines: true }] });
    ws7.columns = [
      { header: "S.No", key: "sno", width: 8 },
      { header: "Assessment ID", key: "id", width: 14 },
      { header: "Student Name", key: "studentName", width: 25 },
      { header: "Enrollment Number", key: "enrollment", width: 18 },
      { header: "Course", key: "course", width: 10 },
      { header: "Project Topic", key: "topic", width: 35 },
      { header: "Evaluating Faculty", key: "supervisor", width: 25 },
      { header: "Score / Marks", key: "score", width: 16 },
      { header: "Feedback / Remarks", key: "feedback", width: 45 },
      { header: "Date Assessed", key: "date", width: 18 }
    ];

    allAssessments.forEach((ass, idx) => {
      const proj = allProjects.find(p => p.id === ass.projectId);
      const student = proj ? userMap.get(proj.studentId) : undefined;
      const topic = proj ? topicMap.get(proj.topicId) : undefined;
      const supervisor = ass.supervisorId ? userMap.get(ass.supervisorId) : undefined;

      ws7.addRow({
        sno: idx + 1,
        id: ass.id,
        studentName: student ? `${student.firstName} ${student.lastName}`.trim() : "N/A",
        enrollment: student?.enrollmentNumber || "N/A",
        course: (student?.course || "N/A").toUpperCase(),
        topic: topic?.title || "N/A",
        supervisor: supervisor ? `${supervisor.prefix || ''} ${supervisor.firstName} ${supervisor.lastName}`.trim() : "N/A",
        score: ass.score,
        feedback: ass.feedback || "No remarks recorded",
        date: ass.createdAt ? new Date(ass.createdAt).toLocaleDateString() : "N/A"
      });
    });
    styleWorksheet(ws7);

    // ==========================================
    // Sheet 8: Milestones & Deadlines
    // ==========================================
    const ws8 = workbook.addWorksheet("Milestones & Deadlines", { views: [{ showGridLines: true }] });
    ws8.columns = [
      { header: "S.No", key: "sno", width: 8 },
      { header: "Milestone ID", key: "id", width: 14 },
      { header: "Milestone Title", key: "title", width: 30 },
      { header: "Project Topic", key: "topic", width: 35 },
      { header: "Student Name", key: "studentName", width: 25 },
      { header: "Due Date", key: "dueDate", width: 16 },
      { header: "Status", key: "status", width: 16 },
      { header: "Completed Date", key: "completedDate", width: 18 },
      { header: "Description / Objectives", key: "desc", width: 45 }
    ];

    allMilestones.forEach((mile, idx) => {
      const proj = allProjects.find(p => p.id === mile.projectId);
      const student = proj ? userMap.get(proj.studentId) : undefined;
      const topic = proj ? topicMap.get(proj.topicId) : undefined;

      ws8.addRow({
        sno: idx + 1,
        id: mile.id,
        title: mile.title,
        topic: topic?.title || "N/A",
        studentName: student ? `${student.firstName} ${student.lastName}`.trim() : "N/A",
        dueDate: mile.dueDate ? new Date(mile.dueDate).toLocaleDateString() : "N/A",
        status: (mile.status || "pending").toUpperCase(),
        completedDate: mile.completedAt ? new Date(mile.completedAt).toLocaleDateString() : "Pending",
        desc: mile.description || "N/A"
      });
    });
    styleWorksheet(ws8);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // --- Paginated Methods ---

  async getPaginatedUsers(page: number, limit: number, course?: string): Promise<import('@shared/schema').PaginatedResponse<User & { projectStatus?: string | null; topicCode?: string | null; topicTitle?: string | null; topicsCount?: number }>> {
    const conditions = [eq(users.isDeleted, false)];
    if (course) {
      const normalizedCourse = course.trim().toUpperCase();
      conditions.push(or(
        eq(sql`UPPER(${users.course})`, normalizedCourse),
        eq(users.role, UserRole.ADMIN),
        eq(users.role, UserRole.SUPERVISOR),
        eq(users.role, UserRole.COORDINATOR)
      )!);
    }
    
    const countQuery = await db.select({ count: sql<number>`count(*)` }).from(users).where(and(...conditions));
    const total = Number(countQuery[0].count);
    
    const rawData = await db.select().from(users).where(and(...conditions)).orderBy(asc(users.id)).limit(limit).offset((page - 1) * limit) as User[];
    const data = await this.enrichUsersWithProjectAndTopicStatus(rawData);
    
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPaginatedTopics(page: number, limit: number, course?: string): Promise<import('@shared/schema').PaginatedResponse<ProjectTopic>> {
    const conditions = [eq(projectTopics.isDeleted, false)];
    if (course) conditions.push(eq(projectTopics.course, course));
    
    const countQuery = await db.select({ count: sql<number>`count(*)` }).from(projectTopics).where(and(...conditions));
    const total = Number(countQuery[0].count);
    
    const data = await db.select().from(projectTopics).where(and(...conditions)).limit(limit).offset((page - 1) * limit) as ProjectTopic[];
    
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPaginatedApprovedTopics(page: number, limit: number, course?: string): Promise<import('@shared/schema').PaginatedResponse<ProjectTopic>> {
    const conditions = [eq(projectTopics.status, "approved"), eq(projectTopics.isDeleted, false)];
    if (course) conditions.push(eq(projectTopics.course, course));
    
    const countQuery = await db.select({ count: sql<number>`count(*)` }).from(projectTopics).where(and(...conditions));
    const total = Number(countQuery[0].count);
    
    const rows = await db.select({
      topic: projectTopics,
      submitter: users,
    })
    .from(projectTopics)
    .innerJoin(users, eq(projectTopics.submittedById, users.id))
    .where(and(...conditions))
    .limit(limit).offset((page - 1) * limit);

    const allottedTopicIds = (await db.select({ topicId: studentProjects.topicId }).from(studentProjects)).map(p => p.topicId);

    const data = rows.map(r => ({
      ...r.topic,
      submittedBy: r.submitter as any,
      isAllotted: allottedTopicIds.includes(r.topic.id)
    } as any as ProjectTopic));
    
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPaginatedProjects(page: number, limit: number, course?: string): Promise<import('@shared/schema').PaginatedResponse<StudentProject & { topic: ProjectTopic; student: User; supervisor?: User }>> {
    const countQuery = await db.select({ count: sql<number>`count(*)` })
      .from(studentProjects)
      .innerJoin(projectTopics, eq(studentProjects.topicId, projectTopics.id))
      .where(course ? eq(projectTopics.course, course) : undefined);
      
    const total = Number(countQuery[0].count);

    const rows = await db.select({
      project: studentProjects,
      topic: projectTopics,
      student: users
    })
    .from(studentProjects)
    .innerJoin(projectTopics, eq(studentProjects.topicId, projectTopics.id))
    .innerJoin(users, eq(studentProjects.studentId, users.id))
    .where(course ? eq(projectTopics.course, course) : undefined)
    .limit(limit).offset((page - 1) * limit);

    const submitterIds = Array.from(new Set(rows.map(r => r.topic.submittedById).filter(id => id != null) as number[]));

    const studentUserIds = rows.map(r => r.student.id);
    let groupSupervisorMap = new Map<number, number | null>();
    if (studentUserIds.length > 0) {
      const memberships = await db.select({
        studentId: studentGroupMembers.userId,
        supervisorId: studentGroups.supervisorId
      })
      .from(studentGroupMembers)
      .innerJoin(studentGroups, eq(studentGroupMembers.groupId, studentGroups.id))
      .where(and(
        inArray(studentGroupMembers.userId, studentUserIds),
        eq(studentGroupMembers.status, "accepted")
      ));
      memberships.forEach(m => groupSupervisorMap.set(m.studentId, m.supervisorId));
    }

    const groupSupervisorIds = Array.from(new Set(Array.from(groupSupervisorMap.values()).filter(id => id != null) as number[]));
    const allFacultyIds = Array.from(new Set([...submitterIds, ...groupSupervisorIds]));

    let allFaculty: User[] = [];
    if (allFacultyIds.length > 0) {
      allFaculty = await db.select().from(users).where(inArray(users.id, allFacultyIds));
    }
    const facultyMap = new Map(allFaculty.map(s => [s.id, s]));

    const data = rows.map(r => {
      const groupSupId = groupSupervisorMap.get(r.student.id);
      const supervisor = (groupSupId ? facultyMap.get(groupSupId) : undefined) ||
                         (r.topic.submittedById ? facultyMap.get(r.topic.submittedById) : undefined);
      return {
        ...(r.project as StudentProject),
        student: r.student as User,
        supervisor,
        topic: {
          ...(r.topic as ProjectTopic),
          submittedBy: r.topic.submittedById ? facultyMap.get(r.topic.submittedById) : undefined
        }
      };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Method to update the force password reset flag
  // Required to remove the first-login security block once the student changes their password
  async setUserForcePasswordReset(userId: number, forceReset: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ forcePasswordReset: forceReset, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated as User | undefined;
  }

  // Bulk provisioning of student accounts and automated formation of project teams
  // Guarantees strict course data isolation and enforces first-login mandatory password change
  // Supports real-time progress callbacks for streaming telemetry to the frontend
  async bulkOnboardStudentsAndTeams(
    studentRows: IStudentOnboardingRow[],
    course: "BCA" | "MCA",
    creatorId: number,
    onProgress?: (progress: IOnboardingProgress) => void
  ): Promise<IOnboardingResult> {
    const result: IOnboardingResult = {
      success: true,
      message: "",
      course,
      totalSheetsParsed: 0,
      totalStudentsProcessed: 0,
      totalTeamsCreated: 0,
      sheetNames: [],
      teams: [],
      errors: [],
    };

    if (studentRows.length === 0) {
      result.message = "No valid student rows were found in the uploaded workbook.";
      onProgress?.({
        stage: "error",
        percent: 100,
        message: result.message,
      });
      return result;
    }

    // Step 1: Identify unique worksheet names processed
    const sheetsSet = new Set<string>();
    studentRows.forEach(row => {
      if (row.sheetName) sheetsSet.add(row.sheetName);
    });
    result.sheetNames = Array.from(sheetsSet);
    result.totalSheetsParsed = result.sheetNames.length;

    onProgress?.({
      stage: "parsing",
      percent: 20,
      message: `Extracted ${studentRows.length} student records from ${result.totalSheetsParsed} worksheets.`,
      current: 0,
      total: studentRows.length,
      detail: `Sheets: ${result.sheetNames.join(", ")}`
    });

    // Step 2: Preload existing users to optimize lookup time from O(N) database calls to O(1) in-memory
    const existingUsersList = await db.select().from(users);
    const existingByEnrollment = new Map<string, User>();
    const existingByUsername = new Map<string, User>();
    const existingEmails = new Set<string>();

    for (const u of existingUsersList) {
      if (u.enrollmentNumber) existingByEnrollment.set(u.enrollmentNumber.trim(), u as User);
      if (u.username) existingByUsername.set(u.username.trim(), u as User);
      if (u.email) existingEmails.add(u.email.trim().toLowerCase());
    }

    // Process students in concurrent batches of 15 for optimal performance and steady progress updates
    interface IProvisionedEntry {
      student: User;
      teamId: string;
      enrollmentNumber: string;
    }
    const provisionedEntries: IProvisionedEntry[] = [];
    const validRows = studentRows.filter(r => String(r.enrollmentNumber || "").trim().length > 0);
    const totalStudents = validRows.length;
    const BATCH_SIZE = 15;
    let processedSoFar = 0;

    for (let i = 0; i < totalStudents; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (row) => {
        const cleanEnrollment = String(row.enrollmentNumber).trim();

        const rawName = (row.studentName || "").trim();
        const nameParts = rawName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || `Student`;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ".";

        let rawEmail = (row.emailId || "").trim().toLowerCase();

        try {
          const existingStudent = existingByEnrollment.get(cleanEnrollment) || existingByUsername.get(cleanEnrollment);

          let isSameStudent = false;
          if (existingStudent) {
            const existingFullName = `${existingStudent.firstName} ${existingStudent.lastName}`.trim().toLowerCase();
            const newFullName = rawName.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
            const existingTokens = existingFullName.replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);
            const newTokens = newFullName.split(/\s+/).filter(Boolean);

            const matchingTokens = newTokens.filter(t => 
              existingTokens.includes(t) || 
              (t === "mohd" && existingTokens.includes("mohammad")) || 
              (t === "mohammad" && existingTokens.includes("mohd")) ||
              (t === "md" && existingTokens.includes("mohd")) ||
              (t === "md" && existingTokens.includes("mohammad"))
            );

            isSameStudent = matchingTokens.length >= 2 || 
              (newTokens.length === 1 && matchingTokens.length === 1 && existingTokens.length === 1) ||
              (existingTokens.length === 0 && rawName.length === 0);
          }

          if (existingStudent && isSameStudent) {
            let finalEmail = existingStudent.email;
            if (rawEmail && rawEmail.includes("@") && rawEmail !== existingStudent.email.toLowerCase()) {
              if (!existingEmails.has(rawEmail)) {
                finalEmail = rawEmail;
                existingEmails.add(rawEmail);
              }
            }

            let rawMob = row.mobileNo ? String(row.mobileNo).replace(/[^0-9]/g, "") : "";
            if (rawMob.length === 12 && rawMob.startsWith("91")) rawMob = rawMob.slice(2);
            if (rawMob.length === 11 && rawMob.startsWith("0")) rawMob = rawMob.slice(1);
            const cleanMobile = rawMob.length === 10 ? rawMob : (rawMob || null);

            const [updatedStudent] = await db.update(users)
              .set({
                course,
                firstName: firstName || existingStudent.firstName,
                lastName: lastName !== "." ? lastName : existingStudent.lastName,
                email: finalEmail,
                mobile: cleanMobile || existingStudent.mobile,
                updatedAt: new Date()
              })
              .where(eq(users.id, existingStudent.id))
              .returning();

            provisionedEntries.push({
              student: updatedStudent as User,
              teamId: (row.projectTeamId || "").trim(),
              enrollmentNumber: cleanEnrollment
            });
            existingByEnrollment.set(cleanEnrollment, updatedStudent as User);
          } else {
            // New student, or different student with identical enrollment number (Enrollment Conflict!)
            let newEmail = (rawEmail && rawEmail.includes("@") && !existingEmails.has(rawEmail))
              ? rawEmail
              : `${cleanEnrollment.toLowerCase()}@student.iul.ac.in`;

            if (existingEmails.has(newEmail)) {
              newEmail = `${cleanEnrollment.toLowerCase()}.${cleanEnrollment.slice(-4)}_${Math.floor(100 + Math.random() * 900)}@student.iul.ac.in`;
            }
            existingEmails.add(newEmail);

            let rawMob = row.mobileNo ? String(row.mobileNo).replace(/[^0-9]/g, "") : "";
            if (rawMob.length === 12 && rawMob.startsWith("91")) rawMob = rawMob.slice(2);
            if (rawMob.length === 11 && rawMob.startsWith("0")) rawMob = rawMob.slice(1);
            const cleanMobile = rawMob.length === 10 ? rawMob : (rawMob || null);

            const initialHashedPassword = await hashPassword(cleanEnrollment);

            // Generate unique username: if enrollment is already taken as a username, append unique suffix
            let uniqueUsername = cleanEnrollment;
            if (existingByUsername.has(cleanEnrollment)) {
              uniqueUsername = `${cleanEnrollment}_${Math.floor(1000 + Math.random() * 9000)}`;
            }

            const [newStudent] = await db.insert(users).values({
              username: uniqueUsername,
              password: initialHashedPassword,
              firstName,
              lastName,
              email: newEmail,
              role: UserRole.STUDENT,
              enrollmentNumber: cleanEnrollment,
              mobile: cleanMobile,
              course,
              forcePasswordReset: true,
              isDeleted: false,
            }).returning();

            existingByUsername.set(uniqueUsername, newStudent as User);
            if (!existingByEnrollment.has(cleanEnrollment)) {
              existingByEnrollment.set(cleanEnrollment, newStudent as User);
            }

            provisionedEntries.push({
              student: newStudent as User,
              teamId: (row.projectTeamId || "").trim(),
              enrollmentNumber: cleanEnrollment
            });
          }
        } catch (userErr: any) {
          result.errors?.push(`Error provisioning student ${cleanEnrollment}: ${userErr.message}`);
        }
      }));

      processedSoFar += batch.length;
      result.totalStudentsProcessed = provisionedEntries.length;

      onProgress?.({
        stage: "provisioning",
        percent: 20 + Math.round((processedSoFar / totalStudents) * 55),
        message: `Provisioning student credentials (${processedSoFar} of ${totalStudents})...`,
        current: processedSoFar,
        total: totalStudents,
        detail: `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${processedSoFar}/${totalStudents} students verified`
      });
    }

    // Step 3: Group students by their parsed ProjectTeam ID
    const teamGroupsMap = new Map<string, { studentId: number; enrollmentNumber: string }[]>();
    for (const entry of provisionedEntries) {
      if (!entry.teamId || !entry.student.id) continue;

      if (!teamGroupsMap.has(entry.teamId)) {
        teamGroupsMap.set(entry.teamId, []);
      }
      const list = teamGroupsMap.get(entry.teamId)!;
      if (!list.some(item => item.studentId === entry.student.id)) {
        list.push({ studentId: entry.student.id, enrollmentNumber: entry.enrollmentNumber });
      }
    }

    const maxGroupSize = course === "BCA" ? 5 : 2;
    const totalTeams = teamGroupsMap.size;
    let teamsCreatedCount = 0;

    // Preload existing student groups for this course
    const existingGroupsList = await db.select().from(studentGroups)
      .where(eq(studentGroups.course, course));
    const existingGroupsMap = new Map<string, StudentGroup>();
    for (const g of existingGroupsList) {
      if (g.projectTeamId) existingGroupsMap.set(g.projectTeamId.trim(), g as StudentGroup);
    }

    for (const [teamId, studentItems] of Array.from(teamGroupsMap.entries())) {
      try {
        const existingGroup = existingGroupsMap.get(teamId);
        let currentGroupId: number;

        if (existingGroup) {
          currentGroupId = existingGroup.id;
        } else {
          const [createdGroup] = await db.insert(studentGroups).values({
            name: `Project Team ${teamId}`,
            description: `Auto-provisioned project team for ${course} program (${teamId})`,
            course,
            projectTeamId: teamId,
            maxSize: maxGroupSize,
            createdById: creatorId,
          }).returning();

          currentGroupId = createdGroup.id;
          existingGroupsMap.set(teamId, createdGroup as StudentGroup);
          result.totalTeamsCreated++;
        }

        // Set each student's groupId in users table and ensure accepted membership
        for (const item of studentItems) {
          // Clean up any prior group memberships for this student to prevent multi-group conflicts
          await db.delete(studentGroupMembers).where(and(
            eq(studentGroupMembers.userId, item.studentId),
            ne(studentGroupMembers.groupId, currentGroupId)
          ));

          await db.update(users)
            .set({ groupId: currentGroupId, updatedAt: new Date() })
            .where(eq(users.id, item.studentId));

          const [existingMember] = await db.select().from(studentGroupMembers)
            .where(and(
              eq(studentGroupMembers.userId, item.studentId),
              eq(studentGroupMembers.groupId, currentGroupId)
            ));

          if (!existingMember) {
            await db.insert(studentGroupMembers).values({
              userId: item.studentId,
              groupId: currentGroupId,
              status: 'accepted'
            });
          } else if (existingMember.status !== 'accepted') {
            await db.update(studentGroupMembers)
              .set({ status: 'accepted', updatedAt: new Date() })
              .where(eq(studentGroupMembers.id, existingMember.id));
          }
        }

        const enrollmentNumbers = studentItems.map(s => s.enrollmentNumber);
        result.teams.push({
          teamId,
          studentCount: studentItems.length,
          enrollmentNumbers,
        });


        teamsCreatedCount++;
        if (teamsCreatedCount % 5 === 0 || teamsCreatedCount === totalTeams) {
          onProgress?.({
            stage: "teams",
            percent: 75 + Math.round((teamsCreatedCount / totalTeams) * 20),
            message: `Forming project teams (${teamsCreatedCount} of ${totalTeams})...`,
            current: teamsCreatedCount,
            total: totalTeams,
            detail: `Team ${teamId}: assigned ${enrollmentNumbers.length} student(s)`
          });
        }
      } catch (teamErr: any) {
        result.errors?.push(`Error creating team ${teamId}: ${teamErr.message}`);
      }
    }

    onProgress?.({
      stage: "finalizing",
      percent: 98,
      message: "Finalizing and preparing summary metrics...",
      current: totalTeams,
      total: totalTeams
    });

    result.message = `Bulk onboarding completed successfully. ${result.totalStudentsProcessed} students provisioned across ${result.teams.length} teams for ${course}.`;

    onProgress?.({
      stage: "completed",
      percent: 100,
      message: result.message,
      result
    });

    return result;
  }

  // Bulk provisioning and updating of supervisor faculty accounts
  // Username: EmpID (e.g. F00157)
  // Initial Password: EmpID (e.g. F00157), hashed with scrypt
  // Role: UserRole.SUPERVISOR
  // forcePasswordReset: true
  // Preserves designation, prefix, mobile, department, email
  async bulkOnboardSupervisors(
    supervisorRows: ISupervisorOnboardingRow[]
  ): Promise<ISupervisorOnboardingResult> {
    const result: ISupervisorOnboardingResult = {
      success: true,
      message: "",
      totalSupervisorsProcessed: 0,
      totalSupervisorsCreated: 0,
      totalSupervisorsUpdated: 0,
      supervisors: [],
      errors: [],
    };

    if (supervisorRows.length === 0) {
      result.message = "No valid supervisor records were found in the uploaded file.";
      return result;
    }

    // Preload existing users to perform fast O(1) in-memory lookups
    const existingUsersList = await db.select().from(users);
    const existingByEmpId = new Map<string, User>();
    const existingByUsername = new Map<string, User>();
    const existingByEmail = new Map<string, User>();

    for (const u of existingUsersList) {
      if (u.empId) existingByEmpId.set(u.empId.trim().toUpperCase(), u as User);
      if (u.username) existingByUsername.set(u.username.trim().toUpperCase(), u as User);
      if (u.email) existingByEmail.set(u.email.trim().toLowerCase(), u as User);
    }

    const BATCH_SIZE = 10;
    for (let i = 0; i < supervisorRows.length; i += BATCH_SIZE) {
      const batch = supervisorRows.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (row) => {
          const cleanEmpId = String(row.empId).trim();
          const cleanEmpIdUpper = cleanEmpId.toUpperCase();
          const rawName = (row.name || "").trim();
          const prefix = row.prefix || undefined;
          const firstName = row.firstName || rawName || "Supervisor";
          const lastName = row.lastName || "";
          const designation = (row.designation || "Supervisor").trim();
          const mobile = row.mobile ? String(row.mobile).trim() : undefined;
          const department = (row.department || "Department of Computer Application").trim();
          let email = (row.email || `${cleanEmpId.toLowerCase()}@iul.ac.in`).trim().toLowerCase();

          try {
            // Check if supervisor already exists by empId or username
            const existingSupervisor = existingByEmpId.get(cleanEmpIdUpper) || existingByUsername.get(cleanEmpIdUpper);

            if (existingSupervisor) {
              // Ensure email does not collide with another user
              const emailOwner = existingByEmail.get(email);
              if (emailOwner && emailOwner.id !== existingSupervisor.id) {
                email = `${cleanEmpId.toLowerCase()}@iul.ac.in`;
              }

              const [updated] = await db.update(users)
                .set({
                  empId: cleanEmpId,
                  prefix: prefix !== undefined ? prefix : existingSupervisor.prefix,
                  firstName: firstName || existingSupervisor.firstName,
                  lastName: lastName !== undefined ? lastName : existingSupervisor.lastName,
                  designation,
                  mobile: mobile !== undefined ? mobile : existingSupervisor.mobile,
                  department,
                  email,
                  role: UserRole.SUPERVISOR,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, existingSupervisor.id))
                .returning();

              result.totalSupervisorsUpdated++;
              result.totalSupervisorsProcessed++;
              result.supervisors.push({
                empId: cleanEmpId,
                name: `${prefix ? prefix + " " : ""}${firstName} ${lastName}`.trim(),
                designation,
                email,
                username: updated.username,
                isNew: false,
              });
            } else {
              // Check if email collides with another user
              if (existingByEmail.has(email)) {
                email = `${cleanEmpId.toLowerCase()}@iul.ac.in`;
              }

              const initialPasswordHash = await hashPassword(cleanEmpId);

              const [created] = await db.insert(users).values({
                username: cleanEmpId,
                password: initialPasswordHash,
                empId: cleanEmpId,
                prefix,
                firstName,
                lastName,
                designation,
                mobile,
                department,
                email,
                role: UserRole.SUPERVISOR,
                forcePasswordReset: true, // Mandatory first login password change
              }).returning();

              existingByEmpId.set(cleanEmpIdUpper, created as User);
              existingByUsername.set(cleanEmpIdUpper, created as User);
              existingByEmail.set(email, created as User);

              result.totalSupervisorsCreated++;
              result.totalSupervisorsProcessed++;
              result.supervisors.push({
                empId: cleanEmpId,
                name: `${prefix ? prefix + " " : ""}${firstName} ${lastName}`.trim(),
                designation,
                email,
                username: created.username,
                isNew: true,
              });
            }
          } catch (err: any) {
            result.errors?.push(`Failed to onboard supervisor ${cleanEmpId} (${rawName}): ${err.message}`);
          }
        })
      );
    }

    result.message = `Bulk supervisor onboarding completed. ${result.totalSupervisorsCreated} created, ${result.totalSupervisorsUpdated} updated out of ${result.totalSupervisorsProcessed} processed.`;
    return result;
  }

  // Bulk upload, cross-check, and assign sequential PUGID26xxx IDs to project topics
  async bulkUploadProjectTopics(
    course: string,
    rows: ITopicOnboardingRow[],
    options?: { autoApprove?: boolean }
  ): Promise<ITopicOnboardingResult> {
    const result: ITopicOnboardingResult = {
      success: true,
      message: "",
      totalRows: rows.length,
      matchedSupervisors: 0,
      unmatchedSupervisors: 0,
      totalTopicsCreated: 0,
      successRecords: [],
      failureRecords: [],
    };

    if (rows.length === 0) {
      result.message = "No topic rows to process.";
      return result;
    }

    // Preload all supervisors
    const supervisorsList = (await db
      .select()
      .from(users)
      .where(and(eq(users.role, UserRole.SUPERVISOR), eq(users.isDeleted, false)))) as User[];

    const supervisorsByEmail = new Map<string, User>();
    for (const s of supervisorsList) {
      if (s.email) {
        supervisorsByEmail.set(s.email.trim().toLowerCase(), s);
      }
    }

    // Helper to tokenize name for cross-checking
    const normalizeTokens = (name: string): string[] => {
      const variants: Record<string, string> = {
        mohd: "mohammad",
        "mohd.": "mohammad",
        mohammad: "mohammad",
        mohammed: "mohammad",
        muhammad: "mohammad",
        md: "mohammad",
        "md.": "mohammad",
        akhter: "akhtar",
        akhtar: "akhtar",
      };

      return name
        .toLowerCase()
        .replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?)\s+/i, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1 && !["dr", "mr", "mrs", "ms", "prof"].includes(t))
        .map((t) => variants[t] || t);
    };

    // Calculate current maximum sequence for PUGID26xxx
    const existingTopicsWithCodes = await db
      .select({ topicCode: projectTopics.topicCode })
      .from(projectTopics)
      .where(and(isNotNull(projectTopics.topicCode), like(projectTopics.topicCode, "PUGID26%")));

    let maxSequence = 0;
    for (const t of existingTopicsWithCodes) {
      if (t.topicCode) {
        const match = t.topicCode.match(/^PUGID26(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSequence) {
            maxSequence = num;
          }
        }
      }
    }

    let nextSequence = maxSequence + 1;
    let firstGeneratedCode: string | undefined;
    let lastGeneratedCode: string | undefined;

    // Process rows sequentially to guarantee deterministic, ordered PUGID assignment
    for (const row of rows) {
      const cleanEmail = String(row.facultyEmail || "").trim().toLowerCase();
      const rawName = String(row.facultyName || "").trim();

      // 1. Cross-check email against supervisors in database
      const supervisor = supervisorsByEmail.get(cleanEmail);
      if (!supervisor) {
        result.unmatchedSupervisors++;
        result.failureRecords.push({
          rowNumber: row.rowNumber,
          facultyName: rawName,
          facultyEmail: cleanEmail,
          reason: "Upload Failed: Supervisor email not found in database",
        });
        continue;
      }

      // 2. Cross-check faculty name compatibility
      const dbFullName = `${supervisor.prefix ? supervisor.prefix + " " : ""}${supervisor.firstName} ${supervisor.lastName || ""}`.trim();
      const excelTokens = normalizeTokens(rawName);
      const dbTokens = normalizeTokens(dbFullName);

      // Verify token overlap (at least one substantial token matches)
      const hasTokenMatch = excelTokens.some((token) => dbTokens.includes(token));
      if (excelTokens.length > 0 && dbTokens.length > 0 && !hasTokenMatch) {
        result.unmatchedSupervisors++;
        result.failureRecords.push({
          rowNumber: row.rowNumber,
          facultyName: rawName,
          facultyEmail: cleanEmail,
          reason: `Upload Failed: Supervisor name '${rawName}' does not match database record '${dbFullName}' for email '${cleanEmail}'`,
        });
        continue;
      }

      // 3. Supervisor verified! Proceed to insert topics with sequential PUGID26xxx
      const rowTopicCodes: string[] = [];
      const rowTopicTitles: string[] = [];

      for (const t of row.topics) {
        const seqStr = String(nextSequence++).padStart(3, "0");
        const topicCode = `PUGID26${seqStr}`;

        if (!firstGeneratedCode) firstGeneratedCode = topicCode;
        lastGeneratedCode = topicCode;

        try {
          const [inserted] = await db
            .insert(projectTopics)
            .values({
              topicCode,
              title: t.title,
              description: t.description,
              technology: t.technology || "General / Web Development",
              projectType: t.projectType || "Web Application",
              course: course.toUpperCase(),
              submittedById: supervisor.id,
              status: options?.autoApprove !== false ? "approved" : "pending",
              estimatedComplexity: "Medium",
            })
            .returning();

          rowTopicCodes.push(topicCode);
          rowTopicTitles.push(inserted.title);
          result.totalTopicsCreated++;
        } catch (err: any) {
          result.failureRecords.push({
            rowNumber: row.rowNumber,
            facultyName: rawName,
            facultyEmail: cleanEmail,
            reason: `Database error inserting topic '${t.title}': ${err.message}`,
          });
        }
      }

      result.matchedSupervisors++;
      result.successRecords.push({
        rowNumber: row.rowNumber,
        facultyName: rawName,
        facultyEmail: cleanEmail,
        supervisorId: supervisor.id,
        empId: supervisor.empId || null,
        topicCodes: rowTopicCodes,
        topicTitles: rowTopicTitles,
      });
    }

    if (firstGeneratedCode && lastGeneratedCode) {
      result.generatedIdRange = {
        start: firstGeneratedCode,
        end: lastGeneratedCode,
      };
    }

    result.message = `Bulk topic onboarding completed. ${result.totalTopicsCreated} topics provisioned across ${result.matchedSupervisors} verified supervisors. ${result.unmatchedSupervisors} faculty records skipped.`;
    return result;
  }

  private static ensurePreferencesTablePromise: Promise<void> | null = null;
  private static async ensurePreferencesTable(): Promise<void> {
    if (!DBStorage.ensurePreferencesTablePromise) {
      DBStorage.ensurePreferencesTablePromise = (async () => {
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_notification_preferences (
              id SERIAL PRIMARY KEY,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              email_notifications BOOLEAN NOT NULL DEFAULT true,
              project_updates BOOLEAN NOT NULL DEFAULT true,
              deadline_reminders BOOLEAN NOT NULL DEFAULT true,
              system_announcements BOOLEAN NOT NULL DEFAULT true,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
              CONSTRAINT user_notification_preferences_user_id_unique UNIQUE (user_id)
            );
            CREATE INDEX IF NOT EXISTS user_notification_preferences_user_id_idx ON user_notification_preferences (user_id);
          `);
        } catch (err) {
          console.warn('Notice: user_notification_preferences table ensure check:', err);
        }
      })();
    }
    return DBStorage.ensurePreferencesTablePromise;
  }

  /**
   * Retrieves notification preferences for a user from database persistence.
   * If preferences have not been customized yet, default preferences (all enabled) are returned.
   */
  async getUserNotificationPreferences(userId: number): Promise<IUserNotificationPreferences> {
    await DBStorage.ensurePreferencesTable();
    try {
      const [record] = await db
        .select({
          emailNotifications: userNotificationPreferences.emailNotifications,
          projectUpdates: userNotificationPreferences.projectUpdates,
          deadlineReminders: userNotificationPreferences.deadlineReminders,
          systemAnnouncements: userNotificationPreferences.systemAnnouncements,
        })
        .from(userNotificationPreferences)
        .where(eq(userNotificationPreferences.userId, userId))
        .limit(1);

      if (record) {
        return {
          emailNotifications: Boolean(record.emailNotifications),
          projectUpdates: Boolean(record.projectUpdates),
          deadlineReminders: Boolean(record.deadlineReminders),
          systemAnnouncements: Boolean(record.systemAnnouncements),
        };
      }
    } catch (error) {
      console.error(`Error reading notification preferences for user ${userId}:`, error);
    }

    return {
      emailNotifications: true,
      projectUpdates: true,
      deadlineReminders: true,
      systemAnnouncements: true,
    };
  }

  /**
   * Updates notification preferences for a user in the database.
   * Stores and returns defensive copies of preferences so caller mutations
   * cannot alter the saved value.
   */
  async updateUserNotificationPreferences(
    userId: number,
    preferences: IUserNotificationPreferences
  ): Promise<IUserNotificationPreferences> {
    await DBStorage.ensurePreferencesTable();

    // Store a defensive copy of preferences so caller mutations cannot alter the saved value
    const preferencesCopy: IUserNotificationPreferences = {
      emailNotifications: preferences.emailNotifications !== false,
      projectUpdates: preferences.projectUpdates !== false,
      deadlineReminders: preferences.deadlineReminders !== false,
      systemAnnouncements: preferences.systemAnnouncements !== false,
    };

    const now = new Date();

    await db
      .insert(userNotificationPreferences)
      .values({
        userId,
        emailNotifications: preferencesCopy.emailNotifications,
        projectUpdates: preferencesCopy.projectUpdates,
        deadlineReminders: preferencesCopy.deadlineReminders,
        systemAnnouncements: preferencesCopy.systemAnnouncements,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userNotificationPreferences.userId,
        set: {
          emailNotifications: preferencesCopy.emailNotifications,
          projectUpdates: preferencesCopy.projectUpdates,
          deadlineReminders: preferencesCopy.deadlineReminders,
          systemAnnouncements: preferencesCopy.systemAnnouncements,
          updatedAt: now,
        },
      });

    // Return a fresh defensive copy so caller mutations cannot alter the saved value
    return { ...preferencesCopy };
  }
}

export const storage = new DBStorage();