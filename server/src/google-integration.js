import { google } from 'googleapis';
import { randomUUID } from 'crypto';
import { query } from './db.js';

// Store OAuth2 clients for each user
const oauth2Clients = new Map();

export function getGoogleAuthURL(sessionId) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: sessionId // Pass session ID to identify user
  });

  return authUrl;
}

export async function handleGoogleCallback(code, sessionId) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    console.log('=== GOOGLE OAUTH CALLBACK START ===');
    console.log('Session ID:', sessionId);
    console.log('Code received:', code ? 'Yes' : 'No');
    
    // Exchange authorization code for tokens immediately
    const response = await oauth2Client.getToken(code);
    const tokens = response.tokens;
    
    console.log('Tokens received:', Object.keys(tokens));
    
    oauth2Client.setCredentials(tokens);

    // Store the authenticated client for this session
    oauth2Clients.set(sessionId, oauth2Client);

    // Store tokens in database for persistence
    await query(`
      INSERT INTO user_integrations (id, user_id, service, access_token, refresh_token, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, service) 
      DO UPDATE SET 
        access_token = $4, 
        refresh_token = $5, 
        expires_at = $6,
        updated_at = NOW()
    `, [
      randomUUID(),
      sessionId,
      'google',
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    ]);

    console.log('=== GOOGLE OAUTH CALLBACK SUCCESS ===');
    return { success: true, tokens };
  } catch (error) {
    console.error('=== GOOGLE OAUTH ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    
    if (error.message.includes('invalid_grant')) {
      return { 
        success: false, 
        error: 'Authorization code expired or already used. Please try connecting again.' 
      };
    }
    
    return { success: false, error: error.message };
  }
}

export async function createCalendarEvent(sessionId, taskTitle, deadline, description = '', reminderMinutes = 15) {
  const auth = await getGoogleAuth(sessionId);
  if (!auth) {
    throw new Error('Google Calendar not connected');
  }

  const calendar = google.calendar({ version: 'v3', auth });

  const event = {
    summary: `Task Reminder: ${taskTitle}`,
    description: description || `Reminder for task: ${taskTitle}`,
    start: {
      dateTime: deadline,
      timeZone: 'UTC'
    },
    end: {
      dateTime: new Date(new Date(deadline).getTime() + 30 * 60000).toISOString(), // 30 minutes later
      timeZone: 'UTC'
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: reminderMinutes }, // Custom reminder time
        { method: 'popup', minutes: 5 },  // 5 minutes before
        { method: 'popup', minutes: 0 }   // At deadline
      ]
    }
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });

    console.log('Calendar event created:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    throw error;
  }
}

export async function createGoogleTask(sessionId, taskTitle, deadline, notes = '') {
  const auth = await getGoogleAuth(sessionId);
  if (!auth) {
    throw new Error('Google Tasks not connected');
  }

  const tasks = google.tasks({ version: 'v1', auth });

  const task = {
    title: taskTitle,
    notes: notes || `Created from accountability system`,
    due: deadline
  };

  try {
    const response = await tasks.tasks.insert({
      tasklist: '@default',
      requestBody: task
    });

    console.log('Google Task created:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('Failed to create Google Task:', error);
    throw error;
  }
}

export async function createTaskReminders(sessionId, tasks) {
  const results = {
    calendar: [],
    tasks: [],
    errors: []
  };

  // Handle both single task object and array of tasks
  const taskList = Array.isArray(tasks) ? tasks : [tasks];

  for (const task of taskList) {
    const { title, reminder_minutes, due_date, type, description = '' } = task;
    
    try {
      // Create calendar event with reminders
      const calendarResult = await createCalendarEvent(sessionId, title, due_date, description, reminder_minutes);
      results.calendar.push(calendarResult);
    } catch (error) {
      results.errors.push(`Calendar for "${title}": ${error.message}`);
    }

    try {
      // Create Google Task
      const taskResult = await createGoogleTask(sessionId, title, due_date, description);
      results.tasks.push(taskResult);
    } catch (error) {
      results.errors.push(`Tasks for "${title}": ${error.message}`);
    }
  }

  return results;
}

async function getGoogleAuth(sessionId) {
  // Check if we have an active client in memory
  if (oauth2Clients.has(sessionId)) {
    return oauth2Clients.get(sessionId);
  }

  // Try to load from database
  try {
    const { rows } = await query(`
      SELECT access_token, refresh_token, expires_at 
      FROM user_integrations 
      WHERE user_id = $1 AND service = 'google'
    `, [sessionId]);

    if (rows.length === 0) {
      return null;
    }

    const { access_token, refresh_token, expires_at } = rows[0];

    // Check if token is expired
    if (expires_at && new Date(expires_at) < new Date()) {
      // TODO: Implement token refresh
      console.log('Google token expired, need refresh');
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token,
      refresh_token
    });

    // Store in memory for future use
    oauth2Clients.set(sessionId, oauth2Client);

    return oauth2Client;
  } catch (error) {
    console.error('Error loading Google auth:', error);
    return null;
  }
}

export async function syncTasksWithGoogle(sessionId, tasks) {
  const auth = await getGoogleAuth(sessionId);
  if (!auth) {
    throw new Error('Google not connected');
  }

  const results = {
    synced: [],
    errors: []
  };

  for (const task of tasks) {
    try {
      if (task.deadline) {
        const result = await createTaskReminders(sessionId, task.title, task.deadline, task.description);
        results.synced.push({
          taskId: task.id,
          calendarEvent: result.calendar?.id,
          googleTask: result.tasks?.id
        });
      }
    } catch (error) {
      results.errors.push({
        taskId: task.id,
        error: error.message
      });
    }
  }

  return results;
}

// Initialize database table for integrations
export async function initializeIntegrationsDB() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS user_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        service VARCHAR(50) NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, service)
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_integrations_user_service ON user_integrations(user_id, service);
    `);
    
    console.log('Integrations database initialized');
  } catch (error) {
    console.error('Failed to initialize integrations DB:', error);
  }
}
