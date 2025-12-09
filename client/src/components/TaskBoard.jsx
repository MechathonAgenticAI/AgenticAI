import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Plus, CheckCircle2, CircleDashed, ClipboardList } from 'lucide-react';

export default function TaskBoard({ socket }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    const { data } = await axios.get('http://localhost:4000/api/tasks');
    // Sort by created_at to match backend logic (ORDER BY created_at)
    const sortedTasks = data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    setTasks(sortedTasks);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onCreate = (t) => {
      // New task goes to the beginning, then resort
      setTasks((prev) => {
        const updated = [t, ...prev];
        return updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      });
    };
    const onUpdate = (t) => {
      setTasks((prev) => {
        const updated = prev.map((x) => x.id === t.id ? t : x);
        return updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      });
    };
    const onDelete = (t) => {
      setTasks((prev) => {
        const updated = prev.filter((x) => x.id !== t.id);
        return updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      });
    };
    socket.on('task:created', onCreate);
    socket.on('task:updated', onUpdate);
    socket.on('task:deleted', onDelete);
    return () => {
      socket.off('task:created', onCreate);
      socket.off('task:updated', onUpdate);
      socket.off('task:deleted', onDelete);
    };
  }, [socket]);

  const add = async () => {
    if (!title.trim()) return;
    await axios.post('http://localhost:4000/api/tasks', { title, description });
    setTitle('');
    setDescription('');
  };

  const markDone = async (id) => {
    await axios.patch(`http://localhost:4000/api/tasks/${id}`, { status: 'done' });
  };

  const remove = async (id) => {
    await axios.delete(`http://localhost:4000/api/tasks/${id}`);
  };

  const completedCount = useMemo(() => tasks.filter((t) => t.status === 'done').length, [tasks]);
  const activeCount = tasks.length - completedCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_-45px_rgba(59,130,246,0.7)] backdrop-blur-2xl sm:p-7">
        <header className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Task Intelligence</h2>
              <p className="text-sm text-white/60">Add new intents for the agent and track their completion flow.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[0.7rem] font-medium tracking-[0.08em] text-white/55">
              {['Realtime', 'Socket sync', 'AI ready'].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 leading-none backdrop-blur"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[{
              icon: <ClipboardList className="h-4 w-4" />, label: 'Total intents', value: tasks.length || 0,
              accent: 'from-blue-500/80 to-indigo-500/60'
            }, {
              icon: <CircleDashed className="h-4 w-4" />, label: 'Active', value: activeCount,
              accent: 'from-cyan-500/80 to-teal-500/60'
            }, {
              icon: <CheckCircle2 className="h-4 w-4" />, label: 'Completed', value: completedCount,
              accent: 'from-emerald-500/80 to-lime-500/60'
            }].map((stat) => (
              <div
                key={stat.label}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 backdrop-blur"
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${stat.accent} opacity-20`}></div>
                <div className="relative flex items-center gap-3 text-white">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                    {stat.icon}
                  </span>
                  <div>
                    <div className="text-lg font-semibold">{stat.value}</div>
                    <div className="text-[0.65rem] uppercase tracking-[0.1em] text-white/55">{stat.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </header>

        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <input
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 shadow-inner shadow-black/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 shadow-inner shadow-black/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
              placeholder="Optional context or description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button
            onClick={add}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-500/40 bg-gradient-to-r from-sky-500/50 via-indigo-500/50 to-purple-500/50 px-6 py-3 text-sm font-medium text-white shadow-[0_15px_35px_-20px_rgba(59,130,246,0.8)] transition-all duration-200 hover:-translate-y-1 hover:border-sky-400/60 hover:shadow-[0_25px_55px_-25px_rgba(79,70,229,0.8)] sm:w-auto"
          >
            <Plus size={18} /> Add intent
          </button>
        </div>
      </div>

      <div className="space-y-4 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_20px_60px_-45px_rgba(236,72,153,0.4)] backdrop-blur-2xl">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center text-white/60">
            <ClipboardList className="h-8 w-8 text-white/30" />
            <div className="text-lg font-medium text-white/80">No tasks yet</div>
            <p className="max-w-sm text-sm text-white/60">
              Create an intent above to see how the agent executes and updates tasks in realtime.
            </p>
          </div>
        ) : (
          tasks.map((t, index) => (
            <div
              key={t.id}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-4 min-h-[100px] transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400/40 hover:bg-emerald-500/10"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono text-white/60 leading-none flex-shrink-0">
                      #{String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-lg font-semibold text-white break-words whitespace-pre-wrap">{t.title}</h3>
                  </div>
                  <div className="text-xs font-mono uppercase tracking-[0.25em] text-white/30">{t.id.substring(0, 8)}…</div>
                  {t.description && (
                    <p className="text-sm text-white/70 break-words whitespace-pre-wrap">{t.description}</p>
                  )}
                </div>

                <div className="flex flex-shrink-0 items-center gap-2 text-xs mt-2 lg:mt-0">
                  {t.status !== 'done' && (
                    <button
                      onClick={() => markDone(t.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 font-medium text-emerald-100 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-500/30"
                    >
                      Mark done
                    </button>
                  )}

                  <button
                    onClick={() => remove(t.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-2 font-medium text-rose-100 transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-500/25"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
