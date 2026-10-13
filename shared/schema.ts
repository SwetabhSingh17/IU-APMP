/**
 * Shared Database Schema — APMS (Academic Project Management System)
 *
 * Central definition file for all Drizzle ORM table schemas, Zod validation
 * schemas, and inferred TypeScript types. This module is imported by both the
 * server (for queries) and the client (for type safety and validation).
 *
 * Tables:
 *  - users               — All system users (admin, coordinator, teacher, student)
 *  - studentGroups        — Student project groups with faculty mentors
 *  - studentGroupMembers  — Group membership with invite status tracking
 *  - projectTopics        — Teacher-submitted project topics (pending → approved/rejected)
 *  - studentProjects      — Student ↔ Topic assignments with progress tracking
 *  - projectAssessments   — Faculty evaluations (score + feedback)
 *  - projectMilestones    — Milestone tracking per project
 *  - notifications        — User notification queue
 *  - sessions             — Express session storage
 */
import { pgTable, text, serial, integer, boolean, timestamp, varchar, pgEnum, index, uniqueIndex, json } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Student groups table - stores project teams formed for academic projects
export const studentGroups = pgTable("student_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  supervisorId: integer("supervisor_id"),
  createdById: integer("created_by_id"),
  course: text("course"),
  projectTeamId: text("project_team_id"),
  maxSize: integer("max_size").notNull().default(5),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStudentGroupSchema = createInsertSchema(studentGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Users table - includes forcePasswordReset flag for mandatory first-login password changes
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(),
  enrollmentNumber: text("enrollment_number"),
  course: text("course"),
  empId: text("emp_id"),
  prefix: text("prefix"),
  designation: text("designation"),
  mobile: text("mobile"),
  department: text("department"),
  groupId: integer("group_id").references(() => studentGroups.id),
  forcePasswordReset: boolean("force_password_reset").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    usernameIdx: index("username_idx").on(table.username),
    emailIdx: index("email_idx").on(table.email),
    enrollmentIdx: index("enrollment_idx").on(table.enrollmentNumber),
    empIdIdx: index("emp_id_idx").on(table.empId),
  };
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
});

// Project topics table
export const projectTopics = pgTable("project_topics", {
  id: serial("id").primaryKey(),
  topicCode: text("topic_code"), // Auto-incrementing unique sequential ID: PUGID26001, PUGID26002, etc.
  title: text("title").notNull(),
  description: text("description"),
  submittedById: integer("submitted_by_id").references(() => users.id).notNull(),
  technology: text("technology").notNull(),
  projectType: text("project_type").notNull(),
  course: text("course").notNull(),
  estimatedComplexity: text("estimated_complexity").notNull().default("Medium"),
  status: text("status").notNull().default("pending"),
  feedback: text("feedback"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    statusIsDeletedIdx: index("status_is_deleted_idx").on(table.status, table.isDeleted),
    topicCodeIdx: index("topic_code_idx").on(table.topicCode),
  };
});

export const insertProjectTopicSchema = createInsertSchema(projectTopics).omit({
  id: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  feedback: true,
  status: true,
  estimatedComplexity: true,
});

// Student projects table
export const studentProjects = pgTable("student_projects", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => users.id).notNull(),
  topicId: integer("topic_id").references(() => projectTopics.id).notNull(),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("in_progress"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStudentProjectSchema = createInsertSchema(studentProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  progress: true,
  status: true,
});

// Project assessments table
export const projectAssessments = pgTable("project_assessments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => studentProjects.id),
  supervisorId: integer("supervisor_id").references(() => users.id),
  score: integer("score").notNull(),
  feedback: text("feedback"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectAssessmentSchema = createInsertSchema(projectAssessments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  isRead: true,
  createdAt: true,
  updatedAt: true,
});

// User Notification Preferences table
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  projectUpdates: boolean("project_updates").notNull().default(true),
  deadlineReminders: boolean("deadline_reminders").notNull().default(true),
  systemAnnouncements: boolean("system_announcements").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index("user_notification_preferences_user_id_idx").on(table.userId),
  };
});

