/**
 * LedgerX Homepage — Split-panel landing page
 *
 * Left: dark teal panel with logo, headline, feature cards, back button
 * Right: white panel with app icon, welcome card, Open LedgerX CTA
 */

import { Link } from "wouter";

// ── SVG Icons ────────────────────────────────────────────────────────────────

function AppIcon() {
  return (
    <svg width="148" height="148" viewBox="0 0 148 148" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <linearGradient id="lx-bgG" x1="0" y1="0" x2="148" y2="148" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2e6f94" />
          <stop offset="100%" stopColor="#0f2d40" />
        </linearGradient>
        <filter id="lx-sh" x="-10%" y="-6%" width="120%" height="120%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#000" floodOpacity="0.28" />
        </filter>
      </defs>
      <rect width="148" height="148" rx="32" fill="url(#lx-bgG)" />
      <rect width="148" height="60" rx="32" fill="white" fillOpacity="0.05" />
      <g filter="url(#lx-sh)">
        <rect x="26" y="16" width="66" height="86" rx="8" fill="white" fillOpacity="0.95" />
      </g>
      <path d="M74 16 L92 34 L74 34 Z" fill="white" fillOpacity="0.3" />
      <rect x="74" y="16" width="18" height="18" rx="2" fill="white" fillOpacity="0.18" />
      <circle cx="38" cy="50" r="5" fill="#1E4D6B" fillOpacity="0.12" />
      <polyline points="35,50 37.5,52.5 41,48" stroke="#1E4D6B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="46" y="48" width="26" height="3" rx="1.5" fill="#1E4D6B" fillOpacity="0.22" />
      <rect x="46" y="53" width="17" height="2" rx="1" fill="#1E4D6B" fillOpacity="0.12" />
      <circle cx="38" cy="66" r="5" fill="#1E4D6B" fillOpacity="0.12" />
      <polyline points="35,66 37.5,68.5 41,64" stroke="#1E4D6B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="46" y="64" width="22" height="3" rx="1.5" fill="#1E4D6B" fillOpacity="0.22" />
      <rect x="46" y="69" width="15" height="2" rx="1" fill="#1E4D6B" fillOpacity="0.12" />
      <circle cx="38" cy="82" r="5" fill="#1E4D6B" fillOpacity="0.08" stroke="#1E4D6B" strokeWidth="1.2" strokeOpacity="0.25" />
      <line x1="38" y1="79.5" x2="38" y2="82" stroke="#1E4D6B" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.4" />
      <line x1="38" y1="82" x2="40" y2="84" stroke="#1E4D6B" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.4" />
      <rect x="46" y="80" width="18" height="3" rx="1.5" fill="#1E4D6B" fillOpacity="0.15" />
      <g filter="url(#lx-sh)">
        <rect x="72" y="66" width="52" height="60" rx="9" fill="white" fillOpacity="0.12" />
        <rect x="72" y="66" width="52" height="60" rx="9" stroke="white" strokeOpacity="0.2" strokeWidth="1" />
      </g>
      <rect x="78" y="72" width="40" height="16" rx="4" fill="white" fillOpacity="0.08" />
      <text x="115" y="84" textAnchor="end" fill="white" fillOpacity="0.9" fontSize="9" fontFamily="monospace" fontWeight="700">2,93,433</text>
      {[0, 1, 2, 3].map(col =>
        [0, 1, 2].map(row => (
          <rect key={`${col}-${row}`} x={78 + col * 10} y={93 + row * 10} width="8" height="7" rx="2"
            fill="white" fillOpacity={col === 3 && row === 2 ? 0.55 : 0.18} />
        ))
      )}
      <rect x="108" y="93" width="8" height="17" rx="2" fill="white" fillOpacity="0.35" />
      <ellipse cx="50" cy="128" rx="18" ry="5" fill="white" fillOpacity="0.06" />
      <ellipse cx="50" cy="124" rx="18" ry="5" fill="white" fillOpacity="0.1" />
      <ellipse cx="50" cy="120" rx="18" ry="5" fill="white" fillOpacity="0.18" />
      <text x="50" y="123" textAnchor="middle" fill="white" fillOpacity="0.65" fontSize="7" fontWeight="800" fontFamily="sans-serif">₹</text>
      <rect y="108" width="148" height="40" rx="32" fill="white" fillOpacity="0.03" />
    </svg>
  );
}

