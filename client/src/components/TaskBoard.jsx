import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus } from 'lucide-react';

export default function TaskBoard({ socket }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    const { data } = await axios.get('http://localhost:4000/api/tasks');
    setTasks(data);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onCreate = (t) => setTasks((prev) => [t, ...prev]);
    const onUpdate = (t) => setTasks((prev) => prev.map((x) => x.id === t.id ? t : x));
    const onDelete = (t) => setTasks((prev) => prev.filter((x) => x.id !== t.id));
    socket.on('tasks:created', onCreate);
    socket.on('tasks:updated', onUpdate);
    socket.on('tasks:deleted', onDelete);
    return () => {
      socket.off('tasks:created', onCreate);
      socket.off('tasks:updated', onUpdate);
      socket.off('tasks:deleted', onDelete);
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
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Tasks</h2>
        <div className="flex gap-2">
          <input className="border rounded px-2 py-1" placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />
          <input className="border rounded px-2 py-1 w-64" placeholder="Description" value={description} onChange={(e)=>setDescription(e.target.value)} />
          <button onClick={add} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded"><Plus size={16}/>Add</button>
        </div>
      </div>
      <div className="grid gap-2">
        {tasks.map((t) => (
          <div key={t.id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{t.title}</div>
              <div className="text-sm text-gray-500">{t.description}</div>
            </div>
            <div className="flex gap-2">
              <span className={`px-2 py-1 rounded text-xs ${t.status==='done'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-700'}`}>{t.status}</span>
              {t.status !== 'done' && (
                <button onClick={() => markDone(t.id)} className="text-sm bg-green-600 text-white px-2 py-1 rounded">Mark done</button>
              )}
              <button onClick={() => remove(t.id)} className="text-sm bg-red-600 text-white px-2 py-1 rounded">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
