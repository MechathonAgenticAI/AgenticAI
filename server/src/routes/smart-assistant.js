import express from 'express';
import { query } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { createTaskReminders, getGoogleAuth, getGoogleCalendarEvents, bulkDeleteCalendarEvents, bulkUpdateCalendarEvents } from '../google-integration.js';
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
    "date": "extracted date like 'today', 'tomorrow', 'Thursday', '13 December'",
    "dateRange": "if mentioned like '14dec to 20 dec', '9 Dec to 13 Dec', '14 dec and 16 dec'",
    "timeRange": {"start": "1pm", "end": "3pm"} if mentioned,
    "shiftAmount": number if shifting (CALCULATE THIS EXACTLY),
    "shiftUnit": "days|weeks" if shifting,
    "taskType": "study|work|exercise|meeting" if specified,
    "newTime": "updated time like '9am'" if updating,
    "count": number if creating multiple
  },
  "filters": {
    "date": "specific date like 'Monday', 'Thursday'",
    "dateRange": "range like 'this week'",
    "timeRange": {"start": "1pm", "end": "3pm"} if mentioned,
    "taskType": "study|work|exercise|meeting" if specified,
    "keywords": ["keyword1", "keyword2"] if mentioned
  },
  "needsMoreInfo": true|false,
  "missingParameters": ["parameter1", "parameter2"],
  "prompt": "What specific information do you need from the user?",
  "examples": ["example command 1", "example command 2"]
}

IMPORTANT CALCULATION RULES:
- For shift commands, ALWAYS calculate the POSITIVE shift amount:
  * "Monday to Sunday" = 6 days (forward from Monday to Sunday)
  * "Friday to Monday" = 3 days (forward to next week Monday)
  * "Wednesday to Saturday" = 3 days
  * "Sunday to Wednesday" = 3 days
  * "shift 2 days ahead" = shiftAmount: 2
  * "move to tomorrow" = shiftAmount: 1
  * NEVER use negative shift amounts - always count forward in the week
  * Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6, Sunday=7
  * Formula: (target_day - source_day + 7) % 7 or add 7 if target < source
- For date ranges, extract start and end dates
- For "and" dates like "14 dec and 16 dec", put BOTH dates in dateRange
- For time ranges, extract both start and end times
- If shifting TO a specific date, put that date in parameters.date

Important:
- For delete commands, put the date in both parameters.date and filters.date
- For shift commands, calculate the correct shift amount and put it in shiftAmount
- For shift commands, put source date in filters.date and target in parameters.date if specified
- For list commands, put filter criteria in filters
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
    console.log('Cohere client type:', typeof cohere);
    console.log('Cohere client methods:', Object.getOwnPropertyNames(cohere));
    
    const response = await cohere.chat({
      model: 'command-nightly',
      message: prompt,
      maxTokens: 1000,
      temperature: 0.1,
    });

    console.log('Cohere response received:', typeof response);
    console.log('Cohere response keys:', response ? Object.keys(response) : 'null');
    
    if (!response) {
      throw new Error('Cohere returned null response');
    }
    
    const aiResponse = response.text;
    console.log('Raw AI Response:', aiResponse);
    
    if (!aiResponse) {
      throw new Error('Cohere returned empty response');
    }
    
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
    console.error('Error stack:', error.stack);
    throw error; // Let it fall back to pattern matching
  }
}

