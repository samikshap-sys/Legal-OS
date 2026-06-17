import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import clsx from 'clsx';

export interface PendingFile {
  file: File;
  id: string;
}

interface Props {
  onSend: (text: string, files: PendingFile[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  isUploading?: boolean;
}

const CHAR_WARN = 500;

export default function MogamboMessageInput({ onSend, onStop, isStreaming, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea (max ~6 lines)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed, []);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const charCount = value.length;
  const isOverLimit = charCount > CHAR_WARN;

  return (
    <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-white border-t border-slate-100">
      <div
        className={clsx(
          'flex items-end gap-2 px-4 py-3 rounded-2xl border transition-all',
          disabled
            ? 'bg-slate-50 border-slate-200'
            : 'bg-white border-slate-200 focus-within:border-[#178b8f] focus-within:ring-2 focus-within:ring-[#178b8f]/10 shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Connecting to Mogambo…' : 'Message Mogambo…'}
          disabled={disabled || isStreaming}
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm text-slate-700 placeholder-slate-400 leading-relaxed disabled:cursor-not-allowed"
          style={{ maxHeight: '160px' }}
        />

        <div className="flex items-center gap-1.5 flex-shrink-0 pb-0.5">
          {isOverLimit && (
            <span className="text-xs text-amber-500 font-medium">{charCount}</span>
          )}

          {isStreaming ? (
            <button
              onClick={onStop}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-white transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: '#178b8f' }}
              title="Stop generation"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!value.trim() || disabled}
              className={clsx(
                'w-8 h-8 flex items-center justify-center rounded-xl text-white transition-all',
                value.trim() && !disabled
                  ? 'hover:opacity-90 active:scale-95'
                  : 'opacity-40 cursor-not-allowed',
              )}
              style={{ backgroundColor: '#178b8f' }}
              title="Send message"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-400 mt-2">
        Mogambo can make mistakes. Consider checking important information.
      </p>
    </div>
  );
}
