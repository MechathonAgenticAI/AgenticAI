import { CohereClient } from 'cohere-ai';
import { z } from 'zod';

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

const INTENT_PROMPT = `
You are an AI assistant that parses natural language commands into structured JSON actions.

Available action types:
- create_task: Create a new task with title, optional description, and AI-determined category
- update_task_status: Update task status (e.g., mark as done)
- delete_task: Delete a specific task
- delete_all_tasks: Delete all tasks (requires confirmation)
- bulk_delete_tasks: Delete multiple tasks matching a pattern (requires confirmation)
- bulk_update_tasks: Update multiple tasks matching a pattern (requires confirmation)
- create_accountability: Create social pressure consequence for task deadline

Rules:
1. Extract parameters carefully from the text
2. For multi-intent commands, return multiple actions
3. Add confirmations for destructive actions (delete_task, delete_all_tasks, bulk_delete_tasks, bulk_update_tasks)
4. Return valid JSON only
5. If unclear, ask for clarification by returning empty actions
6. For create_task actions, determine appropriate category based on task content
7. For bulk operations, extract the pattern/keyword and action type from the text
8. For ambiguous references like "this task" or "that task", check if context provides a recent task ID
9. For accountability commands, parse the full "if...then..." structure carefully

Context-aware deletion:
- If user says "delete this task" and context shows a recently mentioned task, use that task ID
- If user says "delete task [title]" and no ID provided, search for task by title
- If user says "delete the task I just created", look for the most recently created task
- IMPORTANT: Always provide a specific task ID when context is available, never leave id empty

Response format:
{
  "actions": [
    {
      "type": "action_type",
      "params": {
        "title": "extracted title",
        "description": "extracted description", 
        "category": "AI-determined category",
        "status": "done|todo",
        "pattern": "keyword pattern for bulk operations",
        "id": "specific_id_if_mentioned",
        "taskTitle": "title for accountability",
        "deadline": "ISO datetime string",
        "consequence": "full consequence text",
        "consequenceType": "sms|whatsapp|email",
        "recipient": "person to notify"
      }
    }
  ],
  "confirmations": ["confirmation messages if needed"],
  "meta": {"text": "original user input"}
}

Examples:
Input: "Create a task to buy groceries"
Output: {"actions": [{"type": "create_task", "params": {"title": "buy groceries", "category": "shopping"}}], "confirmations": [], "meta": {"text": "Create a task to buy groceries"}}

Input: "Schedule a meeting with the team"
Output: {"actions": [{"type": "create_task", "params": {"title": "Schedule a meeting with the team", "category": "work"}}], "confirmations": [], "meta": {"text": "Schedule a meeting with the team"}}

Input: "Work out at the gym"
Output: {"actions": [{"type": "create_task", "params": {"title": "Work out at the gym", "category": "health"}}], "confirmations": [], "meta": {"text": "Work out at the gym"}}

Input: "Pay electricity bill"
Output: {"actions": [{"type": "create_task", "params": {"title": "Pay electricity bill", "category": "finance"}}], "confirmations": [], "meta": {"text": "Pay electricity bill"}}

Input: "Call mom for birthday"
Output: {"actions": [{"type": "create_task", "params": {"title": "Call mom for birthday", "category": "personal"}}], "confirmations": [], "meta": {"text": "Call mom for birthday"}}

Input: "Delete this task"
Output: {"actions": [{"type": "delete_task", "params": {"id": "recent_task_id_from_context"}}], "confirmations": ["Delete task 'recent task title'?"], "meta": {"text": "Delete this task"}}

Input: "Delete this task" (when no context available)
Output: {"actions": [{"type": "delete_task", "params": {}}], "confirmations": ["Which task would you like to delete? Please provide the task number or title."], "meta": {"text": "Delete this task"}}

Input: "Delete the task I just created"
Output: {"actions": [{"type": "delete_task", "params": {"id": "most_recent_task_id"}}], "confirmations": ["Delete task 'most recent task title'?"], "meta": {"text": "Delete the task I just created"}}

Input: "Delete task buy groceries"
Output: {"actions": [{"type": "delete_task", "params": {"title": "buy groceries"}}], "confirmations": ["Delete task 'buy groceries'?"], "meta": {"text": "Delete task buy groceries"}}

Input: "If I don't finish the 'Tax Filing' task by 6 PM, text my wife that I'm lazy."
Output: {"actions": [{"type": "create_accountability", "params": {"taskTitle": "Tax Filing", "deadline": "2024-12-07T18:00:00Z", "consequence": "text my wife that I'm lazy", "consequenceType": "sms", "recipient": "wife"}}], "confirmations": ["Set accountability: If 'Tax Filing' isn't done by 6 PM, text your wife?"], "meta": {"text": "If I don't finish the 'Tax Filing' task by 6 PM, text my wife that I'm lazy."}}

Input: "When I don't complete 'Gym Workout' by 7 AM, email my boss that I overslept"
Output: {"actions": [{"type": "create_accountability", "params": {"taskTitle": "Gym Workout", "deadline": "2024-12-07T07:00:00Z", "consequence": "email my boss that I overslept", "consequenceType": "email", "recipient": "boss"}}], "confirmations": ["Set accountability: If 'Gym Workout' isn't done by 7 AM, email your boss?"], "meta": {"text": "When I don't complete 'Gym Workout' by 7 AM, email my boss that I overslept"}}

Input: "If the 'Report' task isn't done by 5 PM, whatsapp my team that I'm behind schedule"
Output: {"actions": [{"type": "create_accountability", "params": {"taskTitle": "Report", "deadline": "2024-12-07T17:00:00Z", "consequence": "whatsapp my team that I'm behind schedule", "consequenceType": "whatsapp", "recipient": "team"}}], "confirmations": ["Set accountability: If 'Report' isn't done by 5 PM, whatsapp your team?"], "meta": {"text": "If the 'Report' task isn't done by 5 PM, whatsapp my team that I'm behind schedule"}}

Input: "Delete all tasks related to vehicle"
Output: {"actions": [{"type": "bulk_delete_tasks", "params": {"pattern": "vehicle"}}], "confirmations": ["Delete all tasks containing 'vehicle'?"], "meta": {"text": "Delete all tasks related to vehicle"}}

Input: "Mark all car-related tasks as done"
Output: {"actions": [{"type": "bulk_update_tasks", "params": {"pattern": "car", "status": "done"}}], "confirmations": ["Mark all tasks containing 'car' as done?"], "meta": {"text": "Mark all car-related tasks as done"}}

Input: "Complete all work tasks"
Output: {"actions": [{"type": "bulk_update_tasks", "params": {"pattern": "work", "status": "done"}}], "confirmations": ["Mark all tasks containing 'work' as done?"], "meta": {"text": "Complete all work tasks"}}

Input: "Remove all shopping tasks"
Output: {"actions": [{"type": "bulk_delete_tasks", "params": {"pattern": "shopping"}}], "confirmations": ["Delete all tasks containing 'shopping'?"], "meta": {"text": "Remove all shopping tasks"}}

Available categories: work, personal, shopping, health, finance, education, home, travel, entertainment, general

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

export async function parseIntentWithAI(text, { sessionId, context } = {}) {
  try {
    console.log('=== AI PARSING START ===');
    console.log('Input text:', text);
    console.log('Session ID:', sessionId);
    console.log('Context:', context);
    
    let contextPrompt = '';
    if (context && context.recentTasks && context.recentTasks.length > 0) {
      contextPrompt = `\n\nRecent task context:\n${context.recentTasks.map((task, index) => 
        `${index + 1}. ID: ${task.id}, Title: "${task.title}", Description: "${task.description || ''}"`
      ).join('\n')}`;
    }
    
    const fullPrompt = `${INTENT_PROMPT}${contextPrompt}\n\nInput: ${text}\n\nOutput:`;
    console.log('Full prompt being sent to Cohere:');
    console.log('---');
    console.log(fullPrompt);
    console.log('---');
    
    // Add timeout for AI call
    const response = await Promise.race([
      cohere.chat({
        model: 'command-nightly',
        message: fullPrompt,
        maxTokens: 500,
        temperature: 0.1,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI request timeout')), 15000)
      )
    ]);

    const aiText = response.text.trim();
    console.log('Raw Cohere response:', aiText);
    console.log('Response length:', aiText.length);
    
    // Extract JSON from the response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }
    
    const result = JSON.parse(jsonMatch[0]);
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
