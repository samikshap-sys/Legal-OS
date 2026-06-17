import { useRef, useState, useCallback, useEffect } from 'react';
import { ChevronDown, Share2, Pencil, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { LocalMessage } from './types';

const BOT_LOGO = '/manus-storage/mogambo-bot-logo_c4de0b99.png';

// ── Markdown-lite renderer ────────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-[#178b8f] px-1 py-0.5 rounded text-[0.85em] font-mono">$1</code>')
    .replace(/\n/g, '<br/>');
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
interface BubbleProps {
  message: LocalMessage;
  onEdit?: (newText: string) => void;
}

function MessageBubble({ message, onEdit }: BubbleProps) {
  const isUser = message.role === 'user';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== message.content && onEdit) onEdit(t);
    setEditing(false);
  };

  return (
    <div className={clsx('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.06)] border border-slate-100 mt-0.5">
          <img src={BOT_LOGO} alt="Mogambo" width={32} height={32} className="object-cover w-full h-full" />
        </div>
      )}

      <div className={clsx('flex flex-col gap-1 max-w-[72%]', isUser ? 'items-end' : 'items-start')}>
        <div className={clsx('text-[11px] font-semibold', isUser ? 'text-slate-400' : 'text-[#178b8f]')}>
          {isUser ? 'You' : 'Mogambo'}
          <span className="font-normal text-slate-400 ml-1.5">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="group relative">
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                className="px-4 py-3 rounded-2xl text-sm bg-white border-2 border-[#178b8f] outline-none resize-none text-slate-700 min-w-[200px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
              <div className="flex gap-1.5 justify-end">
                <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
                  <X size={13} />
                </button>
                <button onClick={commit} className="p-1.5 rounded-lg text-white transition-colors" style={{ backgroundColor: '#178b8f' }}>
                  <Check size={13} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className={clsx(
                  'px-4 py-3 rounded-2xl text-sm leading-relaxed',
                  isUser
                    ? 'text-white rounded-tr-sm'
                    : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
                  message.isProgress && 'opacity-70 italic',
                )}
                style={isUser ? { backgroundColor: '#178b8f' } : {}}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
              />
              {message.isStreaming && (
                <>
                  <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1 h-1 rounded-full bg-[#178b8f]"
                        style={{ animation: `mogamboDot 1.2s ease-in-out ${i*0.2}s infinite` }} />
                    ))}
                  </span>
                  <style>{`
                    @keyframes mogamboDot {
                      0%,80%,100% { transform: translateY(0); opacity: 0.4; }
                      40% { transform: translateY(-4px); opacity: 1; }
                    }
                  `}</style>
                </>
              )}
              {isUser && onEdit && !message.isStreaming && (
                <button
                  onClick={() => { setEditing(true); setDraft(message.content); }}
                  className="absolute -left-7 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit message"
                >
                  <Pencil size={11} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState({ userName }: { userName?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-6">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-[#178b8f]/10 blur-xl scale-150" />
        <div className="relative w-24 h-24 rounded-3xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100">
          <img src={BOT_LOGO} alt="Mogambo AI" width={96} height={96} className="object-cover w-full h-full" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">
        {userName ? <>Hi {userName}, how can I help you?</> : 'How can I help you?'}
      </h2>
      <p className="text-slate-400 text-sm text-center max-w-xs leading-relaxed">
        Ask me anything to get started.
      </p>
      <p className="text-[11px] text-slate-300 mt-3 flex items-center gap-1">
        <span>Powered by</span>
        <span className="font-semibold text-[#178b8f]/60">Kaily AI</span>
      </p>
    </div>
  );
}

// ── MessageList ───────────────────────────────────────────────────────────────
interface Props {
  messages: LocalMessage[];
  isLoading: boolean;
  isReady: boolean;
  onEditMessage?: (id: string, newText: string) => void;
  onSendToSlack?: () => void;
  userName?: string;
}

export default function MogamboMessageList({ messages, isLoading, isReady, onEditMessage, onSendToSlack, userName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  };

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl overflow-hidden mx-auto mb-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <img src={BOT_LOGO} alt="Mogambo" width={48} height={48} className="object-cover w-full h-full" />
          </div>
          <p className="text-sm font-medium text-slate-600">Connecting…</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div
          className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#178b8f', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto bg-white">
        <EmptyState userName={userName} />
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden bg-white flex flex-col">
      {/* Toolbar */}
      {onSendToSlack && (
        <div className="flex-shrink-0 flex items-center justify-end px-6 py-2 border-b border-slate-100 bg-white">
          <button
            onClick={onSendToSlack}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:opacity-80"
            style={{ backgroundColor: '#4A154B' }}
          >
            {/* Slack logo SVG */}
            <svg viewBox="0 0 54 54" className="w-4 h-4 flex-shrink-0" fill="none">
              <path d="M19.712 33.867a3.89 3.89 0 01-3.89 3.89 3.89 3.89 0 01-3.89-3.89 3.89 3.89 0 013.89-3.89h3.89v3.89z" fill="#fff"/>
              <path d="M21.667 33.867a3.89 3.89 0 013.889-3.89 3.89 3.89 0 013.89 3.89v9.726a3.89 3.89 0 01-3.89 3.888 3.89 3.89 0 01-3.889-3.888v-9.726z" fill="#fff"/>
              <path d="M25.556 19.712a3.89 3.89 0 01-3.89-3.89 3.89 3.89 0 013.89-3.89 3.89 3.89 0 013.889 3.89v3.89h-3.889z" fill="#fff"/>
              <path d="M25.556 21.667a3.89 3.89 0 013.889 3.889 3.89 3.89 0 01-3.889 3.89h-9.725a3.89 3.89 0 01-3.89-3.89 3.89 3.89 0 013.89-3.889h9.725z" fill="#fff"/>
              <path d="M39.711 25.556a3.89 3.89 0 013.889 3.889 3.89 3.89 0 01-3.889 3.89 3.89 3.89 0 01-3.888-3.89v-3.89h3.888z" fill="#fff"/>
              <path d="M37.756 25.556a3.89 3.89 0 01-3.889-3.889 3.89 3.89 0 013.889-3.889h9.726a3.89 3.89 0 013.888 3.89 3.89 3.89 0 01-3.888 3.888h-9.726z" fill="#fff"/>
              <path d="M33.867 39.711a3.89 3.89 0 013.888 3.889 3.89 3.89 0 01-3.888 3.888 3.89 3.89 0 01-3.89-3.888v-3.889h3.89z" fill="#fff"/>
              <path d="M33.867 37.756a3.89 3.89 0 01-3.89-3.889v-9.725a3.89 3.89 0 013.89-3.89 3.89 3.89 0 013.888 3.89v9.725a3.89 3.89 0 01-3.888 3.89z" fill="#fff"/>
            </svg>
            <Share2 size={14} />
            Send to Slack
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        <div className="space-y-7">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onEdit={onEditMessage ? (newText) => onEditMessage(msg.id, newText) : undefined}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-5 w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.06)] text-slate-500 hover:border-[#178b8f]/30 transition-all"
          style={{ color: '#178b8f' }}
        >
          <ChevronDown size={16} />
        </button>
      )}
    </div>
  );
}
