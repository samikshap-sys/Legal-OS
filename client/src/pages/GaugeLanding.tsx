/**
 * Gauge Landing Page
 * Split layout: black left panel (57%) + white right panel (43%)
 * Theme: monochrome black & white
 * Left: Gauge logo + name, hero copy, 2×3 feature grid, Back to FinOps
 * Right: Gauge app icon, Welcome, "Open Gauge" button → /gauge/app
 */
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useGaugeUser } from "@/contexts/GaugeUserContext";

export default function GaugeLanding() {
  const { gaugeUser, gaugeLoading, gaugeLogout } = useGaugeUser();
  const [, navigate] = useLocation();
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("gauge_error");
    if (err === "domain_not_allowed") {
      const email = params.get("email") || "";
      setOauthError(`Access denied: ${email} is not a @gofynd.com account. Please use your Fynd Google account.`);
    } else if (err) {
      setOauthError("Google login failed. Please try again.");
    }
  }, []);

  function handleOpenGauge() {
    if (gaugeUser) {
      navigate("/gauge/app");
    } else {
      const origin = window.location.origin;
      window.location.href = `/api/gauge/auth/google?origin=${encodeURIComponent(origin)}&returnPath=${encodeURIComponent("/gauge/app")}`;
    }
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      {/* ── LEFT PANEL ── */}
      <div style={{
        width: "57%",
        background: "#302B2B",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        padding: "0",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Subtle grid texture overlay */}
        <div style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          pointerEvents: "none",
        }} />

        {/* Top section: brand */}
        <div style={{ padding: "36px 48px 0", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* Gauge logo mark */}
            <div style={{
              width: "44px",
              height: "44px",
              background: "#fff",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <GaugeLogoMark size={28} color="#302B2B" />
            </div>
            <span style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "#fff",
            }}>Gauge</span>
          </div>
        </div>

        {/* Body: hero + features */}
        <div style={{ flex: 1, padding: "60px 48px 40px", position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h1 style={{
            fontSize: "clamp(2rem, 3.5vw, 3rem)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.04em",
            color: "#fff",
            margin: "0 0 16px",
          }}>
            Requests,<br />tracked to resolution.
          </h1>
          <p style={{
            fontSize: "15px",
            color: "rgba(255,255,255,0.55)",
            margin: "0 0 32px",
            lineHeight: 1.6,
          }}>
            Raise tickets, assign DRIs, and track every request across the organisation — all in one place.
          </p>

          <div style={{
            width: "48px",
            height: "1px",
            background: "rgba(255,255,255,0.15)",
            margin: "0 0 32px",
          }} />

          {/* Feature grid 2×3 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "10px",
                padding: "14px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}>
                <span style={{
                  color: "rgba(255,255,255,0.6)",
                  flexShrink: 0,
                  marginTop: "2px",
                }}>{f.icon}</span>
                <div>
                  <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#fff" }}>{f.title}</p>
                  <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "rgba(255,255,255,0.45)" }}>{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer: Back to FinOps */}
        <div style={{
          padding: "24px 48px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 1,
        }}>
          <Link href="/" style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "8px",
            padding: "8px 14px",
            color: "rgba(255,255,255,0.7)",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
            cursor: "pointer",
            transition: "background 0.15s",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back to FinOps
          </Link>
          <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.25)" }}>
            © 2026 Fynd FinOps. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{
        width: "43%",
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 40px",
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: "320px",
          width: "100%",
        }}>
          {/* App icon */}
          <div style={{
            width: "120px",
            height: "120px",
            background: "#302B2B",
            borderRadius: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "28px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)",
            position: "relative",
          }}>
            <GaugeLogoMark size={64} color="#ffffff" />
            {/* Subtle shine */}
            <div style={{
              position: "absolute",
              top: "10px",
              left: "14px",
              width: "32px",
              height: "12px",
              background: "rgba(255,255,255,0.12)",
              borderRadius: "6px",
              transform: "rotate(-20deg)",
            }} />
          </div>

          {gaugeUser ? (
            <>
              <h2 style={{
                margin: "0 0 6px",
                fontSize: "1.3rem",
                fontWeight: 700,
                color: "#302B2B",
                letterSpacing: "-0.02em",
              }}>
                Welcome, {gaugeUser.name?.split(" ")[0] || gaugeUser.email?.split("@")[0]}!
              </h2>
              <p style={{
                margin: "0 0 28px",
                fontSize: "13px",
                color: "#888",
              }}>{gaugeUser.email}</p>
            </>
          ) : (
            <>
              <h2 style={{
                margin: "0 0 6px",
                fontSize: "1.3rem",
                fontWeight: 700,
                color: "#302B2B",
                letterSpacing: "-0.02em",
              }}>
                Welcome back
              </h2>
              <p style={{
                margin: "0 0 28px",
                fontSize: "13px",
                color: "#888",
                lineHeight: 1.5,
              }}>
                Your internal ticketing<br />system.
              </p>
            </>
          )}

          {/* OAuth error */}
          {oauthError && (
            <div style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "16px",
              fontSize: "12px",
              color: "#ef4444",
              textAlign: "center",
              maxWidth: "280px",
            }}>
              {oauthError}
            </div>
          )}

          {/* CTA: Sign in with Google / Open Gauge */}
          {gaugeLoading ? (
            <button
              disabled
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                background: "#302B2B", color: "#fff", border: "none",
                borderRadius: "10px", padding: "13px 28px", fontSize: "14px",
                fontWeight: 600, cursor: "not-allowed", opacity: 0.6,
                width: "100%", justifyContent: "center",
              }}
            >
              Loading...
            </button>
          ) : gaugeUser ? (
            <button
              onClick={handleOpenGauge}
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                background: "#302B2B", color: "#fff", border: "none",
                borderRadius: "10px", padding: "13px 28px", fontSize: "14px",
                fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em",
                transition: "background 0.15s", width: "100%", justifyContent: "center",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#222")}
              onMouseLeave={e => (e.currentTarget.style.background = "#302B2B")}
            >
              <GaugeLogoMark size={16} color="#fff" />
              Open Gauge
            </button>
          ) : (
            <button
              onClick={handleOpenGauge}
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                background: "#302B2B", color: "#fff", border: "none",
                borderRadius: "10px", padding: "13px 28px", fontSize: "14px",
                fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em",
                transition: "background 0.15s", width: "100%", justifyContent: "center",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#222")}
              onMouseLeave={e => (e.currentTarget.style.background = "#302B2B")}
            >
              {/* Google G icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" fillOpacity="0.85"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" fillOpacity="0.7"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" fillOpacity="0.9"/>
              </svg>
              Sign in with Google
            </button>
          )}

          {/* Logout when already signed in */}
          {gaugeUser && (
            <button
              onClick={gaugeLogout}
              style={{
                marginTop: "12px", background: "none", border: "none",
                color: "#aaa", fontSize: "12px", cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Sign out
            </button>
          )}

          <p style={{
            marginTop: "20px",
            fontSize: "11px",
            color: "#bbb",
          }}>
            Only @gofynd.com accounts are permitted
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Gauge logo mark: speedometer / dial SVG ── */
function GaugeLogoMark({ size = 32, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer arc — 210° sweep (from 210° to 330° going clockwise through top) */}
      <path
        d="M5.1 22.5 A13 13 0 1 1 26.9 22.5"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.35"
      />
      {/* Active arc — left portion */}
      <path
        d="M5.1 22.5 A13 13 0 0 1 16 3"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Needle */}
      <line
        x1="16" y1="16"
        x2="10" y2="8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx="16" cy="16" r="2.2" fill={color} />
      {/* Tick marks */}
      <line x1="16" y1="4.5" x2="16" y2="6.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="6.5" y1="22" x2="8.2" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="25.5" y1="22" x2="23.8" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

const FEATURES = [
  {
    title: "Raise Tickets",
    sub: "Create requests directly from Slack",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
    ),
  },
  {
    title: "Assign DRIs",
    sub: "Every ticket has a clear owner",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    title: "Track Status",
    sub: "Open · In Progress · Resolved",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    title: "Slack Notifications",
    sub: "DRI alerted on every new ticket",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
  },
  {
    title: "Kanban Board",
    sub: "Visual pipeline across all statuses",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="5" height="18" rx="1"/>
        <rect x="10" y="3" width="5" height="12" rx="1"/>
        <rect x="17" y="3" width="5" height="8" rx="1"/>
      </svg>
    ),
  },
  {
    title: "Activity Log",
    sub: "Full comment & status history",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
];
