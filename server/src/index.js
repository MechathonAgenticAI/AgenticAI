 import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as IOServer } from 'socket.io';
import tasksRouterFactory from './routes/tasks.js';
import { parseIntent } from './intent.js';
import { executePlan } from './actions.js';
import { v4 as uuidv4 } from 'uuid';
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
    console.log('=== CONFIRM REQUEST ===');
    console.log('Session ID:', sessionId);
    console.log('Confirmation token:', confirmationToken);
    console.log('Cancel?', cancel);

    const pending = pendingConfirmations.get(confirmationToken);
    if (!pending) {
      console.warn('Confirmation token not found:', confirmationToken);
      return res.status(404).json({ success: false, error: 'not_found' });
    }

    // Remove confirmation entry so it cannot be reused
    pendingConfirmations.delete(confirmationToken);

    if (cancel === true) {
      io.emit('agent:needs_confirmation:cancelled', { confirmationToken });
      return res.json({ ok: true, cancelled: true });
    }

    try {
      io.emit('agent:status', { sessionId, state: 'executing' });
      const result = await executePlan(pending.plan, { io, pendingRequests, pendingConfirmations, skipConfirmation: true });
      io.emit('agent:status', { sessionId, state: 'done' });
      io.emit('agent:needs_confirmation:applied', { confirmationToken, plan: pending.plan, result });
      return res.json({ ok: true, plan: pending.plan, result });
    } catch (error) {
      console.error('Error executing confirmed plan:', error);
      io.emit('agent:error', { sessionId, message: 'Execution failed', error: error.message });
      return res.status(500).json({ success: false, error: 'execution_failed', message: error.message });
    }
  } catch (e) {
    console.error('Unexpected error in confirm handler:', e);
    next(e);
  }
});

app.post('/api/agent/continue', async (req, res, next) => {
  try {
    console.log('=== CONTINUE ENDPOINT ===');
    console.log('Current pending requests before:', Array.from(pendingRequests.keys()));
    
    const { sessionId, id, params } = req.body || {};
    console.log('Continue request:', { sessionId, id, params });
    
    const pending = pendingRequests.get(id);
    console.log('Found pending request:', pending);
    if (!pending) {
      console.log('Pending request not found for ID:', id);
      return res.status(404).json({ error: 'not_found' });
    }
    
    // Update the plan with the missing parameters
    const updatedPlan = { ...pending.plan };
    updatedPlan.actions = updatedPlan.actions.map(action => ({
      ...action,
      params: { ...action.params, ...params }
    }));
    
    console.log('Updated plan:', JSON.stringify(updatedPlan, null, 2));
    
    const result = await executePlan(updatedPlan, { io, pendingRequests, pendingConfirmations });
    console.log('Execution result:', JSON.stringify(result, null, 2));
    
    // Only delete after successful execution
    pendingRequests.delete(id);
    console.log('Deleted pending request. Remaining requests:', Array.from(pendingRequests.keys()));
    
    res.json({ ok: true, plan: updatedPlan, result });
  } catch (e) { 
    console.error('Continue endpoint error:', e);
    next(e); 
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error', details: String(err?.message || err) });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
