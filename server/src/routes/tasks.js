import { Router } from 'express';
import { query } from '../db.js';
import { upsertEmbedding, deleteEmbedding } from '../vector.js';
import { v4 as uuidv4 } from 'uuid';

export default function buildTasksRouter(io) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await query('SELECT * FROM tasks ORDER BY created_at DESC');
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const id = uuidv4();
      const { title, description = '', status = 'todo' } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title_required' });
      const { rows } = await query(
        `INSERT INTO tasks (id, title, description, status) VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, title, description, status]
      );
      const task = rows[0];
      await upsertEmbedding('task', id, `${task.title} ${task.description}`, { status: task.status });
      io.emit('tasks:created', task);
      res.status(201).json(task);
    } catch (e) { next(e); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const fields = ['title', 'description', 'status'];
      const updates = [];
      const values = [];
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          values.push(req.body[f]);
          updates.push(`${f} = $${values.length}`);
        }
      }
      if (!updates.length) return res.status(400).json({ error: 'no_fields' });
      values.push(id);
      const { rows } = await query(`UPDATE tasks SET ${updates.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`, values);
      const task = rows[0];
      if (!task) return res.status(404).json({ error: 'not_found' });
      await upsertEmbedding('task', id, `${task.title} ${task.description}`, { status: task.status });
      io.emit('tasks:updated', task);
      res.json(task);
    } catch (e) { next(e); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { rows } = await query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);
      const task = rows[0];
      await deleteEmbedding('task', id);
      io.emit('tasks:deleted', task || { id });
      res.json({ ok: true, id });
    } catch (e) { next(e); }
  });

  return router;
}
