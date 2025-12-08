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
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Smart Assistant</h1>
          <p className="text-gray-600 mt-1">Voice or text commands for reminders and tasks</p>
        </div>

        {/* Command Input */}
        <div className="p-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type or speak a command..."
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
                disabled={isProcessing}
              />
              <button
                onClick={toggleListening}
                className={`absolute right-2 bottom-2 p-2 rounded-lg transition-colors ${
                  isListening 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                disabled={isProcessing}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
            
            <button
              onClick={processCommand}
              disabled={!command.trim() || isProcessing}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {isProcessing ? 'Processing...' : 'Send'}
            </button>
          </div>

          {/* Suggestions */}
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">Try these commands:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => useSuggestion(suggestion)}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Command History */}
        {history.length > 0 && (
          <div className="border-t border-gray-200">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Command History</h2>
              <div className="space-y-3">
                {history.map((entry) => (
                  <div key={entry.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {getIconForType(entry.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-gray-900">You said:</p>
                          <span className="text-xs text-gray-500">{entry.timestamp}</span>
                        </div>
                        <p className="text-gray-700 mb-2">"{entry.command}"</p>
                        <div className={`p-3 rounded-lg ${
                          entry.type === 'error' 
                            ? 'bg-red-50 text-red-700' 
                            : entry.type === 'needs_info'
                            ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-green-50 text-green-700'
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
                                    className="block w-full text-left px-2 py-1 bg-yellow-100 rounded text-sm hover:bg-yellow-200 transition-colors"
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
                                  <div key={index} className="text-xs bg-purple-100 rounded px-2 py-1">
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
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartAssistant;
