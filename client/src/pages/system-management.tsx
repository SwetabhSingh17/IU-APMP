import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { Download, Trash2, Database, Upload, FileDown, Archive, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Terminal, AlertTriangle } from "lucide-react";
import MainLayout from "@/components/layout/main-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { useState, useRef } from "react";
import { UserRole } from "@shared/schema";
import { useLocation } from "wouter";

interface IBackupPreview {
    fileName: string;
    fileSizeKB: string;
    isZip: boolean;
    portalName?: string;
    version?: string;
    timestamp?: string;
    recordCounts?: {
        users?: number;
        studentGroups?: number;
        studentGroupMembers?: number;
        projectTopics?: number;
        studentProjects?: number;
        projectAssessments?: number;
        projectMilestones?: number;
        notifications?: number;
        totalRecords?: number;
    };
}

export default function SystemManagement() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [_, setLocation] = useLocation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Redirect if not admin
    if (user && user.role !== UserRole.ADMIN) {
        setLocation("/");
        return <></>;
    }

    // Admin Reset State
    const [resetDialogOpen, setResetDialogOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState("");

    // Import State & Pre-flight Inspection
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<IBackupPreview | null>(null);
    const [isInspecting, setIsInspecting] = useState(false);

    // Live Progress & Telemetry State
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState<{
        stage: string;
        percent: number;
        message: string;
        detail?: string;
    } | null>(null);
    const [importLogs, setImportLogs] = useState<Array<{ time: string; text: string; stage?: string }>>([]);
    const [showLogs, setShowLogs] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);

    const addLog = (text: string, stage: string = "info") => {
        const time = new Date().toLocaleTimeString();
        setImportLogs((prev) => [...prev.slice(-99), { time, text, stage }]);
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    };

    // File selection & pre-flight inspection
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        setSelectedFile(file);
        setImportError(null);
        setImportSuccess(false);
        setImportProgress(null);
        setImportLogs([]);

        if (!file) {
            setPreview(null);
            return;
        }

        setIsInspecting(true);
        try {
            const isZip = file.name.toLowerCase().endsWith(".zip");
            const sizeKB = (file.size / 1024).toFixed(1);

            if (isZip) {
                const JSZip = (await import("jszip")).default;
                const zip = await JSZip.loadAsync(file);
                let metadata: any = null;
                let recordCounts: any = {};

                const findFile = (name: string) => {
                    const direct = zip.file(name);
                    if (direct) return direct;
                    const matches = zip.file(new RegExp(`(^|/)${name}$`, "i"));
                    return matches && matches.length > 0 ? matches[0] : null;
                };

                const manifestFile = findFile("manifest.json");
                if (manifestFile) {
                    const manifestText = await manifestFile.async("string");
                    metadata = JSON.parse(manifestText);
                    recordCounts = metadata.recordCounts || {};
                }

                setPreview({
                    fileName: file.name,
                    fileSizeKB: `${sizeKB} KB`,
                    isZip: true,
                    portalName: metadata?.portalName || "IU-APMP Archive",
                    version: metadata?.version || "2.3.2",
                    timestamp: metadata?.exportedAt || "N/A",
                    recordCounts
                });
            } else {
                const text = await file.text();
                const data = JSON.parse(text);
                const metadata = data.metadata || {};
                const recordCounts = metadata.recordCounts || {
                    users: data.users?.length || 0,
                    studentGroups: data.studentGroups?.length || 0,
                    studentGroupMembers: data.studentGroupMembers?.length || 0,
                    projectTopics: data.projectTopics?.length || 0,
                    studentProjects: data.studentProjects?.length || 0,
                    projectAssessments: data.projectAssessments?.length || 0,
                    projectMilestones: data.projectMilestones?.length || 0,
                    notifications: data.notifications?.length || 0
                };

                setPreview({
                    fileName: file.name,
                    fileSizeKB: `${sizeKB} KB`,
                    isZip: false,
                    portalName: metadata.portalName || "IU-APMP JSON Backup",
                    version: metadata.version || "2.3.2",
                    timestamp: metadata.exportedAt || data.timestamp || "N/A",
                    recordCounts
                });
            }
        } catch (err: any) {
            console.warn("Pre-flight inspection skipped:", err);
            setPreview({
                fileName: file.name,
                fileSizeKB: `${(file.size / 1024).toFixed(1)} KB`,
                isZip: file.name.toLowerCase().endsWith(".zip")
            });
        } finally {
            setIsInspecting(false);
        }
    };

    // A-Z Backup Export Mutation (Downloads ZIP package)
    const exportMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/admin/export", {
                method: "POST",
                credentials: "include"
            });
            if (!res.ok) throw new Error("Backup export failed");
            return res.blob();
        },
        onSuccess: (blob) => {
            const safeDate = new Date().toISOString().split("T")[0];
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `IU-APMP_Backup_${safeDate}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast({
                title: "Backup & Export Successful",
                description: "Complete A-Z portal backup package (.zip) downloaded and retained on server.",
            });
        },
        onError: (error) => {
            toast({
                title: "Export Failed",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    // Real-Time Streaming Restore Handler
    const handleRestore = async () => {
        if (!selectedFile) {
            setImportError("Please select a backup file to proceed.");
            return;
        }

        setIsImporting(true);
        setImportError(null);
        setImportSuccess(false);
        setImportLogs([]);

        const initial = {
            stage: "upload",
            percent: 5,
            message: "Uploading backup archive to server...",
            detail: `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
        };
        setImportProgress(initial);
        addLog(`Initiated restore from: ${selectedFile.name}`, "upload");

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            const response = await fetch("/api/admin/import?stream=true", {
                method: "POST",
                body: formData,
                credentials: "include",
                headers: {
                    Accept: "text/event-stream"
                }
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `Server returned HTTP status ${response.status}`);
            }

            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("text/event-stream") && response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const messages = buffer.split("\n\n");
                    buffer = messages.pop() || "";

                    for (const message of messages) {
                        const lines = message.split("\n");
                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                try {
                                    const update = JSON.parse(line.slice(6));
                                    if (update.error) {
                                        throw new Error(update.message || "Database restoration failed on server");
                                    }
                                    setImportProgress({
                                        stage: update.stage || "restoring",
                                        percent: update.percent || 0,
                                        message: update.message || "Restoring...",
                                        detail: update.detail || ""
                                    });
                                    addLog(update.message, update.stage);
                                    if (update.stage === "complete" || update.success) {
                                        setImportSuccess(true);
                                    }
                                } catch (parseErr: any) {
                                    if (parseErr.message && !parseErr.message.includes("JSON")) {
                                        throw parseErr;
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                const result = await response.json();
                setImportProgress({
                    stage: "complete",
                    percent: 100,
                    message: result.message || "Database restored successfully!",
                    detail: "All records synchronized"
                });
                addLog("Restoration finished successfully", "complete");
                setImportSuccess(true);
            }

            queryClient.invalidateQueries();
            toast({
                title: "Database Restored Successfully",
                description: "Database restored, foreign keys resolved, and sequences synchronized.",
            });
        } catch (err: any) {
            console.error("Restore error:", err);
            const msg = err.message || "An unexpected error occurred during database restoration.";
            setImportError(msg);
            addLog(`[ERROR] ${msg}`, "error");
            toast({
                title: "Import & Restore Failed",
                description: msg,
                variant: "destructive",
            });
        } finally {
            setIsImporting(false);
        }
    };

    // Multi-Sheet University Excel Export Mutation
    const exportExcelMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/admin/export-excel?multiSheet=true", {
                method: "POST",
                credentials: "include"
            });
            if (!res.ok) throw new Error("Excel export failed");
            return res.blob();
        },
        onSuccess: (blob) => {
            const safeDate = new Date().toISOString().split("T")[0];
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `IU-APMP_University_Report_${safeDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast({
                title: "University Excel Report Downloaded",
                description: "Multi-sheet official university workbook (.xlsx) downloaded with all 8 worksheets.",
            });
        },
        onError: (error) => {
            toast({
                title: "Excel Export Failed",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    // Reset Mutation
    const resetMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/admin/reset", { password: adminPassword });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || "Reset failed");
            }
        },
        onSuccess: () => {
            setResetDialogOpen(false);
            setAdminPassword("");
            queryClient.clear();
            toast({
                title: "System Reset Successful",
                description: "Database reset. Please log in with default credentials (admin / Admin@123).",
            });
            setLocation("/auth");
        },
        onError: (error) => {
            toast({
                title: "Reset Failed",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    return (
        <MainLayout>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground mb-1">System Management</h1>
                <p className="text-muted-foreground">Manage IU-APMP database backups, institutional exports, and system maintenance.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl">
                {/* A-Z Backup & Export Card */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Archive className="h-6 w-6 text-primary" />
                            <CardTitle>A-Z Backup & Export</CardTitle>
                        </div>
                        <CardDescription>Export complete portal state (all 8 tables, grades, milestones, logs) into a ZIP archive.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Generates an all-inclusive backup package (.zip) containing per-table JSONs, full snapshot, manifest, and SQL recovery script. A timestamped copy is auto-retained in <code className="bg-muted px-1 py-0.5 rounded text-xs">database/backups/</code>.
                        </p>
                        <Button className="w-full gap-2" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
                            <Download className="h-4 w-4" />
                            {exportMutation.isPending ? "Generating Archive..." : "Backup & Export Portal (.zip)"}
                        </Button>
                    </CardContent>
                </Card>

                {/* University Excel Report Card */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <FileDown className="h-6 w-6 text-primary" />
                            <CardTitle>University Excel Report</CardTitle>
                        </div>
                        <CardDescription>Official 8-sheet Excel workbook for university administrative use.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Exports a formatted 8-sheet master workbook (.xlsx) with Overview KPIs, Student Details, Faculty Supervisors, Teams, Topics Catalog, Allocations, Assessments, and Milestones.
                        </p>
                        <Button className="w-full gap-2" variant="secondary" onClick={() => exportExcelMutation.mutate()} disabled={exportExcelMutation.isPending}>
                            <FileDown className="h-4 w-4" />
                            {exportExcelMutation.isPending ? "Generating Report..." : "Export University Excel (.xlsx)"}
                        </Button>
                    </CardContent>
                </Card>

                {/* Import/Restore Data Card */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Upload className="h-6 w-6 text-primary" />
                            <CardTitle>Portal Import & Restore</CardTitle>
                        </div>
                        <CardDescription>Restore system from a ZIP or JSON backup replicating original state exactly.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Restores database in topological dependency order (resolving foreign keys), re-syncs sequences, and auto-generates a safety snapshot of the live database before applying.
                        </p>
                        <Dialog open={importDialogOpen} onOpenChange={(open) => {
                            if (isImporting) return;
                            setImportDialogOpen(open);
                            if (!open) {
                                setSelectedFile(null);
                                setPreview(null);
                                setImportError(null);
                                setImportSuccess(false);
                                setImportProgress(null);
                                setImportLogs([]);
                            }
                        }}>
                            <DialogTrigger asChild>
                                <Button className="w-full gap-2" variant="secondary">
                                    <Upload className="h-4 w-4" />
                                    Import & Restore Portal
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-xl">
                                {isImporting ? (
                                    <div className="space-y-4 py-2">
                                        <DialogHeader>
                                            <DialogTitle className="flex items-center gap-2">
                                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                                Restoring Portal Database...
                                            </DialogTitle>
                                            <DialogDescription>
                                                Topological dependency restoration in progress. Please do not close this window.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="space-y-3 pt-2">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="font-semibold text-foreground">
                                                    {importProgress?.message || "Processing backup payload..."}
                                                </span>
                                                <span className="font-mono text-xs font-bold text-primary">
                                                    {importProgress?.percent || 0}%
                                                </span>
                                            </div>

                                            <Progress value={importProgress?.percent || 5} className="h-2.5 w-full" />

                                            {importProgress?.detail && (
                                                <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 font-mono">
                                                    {importProgress.detail}
                                                </p>
                                            )}

                                            <div className="rounded-lg border bg-black/90 text-emerald-400 font-mono text-xs overflow-hidden mt-3 shadow-inner">
                                                <div 
                                                    className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 cursor-pointer select-none"
                                                    onClick={() => setShowLogs(!showLogs)}
                                                >
                                                    <span className="flex items-center gap-2 text-zinc-300">
                                                        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                                                        Live Restore Stream ({importLogs.length} events)
                                                    </span>
                                                    <span className="text-zinc-400 text-[10px]">
                                                        {showLogs ? "Hide Logs ▲" : "Show Logs ▼"}
                                                    </span>
                                                </div>
                                                {showLogs && (
                                                    <div 
                                                        ref={logContainerRef}
                                                        className="p-3 max-h-48 overflow-y-auto space-y-1 text-[11px] leading-relaxed scrollbar-thin"
                                                    >
                                                        {importLogs.map((log, idx) => (
                                                            <div key={idx} className="flex gap-2">
                                                                <span className="text-zinc-500 shrink-0">[{log.time}]</span>
                                                                <span className={log.stage === "error" ? "text-red-400 font-bold" : log.stage === "complete" ? "text-green-300 font-bold" : "text-emerald-300"}>
                                                                    {log.text}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <DialogFooter className="pt-2">
                                            <p className="text-xs text-muted-foreground mr-auto flex items-center gap-1.5">
                                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                                                Live database protected by pre-restore snapshot
                                            </p>
                                            <Button disabled variant="outline" size="sm">
                                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                                Restoring...
                                            </Button>
                                        </DialogFooter>
                                    </div>
                                ) : importError ? (
                                    <div className="space-y-4 py-2">
                                        <DialogHeader>
                                            <DialogTitle className="flex items-center gap-2 text-destructive">
                                                <AlertTriangle className="h-5 w-5" />
                                                Portal Restore Failed
                                            </DialogTitle>
                                            <DialogDescription>
                                                The import process encountered an issue and was safely rolled back.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 space-y-2 text-sm text-destructive">
                                            <p className="font-semibold text-xs uppercase tracking-wide">Error Details:</p>
                                            <p className="font-mono text-xs bg-background/80 p-2.5 rounded border border-destructive/20 text-foreground break-words">
                                                {importError}
                                            </p>
                                        </div>

                                        <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                                            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                                            <span>
                                                <strong>Zero-Data-Loss Safety Confirmed:</strong> Your database was not corrupted. All existing tables remain intact, and any safety snapshots created are retained in <code className="bg-emerald-500/20 px-1 py-0.5 rounded">database/backups/</code>.
                                            </span>
                                        </div>

                                        {importLogs.length > 0 && (
                                            <div className="rounded-lg border bg-black/90 text-xs font-mono overflow-hidden">
                                                <div 
                                                    className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 cursor-pointer text-zinc-300"
                                                    onClick={() => setShowLogs(!showLogs)}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Terminal className="h-3.5 w-3.5 text-red-400" />
                                                        Diagnostic Log ({importLogs.length} events)
                                                    </span>
                                                    <span className="text-[10px] text-zinc-400">
                                                        {showLogs ? "Hide ▲" : "View Trace ▼"}
                                                    </span>
                                                </div>
                                                {showLogs && (
                                                    <div className="p-3 max-h-40 overflow-y-auto space-y-1 text-[11px] text-zinc-300">
                                                        {importLogs.map((log, idx) => (
                                                            <div key={idx} className="flex gap-2">
                                                                <span className="text-zinc-500 shrink-0">[{log.time}]</span>
                                                                <span className={log.stage === "error" ? "text-red-400 font-bold" : "text-zinc-400"}>
                                                                    {log.text}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <DialogFooter className="gap-2 sm:gap-0">
                                            <Button 
                                                variant="outline" 
                                                onClick={() => {
                                                    setImportError(null);
                                                    setImportDialogOpen(false);
                                                }}
                                            >
                                                Close
                                            </Button>
                                            <Button 
                                                onClick={() => {
                                                    setImportError(null);
                                                    setSelectedFile(null);
                                                    setPreview(null);
                                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                                }}
                                            >
                                                Select Another File
                                            </Button>
                                        </DialogFooter>
                                    </div>
                                ) : importSuccess ? (
                                    <div className="space-y-4 py-2">
                                        <DialogHeader>
                                            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-5 w-5" />
                                                Portal Restored Successfully!
                                            </DialogTitle>
                                            <DialogDescription>
                                                All portal records, relationships, and sequences have been fully restored.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 text-sm text-emerald-800 dark:text-emerald-200">
                                            <div className="flex items-center gap-2 font-medium">
                                                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                                Topological Integrity & Sequences Verified
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                All foreign-key constraints resolved, ID sequence auto-increments updated, and current administrator session maintained.
                                            </p>
                                        </div>

                                        {importLogs.length > 0 && (
                                            <div className="rounded-lg border bg-black/90 text-xs font-mono overflow-hidden">
                                                <div 
                                                    className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 cursor-pointer text-zinc-300"
                                                    onClick={() => setShowLogs(!showLogs)}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                                                        Restore Summary ({importLogs.length} events)
                                                    </span>
                                                    <span className="text-[10px] text-zinc-400">
                                                        {showLogs ? "Hide ▲" : "View Logs ▼"}
                                                    </span>
                                                </div>
                                                {showLogs && (
                                                    <div className="p-3 max-h-40 overflow-y-auto space-y-1 text-[11px] text-emerald-300">
                                                        {importLogs.map((log, idx) => (
                                                            <div key={idx} className="flex gap-2">
                                                                <span className="text-zinc-500 shrink-0">[{log.time}]</span>
                                                                <span>{log.text}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <DialogFooter>
                                            <Button 
                                                className="w-full"
                                                onClick={() => {
                                                    setImportDialogOpen(false);
                                                    setImportSuccess(false);
                                                    setSelectedFile(null);
                                                    setPreview(null);
                                                    window.location.reload();
                                                }}
                                            >
                                                Done & Refresh Portal
                                            </Button>
                                        </DialogFooter>
                                    </div>
                                ) : (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle>Confirm Portal Import & Restore</DialogTitle>
                                            <DialogDescription>
                                                Select an official IU-APMP backup file (.zip or .json) to restore.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4 py-3">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Backup File (.zip or .json)</label>
                                                <Input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    aria-label="Backup file"
                                                    accept=".zip,.json"
                                                    onChange={handleFileChange}
                                                />
                                                {isInspecting && (
                                                    <p className="text-xs text-muted-foreground animate-pulse">
                                                        Inspecting backup manifest and structure...
                                                    </p>
                                                )}
                                            </div>

                                            {preview && (
                                                <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-sm">
                                                    <div className="flex items-center justify-between font-medium">
                                                        <span className="flex items-center gap-1.5 text-primary">
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            {preview.portalName || "IU-APMP Backup"}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">{preview.fileSizeKB}</span>
                                                    </div>
                                                    {preview.timestamp && (
                                                        <p className="text-xs text-muted-foreground">
                                                            Created: {preview.timestamp} {preview.version && `(v${preview.version})`}
                                                        </p>
                                                    )}
                                                    {preview.recordCounts && (
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                                                            <div className="rounded bg-background p-1.5 border text-center">
                                                                <div className="font-semibold text-foreground">{preview.recordCounts.users ?? "—"}</div>
                                                                <div className="text-muted-foreground">Users</div>
                                                            </div>
                                                            <div className="rounded bg-background p-1.5 border text-center">
                                                                <div className="font-semibold text-foreground">{preview.recordCounts.studentGroups ?? "—"}</div>
                                                                <div className="text-muted-foreground">Teams</div>
                                                            </div>
                                                            <div className="rounded bg-background p-1.5 border text-center">
                                                                <div className="font-semibold text-foreground">{preview.recordCounts.projectTopics ?? "—"}</div>
                                                                <div className="text-muted-foreground">Topics</div>
                                                            </div>
                                                            <div className="rounded bg-background p-1.5 border text-center">
                                                                <div className="font-semibold text-foreground">{preview.recordCounts.studentProjects ?? "—"}</div>
                                                                <div className="text-muted-foreground">Projects</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                                                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                                                <span>
                                                    <strong>Zero-Data-Loss Safety:</strong> An automatic pre-restore safety snapshot of the live database will be created in <code className="bg-emerald-500/20 px-1 py-0.5 rounded">database/backups/</code> before restoring, ensuring immediate recovery if needed.
                                                </span>
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
                                            <Button
                                                onClick={handleRestore}
                                                disabled={!selectedFile || isInspecting}
                                            >
                                                Confirm & Restore
                                            </Button>
                                        </DialogFooter>
                                    </>
                                )}
                            </DialogContent>
                        </Dialog>
                    </CardContent>
                </Card>

                {/* Reset Database Card */}
                <Card className="border-destructive/50">
                    <CardHeader>
                        <div className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-6 w-6" />
                            <CardTitle>System Reset</CardTitle>
                        </div>
                        <CardDescription>Reset the entire system to its initial state.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Warning: This action is irreversible. All data (students, projects, history) will be wiped. Only the admin account will remain.
                        </p>
                        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="destructive"
                                    className="w-full gap-2"
                                    onClick={() => toast({
                                        title: "Export your data first",
                                        description: "Reset is instant and irreversible. Click 'Backup & Export' before proceeding if you want an archive of current records.",
                                        variant: "destructive",
                                    })}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Reset Database
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Confirm System Reset</DialogTitle>
                                    <DialogDescription>
                                        This action cannot be undone. Please enter your admin password to confirm.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    Tip: If you haven't already, cancel and run <span className="font-semibold">Backup & Export Portal</span> first —
                                    the reset wipes everything instantly and gives you no way back.
                                </div>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Admin Password</label>
                                        <Input
                                            type="password"
                                            placeholder="Enter password"
                                            aria-label="Admin Password"
                                            value={adminPassword}
                                            onChange={(e) => setAdminPassword(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancel</Button>
                                    <Button
                                        variant="destructive"
                                        onClick={() => resetMutation.mutate()}
                                        disabled={!adminPassword || resetMutation.isPending}
                                    >
                                        {resetMutation.isPending ? "Resetting..." : "Confirm Reset"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardContent>
                </Card>
            </div>
        </MainLayout>
    );
}
