import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useLcUser } from "@/contexts/LcUserContext";

const BRANDMARK_BLACK = "/fynd-logo.png";
// Same asset, rendered white via CSS filter for use on dark backgrounds (footer).
const BRANDMARK_WHITE = "/fynd-logo.png";

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const FEATURES = [
  {
    icon: "fa-solid fa-chart-line",
    title: "Live Contract Tracker",
    desc: "Real-time status across Open, Closed, and On Hold — always up to date.",
  },
  {
    icon: "fa-solid fa-arrows-rotate",
    title: "Request Workflows",
    desc: "Submit, track, and get legal requests approved in seconds.",
  },
  {
    icon: "fa-solid fa-folder-open",
    title: "Agreement Documents",
    desc: "NDA, MSA, SLA, KYC & vendor agreements on demand.",
  },
  {
    icon: "fa-solid fa-users",
    title: "Team Analytics",
    desc: "Per-reviewer stats, workload tracking & SLA compliance.",
  },
  {
    icon: "fa-solid fa-gavel",
    title: "Dispute & Litigation",
    desc: "Track disputes, court cases & trademark filings in one place.",
  },
  {
    icon: "fa-solid fa-shield-halved",
    title: "Compliance Hub",
    desc: "Stay ahead of regulatory requirements & deadlines.",
  },
];

const TEAM = [
  {
    initials: "AS",
    name: "Aditi Sinha",
    role: "Legal Associate",
    email: "aditi.sinha@gofynd.com",
  },
  {
    initials: "SP",
    name: "Samiksha Parekh",
    role: "Legal Associate",
    email: "samiksha.parekh@gofynd.com",
  },
  {
    initials: "FA",
    name: "Farheen Ansari",
    role: "Head of Legal",
    email: "farheen.ansari@gofynd.com",
  },
];

const STATS = [
  { value: "274+", label: "Active Contracts" },
  { value: "8", label: "Regions Covered" },
  { value: "3", label: "Legal Reviewers" },
  { value: "69%", label: "Avg Resolution Rate" },
];

const VIDEO_URL = "/manus-storage/Legal_Connect_User_Guide_ee9a9e41.mp4";

