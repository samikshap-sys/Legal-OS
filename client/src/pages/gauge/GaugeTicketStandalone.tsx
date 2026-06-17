/**
 * Standalone Ticket page — opened via shareable link /gauge/ticket/:ticketId
 * Renders the full ticket detail with a header linking back to Gauge App.
 * If the user is not logged in via Gauge Google OAuth, a login banner is shown
 * so the DRI can sign in and be redirected back to this ticket.
 */
import { useParams, Link } from "wouter";
import { useGaugeUser } from "@/contexts/GaugeUserContext";
import TicketDetail from "./TicketDetail";

function GaugeLogoMark({ size = 20, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.1 22.5 A13 13 0 1 1 26.9 22.5" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.35" />
      <path d="M5.1 22.5 A13 13 0 0 1 16 3" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <line x1="16" y1="16" x2="10" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.2" fill={color} />
    </svg>
  );
}

export default function GaugeTicketStandalone() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = params.ticketId ?? "";
  const { gaugeUser, gaugeLoading } = useGaugeUser();

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/gauge/app";
    }
  };

  // Build Gauge Google OAuth login URL that returns user to this ticket
  const returnPath = `/gauge/ticket/${ticketId}`;
  const loginUrl = `/api/gauge/auth/google?origin=${encodeURIComponent(window.location.origin)}&returnPath=${encodeURIComponent(returnPath)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#fff", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* Top bar */}
      <div style={{
        height: "52px", borderBottom: "1px solid #f0f0f0", display: "flex",
        alignItems: "center", padding: "0 24px", flexShrink: 0, gap: "12px",
        background: "#302B2B",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "28px", height: "28px", background: "#fff", borderRadius: "7px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <GaugeLogoMark size={16} color="#302B2B" />
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>Gauge</span>
        </div>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px" }}>/</span>
        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>{ticketId}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          {!gaugeLoading && !gaugeUser && (
            <a
              href={loginUrl}
              style={{
                fontSize: "12px", color: "#fff", textDecoration: "none",
                padding: "6px 14px", borderRadius: "8px",
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.25)",
                fontWeight: 600,
                transition: "all 0.15s",
              }}
            >
              Sign in with Google
            </a>
          )}
          {!gaugeLoading && gaugeUser && (
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
              {gaugeUser.name || gaugeUser.email}
            </span>
          )}
          <Link href="/gauge/app" style={{
            fontSize: "12px", color: "rgba(255,255,255,0.5)", textDecoration: "none",
            padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.15)",
            transition: "all 0.15s",
          }}>
            Open Gauge
          </Link>
        </div>
      </div>

      {/* Login banner — shown only when not logged in */}
      {!gaugeLoading && !gaugeUser && (
        <div style={{
          background: "#fffbeb",
          borderBottom: "1px solid #fde68a",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontSize: "13px", color: "#92400e", flex: 1 }}>
            You are viewing this ticket as a guest. If you are the DRI, sign in with Google to update the ticket status and post comments.
          </span>
          <a
            href={loginUrl}
            style={{
              fontSize: "12px", fontWeight: 700, color: "#92400e",
              textDecoration: "none",
              padding: "6px 16px", borderRadius: "8px",
              background: "#fde68a",
              border: "1px solid #f59e0b",
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            Sign in with Google
          </a>
        </div>
      )}

      {/* Ticket detail */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TicketDetail ticketId={ticketId} onBack={handleBack} />
      </div>
    </div>
  );
}
