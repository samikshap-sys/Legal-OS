import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Plus, ChevronDown } from "lucide-react";
import { Ticket, STATUS_LABELS, formatDate } from "./TicketRow";

// ── Column config — pure monochrome shades ────────────────────────────────
const COLUMNS: {
  key: "open" | "in_progress" | "on_hold" | "disputed" | "resolved";
  label: string;
  headerBg: string;
  headerText: string;
  countBg: string;
  countText: string;
  colBg: string;
  dotBg: string;
  emptyText: string;
}[] = [
  {
    key: "open",
    label: "Open",
    headerBg: "#f4f4f5",
    headerText: "#3f3f46",
    countBg: "#e4e4e7",
    countText: "#52525b",
    colBg: "#fafafa",
    dotBg: "#a1a1aa",
    emptyText: "#d4d4d8",
  },
  {
    key: "in_progress",
    label: "In Progress",
    headerBg: "#302B2B",
    headerText: "#ffffff",
    countBg: "rgba(255,255,255,0.15)",
    countText: "rgba(255,255,255,0.7)",
    colBg: "#f9f9f9",
    dotBg: "#71717a",
    emptyText: "#d4d4d8",
  },
  {
    key: "on_hold",
    label: "On Hold",
    headerBg: "#302B2B",
    headerText: "#ffffff",
    countBg: "rgba(255,255,255,0.15)",
    countText: "rgba(255,255,255,0.7)",
    colBg: "#fafafa",
    dotBg: "#a1a1aa",
    emptyText: "#d4d4d8",
  },
  {
    key: "disputed",
    label: "Disputed",
    headerBg: "#27272a",
    headerText: "#e4e4e7",
    countBg: "rgba(255,255,255,0.12)",
    countText: "rgba(255,255,255,0.6)",
    colBg: "#f9f9f9",
    dotBg: "#71717a",
    emptyText: "#d4d4d8",
  },
  {
    key: "resolved",
    label: "Resolved",
    headerBg: "#18181b",
    headerText: "#ffffff",
    countBg: "rgba(255,255,255,0.12)",
    countText: "rgba(255,255,255,0.6)",
    colBg: "#fafafa",
    dotBg: "#71717a",
    emptyText: "#d4d4d8",
  },
];

// Priority dot — monochrome shades
const PRIORITY_CONFIG: Record<string, { dot: string; label: string; weight: number }> = {
  low:      { dot: "#d4d4d8", label: "Low",      weight: 1 },
  medium:   { dot: "#a1a1aa", label: "Medium",   weight: 2 },
  high:     { dot: "#52525b", label: "High",     weight: 3 },
  critical: { dot: "#302B2B", label: "Critical", weight: 4 },
};

interface KanbanBoardProps {
  onTicketClick: (ticketId: string) => void;
  onNewTicket: () => void;
}

