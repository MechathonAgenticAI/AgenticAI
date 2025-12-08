import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Clock, Calendar, Settings, AlertCircle } from 'lucide-react';

export default function ScheduleParser({ sessionId, socket }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('10');
  const [startDate, setStartDate] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [examples, setExamples] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  
  const fileInputRef = useRef(null);

  // Load examples on mount
  React.useEffect(() => {
    fetch('http://localhost:4000/api/schedule/examples')
      .then(res => res.json())
      .then(data => setExamples(data.examples || []))
      .catch(err => console.error('Failed to load examples:', err));
  }, []);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setError('');
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setError('Please select an image file');
    }
  };

  const handleExampleSelect = (example) => {
    setCustomPrompt(example.prompt);
    setReminderMinutes(example.reminderMinutes.toString());
  };

  const handlePreview = async () => {
    if (!selectedFile) {
      setError('Please select an image first');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('scheduleImage', selectedFile);
      formData.append('customPrompt', customPrompt);
      formData.append('reminderMinutes', reminderMinutes);

      const response = await fetch('http://localhost:4000/api/schedule/preview', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Session-ID': sessionId
        }
      });

      const data = await response.json();

      if (data.success) {
        setPreviewData(data.scheduleData);
        setShowPreview(true);
      } else {
        setError(data.error || 'Failed to preview schedule');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select an image first');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('scheduleImage', selectedFile);
      formData.append('customPrompt', customPrompt);
      formData.append('reminderMinutes', reminderMinutes);
      formData.append('startDate', startDate);

      const response = await fetch('http://localhost:4000/api/schedule/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Session-ID': sessionId
        }
      });

      const data = await response.json();

      if (data.success) {
        setResults(data.results);
        // Clear form
        setSelectedFile(null);
        setPreview(null);
        setCustomPrompt('');
        setReminderMinutes('10');
        setStartDate('');
      } else {
        setError(data.error || 'Failed to process schedule');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
          <ImageIcon className="w-5 h-5 text-purple-400" />
        </div>
        <h2 className="text-xl font-semibold text-white">Visual Schedule Parser</h2>
      </div>

      {/* Upload Area */}
      <div className="mb-6">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400/50 transition-colors bg-white/5"
        >
          {preview ? (
            <div className="space-y-4">
              <img src={preview} alt="Schedule preview" className="max-w-full max-h-64 mx-auto rounded-lg" />
              <p className="text-sm text-white/60">Click to change image</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="w-12 h-12 text-purple-400 mx-auto" />
              <div>
                <p className="text-white font-medium">Upload Schedule Image</p>
                <p className="text-sm text-white/60">PNG, JPG up to 10MB</p>
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Examples */}
      {examples.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Quick Examples
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {examples.map((example, index) => (
              <button
                key={index}
                onClick={() => handleExampleSelect(example)}
                className="text-left p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors border border-white/10"
              >
                <p className="text-sm font-medium text-white">{example.title}</p>
                <p className="text-xs text-white/60">{example.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Prompt */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-white/80 mb-2">
          Custom Instructions (Optional)
        </label>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="E.g., 'This is my college schedule with labs and lectures. Extract room numbers and set 15-minute reminders.'"
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent resize-none"
          rows={3}
        />
      </div>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Reminder Time
          </label>
          <select
            value={reminderMinutes}
            onChange={(e) => setReminderMinutes(e.target.value)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent"
          >
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Week Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent"
          />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handlePreview}
          disabled={!selectedFile || isProcessing}
          className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Analyzing...' : 'Preview'}
        </button>
        <button
          onClick={handleUpload}
          disabled={!selectedFile || isProcessing}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Processing...' : 'Create Tasks'}
        </button>
      </div>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-lg">
          <h3 className="text-lg font-medium text-white mb-4">Schedule Preview</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {previewData.activities.map((activity, index) => (
              <div key={index} className="p-3 bg-white/5 rounded-lg">
                <p className="text-sm font-medium text-white">{activity.title}</p>
                <p className="text-xs text-white/60">
                  {activity.day} {activity.start_time} - {activity.end_time}
                  {activity.location && ` • ${activity.location}`}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setShowPreview(false)}
              className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white font-medium hover:bg-white/20 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowPreview(false);
                handleUpload();
              }}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-colors"
            >
              Create These Tasks
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <h3 className="text-lg font-medium text-green-400 mb-2">Tasks Created Successfully!</h3>
          <p className="text-sm text-green-300">
            {results.summary.successful} of {results.summary.total} tasks created
          </p>
          {results.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-yellow-400">Some tasks had errors:</p>
              {results.errors.map((error, index) => (
                <p key={index} className="text-xs text-yellow-300">
                  {error.activity}: {error.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