export const insertUserNotificationPreferenceSchema = createInsertSchema(userNotificationPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project milestones table
export const projectMilestones = pgTable("project_milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => studentProjects.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  dueDate: timestamp("due_date").notNull(),
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectMilestoneSchema = createInsertSchema(projectMilestones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Sessions table
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => {
  return {
    expireIdx: index("IDX_session_expire").on(table.expire),
  };
});

// Student group members table
export const studentGroupMembers = pgTable("student_group_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  groupId: integer("group_id").notNull().references(() => studentGroups.id),
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => {
  return {
    userIdGroupIdIdx: index("user_id_group_id_idx").on(table.userId, table.groupId),
    acceptedUserIdx: uniqueIndex("student_group_members_accepted_user_idx").on(table.userId).where(sql`status = 'accepted'`),
  };
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type StudentGroupMember = typeof studentGroupMembers.$inferSelect;
export type InsertStudentGroupMember = z.infer<typeof insertStudentGroupMemberSchema>;

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
} as any);

export const insertStudentGroupMemberSchema = createInsertSchema(studentGroupMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type ProjectTopic = typeof projectTopics.$inferSelect & {
  submittedBy?: {
    id: number;
    firstName: string;
    lastName: string;
    prefix?: string | null;
    designation?: string | null;
    empId?: string | null;
    department?: string | null;
    email?: string | null;
  };
};
export type InsertProjectTopic = z.infer<typeof insertProjectTopicSchema>;

export type StudentProject = typeof studentProjects.$inferSelect & {
  topic?: ProjectTopic;
  student?: User;
  supervisor?: User;
};
export type InsertStudentProject = z.infer<typeof insertStudentProjectSchema>;

export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type InsertProjectMilestone = z.infer<typeof insertProjectMilestoneSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type UserNotificationPreference = typeof userNotificationPreferences.$inferSelect;
export type InsertUserNotificationPreference = z.infer<typeof insertUserNotificationPreferenceSchema>;

export interface IUserNotificationPreferences {
  emailNotifications: boolean;
  projectUpdates: boolean;
  deadlineReminders: boolean;
  systemAnnouncements: boolean;
}

export type StudentGroup = typeof studentGroups.$inferSelect;
export type InsertStudentGroup = z.infer<typeof insertStudentGroupSchema>;

export type ProjectAssessment = typeof projectAssessments.$inferSelect;
export type InsertProjectAssessment = z.infer<typeof insertProjectAssessmentSchema>;

export enum UserRole {
  ADMIN = "admin",
  COORDINATOR = "coordinator",
  SUPERVISOR = "supervisor",
  STUDENT = "student",
}

export enum CollaborationType {
  INDIVIDUAL = "individual",
  GROUP = "group",
}

export enum CourseType {
  BCA = "BCA",
  MCA = "MCA",
}

// Interfaces with I-prefix per project style guidelines
export type IUser = User;
export type IInsertUser = InsertUser;
export type IStudentGroup = StudentGroup;
export type IInsertStudentGroup = InsertStudentGroup;
export type IProjectTopic = ProjectTopic;
export type IInsertProjectTopic = InsertProjectTopic;
export type IStudentProject = StudentProject;
export type IInsertStudentProject = InsertStudentProject;

// Row extracted from each worksheet of the student onboarding Excel file
export interface IStudentOnboardingRow {
  sNo?: number | string;
  projectTeamId: string;
  enrollmentNumber: string;
  studentName: string;
  mobileNo?: string;
  emailId?: string;
  sheetName?: string;
}

// Summary result returned after processing bulk student onboarding
export interface IOnboardingResult {
  success: boolean;
  message: string;
  course: "BCA" | "MCA";
  totalSheetsParsed: number;
  totalStudentsProcessed: number;
  totalTeamsCreated: number;
  sheetNames: string[];
  teams: Array<{
    teamId: string;
    studentCount: number;
    enrollmentNumbers: string[];
  }>;
  errors?: string[];
}

// Real-time progress update event emitted during bulk onboarding stream
export interface IOnboardingProgress {
  stage: "uploading" | "parsing" | "provisioning" | "teams" | "finalizing" | "completed" | "error";
  percent: number;
  message: string;
  current?: number;
  total?: number;
  detail?: string;
  result?: IOnboardingResult;
}

// Paginated response type
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Row extracted from supervisor onboarding Excel file
export interface ISupervisorOnboardingRow {
  sNo?: number | string;
  empId: string;
  name: string;
  prefix?: string;
  firstName?: string;
  lastName?: string;
  designation: string;
  mobile?: string;
  email?: string;
  department?: string;
}

// Summary result returned after processing bulk supervisor onboarding
export interface ISupervisorOnboardingResult {
  success: boolean;
  message: string;
  totalSupervisorsProcessed: number;
  totalSupervisorsCreated: number;
  totalSupervisorsUpdated: number;
  supervisors: Array<{
    empId: string;
    name: string;
    designation: string;
    email: string;
    username: string;
    isNew: boolean;
  }>;
  errors?: string[];
}

// Individual project topic item extracted from a faculty suggestion row
export interface ITopicOnboardingItem {
  slot: number; // 1 to 5
  title: string;
  projectType: string;
  technology: string;
  description: string;
}

// Single faculty row extracted from topic suggestions Excel file
export interface ITopicOnboardingRow {
  rowNumber: number;
  facultyName: string;
  facultyEmail: string;
  timestamp?: string;
  topics: ITopicOnboardingItem[];
}

// Success record for an onboarded supervisor and their topics
export interface ITopicOnboardingSuccessRecord {
  rowNumber: number;
  facultyName: string;
  facultyEmail: string;
  supervisorId: number;
  empId?: string | null;
  topicCodes: string[];
  topicTitles: string[];
}

// Failure record for an unmatched faculty row
export interface ITopicOnboardingFailureRecord {
  rowNumber: number;
  facultyName: string;
  facultyEmail: string;
  reason: string;
}

// Aggregated summary result of the bulk topic onboarding process
export interface ITopicOnboardingResult {
  success: boolean;
  message: string;
  totalRows: number;
  matchedSupervisors: number;
  unmatchedSupervisors: number;
  totalTopicsCreated: number;
  generatedIdRange?: {
    start: string;
    end: string;
  };
  successRecords: ITopicOnboardingSuccessRecord[];
  failureRecords: ITopicOnboardingFailureRecord[];
}

export interface IEnrollmentConflictStudent {
  id: number;
  username: string;
  enrollmentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string | null;
  course: string | null;
  groupId: number | null;
  groupName: string | null;
  projectTeamId: string | null;
  createdAt: string | Date;
}

export interface IEnrollmentConflict {
  enrollmentNumber: string;
  count: number;
  students: IEnrollmentConflictStudent[];
}

export interface ISupervisorConflict {
  groupId: number;
  groupName: string;
  projectTeamId?: string | null;
  course?: string | null;
  topicId?: number;
  topicCode?: string | null;
  topicTitle: string;
  topicDescription?: string | null;
  technology?: string | null;
  projectType?: string | null;
  estimatedComplexity?: string | null;
  oldSupervisor: {
    id: number;
    name: string;
    prefix?: string | null;
    empId?: string | null;
    email: string;
    department?: string | null;
    designation?: string | null;
  };
  newSupervisor: {
    id: number;
    name: string;
    prefix?: string | null;
    empId?: string | null;
    email: string;
    department?: string | null;
    designation?: string | null;
  };
  membersCount: number;
}

export interface ISupervisorConflictResolutionPayload {
  groupId: number;
  resolution: "copy" | "migrate";
  newSupervisorId?: number;
}
