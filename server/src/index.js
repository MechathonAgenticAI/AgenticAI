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
const conversationStates = new Map(); // New: Track conversation states per session
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
    
    // Check if there's an active conversation state
    const conversationState = conversationStates.get(sessionId);
    if (conversationState) {
      console.log('Found conversation state:', conversationState);
      
      // Handle different conversation states
      if (conversationState.type === 'awaiting_task_id') {
        // User provided a task ID, complete the action
        const taskId = text.trim();
        const updatedPlan = {
          ...conversationState.plan,
          actions: conversationState.plan.actions.map(action => ({
            ...action,
            params: { ...action.params, id: taskId }
          }))
        };
        
        // Clear the conversation state
        conversationStates.delete(sessionId);
        
        // Execute the completed plan
        io.emit('agent:status', { sessionId, state: 'executing' });
        const result = await executePlan(updatedPlan, { io, pendingRequests, pendingConfirmations });
        io.emit('agent:status', { sessionId, state: 'done' });
        
        return res.json({ plan: updatedPlan, result });
      } else if (conversationState.type === 'awaiting_confirmation') {
        // User provided confirmation response
        const response = text.trim().toLowerCase();
        
        if (response === 'yes' || response === 'y' || response === 'confirm') {
          // User confirmed - execute the plan
          const plan = conversationState.plan;
          conversationStates.delete(sessionId);
          
          io.emit('agent:status', { sessionId, state: 'executing' });
          const result = await executePlan(plan, { io, pendingRequests, pendingConfirmations });
          io.emit('agent:status', { sessionId, state: 'done' });
          
          return res.json({ plan, result });
        } else if (response === 'no' || response === 'n' || response === 'cancel') {
          // User cancelled
          conversationStates.delete(sessionId);
          
          io.emit('agent:message', { 
            sessionId, 
            message: "Action cancelled.",
            type: 'cancelled'
          });
          
          return res.json({ cancelled: true, message: "Action cancelled" });
        } else {
          // Invalid response - ask again
          io.emit('agent:message', { 
            sessionId, 
            message: "Please type 'yes' to confirm or 'no' to cancel.",
            type: 'asking_confirmation'
          });
          
          return res.json({ 
            awaiting_input: true,
            type: 'confirmation',
            message: "Invalid response. Please type 'yes' or 'no'."
          });
        }
      }
    }
    
    // status: received
    io.emit('agent:status', { sessionId, state: 'received' });
    
    const plan = await parseIntent(text, { sessionId });
    io.emit('agent:intent', plan);
    
    // Check if plan needs task ID (for conversational flow)
    const needsTaskId = plan.actions.some(action => 
      (action.type === 'update_task_status' || action.type === 'delete_task') && 
      !action.params.id
    );
    
    if (needsTaskId) {
      // Set conversation state and ask for task ID
      conversationStates.set(sessionId, {
        type: 'awaiting_task_id',
        plan: plan
      });
      
      // Determine the correct message based on the action type
      const actionType = plan.actions.find(action => 
        (action.type === 'update_task_status' || action.type === 'delete_task')
      )?.type;
      
      let message = "Which task would you like to update? Please tell me the task number (e.g., '1', '2', etc.)";
      if (actionType === 'delete_task') {
        message = "Which task would you like to delete? Please tell me the task number (e.g., '1', '2', etc.)";
      }
      
      io.emit('agent:message', { 
        sessionId, 
        message: message,
        type: 'asking_task_id'
      });
      
      return res.json({ 
        awaiting_input: true,
        type: 'task_id',
        message: message
      });
    }
    
    // Check if plan needs confirmation (for conversational flow)
    if (plan.confirmations?.length > 0) {
      // Set conversation state and ask for confirmation
      conversationStates.set(sessionId, {
        type: 'awaiting_confirmation',
        plan: plan
      });
      
      io.emit('agent:message', { 
        sessionId, 
        message: plan.confirmations[0] + " (Type 'yes' to confirm or 'no' to cancel)",
        type: 'asking_confirmation'
      });
      
      return res.json({ 
        awaiting_input: true,
        type: 'confirmation',
        message: plan.confirmations[0]
      });
    }
    
    const result = await executePlan(plan, { io, pendingRequests, pendingConfirmations });
    
    io.emit('agent:status', { sessionId, state: 'done' });
    res.json({ plan, result });
  } catch (e) { next(e); }
});

app.post('/api/agent/confirm', async (req, res, next) => {
  try {
    console.log('=== CONFIRM ENDPOINT ===');
    const { sessionId, confirmationToken, cancel } = req.body || {};
    console.log('Confirm request:', { sessionId, confirmationToken, cancel });
    console.log('Current pending confirmations:', Array.from(pendingConfirmations.keys()));
    
    const pending = pendingConfirmations.get(confirmationToken);
    console.log('Found pending confirmation:', pending);
    if (!pending) {
      console.log('Confirmation not found for token:', confirmationToken);
      return res.status(404).json({ error: 'not_found' });
    }
    pendingConfirmations.delete(confirmationToken);
    console.log('Deleted confirmation. Remaining:', Array.from(pendingConfirmations.keys()));
    
    if (cancel === true) {
      console.log('Confirmation cancelled');
      io.emit('agent:needs_confirmation:cancelled', { confirmationToken });
      return res.json({ ok: true, cancelled: true });
    }
    
    console.log('Executing confirmed plan:', JSON.stringify(pending.plan, null, 2));
    io.emit('agent:status', { sessionId, state: 'executing' });
    const result = await executePlan(pending.plan, { io, pendingRequests, pendingConfirmations });
    console.log('Confirmation execution result:', JSON.stringify(result, null, 2));
    io.emit('agent:status', { sessionId, state: 'done' });
    io.emit('agent:needs_confirmation:applied', { confirmationToken, plan: pending.plan, result });
    res.json({ ok: true, plan: pending.plan, result });
  } catch (e) { 
    console.error('Confirm endpoint error:', e);
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
