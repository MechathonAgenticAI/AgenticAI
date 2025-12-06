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

  // delete task(s)
  if (/\b(delete|remove)\b.*\btask(s)?\b/.test(t)) {
    // Destructive bulk delete requires confirmation
    if (/(all|everything|every)\b/.test(t) || !/\b(id|named|titled)\b/.test(t)) {
      plan.actions.push({ type: 'delete_all_tasks', params: {} });
      plan.confirmations.push('Delete ALL tasks?');
    } else {
      plan.actions.push({ type: 'delete_task', params: {} });
    }
    return plan;
  }

  // fallback: return empty plan (will be handled by AI)
  return plan;
}

export async function parseIntent(text, { sessionId } = {}) {
  // Try heuristic parsing first for common patterns (fast)
  let plan = basicHeuristic(text);
  
  // If heuristics didn't find actions, use AI
  if (plan.actions.length === 0) {
    try {
      const aiResult = await parseIntentWithAI(text, { sessionId });
      return AgentPlan.parse(aiResult);
    } catch (error) {
      console.error('AI parsing failed, falling back to empty plan:', error);
      return AgentPlan.parse(plan);
    }
  }

  return AgentPlan.parse(plan);
}