export default function KanbanBoard({ onTicketClick, onNewTicket }: KanbanBoardProps) {
  const [selectedDri, setSelectedDri] = useState<string>("all");
  const [driDropdownOpen, setDriDropdownOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: driList } = trpc.gauge.getDriList.useQuery();
  const { data: board, isLoading } = trpc.gauge.getKanbanBoard.useQuery({
    driEmail: selectedDri !== "all" ? selectedDri : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const selectedDriLabel = selectedDri === "all"
    ? "All DRIs"
    : (driList ?? []).find(d => d.driEmail === selectedDri)?.driName || selectedDri.split("@")[0];

  const totalTickets = COLUMNS.reduce((sum, col) => sum + ((board?.[col.key] ?? []) as Ticket[]).length, 0);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#f8f8f8",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "16px 24px 14px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h1 style={{ fontSize: "18px", fontWeight: 800, color: "#302B2B", margin: 0, letterSpacing: "-0.03em" }}>
                Kanban Board
              </h1>
              {!isLoading && (
                <span style={{
                  fontSize: "11px", fontWeight: 700,
                  background: "#302B2B", color: "#fff",
                  padding: "2px 8px", borderRadius: "20px",
                }}>
                  {totalTickets} ticket{totalTickets !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p style={{ fontSize: "12px", color: "#a1a1aa", margin: "3px 0 0" }}>
              Tickets organised by status
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Date range filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", color: "#71717a", fontWeight: 500 }}>From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={{
                  padding: "6px 10px", borderRadius: "8px",
                  border: "1.5px solid #e4e4e7", background: "#fff",
                  fontSize: "12px", color: "#302B2B", cursor: "pointer",
                  outline: "none",
                }}
              />
              <span style={{ fontSize: "11px", color: "#71717a", fontWeight: 500 }}>To</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={{
                  padding: "6px 10px", borderRadius: "8px",
                  border: "1.5px solid #e4e4e7", background: "#fff",
                  fontSize: "12px", color: "#302B2B", cursor: "pointer",
                  outline: "none",
                }}
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  style={{
                    padding: "5px 10px", borderRadius: "8px",
                    border: "1.5px solid #e4e4e7", background: "#fff",
                    fontSize: "11px", color: "#71717a", cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* DRI filter — always black */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setDriDropdownOpen(!driDropdownOpen)}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "8px 14px", borderRadius: "10px",
                  border: "1.5px solid #302B2B",
                  background: "#302B2B",
                  color: "#fff",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "9px", fontWeight: 800,
                  color: "#fff",
                  flexShrink: 0,
                }}>
                  {selectedDriLabel[0].toUpperCase()}
                </div>
                {selectedDriLabel}
                <ChevronDown size={12} style={{ opacity: 0.6, transform: driDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>

              {driDropdownOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                    onClick={() => setDriDropdownOpen(false)}
                  />
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
                    background: "#fff", borderRadius: "14px",
                    border: "1px solid #e4e4e7",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
                    minWidth: "220px", overflow: "hidden",
                    padding: "6px",
                  }}>
                    {[{ driEmail: "all", driName: "All DRIs" }, ...(driList ?? [])].map((d) => {
                      const isActive = selectedDri === d.driEmail;
                      const label = d.driEmail === "all" ? "All DRIs" : (d.driName || d.driEmail.split("@")[0]);
                      return (
                        <button
                          key={d.driEmail}
                          onClick={() => { setSelectedDri(d.driEmail); setDriDropdownOpen(false); }}
                          style={{
                            display: "flex", alignItems: "center", gap: "8px",
                            width: "100%", padding: "8px 10px", borderRadius: "8px",
                            background: isActive ? "#302B2B" : "none",
                            color: isActive ? "#fff" : "#3f3f46",
                            border: "none", fontSize: "12px", fontWeight: isActive ? 700 : 500,
                            cursor: "pointer", textAlign: "left",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f4f4f5"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}
                        >
                          <div style={{
                            width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
                            background: isActive ? "rgba(255,255,255,0.2)" : "#e4e4e7",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "9px", fontWeight: 800,
                            color: isActive ? "#fff" : "#71717a",
                          }}>
                            {label[0].toUpperCase()}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: isActive ? 700 : 600 }}>{label}</p>
                            {d.driEmail !== "all" && (
                              <p style={{ margin: 0, fontSize: "10px", opacity: 0.5 }}>{d.driEmail}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* New Ticket */}
            <button
              onClick={onNewTicket}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "9px 16px", borderRadius: "10px",
                background: "#302B2B", color: "#fff", border: "none",
                fontSize: "12px", fontWeight: 700, cursor: "pointer",
                transition: "background 0.15s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#27272a"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#302B2B"; }}
            >
              <Plus size={13} />
              New Ticket
            </button>
          </div>
        </div>
      </div>

      {/* ── Board ── */}
      <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: "20px 20px 24px" }}>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%",
              border: "2px solid #302B2B", borderTopColor: "transparent",
              animation: "spin 0.7s linear infinite",
            }} />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: "14px",
              height: "100%",
              minHeight: "520px",
              minWidth: "900px",
            }}
          >
            {COLUMNS.map((col) => {
              const colTickets = (board?.[col.key] ?? []) as Ticket[];
              return (
                <div
                  key={col.key}
                  style={{
                    flex: 1,
                    minWidth: "160px",
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: "16px",
                    overflow: "hidden",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  {/* Column header */}
                  <div
                    style={{
                      padding: "14px 14px 12px",
                      background: col.headerBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexShrink: 0,
                    }}
                  >
                    <span style={{
                      fontSize: "11px", fontWeight: 800,
                      color: col.headerText,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}>
                      {col.label}
                    </span>
                    <span style={{
                      fontSize: "11px", fontWeight: 700,
                      background: col.countBg,
                      color: col.countText,
                      padding: "2px 8px",
                      borderRadius: "20px",
                      minWidth: "24px",
                      textAlign: "center",
                    }}>
                      {colTickets.length}
                    </span>
                  </div>

                  {/* Cards area — scrollable */}
                  <div
                    style={{
                      flex: 1,
                      background: col.colBg,
                      padding: "10px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {colTickets.length === 0 ? (
                      <div style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                        flexDirection: "column", gap: "8px", padding: "24px 0",
                      }}>
                        <div style={{
                          width: "32px", height: "32px", borderRadius: "50%",
                          border: `2px dashed ${col.emptyText}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Plus size={12} color={col.emptyText} />
                        </div>
                        <span style={{ fontSize: "11px", color: col.emptyText, fontWeight: 500 }}>
                          No tickets
                        </span>
                      </div>
                    ) : (
                      colTickets.map((ticket) => (
                        <KanbanCard
                          key={ticket.ticketId}
                          ticket={ticket}
                          onClick={() => onTicketClick(ticket.ticketId)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* ── Kanban Card ─────────────────────────────────────────────────────────── */
function KanbanCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const pc = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.medium;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff",
        borderRadius: "12px",
        padding: "12px 14px",
        cursor: "pointer",
        border: hovered ? "1.5px solid #302B2B" : "1.5px solid #e8e8e8",
        boxShadow: hovered
          ? "0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)"
          : "0 1px 4px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-2px)" : "none",
        transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Priority accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: "2px",
        background: pc.dot,
        opacity: hovered ? 1 : 0.6,
        transition: "opacity 0.18s",
      }} />

      {/* Top row: ticket ID + priority dot */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{
          fontFamily: "monospace", fontSize: "10px", fontWeight: 700,
          color: "#a1a1aa", letterSpacing: "0.06em",
        }}>
          {ticket.ticketId}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: pc.dot,
          }} title={pc.label} />
        </div>
      </div>

      {/* Title */}
      <p style={{
        fontSize: "12px", fontWeight: 700, color: "#302B2B",
        lineHeight: 1.4, margin: "0 0 6px",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {ticket.title}
      </p>

      {/* Category chip */}
      <span style={{
        display: "inline-block",
        fontSize: "10px", fontWeight: 600, color: "#71717a",
        background: "#f4f4f5", padding: "2px 7px", borderRadius: "6px",
        marginBottom: "10px",
      }}>
        {ticket.category}
      </span>

      {/* Bottom row: DRI avatar + date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{
            width: "20px", height: "20px", borderRadius: "50%",
            background: "#302B2B", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "8px", fontWeight: 800, flexShrink: 0,
          }}>
            {(ticket.driName || ticket.driEmail || "?")[0].toUpperCase()}
          </div>
          <span style={{ fontSize: "10px", color: "#71717a", fontWeight: 500 }}>
            {ticket.driName || ticket.driEmail?.split("@")[0] || "—"}
          </span>
        </div>
        <span style={{ fontSize: "9px", color: "#a1a1aa", fontWeight: 500 }}>
          {formatDate(ticket.createdAt)}
        </span>
      </div>
    </div>
  );
}

// Suppress unused import warning
void STATUS_LABELS;
