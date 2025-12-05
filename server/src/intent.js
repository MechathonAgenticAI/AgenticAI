import { z } from 'zod';
import { pipeline } from '@xenova/transformers';

export const IntentSchema = z.object({
  action: z.enum([
    'create_task', 'update_task', 'delete_task', 'list_tasks',
    'create_note', 'update_note', 'delete_note', 'list_notes',
    'search'
  ]),
  params: z.record(z.any()).default({}),
  requires_confirmation: z.boolean().default(false),
  confirmations: z.array(z.string()).default([]),
  steps: z.array(z.any()).default([]),
  meta: z.object({ text: z.string() }).default({ text: '' })
});

function basicHeuristic(text) {
  const t = text.toLowerCase();
  // create task
  if (/\b(create|add|make)\b.*\btask\b/.test(t)) {
    const m = t.match(/task\s+(?:named\s+)?\"?([\w\s-]{3,80})\"?/);
    const title = m?.[1]?.trim();
    return { action: 'create_task', params: { title }, meta: { text } };
  }
  // update task done
  if (/(mark|set|update).*\b(task)\b.*\b(done|complete|completed|finished)\b/.test(t)) {
    return { action: 'update_task', params: { status: 'done' }, meta: { text } };
  }
  // delete task(s)
  if (/\b(delete|remove)\b.*\btask(s)?\b/.test(t)) {
    // safety for bulk delete
    if (/\beverything|all\b/.test(t) || !/\b(id|named|titled)\b/.test(t)) {
      return { action: 'delete_task', params: {}, requires_confirmation: true, confirmations: ['This may delete multiple tasks. Confirm?'], meta: { text } };
    }
    return { action: 'delete_task', params: {}, meta: { text } };
  }
  // list tasks
  if (/\b(list|show)\b.*\btasks\b/.test(t)) {
    return { action: 'list_tasks', params: {}, meta: { text } };
  }
  // notes
  if (/\b(create|add|make)\b.*\bnote\b/.test(t)) {
    const content = text.replace(/.*note\s*/i, '').trim();
    return { action: 'create_note', params: { content }, meta: { text } };
  }
  if (/\b(delete|remove)\b.*\bnote(s)?\b/.test(t)) {
    return { action: 'delete_note', params: {}, requires_confirmation: true, confirmations: ['Confirm note deletion?'], meta: { text } };
  }
  if (/\b(list|show)\b.*\bnotes\b/.test(t)) {
    return { action: 'list_notes', params: {}, meta: { text } };
  }
  // fallback search in memory
  return { action: 'search', params: { query: text }, meta: { text } };
}

let zscPromise;
async function getClassifier() {
  if (!zscPromise) {
    zscPromise = pipeline('zero-shot-classification', 'Xenova/distilbert-base-uncased-mnli');
  }
  return zscPromise;
}

const LABELS = [
  'create_task', 'update_task', 'delete_task', 'list_tasks',
  'create_note', 'update_note', 'delete_note', 'list_notes', 'search'
];

export async function parseIntent(text, { sessionId } = {}) {
  // Multi-step naive split
  const segments = text.split(/\b(?:and then|and|;|\.|\n)\b/i).map(s => s.trim()).filter(Boolean);
  const classifier = await getClassifier().catch(() => null);
  const steps = [];
  for (const seg of segments) {
    let choice = null;
    if (classifier) {
      try {
        const out = await classifier(seg, LABELS, { hypothesis_template: 'This text is about {}.' });
        const label = Array.isArray(out.labels) ? out.labels[0] : out?.labels?.[0];
        if (label && LABELS.includes(label)) choice = label;
      } catch {}
    }
    if (!choice) {
      choice = basicHeuristic(seg).action;
    }
    // param extraction heuristics per segment
    let params = {};
    if (choice === 'create_task') {
      const m = seg.match(/task\s+(?:named\s+)?\"?([\w\s-]{3,80})\"?/i);
      if (m?.[1]) params.title = m[1].trim();
    }
    if (choice === 'update_task' && /done|complete|finished/i.test(seg)) {
      params.status = 'done';
    }
    if (choice === 'create_note') {
      params.content = seg.replace(/.*note\s*/i, '').trim();
    }
    steps.push({ action: choice, params, meta: { text: seg } });
  }

  // Choose primary step as the first
  let first = steps[0] || basicHeuristic(text);
  let intent = IntentSchema.parse({ ...first, steps });
  if (sessionId) intent.params.sessionId = sessionId;
  return intent;
}
