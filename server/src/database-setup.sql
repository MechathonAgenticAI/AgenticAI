-- Reminders table for smart assistant
CREATE TABLE IF NOT EXISTS reminders (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  reminder_time TIME NOT NULL,
  reminder_date DATE NOT NULL,
  message TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_date (user_id, reminder_date),
  INDEX idx_reminder_datetime (reminder_date, reminder_time)
);

-- Add phone_sync column to tasks table for Google Calendar sync
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS phone_sync BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS google_calendar_id VARCHAR(255);