export default function LegalConnect() {
  const { lcUser, lcLoading, lcLogout } = useLcUser();
  const [, navigate] = useLocation();
  const [oauthError, setOauthError] = useState<string | null>(null);
  useEffect(() => {
    document.title = "Legal Connect";
    return () => { document.title = "Fynd FinOps"; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("lc_error");
    if (err === "domain_not_allowed") {
      const email = params.get("email") || "";
      setOauthError(`Access denied: ${email} is not a @gofynd.com account.`);
    } else if (err) {
      setOauthError("Google login failed. Please try again.");
    }
  }, []);

  function handleEnter() {
    if (lcUser) {
      navigate("/legal-connect/dashboard");
    } else {
      const origin = window.location.origin;
      window.location.href = `/api/lc/auth/google?origin=${encodeURIComponent(origin)}`;
    }
  }

  return (
    <div className="lcw-root">
      {/* ── STICKY NAV ── */}
      <nav className="lcw-nav">
        <div className="lcw-nav-inner">
          <div className="lcw-nav-brand">
            <img src={BRANDMARK_BLACK} alt="Fynd" className="lcw-nav-logo" />
            <span className="lcw-nav-name">Legal Connect</span>
          </div>
          <div className="lcw-nav-links">
            <button className="lcw-nav-link" onClick={() => smoothScrollTo("features")}>Features</button>
            <button className="lcw-nav-link" onClick={() => smoothScrollTo("team")}>Team</button>
          </div>
          <button className="lcw-nav-cta" onClick={handleEnter}>
            {lcLoading ? "Loading…" : lcUser ? "Enter Legal Connect →" : "Sign in with Google →"}
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="lcw-hero">
        <div className="lcw-hero-inner">
          <div className="lcw-hero-eyebrow">Internal Legal Platform · Fynd</div>
          <h1 className="lcw-hero-h1">
            Legal Connect,<br />
            <span className="lcw-hero-accent">Where Every Clause Counts</span>
          </h1>
          <p className="lcw-hero-sub">
            One unified platform for contracts, compliance, disputes, and legal workflows —
            built for Fynd teams moving fast.
          </p>
          {oauthError && (
            <div className="lcw-oauth-err">{oauthError}</div>
          )}
          <div className="lcw-hero-actions">
            <button className="lcw-hero-btn-primary" onClick={handleEnter}>
              {lcLoading ? "Loading…" : lcUser ? "Enter Legal Connect →" : "Sign in with Google →"}
            </button>
            {lcUser && (
              <button className="lcw-hero-btn-ghost" onClick={lcLogout}>Sign out</button>
            )}
          </div>
          {!lcUser && (
            <p className="lcw-hero-note">Only @gofynd.com accounts are permitted</p>
          )}
          {lcUser && (
            <p className="lcw-hero-note">Signed in as {lcUser.email}</p>
          )}
        </div>
      </section>

      {/* ── VIDEO SECTION ── */}
      <section className="lcw-video-section">
        <div className="lcw-video-label">PLATFORM WALKTHROUGH</div>
        <div className="lcw-device-frame">
          <div className="lcw-device-topbar">
            <div className="lcw-device-dots">
              <span className="lcw-dot lcw-dot-red" />
              <span className="lcw-dot lcw-dot-yellow" />
              <span className="lcw-dot lcw-dot-green" />
            </div>
            <div className="lcw-device-url">legal-connect · fynd internal</div>
          </div>
          <div className="lcw-device-screen">
            <video
              className="lcw-video"
              src={VIDEO_URL}
              autoPlay
              muted
              loop
              playsInline
            />
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="lcw-stats-strip">
        {STATS.map((s) => (
          <div key={s.label} className="lcw-stat-item">
            <div className="lcw-stat-value">{s.value}</div>
            <div className="lcw-stat-label">{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── FEATURES ── */}
      <section className="lcw-features" id="features">
        <div className="lcw-section-inner">
          <div className="lcw-section-eyebrow">WHAT'S INSIDE</div>
          <h2 className="lcw-section-h2">Legal Intelligence Delivered As Modules</h2>
          <p className="lcw-section-sub">
            Purpose-built modules designed for Fynd's legal workflows, assembled into one unified platform.
          </p>
          <div className="lcw-feat-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="lcw-feat-card">
                <div className="lcw-feat-icon">
                  <i className={f.icon} />
                </div>
                <div className="lcw-feat-title">{f.title}</div>
                <div className="lcw-feat-desc">{f.desc}</div>
                <div className="lcw-feat-arrow">Get started →</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section className="lcw-team" id="team">
        <div className="lcw-section-inner">
          <div className="lcw-section-eyebrow">THE LEGAL TEAM</div>
          <h2 className="lcw-section-h2">People to Reach Out To</h2>
          <p className="lcw-section-sub">
            For contract reviews, legal queries, and compliance guidance — connect with the team directly.
          </p>
          <div className="lcw-team-grid">
            {TEAM.map((m) => (
              <div key={m.name} className="lcw-team-card">
                <div className="lcw-team-avatar">{m.initials}</div>
                <div className="lcw-team-name">{m.name}</div>
                <div className="lcw-team-role">{m.role}</div>
                <a href={`mailto:${m.email}`} className="lcw-team-email">{m.email}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lcw-footer">
        <div className="lcw-footer-watermark">LEGAL CONNECT</div>
        <div className="lcw-footer-inner">
          <div className="lcw-footer-brand">
            <img src={BRANDMARK_WHITE} alt="Fynd" className="lcw-footer-logo" style={{ filter: "invert(1) brightness(2)" }} />
            <span className="lcw-footer-name">Legal Connect</span>
          </div>
          <div className="lcw-footer-tagline">Legal Intelligence Layer · Fynd Internal Platform</div>
          <div className="lcw-footer-links">
            <Link href="/" className="lcw-footer-link">← Back to FinOps</Link>
            <button className="lcw-footer-link lcw-footer-link-btn" onClick={handleEnter}>
              Enter Platform →
            </button>
          </div>
          <div className="lcw-footer-copy">
            © 2026 Fynd FinOps · Legal Connect · All rights reserved · Internal Use Only
          </div>
        </div>
      </footer>
    </div>
  );
}

// FyndHeartIcon — exported for backward compat with LegalDashboard imports
export function FyndHeartIcon({ className = "" }: { className?: string }) {
  return <img src={BRANDMARK_BLACK} alt="Fynd" className={className} />;
}
