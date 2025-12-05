import { Router } from 'express';
import { query } from '../db.js';
import { upsertEmbedding, deleteEmbedding } from '../vector.js';
import { v4 as uuidv4 } from 'uuid';

export default function buildNotesRouter(io) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await query('SELECT * FROM notes ORDER BY created_at DESC');
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const id = uuidv4();
      const { content } = req.body || {};
      if (!content) return res.status(400).json({ error: 'content_required' });
      const { rows } = await query(`INSERT INTO notes (id, content) VALUES ($1, $2) RETURNING *`, [id, content]);
      const note = rows[0];
      await upsertEmbedding('note', id, note.content, {});
      io.emit('notes:created', note);
      res.status(201).json(note);
    } catch (e) { next(e); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { content } = req.body || {};
      if (content === undefined) return res.status(400).json({ error: 'no_fields' });
      const { rows } = await query(`UPDATE notes SET content = $1, updated_at = now() WHERE id = $2 RETURNING *`, [content, id]);
      const note = rows[0];
      if (!note) return res.status(404).json({ error: 'not_found' });
      await upsertEmbedding('note', id, note.content, {});
      io.emit('notes:updated', note);
      res.json(note);
    } catch (e) { next(e); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { rows } = await query('DELETE FROM notes WHERE id = $1 RETURNING *', [id]);
      const note = rows[0];
      await deleteEmbedding('note', id);
      io.emit('notes:deleted', note || { id });
      res.json({ ok: true, id });
    } catch (e) { next(e); }
  });

  return router;
}
