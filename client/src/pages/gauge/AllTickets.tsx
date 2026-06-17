import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Search, ChevronLeft, ChevronRight, Plus, X, Calendar } from "lucide-react";
import TicketRow, { Ticket } from "./TicketRow";
import { useGaugeUser } from "@/contexts/GaugeUserContext";

const STATUS_OPTIONS = ["all", "open", "in_progress", "on_hold", "disputed", "resolved_closed"] as const;
const STATUS_LABEL: Record<string, string> = {
  all: "All Statuses",
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  disputed: "Disputed",
  resolved_closed: "Resolved / Closed",
};
const PRIORITY_OPTIONS = ["all", "low", "medium", "high", "critical"] as const;

interface AllTicketsProps {
  onTicketClick: (ticketId: string) => void;
  onNewTicket: () => void;
}

export default function AllTickets({ onTicketClick, onNewTicket }: AllTicketsProps) {
  const { gaugeUser } = useGaugeUser();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<typeof STATUS_OPTIONS[number]>("all");
  // Map UI option to API value(s)
  const apiStatus = status === "resolved_closed" ? "resolved" : status;
  const [priority, setPriority] = useState<typeof PRIORITY_OPTIONS[number]>("all");
  const [driFilter, setDriFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const utils = trpc.useUtils();
  const handleDeleted = () => { utils.gauge.getTickets.invalidate(); };

  const { data, isLoading } = trpc.gauge.getTickets.useQuery({
    page,
    pageSize: PAGE_SIZE,
    status: apiStatus as "all" | "open" | "in_progress" | "on_hold" | "disputed" | "resolved" | "closed",
    priority: priority as "all" | "low" | "medium" | "high" | "critical",
    search: search || undefined,
    driEmail: driFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }, { refetchInterval: 10000 });

  const { data: driList } = trpc.gauge.getDriList.useQuery();

  const tickets = (data?.tickets ?? []) as Ticket[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const resetPage = () => setPage(1);

  const hasDateFilter = dateFrom || dateTo;
  const clearDateFilter = () => { setDateFrom(""); setDateTo(""); resetPage(); };

  // Black select style
  const selectStyle: React.CSSProperties = {
    padding: "7px 12px",
    borderRadius: "8px",
    border: "none",
    background: "#302B2B",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    outline: "none",
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    paddingRight: "28px",
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-zinc-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#302B2B]">All Tickets</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Complete view of all tickets across the organisation</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNewTicket}
              className="flex items-center gap-2 bg-[#302B2B] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#251f1f] transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Ticket
            </button>
          </div>
        </div>
      </div>

      {/* Filters row */}
      <div className="px-6 py-3 border-b border-zinc-100 flex items-center gap-2 flex-wrap">
        {/* Search — shorter */}
        <div className="relative" style={{ width: "220px", flexShrink: 0 }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            placeholder="Search title or ID…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-[#302B2B] placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-[#302B2B]"
          />
        </div>

        {/* Status */}
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as typeof STATUS_OPTIONS[number]); resetPage(); }}
          style={selectStyle}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} style={{ background: "#302B2B", color: "#fff" }}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </select>

        {/* Priority */}
        <select
          value={priority}
          onChange={(e) => { setPriority(e.target.value as typeof PRIORITY_OPTIONS[number]); resetPage(); }}
          style={selectStyle}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p} style={{ background: "#302B2B", color: "#fff" }}>
              {p === "all" ? "All Priorities" : p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>

        {/* DRI */}
        <select
          value={driFilter}
          onChange={(e) => { setDriFilter(e.target.value); resetPage(); }}
          style={selectStyle}
        >
          <option value="" style={{ background: "#302B2B", color: "#fff" }}>All DRIs</option>
          {(driList ?? []).map((d) => (
            <option key={d.driEmail} value={d.driEmail} style={{ background: "#302B2B", color: "#fff" }}>
              {d.driName || d.driEmail.split("@")[0]}
            </option>
          ))}
        </select>

        {/* Date From */}
        <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
            title="From date"
            style={{
              padding: "6px 8px",
              borderRadius: "8px",
              border: "1.5px solid #e4e4e7",
              background: dateFrom ? "#302B2B" : "#fff",
              color: dateFrom ? "#fff" : "#3f3f46",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              outline: "none",
              width: "130px",
              colorScheme: dateFrom ? "dark" : "light",
            }}
          />
          <span style={{ fontSize: "11px", color: "#a1a1aa" }}>–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
            title="To date"
            style={{
              padding: "6px 8px",
              borderRadius: "8px",
              border: "1.5px solid #e4e4e7",
              background: dateTo ? "#302B2B" : "#fff",
              color: dateTo ? "#fff" : "#3f3f46",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              outline: "none",
              width: "130px",
              colorScheme: dateTo ? "dark" : "light",
            }}
          />
          {hasDateFilter && (
            <button
              onClick={clearDateFilter}
              title="Clear date filter"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "22px", height: "22px", borderRadius: "50%",
                border: "1px solid #e4e4e7", background: "#fff",
                cursor: "pointer", color: "#a1a1aa",
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Ticket count */}
        {total > 0 && (
          <span className="text-xs text-zinc-400 ml-auto">
            {total} ticket{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table card with shadow */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e4e4e7",
            boxShadow: "0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-2 border-[#302B2B] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mb-3">
                <Search className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-600">No tickets found</p>
              <p className="text-xs text-zinc-400 mt-1">Try adjusting your filters.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr style={{ background: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
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
                  <TicketRow
                    key={ticket.ticketId}
                    ticket={ticket}
                    onClick={onTicketClick}
                    isAdmin={gaugeUser?.isAdmin}
                    adminEmail={gaugeUser?.email}
                    onDeleted={handleDeleted}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 pb-4 flex items-center justify-between">
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
