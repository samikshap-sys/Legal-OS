import { useState, useEffect } from 'react';
import {
  MessageSquare, Zap, ArrowRight, Slack, Shield, Sparkles,
} from 'lucide-react';
import { Link } from 'wouter';
import { useMogamboUser } from '@/contexts/MogamboUserContext';
import MogamboChatInterface from './MogamboChatInterface';
const BOT_LOGO = '/manus-storage/mogambo-bot-logo_c4de0b99.png';
const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Natural Conversations',
    desc: 'Chat naturally with Mogambo. It understands context, remembers your conversation, and gives thoughtful responses.',
  },
  {
    icon: Slack,
    title: 'Slack Integration',
    desc: 'Share any conversation directly to Slack channels or DMs with one click. Keep your team in the loop.',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    desc: 'Powered by Kaily AI with real-time streaming responses. No waiting, no loading screens.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    desc: 'Your conversations are private. Mogambo never shares your data with third parties.',
  },
  {
    icon: Sparkles,
    title: 'Smart Threads',
    desc: 'Organize your conversations into threads. Pin important ones, search, and manage your history.',
  },
  {
    icon: MessageSquare,
    title: 'Always Available',
    desc: "Mogambo is always online and ready to help. No downtime, no maintenance windows.",
  },
];
export default function MogamboHome() {
  const [inChat, setInChat] = useState(false);
  const { mogamboUser, mogamboLoading } = useMogamboUser();
  const firstName = mogamboUser?.name?.split(' ')[0] ?? '';

  // Auto-open chat when redirected back after OAuth success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mogambo_auth') === 'success' && mogamboUser) {
      window.history.replaceState({}, '', '/mogambo');
      setInChat(true);
    }
  }, [mogamboUser]);

  const handleStartChat = () => {
    if (mogamboLoading) return;
    if (!mogamboUser) {
      const origin = window.location.origin;
      window.location.href = `/api/qb/auth/google?origin=${encodeURIComponent(origin)}&flow=mogambo`;
      return;
    }
    setInChat(true);
  };

  if (inChat) {
    return (
      <div style={{ animation: 'mogamboPageEnter 0.4s cubic-bezier(0.16,1,0.3,1)' }} className="h-full">
        <MogamboChatInterface onGoHome={() => setInChat(false)} />
        <style>{`
          @keyframes mogamboPageEnter {
            from { opacity: 0; transform: scale(1.01) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="flex items-center gap-3">
          {/* Back to FinOps */}
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-[#178b8f] transition-colors mr-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to FinOps
          </Link>
          <div className="w-px h-5 bg-slate-200" />
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.06)] border border-slate-100 ml-2">
            <img src={BOT_LOGO} alt="Mogambo" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-slate-800 text-lg tracking-tight">Mogambo</span>
        </div>
        <button
          onClick={handleStartChat}
          disabled={mogamboLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          style={{ backgroundColor: '#178b8f' }}
        >
          {mogamboUser ? (
            <>Open Chat <ArrowRight size={15} /></>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" fillOpacity="0.85"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" fillOpacity="0.7"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" fillOpacity="0.9"/>
              </svg>
              Sign in
            </>
          )}
        </button>
      </nav>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 60% 40%, rgba(23,139,143,0.07) 0%, transparent 70%)',
          }}
        />
        <div className="relative flex flex-col md:flex-row items-center gap-10 px-10 py-20 max-w-6xl mx-auto">
          {/* Left text */}
          <div className="flex-1 space-y-6" style={{ animation: 'mogamboSlideRight 0.5s ease both' }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#178b8f]/8 border border-[#178b8f]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#178b8f] animate-pulse" />
              <span className="text-xs font-semibold text-[#178b8f]">Powered by Kaily AI</span>
            </div>
            <h1 className="text-5xl font-extrabold text-slate-900 leading-tight tracking-tight">
              {firstName ? (
                <>Hi {firstName},<br />meet <span style={{ color: '#178b8f' }}>Mogambo</span></>
              ) : (
                <>Meet <span style={{ color: '#178b8f' }}>Mogambo</span></>
              )}
            </h1>
            <p className="text-slate-500 text-lg leading-relaxed max-w-md">
              Your AI-powered Slack assistant. Ask anything, get instant answers, and share insights with your team — all in one place.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleStartChat}
                disabled={mogamboLoading}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-bold shadow-[0_8px_24px_rgba(23,139,143,0.25)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#178b8f' }}
              >
                {mogamboLoading ? (
                  <>Loading…</>
                ) : mogamboUser ? (
                  <>Start Chatting <ArrowRight size={16} /></>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" fillOpacity="0.85"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" fillOpacity="0.7"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" fillOpacity="0.9"/>
                    </svg>
                    Sign in with Google
                  </>
                )}
              </button>
              <span className="text-slate-400 text-sm">Only @gofynd.com accounts</span>
            </div>
          </div>
          {/* Right visual */}
          <div className="flex-shrink-0 relative" style={{ animation: 'mogamboSlideLeft 0.5s ease 0.1s both' }}>
            <div
              className="relative w-72 h-72 rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.12)] border border-slate-100"
              style={{ animation: 'mogamboFloat 6s ease-in-out infinite' }}
            >
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(135deg, #edf7f7 0%, #d0f0f1 100%)' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  {/* Ripple rings */}
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="absolute rounded-full border-2 border-[#178b8f]/20"
                      style={{
                        width: `${120 + i * 50}px`,
                        height: `${120 + i * 50}px`,
                        top: `${-i * 25}px`,
                        left: `${-i * 25}px`,
                        animation: `mogamboRipple 2.5s ease-out ${i * 0.8}s infinite`,
                      }}
                    />
                  ))}
                  <div className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.1)] border border-white/50">
                    <img src={BOT_LOGO} alt="Mogambo AI" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
              {/* Floating badge */}
              <div
                className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-xl px-4 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-100"
                style={{ animation: 'mogamboFloat 4s ease-in-out 1s infinite', whiteSpace: 'nowrap' }}
              >
                <div className="flex items-center gap-1.5">
                  <Zap size={12} className="text-amber-500" />
                  <span className="text-xs font-semibold text-slate-700">AI Powered</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* ── Divider ───────────────────────────────────────────────────────────── */}
      <div className="w-full px-10 py-4">
        <div
          className="h-px"
          style={{ background: 'linear-gradient(to right, transparent, #8dd4d6, transparent)' }}
        />
      </div>
      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section className="w-full px-10 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Everything you need, nothing you don't</h2>
          <p className="text-slate-500 text-sm">Simple by design. Powerful by default.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className="group p-6 bg-white border border-slate-100 rounded-2xl hover:border-[#8dd4d6] transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
              style={{ animation: `mogamboSlideUp 0.4s ease ${i * 0.1}s both` }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 group-hover:opacity-90 transition-colors"
                style={{ backgroundColor: '#edf7f7' }}
              >
                <Icon size={18} style={{ color: '#178b8f' }} />
              </div>
              <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
      {/* ── CTA banner ───────────────────────────────────────────────────────── */}
      <section className="w-full px-10 pb-16">
        <div
          className="relative overflow-hidden rounded-3xl px-10 py-12 text-center max-w-5xl mx-auto"
          style={{ background: 'linear-gradient(135deg, #178b8f 0%, #2aaaad 100%)' }}
        >
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-white/5" />
          <div className="relative z-10">
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg bg-white/10">
                <img src={BOT_LOGO} alt="Mogambo" className="w-full h-full object-cover" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Ready to meet Mogambo?</h2>
            <p className="text-white/70 text-sm mb-6">Your Slack workspace will never be the same.</p>
            <button
              onClick={handleStartChat}
              disabled={mogamboLoading}
              className="inline-flex items-center gap-2 px-7 py-3 bg-white font-bold rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
              style={{ color: '#178b8f' }}
            >
              {mogamboUser ? (
                <>Open Chat Now <ArrowRight size={16} /></>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#178b8f"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#178b8f" fillOpacity="0.85"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#178b8f" fillOpacity="0.7"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#178b8f" fillOpacity="0.9"/>
                  </svg>
                  Sign in with Google
                </>
              )}
            </button>
          </div>
        </div>
      </section>
      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 px-6 py-5">
        <p className="text-center text-xs text-slate-400">
          Mogambo AI · Built on Kaily AI · Slack Assistant
        </p>
      </footer>
      <style>{`
        @keyframes mogamboSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes mogamboFloat {
          0%,100% { transform: perspective(1000px) rotateY(-4deg) translateY(0px); }
          50%     { transform: perspective(1000px) rotateY(4deg) translateY(-14px); }
        }
        @keyframes mogamboRipple {
          0%   { transform: scale(0.95); opacity: 0.8; }
          100% { transform: scale(1.6);  opacity: 0; }
        }
        @keyframes mogamboSlideUp {
          0%   { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes mogamboSlideLeft {
          0%   { opacity: 0; transform: translateX(30px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes mogamboSlideRight {
          0%   { opacity: 0; transform: translateX(-30px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes mogamboFadeIn {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
