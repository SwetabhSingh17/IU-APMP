import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import MainLayout from "@/components/layout/main-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, UserPlus, UserCog, Edit, Trash2, Eye, EyeOff, FileSpreadsheet, UserCheck, RotateCcw, KeyRound, AlertTriangle, AlertCircle, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { InsertUser, UserRole, IEnrollmentConflict } from "@shared/schema";
import { BulkOnboardingModal } from "@/components/admin/bulk-onboarding-modal";
import { SupervisorBulkOnboardingModal } from "@/components/admin/supervisor-bulk-onboarding-modal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useCourseFilter } from "@/hooks/course-filter-context";
import { filterBySearchQuery, createSearchDocument } from "@/lib/search-index";

// Helper functions for displaying user roles 
function getRoleBadgeClasses(role: string): string {
  switch (role) {
    case UserRole.ADMIN:
      return "bg-red-100 text-red-800";
    case UserRole.COORDINATOR:
      return "bg-purple-100 text-purple-800";
    case UserRole.SUPERVISOR:
      return "bg-blue-100 text-blue-800";
    case UserRole.STUDENT:
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getRoleDisplay(role: string): string {
  switch (role) {
    case UserRole.ADMIN:
      return "Admin";
    case UserRole.COORDINATOR:
      return "Coordinator";
    case UserRole.SUPERVISOR:
      return "Supervisor";
    case UserRole.STUDENT:
      return "Student";
    default:
      return role;
  }
}

interface UserData {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  enrollmentNumber: string | null;
  empId?: string | null;
  prefix?: string | null;
  designation?: string | null;
  mobile?: string | null;
  department?: string | null;
  topicsCount?: number;
  projectStatus?: string | null;
  topicCode?: string | null;
  topicTitle?: string | null;
}

export default function UserManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isBulkOnboardOpen, setIsBulkOnboardOpen] = useState(false);
  const [isSupervisorBulkOnboardOpen, setIsSupervisorBulkOnboardOpen] = useState(false);

  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { courseFilter, getCourseQuery } = useCourseFilter();

  const userQueryParam = getCourseQuery() ? `?${getCourseQuery()}&limit=all` : '?limit=all';
  const { data: users, isLoading } = useQuery<UserData[]>({
    queryKey: [`/api/users${getCourseQuery() ? `?${getCourseQuery()}` : ''}`],
    enabled: !!user && (user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR),
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/users${userQueryParam}`);
      const data = await response.json();
      return data.data || data;
    }
  });

  const { data: conflictData } = useQuery<{ conflicts: IEnrollmentConflict[], count: number }>({
    queryKey: ["/api/admin/enrollment-conflicts"],
    enabled: !!user && (user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR),
    refetchInterval: 15000
  });
  const conflicts = conflictData?.conflicts || [];
  const conflictingEnrollmentSet = new Set(conflicts.map(c => c.enrollmentNumber));
  const conflictedStudentCount = conflicts.reduce((sum, c) => sum + (c.students?.length || 0), 0);

  // State for enrollment conflict resolution dialog
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [resolvingStudentId, setResolvingStudentId] = useState<number | null>(null);
  const [newEnrollmentInputs, setNewEnrollmentInputs] = useState<Record<number, string>>({});
  const [showOnlyConflicts, setShowOnlyConflicts] = useState(false);
  const [activeTab, setActiveTab] = useState("all-users");

  const resolveConflictMutation = useMutation({
    mutationFn: async ({ userId, newEnrollmentNumber }: { userId: number, newEnrollmentNumber: string }) => {
      const res = await apiRequest("POST", "/api/admin/resolve-enrollment-conflict", {
        userId,
        newEnrollmentNumber
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Conflict Resolved",
        description: data.message || "Enrollment number updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrollment-conflicts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setResolvingStudentId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to resolve conflict",
        description: error.message,
        variant: "destructive",
      });
      setResolvingStudentId(null);
    }
  });

  // Define form schema
  const userFormSchema = insertUserSchema.extend({
    confirmPassword: z.string().min(1, "Please confirm your password"),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  }).refine((data) => {
    // Enrollment number is required only for student accounts
    if (data.role === UserRole.STUDENT && (!data.enrollmentNumber || data.enrollmentNumber.trim() === "")) {
      return false;
    }
    return true;
  }, {
    message: "Enrollment number is required for student registration",
    path: ["enrollmentNumber"]
  }).refine((data) => {
    // Course is required for student accounts
    if (data.role === UserRole.STUDENT && !data.course) {
      return false;
    }
    return true;
  }, {
    message: "Course selection is required for students",
    path: ["course"]
  });

  type UserFormValues = z.infer<typeof userFormSchema>;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      email: "",
      role: UserRole.STUDENT,
      enrollmentNumber: "",
      course: "BCA",
      mobile: "",
    }
  });

  // Define edit form schema without password fields
  const editFormSchema = insertUserSchema.extend({
    password: z.string().min(6, "Password must be at least 6 characters").optional(),
    confirmPassword: z.string().optional(),
    enrollmentNumber: z.string().nullable().optional(),
  }).refine((data) => {
    // If one password field is provided, both must be provided and must match
    if (data.password || data.confirmPassword) {
      return data.password === data.confirmPassword;
    }
    return true;
  }, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

  type EditFormValues = z.infer<typeof editFormSchema>;

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      username: "",
      firstName: "",
      lastName: "",
      email: "",
      role: UserRole.STUDENT,
      enrollmentNumber: null,
      password: "",
      confirmPassword: "",
      course: "BCA",
      mobile: "",
    }
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User created successfully",
        description: "The new user has been added to the system.",
      });
      form.reset();
      setIsAddUserOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create user",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<InsertUser> }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User updated successfully",
        description: "The user information has been updated.",
      });
      editForm.reset();
      setIsEditUserOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "User deleted",
        description: "The user has been removed from the system.",
      });
      setIsConfirmDeleteOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete user",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Password Reset Successful",
        description: data.message,
      });
      setResetPasswordUser(null);
      queryClient.invalidateQueries({ queryKey: [`/api/users${getCourseQuery() ? `?${getCourseQuery()}` : ''}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to reset password",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: UserFormValues) => {
    const { confirmPassword, ...userData } = data;

    // Clean up student-only fields for non-student roles
    if (userData.role !== UserRole.STUDENT) {
      delete userData.enrollmentNumber;
      delete userData.course;
    } else if (userData.enrollmentNumber) {
      userData.enrollmentNumber = userData.enrollmentNumber.trim();
    }

    createUserMutation.mutate(userData);
  };

  const onEditSubmit = (data: Partial<EditFormValues>) => {
    if (!selectedUser) return;

    const { confirmPassword, ...restData } = data;

    // Remove undefined/empty fields
    const updateData: Partial<InsertUser> = Object.entries(restData).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== "" && value !== null) {
        acc[key as keyof InsertUser] = value as any;
      }
      return acc;
    }, {} as Partial<InsertUser>);

    // Ensure id is not part of the update data
    if ('id' in updateData) delete updateData.id;

    updateUserMutation.mutate({ id: selectedUser.id, data: updateData });
  };

  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    editForm.reset({
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      enrollmentNumber: user.enrollmentNumber || null,
      course: user.course || "BCA",
      mobile: user.mobile || "",
    });
    setIsEditUserOpen(true);
  };

  const handleDeleteUser = (user: any) => {
    setSelectedUser(user);
    setIsConfirmDeleteOpen(true);
  };

  const confirmDeleteUser = () => {
    if (selectedUser) {
      deleteUserMutation.mutate(selectedUser.id);
    }
  };

  const filterUsers = (items: UserData[] | undefined): UserData[] => {
    if (!items) return [];
    return filterBySearchQuery(items, searchQuery, item =>
      createSearchDocument(
        item.username,
        item.firstName,
        item.lastName,
        `${item.firstName} ${item.lastName}`,
        item.email,
        item.enrollmentNumber,
        item.empId,
        item.mobile,
        (item as any).course,
        item.department,
        item.role
      )
    );
  };

  const filteredUsers = filterUsers(users);

  if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.COORDINATOR)) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>
                You don't have permission to access this page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground">
                This page is only accessible to administrators and coordinators.
              </p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">User Management</h1>
        <p className="text-muted-foreground">Manage users and their roles in the system</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Manage user accounts and permissions
            </CardDescription>
          </div>
          {/* Action buttons: separate bulk onboarding for Students and Supervisors, and single user creation */}
          <div className="flex items-center gap-2 flex-wrap">

            <Button
              variant="secondary"
              type="button"
              onClick={() => setIsBulkOnboardOpen(true)}
              className="gap-1.5 border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-xs sm:text-sm"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Bulk Upload Student</span>
            </Button>

            <Button
              variant="outline"
              type="button"
              onClick={() => setIsSupervisorBulkOnboardOpen(true)}
              className="gap-1.5 border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 text-purple-700 dark:text-purple-300 font-semibold text-xs sm:text-sm shadow-sm"
            >
              <UserCheck className="h-4 w-4" />
              <span>Bulk Upload Supervisor</span>
            </Button>

            <Button
              onClick={() => {
                form.reset();
                setIsAddUserOpen(true);
              }}
              className="gap-1.5 text-xs sm:text-sm"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add User</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search users by name, email, or username..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {conflicts.length > 0 && (
            <div className="mb-6 p-4 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 dark:bg-amber-950/20 backdrop-blur flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-start gap-3 text-amber-950 dark:text-amber-200">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">Enrolment Conflict Detected</span>
                    <span className="bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                      {conflicts.length} {conflicts.length === 1 ? "Conflict" : "Conflicts"} ({conflictedStudentCount} Students)
                    </span>
                  </div>
                  <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-1 max-w-2xl leading-relaxed">
                    Multiple students share the exact same university enrolment number. Resolve the conflict below to assign distinct enrolment numbers and ensure unique credentials.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-500/40 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 text-xs font-medium"
                  onClick={() => {
                    setActiveTab("students");
                    setShowOnlyConflicts(!showOnlyConflicts);
                  }}
                >
                  <Users className="w-3.5 h-3.5 mr-1.5" />
                  {showOnlyConflicts ? "Show All Students" : `Show Conflicted Only (${conflictedStudentCount})`}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="font-semibold text-xs shadow-sm"
                  onClick={() => setIsConflictModalOpen(true)}
                >
                  <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                  Resolve Enrolment Conflict
                </Button>
              </div>
            </div>
          )}

          {(() => {
            const adminsList = filteredUsers ? filteredUsers.filter(u => u.role === UserRole.ADMIN) : [];
            const supervisorsList = filteredUsers ? filteredUsers.filter(u => u.role === UserRole.SUPERVISOR) : [];
            const coordinatorsList = filteredUsers ? filteredUsers.filter(u => u.role === UserRole.COORDINATOR) : [];
            const rawStudentsList = filteredUsers ? filteredUsers.filter(u => u.role === UserRole.STUDENT) : [];
            const studentsList = showOnlyConflicts
              ? rawStudentsList.filter(u => u.enrollmentNumber && conflictingEnrollmentSet.has(u.enrollmentNumber))
              : rawStudentsList;
            const allUsersCount = filteredUsers ? filteredUsers.length : 0;

            return (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="all-users">All Users ({allUsersCount})</TabsTrigger>
                  <TabsTrigger value="admins">Admins ({adminsList.length})</TabsTrigger>
                  <TabsTrigger value="supervisors">Supervisors ({supervisorsList.length})</TabsTrigger>
                  <TabsTrigger value="coordinators">Coordinators ({coordinatorsList.length})</TabsTrigger>
                  <TabsTrigger value="students" className="relative">
                    Students ({rawStudentsList.length})
                    {conflictedStudentCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                        {conflictedStudentCount} conflicts
                      </span>
                    )}
                  </TabsTrigger>
                  {conflicts.length > 0 && (
                    <TabsTrigger
                      value="conflicts"
                      className="text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/30 data-[state=active]:bg-amber-500/15"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600 dark:text-amber-400" />
                      Conflicts ({conflictedStudentCount})
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="all-users">
                  {isLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredUsers && filteredUsers.length > 0 ? (
                            filteredUsers.map((user) => {
                              const isConflicted = user.enrollmentNumber ? conflictingEnrollmentSet.has(user.enrollmentNumber) : false;
                              return (
                              <TableRow key={user.id} className={`hover:bg-muted/50 ${isConflicted ? "bg-amber-500/10 dark:bg-amber-950/20 border-l-4 border-l-amber-500" : ""}`}>
                                <TableCell>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                      <span className="text-primary font-medium text-sm">
                                        {user.firstName.charAt(0)}
                                        {user.lastName.charAt(0)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span>{user.firstName} {user.lastName}</span>
                                      {isConflicted && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                          <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                          Conflict
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>{user.username}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                  <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadgeClasses(user.role)}`}>
                                    {getRoleDisplay(user.role)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex space-x-2 justify-end">
                                    {isConflicted && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-medium text-xs gap-1"
                                        title="Resolve enrolment conflict"
                                        onClick={() => setIsConflictModalOpen(true)}
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                        Resolve
                                      </Button>
                                    )}
                                    {(user.role === UserRole.STUDENT || user.role === UserRole.SUPERVISOR) && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                        title={`Reset password to default (${user.role === UserRole.SUPERVISOR ? 'Emp. ID' : 'Enrollment No.'})`}
                                        onClick={() => setResetPasswordUser(user)}
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditUser(user)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteUser(user)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );})
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                {searchQuery
                                  ? "No users match your search"
                                  : "No users found"}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="admins">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Username</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adminsList.length > 0 ? (
                          adminsList.map((user) => (
                            <TableRow key={user.id} className="hover:bg-muted/50">
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <div className="w-8 h-8 rounded-full bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 flex items-center justify-center font-semibold text-xs">
                                    {user.firstName ? user.firstName.charAt(0) : "A"}
                                    {user.lastName ? user.lastName.charAt(0) : ""}
                                  </div>
                                  <span className="font-medium text-foreground">
                                    {user.firstName} {user.lastName}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{user.username}</TableCell>
                              <TableCell className="text-sm">{user.email}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadgeClasses(user.role)}`}>
                                  {getRoleDisplay(user.role)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex space-x-2 justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditUser(user)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteUser(user)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              No administrators found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="supervisors">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp. ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Designation</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Mobile</TableHead>
                          <TableHead>Topics Submitted</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supervisorsList.length > 0 ? (
                          supervisorsList.map((user) => (
                            <TableRow key={user.id} className="hover:bg-muted/50">
                              <TableCell className="font-mono text-xs font-semibold text-foreground">
                                {user.empId || user.username}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center font-semibold text-xs">
                                    {user.firstName ? user.firstName.charAt(0) : "S"}
                                    {user.lastName ? user.lastName.charAt(0) : ""}
                                  </div>
                                  <span className="font-medium text-foreground">
                                    {user.prefix ? `${user.prefix} ` : ""}{user.firstName} {user.lastName}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40">
                                  {user.designation || "Supervisor"}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm">{user.email}</TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {user.mobile || "—"}
                              </TableCell>
                              <TableCell>
                                {user.topicsCount || 0} topics
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex space-x-2 justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                    title="Reset password to default Employee ID"
                                    onClick={() => setResetPasswordUser(user)}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditUser(user)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteUser(user)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              No supervisors found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="students">
                  {showOnlyConflicts && (
                    <div className="mb-3 flex items-center justify-between p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>Showing only conflicted students ({studentsList.length}). These students share identical enrolment numbers with others.</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 underline"
                        onClick={() => setShowOnlyConflicts(false)}
                      >
                        Show all students
                      </Button>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Enrollment #</TableHead>
                          <TableHead>Mobile</TableHead>
                          <TableHead>Project Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentsList.length > 0 ? (
                          studentsList.map((user) => {
                            const isConflicted = user.enrollmentNumber ? conflictingEnrollmentSet.has(user.enrollmentNumber) : false;
                            return (
                            <TableRow key={user.id} className={`hover:bg-muted/50 ${isConflicted ? "bg-amber-500/10 dark:bg-amber-950/20 border-l-4 border-l-amber-500" : ""}`}>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <span className="text-primary font-medium text-sm">
                                      {user.firstName.charAt(0)}
                                      {user.lastName.charAt(0)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span>{user.firstName} {user.lastName}</span>
                                    {isConflicted && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                        <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                        Conflict
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{user.email}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-semibold">{user.enrollmentNumber || 'N/A'}</span>
                                  {isConflicted && (
                                    <span 
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                      title="This enrolment number is shared with another student. Click resolve to fix."
                                    >
                                      <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                      Conflict
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="font-mono text-xs text-muted-foreground">{user.mobile || "—"}</span>
                              </TableCell>
                              <TableCell>
                                {user.projectStatus ? (
                                  <span
                                    className={`px-2 py-1 text-xs rounded-full font-medium ${
                                      user.projectStatus === "completed"
                                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                                        : "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                                    }`}
                                    title={user.topicTitle ? `${user.topicCode ? `[${user.topicCode}] ` : ""}${user.topicTitle}` : undefined}
                                  >
                                    {user.projectStatus === "completed" ? "Completed" : "Active"}
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300">
                                    No Project
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex space-x-2 justify-end">
                                  {isConflicted && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-medium text-xs gap-1"
                                      title="Resolve enrolment conflict"
                                      onClick={() => setIsConflictModalOpen(true)}
                                    >
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                      Resolve
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                    title="Reset password to default Enrollment Number"
                                    onClick={() => setResetPasswordUser(user)}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditUser(user)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteUser(user)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );})
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              {showOnlyConflicts ? "No conflicted students found" : "No students found"}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {conflicts.length > 0 && (
                  <TabsContent value="conflicts">
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div>
                            <h4 className="font-semibold text-sm text-foreground">
                              {conflicts.length} Enrolment {conflicts.length === 1 ? "Conflict Group" : "Conflict Groups"} ({conflictedStudentCount} Students)
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Students listed below share the same enrolment number. Update each student's enrolment number with their correct distinct value.
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="shrink-0 font-medium text-xs gap-1.5"
                          onClick={() => setIsConflictModalOpen(true)}
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                          Open Conflict Resolution Modal
                        </Button>
                      </div>

                      <div className="space-y-4">
                        {conflicts.map((conflict, idx) => (
                          <Card key={conflict.enrollmentNumber} className="border border-border/80 shadow-xs overflow-hidden">
                            <CardHeader className="bg-muted/40 py-2.5 px-4 border-b border-border/60">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  Conflict Group #{idx + 1}
                                </span>
                                <span className="font-mono text-xs font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                                  Enrolment: {conflict.enrollmentNumber} ({conflict.count} Students)
                                </span>
                              </div>
                            </CardHeader>
                            <CardContent className="p-3">
                              <div className="divide-y divide-border/60">
                                {conflict.students.map((student) => (
                                  <div key={student.id} className="py-3 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-sm text-foreground">{student.firstName} {student.lastName}</span>
                                        <span className="text-xs text-muted-foreground">({student.course || "BCA"})</span>
                                        <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                          {student.projectTeamId ? `Team ${student.projectTeamId}` : (student.groupName || "No Team Assigned")}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono flex-wrap">
                                        <span>Email: {student.email}</span>
                                        {student.mobile && <span>Mobile: {student.mobile}</span>}
                                        <span>Current: <strong className="text-amber-600 dark:text-amber-400">{student.enrollmentNumber}</strong></span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                                      <Input
                                        placeholder={`New enrolment for ${student.firstName}`}
                                        value={newEnrollmentInputs[student.id] ?? ""}
                                        onChange={(e) => setNewEnrollmentInputs(prev => ({ ...prev, [student.id]: e.target.value }))}
                                        className="font-mono text-xs h-8 max-w-[220px]"
                                      />
                                      <Button
                                        size="sm"
                                        className="h-8 text-xs shrink-0 font-medium"
                                        disabled={
                                          (resolveConflictMutation.isPending && resolvingStudentId === student.id) ||
                                          !newEnrollmentInputs[student.id]?.trim() ||
                                          newEnrollmentInputs[student.id]?.trim() === student.enrollmentNumber
                                        }
                                        onClick={() => {
                                          const val = newEnrollmentInputs[student.id]?.trim();
                                          if (!val) return;
                                          setResolvingStudentId(student.id);
                                          resolveConflictMutation.mutate({
                                            userId: student.id,
                                            newEnrollmentNumber: val
                                          });
                                        }}
                                      >
                                        {resolveConflictMutation.isPending && resolvingStudentId === student.id ? "Saving..." : "Update"}
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                )}

                <TabsContent value="coordinators">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {coordinatorsList.length > 0 ? (
                          coordinatorsList.map((user) => (
                            <TableRow key={user.id} className="hover:bg-muted/50">
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <span className="text-primary font-medium text-sm">
                                      {user.firstName.charAt(0)}
                                      {user.lastName.charAt(0)}
                                    </span>
                                  </div>
                                  <span>{user.firstName} {user.lastName}</span>
                                </div>
                              </TableCell>
                              <TableCell>{user.email}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex space-x-2 justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditUser(user)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteUser(user)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                              No coordinators found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            );
          })()}
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account with the appropriate role.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="First name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Last name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="Email address" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl>
                        <Input placeholder="10-digit mobile" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input placeholder="Password" type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input placeholder="Confirm password" type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                          <SelectItem value={UserRole.COORDINATOR}>Coordinator</SelectItem>
                          <SelectItem value={UserRole.SUPERVISOR}>Supervisor</SelectItem>
                          <SelectItem value={UserRole.STUDENT}>Student</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Show enrollment number and course field for students */}
              {form.watch("role") === UserRole.STUDENT && (
                <>
                  <FormField
                    control={form.control}
                    name="course"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Course</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value || "BCA"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select course" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="BCA">BCA</SelectItem>
                            <SelectItem value="MCA">MCA</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="enrollmentNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enrollment Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter enrollment number" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        <FormDescription>
                          Required for student registration
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </>
              )}

              <DialogFooter className="pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsAddUserOpen(false)}
                  type="button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createUserMutation.isPending}
                >
                  {createUserMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information. Leave password fields empty to keep the current password.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                          <SelectItem value={UserRole.COORDINATOR}>Coordinator</SelectItem>
                          <SelectItem value={UserRole.SUPERVISOR}>Supervisor</SelectItem>
                          <SelectItem value={UserRole.STUDENT}>Student</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Mobile number" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {editForm.watch("role") === UserRole.STUDENT && (
                <>
                  <FormField
                    control={editForm.control}
                    name="course"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Course</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value || "BCA"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select course" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="BCA">BCA</SelectItem>
                            <SelectItem value="MCA">MCA</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="enrollmentNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enrollment Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter enrollment number" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}



              <div className="border-t pt-4 mt-4">
                {(selectedUser?.role === UserRole.STUDENT || selectedUser?.role === UserRole.SUPERVISOR) && (
                  <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-md mb-4">
                    <div className="text-xs">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        Reset to Default Password
                      </p>
                      <p className="text-muted-foreground mt-0.5">
                        Restores password to {selectedUser.role === UserRole.SUPERVISOR ? "Employee ID" : "Enrollment Number"}.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 font-medium text-xs shadow-none"
                      onClick={() => {
                        const userToReset = selectedUser;
                        setIsEditUserOpen(false);
                        setResetPasswordUser(userToReset);
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset to Default
                    </Button>
                  </div>
                )}

                <h4 className="text-sm font-medium mb-2">Change Password</h4>
                <p className="text-sm text-muted-foreground mb-4">Leave blank to keep the current password</p>

                <div className="space-y-4">
                  <FormField
                    control={editForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="flex items-center space-x-3 py-2">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive font-semibold">
                {selectedUser.firstName ? selectedUser.firstName.charAt(0) : "U"}
              </div>
              <div>
                <p className="font-medium">{selectedUser.firstName} {selectedUser.lastName}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsConfirmDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteUser}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Password Reset Dialog */}
      <Dialog open={!!resetPasswordUser} onOpenChange={(open) => !open && setResetPasswordUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Reset Password to Default
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm text-foreground/80">
              Are you sure you want to reset the password for{" "}
              <strong className="text-foreground">{resetPasswordUser?.firstName} {resetPasswordUser?.lastName}</strong> ({resetPasswordUser?.role})?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-xs sm:text-sm text-muted-foreground bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-md text-left space-y-1.5">
            <p>
              • The password will be restored to their default:{" "}
              <strong className="text-foreground font-mono">
                {resetPasswordUser?.role === UserRole.SUPERVISOR
                  ? `Employee ID (${resetPasswordUser?.empId || resetPasswordUser?.username})`
                  : `Enrollment Number (${resetPasswordUser?.enrollmentNumber || resetPasswordUser?.username})`}
              </strong>.
            </p>
            <p>• The user will be intercepted on their next login and prompted to set a new password.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetPasswordUser(null)}
              disabled={resetPasswordMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              onClick={() => resetPasswordMutation.mutate(resetPasswordUser.id)}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? "Resetting..." : "Confirm Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enrollment Conflict Resolution Modal */}
      <Dialog open={isConflictModalOpen} onOpenChange={setIsConflictModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Resolve Enrolment Conflict</DialogTitle>
            </div>
            <DialogDescription>
              Multiple students are currently assigned the same enrolment number. Update the enrolment number for the student(s) to resolve the conflict. Their username and default login password will automatically update.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {conflicts.map((conflict, idx) => (
              <Card key={conflict.enrollmentNumber} className="border border-border shadow-none">
                <CardHeader className="bg-muted/40 py-2.5 px-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Conflict Group #{idx + 1}
                    </span>
                    <span className="font-mono text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded">
                      Enrolment: {conflict.enrollmentNumber} ({conflict.count} Students)
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  {conflict.students.map((student) => (
                    <div key={student.id} className="p-3 rounded-lg border border-border/70 bg-card/60 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm">
                        <div>
                          <span className="font-semibold text-foreground">{student.firstName} {student.lastName}</span>
                          <span className="text-xs text-muted-foreground ml-2">({student.course || "BCA"})</span>
                          <p className="text-xs text-muted-foreground font-mono">{student.email} {student.mobile ? `• ${student.mobile}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                            {student.projectTeamId ? `Team ${student.projectTeamId}` : (student.groupName || "No Team Assigned")}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Input
                          placeholder={`Enter new enrolment for ${student.firstName}`}
                          value={newEnrollmentInputs[student.id] ?? ""}
                          onChange={(e) => setNewEnrollmentInputs(prev => ({ ...prev, [student.id]: e.target.value }))}
                          className="font-mono text-sm h-8"
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs shrink-0"
                          disabled={
                            (resolveConflictMutation.isPending && resolvingStudentId === student.id) ||
                            !newEnrollmentInputs[student.id]?.trim() ||
                            newEnrollmentInputs[student.id]?.trim() === student.enrollmentNumber
                          }
                          onClick={() => {
                            const val = newEnrollmentInputs[student.id]?.trim();
                            if (!val) return;
                            setResolvingStudentId(student.id);
                            resolveConflictMutation.mutate({
                              userId: student.id,
                              newEnrollmentNumber: val
                            });
                          }}
                        >
                          {resolveConflictMutation.isPending && resolvingStudentId === student.id ? "Updating..." : "Update Enrolment"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setIsConflictModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk student onboarding and team formation modal */}
      <BulkOnboardingModal
        isOpen={isBulkOnboardOpen}
        onClose={() => setIsBulkOnboardOpen(false)}
      />

      {/* Bulk supervisor and faculty directory onboarding modal */}
      <SupervisorBulkOnboardingModal
        isOpen={isSupervisorBulkOnboardOpen}
        onClose={() => setIsSupervisorBulkOnboardOpen(false)}
      />
    </MainLayout>
  );
}