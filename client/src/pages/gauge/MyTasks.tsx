/**
 * Gauge — My Tasks
 * Personal task tracker with Standard and Custom template modes.
 * Standard: predefined columns (Task Name, Start Date, End Date, Priority, Status, Doc Links, Notes)
 * Custom: user-defined columns with types (text, number, boolean, date, dropdown)
 * Shareable: owner can share with specific @gofynd.com email IDs
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useGaugeUser } from "@/contexts/GaugeUserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Share2,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Link as LinkIcon,
  X,
  Check,
  Loader2,
  ClipboardList,
  Layers,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────

type ColumnType = "text" | "number" | "boolean" | "date" | "dropdown";

interface ColumnDef {
  name: string;
  type: ColumnType;
  options?: string[];
  required?: boolean;
}

interface Template {
  id: number;
  name: string;
  type: "standard" | "custom";
  columns: string; // JSON
  ownerEmail: string;
  isOwner: boolean;
  sharedPermission: "view" | "edit";
  createdAt: Date;
}

interface Task {
  id: number;
  templateId: number;
  ownerEmail: string;
  data: string; // JSON
  status: string;
  position: number;
  createdAt: Date;
}

// ── Status colour map ────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-gray-100 text-gray-700",
  "In Progress": "bg-blue-100 text-blue-700",
  "Done": "bg-green-100 text-green-700",
  "Blocked": "bg-red-100 text-red-700",
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  Low: "bg-gray-100 text-gray-600",
  Medium: "bg-yellow-100 text-yellow-700",
  High: "bg-orange-100 text-orange-700",
  Critical: "bg-red-100 text-red-700",
};

// ── Main component ────────────────────────────────────────────────────────

export default function MyTasks() {
  const { gaugeUser } = useGaugeUser();
  const email = gaugeUser?.email ?? "";

  const [activeTab, setActiveTab] = useState<"standard" | "custom">("standard");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────

  const { data: allTemplates = [], isLoading: templatesLoading } = trpc.gaugeTasks.getTemplates.useQuery(
    { callerEmail: email },
    { enabled: !!email },
  );

  const templates = useMemo(
    () => allTemplates.filter((t) => t.type === activeTab),
    [allTemplates, activeTab],
  );

  const activeTemplate = useMemo(
    () => allTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [allTemplates, selectedTemplateId],
  );

  const columns: ColumnDef[] = useMemo(() => {
    if (!activeTemplate) return [];
    try { return JSON.parse(activeTemplate.columns); } catch { return []; }
  }, [activeTemplate]);

  const { data: tasks = [], isLoading: tasksLoading } = trpc.gaugeTasks.getTasks.useQuery(
    { callerEmail: email, templateId: selectedTemplateId! },
    { enabled: !!email && selectedTemplateId !== null },
  );

  // ── Mutations ─────────────────────────────────────────────────────────

  const createTemplate = trpc.gaugeTasks.createTemplate.useMutation({
    onSuccess: () => {
      utils.gaugeTasks.getTemplates.invalidate();
      setShowNewTemplate(false);
      setShowCustomBuilder(false);

    },
  });

  const deleteTemplate = trpc.gaugeTasks.deleteTemplate.useMutation({
    onSuccess: () => {
      utils.gaugeTasks.getTemplates.invalidate();
      setSelectedTemplateId(null);

    },
  });

  const createTask = trpc.gaugeTasks.createTask.useMutation({
    onSuccess: () => {
      utils.gaugeTasks.getTasks.invalidate();
      setShowNewTask(false);
      setEditingTask(null);

    },
  });

  const updateTask = trpc.gaugeTasks.updateTask.useMutation({
    onSuccess: () => {
      utils.gaugeTasks.getTasks.invalidate();
      setEditingTask(null);

    },
  });

  const deleteTask = trpc.gaugeTasks.deleteTask.useMutation({
    onSuccess: () => utils.gaugeTasks.getTasks.invalidate(),
  });

  const shareTemplate = trpc.gaugeTasks.shareTemplate.useMutation({
    onSuccess: () => {
      utils.gaugeTasks.getTemplates.invalidate();

    },
  });

  // ── Auto-select first template on tab switch ──────────────────────────

  const handleTabChange = (tab: "standard" | "custom") => {
    setActiveTab(tab);
    setSelectedTemplateId(null);
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 bg-white">
      {/* Left: template list */}
      <div className="w-56 border-r border-gray-200 flex flex-col shrink-0">
        {/* Tab switcher */}
        <div className="p-3 border-b border-gray-200">
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => handleTabChange("standard")}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${
                activeTab === "standard" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => handleTabChange("custom")}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${
                activeTab === "custom" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto py-2">
          {templatesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : templates.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-gray-400">No {activeTab} trackers yet</p>
            </div>
          ) : (
            templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplateId(t.id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                  selectedTemplateId === t.id
                    ? "bg-gray-900 text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {activeTab === "standard" ? (
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="truncate">{t.name}</span>
                {!t.isOwner && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto shrink-0">shared</Badge>
                )}
              </button>
            ))
          )}
        </div>

        {/* New tracker button */}
        <div className="p-3 border-t border-gray-200">
          <Button
            size="sm"
            className="w-full bg-gray-900 hover:bg-gray-800 text-white text-xs"
            onClick={() => {
              if (activeTab === "standard") setShowNewTemplate(true);
              else setShowCustomBuilder(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Tracker
          </Button>
        </div>
      </div>

      {/* Right: task table */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedTemplateId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
              <ClipboardList className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Select a tracker</p>
            <p className="text-xs text-gray-400">
              {activeTab === "standard"
                ? "Choose a standard tracker from the left, or create a new one."
                : "Choose a custom tracker from the left, or build your own."}
            </p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">{activeTemplate?.name}</h2>
                {activeTemplate && !activeTemplate.isOwner && (
                  <Badge variant="outline" className="text-[10px]">shared</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeTemplate?.isOwner && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 gap-1"
                      onClick={() => setShowShare(true)}
                    >
                      <Share2 className="w-3 h-3" />
                      Share
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        if (confirm("Delete this tracker and all its tasks?")) {
                          deleteTemplate.mutate({ callerEmail: email, templateId: selectedTemplateId });
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  className="bg-gray-900 hover:bg-gray-800 text-white text-xs h-7 gap-1"
                  onClick={() => setShowNewTask(true)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Task
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {tasksLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ClipboardList className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">No tasks yet</p>
                  <p className="text-xs text-gray-400 mt-1">Click "Add Task" to get started</p>
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 w-8">#</th>
                      {columns.map((col) => (
                        <th key={col.name} className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">
                          {col.name}
                        </th>
                      ))}
                      <th className="w-16 px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task, idx) => {
                      let data: Record<string, unknown> = {};
                      try { data = JSON.parse(task.data); } catch {}
                      return (
                        <tr
                          key={task.id}
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setEditingTask(task)}
                        >
                          <td className="px-4 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                          {columns.map((col) => (
                            <td key={col.name} className="px-4 py-2.5 max-w-[200px]">
                              <CellValue col={col} value={data[col.name]} />
                            </td>
                          ))}
                          <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditingTask(task)}>
                                  <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => deleteTask.mutate({ callerEmail: email, taskId: task.id })}
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Dialogs ── */}

      {/* New Standard Tracker */}
      <NewStandardTrackerDialog
        open={showNewTemplate}
        onClose={() => setShowNewTemplate(false)}
        onSubmit={(name) => createTemplate.mutate({ callerEmail: email, name, type: "standard" })}
        loading={createTemplate.isPending}
      />

      {/* Custom Template Builder */}
      <CustomTemplateBuilder
        open={showCustomBuilder}
        onClose={() => setShowCustomBuilder(false)}
        onSubmit={(name, cols) => createTemplate.mutate({ callerEmail: email, name, type: "custom", columns: cols })}
        loading={createTemplate.isPending}
      />

      {/* New / Edit Task */}
      {(showNewTask || editingTask) && activeTemplate && (
        <TaskFormDialog
          open={showNewTask || !!editingTask}
          onClose={() => { setShowNewTask(false); setEditingTask(null); }}
          columns={columns}
          initialData={editingTask ? (() => { try { return JSON.parse(editingTask.data); } catch { return {}; } })() : {}}
          onSubmit={(data) => {
            if (editingTask) {
              updateTask.mutate({ callerEmail: email, taskId: editingTask.id, data });
            } else {
              createTask.mutate({ callerEmail: email, templateId: selectedTemplateId!, data });
            }
          }}
          loading={createTask.isPending || updateTask.isPending}
          isEdit={!!editingTask}
        />
      )}

      {/* Share Dialog */}
      {showShare && activeTemplate && (
        <ShareDialog
          open={showShare}
          onClose={() => setShowShare(false)}
          templateId={selectedTemplateId!}
          callerEmail={email}
          onShare={(sharedWith, permission) =>
            shareTemplate.mutate({ callerEmail: email, templateId: selectedTemplateId!, sharedWithEmail: sharedWith, permission })
          }
          loading={shareTemplate.isPending}
        />
      )}
    </div>
  );
}

// ── Cell renderer ─────────────────────────────────────────────────────────

function CellValue({ col, value }: { col: ColumnDef; value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  if (col.type === "boolean") {
    return value ? (
      <Check className="w-4 h-4 text-green-500" />
    ) : (
      <X className="w-4 h-4 text-gray-300" />
    );
  }
  if (col.type === "date") {
    const d = new Date(value as string);
    return <span className="text-xs text-gray-700">{isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()}</span>;
  }
  if (col.name === "Status") {
    const cls = STATUS_COLORS[String(value)] ?? "bg-gray-100 text-gray-600";
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>{String(value)}</span>;
  }
  if (col.name === "Priority") {
    const cls = PRIORITY_COLORS[String(value)] ?? "bg-gray-100 text-gray-600";
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>{String(value)}</span>;
  }
  if (col.type === "dropdown") {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">{String(value)}</span>;
  }
  if (col.name === "Doc Links" || (typeof value === "string" && value.startsWith("http"))) {
    return (
      <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs truncate block max-w-[180px]" onClick={(e) => e.stopPropagation()}>
        <LinkIcon className="w-3 h-3 inline mr-1" />{String(value).replace(/^https?:\/\//, "").slice(0, 40)}
      </a>
    );
  }
  return <span className="text-xs text-gray-700 truncate block max-w-[200px]">{String(value)}</span>;
}

// ── New Standard Tracker Dialog ───────────────────────────────────────────

function NewStandardTrackerDialog({ open, onClose, onSubmit, loading }: {
  open: boolean; onClose: () => void;
  onSubmit: (name: string) => void; loading: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm bg-white text-gray-900">
        <DialogHeader><DialogTitle className="text-gray-900">New Standard Tracker</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-500">Standard trackers include predefined columns: Task Name, Start Date, End Date, Priority, Status, Doc Links, Notes.</p>
          <Input placeholder="Tracker name (e.g. Sprint Tasks)" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gray-900 text-white hover:bg-gray-800" disabled={!name.trim() || loading} onClick={() => onSubmit(name.trim())}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Custom Template Builder ───────────────────────────────────────────────

function CustomTemplateBuilder({ open, onClose, onSubmit, loading }: {
  open: boolean; onClose: () => void;
  onSubmit: (name: string, cols: ColumnDef[]) => void; loading: boolean;
}) {
  const [name, setName] = useState("");
  const [cols, setCols] = useState<ColumnDef[]>([{ name: "", type: "text" }]);
  const [dropdownInput, setDropdownInput] = useState<Record<number, string>>({});

  const addCol = () => setCols((c) => [...c, { name: "", type: "text" }]);
  const removeCol = (i: number) => setCols((c) => c.filter((_, idx) => idx !== i));
  const updateCol = (i: number, patch: Partial<ColumnDef>) =>
    setCols((c) => c.map((col, idx) => (idx === i ? { ...col, ...patch } : col)));

  const valid = name.trim() && cols.every((c) => c.name.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto bg-white text-gray-900">
        <DialogHeader><DialogTitle>Build Custom Tracker</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <Input placeholder="Tracker name" value={name} onChange={(e) => setName(e.target.value)} />

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Columns</p>
            {cols.map((col, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  className="flex-1 text-sm h-8"
                  placeholder="Column name"
                  value={col.name}
                  onChange={(e) => updateCol(i, { name: e.target.value })}
                />
                <Select value={col.type} onValueChange={(v) => updateCol(i, { type: v as ColumnType, options: undefined })}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="boolean">Boolean</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="dropdown">Dropdown</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeCol(i)}>
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </Button>
              </div>
            ))}
            {/* Dropdown options input */}
            {cols.map((col, i) => col.type === "dropdown" && (
              <div key={`opts-${i}`} className="ml-2 pl-2 border-l-2 border-gray-200">
                <p className="text-[11px] text-gray-500 mb-1">Options for "{col.name}" (comma-separated)</p>
                <Input
                  className="text-xs h-7"
                  placeholder="e.g. Low, Medium, High"
                  value={dropdownInput[i] ?? (col.options?.join(", ") ?? "")}
                  onChange={(e) => {
                    setDropdownInput((d) => ({ ...d, [i]: e.target.value }));
                    updateCol(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) });
                  }}
                />
              </div>
            ))}
            <Button variant="outline" size="sm" className="text-xs" onClick={addCol}>
              <Plus className="w-3 h-3 mr-1" /> Add Column
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gray-900 text-white hover:bg-gray-800" disabled={!valid || loading} onClick={() => onSubmit(name.trim(), cols)}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Tracker"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Task Form Dialog ──────────────────────────────────────────────────────

function TaskFormDialog({ open, onClose, columns, initialData, onSubmit, loading, isEdit }: {
  open: boolean; onClose: () => void;
  columns: ColumnDef[];
  initialData: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => void;
  loading: boolean;
  isEdit: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>(initialData);

  const set = (key: string, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto bg-white text-gray-900">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Task" : "Add Task"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {columns.map((col) => (
            <div key={col.name}>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {col.name}{col.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <FieldInput col={col} value={form[col.name]} onChange={(v) => set(col.name, v)} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gray-900 text-white hover:bg-gray-800" disabled={loading} onClick={() => onSubmit(form)}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldInput({ col, value, onChange }: { col: ColumnDef; value: unknown; onChange: (v: unknown) => void }) {
  if (col.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-gray-900" />
        <span className="text-xs text-gray-600">{value ? "Yes" : "No"}</span>
      </div>
    );
  }
  if (col.type === "date") {
    return (
      <Input
        type="date"
        className="text-sm h-8"
        value={value ? String(value) : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (col.type === "number") {
    return (
      <Input
        type="number"
        className="text-sm h-8"
        value={value !== undefined ? String(value) : ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    );
  }
  if (col.type === "dropdown" && col.options?.length) {
    return (
      <Select value={String(value ?? "")} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {col.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      className="text-sm h-8"
      placeholder={col.name}
      value={value !== undefined ? String(value) : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ── Share Dialog ──────────────────────────────────────────────────────────

function ShareDialog({ open, onClose, templateId, callerEmail, onShare, loading }: {
  open: boolean; onClose: () => void;
  templateId: number; callerEmail: string;
  onShare: (email: string, permission: "view" | "edit") => void;
  loading: boolean;
}) {
  const [shareEmail, setShareEmail] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("view");

  const { data: shares = [] } = trpc.gaugeTasks.getShares.useQuery(
    { callerEmail, templateId },
    { enabled: open },
  );

  const removeShare = trpc.gaugeTasks.removeShare.useMutation({
    onSuccess: () => trpc.useUtils().gaugeTasks.getShares.invalidate(),
  });

  const utils = trpc.useUtils();
  const handleRemove = (email: string) => {
    removeShare.mutate({ callerEmail, templateId, sharedWithEmail: email });
    utils.gaugeTasks.getShares.invalidate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm bg-white text-gray-900">
        <DialogHeader><DialogTitle className="text-gray-900">Share Tracker</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-gray-500">Share this tracker with other @gofynd.com users.</p>
          <div className="flex gap-2">
            <Input
              className="flex-1 text-sm h-8"
              placeholder="name@gofynd.com"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
            />
            <Select value={permission} onValueChange={(v) => setPermission(v as "view" | "edit")}>
              <SelectTrigger className="w-20 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="edit">Edit</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="bg-gray-900 text-white hover:bg-gray-800 h-8 text-xs"
              disabled={!shareEmail.includes("@gofynd.com") || loading}
              onClick={() => { onShare(shareEmail.trim(), permission); setShareEmail(""); }}
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Share"}
            </Button>
          </div>

          {shares.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-600">Shared with</p>
              {shares.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-gray-50">
                  <span className="text-xs text-gray-700">{s.sharedWithEmail}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{s.permission}</Badge>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemove(s.sharedWithEmail)}>
                      <X className="w-3 h-3 text-gray-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
