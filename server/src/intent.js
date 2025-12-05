import { z } from 'zod';
import { pipeline } from '@xenova/transformers';

export const AgentActionType = z.enum([
  'create_task', 'update_task_status', 'delete_task', 'delete_all_tasks',
  'create_note', 'delete_note', 'delete_all_notes'
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

  // notes
  if (/\b(create|add|make)\b.*\bnote\b/.test(t)) {
    const content = text.replace(/.*note\s*/i, '').trim();
    plan.actions.push({ type: 'create_note', params: { text: content } });
    return plan;
  }

  if (/\b(delete|remove)\b.*\bnote(s)?\b/.test(t)) {
    if (/(all|everything|every)\b/.test(t)) {
      plan.actions.push({ type: 'delete_all_notes', params: {} });
      plan.confirmations.push('Delete ALL notes?');
    } else {
      plan.actions.push({ type: 'delete_note', params: {} });
    }
    return plan;
  }

  // fallback: return empty plan (will be handled by LLM)
  return plan;
}

let zscPromise;
async function getClassifier() {
  if (!zscPromise) {
    zscPromise = pipeline('zero-shot-classification', 'Xenova/distilbert-base-uncased-mnli');
  }
  return zscPromise;
}

const ACTION_TYPES = [
  'create_task', 'update_task_status', 'delete_task', 'delete_all_tasks',
  'create_note', 'delete_note', 'delete_all_notes'
];

export async function parseIntent(text, { sessionId } = {}) {
  // First try heuristic parsing
  let plan = basicHeuristic(text);
  
  // If heuristics didn't find actions, try LLM
  if (plan.actions.length === 0) {
    const classifier = await getClassifier().catch(() => null);
    if (classifier) {
      try {
        const out = await classifier(text, ACTION_TYPES, { hypothesis_template: 'This text is about {}.' });
        const topAction = Array.isArray(out.labels) ? out.labels[0] : out?.labels?.[0];
        
        if (topAction && ACTION_TYPES.includes(topAction)) {
          let params = {};
          if (topAction === 'create_task') {
            const m = text.match(/task\s+(?:named\s+)?\"?([\w\s-]{3,80})\"?/i);
            if (m?.[1]) params.title = m[1].trim();
          }
          if (topAction === 'create_note') {
            params.text = text.replace(/.*note\s*/i, '').trim();
          }
          if (topAction === 'update_task_status' && /done|complete|finished/i.test(text)) {
            params.status = 'done';
          }
          
          plan.actions.push({ type: topAction, params });
          
          // Add confirmation for destructive actions
          if (topAction === 'delete_all_tasks') {
            plan.confirmations.push('Delete ALL tasks?');
          } else if (topAction === 'delete_all_notes') {
            plan.confirmations.push('Delete ALL notes?');
          }
        }
      } catch (err) {
        console.error('LLM classification error:', err);
      }
    }
  }

  // Add session ID to all action params
  if (sessionId) {
    plan.actions = plan.actions.map(action => ({
      ...action,
      params: { ...action.params, sessionId }
    }));
  }

  return AgentPlan.parse(plan);
}