function LedgerXLogoIcon() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="52" height="52" rx="12" fill="white" fillOpacity="0.15" />
      <rect x="10" y="8" width="24" height="30" rx="3" fill="white" fillOpacity="0.9" />
      <path d="M28 8 L34 14 L28 14 Z" fill="white" fillOpacity="0.35" />
      <rect x="28" y="8" width="6" height="6" rx="1" fill="white" fillOpacity="0.2" />
      <rect x="14" y="16" width="14" height="2" rx="1" fill="#1E4D6B" fillOpacity="0.35" />
      <rect x="14" y="20" width="10" height="2" rx="1" fill="#1E4D6B" fillOpacity="0.25" />
      <rect x="14" y="24" width="12" height="2" rx="1" fill="#1E4D6B" fillOpacity="0.25" />
      <rect x="14" y="28" width="8" height="2" rx="1" fill="#1E4D6B" fillOpacity="0.2" />
      {/* coin */}
      <circle cx="38" cy="38" r="8" fill="#f5c518" />
      <text x="38" y="42" textAnchor="middle" fill="#1E4D6B" fontSize="9" fontWeight="800" fontFamily="sans-serif">₹</text>
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function VendorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function TaxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function LedgerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function SubmitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// ── Feature cards data ────────────────────────────────────────────────────────

const FEATURES = [
  { icon: <PdfIcon />,    title: "Invoice Preview",          sub: "Upload & parse PDF invoices instantly" },
  { icon: <GlobeIcon />,  title: "Domestic & International", sub: "Dual-mode booking for all invoice types" },
  { icon: <VendorIcon />, title: "Vendor Management",        sub: "Auto-fill vendor details & GSTIN" },
  { icon: <TaxIcon />,    title: "GST & RCM Handling",       sub: "CGST, SGST, IGST & reverse charge" },
  { icon: <LedgerIcon />, title: "Ledger Mapping",           sub: "Route to correct GL accounts automatically" },
  { icon: <SubmitIcon />, title: "One-click Submit",         sub: "End-to-end invoice booking & filing" },
];

// ── Page component ────────────────────────────────────────────────────────────

export default function LedgerXHome() {
  return (
    <div className="lx-split">
      {/* ── Left panel ── */}
      <div className="lx-left">
        {/* Brand */}
        <div className="lx-brand">
          <LedgerXLogoIcon />
          <span className="lx-brand-name">LedgerX</span>
        </div>

        {/* Body */}
        <div className="lx-body">
          <h1 className="lx-headline">
            Invoice Booking,<br />end-to-end.
          </h1>
          <p className="lx-tagline">Account Payable operations optimised</p>

          <div className="lx-divider" />

          <div className="lx-feature-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className="lx-feature-card">
                <span className="lx-feature-icon">{f.icon}</span>
                <div>
                  <p className="lx-feature-title">{f.title}</p>
                  <p className="lx-feature-sub">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="lx-divider" />
        </div>

        {/* Footer row */}
        <div className="lx-bottom-row">
          <Link href="/" className="lx-back-btn">← Back to FinOps</Link>
          <p className="lx-footer">© 2025 Fin Ops. All rights reserved.</p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="lx-right">
        <div className="lx-welcome-card">
          <AppIcon />
          <h2 className="lx-welcome-title">Welcome back</h2>
          <p className="lx-welcome-sub">
            Your central hub for invoice booking, approvals,<br />and financial workflows.
          </p>
          <Link href="/ledgerx/dp-invoice-booking" className="lx-cta-btn">
            <DocIcon />
            Open LedgerX
          </Link>
        </div>
      </div>
    </div>
  );
}