async function executeAICommand(analysis, sessionId, originalCommand) {
  const { action, parameters, filters, target } = analysis;
  
  switch (action) {
    case 'create_reminder':
      return await createAIReminder(parameters, sessionId, originalCommand);
    
    case 'delete_reminders':
      return await deleteCalendarReminders(parameters || filters, sessionId, originalCommand);
    
    case 'shift_tasks':
      return await shiftCalendarEvents(parameters, sessionId, originalCommand, filters);
    
    case 'update_reminders':
      return await updateCalendarReminders(parameters || filters, sessionId, originalCommand);
    
    case 'list_events':
      return await listCalendarEvents(parameters || filters, sessionId, originalCommand);
      
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
  
  const { title, time, dateRange, count } = parameters;
  console.log('Destructured parameters:', { title, time, dateRange, count });
  
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
  
  // Generate dates based on dateRange or single date
  const reminderDates = [];
  
  if (dateRange) {
    // Parse date range like "9 dec to 13 dec", "14dec to 20 dec"
    const dateRangeMatch = dateRange.match(/(\d{1,2})\s*([a-z]{3,4})\s*to\s*(\d{1,2})\s*([a-z]{3,4})/i);
    if (dateRangeMatch) {
      const startDate = parseDateText(dateRangeMatch[1] + dateRangeMatch[2]);
      const endDate = parseDateText(dateRangeMatch[3] + dateRangeMatch[4]);
      
      console.log('Parsed date range:', { startDate, endDate, dateRangeMatch });
      
      if (startDate && endDate) {
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        const daysToCreate = Math.min(reminderCount, daysDiff + 1);
        
        for (let i = 0; i < daysToCreate; i++) {
          const currentDate = new Date(startDate);
          currentDate.setDate(startDate.getDate() + i);
          reminderDates.push(currentDate.toISOString().split('T')[0]);
        }
      }
    } else {
      // Parse "and" dates like "14 dec and 16 dec"
      const andDatesMatch = dateRange.match(/(\d{1,2})\s*([a-z]{3,4})\s*and\s*(\d{1,2})\s*([a-z]{3,4})/i);
      if (andDatesMatch) {
        const date1 = parseDateText(andDatesMatch[1] + andDatesMatch[2]);
        const date2 = parseDateText(andDatesMatch[3] + andDatesMatch[4]);
        
        console.log('Parsed "and" dates:', { date1, date2, andDatesMatch });
        
        if (date1) reminderDates.push(date1.toISOString().split('T')[0]);
        if (date2) reminderDates.push(date2.toISOString().split('T')[0]);
      } else {
        // Handle "to" dates that should be "and" (like "14 December to 16 December")
        const toDatesMatch = dateRange.match(/(\d{1,2})\s*([a-z]{3,4})\s*to\s*(\d{1,2})\s*([a-z]{3,4})/i);
        if (toDatesMatch && dateRange.includes('December')) {
          const date1 = parseDateText(toDatesMatch[1] + toDatesMatch[2]);
          const date2 = parseDateText(toDatesMatch[3] + toDatesMatch[4]);
          
          console.log('Parsed "to" dates as separate:', { date1, date2, toDatesMatch });
          
          if (date1) reminderDates.push(date1.toISOString().split('T')[0]);
          if (date2) reminderDates.push(date2.toISOString().split('T')[0]);
        } else {
          console.log('Date range regex failed for:', dateRange);
        }
      }
    }
  } else if (date) {
    // Handle single date
    const singleDate = date === 'today' ? new Date().toISOString().split('T')[0] : 
                      date === 'tomorrow' ? new Date(Date.now() + 86400000).toISOString().split('T')[0] :
                      parseDateText(date)?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
    reminderDates.push(singleDate);
  } else {
    // Default to today
    reminderDates.push(new Date().toISOString().split('T')[0]);
  }
  
  // If we still don't have enough dates, repeat the last date
  while (reminderDates.length < reminderCount) {
    reminderDates.push(reminderDates[reminderDates.length - 1]);
  }
  
  for (let i = 0; i < reminderCount; i++) {
    const reminderId = uuidv4();
    const reminderDate = reminderDates[i] || new Date().toISOString().split('T')[0];
    
    // Generate time based on timeRange or single time
    let reminderTime;
    if (time && time.start && time.end) {
      // Generate random time within the range
      const startTime = parseTime(time.start);
      const endTime = parseTime(time.end);
      const startMinutes = startTime[0] * 60 + startTime[1];
      const endMinutes = endTime[0] * 60 + endTime[1];
      const randomMinutes = startMinutes + Math.floor(Math.random() * (endMinutes - startMinutes));
      reminderTime = `${Math.floor(randomMinutes / 60)}:${(randomMinutes % 60).toString().padStart(2, '0')}`;
    } else if (time) {
      reminderTime = time;
    } else if (reminderCount > 1) {
      reminderTime = generateRandomTime();
    } else {
      reminderTime = '09:00';
    }
    
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

function parseDateText(dateText) {
  const today = new Date();
  const currentYear = today.getFullYear();
  
  // Handle patterns like "14dec", "20 dec", "14dec2025", etc.
  const dateMatch = dateText.match(/(\d{1,2})\s*([a-z]{3,4})/i);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const monthText = dateMatch[2].toLowerCase();
    
    // Map month names to numbers
    const monthMap = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    
    const month = monthMap[monthText.substring(0, 3)];
    if (month !== undefined) {
      const date = new Date(currentYear, month, day);
      // If the date is in the past, assume it's for next year
      if (date < today) {
        date.setFullYear(currentYear + 1);
      }
      return date;
    }
  }
  
  return null;
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

// Helper functions for filtering and processing
function filterEventsByCriteria(events, filters) {
  return events.filter(event => {
    // Filter by date range
    if (filters.dateRange) {
      const eventDate = new Date(event.start.dateTime || event.start.date);
      if (filters.dateRange === 'this week') {
        const now = new Date();
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        const weekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 6));
        if (eventDate < weekStart || eventDate > weekEnd) return false;
      }
      // Add more date range filters as needed
    }
    
    // Filter by time range
    if (filters.timeRange) {
      const eventTime = new Date(event.start.dateTime);
      const startTime = parseTime(filters.timeRange.start);
      const endTime = parseTime(filters.timeRange.end);
      if (eventTime.getHours() < startTime || eventTime.getHours() > endTime) return false;
    }
    
    // Filter by task type
    if (filters.taskType) {
      const summary = (event.summary || '').toLowerCase();
      const description = (event.description || '').toLowerCase();
      if (!summary.includes(filters.taskType) && !description.includes(filters.taskType)) return false;
    }
    
    // Filter by keywords
    if (filters.keywords) {
      const summary = (event.summary || '').toLowerCase();
      const description = (event.description || '').toLowerCase();
      const hasKeyword = filters.keywords.some(keyword => 
        summary.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) return false;
    }
    
    return true;
  });
}

function parseTime(timeStr) {
  if (timeStr.includes('am') || timeStr.includes('pm')) {
    const isPM = timeStr.includes('pm') && !timeStr.includes('12');
    const hours = parseInt(timeStr.replace(/[ap]m/, '').trim()) + (isPM ? 12 : 0);
    return [hours, 0];
  } else if (timeStr.includes(':')) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return [hours, minutes];
  }
  return [9, 0]; // Default to 9 AM
}

