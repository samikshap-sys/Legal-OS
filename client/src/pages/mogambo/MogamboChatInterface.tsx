import { useState, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useMogamboUser } from '@/contexts/MogamboUserContext';
import { useKailyBot } from './useKailyBot';
import { LocalMessage, LocalThread } from './types';
import MogamboHeader from './MogamboHeader';
import MogamboThreadSidebar from './MogamboThreadSidebar';
import MogamboMessageList from './MogamboMessageList';
import MogamboMessageInput, { PendingFile } from './MogamboMessageInput';
import MogamboSendToSlackModal from './MogamboSendToSlackModal';

// The Kaily app token is read from the server-injected window variable or env
// In our tRPC stack we expose it as a public env var via Vite
const TOKEN = (import.meta as unknown as { env: Record<string, string> }).env.VITE_KAILY_APP_TOKEN ?? '';

interface Props {
  onGoHome?: () => void;
}

export default function MogamboChatInterface({ onGoHome }: Props) {
  const { mogamboUser } = useMogamboUser();
  const firstName = mogamboUser?.name?.split(' ')[0] ?? '';
  // Pass user identity so Kaily SDK links threads to this user (enables history)
  const { bot, isReady, error } = useKailyBot(TOKEN, {
    name: mogamboUser?.name ?? '',
    email: mogamboUser?.email ?? '',
  });
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [threads, setThreads] = useState<LocalThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [slackModalOpen, setSlackModalOpen] = useState(false);
  const [isUploading] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const s = localStorage.getItem('mogambo_pinned');
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  });

  const togglePin = useCallback((threadId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      localStorage.setItem('mogambo_pinned', JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const streamingIdRef = useRef<string | null>(null);
  const isFirstMessageRef = useRef(true);
  // Keep a synchronous ref of activeThreadId so bot.message() always uses the latest value
  const activeThreadIdRef = useRef<string | null>(null);
  // Keep a synchronous ref of mogamboUser so BQ saves always use the latest user identity
  const mogamboUserRef = useRef(mogamboUser);
  useEffect(() => { mogamboUserRef.current = mogamboUser; }, [mogamboUser]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizeThreads = (raw: unknown): LocalThread[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = raw as any;
    const candidate = Array.isArray(raw)
      ? raw
      : r?.data ?? r?.threads ?? r?.items ?? r?.result ?? raw;
    const list = Array.isArray(candidate) ? candidate : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (list as any[]).map((t) => ({
      id: String(t.id ?? t._id ?? ''),
      title: String(t.title ?? t.name ?? 'New Conversation'),
      createdAt: String(t.created_at ?? t.createdAt ?? new Date().toISOString()),
      updatedAt: String(t.updated_at ?? t.updatedAt ?? new Date().toISOString()),
    }));
  };

  const normalizeMessages = (raw: unknown): LocalMessage[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = raw as any;
    const candidate = Array.isArray(raw)
      ? raw
      : r?.data ?? r?.messages ?? r?.items ?? r?.result ?? raw;
    const list = Array.isArray(candidate) ? candidate : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (list as any[]).map((m) => ({
      id: String(m.id ?? m._id ?? Date.now()),
      role: m.role === 'user' ? 'user' : ('assistant' as const),
      content: String(m.content ?? m.text ?? m.message ?? ''),
      timestamp: new Date(m.created_at ?? m.createdAt ?? Date.now()),
    }));
  };

  // ── BQ / tRPC utils (declared early so loadThreadsFromBQ can reference them) ──────
  const trpcUtils = trpc.useUtils();

  // ── Load threads from BQ (persists across page refreshes) ───────────────────
  const loadThreadsFromBQ = useCallback(async () => {
    const email = mogamboUserRef.current?.email ?? '';
    if (!email) return;
    setIsLoadingThreads(true);
    try {
      const result = await trpcUtils.mogambo.getUserThreads.fetch({ user_email: email });
      const bqThreads: LocalThread[] = result.threads.map((t) => ({
        id: t.conversation_id,
        title: t.title || 'Conversation',
        createdAt: t.last_active,
        updatedAt: t.last_active,
      }));
      setThreads(bqThreads);
    } catch (err) {
      console.error('[BQ] Failed to load threads:', err);
    } finally {
      setIsLoadingThreads(false);
    }
  }, [trpcUtils]);

  // Load BQ threads once mogamboUser is available
  useEffect(() => {
    if (mogamboUser?.email) loadThreadsFromBQ();
  }, [mogamboUser?.email, loadThreadsFromBQ]);

  // Keep ref in sync with state
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // ── Select a thread ───────────────────────────────────────────────────────────
  const handleSelectThread = useCallback(
    async (threadId: string) => {
      if (isStreaming) return;
      setActiveThreadId(threadId);
      activeThreadIdRef.current = threadId;
      isFirstMessageRef.current = false;
      setIsLoadingMessages(true);
      try {
        const email = mogamboUserRef.current?.email ?? '';
        if (!email) throw new Error('No user email');
        const result = await trpcUtils.mogambo.getHistory.fetch({
          conversation_id: threadId,
          user_email: email,
        });
        const restored: LocalMessage[] = result.messages.map((m, i) => ({
          id: `bq-${threadId}-${i}`,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
        }));
        setMessages(restored);
      } catch (err) {
        console.error('[BQ] Failed to load thread messages:', err);
        setMessages([]);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [isStreaming, trpcUtils],
  );

  // ── New chat ──────────────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    if (isStreaming) return;
    setActiveThreadId(null);
    activeThreadIdRef.current = null;
    setMessages([]);
    isFirstMessageRef.current = true;
  }, [isStreaming]);

  // ── Rename a thread ───────────────────────────────────────────────────────────
  const handleRenameThread = useCallback(
    async (threadId: string, title: string) => {
      if (!bot) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (bot as any).updateThread({ threadId, title });
        setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title } : t)));
      } catch {
        setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title } : t)));
      }
    },
    [bot],
  );

  // ── Delete a thread (removes from BQ + local state) ──────────────────────────────
  const deleteThreadMutation = trpc.mogambo.deleteThread.useMutation();
  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const email = mogamboUserRef.current?.email ?? '';
      // Optimistically remove from sidebar immediately
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadIdRef.current === threadId) {
        setActiveThreadId(null);
        activeThreadIdRef.current = null;
        setMessages([]);
        isFirstMessageRef.current = true;
      }
      // Also remove from pinned if pinned
      setPinnedIds((prev) => {
        if (!prev.has(threadId)) return prev;
        const next = new Set(prev);
        next.delete(threadId);
        localStorage.setItem('mogambo_pinned', JSON.stringify(Array.from(next)));
        return next;
      });
      // Delete from BQ (fire-and-forget, UI already updated)
      if (email) {
        deleteThreadMutation.mutate(
          { conversation_id: threadId, user_email: email },
          { onError: (err) => console.error('[BQ] Failed to delete thread:', err) },
        );
      }
    },
    [deleteThreadMutation],
  );

  // ── Process files (no-op in this build — file upload not wired) ───────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processFiles = useCallback(async (_files: PendingFile[]): Promise<{ attached: any[]; context: string }>  => {
    return { attached: [], context: '' };
  }, []);

  // ── BQ mutation helpers ──────────────────────────────────────────────────────
  const saveMessageMutation = trpc.mogambo.saveMessage.useMutation();

  // ── Send a message ────────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (text: string, files: PendingFile[]) => {
      if (!bot || (!text.trim() && files.length === 0) || isStreaming) return;

      // Upload files first
      const { attached: uploadedFiles, context: fileContext } = await processFiles(files);

      const userMsg: LocalMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      const streamingId = `streaming-${Date.now()}`;
      streamingIdRef.current = streamingId;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: streamingId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true },
      ]);
      setIsStreaming(true);

      let accumulated = '';

      // Generate our own UUID for new conversations — do NOT wait for Kaily SDK to return one.
      // This guarantees we always have a thread ID before the bot.message() call.
      if (!activeThreadIdRef.current) {
        const newId = crypto.randomUUID();
        activeThreadIdRef.current = newId;
        setActiveThreadId(newId);
        // Auto-name the thread from the first message text
        if (isFirstMessageRef.current) {
          isFirstMessageRef.current = false;
          const autoTitle = text.trim().slice(0, 50);
          // Add to local thread list immediately so sidebar shows it
          setThreads((prev) => [{
            id: newId,
            title: autoTitle,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, ...prev]);
        }
      }

      // Save user message to BQ (fire-and-forget, non-blocking)
      const savePendingUserMsg = { text, conversationId: activeThreadIdRef.current };

      try {
        // Use ref for synchronous access to latest thread ID (avoids stale closure bug)
        const currentThreadId = activeThreadIdRef.current;

        // Fetch BQ conversation history to inject as context for the LLM
        let historyContext = '';
        const userEmail = mogamboUserRef.current?.email ?? '';
        if (currentThreadId && userEmail) {
          try {
            const histResult = await trpcUtils.mogambo.getHistory.fetch({
              conversation_id: currentThreadId,
              user_email: userEmail,
            });
            if (histResult.messages.length > 0) {
              historyContext = histResult.messages
                .map((m) => `[${m.created_at}] ${m.role === 'user' ? 'User' : 'Mogambo'}: ${m.content}`)
                .join('\n');
            }
          } catch (histErr) {
            console.warn('[BQ] Failed to fetch conversation history:', histErr);
          }
        }

        // Build the message text — prepend conversation history directly so the LLM
        // definitely sees it (custom_data is metadata only and not injected into the prompt)
        const baseText = fileContext ? `${text}${fileContext}` : text;
        const messageText = historyContext
          ? `[CONVERSATION HISTORY — use this to answer questions about previous messages]\n${historyContext}\n[END OF HISTORY]\n\nUser: ${baseText}`
          : baseText;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (bot as any).message(
          {
            text: messageText,
            path: typeof window !== 'undefined' ? window.location.pathname : '/',
            ...(currentThreadId ? { thread_id: currentThreadId } : {}),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(uploadedFiles.some((f: any) => f.path) ? {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              files: uploadedFiles.filter((f: any) => f.path).map((f: any) => ({ path: f.path, name: f.name, size: f.size, type: f.type }))
            } : {}),
          },
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deltaListener: (res: any) => {
              const chunk: string = res?.data?.content ?? '';
              accumulated += chunk;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === streamingId ? { ...msg, content: accumulated } : msg
                )
              );
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            replyListener: (_res: any) => {
              // Thread ID is now managed by us (UUID generated before bot.message call)
              // No need to extract thread_id from SDK response
              const resolvedThreadId = activeThreadIdRef.current;
              // Save user message + assistant reply to BQ (fire-and-forget)
              const bqEmail = mogamboUserRef.current?.email ?? '';
              const bqName = mogamboUserRef.current?.name ?? '';
              console.log('[BQ] Saving — threadId:', resolvedThreadId, 'email:', bqEmail || '(empty!)');
              if (resolvedThreadId && bqEmail) {
                const userText = savePendingUserMsg.text;
                const assistantText = accumulated;
                saveMessageMutation.mutate(
                  {
                    conversation_id: resolvedThreadId,
                    role: 'user',
                    message: userText,
                    user_email: bqEmail,
                    user_name: bqName,
                  },
                  {
                    onSuccess: () => console.log('[BQ] User message saved OK'),
                    onError: (err) => console.error('[BQ] User message save FAILED:', err),
                  }
                );
                if (assistantText) {
                  saveMessageMutation.mutate(
                    {
                      conversation_id: resolvedThreadId,
                      role: 'assistant',
                      message: assistantText,
                      user_email: bqEmail,
                      user_name: bqName,
                    },
                    {
                      onSuccess: () => console.log('[BQ] Assistant message saved OK'),
                      onError: (err) => console.error('[BQ] Assistant message save FAILED:', err),
                    }
                  );
                }
              } else {
                console.warn('[BQ] Skipping save — missing threadId or email. threadId:', resolvedThreadId, 'email:', bqEmail);
              }
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === streamingId
                    ? { ...msg, content: accumulated, isStreaming: false }
                    : msg
                )
              );
              setIsStreaming(false);
              streamingIdRef.current = null;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            progressListener: (res: any) => {
              const progressText: string = res?.data?.content ?? '';
              if (progressText && !accumulated) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === streamingId
                      ? { ...msg, content: progressText, isProgress: true }
                      : msg
                  )
                );
              }
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            toolMessageListener: (res: any) => {
              console.log('[Kaily] Tool invoked:', res?.data);
            },
          }
        );
      } catch (err) {
        console.error('Message error:', JSON.stringify(err), err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingId
              ? { ...msg, content: 'Something went wrong. Please try again.', isStreaming: false }
              : msg
          )
        );
        setIsStreaming(false);
        streamingIdRef.current = null;
      }
    },
    [bot, isStreaming, activeThreadId, processFiles, saveMessageMutation, trpcUtils],
  );

  // ── Edit a message ────────────────────────────────────────────────────────────
  const handleEditMessage = useCallback(
    (messageId: string, newText: string) => {
      if (isStreaming) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        return idx >= 0 ? prev.slice(0, idx) : prev;
      });
      setTimeout(() => handleSendMessage(newText, []), 50);
    },
    [isStreaming, handleSendMessage],
  );

  // ── Stop generation ───────────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    if (!bot || !activeThreadId) {
      setMessages((prev) =>
        prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg)),
      );
      setIsStreaming(false);
      return;
    }
    try {
      await bot.stopMessage({ thread_id: activeThreadId });
    } catch (err) {
      console.error('Failed to stop:', err);
    } finally {
      setMessages((prev) =>
        prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg)),
      );
      setIsStreaming(false);
      streamingIdRef.current = null;
    }
  }, [bot, activeThreadId]);

  // ── Error state ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-center px-6">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <p className="text-red-400 font-medium">Initialization failed</p>
          <p className="text-sm text-zinc-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {slackModalOpen && (
        <MogamboSendToSlackModal
          messages={messages}
          threadTitle={activeThread?.title}
          onClose={() => setSlackModalOpen(false)}
        />
      )}
      <MogamboHeader
        isReady={isReady}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((p) => !p)}
        onGoHome={onGoHome}
        userName={firstName}
      />
      <div className="flex flex-1 overflow-hidden">
        <MogamboThreadSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          pinnedIds={pinnedIds}
          isOpen={sidebarOpen}
          isLoading={isLoadingThreads}
          onSelectThread={handleSelectThread}
          onNewChat={handleNewChat}
          onDeleteThread={handleDeleteThread}
          onTogglePin={togglePin}
          onRenameThread={handleRenameThread}
          onToggleSidebar={() => setSidebarOpen((p) => !p)}
          onGoHome={onGoHome}
        />
        <main className="flex flex-col flex-1 overflow-hidden">
          <MogamboMessageList
            messages={messages}
            isLoading={isLoadingMessages}
            isReady={isReady}
            onEditMessage={handleEditMessage}
            onSendToSlack={messages.length > 0 ? () => setSlackModalOpen(true) : undefined}
            userName={firstName}
          />
          <MogamboMessageInput
            onSend={handleSendMessage}
            onStop={handleStop}
            isStreaming={isStreaming}
            disabled={!isReady}
            isUploading={isUploading}
          />
        </main>
      </div>
    </div>
  );
}
