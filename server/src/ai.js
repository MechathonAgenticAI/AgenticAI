import { CohereClient } from 'cohere-ai';
import { z } from 'zod';

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

const INTENT_PROMPT = `
You are an AI assistant that parses natural language commands into structured JSON actions.

Available action types:
- create_task: Create a new task with title and optional description
- update_task_status: Update task status (e.g., mark as done)
- delete_task: Delete a specific task
- delete_all_tasks: Delete all tasks (requires confirmation)

Rules:
1. Extract parameters carefully from the text
2. For multi-intent commands, return multiple actions
3. Add confirmations for destructive actions (delete_all_tasks)
4. Return valid JSON only
5. If unclear, ask for clarification by returning empty actions

Response format:
{
  "actions": [
    {
      "type": "action_type",
      "params": {
        "title": "extracted title",
        "description": "extracted description", 
        "status": "done|todo",
        "id": "specific_id_if_mentioned"
      }
    }
  ],
  "confirmations": ["confirmation messages if needed"],
  "meta": {"text": "original user input"}
}

Examples:
Input: "Create a task to buy groceries"
Output: {"actions": [{"type": "create_task", "params": {"title": "buy groceries"}}], "confirmations": [], "meta": {"text": "Create a task to buy groceries"}}

Input: "Mark my task as done"  
Output: {"actions": [{"type": "update_task_status", "params": {"status": "done"}}], "confirmations": [], "meta": {"text": "Mark my task as done"}}

Input: "Delete all tasks"
Output: {"actions": [{"type": "delete_all_tasks", "params": {}}], "confirmations": ["Delete ALL tasks?"], "meta": {"text": "Delete all tasks"}}
`;

export async function parseIntentWithAI(text, { sessionId } = {}) {
  try {
    const response = await cohere.generate({
      model: 'command',
      prompt: `${INTENT_PROMPT}\n\nInput: ${text}\n\nOutput:`,
      maxTokens: 500,
      temperature: 0.1,
      stopSequences: ['\n\n'],
    });

    const result = JSON.parse(response.generations[0].text.trim());
    
    // Add session ID to all action params
    if (sessionId) {
      result.actions = result.actions.map(action => ({
        ...action,
        params: { ...action.params, sessionId }
      }));
    }

    return result;
  } catch (error) {
    console.error('AI parsing error:', error);
    // Fallback to empty plan
    return {
      actions: [],
      confirmations: [],
      meta: { text }
    };
  }
}
