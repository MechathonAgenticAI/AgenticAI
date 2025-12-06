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
3. Add confirmations for destructive actions (delete_task, delete_all_tasks)
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

Input: "Update the task with id 2 to done"
Output: {"actions": [{"type": "update_task_status", "params": {"id": "2", "status": "done"}}], "confirmations": [], "meta": {"text": "Update the task with id 2 to done"}}

Input: "Update task with id 1 to todo"
Output: {"actions": [{"type": "update_task_status", "params": {"id": "1", "status": "todo"}}], "confirmations": [], "meta": {"text": "Update task with id 1 to todo"}}

Input: "Mark task 2 as undone"
Output: {"actions": [{"type": "update_task_status", "params": {"id": "2", "status": "todo"}}], "confirmations": [], "meta": {"text": "Mark task 2 as undone"}}

Input: "Update task named rishi raju to rishu"
Output: {"actions": [{"type": "update_task_status", "params": {"title": "rishu", "old_title": "rishi raju"}}], "confirmations": [], "meta": {"text": "Update task named rishi raju to rishu"}}

Input: "Delete task with id 1"
Output: {"actions": [{"type": "delete_task", "params": {"id": "1"}}], "confirmations": ["Delete task #1?"], "meta": {"text": "Delete task with id 1"}}

Input: "Delete this task "
Output: {"actions": [{"type": "delete_task", "params": {}}], "confirmations": ["Delete task?"], "meta": {"text": "Delete task"}}
`;

export async function parseIntentWithAI(text, { sessionId } = {}) {
  try {
    console.log('=== AI PARSING START ===');
    console.log('Input text:', text);
    console.log('Session ID:', sessionId);
    
    const fullPrompt = `${INTENT_PROMPT}\n\nInput: ${text}\n\nOutput:`;
    console.log('Full prompt being sent to Cohere:');
    console.log('---');
    console.log(fullPrompt);
    console.log('---');
    
    const response = await cohere.generate({
      model: 'command',
      prompt: fullPrompt,
      maxTokens: 500,
      temperature: 0.1,
      stopSequences: ['\n\n'],
    });

    const aiText = response.generations[0].text.trim();
    console.log('Raw Cohere response:', aiText);
    console.log('Response length:', aiText.length);
    
    const result = JSON.parse(aiText);
    console.log('Parsed AI result:', JSON.stringify(result, null, 2));
    console.log('=== AI PARSING END ===');
    
    // Add session ID to all action params
    if (sessionId) {
      result.actions = result.actions.map(action => ({
        ...action,
        params: { ...action.params, sessionId }
      }));
    }

    return result;
  } catch (error) {
    console.error('=== AI PARSING ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error details:', error);
    console.error('=== END ERROR ===');
    
    // Fallback to empty plan
    return {
      actions: [],
      confirmations: [],
      meta: { text }
    };
  }
}
