import { query } from './db.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const UpdateTaskParams = z.object({ id: z.string().uuid().optional(), status: z.string().optional(), title: z.string().optional(), description: z.string().optional(), category: z.string().optional(), query: z.string().optional() });
const BulkTaskParams = z.object({ pattern: z.string(), status: z.string().optional() });

function requireParams(io, pendingRequests, action, missing, message) {
  const id = uuidv4();
  // Create a proper plan object with the single action
  const plan = {
    actions: [action],
    confirmations: [],
    meta: { text: `Missing parameters: ${missing.join(', ')}` }
  };
  const payload = { id, plan, missing, message };
  console.log('=== REQUIRING PARAMS ===');
  console.log('Request ID:', id);
}

export async function executePlan(plan, { io, pendingRequests, pendingConfirmations, skipConfirmation = false, sessionId }) {
  console.log('Executing plan:', JSON.stringify(plan, null, 2));
  
  // Handle confirmations for destructive actions
  if (!skipConfirmation && plan.confirmations?.length > 0) {
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
      const result = await executeAction(action, { io, pendingRequests, sessionId });
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

async function executeAction(action, { io, pendingRequests, sessionId }) {
  console.log('Executing action type:', action.type);
  switch (action.type) {
    case 'create_task': {
      const { title, description = '', category = 'general' } = action.params || {};
      console.log('Creating task with title:', title, 'category:', category);
      if (!title) {
        // Don't use requireParams - let conversational flow handle it
        throw new Error('Task title is required');
      }
      const id = uuidv4();
      console.log('Inserting task with ID:', id);
      const { rows } = await query(`INSERT INTO tasks (id, title, description, category, status) VALUES ($1, $2, $3, $4, 'todo') RETURNING *`, [id, title, description, category]);
      const task = rows[0];
      console.log('Task created:', task);
      
      // Update context with new task
      if (sessionId && io && io.updateContext) {
        io.updateContext(sessionId, task, 'created');
      }
      
      io.emit('task:created', task);
      return { task };
    }
    case 'update_task_status': {
      const { id, status } = action.params || {};
      console.log('Updating task status:', { id, status });
      
      // Don't use requireParams - let conversational flow handle missing params
      if (!id || !status) {
        throw new Error('Task ID and status are required');
      }
      
      // Clean up the status - take only the first word and normalize
      const cleanStatus = status.toString().split('/')[0].trim().toLowerCase();
      const normalizedStatus = (cleanStatus === 'done' || cleanStatus === 'complete' || cleanStatus === 'completed') ? 'done' : 'todo';
      
      console.log('Cleaned status:', normalizedStatus);
      
      // Handle both UUID and numeric IDs
      let taskId = id;
      if (!id.includes('-')) {
        // Numeric ID provided, need to find the actual UUID
        const { rows: taskRows } = await query(`SELECT id FROM tasks ORDER BY created_at LIMIT 1 OFFSET $1`, [parseInt(id) - 1]);
        if (taskRows.length === 0) {
          throw new Error('Task not found with numeric ID: ' + id);
        }
        taskId = taskRows[0].id;
        console.log('Mapped numeric ID', id, 'to UUID:', taskId);
      }
      
      const { rows } = await query(`UPDATE tasks SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`, [normalizedStatus, taskId]);
      const task = rows[0];
      if (!task) throw new Error('Task not found');
      console.log('Task updated:', task);
      io.emit('task:updated', task);
      return { task };
    }
    case 'delete_task': {
      const { id, title } = action.params || {};
      console.log('Deleting task with ID:', id, 'or title:', title);
      
      // Don't use requireParams - let conversational flow handle missing params
      if (!id && !title) {
        throw new Error('Task ID or title is required');
      }
      
      let taskId = id;
      let taskToDelete = null;
      
      if (!id && title) {
        // Find task by title
        const { rows: taskRows } = await query(`SELECT * FROM tasks WHERE title ILIKE $1 LIMIT 1`, [`%${title}%`]);
        if (taskRows.length === 0) {
          throw new Error('Task not found with title: ' + title);
        }
        taskId = taskRows[0].id;
        taskToDelete = taskRows[0];
        console.log('Found task by title', title, 'with ID:', taskId);
      }
      
      // Handle both UUID and numeric IDs
      if (taskId && !taskId.includes('-')) {
        // Numeric ID provided, need to find the actual UUID
        const { rows: taskRows } = await query(`SELECT id FROM tasks ORDER BY created_at LIMIT 1 OFFSET $1`, [parseInt(taskId) - 1]);
        if (taskRows.length === 0) {
          throw new Error('Task not found with numeric ID: ' + taskId);
        }
        taskId = taskRows[0].id;
        console.log('Mapped numeric ID', id, 'to UUID:', taskId);
      }
      
      const { rows } = await query(`DELETE FROM tasks WHERE id = $1 RETURNING *`, [taskId]);
      const task = rows[0];
      if (!task) throw new Error('Task not found');
      console.log('Task deleted:', task);
      
      // Update context with deleted task
      if (sessionId && io && io.updateContext) {
        io.updateContext(sessionId, task, 'deleted');
      }
      
      io.emit('task:deleted', task);
      return { ok: true, deleted: task };
    }
    case 'delete_all_tasks': {
      console.log('Deleting ALL tasks');
      const { rows } = await query(`SELECT id FROM tasks`);
      const ids = rows.map(r => r.id);
      await query(`DELETE FROM tasks`);
      console.log('Deleted tasks:', ids);
      for (const id of ids) {
        io.emit('task:deleted', { id });
      }
      return { ok: true, count: ids.length };
    }
    case 'bulk_delete_tasks': {
      const { pattern } = action.params || {};
      console.log('Bulk deleting tasks with pattern:', pattern);
      if (!pattern) {
        throw new Error('Pattern is required for bulk delete operations');
      }
      
      // Find tasks matching the pattern in title or description
      const { rows: matchingTasks } = await query(
        `SELECT id, title, description FROM tasks WHERE title ILIKE $1 OR description ILIKE $1`,
        [`%${pattern}%`]
      );
      
      if (matchingTasks.length === 0) {
        return { ok: true, count: 0, message: `No tasks found containing '${pattern}'` };
      }
      
      console.log('Found tasks to delete:', matchingTasks.map(t => ({ id: t.id, title: t.title })));
      
      // Delete the matching tasks
      const deletedIds = matchingTasks.map(t => t.id);
      await query(`DELETE FROM tasks WHERE id = ANY($1)`, [deletedIds]);
      
      // Emit deletion events
      for (const task of matchingTasks) {
        io.emit('task:deleted', task);
      }
      
      return { ok: true, deleted: matchingTasks, count: matchingTasks.length, pattern };
    }
    case 'bulk_update_tasks': {
      const { pattern, status } = action.params || {};
      console.log('Bulk updating tasks with pattern:', pattern, 'to status:', status);
      if (!pattern || !status) {
        throw new Error('Pattern and status are required for bulk update operations');
      }
      
      // Normalize status
      const cleanStatus = status.toString().split('/')[0].trim().toLowerCase();
      const normalizedStatus = (cleanStatus === 'done' || cleanStatus === 'complete' || cleanStatus === 'completed') ? 'done' : 'todo';
      
      // Find tasks matching the pattern in title or description
      const { rows: matchingTasks } = await query(
        `SELECT id, title, description FROM tasks WHERE title ILIKE $1 OR description ILIKE $1`,
        [`%${pattern}%`]
      );
      
      if (matchingTasks.length === 0) {
        return { ok: true, count: 0, message: `No tasks found containing '${pattern}'` };
      }
      
      console.log('Found tasks to update:', matchingTasks.map(t => ({ id: t.id, title: t.title })));
      
      // Update the matching tasks
      const updatedIds = matchingTasks.map(t => t.id);
      const { rows: updatedTasks } = await query(
        `UPDATE tasks SET status = $1, updated_at = now() WHERE id = ANY($2) RETURNING *`,
        [normalizedStatus, updatedIds]
      );
      
      // Emit update events
      for (const task of updatedTasks) {
        io.emit('task:updated', task);
      }
      
      return { ok: true, updated: updatedTasks, count: updatedTasks.length, pattern, status: normalizedStatus };
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
