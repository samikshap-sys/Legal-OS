interface Props {
  isReady: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onGoHome?: () => void;
  userName?: string;
}
// Collapse and Home are now in the sidebar (QueryBee style).
// This header shows the connection status badge and a personalized greeting.
export default function MogamboHeader({ isReady, userName }: Props) {
  return (
    <header className="flex items-center justify-end gap-3 px-5 h-12 bg-white border-b border-slate-100 flex-shrink-0 z-20">
      {userName && (
        <span className="text-sm font-medium text-slate-500">
          Hi <span className="font-semibold text-slate-700">{userName}</span>
        </span>
      )}
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
          isReady
            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            : 'bg-amber-50 text-amber-600 border border-amber-100'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isReady ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
          }`}
        />
        {isReady ? 'Online' : 'Connecting…'}
      </span>
    </header>
  );
}
