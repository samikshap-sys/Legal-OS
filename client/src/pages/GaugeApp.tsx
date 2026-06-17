/**
 * Gauge App — Full ticketing workspace
 * Black sidebar (left) + white content area (right)
 * Views: Dashboard | My Tasks | Calendar | All Tickets | Kanban Board | Ticket Detail
 */
import { useState } from "react";
import { Link } from "wouter";
import { useGaugeUser } from "@/contexts/GaugeUserContext";
import AllTickets from "./gauge/AllTickets";
import KanbanBoard from "./gauge/KanbanBoard";
import TicketDetail from "./gauge/TicketDetail";
import NewTicketModal from "./gauge/NewTicketModal";
import MyTasks from "./gauge/MyTasks";
import GaugeCalendar from "./gauge/GaugeCalendar";


/* ── Gauge logo mark: speedometer / dial SVG ── */
function GaugeLogoMark({ size = 32, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.1 22.5 A13 13 0 1 1 26.9 22.5" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.35" />
      <path d="M5.1 22.5 A13 13 0 0 1 16 3" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <line x1="16" y1="16" x2="10" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.2" fill={color} />
      <line x1="16" y1="4.5" x2="16" y2="6.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="6.5" y1="22" x2="8.2" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="25.5" y1="22" x2="23.8" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

type View = "my-tasks" | "calendar" | "all-tickets" | "kanban" | "ticket-detail";

interface NavItem { id: View; label: string; icon: React.ReactNode; section: "personal" | "tickets"; }

const NAV_ITEMS: NavItem[] = [

  {
    id: "my-tasks",
    section: "personal",
    label: "My Tasks",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
  {
    id: "calendar",
    section: "personal",
    label: "Calendar",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    id: "all-tickets",
    section: "tickets",
    label: "All Tickets",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: "kanban",
    section: "tickets",
    label: "Kanban Board",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="5" height="11"/><rect x="10" y="3" width="5" height="7"/>
        <rect x="17" y="3" width="5" height="15"/>
      </svg>
    ),
  },
];

export default function GaugeApp() {
  const { gaugeUser, gaugeLogout } = useGaugeUser();
  const [view, setView] = useState<View>("my-tasks");
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const SIDEBAR_W = 80;

  const navigateToTicket = (ticketId: string) => {
    setActiveTicketId(ticketId);
    setView("ticket-detail");
  };

  const handleNewTicket = () => setShowNewTicket(true);

  const handleTicketCreated = (ticketId: string) => {
    setShowNewTicket(false);
    navigateToTicket(ticketId);
  };

  const goBack = () => {
    setView("all-tickets");
    setActiveTicketId(null);
  };

  const currentNavId = view === "ticket-detail" ? null : view;

  const personalItems = NAV_ITEMS.filter((n) => n.section === "personal");
  const ticketItems = NAV_ITEMS.filter((n) => n.section === "tickets");

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      background: "#fff",
    }}>
      {/* ── SIDEBAR — Boltic stacked icon+label style ── */}
      <aside style={{
        width: "80px",
        minWidth: "80px",
        background: "#302B2B",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRight: "1px solid #1a1a1a",
        position: "relative",
        zIndex: 10,
      }}>
        {/* New Ticket button — icon only at top */}
        <div style={{ padding: "12px 8px 4px", flexShrink: 0 }}>
          <button
            onClick={handleNewTicket}
            title="New Ticket"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "4px", width: "100%",
              background: "#fff", border: "none", color: "#302B2B", borderRadius: "10px",
              padding: "10px 4px", fontSize: "10px", fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#e8e8e8"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>New</span>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto", scrollbarWidth: "none" }}>
          {[...personalItems, ...ticketItems].map((item) => (
            <NavButton key={item.id} item={item} active={currentNavId === item.id} onClick={() => setView(item.id)} />
          ))}
        </nav>

        {/* Sidebar footer — back to Gauge */}
        <div style={{ padding: "8px 8px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <Link href="/gauge" style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "4px", color: "rgba(255,255,255,0.35)", fontSize: "10px", textDecoration: "none",
            borderRadius: "8px", padding: "8px 4px",
            transition: "background 0.12s, color 0.12s",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "none";
              (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.35)";
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back</span>
          </Link>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{
        flex: 1, background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Top bar */}
        <div style={{
          height: "56px", borderBottom: "1px solid #f0f0f0", display: "flex",
          alignItems: "center", padding: "0 24px", flexShrink: 0, gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px", height: "36px", background: "#302B2B", borderRadius: "9px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <GaugeLogoMark size={22} color="#fff" />
            </div>
            <span style={{ fontSize: "15px", fontWeight: 700, color: "#302B2B", letterSpacing: "-0.01em" }}>Gauge</span>
          </div>
          {view === "ticket-detail" && activeTicketId && (
            <>
              <span style={{ color: "#d0d0d0", fontSize: "14px" }}>/</span>
              <span style={{ fontSize: "13px", color: "#888", fontFamily: "monospace" }}>{activeTicketId}</span>
            </>
          )}
          {/* Spacer */}
          <div style={{ flex: 1 }} />
          {/* Top-right: user identity + sign out */}
          {gaugeUser && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "28px", height: "28px", borderRadius: "50%",
                  background: "#302B2B", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "11px", fontWeight: 700, flexShrink: 0,
                }}>
                  {gaugeUser.name ? gaugeUser.name.charAt(0).toUpperCase() : gaugeUser.email.charAt(0).toUpperCase()}
                </div>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#302B2B", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {gaugeUser.name || gaugeUser.email.split("@")[0]}
                  </div>
                  <div style={{ fontSize: "10px", color: "#999", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {gaugeUser.email}
                  </div>
                </div>
              </div>
              <button
                onClick={async () => { await gaugeLogout(); window.location.href = "/gauge"; }}
                title="Sign out"
                style={{
                  background: "none", border: "1px solid #e5e5e5", cursor: "pointer",
                  color: "#888", padding: "5px 10px", borderRadius: "6px",
                  fontSize: "12px", display: "flex", alignItems: "center", gap: "5px",
                  transition: "background 0.12s, color 0.12s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f5f5f5"; (e.currentTarget as HTMLButtonElement).style.color = "#302B2B"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "#888"; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {view === "my-tasks" && <MyTasks />}
          {view === "calendar" && <GaugeCalendar />}
          {view === "all-tickets" && (
            <AllTickets
              onTicketClick={navigateToTicket}
              onNewTicket={handleNewTicket}
            />
          )}
          {view === "kanban" && (
            <KanbanBoard
              onTicketClick={navigateToTicket}
              onNewTicket={handleNewTicket}
            />
          )}
          {view === "ticket-detail" && activeTicketId && (
            <TicketDetail ticketId={activeTicketId} onBack={goBack} />
          )}
        </div>
      </main>

      {showNewTicket && (
        <NewTicketModal
          onClose={() => setShowNewTicket(false)}
          onCreated={handleTicketCreated}
        />
      )}
    </div>
  );
}

// ── Reusable nav button ───────────────────────────────────────────────────

function NavButton({ item, active, onClick }: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      key={item.id}
      title={item.label}
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: "5px", width: "100%",
        background: active ? "rgba(255,255,255,0.12)" : "none",
        border: "none",
        borderRight: active ? "3px solid #fff" : "3px solid transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.5)",
        borderRadius: "0",
        padding: "12px 4px",
        fontSize: "10px", fontWeight: active ? 600 : 500,
        cursor: "pointer", textAlign: "center",
        transition: "background 0.12s, color 0.12s",
        marginBottom: "0",
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255,255,255,0.07)";
          e.currentTarget.style.color = "#fff";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = "none";
          e.currentTarget.style.color = "rgba(255,255,255,0.5)";
        }
      }}
    >
      <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7, lineHeight: 1 }}>{item.icon}</span>
      <span style={{ fontSize: "10px", lineHeight: 1.2, letterSpacing: "0.01em" }}>{item.label}</span>
    </button>
  );
}
