 import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as IOServer } from 'socket.io';
import tasksRouterFactory from './routes/tasks.js';
import notesRouterFactory from './routes/notes.js';
import { parseIntent } from './intent.js';
import { executeIntent } from './actions.js';
 import { v4 as uuidv4 } from 'uuid';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: CLIENT_ORIGIN }
});

// In-memory stores for confirmations and parameter requests
const pendingConfirmations = new Map(); // id -> { intent }
const pendingRequests = new Map(); // id -> { intent, missing }

io.on('connection', (socket) => {
  socket.emit('hello', { ok: true });
});

// Routers
app.use('/api/tasks', tasksRouterFactory(io));
app.use('/api/notes', notesRouterFactory(io));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Agent endpoints
app.post('/agent/parse', async (req, res, next) => {
  try {
    const { text, sessionId } = req.body || {};
    const intent = await parseIntent(String(text || ''), { sessionId });
    io.emit('agent:intent', intent);
    res.json(intent);
  } catch (e) { next(e); }
});

app.post('/agent/act', async (req, res, next) => {
  try {
    const { intent } = req.body || {};
    if (!intent) return res.status(400).json({ error: 'intent required' });
    if (intent.requires_confirmation) {
      const id = uuidv4();
      pendingConfirmations.set(id, { intent });
      const payload = { id, intent, message: intent.confirmations?.[0] || 'Are you sure?' };
      io.emit('agent:confirmation', payload);
      return res.status(202).json({ pending_confirmation: payload });
    }
    const result = await executeIntent(intent, { io, pendingRequests });
    res.json({ intent, result });
  } catch (e) { next(e); }
});

app.post('/agent/command', async (req, res, next) => {
  try {
    const { text, sessionId } = req.body || {};
    const intent = await parseIntent(String(text || ''), { sessionId });
    io.emit('agent:intent', intent);
    if (intent.requires_confirmation) {
      const id = uuidv4();
      pendingConfirmations.set(id, { intent });
      const payload = { id, intent, message: intent.confirmations?.[0] || 'Are you sure?' };
      io.emit('agent:confirmation', payload);
      return res.status(202).json({ pending_confirmation: payload, intent });
    }
    const result = await executeIntent(intent, { io, pendingRequests });
    res.json({ intent, result });
  } catch (e) { next(e); }
});

app.post('/agent/confirm', async (req, res, next) => {
  try {
    const { id, confirm, cancel } = req.body || {};
    const pending = pendingConfirmations.get(id);
    if (!pending) return res.status(404).json({ error: 'not_found' });
    pendingConfirmations.delete(id);
    if (cancel === true || confirm === false) {
      io.emit('agent:confirmation:cancelled', { id });
      return res.json({ ok: true, cancelled: true });
    }
    const result = await executeIntent(pending.intent, { io, pendingRequests });
    io.emit('agent:confirmation:applied', { id, intent: pending.intent, result });
    res.json({ ok: true, intent: pending.intent, result });
  } catch (e) { next(e); }
});

app.post('/agent/continue', async (req, res, next) => {
  try {
    const { id, params } = req.body || {};
    const pending = pendingRequests.get(id);
    if (!pending) return res.status(404).json({ error: 'not_found' });
    pendingRequests.delete(id);
    const intent = { ...pending.intent, params: { ...(pending.intent.params || {}), ...(params || {}) } };
    const result = await executeIntent(intent, { io, pendingRequests });
    res.json({ ok: true, intent, result });
  } catch (e) { next(e); }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error', details: String(err?.message || err) });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
