import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Search, X, Pin, MessageSquare, Trash2, Pencil, House,
} from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'wouter';
import { LocalThread } from './types';

const BOT_LOGO = '/manus-storage/mogambo-bot-logo_c4de0b99.png';
const FYND_LOGO = '/manus-storage/fynd-logo-black_20967209.png';

interface ThreadItemProps {
  thread: LocalThread;
  isActive: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onRename: (title: string) => void;
}

function ThreadItem({ thread, isActive, isPinned, onSelect, onDelete, onTogglePin, onRename }: ThreadItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thread.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== thread.title) onRename(t);
    setEditing(false);
  };

  return (
    <li
      className={clsx(
        'group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all',
        isActive
          ? 'bg-white shadow-subtle border border-slate-100'
          : 'hover:bg-white/70 hover:shadow-subtle',
      )}
      onClick={() => !editing && onSelect()}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="flex-1 text-sm bg-transparent outline-none border-b border-[#178b8f] text-slate-700"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 text-sm text-slate-700 truncate font-medium">{thread.title}</span>
      )}

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(thread.title); }}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Rename"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={clsx(
            'p-1 rounded-lg transition-colors',
            isPinned
              ? 'text-[#178b8f] hover:bg-[#178b8f]/10'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600',
          )}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          <Pin size={12} className={isPinned ? 'rotate-45' : ''} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </li>
  );
}

function groupByDate(threads: LocalThread[]): [string, LocalThread[]][] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, LocalThread[]> = {};
  for (const t of threads) {
    const d = new Date(t.updatedAt);
    let label: string;
    if (d >= today) label = 'Today';
    else if (d >= yesterday) label = 'Yesterday';
    else if (d >= weekAgo) label = 'This Week';
    else label = 'Older';
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  }
  const order = ['Today', 'Yesterday', 'This Week', 'Older'];
  return order.filter((k) => groups[k]).map((k) => [k, groups[k]]);
}

interface Props {
  threads: LocalThread[];
  activeThreadId: string | null;
  pinnedIds: Set<string>;
  isOpen: boolean;
  isLoading: boolean;
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
  onDeleteThread: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRenameThread: (id: string, title: string) => void;
  onToggleSidebar: () => void;
  onGoHome?: () => void;
}

