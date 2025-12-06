import { z } from 'zod';
import { parseIntentWithAI } from './ai.js';

export const AgentActionType = z.enum([
  'create_task', 'update_task_status', 'delete_task', 'delete_all_tasks'
]);

export const AgentAction = z.object({
  type: AgentActionType,
  params: z.record(z.any()).default({})
});

export const AgentPlan = z.object({
  actions: z.array(AgentAction).default([]),
  confirmations: z.array(z.string()).default([]),
  meta: z.object({ text: z.string() }).default({ text: '' })
});

function basicHeuristic(text) {
  const t = text.toLowerCase();
  const plan = { actions: [], confirmations: [], meta: { text } };

  // Handle multi-intent patterns like "add task paint house and also add note to wake up early"
  const multiIntentMatch = t.match(/(?:add|create)\s+(task|note)\s+(.+?)\s+(?:and\s+(?:also\s+)?(?:add|create)\s+)?(task|note)\s+(.+)/i);
  if (multiIntentMatch) {
    const [_, firstType, firstText, secondType, secondText] = multiIntentMatch;
    
    // First action
    if (firstType === 'task') {
      plan.actions.push({ type: 'create_task', params: { title: firstText.trim() } });
    } else {
      plan.actions.push({ type: 'create_note', params: { text: firstText.trim() } });
    }
    
    // Second action
    if (secondType === 'task') {
      plan.actions.push({ type: 'create_task', params: { title: secondText.trim() } });
    } else {
      plan.actions.push({ type: 'create_note', params: { text: secondText.trim() } });
    }
    
    return plan;
  }

  // Single intent patterns
  // create task
  if (/\b(create|add|make)\b.*\btask\b/.test(t)) {
    const m = t.match(/task\s+(?:named\s+)?\"?([\w\s-]{3,80})\"?/);
    const title = m?.[1]?.trim();
    if (title) {
      plan.actions.push({ type: 'create_task', params: { title } });
    }
    return plan;
  }

  // update task done
  if (/(mark|set|update).*\b(task)\b.*\b(done|complete|completed|finished)\b/.test(t)) {
    plan.actions.push({ type: 'update_task_status', params: { status: 'done' } });
    return plan;
  }

  // update task undone/todo
  if (/(mark|set|update|reopen|reactivate).*\b(task)\b.*\b(todo|undone|not done|incomplete|pending|open)\b/.test(t)) {
    plan.actions.push({ type: 'update_task_status', params: { status: 'todo' } });
    return plan;
  }

  // update task by id or name
  if (/\b(update|change|modify)\b.*\b(task)\b/.test(t)) {
    const idMatch = t.match(/(?:task|with)\s+(?:id\s+)?(\d+)/i);
    const statusMatch = t.match(/(?:to|as)\s+(done|todo|complete|completed|finished|undone|not done|incomplete)/i);
    const titleMatch = t.match(/(?:named|titled|called)\s+"?([^"]+)"?\s+(?:to|as)\s+"?([^"]+)"?/i);
    
    if (idMatch && statusMatch) {
      // Normalize status values
      let normalizedStatus = statusMatch[1].toLowerCase();
      if (normalizedStatus === 'done' || normalizedStatus === 'complete' || normalizedStatus === 'completed' || normalizedStatus === 'finished') {
        normalizedStatus = 'done';
      } else if (normalizedStatus === 'todo' || normalizedStatus === 'undone' || normalizedStatus === 'not done' || normalizedStatus === 'incomplete') {
        normalizedStatus = 'todo';
      }
      plan.actions.push({ type: 'update_task_status', params: { id: idMatch[1], status: normalizedStatus } });
    } else if (idMatch) {
      // Only ID provided - ask for status
      plan.actions.push({ type: 'update_task_status', params: { id: idMatch[1] } });
    } else if (statusMatch) {
      // Only status provided - update all tasks
      let normalizedStatus = statusMatch[1].toLowerCase();
      if (normalizedStatus === 'done' || normalizedStatus === 'complete' || normalizedStatus === 'completed' || normalizedStatus === 'finished') {
        normalizedStatus = 'done';
      } else if (normalizedStatus === 'todo' || normalizedStatus === 'undone' || normalizedStatus === 'not done' || normalizedStatus === 'incomplete') {
        normalizedStatus = 'todo';
      }
      plan.actions.push({ type: 'update_task_status', params: { status: normalizedStatus } });
    }
    return plan;
  }

  // delete task(s)
  if (/\b(delete|remove)\b.*\btask(s)?\b/.test(t)) {
    const idMatch = t.match(/(?:task|with)\s+(?:id\s+)?(\d+)/i);
    
    // Destructive bulk delete requires confirmation
    if (/(all|everything|every)\b/.test(t)) {
      plan.actions.push({ type: 'delete_all_tasks', params: {} });
      plan.confirmations.push('Delete ALL tasks?');
    } else if (idMatch) {
      // Specific task deletion with ID - requires confirmation
      plan.actions.push({ type: 'delete_task', params: { id: idMatch[1] } });
      plan.confirmations.push(`Delete task #${idMatch[1]}?`);
    } else {
      // Generic delete task - ask for ID first, then will require confirmation
      plan.actions.push({ type: 'delete_task', params: {} });
    }
    return plan;
  }

  // fallback: return empty plan (will be handled by AI)
  return plan;
}

export async function parseIntent(text, { sessionId } = {}) {
  console.log('=== PARSING INTENT ===');
  console.log('Input text:', text);
  console.log('Session ID:', sessionId);
  
  // Skip heuristic parsing - use AI only
  // let plan = basicHeuristic(text);
  // console.log('Heuristic result:', JSON.stringify(plan, null, 2));
  
  // Always use AI parsing
  console.log('Using AI parsing...');
  try {
    const aiResult = await parseIntentWithAI(text, { sessionId });
    console.log('AI result:', JSON.stringify(aiResult, null, 2));
    return AgentPlan.parse(aiResult);
  } catch (error) {
    console.error('AI parsing failed, falling back to empty plan:', error);
    return AgentPlan.parse({ actions: [], confirmations: [], meta: { text } });
  }
}
