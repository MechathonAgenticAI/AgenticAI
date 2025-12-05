import { query } from './db.js';
import { searchByVector, upsertEmbedding, deleteEmbedding } from './vector.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const UpdateTaskParams = z.object({ id: z.string().uuid().optional(), status: z.string().optional(), title: z.string().optional(), description: z.string().optional(), query: z.string().optional() });

function requireParams(io, pendingRequests, plan, missing, message) {
  const id = uuidv4();
  const payload = { id, plan, missing, message };
  pendingRequests.set(id, { plan, missing });
  try { io?.emit?.('agent:needs_clarification', payload); } catch {}
  return { request_parameters: payload };
}

export async function executePlan(plan, { io, pendingRequests, pendingConfirmations }) {
  console.log('Executing plan:', JSON.stringify(plan, null, 2));
  
  // Handle confirmations for destructive actions
  if (plan.confirmations?.length > 0) {
    const id = uuidv4();
    pendingConfirmations.set(id, { plan });
    const payload = { confirmationToken: id, plan, description: plan.confirmations.join('\n') };
    io.emit('agent:needs_confirmation', payload);
    return { requires_confirmation: true, confirmation_id: id };
  }

  // Execute all actions in sequence
  const results = [];
  for (const action of plan.actions) {
    console.log('Executing action:', JSON.stringify(action, null, 2));
    try {
      const result = await executeAction(action, { io, pendingRequests });
      console.log('Action result:', JSON.stringify(result, null, 2));
      results.push({ action: action.type, success: true, result });
    } catch (error) {
      console.error('Action error:', error);
      results.push({ 
        action: action.type, 
        success: false, 
        error: error.message 
      });
      // Continue executing other actions even if one fails
    }
  }

  console.log('Plan execution results:', JSON.stringify(results, null, 2));
  return { results };
}

async function executeAction(action, { io, pendingRequests }) {
  console.log('Executing action type:', action.type);
  switch (action.type) {
    case 'create_task': {
      const { title, description = '' } = action.params || {};
      console.log('Creating task with title:', title);
      if (!title) return requireParams(io, pendingRequests, action, ['title'], 'Provide a task title.');
      const id = uuidv4();
      console.log('Inserting task with ID:', id);
      const { rows } = await query(`INSERT INTO tasks (id, title, description, status) VALUES ($1, $2, $3, 'todo') RETURNING *`, [id, title, description]);
      const task = rows[0];
      console.log('Task created:', task);
      await upsertEmbedding('task', id, `${task.title} ${task.description}`, { status: task.status });
      io.emit('task:created', task);
      return { task };
    }
    case 'create_note': {
      const { text } = action.params || {};
      console.log('Creating note with text:', text);
      if (!text) return requireParams(io, pendingRequests, action, ['text'], 'Provide note content.');
      const id = uuidv4();
      console.log('Inserting note with ID:', id);
      const { rows } = await query(`INSERT INTO notes (id, content) VALUES ($1, $2) RETURNING *`, [id, text]);
      const note = rows[0];
      console.log('Note created:', note);
      await upsertEmbedding('note', id, note.content, {});
      io.emit('note:created', note);
      return { note };
    }
    case 'delete_note': {
      const { id } = action.params || {};
      if (!id) return requireParams(io, pendingRequests, action, ['id'], 'Provide the note id to delete.');
      const { rows } = await query(`DELETE FROM notes WHERE id = $1 RETURNING *`, [id]);
      const note = rows[0];
      await deleteEmbedding('note', id);
      io.emit('note:deleted', note || { id });
      return { ok: true, id };
    }
    case 'delete_all_notes': {
      const { rows } = await query(`SELECT id FROM notes`);
      const ids = rows.map(r => r.id);
      await query(`DELETE FROM notes`);
      for (const id of ids) {
        try { await deleteEmbedding('note', id); } catch {}
        io.emit('note:deleted', { id });
      }
      return { ok: true, count: ids.length };
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
