import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import Chat from './components/Chat.jsx';
import TaskBoard from './components/TaskBoard.jsx';
import Notes from './components/Notes.jsx';

const socket = io('http://localhost:4000');

export default function App() {
  const [confirmations, setConfirmations] = useState([]);

  useEffect(() => {
    socket.on('agent:confirmation', (payload) => {
      setConfirmations((prev) => [payload, ...prev]);
    });
    return () => {
      socket.off('agent:confirmation');
    }
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b sticky top-0 z-10 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Agentic Bridge</h1>
          <p className="text-sm text-gray-500">Realtime, Intent-driven UI</p>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-6">
          <TaskBoard socket={socket} />
          <Notes socket={socket} />
        </section>
        <section className="lg:col-span-1">
          <Chat socket={socket} confirmations={confirmations} setConfirmations={setConfirmations} />
        </section>
      </main>
    </div>
  );
}
