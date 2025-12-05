 import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as IOServer } from 'socket.io';
import tasksRouterFactory from './routes/tasks.js';
import notesRouterFactory from './routes/notes.js';
import { parseIntent } from './intent.js';
import { executePlan } from './actions.js';
import { v4 as uuidv4 } from 'uuid';
import { embedText } from './vector.js';
import { query } from './db.js';

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
app.post('/api/agent/parse', async (req, res, next) => {
  try {
    const { text, sessionId } = req.body || {};
    const plan = await parseIntent(String(text || ''), { sessionId });
    io.emit('agent:intent', plan);
    res.json(plan);
  } catch (e) { next(e); }
});

app.post('/api/agent/act', async (req, res, next) => {
  try {
    const { plan } = req.body || {};
    if (!plan) return res.status(400).json({ error: 'plan required' });
    
    const result = await executePlan(plan, { io, pendingRequests, pendingConfirmations });
    
    if (result.requires_confirmation) {
      return res.status(202).json({ pending_confirmation: { confirmation_id: result.confirmation_id }, plan });
    }
    
    res.json({ plan, result });
  } catch (e) { next(e); }
});

app.post('/api/agent/command', async (req, res, next) => {
  try {
    const { sessionId, command } = req.body || {};
    const text = String(command || '');
    
    // status: received
    io.emit('agent:status', { sessionId, state: 'received' });
    
    // ensure session row exists
    if (sessionId) {
      try { await query(`INSERT INTO sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [sessionId]); } catch {}
    }
    
    // log command with embedding
    try {
      const vec = await embedText(text);
      const vectorStr = '[' + vec.join(',') + ']';
      await query(`INSERT INTO command_log (id, session_id, raw_command, embedding) VALUES ($1, $2, $3, $4::vector)`, [uuidv4(), sessionId || null, text, vectorStr]);
    } catch {}
    
    const plan = await parseIntent(text, { sessionId });
    io.emit('agent:intent', plan);
    
    const result = await executePlan(plan, { io, pendingRequests, pendingConfirmations });
    
    if (result.requires_confirmation) {
      io.emit('agent:status', { sessionId, state: 'awaiting_confirmation' });
      return res.status(202).json({ pending_confirmation: { confirmation_id: result.confirmation_id }, plan });
    }
    
    io.emit('agent:status', { sessionId, state: 'done' });
    res.json({ plan, result });
  } catch (e) { next(e); }
});

app.post('/api/agent/confirm', async (req, res, next) => {
  try {
    const { sessionId, confirmationToken, cancel } = req.body || {};
    const pending = pendingConfirmations.get(confirmationToken);
    if (!pending) return res.status(404).json({ error: 'not_found' });
    pendingConfirmations.delete(confirmationToken);
    
    if (cancel === true) {
      io.emit('agent:needs_confirmation:cancelled', { confirmationToken });
      return res.json({ ok: true, cancelled: true });
    }
    
    io.emit('agent:status', { sessionId, state: 'executing' });
    const result = await executePlan(pending.plan, { io, pendingRequests, pendingConfirmations });
    io.emit('agent:status', { sessionId, state: 'done' });
    io.emit('agent:needs_confirmation:applied', { confirmationToken, plan: pending.plan, result });
    res.json({ ok: true, plan: pending.plan, result });
  } catch (e) { next(e); }
});

app.post('/api/agent/continue', async (req, res, next) => {
  try {
    const { sessionId, id, params } = req.body || {};
    const pending = pendingRequests.get(id);
    if (!pending) return res.status(404).json({ error: 'not_found' });
    pendingRequests.delete(id);
    
    // Update the plan with the missing parameters
    const updatedPlan = { ...pending.plan };
    updatedPlan.actions = updatedPlan.actions.map(action => ({
      ...action,
      params: { ...action.params, ...params }
    }));
    
    const result = await executePlan(updatedPlan, { io, pendingRequests, pendingConfirmations });
    res.json({ ok: true, plan: updatedPlan, result });
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
