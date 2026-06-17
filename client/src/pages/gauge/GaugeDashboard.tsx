/**
 * Gauge — Personal Dashboard
 * User-specific analytics: tickets raised/resolved, task completion, upcoming meetings.
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useGaugeUser } from "@/contexts/GaugeUserContext";
import { Loader2, Ticket, CheckSquare, CalendarDays, TrendingUp, Clock, AlertCircle } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs font-medium text-gray-600 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{children}</h3>;
}

// ── Main Component ────────────────────────────────────────────────────────

export default function GaugeDashboard() {
  const { gaugeUser } = useGaugeUser();
  const email = gaugeUser?.email ?? "";

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const thirtyDaysLater = now + 30 * 24 * 60 * 60 * 1000;

  // Tickets
  const { data: ticketsData, isLoading: loadingTickets } = trpc.gauge.getTickets.useQuery(
    { callerEmail: email },
    { enabled: !!email },
  );
  const allTickets = ticketsData?.tickets ?? [];

  // Tasks — get all templates first, then tasks per template
  const { data: templates = [], isLoading: loadingTemplates } = trpc.gaugeTasks.getTemplates.useQuery(
    { callerEmail: email },
    { enabled: !!email },
  );

  // Meetings
  const { data: upcomingMeetings = [], isLoading: loadingMeetings } = trpc.gaugeMeetings.getMeetings.useQuery(
    { callerEmail: email, from: now, to: thirtyDaysLater },
    { enabled: !!email },
  );

  const { data: pastMeetings = [] } = trpc.gaugeMeetings.getMeetings.useQuery(
    { callerEmail: email, from: thirtyDaysAgo, to: now },
    { enabled: !!email },
  );

  // Ticket stats
  const myTickets = useMemo(() => allTickets.filter((t) => t.raisedByEmail === email), [allTickets, email]);
  const myDriTickets = useMemo(() => allTickets.filter((t) => t.driEmail === email), [allTickets, email]);

  const ticketsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of myTickets) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return counts;
  }, [myTickets]);

  const driByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of myDriTickets) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return counts;
  }, [myDriTickets]);

  const resolvedTickets = (ticketsByStatus["resolved"] ?? 0) + (ticketsByStatus["closed"] ?? 0);
  const openTickets = (ticketsByStatus["open"] ?? 0) + (ticketsByStatus["in_progress"] ?? 0) + (ticketsByStatus["on_hold"] ?? 0) + (ticketsByStatus["disputed"] ?? 0);

  const driOpen = (driByStatus["open"] ?? 0) + (driByStatus["in_progress"] ?? 0) + (driByStatus["on_hold"] ?? 0);
  const driResolved = (driByStatus["resolved"] ?? 0) + (driByStatus["closed"] ?? 0);

  // Meeting stats
  const nextMeeting = upcomingMeetings[0];

  const formatMeetingTime = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) + " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const isLoading = loadingTickets || loadingTemplates || loadingMeetings;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-5 space-y-7 bg-gray-50/40">
      {/* Welcome */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {gaugeUser?.name?.split(" ")[0] ?? "there"} 👋
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Here's your personal summary across Gauge.</p>
      </div>

      {/* Tickets raised by me */}
      <div>
        <SectionTitle>Tickets I Raised</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Raised" value={myTickets.length} icon={Ticket} accent="bg-gray-100 text-gray-700" />
          <StatCard label="Open / In Progress" value={openTickets} icon={AlertCircle} accent="bg-amber-50 text-amber-600" />
          <StatCard label="Resolved / Closed" value={resolvedTickets} icon={CheckSquare} accent="bg-green-50 text-green-600" />
          <StatCard
            label="Resolution Rate"
            value={myTickets.length > 0 ? `${Math.round((resolvedTickets / myTickets.length) * 100)}%` : "—"}
            icon={TrendingUp}
            accent="bg-blue-50 text-blue-600"
          />
        </div>

        {/* Status breakdown */}
        {myTickets.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(ticketsByStatus).map(([status, count]) => (
              <span key={status} className="text-xs bg-white border border-gray-200 rounded-full px-2.5 py-0.5 text-gray-600">
                {status.replace("_", " ")} · <span className="font-semibold">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tickets I'm DRI for */}
      <div>
        <SectionTitle>Tickets I'm DRI For</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total Assigned" value={myDriTickets.length} icon={Ticket} accent="bg-gray-100 text-gray-700" />
          <StatCard label="Pending Action" value={driOpen} icon={AlertCircle} accent="bg-orange-50 text-orange-600" />
          <StatCard label="Resolved" value={driResolved} icon={CheckSquare} accent="bg-green-50 text-green-600" />
        </div>
      </div>

      {/* Task Tracker */}
      <div>
        <SectionTitle>Task Tracker</SectionTitle>
        {templates.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-400 text-center">
            No task templates yet. Head to <span className="font-medium text-gray-600">My Tasks</span> to create one.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {templates.map((tpl) => (
              <TemplateTaskStats key={tpl.id} templateId={tpl.id} templateName={tpl.name} callerEmail={email} />
            ))}
          </div>
        )}
      </div>

      {/* Calendar */}
      <div>
        <SectionTitle>Calendar</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <StatCard label="Upcoming (30 days)" value={upcomingMeetings.length} icon={CalendarDays} accent="bg-purple-50 text-purple-600" />
          <StatCard label="Past (30 days)" value={pastMeetings.length} icon={Clock} accent="bg-gray-100 text-gray-600" />
          {nextMeeting && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm col-span-2 sm:col-span-1">
              <p className="text-xs font-semibold text-gray-500 mb-1">Next Meeting</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{nextMeeting.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatMeetingTime(nextMeeting.startAt)}</p>
            </div>
          )}
        </div>

        {/* Upcoming meetings list */}
        {upcomingMeetings.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-100">
              {upcomingMeetings.slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                    <CalendarDays className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.title}</p>
                    <p className="text-xs text-gray-500">{formatMeetingTime(m.startAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Per-template task stats ───────────────────────────────────────────────

function TemplateTaskStats({ templateId, templateName, callerEmail }: {
  templateId: number;
  templateName: string;
  callerEmail: string;
}) {
  const { data: tasks = [] } = trpc.gaugeTasks.getTasks.useQuery(
    { callerEmail, templateId },
    { enabled: !!callerEmail },
  );

  const total = tasks.length;
    const done = tasks.filter((t) => {
    try {
      const vals = JSON.parse(t.data ?? "{}");
      return vals["Status"] === "Done" || vals["status"] === "Done";
    } catch { return false; }
  }).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500 truncate mb-1">{templateName}</p>
      <p className="text-2xl font-bold text-gray-900">{total}</p>
      <p className="text-xs text-gray-400">tasks · {done} done</p>
      {total > 0 && (
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 rounded-full transition-all"
            style={{ width: `${Math.round((done / total) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
