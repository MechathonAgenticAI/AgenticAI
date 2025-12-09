import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Bot, CalendarRange, LayoutDashboard } from 'lucide-react';
import SchedulePage from './pages/SchedulePage.jsx';
import SmartAssistant from './components/SmartAssistant.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';

const socket = io('http://localhost:4000');

export default function App() {
  const [confirmations, setConfirmations] = useState([]);
  const [sessionId] = useState(() => {
    try {
      const existing = localStorage.getItem('agent_session_id');
      if (existing) return existing;
      const id = (window.crypto?.randomUUID?.() || (Math.random().toString(36).slice(2) + Date.now().toString(36)));
      localStorage.setItem('agent_session_id', id);
      return id;
    } catch {
      return (Math.random().toString(36).slice(2) + Date.now().toString(36));
    }
  });

  useEffect(() => {
    const onNeedsConfirm = (payload) => setConfirmations((prev) => [payload, ...prev]);
    socket.on('agent:needs_confirmation', onNeedsConfirm);
    return () => {
      socket.off('agent:needs_confirmation', onNeedsConfirm);
    }
  }, []);

  const navCards = useMemo(() => ([
    {
      to: '/workspace',
      title: 'Task & Agent Workspace',
      copy: 'Coordinate tasks, chat with your AI partner, and see updates in realtime.',
      accent: 'from-sky-500/30 via-blue-500/20 to-emerald-500/20',
      border: 'hover:border-sky-400/40',
      icon: <LayoutDashboard className="h-6 w-6 text-sky-300" />
    },
    {
      to: '/schedule',
      title: 'Schedule Parser',
      copy: 'Transform screenshots or photos of schedules into structured, editable plans.',
      accent: 'from-fuchsia-500/30 via-rose-500/20 to-amber-500/20',
      border: 'hover:border-fuchsia-400/40',
      icon: <CalendarRange className="h-6 w-6 text-rose-300" />
    },
    {
      to: '/smart-assistant',
      title: 'Smart Assistant',
      copy: 'Give natural language or voice commands and let the agent handle the rest.',
      accent: 'from-cyan-500/30 via-blue-500/20 to-purple-500/20',
      border: 'hover:border-cyan-400/40',
      icon: <Bot className="h-6 w-6 text-cyan-300" />
    }
  ]), []);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="relative min-h-screen overflow-hidden bg-[#040507] text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(130,87,229,0.28),_transparent_60%)]"></div>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(15,204,204,0.22),_transparent_55%)]"></div>

            <header className="relative z-20 border-b border-white/10 bg-black/60 backdrop-blur-2xl">
              <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                    Agentic Bridge
                  </div>
                  <h1 className="text-4xl font-semibold tracking-tight text-white lg:text-5xl">
                    Agentic Bridge
                  </h1>
                  <p className="max-w-xl text-base text-white/60">
                    Launch into dedicated workspaces, parse complex schedules, or collaborate with your AI copilot—everything starts here.
                  </p>
                </div>
                <div className="relative rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/70 shadow-[0_25px_80px_-40px_rgba(78,205,196,0.6)] backdrop-blur-xl lg:w-80">
                  <div className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-gradient-to-br from-sky-500/40 to-emerald-500/40 blur-2xl"></div>
                  <p className="leading-relaxed">
                    • Realtime sockets keep tasks synced<br />
                    • Cohere-powered intent parsing<br />
                    • Seamless calendar & reminder automation
                  </p>
                </div>
              </div>
            </header>

            <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-12">
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {navCards.map((card) => (
                  <Link
                    key={card.to}
                    to={card.to}
                    className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-[0_30px_80px_-50px_rgba(59,130,246,0.7)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-2 hover:bg-white/[0.09] ${card.border}`}
                  >
                    <div className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-br ${card.accent}`}></div>
                    <div className="relative space-y-4">
                      <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm font-medium text-white/80 shadow-inner">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
                          {card.icon}
                        </span>
                        <span>Launch</span>
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-semibold text-white">{card.title}</h2>
                        <p className="text-sm text-white/70">{card.copy}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-white/70 transition-all group-hover:gap-3 group-hover:text-white">
                        Enter experience
                        <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                    <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
                  </Link>
                ))}
              </div>
            </main>

            <footer className="relative z-10 border-t border-white/5 bg-black/40 py-8 text-sm text-white/50 backdrop-blur-2xl">
              <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 md:flex-row md:items-center md:justify-between">
                <span>Built for the Agentic Bridge evaluation deck.</span>
                <span className="text-white/40">Realtime • Secure • AI-native</span>
              </div>
            </footer>
          </div>
        }
      />
      <Route path="/workspace" element={<WorkspacePage socket={socket} sessionId={sessionId} confirmations={confirmations} setConfirmations={setConfirmations} />} />
      <Route path="/schedule" element={<SchedulePage />} />
      <Route path="/smart-assistant" element={<SmartAssistant />} />
    </Routes>
  );
}
