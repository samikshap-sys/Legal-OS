import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useGaugeUser } from "@/contexts/GaugeUserContext";
import {
  ArrowLeft, Copy, Check, Clock, User, Tag, AlertCircle,
  MessageSquare, RefreshCw, ChevronDown, Ticket as TicketIcon, Trash2
} from "lucide-react";
import { Ticket, StatusBadge, PriorityBadge, STATUS_LABELS, formatDate } from "./TicketRow";

const TICKET_STATUSES = ["open", "in_progress", "on_hold", "disputed", "resolved", "closed"] as const;
// UI-level status options: merge resolved+closed into one button
const UI_STATUS_OPTIONS: { value: typeof TICKET_STATUSES[number]; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "disputed", label: "Disputed" },
  { value: "resolved", label: "Resolved / Closed" },
];

interface TicketDetailProps {
  ticketId: string;
  onBack: () => void;
}

/* ── Perforation row SVG ─────────────────────────────────────────────── */
function PerforationLine({ dark = false }: { dark?: boolean }) {
  return (
    <div className="relative flex items-center" style={{ height: "20px" }}>
      {/* Left half-circle notch */}
      <div
        style={{
          width: "16px", height: "16px", borderRadius: "50%",
          background: dark ? "#302B2B" : "#f4f4f5",
          flexShrink: 0, marginLeft: "-8px",
          boxShadow: dark ? "inset 0 2px 4px rgba(0,0,0,0.4)" : "inset 0 2px 4px rgba(0,0,0,0.1)",
        }}
      />
      {/* Dashed line */}
      <div style={{ flex: 1, borderTop: `2px dashed ${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`, margin: "0 4px" }} />
      {/* Right half-circle notch */}
      <div
        style={{
          width: "16px", height: "16px", borderRadius: "50%",
          background: dark ? "#302B2B" : "#f4f4f5",
          flexShrink: 0, marginRight: "-8px",
          boxShadow: dark ? "inset 0 2px 4px rgba(0,0,0,0.4)" : "inset 0 2px 4px rgba(0,0,0,0.1)",
        }}
      />
    </div>
  );
}

/* ── Barcode decoration ──────────────────────────────────────────────── */
function Barcode({ ticketId }: { ticketId: string }) {
  // Generate pseudo-random bar widths from ticket ID characters
  const bars = ticketId.split("").map((c) => {
    const n = c.charCodeAt(0);
    return [1 + (n % 3), 1 + ((n * 7) % 2)]; // [bar, gap]
  });
  return (
    <div style={{ display: "flex", alignItems: "flex-end", height: "32px", gap: "1px", opacity: 0.25 }}>
      {bars.map(([w, _], i) => (
        <div
          key={i}
          style={{
            width: `${w + 1}px`,
            height: `${18 + (i % 3) * 5}px`,
            background: "#302B2B",
            borderRadius: "1px",
          }}
        />
      ))}
    </div>
  );
}