function formatDate(dateTime) {
  const date = new Date(dateTime.dateTime || dateTime.date);
  return date.toLocaleDateString();
}

function formatTime(dateTime) {
  const date = new Date(dateTime.dateTime || dateTime.date);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function deleteCalendarReminders(parameters, sessionId, originalCommand) {
  try {
    console.log('=== DELETING CALENDAR REMINDERS ===');
    console.log('Parameters:', parameters);
    
    // Convert date parameter to filters
    const filters = {};
    if (parameters.date) {
      const dayName = parameters.date.toLowerCase();
      const today = new Date();
      const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Map day names to numbers
      const dayMap = {
        'sunday': 0,
        'monday': 1,
        'tuesday': 2,
        'wednesday': 3,
        'thursday': 4,
        'friday': 5,
        'saturday': 6
      };
      
      if (dayMap[dayName] !== undefined) {
        // Calculate days until the target day
        const targetDay = dayMap[dayName];
        let daysUntilTarget = (targetDay - currentDay + 7) % 7;
        if (daysUntilTarget === 0) daysUntilTarget = 7; // If today is that day, use next week
        
        const targetDate = new Date(today.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);
        filters.startDate = targetDate.toISOString().split('T')[0];
        filters.endDate = targetDate.toISOString().split('T')[0];
      } else {
        // Handle other date formats
        filters.date = parameters.date;
      }
    }
    
    // Get all events from Google Calendar
    const events = await getGoogleCalendarEvents(sessionId, filters);
    console.log('Found events:', events.length);
    
    // Filter events based on criteria
    const eventsToDelete = filterEventsByCriteria(events, filters);
    console.log('Events to delete:', eventsToDelete.length);
    
    if (eventsToDelete.length === 0) {
      return {
        type: 'no_events_found',
        message: `No reminders found matching your criteria: ${originalCommand}`,
        criteria: filters
      };
    }
    
    // Delete the events
    const results = await bulkDeleteCalendarEvents(sessionId, eventsToDelete.map(e => e.id));
    
    return {
      type: 'reminders_deleted',
      deleted: results.deleted.length,
      failed: results.failed.length,
      message: `Deleted ${results.deleted.length} reminders matching: ${originalCommand}`,
      deletedEvents: results.deleted,
      failedEvents: results.failed
    };
    
  } catch (error) {
    console.error('Failed to delete reminders:', error);
    return {
      type: 'error',
      message: `Failed to delete reminders: ${error.message}`
    };
  }
};

async function shiftCalendarEvents(parameters, sessionId, originalCommand) {
  try {
    console.log('=== SHIFTING CALENDAR EVENTS ===');
    console.log('Parameters:', parameters);
    
    // Get the filters from executeAICommand - it passes parameters OR filters
    const sourceFilters = arguments[2] === originalCommand ? {} : arguments[2];
    console.log('Source filters:', sourceFilters);
    
    // Convert source date filter to actual date range
    const filters = {};
    if (sourceFilters.date) {
      const dayName = sourceFilters.date.toLowerCase();
      const today = new Date();
      const currentDay = today.getDay();
      
      const dayMap = {
        'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
        'thursday': 4, 'friday': 5, 'saturday': 6
      };
      
      if (dayMap[dayName] !== undefined) {
        const targetDay = dayMap[dayName];
        let daysUntilTarget = (targetDay - currentDay + 7) % 7;
        if (daysUntilTarget === 0) daysUntilTarget = 7;
        
        const targetDate = new Date(today.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);
        filters.startDate = targetDate.toISOString().split('T')[0];
        filters.endDate = targetDate.toISOString().split('T')[0];
        console.log('Looking for events on date:', filters.startDate, 'for day:', dayName);
      }
    }
    
    // Add task type filter
    if (sourceFilters.taskType) {
      filters.taskType = sourceFilters.taskType;
    }
    
    // First, get ALL events to debug
    console.log('=== DEBUG: Fetching all events ===');
    const allEvents = await getGoogleCalendarEvents(sessionId, {});
    console.log('Total events found:', allEvents.length);
    allEvents.forEach((event, index) => {
      console.log(`Event ${index + 1}:`, {
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end
      });
    });
    
    // Then get filtered events
    const events = await getGoogleCalendarEvents(sessionId, filters);
    console.log('Filtered events count:', events.length);
    
    const eventsToShift = filterEventsByCriteria(events, filters);
    console.log('Events to shift after filtering:', eventsToShift.length);
    
    if (eventsToShift.length === 0) {
      return {
        type: 'no_events_found',
        message: `No events found to shift: ${originalCommand}`,
        debug: {
          totalEvents: allEvents.length,
          filteredEvents: events.length,
          filters: filters,
          sourceFilters: sourceFilters,
          allEventSummaries: allEvents.map(e => e.summary)
        }
      };
    }
    
    // Calculate new times based on target date
    const updates = eventsToShift.map(event => {
      let newStart, newEnd;
      
      // Use target date if specified, otherwise shift by amount
      if (parameters.date) {
        // Parse target date like "13 December"
        const targetDate = parseDateText(parameters.date);
        if (targetDate) {
          // Extract time from original event
          const originalStart = new Date(event.start.dateTime || event.start.date);
          const originalEnd = new Date(event.end.dateTime || event.end.date);
          
          // Set target date with original time
          newStart = new Date(targetDate);
          newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
          
          newEnd = new Date(targetDate);
          newEnd.setHours(originalEnd.getHours(), originalEnd.getMinutes(), 0, 0);
        } else {
          // Fallback to shifting
          newStart = calculateShiftedTime(event.start, parameters);
          newEnd = calculateShiftedTime(event.end, parameters);
        }
      } else {
        // Fallback to shifting
        newStart = calculateShiftedTime(event.start, parameters);
        newEnd = calculateShiftedTime(event.end, parameters);
      }
      
      return {
        eventId: event.id,
        eventData: {
          ...event,
          start: { dateTime: typeof newStart === 'string' ? newStart : newStart.toISOString() },
          end: { dateTime: typeof newEnd === 'string' ? newEnd : newEnd.toISOString() }
        }
      };
    });
    
    const results = await bulkUpdateCalendarEvents(sessionId, updates);
    
    return {
      type: 'events_shifted',
      updated: results.updated.length,
      failed: results.failed.length,
      message: `Shifted ${results.updated.length} events: ${originalCommand}`,
      updatedEvents: results.updated,
      failedEvents: results.failed
    };
    
  } catch (error) {
    console.error('Failed to shift events:', error);
    return {
      type: 'error',
      message: `Failed to shift events: ${error.message}`
    };
  }
};

function calculateShiftedTime(dateTime, parameters) {
  // Handle Google Calendar date objects
  let date;
  if (typeof dateTime === 'object' && dateTime.dateTime) {
    date = new Date(dateTime.dateTime);
  } else if (typeof dateTime === 'object' && dateTime.date) {
    date = new Date(dateTime.date);
  } else {
    date = new Date(dateTime);
  }
  
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date value');
  }
  
  if (parameters.shiftAmount && parameters.shiftUnit) {
    const amount = parseInt(parameters.shiftAmount);
    const unit = parameters.shiftUnit.toLowerCase();
    
    switch (unit) {
      case 'days':
        date.setDate(date.getDate() + amount);
        break;
      case 'hours':
        date.setHours(date.getHours() + amount);
        break;
      case 'weeks':
        date.setDate(date.getDate() + (amount * 7));
        break;
    }
  }
  
  return date.toISOString();
};

