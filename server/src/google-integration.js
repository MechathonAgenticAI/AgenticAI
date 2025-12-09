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

  const startTime = new Date(deadline);
  const endTime = new Date(startTime.getTime() + 30 * 60000); // 30 minutes later

  const event = {
    summary: `Task Reminder: ${taskTitle}`,
    description: description || `Reminder for task: ${taskTitle}`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'UTC'
    },
    end: {
      dateTime: endTime.toISOString(),
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

  // Convert deadline to RFC3339 format (YYYY-MM-DDTHH:MM:SSZ)
  const dueDate = new Date(deadline).toISOString();

  const task = {
    title: taskTitle,
    notes: notes || `Created from accountability system`,
    due: dueDate
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
      console.log('Google token expired, attempting refresh...');
      
      if (!refresh_token) {
        console.log('No refresh token available, user needs to re-authenticate');
        return null;
      }
      
      try {
        // Create OAuth2 client for refresh
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        
        oauth2Client.setCredentials({ refresh_token });
        
        // Refresh the token
        const { credentials } = await oauth2Client.refreshAccessToken();
        const newAccessToken = credentials.access_token;
        const newExpiryDate = credentials.expiry_date;
        
        console.log('Token refreshed successfully');
        
        // Update database with new token
        await query(`
          UPDATE user_integrations 
          SET access_token = $1, expires_at = $2, updated_at = NOW()
          WHERE user_id = $3 AND service = 'google'
        `, [newAccessToken, newExpiryDate ? new Date(newExpiryDate).toISOString() : null, sessionId]);
        
        // Set the new credentials
        oauth2Client.setCredentials(credentials);
        
        // Store in memory for future use
        oauth2Clients.set(sessionId, oauth2Client);
        
        return oauth2Client;
      } catch (refreshError) {
        console.error('Failed to refresh Google token:', refreshError.message);
        
        // If refresh fails, remove the stored tokens and require re-authentication
        await query(`
          DELETE FROM user_integrations 
          WHERE user_id = $1 AND service = 'google'
        `, [sessionId]);
        
        return null;
      }
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
    console.error('Error loading Google auth (table might not exist):', error);
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
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        service TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_integrations_user_service ON user_integrations(user_id, service);
    `);
    
    console.log('Integrations database initialized');
  } catch (error) {
    console.error('Failed to initialize integrations DB:', error);
  }
}

export { getGoogleAuth };

// Get all events from Google Calendar
export async function getGoogleCalendarEvents(sessionId, filters = {}) {
  const auth = await getGoogleAuth(sessionId);
  if (!auth) {
    throw new Error('Google Calendar not connected');
  }

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    // Build time range for query
    const now = new Date();
    let timeMin, timeMax;

    if (filters.startDate && filters.endDate) {
      timeMin = new Date(filters.startDate).toISOString();
      timeMax = new Date(filters.endDate + 'T23:59:59').toISOString();
    } else if (filters.date) {
      // Handle specific date
      const targetDate = new Date(filters.date);
      timeMin = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).toISOString();
      timeMax = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59).toISOString();
    } else {
      // Default to current month
      timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
    }

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items || [];
    return events.map(event => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      reminders: event.reminders
    }));
  } catch (error) {
    console.error('Failed to fetch Google Calendar events:', error);
    throw error;
  }
}

// Delete multiple calendar events
export async function bulkDeleteCalendarEvents(sessionId, eventIds) {
  const auth = await getGoogleAuth(sessionId);
  if (!auth) {
    throw new Error('Google Calendar not connected');
  }

  const calendar = google.calendar({ version: 'v3', auth });
  const results = { deleted: [], failed: [] };

  for (const eventId of eventIds) {
    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId
      });
      results.deleted.push(eventId);
    } catch (error) {
      console.error(`Failed to delete event ${eventId}:`, error);
      results.failed.push({ eventId, error: error.message });
    }
  }

  return results;
}

// Delete multiple Google Tasks
export async function bulkDeleteGoogleTasks(sessionId, taskIds) {
  const auth = await getGoogleAuth(sessionId);
  if (!auth) {
    throw new Error('Google Tasks not connected');
  }

  const tasks = google.tasks({ version: 'v1', auth });
  const results = { deleted: [], failed: [] };

  for (const taskId of taskIds) {
    try {
      await tasks.tasks.delete({
        tasklist: '@default',
        task: taskId
      });
      results.deleted.push(taskId);
    } catch (error) {
      console.error(`Failed to delete task ${taskId}:`, error);
      results.failed.push({ taskId, error: error.message });
    }
  }

  return results;
}

// Get all Google Tasks
export async function getGoogleTasks(sessionId, filters = {}) {
  const auth = await getGoogleAuth(sessionId);
  if (!auth) {
    throw new Error('Google Tasks not connected');
  }

  const tasks = google.tasks({ version: 'v1', auth });

  try {
    const response = await tasks.tasks.list({
      tasklist: '@default',
      showCompleted: false,
      showHidden: false,
      dueMin: filters.startDate ? new Date(filters.startDate).toISOString() : undefined,
      dueMax: filters.endDate ? new Date(filters.endDate + 'T23:59:59').toISOString() : undefined
    });

    const taskList = response.data.items || [];
    return taskList.map(task => ({
      id: task.id,
      title: task.title,
      notes: task.notes,
      due: task.due,
      completed: task.completed,
      updated: task.updated
    }));
  } catch (error) {
    console.error('Failed to fetch Google Tasks:', error);
    throw error;
  }
}
export async function bulkUpdateCalendarEvents(sessionId, updates) {
  const auth = await getGoogleAuth(sessionId);
  if (!auth) {
    throw new Error('Google Calendar not connected');
  }

  const calendar = google.calendar({ version: 'v3', auth });
  const results = { updated: [], failed: [] };

  for (const update of updates) {
    try {
      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: update.eventId,
        requestBody: update.eventData
      });
      results.updated.push(response.data);
    } catch (error) {
      console.error(`Failed to update event ${update.eventId}:`, error);
      results.failed.push({ eventId: update.eventId, error: error.message });
    }
  }

  return results;
}
