import React from 'react';
import { Link } from 'react-router-dom';
import TaskBoard from '../components/TaskBoard.jsx';
import Chat from '../components/Chat.jsx';
import { Sparkles, ChevronRight, Share2, ExternalLink } from 'lucide-react';

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
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05060a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.22),_transparent_55%)]"></div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(236,72,153,0.18),_transparent_60%)]"></div>

      <header className="relative z-20 border-b border-white/10 bg-black/60 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
              <Sparkles size={14} /> Agent Workspace
            </div>
            <h1 className="text-4xl font-semibold leading-tight text-white lg:text-5xl">
              Operate alongside your AI copilot in a shared command center
            </h1>
            <p className="max-w-2xl text-base text-white/60">
              Capture ideas, manage task execution, and collaborate with the agent in realtime. Every update is instantly reflected through sockets and streamed confirmations.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/50">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">Realtime sync</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">Socket events</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">AI confirmations</span>
            </div>
          </div>

          <nav className="grid w-full max-w-sm gap-3 text-sm text-white/70">
            {[{
              to: '/',
              label: 'Return to Dashboard',
              accent: 'from-cyan-400/40 to-sky-500/30'
            }, {
              to: '/schedule',
              label: 'Jump to Schedule Parser',
              accent: 'from-purple-500/40 to-pink-500/30'
            }, {
              to: '/smart-assistant',
              label: 'Open Smart Assistant',
              accent: 'from-emerald-500/40 to-blue-500/30'
            }].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-medium transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10 text-left whitespace-normal`}
              >
                <div className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 bg-gradient-to-r ${link.accent}`}></div>
                <div className="relative flex items-center justify-between gap-3">
                  <span className="flex-1 break-words leading-snug">{link.label}</span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-20 pt-12 xl:flex-row">
        <section className="w-full xl:w-[45%]">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] shadow-[0_30px_80px_-50px_rgba(59,130,246,0.7)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute -left-16 -top-16 h-36 w-36 rounded-full bg-sky-500/20 blur-3xl"></div>
            <div className="pointer-events-none absolute -right-16 -bottom-24 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl"></div>
            <div className="relative border-b border-white/10 px-6 py-5 sm:px-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Task Command Board</h2>
                  <p className="text-sm text-white/60">Stay aligned with the agent’s latest task operations and updates.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGoogleConnect}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-400/40 bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-100 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-500/30"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Connect Google
                  </button>
                  <Share2 className="hidden h-5 w-5 text-white/40 sm:block" />
                </div>
              </div>
            </div>
            <div className="relative p-6 sm:p-8">
              <TaskBoard socket={socket} />
            </div>
          </div>
        </section>

        <section className="w-full xl:w-[55%]">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] shadow-[0_30px_90px_-55px_rgba(129,140,248,0.75)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute -left-10 top-1/3 h-28 w-28 rounded-full bg-emerald-500/15 blur-3xl"></div>
            <div className="relative border-b border-white/10 px-6 py-5 sm:px-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Agent Chat Stream</h2>
                  <p className="text-sm text-white/60">Confirm plans, provide missing data, and see intents in realtime.</p>
                </div>
              </div>
            </div>
            <div className="relative p-6 sm:p-8">
              <Chat
                socket={socket}
                sessionId={sessionId}
                confirmations={confirmations}
                setConfirmations={setConfirmations}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