async function updateCalendarReminders(parameters, sessionId, originalCommand) {
  try {
    console.log('=== UPDATING CALENDAR REMINDERS ===');
    console.log('Parameters:', parameters);
    
    const events = await getGoogleCalendarEvents(sessionId, parameters);
    const eventsToUpdate = filterEventsByCriteria(events, parameters);
    
    if (eventsToUpdate.length === 0) {
      return {
        type: 'no_events_found',
        message: `No events found to update: ${originalCommand}`
      };
    }
    
    // Apply updates based on criteria
    const updates = eventsToUpdate.map(event => {
      const updatedEvent = applyUpdateCriteria(event, parameters);
      return {
        eventId: event.id,
        eventData: updatedEvent
      };
    });
    
    const results = await bulkUpdateCalendarEvents(sessionId, updates);
    
    return {
      type: 'reminders_updated',
      updated: results.updated.length,
      failed: results.failed.length,
      message: `Updated ${results.updated.length} reminders: ${originalCommand}`,
      updatedEvents: results.updated,
      failedEvents: results.failed
    };
    
  } catch (error) {
    console.error('Failed to update reminders:', error);
    return {
      type: 'error',
      message: `Failed to update reminders: ${error.message}`
    };
  }
};

async function listCalendarEvents(parameters, sessionId, originalCommand) {
  try {
    console.log('=== LISTING CALENDAR EVENTS ===');
    console.log('Parameters:', parameters);
    
    const events = await getGoogleCalendarEvents(sessionId, parameters);
    const filteredEvents = filterEventsByCriteria(events, parameters);
    
    if (filteredEvents.length === 0) {
      return {
        type: 'no_events_found',
        message: `No events found: ${originalCommand}`,
        criteria: parameters
      };
    }
    
    // Format events for display
    const formattedEvents = filteredEvents.map(event => ({
      id: event.id,
      title: event.summary,
      description: event.description,
      date: formatDate(event.start),
      time: formatTime(event.start),
      end: formatTime(event.end)
    }));
    
    return {
      type: 'events_listed',
      count: formattedEvents.length,
      message: `Found ${formattedEvents.length} events: ${originalCommand}`,
      events: formattedEvents
    };
    
  } catch (error) {
    console.error('Failed to list events:', error);
    return {
      type: 'error',
      message: `Failed to list events: ${error.message}`
    };
  }
};

function applyUpdateCriteria(event, filters) {
  const updatedEvent = { ...event };
  
  // Update time
  if (filters.newTime) {
    const newDateTime = new Date(event.start.dateTime);
    const [hours, minutes] = parseTime(filters.newTime);
    newDateTime.setHours(hours, minutes);
    updatedEvent.start = { ...updatedEvent.start, dateTime: newDateTime.toISOString() };
    
    // Update end time to maintain duration
    const duration = new Date(event.end.dateTime) - new Date(event.start.dateTime);
    updatedEvent.end = { 
      ...updatedEvent.end, 
      dateTime: new Date(newDateTime.getTime() + duration).toISOString() 
    };
  }
  
  // Update title
  if (filters.newTitle) {
    updatedEvent.summary = filters.newTitle;
  }
  
  return updatedEvent;
};

export default router;
