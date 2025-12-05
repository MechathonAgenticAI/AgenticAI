import { query } from './db.js';
import { searchByVector, upsertEmbedding } from './vector.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const UpdateTaskParams = z.object({ id: z.string().uuid().optional(), status: z.string().optional(), title: z.string().optional(), description: z.string().optional(), query: z.string().optional() });

function requireParams(io, pendingRequests, intent, missing, message) {
  const id = uuidv4();
  const payload = { id, intent, missing, message };
  pendingRequests.set(id, { intent, missing });
  try { io?.emit?.('agent:parameters', payload); } catch {}
  return { request_parameters: payload };
}

export async function executeIntent(intent, { io, pendingRequests }) {
  // Multi-step chain handling
  if (Array.isArray(intent?.steps) && intent.steps.length > 0) {
    const results = [];
    for (const step of intent.steps) {
      const res = await executeIntent(step, { io, pendingRequests });
      results.push({ step, res });
      if (res?.request_parameters || res?.unsupported) {
        return { chain: results, final: res };
      }
    }
    return { chain: results, final: results[results.length - 1]?.res };
  }
  switch (intent.action) {
    case 'create_task': {
      const { title, description = '' } = intent.params || {};
      if (!title) return requireParams(io, pendingRequests, intent, ['title'], 'Provide a task title.');
      const id = uuidv4();
      const { rows } = await query(`INSERT INTO tasks (id, title, description, status) VALUES ($1, $2, $3, 'todo') RETURNING *`, [id, title, description]);
      const task = rows[0];
      await upsertEmbedding('task', id, `${task.title} ${task.description}`, { status: task.status });
      io.emit('tasks:created', task);
      return { task };
    }
    case 'update_task': {
      const parsed = UpdateTaskParams.safeParse(intent.params || {});
      if (!parsed.success) return requireParams(io, pendingRequests, intent, ['id'], 'Missing task id.');
      const { id, status, title, description, query: q } = parsed.data;
      let taskId = id;
      if (!taskId && q) {
        const candidates = await searchByVector(q, 3);
        const match = candidates.find(c => c.entity_type === 'task');
        if (match && match.score >= 0.6) taskId = match.entity_id;
      }
      if (!taskId) return requireParams(io, pendingRequests, intent, ['id'], 'Specify which task to update.');
      const sets = [];
      const vals = [];
      if (status !== undefined) { vals.push(status); sets.push(`status = $${vals.length}`); }
      if (title !== undefined) { vals.push(title); sets.push(`title = $${vals.length}`); }
      if (description !== undefined) { vals.push(description); sets.push(`description = $${vals.length}`); }
      if (!sets.length) return requireParams(io, pendingRequests, intent, ['status','title','description'], 'Provide a field to update.');
      vals.push(taskId);
      const { rows } = await query(`UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`, vals);
      const task = rows[0];
      if (!task) throw new Error('Task not found');
      await upsertEmbedding('task', task.id, `${task.title} ${task.description}`, { status: task.status });
      io.emit('tasks:updated', task);
      return { task };
    }
    case 'delete_task': {
      const { id } = intent.params || {};
      if (!id) return requireParams(io, pendingRequests, intent, ['id'], 'Provide the task id to delete.');
      const { rows } = await query(`DELETE FROM tasks WHERE id = $1 RETURNING *`, [id]);
      const task = rows[0];
      io.emit('tasks:deleted', task || { id });
      return { ok: true, id };
    }
    case 'list_tasks': {
      const { rows } = await query(`SELECT * FROM tasks ORDER BY created_at DESC`);
      return { tasks: rows };
    }
    case 'create_note': {
      const { content } = intent.params || {};
      if (!content) return requireParams(io, pendingRequests, intent, ['content'], 'Provide note content.');
      const id = uuidv4();
      const { rows } = await query(`INSERT INTO notes (id, content) VALUES ($1, $2) RETURNING *`, [id, content]);
      const note = rows[0];
      await upsertEmbedding('note', id, note.content, {});
      io.emit('notes:created', note);
      return { note };
    }
    case 'update_note': {
      const { id, content } = intent.params || {};
      if (!id || content === undefined) return requireParams(io, pendingRequests, intent, ['id','content'], 'Provide note id and content.');
      const { rows } = await query(`UPDATE notes SET content = $1, updated_at = now() WHERE id = $2 RETURNING *`, [content, id]);
      const note = rows[0];
      io.emit('notes:updated', note);
      return { note };
    }
    case 'delete_note': {
      const { id } = intent.params || {};
      if (!id) return requireParams(io, pendingRequests, intent, ['id'], 'Provide the note id to delete.');
      const { rows } = await query(`DELETE FROM notes WHERE id = $1 RETURNING *`, [id]);
      const note = rows[0];
      io.emit('notes:deleted', note || { id });
      return { ok: true, id };
    }
    case 'list_notes': {
      const { rows } = await query(`SELECT * FROM notes ORDER BY created_at DESC`);
      return { notes: rows };
    }
    case 'search': {
      const { query: q } = intent.params || {};
      const results = await searchByVector(q || '')
      return { results };
    }
    default:
      return { unsupported: true };
  }
}

export async function executeChain(intent, { io, pendingRequests }) {
  const results = [];
  const steps = Array.isArray(intent.steps) ? intent.steps : [];
  if (!steps.length) {
    return { chain: [], final: await executeIntent(intent, { io, pendingRequests }) };
  }
  for (const step of steps) {
    const res = await executeIntent(step, { io, pendingRequests });
    results.push({ step, res });
    if (res?.request_parameters || res?.unsupported) {
      return { chain: results, final: res };
    }
  }
  return { chain: results, final: results[results.length - 1]?.res };
}
