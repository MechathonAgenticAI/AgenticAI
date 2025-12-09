import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Mic, MicOff, Send, Bell, Calendar, Trash2, ArrowRight, Waves, Sparkles, Loader2 } from 'lucide-react';

const SmartAssistant = () => {
  const [command, setCommand] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState([]);
  const [suggestions] = useState([
    "Delete all reminders for Thursday",
    "Shift my study tasks to Sunday",
    "Show me reminders from 1pm to 3pm on Thursday",
    "Delete all work meetings this week",
    "Move all exercise tasks to 6pm",
    "Cancel my study sessions for tomorrow",
    "List all reminders for this week",
    "Shift my work tasks 2 days ahead",
    "Update all reminders to 9am",
    "Delete reminders from Monday to Friday"
  ]);
  
  const recognition = useRef(null);

  // Initialize speech recognition
  React.useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = false;
      recognition.current.interimResults = true;
      recognition.current.lang = 'en-US';

      recognition.current.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setCommand(transcript);
      };

      recognition.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (!recognition.current) {
      alert('Speech recognition not supported in your browser');
      return;
    }

    if (isListening) {
      recognition.current.stop();
      setIsListening(false);
    } else {
      recognition.current.start();
      setIsListening(true);
      setCommand('');
    }
  };

  const processCommand = async () => {
    if (!command.trim()) return;

    setIsProcessing(true);
    const sessionId = localStorage.getItem('agent_session_id') || 'anonymous';

    try {
      const response = await fetch('http://localhost:4000/api/smart-assistant/process-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId
        },
        body: JSON.stringify({
          command: command.trim(),
          sessionId
        })
      });

      const data = await response.json();

      if (data.success) {
        const newEntry = {
          id: Date.now(),
          command: command.trim(),
          result: data.result,
          timestamp: new Date().toLocaleTimeString(),
          type: data.result.type
        };
        
        setHistory(prev => [newEntry, ...prev]);
        setCommand('');
      } else {
        setHistory(prev => [{
          id: Date.now(),
          command: command.trim(),
          result: { message: data.error, type: 'error' },
          timestamp: new Date().toLocaleTimeString(),
          type: 'error'
        }, ...prev]);
      }
    } catch (error) {
      setHistory(prev => [{
        id: Date.now(),
        command: command.trim(),
        result: { message: 'Network error: ' + error.message, type: 'error' },
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }, ...prev]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      processCommand();
    }
  };

  const useSuggestion = (suggestion) => {
    setCommand(suggestion);
  };

  const getIconForType = (type) => {
    switch (type) {
      case 'reminder_created':
        return <Bell className="w-4 h-4 text-green-500" />;
      case 'reminders_deleted':
        return <Trash2 className="w-4 h-4 text-red-500" />;
      case 'tasks_cancelled':
        return <Calendar className="w-4 h-4 text-orange-500" />;
      case 'tasks_shifted':
        return <ArrowRight className="w-4 h-4 text-blue-500" />;
      case 'needs_info':
        return <Send className="w-4 h-4 text-yellow-500" />;
      case 'events_listed':
        return <Calendar className="w-4 h-4 text-purple-500" />;
      default:
        return <Send className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="relative min-h-screen bg-[#05060a]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(76,110,255,0.18),_transparent_52%)]"></div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(214,81,255,0.14),_transparent_58%)]"></div>

      <header className="relative sticky top-0 z-20 border-b border-white/10 bg-[#05060a]/75 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-white/70">
              <Sparkles size={14} /> Intelligent Agent Console
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Smart Assistant
            </h1>
            <p className="max-w-xl text-sm text-white/60">
              Interact with your AI copilot using natural language or voice. The assistant can create reminders, shift schedules, and keep your world in sync.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white transition-colors ${
              isProcessing ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-white/70'
            }`}>
              <div className={`h-2 w-2 rounded-full ${isProcessing ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'}`}></div>
              {isProcessing ? 'Processing command…' : 'Idle'}
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-white/10"
            >
              <Waves size={16} /> Dashboard
            </Link>
            <Link
              to="/schedule"
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-200 transition-all hover:-translate-y-0.5 hover:bg-indigo-500/25"
            >
              Schedule Parser
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-4xl px-6 pb-16 pt-10">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_40px_80px_-40px_rgba(15,23,42,0.9)] backdrop-blur-2xl sm:p-8">

        {/* Command Input */}
        <div className="mb-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Command the assistant</h2>
              <p className="text-sm text-white/50">Type or dictate what you need — the agent will translate it into structured actions.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.22em] text-white/60">
              <Sparkles size={14} /> AI ready
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type or speak a command..."
                className="h-28 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-5 py-4 pr-14 text-base text-white shadow-inner shadow-black/40 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                rows={3}
                disabled={isProcessing}
              />
              <button
                onClick={toggleListening}
                className={`absolute right-3 bottom-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 transition-all ${
                  isListening 
                    ? 'bg-red-500/80 text-white shadow-[0_0_25px_rgba(248,113,113,0.4)]' 
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
                disabled={isProcessing}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
            
            <button
              onClick={processCommand}
              disabled={!command.trim() || isProcessing}
              className="relative inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/40 via-sky-500/40 to-blue-500/40 px-8 py-4 text-base font-medium text-white shadow-[0_20px_45px_-20px_rgba(14,165,233,0.8)] transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-[0_30px_70px_-25px_rgba(14,165,233,0.9)] disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/5 disabled:text-white/40"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isProcessing ? 'Processing…' : 'Send command'}
            </button>
          </div>

          {/* Suggestions */}
          <div className="mt-4">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.3em] text-white/40">Quick starts</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => useSuggestion(suggestion)}
                  className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 backdrop-blur hover:border-emerald-400/50 hover:bg-emerald-500/10 hover:text-emerald-200"
                >
                  <Sparkles className="h-3 w-3 text-emerald-300/70 opacity-0 transition-opacity group-hover:opacity-100" />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Command History */}
        {history.length > 0 && (
          <div className="mt-10 border-t border-white/10 pt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Recent activity</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/50">
                {history.length} entries
              </span>
            </div>
            <div className="mt-6 space-y-4">
              {history.map((entry) => (
                <div key={entry.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/4 p-5 transition-all duration-200 hover:border-emerald-400/30 hover:bg-emerald-500/5">
                  <div className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-gradient-to-b from-emerald-400/70 via-sky-400/60 to-blue-500/60"></div>
                  <div className="pl-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                        {getIconForType(entry.type)}
                        {entry.type.replace('_', ' ')}
                      </div>
                      <span className="text-xs text-white/40">{entry.timestamp}</span>
                    </div>
                    <p className="mt-3 text-sm text-white/70">You said:</p>
                    <p className="mb-4 mt-1 text-lg font-medium text-white/90">“{entry.command}”</p>
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm backdrop-blur ${
                        entry.type === 'error'
                          ? 'border-red-500/30 bg-red-500/10 text-red-200'
                          : entry.type === 'needs_info'
                          ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                          : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                      }`}
                    >
                      {entry.result.message}

                      {entry.type === 'needs_info' && entry.result.examples && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Example responses</p>
                          <div className="flex flex-wrap gap-2">
                            {entry.result.examples.map((example, index) => (
                              <button
                                key={index}
                                onClick={() => setCommand(example)}
                                className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-100 transition-colors hover:bg-amber-500/20"
                              >
                                “{example}”
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {entry.type === 'events_listed' && entry.result.events && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Calendar results</p>
                          <div className="grid gap-2 md:grid-cols-2">
                            {entry.result.events.map((event, index) => (
                              <div
                                key={index}
                                className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-100"
                              >
                                <p className="font-medium text-white/80">{event.summary}</p>
                                <p className="text-[11px] text-white/50">
                                  {new Date(event.start?.dateTime || event.start?.date).toLocaleString()}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
};

export default SmartAssistant;
