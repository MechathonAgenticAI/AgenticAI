import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Mic, Send, Check, X } from 'lucide-react';

export default function Chat({ socket, sessionId, confirmations, setConfirmations }) {
  const [text, setText] = useState('');
  const [intents, setIntents] = useState([]);
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [paramReqs, setParamReqs] = useState([]); // {id, intent, missing, message}
  const [paramInputs, setParamInputs] = useState({});
  const [conversationMessage, setConversationMessage] = useState(''); // New: for conversational messages
  const [autoSubmitting, setAutoSubmitting] = useState(false); // New: for auto-submit feedback
  const [aiProcessing, setAiProcessing] = useState(false); // New: for AI processing loading

  // Ensure sessionId is always available
  const effectiveSessionId = sessionId || 'anonymous';

  useEffect(() => {
    socket.on('agent:intent', (plan) => {
      setIntents((prev) => [plan, ...prev]);
    });
    socket.on('agent:needs_clarification', (payload) => {
      setParamReqs((prev) => [payload, ...prev]);
      speak(payload.message || 'I need more information to continue.');
    });
    socket.on('agent:needs_confirmation', (payload) => {
      console.log('Received agent:needs_confirmation:', payload);
      setConfirmations((prev) => {
        // Check if this confirmation already exists and remove it first
        const filtered = prev.filter(c => c.confirmationToken !== payload.confirmationToken);
        return [payload, ...filtered];
      });
      speak('Confirmation required');
    });
    socket.on('agent:message', (payload) => {
      console.log('Received agent:message:', payload);
      setConversationMessage(payload.message);
      
      // Clear AI processing when showing conversation messages
      setAiProcessing(false);
      
      if (payload.type === 'asking_confirmation') {
        speak(payload.message);
      } else if (payload.type === 'cancelled') {
        setConversationMessage(payload.message);
        speak(payload.message);
        // Clear message after a delay
        setTimeout(() => setConversationMessage(''), 3000);
      } else {
        speak(payload.message);
      }
    });
    socket.on('agent:status', (payload) => {
      console.log('Agent status:', payload);
      // Handle AI processing state
      if (payload.state === 'ai_processing') {
        setAiProcessing(true);
      }
      // Clear AI processing when waiting for user input
      if (payload.state === 'awaiting_input') {
        setAiProcessing(false);
      }
      // Clear conversation message when done
      if (payload.state === 'done') {
        setConversationMessage('');
        setAiProcessing(false);
      } else if (payload.state === 'executing') {
        setAiProcessing(false);
      }
    });
    socket.on('agent:error', (payload) => {
      console.error('Agent error:', payload);
      speak(payload.message || 'An error occurred');
    });
    return () => {
      socket.off('agent:intent');
      socket.off('agent:needs_clarification');
      socket.off('agent:needs_confirmation');
      socket.off('agent:message');
      socket.off('agent:status');
      socket.off('agent:error');
    };
  }, [socket]);

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('SpeechRecognition not supported');
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setText((x) => (x ? x + ' ' : '') + t);
    };
    rec.onend = () => {
      setListening(false);
      // Automatically submit after speech ends
      setAutoSubmitting(true);
      setTimeout(() => {
        // Get the current text value from the input field
        const inputElement = document.querySelector('input[type="text"]');
        const currentText = inputElement?.value || text;
        if (currentText.trim()) {
          submit();
        }
        setAutoSubmitting(false);
      }, 1000); // Slightly longer delay to ensure text is set
    };
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  const stopVoice = () => {
    recRef.current?.stop?.();
    setListening(false);
  };

  const send = async () => {
    if (!text.trim()) return;
    setAiProcessing(true);
    try {
      const { data } = await axios.post('http://localhost:4000/api/agent/command', { sessionId: effectiveSessionId, command: text });
      setText('');
    } catch (error) {
      console.error('Error sending command:', error);
      setAiProcessing(false);
    }
  };

  const confirm = async (confirmationToken, approve) => {
    try {
      const payload = approve
        ? { sessionId: effectiveSessionId, confirmationToken }
        : { sessionId: effectiveSessionId, confirmationToken, cancel: true };

      const { data } = await axios.post('http://localhost:4000/api/agent/confirm', payload);
      console.log('Confirmation response:', data);

      if (data?.ok || data?.success) {
        setConfirmations((prev) => prev.filter((c) => c.confirmationToken !== confirmationToken));
        if (data.cancelled) {
          speak('Okay, I will not proceed.');
        } else {
          speak('Confirmation accepted.');
        }
      } else {
        const message = data?.message || 'Confirmation failed.';
        console.error('Confirmation failed:', message);
        speak(message);
      }
    } catch (error) {
      console.error('Error confirming action:', error);
      speak('There was an error processing your confirmation.');
    }
  };

  const speak = (message) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const u = new SpeechSynthesisUtterance(String(message || ''));
      u.lang = 'en-US';
      synth.speak(u);
    } catch {}
  };

  const setParam = (reqId, key, value) => {
    setParamInputs((prev) => ({ ...prev, [reqId]: { ...(prev[reqId] || {}), [key]: value } }));
  };

  const continueFlow = async (reqId) => {
    const params = paramInputs[reqId] || {};
    await axios.post('http://localhost:4000/api/agent/continue', { sessionId: effectiveSessionId, id: reqId, params });
    setParamReqs((prev) => prev.filter((r) => r.id !== reqId));
    const { [reqId]: _, ...rest } = paramInputs;
    setParamInputs(rest);
  };

  return (
    <div className="backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Agent</h2>
      
      <div className="flex gap-3">
        <input 
          className={`flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent backdrop-blur-sm transition-all duration-200 ${
            aiProcessing ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          placeholder="Tell the agent what to do..." 
          value={text} 
          onChange={(e)=>setText(e.target.value)} 
          onKeyDown={(e)=>{if(e.key==='Enter' && !aiProcessing) send();}} 
          disabled={aiProcessing}
        />
        <button 
          onClick={send} 
          disabled={aiProcessing}
          className={`inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-lg font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl backdrop-blur-sm ${
            aiProcessing ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <Send size={18} /> {aiProcessing ? 'Processing...' : 'Send'}
        </button>
        <button 
          onClick={listening ? stopVoice : startVoice} 
          className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl backdrop-blur-sm ${
            listening 
              ? 'bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white' 
              : 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white'
          }`}
        >
          <Mic size={18} /> {listening ? 'Stop' : 'Speak'}
        </button>
      </div>

      {aiProcessing && (
        <div className="backdrop-blur-md bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
            <div className="text-sm font-medium text-purple-300">AI is processing your request...</div>
          </div>
        </div>
      )}

      {autoSubmitting && (
        <div className="backdrop-blur-md bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <div className="text-sm font-medium text-green-300">Processing your voice command...</div>
          </div>
        </div>
      )}

      {conversationMessage && (
        <div className={`backdrop-blur-md border rounded-xl p-4 ${
          conversationMessage.includes('yes') || conversationMessage.includes('confirm') 
            ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 border-orange-400/30' 
            : 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-blue-400/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              conversationMessage.includes('yes') || conversationMessage.includes('confirm')
                ? 'bg-orange-400'
                : 'bg-blue-400'
            }`}></div>
            <div className={`text-sm font-medium ${
              conversationMessage.includes('yes') || conversationMessage.includes('confirm')
                ? 'text-orange-300'
                : 'text-blue-300'
            }`}>{conversationMessage}</div>
          </div>
          <div className={`text-xs mt-2 italic ${
            conversationMessage.includes('yes') || conversationMessage.includes('confirm')
              ? 'text-orange-200/70'
              : 'text-blue-200/70'
          }`}>
            {conversationMessage.includes('yes') || conversationMessage.includes('confirm')
              ? 'Type "yes" to confirm or "no" to cancel...'
              : 'Type the task number and press Send...'
            }
          </div>
        </div>
      )}

      {false && paramReqs.length > 0 && (
        <div className="space-y-3">
          {paramReqs.map((r) => (
            <div key={r.id} className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-sm font-medium text-white/80 mb-2">Missing parameters</div>
              {r.message && <div className="text-sm text-white/70 mb-3 italic">{r.message}</div>}
              <div className="grid grid-cols-2 gap-3">
                {(r.missing || []).map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <label className="text-xs text-white/60 w-20 capitalize font-mono">{m}</label>
                    <input 
                      className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent backdrop-blur-sm" 
                      value={(paramInputs[r.id]?.[m] ?? '')} 
                      onChange={(e)=>setParam(r.id, m, e.target.value)} 
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <button 
                  onClick={() => continueFlow(r.id)} 
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg backdrop-blur-sm"
                >
                  Continue
                </button>
              </div>
              <pre className="text-xs bg-white/5 backdrop-blur-sm border border-white/10 p-3 rounded-lg max-h-40 overflow-auto mt-3 text-white/60 font-mono">{JSON.stringify(r.intent, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}

      {false && confirmations.length > 0 && (
        <div className="space-y-3">
          {confirmations.map((c) => (
            <div key={`${c.confirmationToken}-${c.timestamp || Date.now()}`} className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="text-sm font-medium text-white/80 mb-2">Requires confirmation</div>
                <pre className="text-xs bg-white/5 backdrop-blur-sm border border-white/10 p-3 rounded-lg max-h-40 overflow-auto text-white/60 font-mono">{JSON.stringify(c.plan || c.intent, null, 2)}</pre>
              </div>
              <div className="flex gap-2 ml-4">
                <button 
                  onClick={() => confirm(c.confirmationToken, true)} 
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-lg font-medium hover:from-green-600 hover:to-emerald-600 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg backdrop-blur-sm"
                >
                  <Check size={16}/>Confirm
                </button>
                <button 
                  onClick={() => confirm(c.confirmationToken, false)} 
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white px-4 py-2 rounded-lg font-medium hover:from-gray-700 hover:to-gray-800 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg backdrop-blur-sm"
                >
                  <X size={16}/>Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {intents.map((i, idx) => (
          <div key={`${i.meta?.text || 'intent'}-${idx}-${Date.now()}`} className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-3">
            <pre className="text-xs overflow-auto max-h-48 text-white/60 font-mono">{JSON.stringify(i, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
