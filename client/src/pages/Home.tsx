/**
 * Fynd FinOps Homepage — Domain Selector
 *
 * Design: Deep Space Enterprise Dark / Glassmorphism
 * - Deep navy background (#060b18) with rotating aurora gradients
 * - Glassmorphic app cards with frosted borders and hover effects
 * - Silver metallic 3D ring decorations at corners
 * - Shimmer ring animation on logo mark
 * - Twinkling star field
 * - Entrance animations (fadeUp, containerIn)
 */

import { Link } from "wouter";

export default function Home() {

  return (
    <div className="finops-root">
      {/* Silver 3D rings — top left (no inner dotted borders) */}
      <svg className="ring ring-tl" viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="metal-tl" x1="40" y1="40" x2="260" y2="260" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e8edf5"/>
            <stop offset="15%" stopColor="#7a8a9e"/>
            <stop offset="30%" stopColor="#d8dfe8"/>
            <stop offset="50%" stopColor="#5a6a80"/>
            <stop offset="70%" stopColor="#c0cad8"/>
            <stop offset="85%" stopColor="#8898ac"/>
            <stop offset="100%" stopColor="#e0e6f0"/>
          </linearGradient>
          <filter id="glow-tl">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>
        {/* Outer thick metallic ring only */}
        <rect x="30" y="30" width="220" height="220" rx="50" ry="50" stroke="url(#metal-tl)" strokeWidth="18" fill="none" filter="url(#glow-tl)"/>
        <circle cx="80" cy="35" r="1.5" fill="white" opacity="0.8"/>
        <circle cx="40" cy="120" r="1" fill="white" opacity="0.6"/>
        <circle cx="240" cy="60" r="1.2" fill="white" opacity="0.7"/>
        <circle cx="55" cy="200" r="1" fill="white" opacity="0.5"/>
      </svg>

      {/* Silver 3D rings — bottom right (no inner dotted borders) */}
      <svg className="ring ring-br" viewBox="0 0 340 340" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="metal-br" x1="300" y1="300" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e0e6f0"/>
            <stop offset="12%" stopColor="#8898ac"/>
            <stop offset="28%" stopColor="#d0d8e4"/>
            <stop offset="45%" stopColor="#606e82"/>
            <stop offset="60%" stopColor="#c8d2e0"/>
            <stop offset="78%" stopColor="#7a8a9e"/>
            <stop offset="100%" stopColor="#e8edf5"/>
          </linearGradient>
          <filter id="glow-br">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>
        {/* Outer thick metallic ring only */}
        <rect x="60" y="60" width="240" height="240" rx="55" ry="55" stroke="url(#metal-br)" strokeWidth="20" fill="none" filter="url(#glow-br)"/>
        {/* Second smaller ring for depth */}
        <rect x="90" y="90" width="180" height="180" rx="42" ry="42" stroke="url(#metal-br)" strokeWidth="10" fill="none" opacity="0.4"/>
        <circle cx="280" cy="100" r="1.5" fill="white" opacity="0.8"/>
        <circle cx="300" cy="220" r="1.2" fill="white" opacity="0.7"/>
        <circle cx="120" cy="290" r="1" fill="white" opacity="0.6"/>
        <circle cx="200" cy="70" r="1.3" fill="white" opacity="0.5"/>
      </svg>

      {/* Background layers */}
      <div className="aurora"/>
      <div className="spotlight"/>
      <div className="noise-overlay"/>
      <div className="vignette"/>

      {/* Main content */}
      <div className="finops-container">
        {/* Header */}
        <div className="finops-header">
          <div className="logo-mark">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="silver-logo" x1="20" y1="15" x2="80" y2="85" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#e8edf5"/>
                  <stop offset="30%" stopColor="#c0cce0"/>
                  <stop offset="60%" stopColor="#a0b0c8"/>
                  <stop offset="100%" stopColor="#dde4f0"/>
                </linearGradient>
              </defs>
              <path d="M55 20 L25 50 L50 75" stroke="url(#silver-logo)" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M45 80 L75 50 L50 25" stroke="url(#silver-logo)" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="brand-title">Fynd FinOps</div>
          <div className="brand-sub">Select your domain to continue</div>
        </div>

        {/* App cards */}
        <div className="app-grid">

          {/* Legal Connect */}
          <Link className="app-card legal" href="/legal-connect">
            <div className="app-icon legal-icon">
              <svg viewBox="-4 1 40 28" fill="none">
                <rect x="15.25" y="6" width="1.5" height="17" rx="0.75" fill="white"/>
                <rect x="9" y="22.5" width="14" height="2.5" rx="1.25" fill="white"/>
                <rect x="3.5" y="7" width="25" height="1.75" rx="0.875" fill="white"/>
                <line x1="5.5" y1="8.75" x2="4" y2="15" stroke="white" strokeWidth="1.25" strokeLinecap="round"/>
                <line x1="5.5" y1="8.75" x2="9" y2="15" stroke="white" strokeWidth="1.25" strokeLinecap="round"/>
                <path d="M2.5 15 Q6.5 20.5 10.5 15 Z" fill="white"/>
                <line x1="26.5" y1="8.75" x2="23" y2="15" stroke="white" strokeWidth="1.25" strokeLinecap="round"/>
                <line x1="26.5" y1="8.75" x2="28" y2="15" stroke="white" strokeWidth="1.25" strokeLinecap="round"/>
                <path d="M21.5 15 Q25.5 20.5 29.5 15 Z" fill="white"/>
              </svg>
            </div>
            <div className="app-info">
              <div className="app-name">Legal Connect <span className="badge legal-b">Legal</span></div>
              <div className="app-desc">Contracts · Agreements · Compliance</div>
            </div>
            <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </Link>

        </div>

        {/* Footer */}
        <div className="finops-footer">
          <span>Fynd FinOps Platform</span>
          <div className="dot"/>
          <span>Internal Use Only</span>
        </div>
      </div>
    </div>
  );
}
