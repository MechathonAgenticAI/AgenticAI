import { query } from './db.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createTaskReminders } from './google-integration.js';

const AccountabilityTask = z.object({
  taskId: z.string().uuid(),
  userId: z.string(),
  deadline: z.string().datetime(),
  consequence: z.string(),
  consequenceType: z.enum(['sms', 'whatsapp', 'email']),
  recipient: z.string(),
  isActive: z.boolean().default(true),
  executed: z.boolean().default(false)
});

export async function createAccountabilityTask(taskId, userId, deadline, consequence, consequenceType, recipient, createReminders = true) {
  const id = uuidv4();
  const { rows } = await query(`
    INSERT INTO accountability_tasks (id, task_id, user_id, deadline, consequence, consequence_type, recipient, is_active, executed)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [id, taskId, userId, deadline, consequence, consequenceType, recipient, true, false]);
  
  const accountabilityTask = rows[0];

  // Create Google reminders if requested
  if (createReminders) {
    try {
      // Get task details for Google reminder
      const { rows: taskRows } = await query('SELECT title, description FROM tasks WHERE id = $1', [taskId]);
      if (taskRows.length > 0) {
        const task = taskRows[0];
        const reminderResults = await createTaskReminders(userId, task.title, deadline, task.description);
        
        console.log('Google reminders created:', reminderResults);
        
        // Update accountability task with reminder info
        await query(`
          UPDATE accountability_tasks 
          SET calendar_event_id = $1, google_task_id = $2
          WHERE id = $3
        `, [
          reminderResults.calendar?.id || null,
          reminderResults.tasks?.id || null,
          id
        ]);
        
        accountabilityTask.calendar_event_id = reminderResults.calendar?.id;
        accountabilityTask.google_task_id = reminderResults.tasks?.id;
        accountabilityTask.reminder_errors = reminderResults.errors;
      }
    } catch (error) {
      console.error('Failed to create Google reminders:', error);
      accountabilityTask.reminder_errors = [error.message];
    }
  }
  
  return accountabilityTask;
}

export async function getAccountabilityTasks(userId) {
  const { rows } = await query(`
    SELECT at.*, t.title as task_title, t.status as task_status
    FROM accountability_tasks at
    JOIN tasks t ON at.task_id = t.id
    WHERE at.user_id = $1 AND at.is_active = true AND at.executed = false
    ORDER BY at.deadline ASC
  `, [userId]);
  
  return rows;
}

export async function checkOverdueTasks() {
  console.log('=== CHECKING OVERDUE ACCOUNTABILITY TASKS ===');
  
  const { rows } = await query(`
    SELECT at.*, t.title as task_title, t.status as task_status, u.phone, u.email
    FROM accountability_tasks at
    JOIN tasks t ON at.task_id = t.id
    LEFT JOIN users u ON at.user_id = u.id
    WHERE at.deadline <= NOW() 
    AND at.is_active = true 
    AND at.executed = false
    AND t.status != 'done'
  `);
  
  console.log(`Found ${rows.length} overdue accountability tasks`);
  
  for (const accountabilityTask of rows) {
    console.log(`Executing consequence for task: ${accountabilityTask.task_title}`);
    await executeConsequence(accountabilityTask);
    
    // Mark as executed
    await query(`
      UPDATE accountability_tasks 
      SET executed = true, executed_at = NOW()
      WHERE id = $1
    `, [accountabilityTask.id]);
  }
  
  return rows;
}

async function executeConsequence(accountabilityTask) {
  const { consequence, consequenceType, recipient, task_title, user } = accountabilityTask;
  
  try {
    // Resolve recipient to actual contact info
    const resolvedRecipient = await resolveRecipient(recipient);
    
    switch (consequenceType) {
      case 'sms':
        await sendSMS(resolvedRecipient, consequence);
        break;
      case 'whatsapp':
        await sendWhatsApp(resolvedRecipient, consequence);
        break;
      case 'email':
        await sendEmail(resolvedRecipient, `Task Overdue: ${task_title}`, consequence);
        break;
      default:
        console.log(`Unknown consequence type: ${consequenceType}`);
    }
    
    console.log(`Successfully executed ${consequenceType} consequence to ${resolvedRecipient}`);
  } catch (error) {
    console.error(`Failed to execute consequence:`, error);
  }
}

// Resolve recipient names to actual contact information
async function resolveRecipient(recipient) {
  // For now, return the recipient as-is (could be enhanced with user contacts)
  // In a real app, you'd have a contacts database or integration
  
  // If it's already a phone number or email, return as-is
  if (recipient.includes('@') || recipient.includes('+')) {
    return recipient;
  }
  
  // Map common relationship names to contacts (example - you'd customize this)
  const contactMap = {
    'wife': process.env.CONTACT_WIFE_PHONE || '+1234567890',
    'husband': process.env.CONTACT_HUSBAND_PHONE || '+1234567890',
    'boss': process.env.CONTACT_BOSS_EMAIL || 'boss@company.com',
    'mom': process.env.CONTACT_MOM_PHONE || '+1234567890',
    'dad': process.env.CONTACT_DAD_PHONE || '+1234567890',
    'friend': process.env.CONTACT_FRIEND_PHONE || '+1234567890',
    'team': process.env.CONTACT_TEAM_EMAIL || 'team@company.com',
    'public': process.env.CONTACT_PUBLIC_PHONE || '+1234567890' // Could be a public shaming number
  };
  
  const resolved = contactMap[recipient.toLowerCase()];
  if (resolved) {
    console.log(`Resolved recipient "${recipient}" to "${resolved}"`);
    return resolved;
  }
  
  // If not found, return as-is and let the service handle it
  console.log(`Could not resolve recipient "${recipient}", using as-is`);
  return recipient;
}

// WhatsApp implementation using Twilio
async function sendWhatsApp(to, message) {
  console.log(`WhatsApp to ${to}: ${message}`);
  
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    // Format phone number for WhatsApp
    const formattedNumber = to.startsWith('+') ? to : `+${to}`;
    
    const whatsappMessage = await client.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, // Your Twilio WhatsApp-enabled number
      to: `whatsapp:${formattedNumber}`
    });
    
    console.log('WhatsApp message sent successfully:', whatsappMessage.sid);
    return whatsappMessage;
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
    throw error;
  }
}

// SMS implementation using Twilio
async function sendSMS(to, message) {
  console.log(`SMS to ${to}: ${message}`);
  
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    // Format phone number
    const formattedNumber = to.startsWith('+') ? to : `+${to}`;
    
    const smsMessage = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedNumber
    });
    
    console.log('SMS sent successfully:', smsMessage.sid);
    return smsMessage;
  } catch (error) {
    console.error('Failed to send SMS:', error);
    throw error;
  }
}

// Email implementation using Nodemailer
async function sendEmail(to, subject, message) {
  console.log(`Email to ${to}: ${subject} - ${message}`);
  
  try {
    const nodemailer = require('nodemailer');
    
    // Create transporter (using Gmail as example)
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: to,
      subject: subject,
      text: message,
      html: `<p>${message}</p>`
    };
    
    const emailResult = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', emailResult.messageId);
    return emailResult;
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

// Parse accountability prompts like "If I don't finish the 'Tax Filing' task by 6 PM, text my wife that I'm lazy."
export function parseAccountabilityPrompt(text) {
  const patterns = [
    /if\s+i\s+don't\s+finish\s+(?:the\s+)?['"`]([^'"`]+)['"`]\s+task\s+by\s+([^,]+),?\s*(.+)$/i,
    /when\s+i\s+don't\s+complete\s+(?:the\s+)?['"`]([^'"`]+)['"`]\s+by\s+([^,]+),?\s*(.+)$/i,
    /if\s+(?:the\s+)?['"`]([^'"`]+)['"`]\s+task\s+isn't\s+done\s+by\s+([^,]+),?\s*(.+)$/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const [, taskTitle, deadlineStr, consequence] = match;
      
      // Parse deadline
      const deadline = parseDeadline(deadlineStr.trim());
      if (!deadline) {
        throw new Error(`Could not parse deadline: ${deadlineStr}`);
      }
      
      // Parse consequence and recipient
      const { action, recipient } = parseConsequence(consequence.trim());
      
      return {
        taskTitle,
        deadline,
        consequence: consequence.trim(),
        action,
        recipient
      };
    }
  }
  
  return null;
}

function parseDeadline(deadlineStr) {
  const now = new Date();
  
  // Handle "6 PM", "6:30 PM", etc.
  const timeMatch = deadlineStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    const [, hours, minutes, period] = timeMatch;
    const hour = parseInt(hours);
    const minute = minutes ? parseInt(minutes) : 0;
    
    let hour24 = hour;
    if (period.toLowerCase() === 'pm' && hour !== 12) hour24 += 12;
    if (period.toLowerCase() === 'am' && hour === 12) hour24 = 0;
    
    const deadline = new Date();
    deadline.setHours(hour24, minute, 0, 0);
    
    // If deadline is in the past, set for tomorrow
    if (deadline <= now) {
      deadline.setDate(deadline.getDate() + 1);
    }
    
    return deadline.toISOString();
  }
  
  // Handle "in 2 hours", "in 30 minutes", etc.
  const relativeMatch = deadlineStr.match(/in\s+(\d+)\s+(hour|hours|minute|minutes)/i);
  if (relativeMatch) {
    const [, amount, unit] = relativeMatch;
    const multiplier = unit.startsWith('hour') ? 60 : 1;
    const minutes = parseInt(amount) * multiplier;
    
    const deadline = new Date(now.getTime() + minutes * 60 * 1000);
    return deadline.toISOString();
  }
  
  return null;
}

function parseConsequence(consequence) {
  // SMS patterns
  const smsPatterns = [
    /text\s+(my\s+)?(\w+)\s+(that\s+)?(.+)/i,
    /sms\s+(my\s+)?(\w+)\s+(that\s+)?(.+)/i,
    /message\s+(my\s+)?(\w+)\s+(that\s+)?(.+)/i
  ];
  
  for (const pattern of smsPatterns) {
    const match = consequence.match(pattern);
    if (match) {
      const [, , recipient, , message] = match;
      return {
        action: 'sms',
        recipient: recipient.toLowerCase(),
        fullMessage: message
      };
    }
  }
  
  // WhatsApp patterns
  const whatsappPatterns = [
    /whatsapp\s+(my\s+)?(\w+)\s+(that\s+)?(.+)/i,
    /send\s+whatsapp\s+to\s+(my\s+)?(\w+)\s+(that\s+)?(.+)/i
  ];
  
  for (const pattern of whatsappPatterns) {
    const match = consequence.match(pattern);
    if (match) {
      const [, , recipient, , message] = match;
      return {
        action: 'whatsapp',
        recipient: recipient.toLowerCase(),
        fullMessage: message
      };
    }
  }
  
  // Email patterns
  const emailPatterns = [
    /email\s+(my\s+)?(\w+)\s+(that\s+)?(.+)/i,
    /send\s+email\s+to\s+(my\s+)?(\w+)\s+(that\s+)?(.+)/i
  ];
  
  for (const pattern of emailPatterns) {
    const match = consequence.match(pattern);
    if (match) {
      const [, , recipient, , message] = match;
      return {
        action: 'email',
        recipient: recipient.toLowerCase(),
        fullMessage: message
      };
    }
  }
  
  // Default: treat as SMS
  return {
    action: 'sms',
    recipient: 'unknown',
    fullMessage: consequence
  };
}

export async function scheduleAccountabilityCheck() {
  // Check every minute for overdue tasks
  setInterval(async () => {
    await checkOverdueTasks();
  }, 60000);
  
  console.log('Accountability checker scheduled (every minute)');
}