export default function TicketDetail({ ticketId, onBack }: TicketDetailProps) {
  const { gaugeUser: user } = useGaugeUser();
  const [copied, setCopied] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [newStatus, setNewStatus] = useState<typeof TICKET_STATUSES[number] | "">("");
  const [statusComment, setStatusComment] = useState("");
  const [showStatusPanel, setShowStatusPanel] = useState(false);

  const utils = trpc.useUtils();

  const { data: ticket, isLoading, error } = trpc.gauge.getTicketById.useQuery({ ticketId });
  const { data: comments } = trpc.gauge.getComments.useQuery({ ticketId });

  const addCommentMutation = trpc.gauge.addComment.useMutation({
    onSuccess: () => {
      setNewComment("");
      utils.gauge.getComments.invalidate({ ticketId });
    },
  });

  const updateStatusMutation = trpc.gauge.updateTicketStatus.useMutation({
    onSuccess: () => {
      setNewStatus("");
      setStatusComment("");
      setShowStatusPanel(false);
      utils.gauge.getTicketById.invalidate({ ticketId });
      utils.gauge.getComments.invalidate({ ticketId });
    },
  });

  const copyLink = () => {
    const url = `${window.location.origin}/gauge/ticket/${ticketId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddComment = () => {
    if (!newComment.trim() || !user?.email) return;
    addCommentMutation.mutate({
      ticketId,
      content: newComment.trim(),
      authorEmail: user.email,
      authorName: user.name || user.email,
    });
  };

  const handleUpdateStatus = () => {
    if (!newStatus || !user?.email) return;
    updateStatusMutation.mutate({
      ticketId,
      newStatus,
      comment: statusComment,
      callerEmail: user.email,
      callerName: user.name || user.email,
    });
  };

  const isDri = ticket && user?.email && ticket.driEmail === user.email;
  const isAdmin = user?.isAdmin ?? false;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTicketMutation = trpc.gauge.deleteTicket.useMutation({
    onSuccess: () => {
      onBack();
    },
  });

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    if (!user?.email) return;
    deleteTicketMutation.mutate({ ticketId, callerEmail: user.email });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#302B2B] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">Loading ticket…</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-zinc-50">
        <AlertCircle className="w-12 h-12 text-zinc-300" />
        <p className="text-zinc-500">Ticket not found: {ticketId}</p>
        <button onClick={onBack} className="text-sm text-[#302B2B] underline">Go back</button>
      </div>
    );
  }

  const t = ticket as Ticket;

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        background: "linear-gradient(145deg, #e8e8e8 0%, #f0f0f0 40%, #e4e4e4 100%)",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      {/* ── Top navigation bar ── */}
      <div
        style={{
          position: "sticky", top: 0, zIndex: 20,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          padding: "0 24px",
          height: "52px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            fontSize: "13px", color: "#71717a", background: "none", border: "none",
            cursor: "pointer", padding: "4px 8px", borderRadius: "8px",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f4f4f5"; e.currentTarget.style.color = "#302B2B"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#71717a"; }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div style={{ width: "1px", height: "16px", background: "#e4e4e7" }} />
        <span style={{
          fontFamily: "monospace", fontSize: "13px", fontWeight: 700,
          color: "#302B2B", background: "#f4f4f5", padding: "4px 10px", borderRadius: "8px",
          letterSpacing: "0.05em",
        }}>
          {t.ticketId}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {isAdmin && (
            <button
              onClick={handleDelete}
              disabled={deleteTicketMutation.isPending}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                fontSize: "12px", fontWeight: 600,
                color: confirmDelete ? "#dc2626" : "#71717a",
                background: confirmDelete ? "#fef2f2" : "none",
                border: confirmDelete ? "1px solid #fca5a5" : "1px solid #e4e4e7",
                padding: "6px 14px", borderRadius: "10px",
                cursor: "pointer", transition: "all 0.15s",
                opacity: deleteTicketMutation.isPending ? 0.6 : 1,
              }}
            >
              <Trash2 size={13} />
              {deleteTicketMutation.isPending ? "Deleting…" : confirmDelete ? "Confirm delete?" : "Delete ticket"}
            </button>
          )}
          <button
            onClick={copyLink}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              fontSize: "12px", fontWeight: 600,
              color: copied ? "#302B2B" : "#52525b",
              background: copied ? "#f4f4f5" : "none",
              border: "1px solid #e4e4e7",
              padding: "6px 14px", borderRadius: "10px",
              cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f4f4f5"; e.currentTarget.style.color = "#302B2B"; }}
            onMouseLeave={e => {
              if (!copied) {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "#52525b";
              }
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied!" : "Share ticket"}
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ padding: "20px 20px 40px" }}>

        {/* ════════════════════════════════════════════════════════
            THE TICKET CARD — 3D paper effect
        ════════════════════════════════════════════════════════ */}
        <div
          style={{
            borderRadius: "20px",
            overflow: "visible",
            filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.18)) drop-shadow(0 2px 8px rgba(0,0,0,0.10))",
            position: "relative",
          }}
        >
          {/* Paper stack layers — depth illusion */}
          <div style={{
            position: "absolute", inset: 0,
            borderRadius: "20px",
            background: "#fff",
            transform: "translate(5px, 8px)",
            zIndex: 0,
            opacity: 0.5,
          }} />
          <div style={{
            position: "absolute", inset: 0,
            borderRadius: "20px",
            background: "#fff",
            transform: "translate(2.5px, 4px)",
            zIndex: 1,
            opacity: 0.75,
          }} />

          {/* ── Main ticket body ── */}
          <div
            style={{
              position: "relative", zIndex: 2,
              borderRadius: "20px",
              overflow: "hidden",
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            {/* ── TICKET HEADER (black stub) ── */}
            <div
              style={{
                background: "#302B2B",
                padding: "24px 28px 20px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Subtle grid texture */}
              <div style={{
                position: "absolute", inset: 0, opacity: 0.04,
                backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }} />

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative" }}>
                <div>
                  {/* Ticket ID chip */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <TicketIcon size={14} color="rgba(255,255,255,0.4)" />
                    <span style={{
                      fontFamily: "monospace", fontSize: "11px", fontWeight: 700,
                      color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}>
                      {t.ticketId}
                    </span>
                  </div>
                  {/* Title */}
                  <h1 style={{
                    fontSize: "22px", fontWeight: 800, color: "#fff",
                    letterSpacing: "-0.03em", lineHeight: 1.2,
                    margin: 0, maxWidth: "520px",
                  }}>
                    {t.title}
                  </h1>
                </div>

                {/* Right: Status + Priority chips */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", flexShrink: 0 }}>
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                </div>
              </div>

              {/* Meta row */}
              <div style={{ display: "flex", alignItems: "center", gap: "20px", marginTop: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{
                    width: "22px", height: "22px", borderRadius: "50%",
                    background: "rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "10px", fontWeight: 700, color: "#fff",
                  }}>
                    {(t.raisedByName || t.raisedByEmail)[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Raised by</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
                    {t.raisedByName || t.raisedByEmail.split("@")[0]}
                  </span>
                </div>
                <div style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.15)" }} />
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Tag size={11} color="rgba(255,255,255,0.4)" />
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{t.category}</span>
                </div>
                <div style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.15)" }} />
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Clock size={11} color="rgba(255,255,255,0.4)" />
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{formatDate(t.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* ── PERFORATION ── */}
            <PerforationLine dark={false} />

            {/* ── TICKET BODY ── */}
            <div style={{ padding: "24px 28px", display: "grid", gridTemplateColumns: "1fr 260px", gap: "28px" }}>

              {/* Left column */}
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

                {/* Description */}
                {t.description ? (
                  <div>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>
                      Description
                    </p>
                    <div style={{
                      background: "#fafafa",
                      border: "1px solid #f0f0f0",
                      borderRadius: "12px",
                      padding: "16px",
                      fontSize: "14px",
                      color: "#3f3f46",
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                    }}>
                      {t.description}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: "13px", color: "#a1a1aa", fontStyle: "italic" }}>No description provided.</p>
                )}

                {/* DRI Status Update Panel */}
                {isDri && (
                  <div style={{
                    border: "1.5px solid #e4e4e7",
                    borderRadius: "14px",
                    overflow: "hidden",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  }}>
                    <button
                      onClick={() => setShowStatusPanel((s) => !s)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 18px", background: "#fafafa", border: "none", cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#f4f4f5"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#fafafa"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          width: "6px", height: "6px", borderRadius: "50%", background: "#302B2B",
                        }} />
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#302B2B" }}>Update Status</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", color: "#a1a1aa" }}>You are the DRI for this ticket</span>
                        <ChevronDown
                          size={14}
                          color="#a1a1aa"
                          style={{ transform: showStatusPanel ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                        />
                      </div>
                    </button>

                    {showStatusPanel && (
                      <div style={{ padding: "18px", borderTop: "1px solid #f0f0f0", display: "flex", flexDirection: "column", gap: "14px" }}>
                        <div>
                          <p style={{ fontSize: "10px", fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
                            New Status
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {UI_STATUS_OPTIONS.filter((opt) => opt.value !== t.status && !(t.status === "closed" && opt.value === "resolved")).map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setNewStatus(opt.value)}
                                style={{
                                  padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                                  cursor: "pointer", transition: "all 0.15s",
                                  background: newStatus === opt.value ? "#302B2B" : "#f4f4f5",
                                  color: newStatus === opt.value ? "#fff" : "#52525b",
                                  border: newStatus === opt.value ? "1.5px solid #302B2B" : "1.5px solid #e4e4e7",
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p style={{ fontSize: "10px", fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
                            Comment (optional)
                          </p>
                          <textarea
                            value={statusComment}
                            onChange={(e) => setStatusComment(e.target.value)}
                            placeholder="Add context about this status change…"
                            rows={2}
                            style={{
                              width: "100%", padding: "10px 14px", borderRadius: "10px",
                              border: "1.5px solid #e4e4e7", fontSize: "13px", color: "#302B2B",
                              background: "#fff", resize: "none", outline: "none",
                              fontFamily: "inherit", lineHeight: 1.5,
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        <button
                          onClick={handleUpdateStatus}
                          disabled={!newStatus || updateStatusMutation.isPending}
                          style={{
                            alignSelf: "flex-start",
                            padding: "10px 20px", borderRadius: "10px",
                            background: !newStatus ? "#f4f4f5" : "#302B2B",
                            color: !newStatus ? "#a1a1aa" : "#fff",
                            border: "none", fontSize: "13px", fontWeight: 700,
                            cursor: !newStatus ? "not-allowed" : "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          {updateStatusMutation.isPending ? "Saving…" : "Save Status Update"}
                        </button>

                        {updateStatusMutation.error && (
                          <p style={{ fontSize: "12px", color: "#71717a" }}>{updateStatusMutation.error.message}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Activity / Comments */}
                <div>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <MessageSquare size={12} />
                    Activity
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {(comments ?? []).length === 0 ? (
                      <p style={{ fontSize: "13px", color: "#a1a1aa", fontStyle: "italic" }}>No activity yet.</p>
                    ) : (
                      (comments ?? []).map((c) => (
                        <div
                          key={c.id}
                          style={{
                            borderRadius: "12px",
                            padding: "14px 16px",
                            background: c.isStatusChange === 1 ? "#fafafa" : "#fff",
                            border: "1px solid #f0f0f0",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                            <div style={{
                              width: "26px", height: "26px", borderRadius: "50%",
                              background: c.isStatusChange === 1 ? "#302B2B" : "#e4e4e7",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "10px", fontWeight: 800,
                              color: c.isStatusChange === 1 ? "#fff" : "#52525b",
                              flexShrink: 0,
                            }}>
                              {(c.authorName || c.authorEmail)[0].toUpperCase()}
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: "#302B2B" }}>
                              {c.authorName || c.authorEmail.split("@")[0]}
                            </span>
                            {c.isStatusChange === 1 && (
                              <span style={{
                                fontSize: "10px", fontWeight: 700,
                                background: "#302B2B", color: "#fff",
                                padding: "2px 8px", borderRadius: "20px",
                                letterSpacing: "0.04em",
                              }}>
                                Status update
                              </span>
                            )}
                            <span style={{ fontSize: "11px", color: "#a1a1aa", marginLeft: "auto" }}>
                              {formatDate(c.createdAt)}
                            </span>
                          </div>

                          {c.isStatusChange === 1 && c.oldStatus && c.newStatus && (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                              <span style={{
                                fontSize: "11px", padding: "2px 10px", borderRadius: "6px",
                                background: "#f4f4f5", color: "#71717a", fontWeight: 500,
                              }}>
                                {c.oldStatus.replace("_", " ")}
                              </span>
                              <span style={{ fontSize: "12px", color: "#a1a1aa" }}>→</span>
                              <span style={{
                                fontSize: "11px", padding: "2px 10px", borderRadius: "6px",
                                background: "#302B2B", color: "#fff", fontWeight: 700,
                              }}>
                                {c.newStatus.replace("_", " ")}
                              </span>
                            </div>
                          )}

                          <p style={{ fontSize: "13px", color: "#3f3f46", lineHeight: 1.6, margin: 0 }}>
                            {c.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add comment */}
                  <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment…"
                      rows={3}
                      style={{
                        width: "100%", padding: "12px 16px", borderRadius: "12px",
                        border: "1.5px solid #e4e4e7", fontSize: "13px", color: "#302B2B",
                        background: "#fff", resize: "none", outline: "none",
                        fontFamily: "inherit", lineHeight: 1.6,
                        boxSizing: "border-box",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#302B2B"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#e4e4e7"; }}
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || addCommentMutation.isPending}
                      style={{
                        alignSelf: "flex-start",
                        padding: "10px 20px", borderRadius: "10px",
                        background: !newComment.trim() ? "#f4f4f5" : "#302B2B",
                        color: !newComment.trim() ? "#a1a1aa" : "#fff",
                        border: "none", fontSize: "13px", fontWeight: 700,
                        cursor: !newComment.trim() ? "not-allowed" : "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {addCommentMutation.isPending ? "Posting…" : "Post Comment"}
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Right sidebar column ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {/* Sidebar card */}
                <div style={{
                  background: "#fafafa",
                  border: "1px solid #f0f0f0",
                  borderRadius: "16px",
                  overflow: "hidden",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                }}>
                  {/* People section */}
                  <div style={{ padding: "16px 18px", borderBottom: "1px solid #f0f0f0" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
                      People
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <PersonRow label="Raised by" name={t.raisedByName || t.raisedByEmail.split("@")[0]} email={t.raisedByEmail} dark={false} />
                      <PersonRow label="DRI" name={t.driName || t.driEmail.split("@")[0]} email={t.driEmail} dark={true} />
                    </div>
                  </div>

                  {/* Details section */}
                  <div style={{ padding: "16px 18px", borderBottom: "1px solid #f0f0f0" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
                      Details
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <DetailRow icon={<Tag size={12} />} label="Category" value={t.category} />
                      <DetailRow icon={<Clock size={12} />} label="Created" value={formatDate(t.createdAt)} />
                      <DetailRow icon={<RefreshCw size={12} />} label="Updated" value={formatDate(t.updatedAt)} />
                      {t.resolvedAt && (
                        <DetailRow icon={<Check size={12} />} label="Resolved" value={formatDate(t.resolvedAt)} highlight />
                      )}
                    </div>
                  </div>

                  {/* Barcode / decorative footer */}
                  <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <Barcode ticketId={t.ticketId} />
                    <p style={{ fontSize: "9px", fontFamily: "monospace", color: "#d4d4d8", letterSpacing: "0.08em" }}>
                      {t.ticketId} · GAUGE INTERNAL
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── BOTTOM PERFORATION ── */}
            <PerforationLine dark={false} />

            {/* ── TICKET FOOTER (receipt stub) ── */}
            <div style={{
              padding: "14px 28px",
              background: "#fafafa",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "28px", height: "28px", background: "#302B2B", borderRadius: "8px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <TicketIcon size={14} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#302B2B", margin: 0 }}>Gauge · Internal Ticketing</p>
                  <p style={{ fontSize: "10px", color: "#a1a1aa", margin: 0 }}>@gofynd.com</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <StatusBadge status={t.status} />
                <PriorityBadge priority={t.priority} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helper sub-components ─────────────────────────────────────────────── */

function PersonRow({ label, name, email, dark }: { label: string; name: string; email: string; dark: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{
        width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
        background: dark ? "#302B2B" : "#e4e4e7",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "11px", fontWeight: 800,
        color: dark ? "#fff" : "#52525b",
      }}>
        {name[0].toUpperCase()}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: "10px", color: "#a1a1aa", margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
          {label}
        </p>
        <p style={{ fontSize: "12px", fontWeight: 700, color: "#302B2B", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </p>
        <p style={{ fontSize: "11px", color: "#a1a1aa", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {email}
        </p>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, highlight = false }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ color: "#a1a1aa", flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: "11px", color: "#a1a1aa", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "11px", fontWeight: 600, color: highlight ? "#302B2B" : "#52525b", marginLeft: "auto" }}>
        {value}
      </span>
    </div>
  );
}
