/**
 * Gauge — Calendar
 * Full calendar view (month/week) with meeting CRUD.
 * Features: create/edit meetings, MOM notes, attendees, doc links, Slack DM notifications.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useGaugeUser } from "@/contexts/GaugeUserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Trash2,
  Link as LinkIcon,
  X,
  Video,
  Users,
  FileText,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────

interface Attendee { email: string; name: string; }
interface DocLink { label: string; url: string; }

interface Meeting {
  id: number;
  ownerEmail: string;
  title: string;
  startAt: number;
  endAt: number;
  location: string | null;
  googleMeetLink: string | null;
  description: string | null;
  momNotes: string | null;
  attendees: string | null;
  docLinks: string | null;
  createdAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function startOfMonth(y: number, m: number) { return new Date(y, m, 1); }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function toLocalDateInput(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function toLocalTimeInput(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function combineDateTimeToMs(dateStr: string, timeStr: string) {
  return new Date(`${dateStr}T${timeStr}`).getTime();
}

// ── Main Component ────────────────────────────────────────────────────────

export default function GaugeCalendar() {
  const { gaugeUser } = useGaugeUser();
  const email = gaugeUser?.email ?? "";

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState<"month" | "week">("month");
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createDate, setCreateDate] = useState<Date | null>(null);

  const utils = trpc.useUtils();

  // Date range for query
  const from = useMemo(() => new Date(year, month, 1).getTime(), [year, month]);
  const to = useMemo(() => new Date(year, month + 1, 0, 23, 59, 59).getTime(), [year, month]);

  const { data: meetings = [], isLoading } = trpc.gaugeMeetings.getMeetings.useQuery(
    { callerEmail: email, from, to },
    { enabled: !!email },
  );

  const deleteMeeting = trpc.gaugeMeetings.deleteMeeting.useMutation({
    onSuccess: () => {
      utils.gaugeMeetings.getMeetings.invalidate();
      setSelectedMeeting(null);
    },
  });

  // Group meetings by date string "YYYY-MM-DD"
  const meetingsByDate = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    for (const m of meetings) {
      const key = toLocalDateInput(m.startAt);
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    return map;
  }, [meetings]);

  // Navigate
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // Build calendar grid
  const firstDay = startOfMonth(year, month).getDay();
  const totalDays = daysInMonth(year, month);
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = toLocalDateInput(today.getTime());

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <h2 className="text-sm font-semibold text-gray-900 w-40 text-center">
            {MONTHS[month]} {year}
          </h2>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-100">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded px-2 py-0.5"
          >
            Today
          </button>
        </div>
        <Button
          size="sm"
          className="bg-gray-900 hover:bg-gray-800 text-white text-xs h-7 gap-1"
          onClick={() => { setCreateDate(today); setShowCreate(true); }}
        >
          <Plus className="w-3.5 h-3.5" /> New Meeting
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-auto" style={{ background: "#f0f0f0", padding: "4px" }}>
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} style={{ borderRadius: "10px", margin: "3px", background: "rgba(255,255,255,0.3)" }} />;
            }
            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayMeetings = meetingsByDate[dateKey] ?? [];
            const isToday = dateKey === todayKey;

            return (
              <div
                key={dateKey}
                className="p-1.5 min-h-[80px] cursor-pointer transition-all duration-150"
                style={{
                  background: isToday ? "#fafafa" : "#fff",
                  borderRadius: "10px",
                  margin: "3px",
                  boxShadow: isToday
                    ? "0 4px 14px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)"
                    : "0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)",
                  border: isToday ? "1.5px solid #302B2B" : "1px solid rgba(0,0,0,0.06)",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = isToday
                    ? "0 4px 14px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)"
                    : "0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)";
                  (e.currentTarget as HTMLDivElement).style.transform = "none";
                }}
                onClick={() => {
                  const d = new Date(year, month, day);
                  setCreateDate(d);
                  setShowCreate(true);
                }}
              >
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? "bg-gray-900 text-white" : "text-gray-600"
                }`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayMeetings.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="text-[10px] bg-gray-900 text-white rounded px-1.5 py-0.5 truncate cursor-pointer hover:bg-gray-700"
                      onClick={(e) => { e.stopPropagation(); setSelectedMeeting(m); }}
                    >
                      {formatTime(m.startAt)} {m.title}
                    </div>
                  ))}
                  {dayMeetings.length > 3 && (
                    <div className="text-[10px] text-gray-400 pl-1">+{dayMeetings.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Meeting Detail Modal */}
      {selectedMeeting && (
        <MeetingDetailModal
          meeting={selectedMeeting}
          callerEmail={email}
          onClose={() => setSelectedMeeting(null)}
          onDeleted={() => {
            deleteMeeting.mutate({ callerEmail: email, meetingId: selectedMeeting.id });
          }}
          onUpdated={() => {
            utils.gaugeMeetings.getMeetings.invalidate();
            setSelectedMeeting(null);
          }}
        />
      )}

      {/* Create Meeting Modal */}
      {showCreate && (
        <MeetingFormModal
          callerEmail={email}
          initialDate={createDate ?? today}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            utils.gaugeMeetings.getMeetings.invalidate();
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

// ── Meeting Detail Modal ──────────────────────────────────────────────────

function MeetingDetailModal({ meeting, callerEmail, onClose, onDeleted, onUpdated }: {
  meeting: Meeting;
  callerEmail: string;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [momNotes, setMomNotes] = useState(meeting.momNotes ?? "");
  const [saving, setSaving] = useState(false);

  const attendees: Attendee[] = useMemo(() => { try { return JSON.parse(meeting.attendees ?? "[]"); } catch { return []; } }, [meeting.attendees]);
  const docLinks: DocLink[] = useMemo(() => { try { return JSON.parse(meeting.docLinks ?? "[]"); } catch { return []; } }, [meeting.docLinks]);

  const updateMeeting = trpc.gaugeMeetings.updateMeeting.useMutation({
    onSuccess: onUpdated,
  });

  const saveMom = async () => {
    setSaving(true);
    await updateMeeting.mutateAsync({ callerEmail, meetingId: meeting.id, momNotes });
    setSaving(false);
  };

  if (editMode) {
    return (
      <MeetingFormModal
        callerEmail={callerEmail}
        initialDate={new Date(meeting.startAt)}
        existingMeeting={meeting}
        onClose={() => setEditMode(false)}
        onCreated={onUpdated}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-white text-gray-900">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-base leading-tight">{meeting.title}</DialogTitle>
            {meeting.ownerEmail === callerEmail && (
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditMode(true)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-red-600 hover:text-red-700"
                  onClick={onDeleted}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Time */}
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Clock className="w-4 h-4 text-gray-400 shrink-0" />
            <span>{formatDate(meeting.startAt)}, {formatTime(meeting.startAt)} – {formatTime(meeting.endAt)}</span>
          </div>

          {/* Location / Meet link */}
          {meeting.googleMeetLink && (
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-gray-400 shrink-0" />
              <a href={meeting.googleMeetLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate">
                {meeting.googleMeetLink}
              </a>
            </div>
          )}
          {meeting.location && !meeting.googleMeetLink && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-gray-400">📍</span>
              {meeting.location}
            </div>
          )}

          {/* Description */}
          {meeting.description && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{meeting.description}</p>
            </div>
          )}

          {/* Attendees */}
          {attendees.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-medium text-gray-500">Attendees ({attendees.length})</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {attendees.map((a) => (
                  <Badge key={a.email} variant="outline" className="text-xs">
                    {a.name || a.email}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Doc links */}
          {docLinks.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-medium text-gray-500">Documents</p>
              </div>
              <div className="space-y-1">
                {docLinks.map((d, i) => (
                  <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                    <LinkIcon className="w-3 h-3" />
                    {d.label || d.url}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* MOM Notes */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs font-medium text-gray-500">Minutes of Meeting (MOM)</p>
            </div>
            <textarea
              className="w-full text-sm border border-gray-200 rounded-md p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 min-h-[100px]"
              placeholder="Add meeting notes, decisions, action items…"
              value={momNotes}
              onChange={(e) => setMomNotes(e.target.value)}
            />
            {momNotes !== (meeting.momNotes ?? "") && (
              <Button
                size="sm"
                className="mt-1.5 bg-gray-900 text-white hover:bg-gray-800 text-xs h-7"
                disabled={saving}
                onClick={saveMom}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Notes"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Meeting Form Modal (Create / Edit) ────────────────────────────────────

function MeetingFormModal({ callerEmail, initialDate, existingMeeting, onClose, onCreated }: {
  callerEmail: string;
  initialDate: Date;
  existingMeeting?: Meeting;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEdit = !!existingMeeting;

  const defaultDate = toLocalDateInput(existingMeeting?.startAt ?? initialDate.getTime());
  const defaultStartTime = existingMeeting ? toLocalTimeInput(existingMeeting.startAt) : "10:00";
  const defaultEndTime = existingMeeting ? toLocalTimeInput(existingMeeting.endAt) : "11:00";

  const [title, setTitle] = useState(existingMeeting?.title ?? "");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [location, setLocation] = useState(existingMeeting?.location ?? "");
  const [meetLink, setMeetLink] = useState(existingMeeting?.googleMeetLink ?? "");
  const [description, setDescription] = useState(existingMeeting?.description ?? "");
  const [attendees, setAttendees] = useState<Attendee[]>(() => {
    try { return JSON.parse(existingMeeting?.attendees ?? "[]"); } catch { return []; }
  });
  const [docLinks, setDocLinks] = useState<DocLink[]>(() => {
    try { return JSON.parse(existingMeeting?.docLinks ?? "[]"); } catch { return []; }
  });
  const [attendeeInput, setAttendeeInput] = useState("");
  const [docLabelInput, setDocLabelInput] = useState("");
  const [docUrlInput, setDocUrlInput] = useState("");

  const createMeeting = trpc.gaugeMeetings.createMeeting.useMutation({ onSuccess: onCreated });
  const updateMeeting = trpc.gaugeMeetings.updateMeeting.useMutation({ onSuccess: onCreated });

  const loading = createMeeting.isPending || updateMeeting.isPending;

  const addAttendee = () => {
    const e = attendeeInput.trim();
    if (e && !attendees.find((a) => a.email === e)) {
      setAttendees((prev) => [...prev, { email: e, name: "" }]);
      setAttendeeInput("");
    }
  };

  const addDocLink = () => {
    if (docUrlInput.trim()) {
      setDocLinks((prev) => [...prev, { label: docLabelInput.trim() || docUrlInput.trim(), url: docUrlInput.trim() }]);
      setDocLabelInput("");
      setDocUrlInput("");
    }
  };

  const handleSubmit = () => {
    const startAt = combineDateTimeToMs(date, startTime);
    const endAt = combineDateTimeToMs(date, endTime);
    if (isEdit && existingMeeting) {
      updateMeeting.mutate({
        callerEmail,
        meetingId: existingMeeting.id,
        title, startAt, endAt, location,
        googleMeetLink: meetLink,
        description, attendees, docLinks,
      });
    } else {
      createMeeting.mutate({
        callerEmail, title, startAt, endAt, location,
        googleMeetLink: meetLink,
        description, attendees, docLinks,
      });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-white text-gray-900">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Meeting" : "New Meeting"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Input placeholder="Meeting title *" value={title} onChange={(e) => setTitle(e.target.value)} />

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <label className="text-xs text-gray-500 block mb-1">Date</label>
              <Input type="date" className="text-sm h-8" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Start</label>
              <Input type="time" className="text-sm h-8" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">End</label>
              <Input type="time" className="text-sm h-8" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Input placeholder="Google Meet / Zoom link (optional)" value={meetLink} onChange={(e) => setMeetLink(e.target.value)} />

          <textarea
            className="w-full text-sm border border-gray-200 rounded-md p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 min-h-[70px]"
            placeholder="Description / agenda (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Attendees */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Attendees</label>
            <div className="flex gap-2">
              <Input
                className="flex-1 text-sm h-8"
                placeholder="name@gofynd.com"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAttendee()}
              />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addAttendee}>Add</Button>
            </div>
            {attendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {attendees.map((a) => (
                  <Badge key={a.email} variant="outline" className="text-xs gap-1">
                    {a.email}
                    <button onClick={() => setAttendees((prev) => prev.filter((x) => x.email !== a.email))}>
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Doc links */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Document Links</label>
            <div className="flex gap-2">
              <Input className="flex-1 text-sm h-8" placeholder="Label" value={docLabelInput} onChange={(e) => setDocLabelInput(e.target.value)} />
              <Input className="flex-1 text-sm h-8" placeholder="URL" value={docUrlInput} onChange={(e) => setDocUrlInput(e.target.value)} />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addDocLink}>Add</Button>
            </div>
            {docLinks.length > 0 && (
              <div className="space-y-1 mt-1.5">
                {docLinks.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <LinkIcon className="w-3 h-3 text-gray-400 shrink-0" />
                    <span className="text-xs text-blue-600 truncate flex-1">{d.label}</span>
                    <button onClick={() => setDocLinks((prev) => prev.filter((_, idx) => idx !== i))}>
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-gray-900 text-white hover:bg-gray-800"
            disabled={!title.trim() || !date || loading}
            onClick={handleSubmit}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? "Save Changes" : "Create Meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
