import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Clock, Calendar, Settings, AlertCircle, FileText, Download, Share2, Trash2, Eye, EyeOff, ChevronRight, Sparkles, Brain, Zap, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SchedulePage() {
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedSchedules, setSavedSchedules] = useState([]);
  
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
          'X-Session-ID': localStorage.getItem('agent_session_id') || 'anonymous'
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
    console.log('=== UPLOAD DEBUG ===');
    console.log('selectedFile:', selectedFile);
    console.log('previewData:', previewData);
    
    if (!selectedFile && !previewData) {
      setError('Please select an image or use previewed data');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      let response;
      
      // If we have previewed data, send it directly (skip image upload)
      if (previewData) {
        console.log('Uploading with previewed data, skipping AI analysis');
        console.log('Preview data length:', JSON.stringify(previewData).length);
        response = await fetch('http://localhost:4000/api/schedule/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': localStorage.getItem('agent_session_id') || 'anonymous'
          },
          body: JSON.stringify({
            scheduleData: JSON.stringify(previewData),
            startDate,
            customPrompt,
            reminderMinutes
          })
        });
      } else {
        console.log('Uploading with image (no preview data)');
        // Original flow: upload image
        const formData = new FormData();
        formData.append('scheduleImage', selectedFile);
        formData.append('customPrompt', customPrompt);
        formData.append('reminderMinutes', reminderMinutes);
        formData.append('startDate', startDate);

        response = await fetch('http://localhost:4000/api/schedule/upload', {
          method: 'POST',
          body: formData,
          headers: {
            'X-Session-ID': localStorage.getItem('agent_session_id') || 'anonymous'
          }
        });
      }

      const data = await response.json();

      if (data.success) {
        setResults(data.results);
        // Clear form
        setSelectedFile(null);
        setPreview(null);
        setCustomPrompt('');
        setReminderMinutes('10');
        setStartDate('');
        setPreviewData(null);
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
    <div className="relative min-h-screen overflow-hidden bg-[#05060a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.2),_transparent_55%)]"></div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(236,72,153,0.18),_transparent_60%)]"></div>

      <header className="relative z-20 border-b border-white/10 bg-black/60 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white">
              <ChevronRight className="h-4 w-4 rotate-180" /> Back to dashboard
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
              Visual Parser
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white lg:text-5xl">
              Transform any schedule into structured, agent-ready plans
            </h1>
            <p className="max-w-2xl text-base text-white/60">
              Upload a timetable screenshot, tweak the extraction parameters, and let the agent create synced reminders across your workspace.
            </p>
          </div>

          <div className="grid w-full max-w-xs gap-2 text-xs uppercase tracking-[0.35em] text-white/50">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-center">AI Vision</span>
            <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-center">Pg Vector Memory</span>
            <span className="rounded-full border border-pink-400/30 bg-pink-500/10 px-4 py-2 text-center">Calendar Sync</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <div className="space-y-8">
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_30px_90px_-50px_rgba(99,102,241,0.6)] backdrop-blur-2xl sm:p-8">
              <div className="pointer-events-none absolute -left-16 -top-16 h-36 w-36 rounded-full bg-purple-500/20 blur-3xl"></div>
              <div className="relative flex items-center gap-3">
                <div className="rounded-2xl bg-white/10 p-3 text-purple-300">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white">Upload your schedule image</h2>
                  <p className="text-sm text-white/60">PNG or JPG up to 10 MB. High contrast images produce the best extraction.</p>
                </div>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/20 p-12 text-center transition hover:border-purple-400/40 hover:bg-purple-500/10"
              >
                {preview ? (
                  <div className="space-y-4">
                    <img src={preview} alt="Schedule preview" className="mx-auto max-h-96 max-w-full rounded-2xl border border-white/10 shadow-[0_20px_50px_-30px_rgba(99,102,241,0.7)]" />
                    <p className="text-sm text-white/60">Click to replace image</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <Upload className="mx-auto h-16 w-16 text-purple-300" />
                    <div className="space-y-2">
                      <p className="text-lg font-medium text-white">Drop your timetable or choose a file</p>
                      <p className="text-sm text-white/50">Supports weekly planners, class schedules, or meeting grids.</p>
                    </div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            </section>

            <section className="space-y-8">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_25px_80px_-55px_rgba(236,72,153,0.55)] backdrop-blur-2xl sm:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-white">Extraction Parameters</h3>
                    <p className="text-sm text-white/60">Fine-tune how the agent interprets times, columns, and reminder offsets.</p>
                  </div>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-sm text-purple-300 transition hover:text-purple-200"
                  >
                    {showAdvanced ? 'Hide advanced' : 'Show advanced'}
                  </button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-white/70">
                      <Clock className="h-4 w-4" /> Reminder offset
                    </span>
                    <select
                      value={reminderMinutes}
                      onChange={(e) => setReminderMinutes(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                    >
                      <option value="5">5 minutes before</option>
                      <option value="10">10 minutes before</option>
                      <option value="15">15 minutes before</option>
                      <option value="30">30 minutes before</option>
                      <option value="60">1 hour before</option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-white/70">
                      <Calendar className="h-4 w-4" /> Week anchor date
                    </span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                    />
                  </label>
                </div>

                {showAdvanced && (
                  <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/30 p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">Advanced toggles</p>
                    <label className="flex items-center gap-3 text-sm text-white/60">
                      <input type="checkbox" className="rounded" /> Auto-detect schedule structure
                    </label>
                    <label className="flex items-center gap-3 text-sm text-white/60">
                      <input type="checkbox" className="rounded" /> Capture breaks & empty slots
                    </label>
                    <label className="flex items-center gap-3 text-sm text-white/60">
                      <input type="checkbox" className="rounded" defaultChecked /> Create Google events when possible
                    </label>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_25px_70px_-55px_rgba(59,130,246,0.55)] backdrop-blur-2xl sm:p-7">
                <h3 className="text-xl font-semibold text-white">Custom prompt</h3>
                <p className="text-sm text-white/60">Guide the agent with extra context about instructors, locations, or columns.</p>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={'e.g. "This is my university timetable. Extract room numbers and tag labs as high-priority reminders."'}
                  className="mt-4 h-32 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 shadow-inner shadow-black/30 focus:outline-none focus:ring-2 focus:ring-purple-400/40"
                />
              </div>
            </section>
          </div>

          <aside className="space-y-8">
            {examples.length > 0 && (
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_25px_70px_-55px_rgba(94,234,212,0.45)] backdrop-blur-2xl sm:p-7">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-teal-300" /> Quick templates
                </h3>
                <p className="mt-2 text-sm text-white/60">Use a ready-made preset to see how the parser behaves.</p>
                <div className="mt-5 space-y-3">
                  {examples.map((example, index) => (
                    <button
                      key={index}
                      onClick={() => handleExampleSelect(example)}
                      className="group w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left transition hover:border-purple-300/40 hover:bg-purple-500/10"
                    >
                      <p className="text-sm font-medium text-white group-hover:text-white">{example.title}</p>
                      <p className="text-xs text-white/50">{example.description}</p>
                      <p className="text-xs text-purple-300">{example.reminderMinutes} minute reminders</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_25px_70px_-55px_rgba(244,114,182,0.45)] backdrop-blur-2xl sm:p-7">
              <h3 className="text-lg font-semibold text-white">Actions</h3>

              {error && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-200">
                  <AlertCircle className="mr-2 inline h-4 w-4" /> {error}
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={handlePreview}
                  disabled={!selectedFile || isProcessing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Eye className="h-4 w-4" /> {isProcessing ? 'Analyzing…' : 'Preview extraction'}
                </button>
                <button
                  onClick={handleUpload}
                  disabled={(!selectedFile && !previewData) || isProcessing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-fuchsia-400/40 bg-gradient-to-r from-fuchsia-500/55 via-purple-500/55 to-blue-500/55 px-5 py-3 text-sm font-medium text-white shadow-[0_15px_40px_-25px_rgba(236,72,153,0.75)] transition hover:-translate-y-1 hover:border-fuchsia-300/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Zap className="h-4 w-4" /> {isProcessing ? 'Processing…' : 'Create all tasks'}
                </button>
              </div>
            </section>

            {results && (
              <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/15 p-6 shadow-[0_25px_70px_-55px_rgba(16,185,129,0.45)] backdrop-blur-2xl sm:p-7">
                <h3 className="text-lg font-semibold text-emerald-200 flex items-center gap-2">
                  <ChevronRight className="h-5 w-5" /> AI execution summary
                </h3>
                <p className="mt-3 text-sm text-emerald-100">
                  {results.summary.successful} of {results.summary.total} tasks created.
                </p>
                {results.errors.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-xs text-amber-100">
                    <p className="font-semibold uppercase tracking-[0.3em] text-amber-200">Warnings</p>
                    <div className="mt-2 space-y-1">
                      {results.errors.map((issue, index) => (
                        <p key={index}>• {issue.activity}: {issue.error}</p>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>
      </main>

      {showPreview && previewData && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6 pb-16 pt-12 backdrop-blur">
          <div className="relative max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-white/15 bg-black/50 shadow-[0_25px_70px_-55px_rgba(79,70,229,0.7)] backdrop-blur-2xl">
            <div className="border-b border-white/10 px-6 py-5">
              <h3 className="text-xl font-semibold text-white">Extraction preview</h3>
              <p className="text-xs text-white/50">Review the generated activities before creating tasks.</p>
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-6 py-5 space-y-3">
              {previewData.activities.map((activity, index) => (
                <div key={index} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                  <div className="font-medium text-white">{activity.title}</div>
                  <div className="text-xs text-white/50">
                    {activity.day} • {activity.start_time} - {activity.end_time}
                    {activity.location && ` • ${activity.location}`}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 border-t border-white/10 px-6 py-5">
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowPreview(false);
                  handleUpload();
                }}
                className="flex-1 rounded-2xl border border-fuchsia-400/40 bg-gradient-to-r from-fuchsia-500/55 via-purple-500/55 to-blue-500/55 px-4 py-3 text-sm font-medium text-white shadow-[0_15px_40px_-25px_rgba(236,72,153,0.75)] transition hover:-translate-y-0.5"
              >
                Create these tasks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
