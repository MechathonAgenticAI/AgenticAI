import express from 'express';
import multer from 'multer';
import { parseScheduleImage, createScheduleTasks, validateScheduleData, buildCustomSchedulePrompt } from '../schedule-parser.js';

const router = express.Router();

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Upload and parse schedule image
router.post('/upload', upload.single('scheduleImage'), async (req, res, next) => {
  try {
    console.log('=== SCHEDULE UPLOAD REQUEST ===');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('File:', req.file ? req.file.originalname : 'No file');
    
    const { customPrompt, reminderMinutes, startDate, scheduleData: previewedData } = req.body;
    const sessionId = req.headers['x-session-id'] || 'anonymous';

    let scheduleData;

    // If previewed data is provided, use it directly (skip Cohere call)
    if (previewedData) {
      console.log('Using previewed schedule data, skipping AI analysis');
      try {
        scheduleData = JSON.parse(previewedData);
      } catch (parseError) {
        return res.status(400).json({ error: 'Invalid previewed schedule data format' });
      }
    } else {
      // Otherwise, parse the image (original flow)
      if (!req.file) {
        console.log('ERROR: No image file provided and no previewed data');
        return res.status(400).json({ error: 'No image file provided' });
      }

      console.log('Processing schedule image for session:', sessionId);

      // Convert image to base64
      const imageBase64 = req.file.buffer.toString('base64');
      console.log('Image converted to base64, size:', imageBase64.length);

      // Parse the schedule image
      scheduleData = await parseScheduleImage(
        imageBase64, 
        customPrompt || '', 
        parseInt(reminderMinutes) || 10
      );
    }

    // Validate the parsed data
    const validationErrors = validateScheduleData(scheduleData);
    if (validationErrors.length > 0) {
      console.log('Validation errors:', validationErrors);
      return res.status(400).json({ 
        error: 'Invalid schedule data', 
        details: validationErrors 
      });
    }

    // Create tasks from schedule
    const results = await createScheduleTasks(sessionId, scheduleData, startDate);

    console.log('Schedule processing completed successfully');
    res.json({
      success: true,
      scheduleData,
      results,
      message: `Successfully created ${results.summary.successful} tasks from your schedule`
    });

  } catch (error) {
    console.error('=== SCHEDULE UPLOAD ERROR ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process schedule image', 
      details: error.message 
    });
  }
});

// Preview schedule without creating tasks
router.post('/preview', upload.single('scheduleImage'), async (req, res, next) => {
  try {
    const { customPrompt, reminderMinutes } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Convert image to base64
    const imageBase64 = req.file.buffer.toString('base64');

    // Parse the schedule image
    const scheduleData = await parseScheduleImage(
      imageBase64, 
      customPrompt || '', 
      parseInt(reminderMinutes) || 10
    );

    // Validate the parsed data
    const validationErrors = validateScheduleData(scheduleData);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid schedule data', 
        details: validationErrors 
      });
    }

    res.json({
      success: true,
      scheduleData,
      message: `Preview: Found ${scheduleData.activities.length} activities in your schedule`
    });

  } catch (error) {
    console.error('Schedule preview error:', error);
    res.status(500).json({ 
      error: 'Failed to preview schedule image', 
      details: error.message 
    });
  }
});

// Get schedule parsing examples
router.get('/examples', (req, res) => {
  res.json({
    examples: [
      {
        title: "College Weekly Schedule",
        description: "For parsing college class schedules with times and rooms",
        prompt: "I have a college weekly schedule with classes, labs, and study periods. Please extract all activities with their times and locations.",
        reminderMinutes: 10
      },
      {
        title: "Office Weekly Schedule", 
        description: "For parsing office meeting schedules and work blocks",
        prompt: "This is my office weekly schedule with meetings, focus time, and breaks. Extract all activities and set 15-minute reminders.",
        reminderMinutes: 15
      },
      {
        title: "Personal Weekly Routine",
        description: "For parsing personal routines and appointments", 
        prompt: "My personal weekly routine includes gym, meals, appointments, and free time. Extract all while setting 5-minute reminders.",
        reminderMinutes: 5
      }
    ]
  });
});

export default router;
