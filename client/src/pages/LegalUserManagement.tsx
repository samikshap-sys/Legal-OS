/**
 * LegalUserManagement — Legal Connect User Management Panel
 *
 * Theme: Legal Connect navy/blue (#1C1C1E, #F15A29, #F15A29) + white
 * Admin view: add/edit/remove users with scope checkboxes grouped by section
 * Non-admin view: read-only list of all provisioned users and their scopes
 *
 * Admins: ninadmandavkar, aditisinha, samikshap, farheenansari @gofynd.com
 */

import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useLcUser } from "@/contexts/LcUserContext";

// ── Types ─────────────────────────────────────────────────────────────────────
type UserRow = {
  id: number;
  email: string;
  name: string;
  scopes: string[];
  assignedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ── Scope definitions (mirrors server LC_SCOPES) ─────────────────────────────
const SCOPE_GROUPS: Record<string, { id: string; label: string }[]> = {
  Core: [
    { id: "dashboard",  label: "Dashboard" },
    { id: "tracker",    label: "Live Tracker" },
    { id: "requests",   label: "Requests" },
  ],
  Operations: [
    { id: "workflows",  label: "Workflows" },
    { id: "templates",  label: "Templates" },
    { id: "team",       label: "Team" },
  ],
  Admin: [
    { id: "requests-logs", label: "Request Logs" },
  ],
};

const ALL_SCOPES = Object.values(SCOPE_GROUPS).flat();

// ── Colour helpers ────────────────────────────────────────────────────────────
const AVATAR_PALETTE = [
  "#1C1C1E", "#F15A29", "#F15A29", "#E8472A", "#F15A29",
  "#E8472A", "#F15A29", "#F15A29", "#FF7043", "#FF8A65",
];

function avatarColor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function initials(name: string, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// ── Group badge colours ───────────────────────────────────────────────────────
const GROUP_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  Core:       { bg: "rgba(37,99,235,0.10)", text: "#F15A29", border: "rgba(37,99,235,0.20)" },
  Operations: { bg: "rgba(26,40,85,0.10)",  text: "#1C1C1E", border: "rgba(26,40,85,0.20)" },
  Admin:      { bg: "rgba(124,58,237,0.10)", text: "#7c3aed", border: "rgba(124,58,237,0.20)" },
};

function ScopeTag({ label, group }: { label: string; group?: string }) {
  const c = GROUP_COLOURS[group ?? "Core"] ?? GROUP_COLOURS.Core;
  return (
    <span style={{
      display: "inline-block",
      background: c.bg, color: c.text,
      border: `1px solid ${c.border}`,
      borderRadius: 4, padding: "1px 7px",
      fontSize: 11, fontWeight: 600,
    }}>{label}</span>
  );
}

// ── Scope group for a given scope id ─────────────────────────────────────────
function scopeGroup(id: string): string {
  for (const [grp, items] of Object.entries(SCOPE_GROUPS)) {
    if (items.some(s => s.id === id)) return grp;
  }
  return "Core";
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
function ScopeModal({
  initial,
  onClose,
  onSave,
  isSaving,
}: {
  initial: { email: string; name: string; scopes: string[] } | null;
  onClose: () => void;
  onSave: (email: string, name: string, scopes: string[]) => void;
  isSaving: boolean;
}) {
  const isEdit = !!initial;
  const [email, setEmail] = useState(initial?.email ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.scopes ?? []));

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroup(ids: string[]) {
    const allOn = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => allOn ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function selectAll() { setSelected(new Set(ALL_SCOPES.map(s => s.id))); }
  function clearAll()  { setSelected(new Set()); }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15,25,60,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#fff", borderRadius: 14, width: 520, maxWidth: "95vw",
        boxShadow: "0 20px 60px rgba(26,40,85,0.22), 0 4px 16px rgba(26,40,85,0.12)",
        overflow: "hidden",
      }}>
        {/* Modal header */}
        <div style={{
          background: "linear-gradient(135deg, #1C1C1E 0%, #F15A29 100%)",
          padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isEdit
                  ? <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
                  : <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></>
                }
              </svg>
            </div>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
              {isEdit ? "Edit User Scopes" : "Add New User"}
            </span>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6,
            width: 28, height: 28, cursor: "pointer", color: "rgba(255,255,255,0.8)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "20px 24px" }}>
          {/* User fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                Email Address *
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isEdit}
                placeholder="user@gofynd.com"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 7,
                  border: "1.5px solid #d0d5de", fontSize: 13, outline: "none",
                  background: isEdit ? "#f8f9fb" : "#fff", color: "#202124",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Full name (optional)"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 7,
                  border: "1.5px solid #d0d5de", fontSize: 13, outline: "none",
                  color: "#202124", boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Scope selection */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Sidebar Scopes ({selected.size}/{ALL_SCOPES.length})
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={selectAll} style={{
                  fontSize: 11, fontWeight: 600, color: "#F15A29", background: "rgba(37,99,235,0.08)",
                  border: "1px solid rgba(37,99,235,0.2)", borderRadius: 5, padding: "3px 9px", cursor: "pointer",
                }}>All</button>
                <button onClick={clearAll} style={{
                  fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#f3f4f6",
                  border: "1px solid #e5e7eb", borderRadius: 5, padding: "3px 9px", cursor: "pointer",
                }}>None</button>
              </div>
            </div>

            {Object.entries(SCOPE_GROUPS).map(([grp, items]) => {
              const c = GROUP_COLOURS[grp] ?? GROUP_COLOURS.Core;
              const allOn = items.every(s => selected.has(s.id));
              return (
                <div key={grp} style={{
                  marginBottom: 10, border: "1.5px solid #e0e3e8", borderRadius: 9,
                  overflow: "hidden",
                }}>
                  {/* Group header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 12px", background: "#f8f9fb",
                    borderBottom: "1px solid #e0e3e8",
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: c.text,
                      background: c.bg, border: `1px solid ${c.border}`,
                      borderRadius: 4, padding: "1px 8px",
                    }}>{grp}</span>
                    <button onClick={() => toggleGroup(items.map(s => s.id))} style={{
                      fontSize: 11, fontWeight: 600, color: allOn ? "#dc2626" : "#F15A29",
                      background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
                    }}>
                      {allOn ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  {/* Scope checkboxes */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                    {items.map((s, idx) => (
                      <label key={s.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 12px", cursor: "pointer",
                        borderBottom: idx < items.length - 2 ? "1px solid #f0f2f5" : "none",
                        borderRight: idx % 2 === 0 ? "1px solid #f0f2f5" : "none",
                        background: selected.has(s.id) ? "rgba(37,99,235,0.04)" : "#fff",
                        transition: "background 0.12s",
                      }}>
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggle(s.id)}
                          style={{ accentColor: "#F15A29", width: 14, height: 14, cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 500, color: "#202124" }}>{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
            <button onClick={onClose} style={{
              padding: "8px 18px", borderRadius: 7, border: "1.5px solid #d0d5de",
              background: "#fff", fontSize: 13, fontWeight: 600, color: "#5f6368", cursor: "pointer",
            }}>Cancel</button>
            <button
              onClick={() => onSave(email.trim(), name.trim(), Array.from(selected))}
              disabled={isSaving || !email.trim()}
              style={{
                padding: "8px 20px", borderRadius: 7, border: "none",
                background: isSaving || !email.trim()
                  ? "#9ca3af"
                  : "linear-gradient(135deg, #1C1C1E 0%, #F15A29 100%)",
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: isSaving || !email.trim() ? "not-allowed" : "pointer",
                boxShadow: "0 2px 8px rgba(26,40,85,0.25)",
              }}
            >
              {isSaving ? "Saving…" : isEdit ? "Update Scopes" : "Add User"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LegalUserManagement() {
  const { lcUser } = useLcUser();
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<{ email: string; name: string; scopes: string[] } | null>(null);
  const [search, setSearch] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const { data: adminData } = trpc.legalUserMgmt.isAdmin.useQuery();
  const { data: users, refetch } = trpc.legalUserMgmt.listUsers.useQuery();
  const { data: scopeDefs } = trpc.legalUserMgmt.getScopeDefinitions.useQuery();

  const isAdmin = adminData?.isAdmin ?? false;

  const removeMutation = trpc.legalUserMgmt.removeUser.useMutation({
    onSuccess: () => { setConfirmRemove(null); refetch(); },
  });

  const assignMutation = trpc.legalUserMgmt.assignScopes.useMutation({
    onSuccess: () => { setShowModal(false); setEditTarget(null); refetch(); },
  });

  const filtered = useMemo((): UserRow[] => {
    if (!users) return [];
    const q = search.toLowerCase();
    return (users as UserRow[]).filter((u: UserRow) =>
      u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    );
  }, [users, search]);

  const scopeMap = useMemo(() => {
    const m: Record<string, string> = {};
    (scopeDefs ?? []).forEach(s => { m[s.id] = s.label; });
    return m;
  }, [scopeDefs]);

  function openAdd() { setEditTarget(null); setShowModal(true); }
  function openEdit(u: { email: string; name: string; scopes: string[] }) {
    setEditTarget(u); setShowModal(true);
  }

  function handleSave(email: string, name: string, scopes: string[]) {
    assignMutation.mutate({ email, name, scopes });
  }

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!lcUser) {
    return (
      <div style={{ padding: "60px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1C1C1E", marginBottom: 6 }}>Authentication Required</div>
        <div style={{ fontSize: 13, color: "#9aa0ab" }}>Please sign in to Legal Connect to view this page.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px", minHeight: "100vh", background: "#f8f9fb", fontFamily: "inherit" }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              {/* Shield icon */}
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: "linear-gradient(135deg, #1C1C1E 0%, #F15A29 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(26,40,85,0.25)",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#1C1C1E", letterSpacing: -0.3 }}>
                User Management
              </h1>
              {isAdmin && (
                <span style={{
                  background: "linear-gradient(135deg, #1C1C1E, #F15A29)", color: "#fff",
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase",
                  padding: "2px 8px", borderRadius: 20,
                }}>Admin</span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#9aa0ab" }}>
              {isAdmin
                ? "Manage Legal Connect sidebar access for your team. Assign scopes to control which sections each user can see."
                : "View the access scopes assigned to Legal Connect users. Contact an admin to request changes."}
            </p>
          </div>
          {isAdmin && (
            <button onClick={openAdd} style={{
              display: "flex", alignItems: "center", gap: 7,
              background: "linear-gradient(135deg, #1C1C1E 0%, #F15A29 100%)",
              color: "#fff", border: "none", borderRadius: 9, padding: "10px 20px",
              cursor: "pointer", fontSize: 13, fontWeight: 700,
              boxShadow: "0 2px 10px rgba(26,40,85,0.30)",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add User
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {([
          {
            label: "Total Users",
            value: users?.length ?? 0,
            accent: "#1C1C1E",
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1C1C1E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            ),
          },
          {
            label: "Total Scopes",
            value: ALL_SCOPES.length,
            accent: "#F15A29",
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F15A29" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            ),
          },
          {
            label: "Fully Provisioned",
            value: (users as UserRow[] | undefined)?.filter((u: UserRow) => u.scopes.length === ALL_SCOPES.length).length ?? 0,
            accent: "#F15A29",
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F15A29" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
            ),
          },
        ] as { label: string; value: number; accent: string; icon: ReactNode }[]).map(stat => (
          <div key={stat.label} style={{
            background: "#fff", borderRadius: 10, padding: "14px 18px",
            border: "1px solid #e0e3e8", borderTop: `3px solid ${stat.accent}`,
            display: "flex", alignItems: "center", gap: 14,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 9,
              background: `${stat.accent}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>{stat.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.accent, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#9aa0ab", fontWeight: 600, marginTop: 2 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>



      {/* Search bar */}
      <div style={{
        background: "#fff", border: "1.5px solid #e0e3e8", borderRadius: 10,
        overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        {/* Table toolbar */}
        <div style={{
          padding: "12px 20px", borderBottom: "1px solid #e0e3e8",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 320 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              style={{
                border: "none", outline: "none", fontSize: 13, color: "#202124",
                background: "transparent", flex: 1,
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: "#9aa0ab", fontWeight: 500 }}>
            {filtered.length} user{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isAdmin ? "2fr 2.5fr 1fr 1fr auto" : "2fr 2.5fr 1fr 1fr",
          padding: "8px 20px",
          background: "#f8f9fb", borderBottom: "1.5px solid #e0e3e8",
        }}>
          {["User", "Scopes", "Coverage", "Last Updated", ...(isAdmin ? ["Actions"] : [])].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#9aa0ab", letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</div>
          ))}
        </div>

        {/* Table rows */}
        {!users ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#9aa0ab", fontSize: 13 }}>
            Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(26,40,85,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F15A29" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              {search ? "No users match your search" : "No users provisioned yet"}
            </div>
            <div style={{ fontSize: 12, color: "#9aa0ab" }}>
              {isAdmin ? "Click \"Add User\" to grant sidebar access to a team member." : "Contact an admin to set up access."}
            </div>
          </div>
        ) : (
          filtered.map((u: UserRow, idx: number) => {
            const coverage = ALL_SCOPES.length > 0 ? Math.round((u.scopes.length / ALL_SCOPES.length) * 100) : 0;
            const coverageColor = "#F15A29";
            return (
              <div key={u.email} style={{
                display: "grid",
                gridTemplateColumns: isAdmin ? "2fr 2.5fr 1fr 1fr auto" : "2fr 2.5fr 1fr 1fr",
                padding: "14px 20px", alignItems: "center",
                borderBottom: idx < filtered.length - 1 ? "1px solid #f0f2f5" : "none",
                background: idx % 2 === 0 ? "#fff" : "#fafbfc",
                transition: "background 0.15s",
              }}>
                {/* User */}
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: avatarColor(u.email),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 12, fontWeight: 800, flexShrink: 0,
                  }}>
                    {initials(u.name, u.email)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1C1C1E", lineHeight: 1.2 }}>
                      {u.name || u.email.split("@")[0]}
                    </div>
                    <div style={{ fontSize: 11, color: "#9aa0ab", marginTop: 1 }}>{u.email}</div>
                  </div>
                </div>

                {/* Scopes */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {u.scopes.length === 0 ? (
                    <span style={{ fontSize: 12, color: "#dc2626", fontStyle: "italic" }}>No access</span>
                  ) : u.scopes.length === ALL_SCOPES.length ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      background: "rgba(42,74,181,0.10)", color: "#F15A29",
                      border: "1px solid rgba(42,74,181,0.2)", borderRadius: 4,
                      padding: "2px 8px", fontSize: 11, fontWeight: 700,
                    }}>
                      ✓ Full Access
                    </span>
                  ) : (
                    u.scopes.slice(0, 4).map((sid: string) => (
                      <ScopeTag key={sid} label={scopeMap[sid] ?? sid} group={scopeGroup(sid)} />
                    )).concat(
                      u.scopes.length > 4 ? [
                        <span key="more" style={{
                          fontSize: 11, color: "#6b7280", background: "#f3f4f6",
                          border: "1px solid #e5e7eb", borderRadius: 4, padding: "1px 7px",
                        }}>+{u.scopes.length - 4} more</span>
                      ] : []
                    )
                  )}
                </div>

                {/* Coverage */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: coverageColor, marginBottom: 3 }}>
                    {coverage}%
                  </div>
                  <div style={{ height: 4, background: "#e0e3e8", borderRadius: 2, width: 80 }}>
                    <div style={{ height: "100%", width: `${coverage}%`, background: coverageColor, borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                </div>

                {/* Last updated */}
                <div style={{ fontSize: 11, color: "#9aa0ab" }}>
                  {u.updatedAt ? new Date(u.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  {u.assignedBy && (
                    <div style={{ fontSize: 10, color: "#c0c4cc", marginTop: 1 }}>
                      by {u.assignedBy.split("@")[0]}
                    </div>
                  )}
                </div>

                {/* Actions — admin only */}
                {isAdmin && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => openEdit({ email: u.email, name: u.name, scopes: u.scopes })}
                      title="Edit scopes"
                      style={{
                        width: 30, height: 30, borderRadius: 7,
                        background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.18)",
                        color: "#F15A29", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.15s",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setConfirmRemove(u.email)}
                      title="Remove user"
                      style={{
                        width: 30, height: 30, borderRadius: 7,
                        background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.18)",
                        color: "#dc2626", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.15s",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Scope legend */}
      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.entries(GROUP_COLOURS).map(([grp, c]) => (
          <div key={grp} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              display: "inline-block", width: 10, height: 10, borderRadius: 2,
              background: c.bg, border: `1px solid ${c.border}`,
            }}/>
            <span style={{ fontSize: 11, color: "#9aa0ab", fontWeight: 500 }}>{grp}</span>
          </div>
        ))}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <ScopeModal
          initial={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
          onSave={handleSave}
          isSaving={assignMutation.isPending}
        />
      )}

      {/* Confirm remove dialog */}
      {confirmRemove && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1001,
          background: "rgba(15,25,60,0.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: "24px 28px", width: 380,
            boxShadow: "0 20px 60px rgba(26,40,85,0.22)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: "rgba(220,38,38,0.10)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1C1C1E" }}>Remove User Access</span>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#5f6368", lineHeight: 1.5 }}>
              This will revoke all Legal Connect sidebar access for <strong style={{ color: "#1C1C1E" }}>{confirmRemove}</strong>. They will not be able to see any sections until re-provisioned.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setConfirmRemove(null)} style={{
                padding: "8px 16px", borderRadius: 7, border: "1.5px solid #d0d5de",
                background: "#fff", fontSize: 13, fontWeight: 600, color: "#5f6368", cursor: "pointer",
              }}>Cancel</button>
              <button
                onClick={() => removeMutation.mutate({ email: confirmRemove })}
                disabled={removeMutation.isPending}
                style={{
                  padding: "8px 16px", borderRadius: 7, border: "none",
                  background: removeMutation.isPending ? "#9ca3af" : "#dc2626",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: removeMutation.isPending ? "not-allowed" : "pointer",
                }}
              >
                {removeMutation.isPending ? "Removing…" : "Remove Access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
