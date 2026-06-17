import { useState, useEffect, useCallback } from 'react';
import { X, Search, Send, Check } from 'lucide-react';
import clsx from 'clsx';
import { LocalMessage } from './types';

interface SlackChannel {
  id: string;
  name: string;
  type: 'channel' | 'dm' | 'group';
}

interface Props {
  messages: LocalMessage[];
  threadTitle?: string;
  onClose: () => void;
}

export default function MogamboSendToSlackModal({ messages, threadTitle, onClose }: Props) {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show non-streaming messages
  const visibleMessages = messages.filter((m) => !m.isStreaming && !m.isProgress);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(visibleMessages.map((m) => m.id)),
  );

  useEffect(() => {
    async function fetchChannels() {
      try {
        const res = await fetch('/api/mogambo/slack/channels');
        if (!res.ok) throw new Error('Failed to load channels');
        const data = await res.json();
        setChannels(data.channels ?? []);
      } catch (err) {
        setChannelError(err instanceof Error ? err.message : 'Failed to load channels');
      } finally {
        setLoadingChannels(false);
      }
    }
    fetchChannels();
  }, []);

  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleMessage = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === visibleMessages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleMessages.map((m) => m.id)));
    }
  }, [selectedIds.size, visibleMessages]);

  const handleSend = async () => {
    if (!selectedChannel || selectedIds.size === 0) return;
    setSending(true);
    setError(null);
    try {
      const selectedMessages = visibleMessages
        .filter((m) => selectedIds.has(m.id))
        .map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        }));

      const res = await fetch('/api/mogambo/slack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: selectedChannel.id,
          messages: selectedMessages,
          note: note.trim() || undefined,
          threadTitle,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to send');
      }

      setSent(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send to Slack');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#4A154B' }}
            >
              <svg viewBox="0 0 54 54" className="w-5 h-5" fill="none">
                <path d="M19.712 33.867a3.89 3.89 0 01-3.89 3.89 3.89 3.89 0 01-3.89-3.89 3.89 3.89 0 013.89-3.89h3.89v3.89z" fill="#fff"/>
                <path d="M21.667 33.867a3.89 3.89 0 013.889-3.89 3.89 3.89 0 013.89 3.89v9.726a3.89 3.89 0 01-3.89 3.888 3.89 3.89 0 01-3.889-3.888v-9.726z" fill="#fff"/>
                <path d="M25.556 19.712a3.89 3.89 0 01-3.89-3.89 3.89 3.89 0 013.89-3.89 3.89 3.89 0 013.889 3.89v3.89h-3.889z" fill="#fff"/>
                <path d="M25.556 21.667a3.89 3.89 0 013.889 3.889 3.89 3.89 0 01-3.889 3.89h-9.725a3.89 3.89 0 01-3.89-3.89 3.89 3.89 0 013.89-3.889h9.725z" fill="#fff"/>
                <path d="M39.711 25.556a3.89 3.89 0 013.889 3.889 3.89 3.89 0 01-3.889 3.89 3.89 3.89 0 01-3.888-3.89v-3.89h3.888z" fill="#fff"/>
                <path d="M37.756 25.556a3.89 3.89 0 01-3.889-3.889 3.89 3.89 0 013.889-3.889h9.726a3.89 3.89 0 013.888 3.89 3.89 3.89 0 01-3.888 3.888h-9.726z" fill="#fff"/>
                <path d="M33.867 39.711a3.89 3.89 0 013.888 3.889 3.89 3.89 0 01-3.888 3.888 3.89 3.89 0 01-3.89-3.888v-3.889h3.89z" fill="#fff"/>
                <path d="M33.867 37.756a3.89 3.89 0 01-3.89-3.889v-9.725a3.89 3.89 0 013.89-3.89 3.89 3.89 0 013.888 3.89v9.725a3.89 3.89 0 01-3.888 3.89z" fill="#fff"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Send to Slack</h2>
              <p className="text-xs text-slate-400">Share this conversation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Channel picker */}
        <div className="px-6 pt-5 pb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Send to</label>
          {selectedChannel ? (
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-[#178b8f] bg-[#178b8f]/5">
              <span className="text-sm font-medium text-slate-700">{selectedChannel.name}</span>
              <button
                onClick={() => setSelectedChannel(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="relative border-b border-slate-100">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search channels or DMs…"
                  className="w-full pl-8 pr-3 py-2.5 text-sm outline-none text-slate-700 placeholder-slate-400"
                />
              </div>
              <div className="max-h-44 overflow-y-auto">
                {loadingChannels ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#178b8f', borderTopColor: 'transparent' }} />
                  </div>
                ) : channelError ? (
                  <p className="text-sm text-red-500 px-4 py-3">{channelError}</p>
                ) : filteredChannels.length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-3 text-center">No channels found</p>
                ) : (
                  <ul>
                    {filteredChannels.map((ch) => (
                      <li key={ch.id}>
                        <button
                          onClick={() => setSelectedChannel(ch)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <span className="text-slate-400 text-xs font-mono">
                            {ch.type === 'channel' ? '#' : ch.type === 'dm' ? '@' : '⊕'}
                          </span>
                          {ch.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Optional note */}
        <div className="px-6 pb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Add a note <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for your teammates…"
            rows={2}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none resize-none text-slate-700 placeholder-slate-400 focus:border-[#178b8f] focus:ring-2 focus:ring-[#178b8f]/10 transition-all"
          />
        </div>

        {/* Message selection */}
        <div className="px-6 pb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-700">Messages</label>
            <button
              onClick={toggleAll}
              className="text-xs font-medium transition-colors"
              style={{ color: '#178b8f' }}
            >
              {selectedIds.size === visibleMessages.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto">
            {visibleMessages.map((msg) => {
              const isSelected = selectedIds.has(msg.id);
              return (
                <button
                  key={msg.id}
                  onClick={() => toggleMessage(msg.id)}
                  className={clsx(
                    'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                    isSelected ? 'bg-white' : 'bg-slate-50 opacity-50',
                  )}
                >
                  <div
                    className={clsx(
                      'mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors',
                      isSelected ? 'border-[#178b8f]' : 'border-slate-300 bg-white',
                    )}
                    style={isSelected ? { backgroundColor: '#178b8f' } : {}}
                  >
                    {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={clsx('text-xs font-bold mr-2', msg.role === 'user' ? 'text-slate-500' : 'text-[#178b8f]')}>
                      {msg.role === 'user' ? 'You' : 'Mogambo'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <p className="text-sm text-slate-700 truncate mt-0.5">{msg.content}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {selectedIds.size} of {visibleMessages.length} messages selected
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          {error && <p className="text-sm text-red-500 flex-1">{error}</p>}
          {!error && <div className="flex-1" />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!selectedChannel || selectedIds.size === 0 || sending || sent}
              className={clsx(
                'flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all',
                sent
                  ? 'bg-emerald-500'
                  : !selectedChannel || selectedIds.size === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'hover:opacity-90 active:opacity-80',
              )}
              style={!sent && selectedChannel && selectedIds.size > 0 ? { backgroundColor: '#178b8f' } : {}}
            >
              {sent ? (
                <><Check size={15} /> Sent!</>
              ) : sending ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</>
              ) : (
                <><Send size={15} /> Send</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
