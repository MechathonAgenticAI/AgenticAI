import React, { useState, useRef } from 'react';
import { Mic, MicOff, Send, Bell, Calendar, Trash2, ArrowRight } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-3xl"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-blue-900/20 via-transparent to-purple-900/20"></div>
      
      <header className="relative sticky top-0 z-10 backdrop-blur-xl bg-white/5 border-b border-white/10 shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">Smart Assistant</h1>
          <div className="flex items-center gap-4">
            <a 
              href="/" 
              className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 rounded-lg text-white font-medium hover:from-gray-600 hover:to-gray-700 transition-colors"
            >
              Back to Main
            </a>
            <p className="text-sm text-white/70 font-medium">Voice & Text Commands</p>
          </div>
        </div>
      </header>
      
      <main className="relative max-w-4xl mx-auto px-6 py-8">
        <div className="backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">

        {/* Command Input */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Voice or text commands for reminders and tasks</h2>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type or speak a command..."
                className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-400/50 focus:border-transparent backdrop-blur-sm resize-none"
                rows={2}
                disabled={isProcessing}
              />
              <button
                onClick={toggleListening}
                className={`absolute right-2 bottom-2 p-2 rounded-lg transition-colors backdrop-blur-sm ${
                  isListening 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-white/10 text-white/60 hover:bg-white/20 border border-white/20'
                }`}
                disabled={isProcessing}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
            
            <button
              onClick={processCommand}
              disabled={!command.trim() || isProcessing}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 disabled:bg-gray-500/30 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <Send className="w-4 h-4" />
              {isProcessing ? 'Processing...' : 'Send'}
            </button>
          </div>

          {/* Suggestions */}
          <div className="mt-4">
            <p className="text-sm text-white/70 mb-3">Try these commands:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => useSuggestion(suggestion)}
                  className="px-3 py-1 bg-white/10 border border-white/20 text-white/80 rounded-full text-sm hover:bg-white/20 transition-all duration-200 backdrop-blur-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Command History */}
        {history.length > 0 && (
          <div className="border-t border-white/20 pt-6">
            <h2 className="text-xl font-semibold text-white mb-4">Command History</h2>
            <div className="space-y-3">
              {history.map((entry) => (
                <div key={entry.id} className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all duration-200">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {getIconForType(entry.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-white">You said:</p>
                        <span className="text-xs text-white/60">{entry.timestamp}</span>
                      </div>
                      <p className="text-white/80 mb-3 italic">"{entry.command}"</p>
                      <div className={`p-3 rounded-lg backdrop-blur-sm ${
                        entry.type === 'error' 
                          ? 'bg-red-500/20 text-red-200 border border-red-500/30' 
                          : entry.type === 'needs_info'
                          ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30'
                          : 'bg-green-500/20 text-green-200 border border-green-500/30'
                      }`}>
                        {entry.result.message}
                        
                        {/* Show examples if AI needs more info */}
                        {entry.type === 'needs_info' && entry.result.examples && (
                          <div className="mt-3">
                            <p className="text-sm font-medium mb-2">Try these examples:</p>
                            <div className="space-y-1">
                              {entry.result.examples.map((example, index) => (
                                <button
                                  key={index}
                                  onClick={() => setCommand(example)}
                                  className="block w-full text-left px-3 py-2 bg-yellow-500/10 rounded text-sm hover:bg-yellow-500/20 transition-colors border border-yellow-500/20"
                                >
                                  "{example}"
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Show listed events */}
                        {entry.type === 'events_listed' && entry.result.events && (
                          <div className="mt-3">
                            <p className="text-sm font-medium mb-2">Found events:</p>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {entry.result.events.map((event, index) => (
                                <div key={index} className="text-xs bg-purple-500/10 rounded px-3 py-2 border border-purple-500/20">
                                  {event.summary} - {new Date(event.start?.dateTime || event.start?.date).toLocaleString()}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
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
