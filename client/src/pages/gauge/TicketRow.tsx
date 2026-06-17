import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export type TicketStatus = "open" | "in_progress" | "on_hold" | "disputed" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface Ticket {
  id: number;
  ticketId: string;
  title: string;
  description: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  category: string;
  raisedByEmail: string;
  raisedByName: string;
  driEmail: string;
  driName: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Monochrome status styles ──────────────────────────────────────────────
export const STATUS_STYLES: Record<TicketStatus, { bg: string; text: string; dot: string; label: string }> = {
  open:        { bg: "bg-zinc-100",  text: "text-zinc-700", dot: "bg-zinc-400",  label: "Open" },
  in_progress: { bg: "bg-zinc-900",  text: "text-white",    dot: "bg-white",     label: "In Progress" },
  on_hold:     { bg: "bg-zinc-200",  text: "text-zinc-700", dot: "bg-zinc-500",  label: "On Hold" },
  disputed:    { bg: "bg-zinc-800",  text: "text-zinc-100", dot: "bg-zinc-300",  label: "Disputed" },
  resolved:    { bg: "bg-[#302B2B]",     text: "text-white",    dot: "bg-zinc-400",  label: "Resolved" },
  closed:      { bg: "bg-zinc-50",   text: "text-zinc-400", dot: "bg-zinc-300",  label: "Closed" },
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  disputed: "Disputed",
  resolved: "Resolved",
  closed: "Closed",
};

// ── Monochrome priority styles ────────────────────────────────────────────
export const PRIORITY_STYLES: Record<TicketPriority, { bg: string; text: string; weight: string }> = {
  low:      { bg: "bg-zinc-100",  text: "text-zinc-500", weight: "font-normal" },
  medium:   { bg: "bg-zinc-200",  text: "text-zinc-700", weight: "font-medium" },
  high:     { bg: "bg-zinc-800",  text: "text-zinc-100", weight: "font-semibold" },
  critical: { bg: "bg-[#302B2B]",     text: "text-white",    weight: "font-bold" },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const p = PRIORITY_STYLES[priority];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs capitalize ${p.bg} ${p.text} ${p.weight}`}>
      {priority}
    </span>
  );
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface TicketRowProps {
  ticket: Ticket;
  onClick: (ticketId: string) => void;
  isAdmin?: boolean;
  adminEmail?: string;
  onDeleted?: (ticketId: string) => void;
}

export default function TicketRow({ ticket, onClick, isAdmin, adminEmail, onDeleted }: TicketRowProps) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = trpc.gauge.deleteTicket.useMutation({
    onSuccess: () => {
      setConfirmDelete(false);
      onDeleted?.(ticket.ticketId);
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      // Auto-cancel confirm after 3s
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    if (!adminEmail) return;
    deleteMutation.mutate({ ticketId: ticket.ticketId, callerEmail: adminEmail });
  };

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/gauge/ticket/${ticket.ticketId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <tr
      className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer transition-colors group"
      onClick={() => onClick(ticket.ticketId)}
    >
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="font-mono text-xs font-semibold text-zinc-800 bg-zinc-100 px-2 py-1 rounded">
          {ticket.ticketId}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-[#302B2B] line-clamp-1">{ticket.title}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{ticket.category}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <PriorityBadge priority={ticket.priority} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={ticket.status} />
      </td>
      <td className="px-4 py-3">
        <p className="text-xs text-zinc-700 font-medium">{ticket.driName || ticket.driEmail.split("@")[0]}</p>
        <p className="text-xs text-zinc-400">{ticket.driEmail}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-500">
        {formatDate(ticket.createdAt)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={copyLink}
            title="Copy shareable link"
            className="p-1.5 rounded hover:bg-zinc-200 transition-colors"
          >
            {copied ? (
              <span className="text-xs text-zinc-700 font-medium">Copied!</span>
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClick(ticket.ticketId); }}
            title="Open ticket"
            className="p-1.5 rounded hover:bg-zinc-200 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
          </button>
          {isAdmin && (
            <button
              onClick={handleDelete}
              title={confirmDelete ? "Click again to confirm delete" : "Delete ticket"}
              disabled={deleteMutation.isPending}
              className={`p-1.5 rounded transition-colors ${
                confirmDelete
                  ? "bg-red-100 text-red-600 hover:bg-red-200"
                  : "hover:bg-red-50 text-zinc-400 hover:text-red-500"
              } disabled:opacity-50`}
            >
              {deleteMutation.isPending ? (
                <span className="text-xs font-medium">...</span>
              ) : confirmDelete ? (
                <span className="text-xs font-semibold text-red-600">Confirm?</span>
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
