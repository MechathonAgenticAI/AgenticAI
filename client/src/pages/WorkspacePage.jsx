import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import TaskBoard from '../components/TaskBoard.jsx';
import Chat from '../components/Chat.jsx';
import { Sparkles, ArrowLeft, ExternalLink } from 'lucide-react';

export default function WorkspacePage({ socket, sessionId, confirmations, setConfirmations }) {
  const handleGoogleConnect = async () => {
    try {
      const response = await fetch(`http://localhost:4000/api/google/auth?sessionId=${sessionId}`);
      const data = await response.json();
      if (data.authUrl) {
        window.open(data.authUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to get Google auth URL:', error);
    }
  };

  const quickLinks = useMemo(() => ([
    { to: '/', label: 'Back to dashboard' },
    { to: '/schedule', label: 'Open schedule parser' },
    { to: '/smart-assistant', label: 'Launch smart assistant' }
  ]), []);
  const secondaryLinks = useMemo(() => quickLinks.filter((link) => link.to !== '/'), [quickLinks]);

  const sessionTag = useMemo(() => sessionId?.slice(-6) || 'offline', [sessionId]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05060a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(91,110,225,0.28),_transparent_58%)]"></div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(14,165,233,0.18),_transparent_60%)]"></div>

      <main className="relative z-10 mx-auto max-w-6xl space-y-8 px-6 pb-20 pt-16">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:-translate-y-0.5 hover:border-white/25 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-1 text-xs uppercase tracking-[0.2em] text-white/65">
              <Sparkles size={12} /> Agent workspace
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {secondaryLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-xs font-medium text-white/70 transition hover:-translate-y-0.5 hover:border-white/20 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">Realtime sockets</div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">AI confirmations</div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">Voice ready</div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[1.05fr_1.3fr]">
          <section className="w-full">
            <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_30px_70px_-50px_rgba(59,130,246,0.65)] backdrop-blur-2xl">
              <div className="pointer-events-none absolute -left-16 -top-16 h-36 w-36 rounded-full bg-sky-500/20 blur-3xl"></div>
              <div className="pointer-events-none absolute -right-16 -bottom-24 h-40 w-40 rounded-full bg-purple-500/18 blur-[70px]"></div>
              <div className="relative border-b border-white/10 px-6 py-5 sm:px-8">
                <h2 className="text-2xl font-semibold text-white">Task command board</h2>
                <p className="text-sm text-white/60">Add new intents, track statuses, and keep execution history in view.</p>
              </div>
              <div className="relative flex-1 p-6 sm:p-8">
                <TaskBoard socket={socket} />
              </div>
            </div>
          </section>

          <section className="w-full">
            <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_35px_80px_-55px_rgba(129,140,248,0.7)] backdrop-blur-2xl">
              <div className="pointer-events-none absolute -left-12 top-1/3 h-32 w-32 rounded-full bg-emerald-500/18 blur-[70px]"></div>
              <div className="relative border-b border-white/10 px-6 py-5 sm:px-8">
                <h2 className="text-2xl font-semibold text-white">Agent chat stream</h2>
                <p className="text-sm text-white/60">Confirm plans, supply missing parameters, and review AI summaries in real time.</p>
              </div>
              <div className="relative flex-1 p-6 sm:p-8">
                <Chat
                  socket={socket}
                  sessionId={sessionId}
                  confirmations={confirmations}
                  setConfirmations={setConfirmations}
                />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
