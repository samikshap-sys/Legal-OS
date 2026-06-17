/**
 * QueryBee Landing Page
 * Design: Matches Legal Connect layout exactly
 * - White background, light purple (#7C5CFC) accent replacing all orange
 * - Left panel: logo + "QueryBee" + hero copy + feature cards + back/footer
 * - Right panel: app icon + welcome card + "Visit QueryBee" purple CTA
 */

import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useQbUser } from "@/contexts/QbUserContext";

export default function QueryBee() {
  const { qbUser, qbLoading, qbLogout } = useQbUser();
  const [, navigate] = useLocation();

  const [oauthError, setOauthError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("qb_error");
    if (err === "domain_not_allowed") {
      const email = params.get("email") || "";
      setOauthError(`Access denied: ${email} is not a @gofynd.com account. Please use your Fynd Google account.`);
    } else if (err) {
      setOauthError("Google login failed. Please try again.");
    }
  }, []);

  function handleOpenQueryBee() {
    if (qbUser) {
      navigate("/querybee/dashboard");
    } else {
      const origin = window.location.origin;
      window.location.href = `/api/qb/auth/google?origin=${encodeURIComponent(origin)}`;
    }
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: "#F5F5F7",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>

      {/* ── LEFT PANEL ── */}
      <div style={{
        flex: "1 1 55%",
        maxWidth: "55%",
        padding: "48px 56px",
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
        borderRight: "1px solid #E5E7EB",
      }}>

        {/* Brand: logo + QueryBee */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
          <img
            src="/manus-storage/fynd-heart-white_fe76ae1e.png"
            alt="Fynd"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "#1C1C1E",
              padding: "6px",
              objectFit: "contain",
            }}
          />
          <span style={{
            fontSize: "1.5rem",
            fontWeight: 800,
            color: "#1C1C1E",
            letterSpacing: "-0.03em",
          }}>QueryBee</span>
        </div>

        {/* Hero headline */}
        <div style={{ flex: 1 }}>
          <h1 style={{
            fontSize: "2.5rem",
            fontWeight: 800,
            color: "#1C1C1E",
            lineHeight: 1.15,
            marginBottom: "12px",
            letterSpacing: "-0.03em",
          }}>
            BigQuery, <span style={{ color: "#7C5CFC" }}>effortless.</span>
          </h1>
          <p style={{
            fontSize: "0.95rem",
            color: "#6B7280",
            marginBottom: "32px",
            lineHeight: 1.6,
          }}>
            Run, explore, and analyse your data — all in one place.
          </p>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "32px", marginBottom: "32px" }}>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#1C1C1E" }}>10+</div>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9AA0AB", letterSpacing: "0.08em", textTransform: "uppercase" }}>Datasets</div>
            </div>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#1C1C1E" }}>∞</div>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9AA0AB", letterSpacing: "0.08em", textTransform: "uppercase" }}>Queries</div>
            </div>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #E5E7EB", marginBottom: "28px" }} />

          {/* Feature cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}>
            {[
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
                title: "SQL Query Runner",
                sub: "Write & run BigQuery SQL instantly",
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>,
                title: "Table Explorer",
                sub: "Browse schemas, rows & metadata",
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
                title: "BQ File Upload",
                sub: "Upload CSV/XLSX to BigQuery tables",
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>,
                title: "Pipelines",
                sub: "Run scheduled data pipelines",
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
                title: "Export Results",
                sub: "Download as CSV or Excel",
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                title: "Team Access",
                sub: "Manage user scopes & permissions",
              },
            ].map((f, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "14px 16px",
                background: "#F9F9FB",
                borderRadius: "10px",
                border: "1px solid #E5E7EB",
              }}>
                <span style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "rgba(124,92,252,0.1)",
                  color: "#7C5CFC",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {f.icon}
                </span>
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1C1C1E", margin: 0 }}>{f.title}</p>
                  <p style={{ fontSize: "0.72rem", color: "#9AA0AB", margin: "2px 0 0" }}>{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "32px",
          paddingTop: "20px",
          borderTop: "1px solid #E5E7EB",
        }}>
          <Link href="/" style={{
            fontSize: "0.8rem",
            color: "#6B7280",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}>← Back to FinOps</Link>
          <p style={{ fontSize: "0.75rem", color: "#9AA0AB", margin: 0 }}>© 2026 Fynd FinOps. All rights reserved.</p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{
        flex: "1 1 45%",
        maxWidth: "45%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 40px",
        background: "#F5F5F7",
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
            width: "96px",
            height: "96px",
            borderRadius: "24px",
            background: "#1C1C1E",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "24px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <svg viewBox="0 0 64 64" fill="none" width="52" height="52">
              <path d="M32 4 L56 18 L56 46 L32 60 L8 46 L8 18 Z" fill="white" fillOpacity="0.08"/>
              <path d="M18 24 L26 32 L18 40" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <rect x="30" y="24" width="16" height="3.5" rx="1.75" fill="white" fillOpacity="0.9"/>
              <rect x="30" y="31" width="11" height="3.5" rx="1.75" fill="white" fillOpacity="0.6"/>
              <rect x="30" y="38" width="14" height="3.5" rx="1.75" fill="white" fillOpacity="0.75"/>
              <circle cx="50" cy="14" r="5" fill="#7C5CFC" opacity="0.9"/>
            </svg>
          </div>

          {/* Welcome text */}
          {qbUser ? (
            <>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#1C1C1E", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                Welcome, <span style={{ color: "#7C5CFC" }}>{qbUser.name || qbUser.email.split("@")[0]}!</span>
              </h2>
              <p style={{ fontSize: "0.82rem", color: "#6B7280", margin: "0 0 24px" }}>{qbUser.email}</p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#1C1C1E", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                Welcome back
              </h2>
              <p style={{ fontSize: "0.82rem", color: "#6B7280", margin: "0 0 24px", lineHeight: 1.6 }}>
                Your BigQuery explorer for data,<br />analytics, and reporting.
              </p>
            </>
          )}

          {/* OAuth error */}
          {oauthError && (
            <div style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "16px",
              fontSize: "12px",
              color: "#ef4444",
              textAlign: "center",
              width: "100%",
            }}>
              {oauthError}
            </div>
          )}

          {/* CTA button */}
          {qbLoading ? (
            <button disabled style={{
              width: "100%",
              padding: "14px 24px",
              borderRadius: "50px",
              border: "none",
              background: "#C4B5FD",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: "not-allowed",
              opacity: 0.7,
            }}>
              Loading...
            </button>
          ) : qbUser ? (
            <button onClick={handleOpenQueryBee} style={{
              width: "100%",
              padding: "14px 24px",
              borderRadius: "50px",
              border: "none",
              background: "#7C5CFC",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(124,92,252,0.35)",
              transition: "background 0.15s, box-shadow 0.15s",
            }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = "#6B4EE8"; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = "#7C5CFC"; }}
            >
              Visit QueryBee
            </button>
          ) : (
            <button onClick={handleOpenQueryBee} style={{
              width: "100%",
              padding: "14px 24px",
              borderRadius: "50px",
              border: "none",
              background: "#7C5CFC",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 16px rgba(124,92,252,0.35)",
              transition: "background 0.15s",
            }}>
              {/* Google G icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" fillOpacity="0.85"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" fillOpacity="0.7"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" fillOpacity="0.9"/>
              </svg>
              Sign in with Google
            </button>
          )}

          {/* Sign out */}
          {qbUser && (
            <button onClick={qbLogout} style={{
              marginTop: "12px",
              background: "none",
              border: "none",
              color: "#9AA0AB",
              fontSize: "12px",
              cursor: "pointer",
              textDecoration: "underline",
            }}>
              Sign out
            </button>
          )}

          <p style={{ marginTop: "16px", fontSize: "11px", color: "#9AA0AB", textAlign: "center" }}>
            Only @gofynd.com accounts are permitted
          </p>
        </div>
      </div>

    </div>
  );
}
