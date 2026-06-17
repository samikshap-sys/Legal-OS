import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useGaugeUser } from "@/contexts/GaugeUserContext";
import { Search, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import TicketRow, { Ticket, StatusBadge, PriorityBadge } from "./TicketRow";

const STATUS_OPTIONS = ["all", "open", "in_progress", "on_hold", "disputed", "resolved", "closed"] as const;
const PRIORITY_OPTIONS = ["all", "low", "medium", "high", "critical"] as const;

interface MyTicketsProps {
  onTicketClick: (ticketId: string) => void;
  onNewTicket: () => void;
}

export default function MyTickets({ onTicketClick, onNewTicket }: MyTicketsProps) {
  const { gaugeUser: user } = useGaugeUser();
  const [tab, setTab] = useState<"raised" | "assigned">("raised");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<typeof STATUS_OPTIONS[number]>("all");
  const [priority, setPriority] = useState<typeof PRIORITY_OPTIONS[number]>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const queryInput = {
    page,
    pageSize: PAGE_SIZE,
    status: status as "all" | "open" | "in_progress" | "on_hold" | "disputed" | "resolved" | "closed",
    priority: priority as "all" | "low" | "medium" | "high" | "critical",
    search: search || undefined,
    ...(tab === "raised"
      ? { raisedByEmail: user?.email || "" }
      : { driEmail: user?.email || "" }),
  };

  const { data, isLoading } = trpc.gauge.getTickets.useQuery(queryInput, {
    enabled: !!user?.email,
  });

  const tickets = (data?.tickets ?? []) as Ticket[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleTabChange = (newTab: "raised" | "assigned") => {
    setTab(newTab);
    setPage(1);
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleStatusChange = (val: typeof STATUS_OPTIONS[number]) => {
    setStatus(val);
    setPage(1);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Page header */}
      <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-[#302B2B]">My Tickets</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {user?.email ? `Logged in as ${user.email}` : "Loading..."}
            </p>
          </div>
          <button
            onClick={onNewTicket}
            className="flex items-center gap-2 bg-[#302B2B] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#251f1f] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Ticket
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-100 rounded-xl p-1 w-fit">
          {(["raised", "assigned"] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? "bg-[#302B2B] text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t === "raised" ? "Raised by Me" : "Assigned to Me (DRI)"}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-zinc-100 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by title or ticket ID…"
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-200 text-sm text-[#302B2B] placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-[#302B2B]"
          />
        </div>

        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value as typeof STATUS_OPTIONS[number])}
          className="px-3 py-2 rounded-lg border border-zinc-200 text-sm text-[#302B2B] bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Statuses" : s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof PRIORITY_OPTIONS[number])}
          className="px-3 py-2 rounded-lg border border-zinc-200 text-sm text-[#302B2B] bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p === "all" ? "All Priorities" : p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>

        {total > 0 && (
          <span className="text-xs text-zinc-400 ml-auto">
            {total} ticket{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#302B2B] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Loading tickets…</p>
            </div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mb-3">
              <Search className="w-6 h-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-600">No tickets found</p>
            <p className="text-xs text-zinc-400 mt-1">
              {tab === "raised" ? "You haven't raised any tickets yet." : "No tickets assigned to you."}
            </p>
            {tab === "raised" && (
              <button
                onClick={onNewTicket}
                className="mt-4 px-4 py-2 bg-[#302B2B] text-white text-sm rounded-xl hover:bg-[#251f1f] transition-colors"
              >
                Raise your first ticket
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">ID</th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">DRI</th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <TicketRow key={ticket.ticketId} ticket={ticket} onClick={onTicketClick} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-zinc-100 flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-[#302B2B] px-2">{page}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
