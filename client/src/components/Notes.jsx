import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function Notes({ socket }) {
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState('');

  const load = async () => {
    const { data } = await axios.get('http://localhost:4000/api/notes');
    setNotes(data);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onCreate = (n) => setNotes((prev) => [n, ...prev]);
    const onUpdate = (n) => setNotes((prev) => prev.map((x) => x.id === n.id ? n : x));
    const onDelete = (n) => setNotes((prev) => prev.filter((x) => x.id !== n.id));
    socket.on('note:created', onCreate);
    socket.on('note:updated', onUpdate);
    socket.on('note:deleted', onDelete);
    return () => {
      socket.off('note:created', onCreate);
      socket.off('note:updated', onUpdate);
      socket.off('note:deleted', onDelete);
    };
  }, [socket]);

  const add = async () => {
    if (!content.trim()) return;
    await axios.post('http://localhost:4000/api/notes', { content });
    setContent('');
  };

  const remove = async (id) => {
    await axios.delete(`http://localhost:4000/api/notes/${id}`);
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Notes</h2>
        <div className="flex gap-2">
          <input className="border rounded px-2 py-1 w-96" placeholder="Write a note..." value={content} onChange={(e)=>setContent(e.target.value)} />
          <button onClick={add} className="bg-blue-600 text-white px-3 py-1 rounded">Add</button>
        </div>
      </div>
      <div className="grid gap-2">
        {notes.map((n) => (
          <div key={n.id} className="border rounded p-3 flex items-center justify-between">
            <div className="text-gray-700">{n.content}</div>
            <div>
              <button onClick={() => remove(n.id)} className="text-sm bg-red-600 text-white px-2 py-1 rounded">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
