import { CohereClient } from 'cohere-ai';
import { createTaskReminders } from './google-integration.js';
import { v4 as uuidv4 } from 'uuid';
import { query } from './db.js';

// Initialize Cohere client
const cohereClient = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

const SCHEDULE_PROMPT = `You are an AI assistant that analyzes timetable/schedule images and extracts structured task information.

Your job is to:
1. Analyze the uploaded schedule/timetable image
2. Extract all classes, meetings, or activities with their times
3. Convert them into structured tasks with proper time formatting
4. Handle different schedule formats (college, office, weekly calendars)

IMPORTANT RULES:
- Extract ALL time slots and activities visible in the image
- Convert times to 24-hour format (HH:MM)
- Include days of the week for each activity
- Estimate duration if not explicitly shown (default: 1 hour)
- Handle common abbreviations (LEC, LAB, MTG, etc.)
- Include room numbers or locations if visible
- Set reminder time to 10 minutes before unless user specifies otherwise

Response format:
{
  "schedule_type": "college|office|weekly|custom",
  "week_starting": "YYYY-MM-DD",
  "default_reminder_minutes": 10,
  "activities": [
    {
      "title": "Activity Name",
      "description": "Additional details (room, professor, etc.)",
      "day": "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday",
      "start_time": "HH:MM",
      "end_time": "HH:MM", 
      "duration_minutes": 60,
      "location": "Room/Location if visible",
      "type": "class|meeting|study|break|other",
      "reminder_minutes": 10,
      "recurring": true
    }
  ]
}

Examples:
Input: College schedule image showing Monday 9:00 AM Math, Tuesday 10:30 AM Physics Lab
Output: {"schedule_type": "college", "activities": [{"title": "Mathematics", "day": "Monday", "start_time": "09:00", "end_time": "10:00", "reminder_minutes": 10}, {"title": "Physics Lab", "day": "Tuesday", "start_time": "10:30", "end_time": "12:30", "reminder_minutes": 10}]}

Input: Office schedule showing 9 AM Team Standup, 2 PM Client Meeting
Output: {"schedule_type": "office", "activities": [{"title": "Team Standup", "day": "Monday", "start_time": "09:00", "end_time": "09:30", "reminder_minutes": 10}, {"title": "Client Meeting", "day": "Monday", "start_time": "14:00", "end_time": "15:00", "reminder_minutes": 10}]}

Analyze the provided image and return the structured schedule data in valid JSON format only.`;

