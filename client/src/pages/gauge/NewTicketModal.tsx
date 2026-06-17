import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useGaugeUser } from "@/contexts/GaugeUserContext";
import { X, CheckCircle, Copy } from "lucide-react";

interface NewTicketModalProps {
  onClose: () => void;
  onCreated: (ticketId: string) => void;
}

const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const CATEGORIES = ["Finance", "Legal", "Tech", "HR", "Operations", "Marketing", "General"] as const;

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-zinc-200 text-zinc-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export default function NewTicketModal({ onClose, onCreated }: NewTicketModalProps) {
  const { gaugeUser: user } = useGaugeUser();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>("medium");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("General");
  const [driEmail, setDriEmail] = useState("");
  const [driName, setDriName] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = trpc.gauge.createTicket.useMutation({
    onSuccess: (ticket) => {
      if (ticket) {
        setCreated(ticket.ticketId);
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!user?.email) {
      setError("You must be logged in to raise a ticket.");
      return;
    }
    if (!driEmail.endsWith("@gofynd.com")) {
      setError("DRI email must be a @gofynd.com address.");
      return;
    }

    createMutation.mutate({
      title,
      description,
      priority,
      category,
      driEmail,
      driName,
      raisedByEmail: user.email,
      raisedByName: user.name || user.email,
    });
  };

  const copyTicketId = () => {
    if (created) {
      const url = `${window.location.origin}/gauge/ticket/${created}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#302B2B]/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-16 h-16 text-[#302B2B]" />
          </div>
          <h2 className="text-2xl font-bold text-[#302B2B] mb-2">Ticket Created!</h2>
          <p className="text-zinc-500 mb-6">Your ticket has been raised and the DRI has been notified.</p>

          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6">
            <p className="text-xs text-zinc-400 uppercase tracking-widest mb-1">Ticket ID</p>
            <p className="text-3xl font-mono font-bold text-[#302B2B]">{created}</p>
          </div>

          <button
            onClick={copyTicketId}
            className="flex items-center gap-2 mx-auto mb-6 px-4 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <Copy className="w-4 h-4" />
            {copied ? "Copied!" : "Copy shareable link"}
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => onCreated(created)}
              className="flex-1 bg-[#302B2B] text-white py-2.5 rounded-xl font-medium hover:bg-[#251f1f] transition-colors"
            >
              View Ticket
            </button>
            <button
              onClick={onClose}
              className="flex-1 border border-zinc-300 text-zinc-700 py-2.5 rounded-xl font-medium hover:bg-zinc-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#302B2B]/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-[#302B2B]">Raise a New Ticket</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Assign to a DRI within @gofynd.com</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 transition-colors">
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the issue"
              required
              minLength={3}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm text-[#302B2B] placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-[#302B2B] transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide context, steps to reproduce, or any relevant details..."
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm text-[#302B2B] placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-[#302B2B] transition-colors resize-none"
            />
          </div>

          {/* Priority & Category row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
                Priority
              </label>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all border ${
                      priority === p
                        ? "border-[#302B2B] bg-[#302B2B] text-white"
                        : `border-zinc-200 ${PRIORITY_COLORS[p]} hover:border-zinc-400`
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-[#302B2B] bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-[#302B2B]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* DRI section */}
          <div className="bg-zinc-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Assign to DRI</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  DRI Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={driEmail}
                  onChange={(e) => setDriEmail(e.target.value)}
                  placeholder="name@gofynd.com"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-[#302B2B] placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-[#302B2B] bg-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">DRI Name</label>
                <input
                  type="text"
                  value={driName}
                  onChange={(e) => setDriName(e.target.value)}
                  placeholder="Full name (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-[#302B2B] placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-[#302B2B] bg-white"
                />
              </div>
            </div>
          </div>

          {/* Raised by (read-only) */}
          <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-50 rounded-lg px-3 py-2">
            <span className="font-medium text-zinc-600">Raised by:</span>
            <span>{user?.name || user?.email || "—"}</span>
            <span className="text-zinc-300">·</span>
            <span>{user?.email}</span>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 bg-[#302B2B] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#251f1f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createMutation.isPending ? "Creating…" : "Raise Ticket"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 border border-zinc-300 text-zinc-700 py-2.5 rounded-xl font-medium text-sm hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
