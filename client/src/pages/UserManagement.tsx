/**
 * UserManagement — QueryBee Access Control Panel
 *
 * Admin view: full CRUD — add users, assign scopes via checkbox matrix, remove users
 * Non-admin view: read-only table showing all users and their assigned scopes
 *
 * Design: teal (#7C5CFC / #9B7FFF) + white, matches QueryBee UI theme
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useQbUser } from "@/contexts/QbUserContext";

type UserRow = {
  id: number;
  email: string;
  name: string;
  scopes: string[];
  assignedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ── Scope definitions (mirrors server QB_SCOPES) ─────────────────────────────
const SCOPE_GROUPS: Record<string, { id: string; label: string }[]> = {
  Data: [
    { id: "data-upload",      label: "BQ Upload" },
    { id: "invoice-download", label: "Invoices Download" },
    { id: "pipelines",        label: "Pipelines" },
    { id: "querypad",         label: "Querypad" },
  ],
  Finance: [
    { id: "invoice-supporting", label: "Invoice Export" },
    { id: "bl-payable",         label: "Brand Ledger" },
    { id: "cashfree-entry",     label: "Cashfree Entry" },
    { id: "splitter",           label: "Splitter" },
  ],
  Analytics: [
    { id: "dp-recon",      label: "DP Recon" },
    { id: "po-dashboard", label: "PO Dashboard" },
  ],
};

const ALL_SCOPES = Object.values(SCOPE_GROUPS).flat();

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string, email: string): string {
  if (name) return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  return email.slice(0, 2).toUpperCase();
}

function avatarColor(email: string): string {
  const colors = ["#7C5CFC","#9B7FFF","#1a7a5e","#5a4a8a","#7a4a2a","#2a6a4a","#4a6a8a","#6a4a6a"];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function ScopeTag({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      background: "rgba(30,100,120,0.10)", color: "#7C5CFC",
      border: "1px solid rgba(30,100,120,0.18)", borderRadius: 4,
      padding: "1px 7px", fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

// ── Admin: Add/Edit User Modal ────────────────────────────────────────────────
interface EditModalProps {
  onClose: () => void;
  onSaved: () => void;
  initialEmail?: string;
  initialName?: string;
  initialScopes?: string[];
}

function EditUserModal({ onClose, onSaved, initialEmail = "", initialName = "", initialScopes = [] }: EditModalProps) {
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState(initialName);
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(initialScopes));
  const [error, setError] = useState("");
  const isEdit = !!initialEmail;

  const assignMutation = trpc.userMgmt.assignScopes.useMutation({
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e.message),
  });

  function toggleScope(id: string) {
    setSelectedScopes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroup(ids: string[]) {
    const allSelected = ids.every(id => selectedScopes.has(id));
    setSelectedScopes(prev => {
      const next = new Set(prev);
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function selectAll() {
    setSelectedScopes(new Set(ALL_SCOPES.map(s => s.id)));
  }
  function clearAll() {
    setSelectedScopes(new Set());
  }

  function handleSave() {
    if (!email.trim()) { setError("Email is required"); return; }
    if (!email.includes("@")) { setError("Enter a valid email"); return; }
    assignMutation.mutate({ email: email.trim(), name: name.trim(), scopes: Array.from(selectedScopes) });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(10,20,30,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 14, width: 560, maxWidth: "95vw",
        boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden",
      }} onClick={e => e.stopPropagation()}>
        {/* Modal header */}
        <div style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ color: "#111", fontWeight: 700, fontSize: 16, letterSpacing: 0.2 }}>
              {isEdit ? "Edit User Scopes" : "Add New User"}
            </div>
            <div style={{ color: "#374151", fontSize: 12, marginTop: 2 }}>
              {isEdit ? `Editing access for ${initialEmail}` : "Grant sidebar access to a team member"}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(124,92,252,0.08)", border: "1px solid rgba(124,92,252,0.2)", borderRadius: 8,
            color: "#7C5CFC", cursor: "pointer", padding: "6px 10px", fontSize: 16, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "20px 24px" }}>
          {/* Email + Name */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 5 }}>
                Email Address *
              </label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isEdit}
                placeholder="user@gofynd.com"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 7, fontSize: 13,
                  border: "1.5px solid #d1d5db", outline: "none", boxSizing: "border-box",
                  background: isEdit ? "#f9fafb" : "#fff", color: "#111827",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 5 }}>
                Display Name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Full name (optional)"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 7, fontSize: 13,
                  border: "1.5px solid #d1d5db", outline: "none", boxSizing: "border-box",
                  background: "#fff", color: "#111827", fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          {/* Scope selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: 0.5, textTransform: "uppercase" }}>
                Sidebar Access Scopes
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={selectAll} style={{
                  fontSize: 11, color: "#7C5CFC", background: "rgba(30,100,120,0.08)",
                  border: "1px solid rgba(30,100,120,0.2)", borderRadius: 5, padding: "3px 10px",
                  cursor: "pointer", fontWeight: 600,
                }}>Select All</button>
                <button onClick={clearAll} style={{
                  fontSize: 11, color: "#6b7280", background: "#f3f4f6",
                  border: "1px solid #e5e7eb", borderRadius: 5, padding: "3px 10px",
                  cursor: "pointer", fontWeight: 600,
                }}>Clear All</button>
              </div>
            </div>

            {Object.entries(SCOPE_GROUPS).map(([group, scopes]) => {
              const groupIds = scopes.map(s => s.id);
              const allSelected = groupIds.every(id => selectedScopes.has(id));
              const someSelected = groupIds.some(id => selectedScopes.has(id));
              return (
                <div key={group} style={{
                  border: "1.5px solid #e5e7eb", borderRadius: 9, marginBottom: 10, overflow: "hidden",
                }}>
                  {/* Group header */}
                  <div style={{
                    background: "#f8fafc", padding: "8px 14px",
                    display: "flex", alignItems: "center", gap: 10,
                    borderBottom: "1px solid #e5e7eb",
                  }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={() => toggleGroup(groupIds)}
                      style={{ accentColor: "#7C5CFC", width: 14, height: 14, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", letterSpacing: 0.3 }}>
                      {group}
                    </span>
                    <span style={{
                      marginLeft: "auto", fontSize: 11, color: "#374151",
                    }}>
                      {groupIds.filter(id => selectedScopes.has(id)).length}/{groupIds.length} selected
                    </span>
                  </div>
                  {/* Scope checkboxes */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
                  }}>
                    {scopes.map((scope, idx) => (
                      <label key={scope.id} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                        cursor: "pointer", borderRight: idx % 2 === 0 ? "1px solid #f3f4f6" : "none",
                        borderBottom: idx < scopes.length - 2 ? "1px solid #f3f4f6" : "none",
                        background: selectedScopes.has(scope.id) ? "rgba(30,100,120,0.04)" : "transparent",
                        transition: "background 0.15s",
                      }}>
                        <input
                          type="checkbox"
                          checked={selectedScopes.has(scope.id)}
                          onChange={() => toggleScope(scope.id)}
                          style={{ accentColor: "#7C5CFC", width: 14, height: 14, cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 13, color: "#374151", fontWeight: selectedScopes.has(scope.id) ? 600 : 400 }}>
                          {scope.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div style={{
            background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 7,
            padding: "8px 12px", fontSize: 12, color: "#0369a1", marginBottom: 16,
          }}>
            <strong>{selectedScopes.size}</strong> of {ALL_SCOPES.length} scopes selected
            {selectedScopes.size === 0 && <span style={{ color: "#dc2626", marginLeft: 8 }}>⚠ User will have no sidebar access</span>}
          </div>

          {error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7,
              padding: "8px 12px", fontSize: 12, color: "#dc2626", marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{
              padding: "9px 20px", borderRadius: 8, border: "1.5px solid #d1d5db",
              background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={assignMutation.isPending}
              style={{
                padding: "9px 24px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg, #7C5CFC 0%, #9B7FFF 100%)",
                color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700,
                opacity: assignMutation.isPending ? 0.7 : 1,
              }}
            >
              {assignMutation.isPending ? "Saving…" : isEdit ? "Update Scopes" : "Add User"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function UserManagement() {
  const { qbUser } = useQbUser();
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<{ email: string; name: string; scopes: string[] } | null>(null);
  const [search, setSearch] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const { data: adminData } = trpc.userMgmt.isAdmin.useQuery();
  const { data: users, refetch } = trpc.userMgmt.listUsers.useQuery();
  const { data: scopeDefs } = trpc.userMgmt.getScopeDefinitions.useQuery();

  const isAdmin = adminData?.isAdmin ?? false;

  const removeMutation = trpc.userMgmt.removeUser.useMutation({
    onSuccess: () => { setConfirmRemove(null); refetch(); },
  });

  const filtered = useMemo((): UserRow[] => {
    if (!users) return [];
    const q = search.toLowerCase();
    return (users as UserRow[]).filter((u: UserRow) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
  }, [users, search]);

  function openAdd() { setEditTarget(null); setShowModal(true); }
  function openEdit(u: { email: string; name: string; scopes: string[] }) {
    setEditTarget(u); setShowModal(true);
  }

  const scopeMap = useMemo(() => {
    const m: Record<string, string> = {};
    (scopeDefs ?? []).forEach(s => { m[s.id] = s.label; });
    return m;
  }, [scopeDefs]);

  return (
    <div style={{ padding: "28px 20px", minHeight: "100vh", background: "#f8fafc", fontFamily: "inherit" }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              {/* Users icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111", letterSpacing: -0.3 }}>
                User Management
              </h1>
              {isAdmin && (
                <span style={{
                  background: "linear-gradient(135deg, #7C5CFC, #9B7FFF)", color: "#fff",
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase",
                  padding: "2px 8px", borderRadius: 20,
                }}>Admin</span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
              {isAdmin
                ? "Manage QueryBee sidebar access for your team. Assign scopes to control which sections each user can see."
                : "View the access scopes assigned to QueryBee users. Contact your admin to request changes."}
            </p>
          </div>
          {isAdmin && (
            <button onClick={openAdd} style={{
              display: "flex", alignItems: "center", gap: 7,
              background: "linear-gradient(135deg, #7C5CFC 0%, #9B7FFF 100%)",
              color: "#fff", border: "none", borderRadius: 9, padding: "10px 20px",
              cursor: "pointer", fontSize: 13, fontWeight: 700,
              boxShadow: "0 2px 10px rgba(30,100,120,0.30)",
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
        {[
          { label: "Total Users", value: users?.length ?? 0, icon: "👥", color: "#7C5CFC" },
          { label: "Total Scopes", value: ALL_SCOPES.length, icon: "🔑", color: "#9B7FFF" },
          { label: "Fully Provisioned", value: (users as UserRow[] | undefined)?.filter((u: UserRow) => u.scopes.length === ALL_SCOPES.length).length ?? 0, icon: "✅", color: "#1a7a5e" },
        ].map(stat => (
          <div key={stat.label} style={{
            background: "#fff", borderRadius: 10, padding: "14px 18px",
            border: "1.5px solid #e5e7eb", display: "flex", alignItems: "center", gap: 14,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 9,
              background: `${stat.color}15`, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>{stat.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.color, lineHeight: 1.1 }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div style={{
        background: "#fff", borderRadius: 10, border: "1.5px solid #e5e7eb",
        padding: "10px 16px", display: "flex", alignItems: "center", gap: 10,
        marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          style={{
            border: "none", outline: "none", fontSize: 13, color: "#374151",
            background: "transparent", flex: 1, fontFamily: "inherit",
          }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, lineHeight: 1 }}>×</button>
        )}
        <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
          {filtered.length} of {users?.length ?? 0} users
        </span>
      </div>

      {/* Users table */}
      <div style={{
        background: "#fff", borderRadius: 12, border: "1.5px solid #e5e7eb",
        overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isAdmin ? "2fr 2.5fr 1fr 1fr auto" : "2fr 2.5fr 1fr 1fr",
          background: "#f8fafc", borderBottom: "1.5px solid #e5e7eb",
          padding: "10px 20px",
        }}>
          {["User", "Scopes", "Coverage", "Last Updated", ...(isAdmin ? ["Actions"] : [])].map(h => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: 0.6, textTransform: "uppercase" }}>{h}</div>
          ))}
        </div>

        {/* Table rows */}
        {!users ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>👤</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              {search ? "No users match your search" : "No users provisioned yet"}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {isAdmin ? "Click \"Add User\" to grant sidebar access to a team member." : "Contact your admin to set up access."}
            </div>
          </div>
        ) : (
          filtered.map((u: UserRow, idx: number) => {
            const coverage = ALL_SCOPES.length > 0 ? Math.round((u.scopes.length / ALL_SCOPES.length) * 100) : 0;
            const coverageColor = coverage === 100 ? "#1a7a5e" : coverage >= 50 ? "#7C5CFC" : "#dc7a2a";
            return (
              <div key={u.email} style={{
                display: "grid",
                gridTemplateColumns: isAdmin ? "2fr 2.5fr 1fr 1fr auto" : "2fr 2.5fr 1fr 1fr",
                padding: "14px 20px", alignItems: "center",
                borderBottom: idx < filtered.length - 1 ? "1px solid #f3f4f6" : "none",
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
                      {u.name || u.email.split("@")[0]}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{u.email}</div>
                  </div>
                </div>

                {/* Scopes */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {u.scopes.length === 0 ? (
                    <span style={{ fontSize: 12, color: "#dc2626", fontStyle: "italic" }}>No access</span>
                  ) : u.scopes.length === ALL_SCOPES.length ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      background: "rgba(26,122,94,0.10)", color: "#1a7a5e",
                      border: "1px solid rgba(26,122,94,0.2)", borderRadius: 4,
                      padding: "2px 8px", fontSize: 11, fontWeight: 700,
                    }}>
                      ✓ Full Access
                    </span>
                  ) : (
                    u.scopes.slice(0, 4).map((sid: string) => (
                      <ScopeTag key={sid} label={scopeMap[sid] ?? sid} />
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
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      flex: 1, height: 5, background: "#e5e7eb", borderRadius: 99, overflow: "hidden",
                      maxWidth: 60,
                    }}>
                      <div style={{
                        height: "100%", width: `${coverage}%`,
                        background: coverageColor, borderRadius: 99, transition: "width 0.4s",
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: coverageColor }}>{coverage}%</span>
                  </div>
                </div>

                {/* Last updated */}
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  {new Date(u.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                </div>

                {/* Actions — admin only */}
                {isAdmin && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => openEdit({ email: u.email, name: u.name, scopes: u.scopes })}
                      title="Edit scopes"
                      style={{
                        width: 30, height: 30, borderRadius: 7, border: "1.5px solid #d1d5db",
                        background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#7C5CFC",
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
                        width: 30, height: 30, borderRadius: 7, border: "1.5px solid #fecaca",
                        background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#dc2626",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
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

      {/* Admin info banner */}
      {isAdmin && (
        <div style={{
          marginTop: 20, background: "rgba(30,100,120,0.06)", border: "1.5px solid rgba(30,100,120,0.15)",
          borderRadius: 10, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ fontSize: 12, color: "#7C5CFC" }}>
            <strong>Admin mode active.</strong> Scope changes take effect immediately on the user's next page load. Users without a scope record see all sections by default.
          </span>
        </div>
      )}

      {/* Edit/Add modal */}
      {showModal && (
        <EditUserModal
          onClose={() => setShowModal(false)}
          onSaved={() => refetch()}
          initialEmail={editTarget?.email}
          initialName={editTarget?.name}
          initialScopes={editTarget?.scopes}
        />
      )}

      {/* Confirm remove dialog */}
      {confirmRemove && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(10,20,30,0.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmRemove(null)}>
          <div style={{
            background: "#fff", borderRadius: 12, width: 380, maxWidth: "90vw",
            padding: "28px 28px 22px", boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, marginBottom: 12, textAlign: "center" }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", textAlign: "center", marginBottom: 6 }}>
              Remove User Access?
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center", marginBottom: 22 }}>
              This will revoke all scopes for <strong>{confirmRemove}</strong>. They will lose sidebar access immediately.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmRemove(null)} style={{
                padding: "9px 22px", borderRadius: 8, border: "1.5px solid #d1d5db",
                background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}>Cancel</button>
              <button
                onClick={() => removeMutation.mutate({ email: confirmRemove })}
                disabled={removeMutation.isPending}
                style={{
                  padding: "9px 22px", borderRadius: 8, border: "none",
                  background: "#dc2626", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700,
                  opacity: removeMutation.isPending ? 0.7 : 1,
                }}
              >
                {removeMutation.isPending ? "Removing…" : "Remove User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
