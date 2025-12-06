import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import Chat from './components/Chat.jsx';
import TaskBoard from './components/TaskBoard.jsx';

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-3xl"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-blue-900/20 via-transparent to-purple-900/20"></div>
      
      <header className="relative sticky top-0 z-10 backdrop-blur-xl bg-white/5 border-b border-white/10 shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Agentic Bridge</h1>
          <p className="text-sm text-white/70 font-medium">Realtime, Intent-driven UI</p>
        </div>
      </header>
      
      <main className="relative max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="lg:col-span-1">
          <TaskBoard socket={socket} />
        </section>
        <section className="lg:col-span-1">
          <Chat socket={socket} sessionId={sessionId} confirmations={confirmations} setConfirmations={setConfirmations} />
        </section>
      </main>
    </div>
  );
}
