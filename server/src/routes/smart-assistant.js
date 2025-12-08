import express from 'express';
import { query } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { createTaskReminders, getGoogleAuth } from '../google-integration.js';
import { google } from 'googleapis';
import { cohere } from '../ai.js';

const router = express.Router();

// Smart command processor
router.post('/process-command', async (req, res) => {
  try {
    const { command, sessionId } = req.body;
    
    console.log('=== SMART COMMAND PROCESSING ===');
    console.log('Command:', command);
    console.log('Session:', sessionId);
    console.log('Request body:', req.body);

    if (!sessionId) {
      console.log('ERROR: No session ID provided');
      return res.status(400).json({ error: 'Session ID required' });
    }

    const result = await processSmartCommand(command, sessionId);
    console.log('Command result:', result);
    
    res.json({
      success: true,
      result,
      message: result.message
    });

  } catch (error) {
    console.error('Smart command error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to process command', details: error.message });
  }
});

async function processSmartCommand(command, sessionId) {
  console.log('=== AI COMMAND ANALYSIS START ===');
  console.log('Command:', command);
  console.log('Session:', sessionId);
  
  const lowerCommand = command.toLowerCase();
  
  console.log('=== STARTING AI ANALYSIS ===');
  
  // Try AI analysis first
  try {
    console.log('About to call analyzeCommandWithAI...');
    const aiAnalysis = await analyzeCommandWithAI(command, sessionId);
    console.log('AI Analysis:', aiAnalysis);
    
    // If AI needs more information, return a prompt for user
    if (aiAnalysis.needsMoreInfo) {
      return {
        type: 'needs_info',
        message: aiAnalysis.prompt,
        missingParameters: aiAnalysis.missingParameters,
        examples: aiAnalysis.examples
      };
    }
    
    // Execute the action based on AI analysis
    return await executeAICommand(aiAnalysis, sessionId, command);
    
  } catch (error) {
    console.log('AI analysis failed, falling back to pattern matching');
    console.log('AI Error:', error.message);
    // Fallback to existing pattern matching
    return await processLegacyCommand(lowerCommand, sessionId);
  }
}

async function analyzeCommandWithAI(command, sessionId) {
  console.log('=== STARTING AI ANALYSIS ===');
  console.log('Command to analyze:', command);
  console.log('Cohere client available:', !!cohere);
  console.log('Cohere API key:', process.env.COHERE_API_KEY ? 'Set' : 'Not set');
  
  // Quick test of Cohere connection
  try {
    console.log('Testing Cohere connection...');
    const testResponse = await cohere.chat({
      model: 'command-r-plus-08-2024',
      message: 'Respond with just "OK"',
      maxTokens: 10,
      temperature: 0.1,
    });
    console.log('Cohere test response:', testResponse.message);
  } catch (testError) {
    console.error('Cohere connection test failed:', testError);
    throw new Error('Cohere AI not available: ' + testError.message);
  }
  
  const prompt = `
You are an AI assistant that analyzes user commands for calendar and task management. 

Analyze this command: "${command}"

Respond with a JSON object containing:
{
  "action": "create_reminder|delete_reminders|shift_tasks|update_reminders|list_events|unknown",
  "target": "reminders|tasks|events|all",
  "parameters": {
    "title": "extracted title if creating",
    "time": "extracted time like '5pm', '2:30pm'",
    "date": "extracted date like 'today', 'tomorrow', 'Thursday'",
    "dateRange": "if mentioned like 'this week', 'next week'",
    "timeRange": {"start": "1pm", "end": "3pm"} if mentioned,
    "shiftAmount": number if shifting,
    "shiftUnit": "days|weeks" if shifting,
    "taskType": "study|work|exercise|meeting" if specified,
    "newTime": "updated time like '9am'" if updating,
    "count": number if creating multiple
  },
  "needsMoreInfo": true|false,
  "missingParameters": ["parameter1", "parameter2"],
  "prompt": "What specific information do you need from the user?",
  "examples": ["example command 1", "example command 2"]
}

Important:
- If command is unclear, set needsMoreInfo: true and explain what's needed
- For time ranges, extract both start and end times
- For shifting, detect both amount and unit (days/weeks)
- For multiple items, extract the count
- Be specific about what information is missing
- Provide clear example commands if asking for more info

Respond ONLY with valid JSON, no explanations.
`;

  try {
    console.log('Calling Cohere AI...');
    const response = await cohere.chat({
      model: 'command-r-plus-08-2024',
      message: prompt,
      maxTokens: 1000,
      temperature: 0.1,
    });

    const aiResponse = response.message;
    console.log('Raw AI Response:', aiResponse);
    
    // Extract JSON from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('No JSON found in AI response');
      throw new Error('AI did not return valid JSON');
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    console.log('Parsed AI Analysis:', analysis);
    return analysis;
    
  } catch (error) {
    console.error('AI analysis failed:', error);
    console.error('Error details:', error.message);
    throw error; // Let it fall back to pattern matching
  }
}