export default function MogamboThreadSidebar({
  threads, activeThreadId, pinnedIds, isOpen, isLoading,
  onSelectThread, onNewChat, onDeleteThread, onTogglePin, onRenameThread,
  onToggleSidebar, onGoHome,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.toLowerCase();
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, search]);

  const pinned = useMemo(() => filtered.filter((t) => pinnedIds.has(t.id)), [filtered, pinnedIds]);
  const unpinned = useMemo(() => filtered.filter((t) => !pinnedIds.has(t.id)), [filtered, pinnedIds]);
  const groups = useMemo(() => groupByDate(unpinned), [unpinned]);

  return (
    <aside
      className={clsx(
        'flex flex-col flex-shrink-0 bg-slate-50 border-r border-slate-100 overflow-hidden transition-all duration-200',
        isOpen ? 'w-72' : 'w-14',
      )}
    >
      {/* ── Logo at top with inline collapse arrow ── */}
      <div className={clsx(
        'flex items-center gap-3 px-3 pt-1 pb-3 flex-shrink-0',
        !isOpen && 'justify-center px-0',
      )}>
        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.08)] flex-shrink-0 border border-slate-100">
          <img src={BOT_LOGO} alt="Mogambo" width={40} height={40} className="object-cover w-full h-full" />
        </div>
        {isOpen && (
          <span className="font-bold text-slate-700 text-lg tracking-tight truncate flex-1">Mogambo</span>
        )}
        <button
          onClick={onToggleSidebar}
          title={isOpen ? 'Collapse' : 'Expand'}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {isOpen
              ? <polyline points="15 18 9 12 15 6" />
              : <polyline points="9 18 15 12 9 6" />
            }
          </svg>
        </button>
      </div>

      {/* ── New Chat ── */}
      {isOpen && (
        <div className="px-3 pb-2 flex-shrink-0">
          <button
            onClick={onNewChat}
            style={{ backgroundColor: '#178b8f' }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors hover:opacity-90"
          >
            <Plus size={15} />
            New conversation
          </button>
        </div>
      )}

      {/* New Chat icon-only when collapsed */}
      {!isOpen && (
        <div className="flex justify-center pb-2 flex-shrink-0">
          <button
            onClick={onNewChat}
            title="New conversation"
            style={{ backgroundColor: '#178b8f' }}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-white hover:opacity-90 transition-colors"
          >
            <Plus size={15} />
          </button>
        </div>
      )}

      {/* ── Search (only when open) ── */}
      {isOpen && (
        <div className="px-3 pb-3 flex-shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-8 pr-7 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 outline-none focus:border-[#178b8f] focus:ring-2 focus:ring-[#178b8f]/10 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {isOpen && <div className="mx-3 border-t border-slate-200 mb-1 flex-shrink-0" />}

      {/* ── Thread list ── */}
      <div className="flex-1 overflow-y-auto pb-3">
        {isOpen ? (
          isLoading ? (
            <div className="space-y-2 px-3 pt-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 rounded-xl bg-slate-200 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-10 px-4 text-center">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
                <MessageSquare size={16} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 font-medium">
                {search ? 'No results found' : 'No conversations yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pinned section */}
              {pinned.length > 0 && (
                <div>
                  <p className="px-4 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <Pin size={9} className="rotate-45" /> Pinned
                  </p>
                  <ul className="space-y-0.5 px-2">
                    {pinned.map((t) => (
                      <ThreadItem
                        key={t.id}
                        thread={t}
                        isActive={activeThreadId === t.id}
                        isPinned
                        onSelect={() => onSelectThread(t.id)}
                        onDelete={() => onDeleteThread(t.id)}
                        onTogglePin={() => onTogglePin(t.id)}
                        onRename={(title) => onRenameThread(t.id, title)}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {/* Date groups */}
              {groups.map(([label, items]) => (
                <div key={label}>
                  <p className="px-4 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {label}
                  </p>
                  <ul className="space-y-0.5 px-2">
                    {items.map((t) => (
                      <ThreadItem
                        key={t.id}
                        thread={t}
                        isActive={activeThreadId === t.id}
                        isPinned={false}
                        onSelect={() => onSelectThread(t.id)}
                        onDelete={() => onDeleteThread(t.id)}
                        onTogglePin={() => onTogglePin(t.id)}
                        onRename={(title) => onRenameThread(t.id, title)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      {/* ── Sidebar bottom: Fynd logo (left) + Home button (right), QueryBee style ── */}
      <div className={clsx(
        'border-t border-slate-100 flex-shrink-0 px-4 py-3',
        isOpen ? 'flex items-center justify-between' : 'flex flex-col items-center gap-2 py-3 px-0',
      )}>
        {/* Fynd logo — left side (open) or top (collapsed) */}
        {isOpen ? (
          <img
            src={FYND_LOGO}
            alt="Fynd"
            style={{ width: 110, height: 'auto', opacity: 0.85 }}
            className="object-contain block"
          />
        ) : (
          <img
            src={FYND_LOGO}
            alt="Fynd"
            style={{ width: 26, height: 26, opacity: 0.85, objectFit: 'cover', objectPosition: 'left center' }}
            className="block"
          />
        )}
        {/* Home button */}
        <button
          title="Home"
          onClick={() => onGoHome?.()}
          className="flex items-center justify-center rounded-xl transition-colors flex-shrink-0 cursor-pointer"
          style={{
            width: 28,
            height: 28,
            border: '1px solid rgba(23,139,143,0.25)',
            background: 'rgba(23,139,143,0.08)',
            color: '#178b8f',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(23,139,143,0.18)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(23,139,143,0.08)';
          }}
        >
          <House size={18} />
        </button>
      </div>
    </aside>
  );
}
