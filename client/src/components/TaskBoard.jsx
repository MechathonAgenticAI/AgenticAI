import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus } from 'lucide-react';

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

  return (
    <div className="backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
      <div className="flex flex-col gap-4 mb-6">
        <h2 className="text-2xl font-bold text-white bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Tasks</h2>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input 
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent backdrop-blur-sm transition-all duration-200 w-full" 
              placeholder="Title" 
              value={title} 
              onChange={(e)=>setTitle(e.target.value)} 
            />
            <input 
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent backdrop-blur-sm transition-all duration-200 w-full" 
              placeholder="Description" 
              value={description} 
              onChange={(e)=>setDescription(e.target.value)} 
            />
          </div>
          <button 
            onClick={add} 
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-2 rounded-lg font-medium hover:from-blue-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl backdrop-blur-sm w-full sm:w-auto"
          >
            <Plus size={18}/>Add
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {tasks.map((t, index) => (
          <div key={t.id} className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-white/10 transition-all duration-200 group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs bg-gradient-to-r from-blue-400/20 to-purple-400/20 border border-blue-400/30 px-3 py-1 rounded-full font-mono text-blue-300 backdrop-blur-sm flex-shrink-0">#{index + 1}</span>
                <div className="font-semibold text-white text-lg truncate">{t.title}</div>
              </div>
              <div className="text-sm text-white/60 font-mono mt-1 truncate">ID: {t.id.substring(0, 8)}...</div>
              {t.description && <div className="text-sm text-white/70 mt-2 italic line-clamp-2">{t.description}</div>}
            </div>
            <div className="flex gap-2 items-center flex-shrink-0">
              <span className={`px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm border flex-shrink-0 ${
                t.status==='done' 
                  ? 'bg-green-400/20 text-green-300 border-green-400/30' 
                  : 'bg-gray-400/20 text-gray-300 border-gray-400/30'
              }`}>
                {t.status}
              </span>
              {t.status !== 'done' && (
                <button 
                  onClick={() => markDone(t.id)} 
                  className="text-sm bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-lg font-medium hover:from-green-600 hover:to-emerald-600 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg backdrop-blur-sm flex-shrink-0"
                >
                  ✓ Done
                </button>
              )}
              <button 
                onClick={() => remove(t.id)} 
                className="text-sm bg-gradient-to-r from-red-500 to-pink-500 text-white px-4 py-2 rounded-lg font-medium hover:from-red-600 hover:to-pink-600 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg backdrop-blur-sm flex-shrink-0"
              >
                × Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