async function executeAICommand(analysis, sessionId, originalCommand) {
  const { action, parameters, filters, target } = analysis;
  
  switch (action) {
    case 'create_reminder':
      return await createAIReminder(parameters, sessionId, originalCommand);
      
    case 'delete_reminders':
      return await deleteRemindersByFilters(sessionId, filters, parameters);
      
    case 'shift_tasks':
      return await shiftTasksByFilters(sessionId, filters, parameters);
      
    case 'update_reminders':
      return await updateRemindersByFilters(sessionId, filters, parameters);
      
    case 'list_events':
      return await listEventsByFilters(sessionId, filters, parameters);
      
    default:
      return {
        type: 'unknown',
        message: 'I didn\'t understand that command. Try: "Create reminder to call mom at 5pm", "Delete all reminders for Thursday", or "Shift my study tasks to Sunday"'
      };
  }
}

async function createAIReminder(parameters, sessionId, originalCommand) {
  console.log('=== CREATING AI REMINDER ===');
  console.log('Parameters:', parameters);
  
  const { title, time, date, count } = parameters;
  
  if (!title) {
    return {
      type: 'needs_info',
      message: 'What would you like to be reminded about?',
      missingParameters: ['title'],
      examples: [
        "Create reminder to call mom at 5pm",
        "Remind me to study math at 3pm tomorrow",
        "Create 5 random reminders this week"
      ]
    };
  }
  
  const reminderCount = count || 1;
  const results = [];
  
  for (let i = 0; i < reminderCount; i++) {
    const reminderId = uuidv4();
    const reminderDate = date === 'today' ? new Date().toISOString().split('T')[0] : 
                        date === 'tomorrow' ? new Date(Date.now() + 86400000).toISOString().split('T')[0] :
                        date || new Date().toISOString().split('T')[0];
    
    // Generate random time if creating multiple and no specific time given
    const reminderTime = time || (reminderCount > 1 ? generateRandomTime() : '09:00');
    
    try {
      // Save to database
      await query(
        `INSERT INTO reminders (id, user_id, title, reminder_time, reminder_date, message, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [reminderId, sessionId, title, reminderTime, reminderDate, `Created via AI: "${originalCommand}"`]
      );
      console.log(`AI Reminder ${i + 1} saved to database`);
    } catch (dbError) {
      console.log('Database save failed, table might not exist:', dbError.message);
    }
    
    // Try to create phone reminder
    try {
      const googleDateTime = formatTimeForGoogle(reminderTime, reminderDate);
      await createTaskReminders(sessionId, [{
        title: title,
        reminder_minutes: 15,
        due_date: googleDateTime,
        type: 'reminder'
      }]);
    } catch (googleError) {
      console.log('Google reminder creation failed, saved to database only');
    }
    
    results.push({
      reminderId,
      title,
      time: reminderTime,
      date: reminderDate
    });
  }
  
  return {
    type: 'reminder_created',
    count: results.length,
    reminders: results,
    message: `Created ${results.length} reminder${results.length !== 1 ? 's' : ''}: "${title}" for ${results[0].date}${results.length > 1 ? ' at various times' : ' at ' + results[0].time}`
  };
}

function generateRandomTime() {
  const hour = Math.floor(Math.random() * 14) + 8; // 8 AM to 9 PM
  const minute = Math.random() > 0.5 ? '00' : '30';
  const period = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute}${period}`;
}

async function processLegacyCommand(lowerCommand, sessionId) {
  // Fallback to original simple command processing
  if (lowerCommand.includes('create reminder') || lowerCommand.includes('remind me') || lowerCommand.includes('set reminder')) {
    return await createReminderCommand(lowerCommand, sessionId);
  }
  
  if (lowerCommand.includes('delete all reminders') || lowerCommand.includes('remove all reminders') || lowerCommand.includes('clear reminders')) {
    return await deleteRemindersCommand(lowerCommand, sessionId);
  }
  
  if (lowerCommand.includes('leave') || lowerCommand.includes('vacation') || lowerCommand.includes('cancel all tasks')) {
    return await cancelTasksCommand(lowerCommand, sessionId);
  }
  
  if (lowerCommand.includes('shift') || lowerCommand.includes('move') || lowerCommand.includes('postpone')) {
    return await shiftTasksCommand(lowerCommand, sessionId);
  }
  
  return {
    type: 'unknown',
    message: 'I didn\'t understand that command. Try commands like: "delete all reminders for Thursday", "shift my study tasks to Sunday", "show me reminders from 1pm to 3pm", "delete all work meetings this week"'
  };
}

async function createReminderCommand(command, sessionId) {
  try {
    // Extract reminder details using simple patterns
    const reminderText = extractReminderText(command);
    const time = extractTime(command);
    const date = extractDate(command) || new Date().toISOString().split('T')[0];
    
    const reminderId = uuidv4();
    
    console.log('Creating reminder:', { reminderText, time, date });
    
    // Save to database
    try {
      await query(
        `INSERT INTO reminders (id, user_id, title, reminder_time, reminder_date, message, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [reminderId, sessionId, reminderText, time, date, `Created via voice: "${command}"`]
      );
      console.log('Reminder saved to database');
    } catch (dbError) {
      console.log('Database save failed, table might not exist:', dbError.message);
      // Create in-memory fallback or just return success
    }
    
    // Try to create phone reminder (if Google connected)
    try {
      const googleDateTime = formatTimeForGoogle(time, date);
      await createTaskReminders(sessionId, [{
        title: reminderText,
        reminder_minutes: calculateReminderMinutes(time),
        due_date: googleDateTime,
        type: 'reminder'
      }]);
    } catch (googleError) {
      console.log('Google reminder creation failed, saved to database only');
    }
    
    return {
      type: 'reminder_created',
      reminderId,
      title: reminderText,
      time,
      date,
      message: `Reminder created: "${reminderText}" for ${date} at ${time}`
    };
  } catch (error) {
    console.error('Create reminder command failed:', error);
    throw error;
  }
}

async function deleteRemindersCommand(command, sessionId) {
  const date = extractDate(command);
  
  try {
    const whereClause = date ? 'AND reminder_date = ?' : '';
    const params = date ? [sessionId, date] : [sessionId];
    
    const result = await query(
      `DELETE FROM reminders WHERE user_id = ? ${whereClause}`,
      params
    );
    
    const dateText = date ? ` for ${date}` : '';
    return {
      type: 'reminders_deleted',
      count: result.affectedRows,
      message: `Deleted ${result.affectedRows} reminder${result.affectedRows !== 1 ? 's' : ''}${dateText}`
    };
  } catch (dbError) {
    console.log('Database delete failed, table might not exist:', dbError.message);
    return {
      type: 'reminders_deleted',
      count: 0,
      message: `No reminders found in database${date ? ` for ${date}` : ''}`
    };
  }
}

async function cancelTasksCommand(command, sessionId) {
  const dates = extractLeaveDates(command);
  
  if (dates.length === 0) {
    return {
      type: 'error',
      message: 'Please specify dates for your leave (e.g., "leave for 2 days" or "leave from tomorrow to Friday")'
    };
  }
  
  const datePlaceholders = dates.map(() => '?').join(',');
  const params = [sessionId, ...dates];
  
  const result = await query(
    `DELETE FROM tasks WHERE user_id = ? AND DATE(due_date) IN (${datePlaceholders})`,
    params
  );
  
  return {
    type: 'tasks_cancelled',
    count: result.affectedRows,
    dates,
    message: `Cancelled ${result.affectedRows} task${result.affectedRows !== 1 ? 's' : ''} for ${dates.join(', ')}`
  };
}

async function shiftTasksCommand(command, sessionId) {
  const shiftDays = extractShiftDays(command);
  const dates = extractSpecificDates(command);
  
  if (shiftDays === 0 && dates.length === 0) {
    return {
      type: 'error',
      message: 'Please specify how many days to shift (e.g., "shift tasks 2 days ahead")'
    };
  }
  
  let result;
  
  if (shiftDays !== 0) {
    // Shift all future tasks
    result = await query(
      `UPDATE tasks SET due_date = DATE_ADD(due_date, INTERVAL ? DAY) 
       WHERE user_id = ? AND due_date > NOW()`,
      [shiftDays, sessionId]
    );
  } else if (dates.length > 0) {
    // Shift tasks for specific dates
    const datePlaceholders = dates.map(() => '?').join(',');
    const params = [shiftDays || 1, sessionId, ...dates];
    
    result = await query(
      `UPDATE tasks SET due_date = DATE_ADD(due_date, INTERVAL ? DAY) 
       WHERE user_id = ? AND DATE(due_date) IN (${datePlaceholders})`,
      params
    );
  }
  
  return {
    type: 'tasks_shifted',
    count: result.affectedRows,
    shiftDays,
    message: `Shifted ${result.affectedRows} task${result.affectedRows !== 1 ? 's' : ''} ${shiftDays} day${shiftDays !== 1 ? 's' : ''} ahead`
  };
}

// Helper functions for extracting information
function extractReminderText(command) {
  const patterns = [
    /remind me to (.+?)(?:\s+at|\s+on|\s+for|$)/i,
    /create reminder (.+?)(?:\s+at|\s+on|\s+for|$)/i,
    /set reminder (.+?)(?:\s+at|\s+on|\s+for|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) return match[1].trim();
  }
  
  return 'Reminder';
}

function extractTime(command) {
  const patterns = [
    /(\d{1,2}:\d{2}\s*(?:am|pm)?)/i,
    /(\d{1,2}\s*(?:am|pm))/i,
    /at\s+(\d{1,2}:\d{2})/i
  ];
  
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) return match[1];
  }
  
  return '09:00'; // Default time
}

function extractDate(command) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (command.includes('today')) return today.toISOString().split('T')[0];
  if (command.includes('tomorrow')) return tomorrow.toISOString().split('T')[0];
  
  // Extract specific date patterns
  const dateMatch = command.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];
  
  return null;
}

function extractLeaveDates(command) {
  const dates = [];
  const today = new Date();
  
  // Handle "leave for X days"
  const daysMatch = command.match(/leave for (\d+) days?/i);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
  }
  
  return dates;
}

function extractShiftDays(command) {
  const match = command.match(/shift\s+(\d+)\s+days?/i);
  if (match) return parseInt(match[1]);
  
  if (command.includes('shift ahead') || command.includes('move forward')) return 1;
  if (command.includes('shift back') || command.includes('move back')) return -1;
  
  return 0;
}

function extractSpecificDates(command) {
  // Extract specific dates mentioned in command
  const dates = [];
  const dateMatch = command.match(/(\d{4}-\d{2}-\d{2})/g);
  if (dateMatch) dates.push(...dateMatch);
  
  return dates;
}

function calculateReminderMinutes(time) {
  // Convert time like "5pm" to minutes before event
  // For now, default to 15 minutes before
  return 15;
}

function formatTimeForGoogle(time, date) {
  // Convert "5pm" to proper time format for Google Calendar
  if (time.includes('pm') && !time.includes('12')) {
    const hour = parseInt(time.replace('pm', '').trim()) + 12;
    return `${date}T${hour.toString().padStart(2, '0')}:00:00`;
  } else if (time.includes('am') && !time.includes('12')) {
    const hour = parseInt(time.replace('am', '').trim());
    return `${date}T${hour.toString().padStart(2, '0')}:00:00`;
  } else if (time.includes(':')) {
    // Already in HH:MM format
    return `${date}T${time}:00`;
  } else {
    // Default to 9 AM if format is unclear
    return `${date}T09:00:00`;
  }
}

// Get all reminders from Google Calendar
router.get('/calendar-events', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const { date, startDate, endDate } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const events = await getGoogleCalendarEvents(sessionId, { date, startDate, endDate });
    
    res.json({
      success: true,
      events,
      count: events.length,
      message: `Found ${events.length} events`
    });

  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// Bulk delete calendar events
router.delete('/calendar-events', async (req, res) => {
  try {
    const { sessionId, eventIds, date, startDate, endDate } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    let eventsToDelete = eventIds;
    
    // If no specific IDs provided, get events by date range
    if (!eventsToDelete || eventsToDelete.length === 0) {
      const events = await getGoogleCalendarEvents(sessionId, { date, startDate, endDate });
      eventsToDelete = events.map(event => event.id);
    }

    const results = await bulkDeleteCalendarEvents(sessionId, eventsToDelete);
    
    res.json({
      success: true,
      deleted: results.deleted,
      failed: results.failed,
      message: `Deleted ${results.deleted} events, ${results.failed} failed`
    });

  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to delete calendar events' });
  }
});

async function getGoogleCalendarEvents(sessionId, filters = {}) {
  const { date, startDate, endDate } = filters;
  
  try {
    const auth = await getGoogleAuth(sessionId);
    if (!auth) {
      throw new Error('Google Calendar not connected');
    }

    const calendar = google.calendar({ version: 'v3', auth });

    let timeMin = null;
    let timeMax = null;

    if (date) {
      timeMin = new Date(date).toISOString();
      timeMax = new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000).toISOString();
    } else if (startDate && endDate) {
      timeMin = new Date(startDate).toISOString();
      timeMax = new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
    } else if (startDate) {
      timeMin = new Date(startDate).toISOString();
      timeMax = new Date(new Date(startDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    }

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      q: 'Task Reminder' // Filter for task reminders
    });

    return response.data.items || [];
  } catch (error) {
    console.error('Failed to get calendar events:', error);
    throw error;
  }
}

async function bulkDeleteCalendarEvents(sessionId, eventIds) {
  const results = { deleted: 0, failed: 0 };
  
  try {
    const auth = await getGoogleAuth(sessionId);
    if (!auth) {
      throw new Error('Google Calendar not connected');
    }

    const calendar = google.calendar({ version: 'v3', auth });

    for (const eventId of eventIds) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: eventId
        });
        results.deleted++;
      } catch (error) {
        console.error(`Failed to delete event ${eventId}:`, error);
        results.failed++;
      }
    }

    return results;
  } catch (error) {
    console.error('Bulk delete failed:', error);
    throw error;
  }
}

export default router;