export async function parseScheduleImage(imageBase64, customPrompt = '', reminderMinutes = 10) {
  try {
    console.log('=== SCHEDULE IMAGE PARSING START ===');
    console.log('API Key available:', !!process.env.COHERE_API_KEY);
    
    // Build the full prompt with custom instructions
    let fullPrompt = SCHEDULE_PROMPT;
    if (customPrompt) {
      fullPrompt = `${customPrompt}\n\n${SCHEDULE_PROMPT}`;
    }
    
    // Add reminder instruction if custom time provided
    if (reminderMinutes !== 10) {
      fullPrompt = fullPrompt.replace('Set reminder time to 10 minutes before unless user specifies otherwise', 
        `Set reminder time to ${reminderMinutes} minutes before for all activities`);
    }

    console.log('Calling Cohere API...');
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await cohereClient.chat({
          model: 'command-r-plus-08-2024',
          message: fullPrompt,
          images: [
            {
              type: 'image',
              image: imageBase64,
              mime_type: 'image/jpeg'
            }
          ],
          maxTokens: 4000,
          temperature: 0.1,
        });
        break; // Success, exit retry loop
      } catch (apiError) {
        console.log(`API attempt ${retryCount + 1} failed:`, apiError.message);
        retryCount++;
        
        if (retryCount >= maxRetries) {
          throw apiError; // Re-throw after max retries
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
      }
    }

    console.log('Cohere response received:', response);

    const aiText = response.text.trim();
    console.log('Raw AI response:', aiText);
    
    // Extract JSON from the response - more robust parsing
    let jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Try to find JSON that might be incomplete
      const lastBrace = aiText.lastIndexOf('}');
      if (lastBrace > 0) {
        const firstBrace = aiText.indexOf('{');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          jsonMatch = aiText.substring(firstBrace, lastBrace + 1);
        }
      }
    }
    
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }
    
    const jsonString = jsonMatch[0] || jsonMatch;
    
    // Try to fix common JSON issues
    let fixedJson = jsonString
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      .replace(/(\d+)(\s*[}\]])/g, '$1,$2'); // Add missing commas before brackets
    
    // Handle incomplete JSON (truncated responses)
    if (fixedJson.endsWith('"end_time"')) {
      // If it ends with "end_time", complete the object
      fixedJson = fixedJson.replace(/"end_time":\s*"([^"]*)"?$/, '"end_time": "$1", "duration_minutes": 60, "type": "meeting", "reminder_minutes": 15, "recurring": false}');
    }
    
    // Handle "end_" truncation (common issue)
    if (fixedJson.endsWith('"end_')) {
      fixedJson = fixedJson.replace(/"end_$/, '"end_time": "15:00", "duration_minutes": 60, "type": "meeting", "reminder_minutes": 15, "recurring": false}');
    }
    
    // Handle "end_" truncation with quotes
    if (fixedJson.endsWith('"end_"')) {
      fixedJson = fixedJson.replace(/"end_"$/, '"end_time": "15:00", "duration_minutes": 60, "type": "meeting", "reminder_minutes": 15, "recurring": false}');
    }
    
    // Handle incomplete "end_" field
    if (fixedJson.includes('"end_"') && !fixedJson.includes('"end_time":')) {
      fixedJson = fixedJson.replace(/"end_"$/, '"end_time": "15:00"');
    }
    
    // Handle incomplete objects
    const incompleteObjectPattern = /"([^"]+)":\s*"([^"]*)"?$/;
    if (incompleteObjectPattern.test(fixedJson)) {
      fixedJson += ', "duration_minutes": 60, "type": "meeting", "reminder_minutes": 15, "recurring": false}';
    }
    
    // Handle incomplete arrays - close them properly
    const openBrackets = (fixedJson.match(/\[/g) || []).length;
    const closeBrackets = (fixedJson.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      fixedJson += ']'.repeat(openBrackets - closeBrackets);
    }
    
    // Handle incomplete objects - close them properly
    const openBraces = (fixedJson.match(/\{/g) || []).length;
    const closeBraces = (fixedJson.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      fixedJson += '}'.repeat(openBraces - closeBraces);
    }
    
    console.log('Attempting to parse JSON:', fixedJson.substring(0, 200) + '...');
    
    let scheduleData;
    try {
      scheduleData = JSON.parse(fixedJson);
    } catch (parseError) {
      console.log('Initial parse failed, trying alternative fixes...');
      
      // Try more aggressive fixes
      fixedJson = fixedJson
        .replace(/"duration_minutes":\s*(\d+)(?!\s*,)/g, '"duration_minutes": $1,') // Add missing commas after duration
        .replace(/(\d+)\s*$/g, '$1'); // Clean up trailing numbers
      
      // Complete incomplete objects
      if (fixedJson.match(/"([^"]+)":\s*"([^"]*)"?$/)) {
        fixedJson += ', "duration_minutes": 60, "type": "meeting", "reminder_minutes": 15, "recurring": false}';
      }
      
      try {
        scheduleData = JSON.parse(fixedJson);
      } catch (finalError) {
        console.error('JSON parsing failed completely');
        console.error('Original JSON:', jsonString);
        console.error('Fixed JSON:', fixedJson);
        throw new Error(`Invalid JSON format: ${finalError.message}`);
      }
    }
    console.log('Parsed schedule data:', JSON.stringify(scheduleData, null, 2));
    console.log('=== SCHEDULE IMAGE PARSING END ===');
    
    return scheduleData;
  } catch (error) {
    console.error('=== SCHEDULE PARSING ERROR ===');
    console.error('Error:', error);
    console.error('Error details:', error.response?.data || error.message);
    
    // If it's a network error, provide a fallback response
    if (error.message.includes('fetch failed') || error.message.includes('network')) {
      console.log('Network error detected, providing fallback response');
      return {
        schedule_type: "office",
        week_starting: new Date().toISOString().split('T')[0],
        default_reminder_minutes: 15,
        activities: [
          {
            title: "Schedule Upload Failed",
            description: "Network error - please try again",
            day: "Monday",
            start_time: "09:00",
            end_time: "10:00",
            duration_minutes: 60,
            type: "other",
            reminder_minutes: 15,
            recurring: false
          }
        ]
      };
    }
    
    throw error;
  }
}

export async function createScheduleTasks(sessionId, scheduleData, startDate = null) {
  console.log('=== CREATING SCHEDULE TASKS ===');
  
  const results = {
    created: [],
    errors: [],
    summary: {
      total: 0,
      successful: 0,
      failed: 0
    }
  };

  // Default to this week if no start date provided
  if (!startDate) {
    startDate = getThisMonday();
  }

  const startOfWeek = new Date(startDate);
  const dayMap = {
    'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 
    'Friday': 4, 'Saturday': 5, 'Sunday': 6
  };

  for (const activity of scheduleData.activities) {
    try {
      // Calculate the actual date for this activity
      const dayOffset = dayMap[activity.day];
      if (dayOffset === undefined) {
        throw new Error(`Invalid day: ${activity.day}`);
      }

      const activityDate = new Date(startOfWeek);
      activityDate.setDate(activityDate.getDate() + dayOffset);

      // Parse start and end times
      const [startHour, startMinute] = activity.start_time.split(':').map(Number);
      const [endHour, endMinute] = activity.end_time.split(':').map(Number);

      const startDateTime = new Date(activityDate);
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const endDateTime = new Date(activityDate);
      endDateTime.setHours(endHour, endMinute, 0, 0);

      // Create task in database
      const taskId = uuidv4();
      const taskDescription = activity.description || 
        `${activity.type === 'class' ? 'Class' : 'Activity'}: ${activity.location ? `at ${activity.location}` : ''}`;

      const { rows: taskRows } = await query(`
        INSERT INTO tasks (id, title, description, category, status, deadline)
        VALUES ($1, $2, $3, $4, 'todo', $5)
        RETURNING *
      `, [
        taskId,
        activity.title,
        taskDescription,
        activity.type === 'class' ? 'education' : 'work',
        startDateTime.toISOString()
      ]);

      const createdTask = taskRows[0];

      // Create Google reminders
      const reminderResults = await createTaskReminders(
        sessionId, 
        activity.title, 
        startDateTime.toISOString(), 
        taskDescription
      );

      // Update task with Google integration info
      await query(`
        UPDATE tasks 
        SET calendar_event_id = $1, google_task_id = $2
        WHERE id = $3
      `, [
        reminderResults.calendar?.id || null,
        reminderResults.tasks?.id || null,
        taskId
      ]);

      results.created.push({
        task: createdTask,
        activity: activity,
        googleCalendar: reminderResults.calendar,
        googleTask: reminderResults.tasks,
        reminderTime: new Date(startDateTime.getTime() - (activity.reminder_minutes || 10) * 60000)
      });

      results.summary.successful++;
      console.log(`Created task: ${activity.title} on ${activity.day} at ${activity.start_time}`);

    } catch (error) {
      console.error(`Failed to create task for ${activity.title}:`, error);
      results.errors.push({
        activity: activity.title,
        error: error.message
      });
      results.summary.failed++;
    }

    results.summary.total++;
  }

  console.log('=== SCHEDULE TASKS CREATION COMPLETE ===');
  return results;
}

function getThisMonday() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, Monday = 1
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0]; // Return YYYY-MM-DD format
}

export function validateScheduleData(scheduleData) {
  const errors = [];

  if (!scheduleData.activities || !Array.isArray(scheduleData.activities)) {
    errors.push('Activities array is required');
    return errors;
  }

  scheduleData.activities.forEach((activity, index) => {
    if (!activity.title) errors.push(`Activity ${index + 1}: Title is required`);
    if (!activity.day) errors.push(`Activity ${index + 1}: Day is required`);
    if (!activity.start_time) errors.push(`Activity ${index + 1}: Start time is required`);
    if (!activity.end_time) errors.push(`Activity ${index + 1}: End time is required`);
    
    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (activity.start_time && !timeRegex.test(activity.start_time)) {
      errors.push(`Activity ${index + 1}: Invalid start time format (use HH:MM)`);
    }
    if (activity.end_time && !timeRegex.test(activity.end_time)) {
      errors.push(`Activity ${index + 1}: Invalid end time format (use HH:MM)`);
    }
  });

  return errors;
}

// Enhance the prompt with user-specific instructions
export function buildCustomSchedulePrompt(userInstructions) {
  return `USER SPECIFIC INSTRUCTIONS:
${userInstructions}

${SCHEDULE_PROMPT}`;
}
