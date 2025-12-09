import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Mic, Send, Check, X, Waves, Loader2, Speech, Sparkles } from 'lucide-react';

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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-white">Chat with the agent</h2>
          <p className="text-sm text-white/60">Confirm plans, provide clarifications, and view structured intents as JSON.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-white/50">
          <span className={`inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1 leading-none backdrop-blur ${aiProcessing ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/5 text-white/70'}`}>
            <Loader2 className={`h-3.5 w-3.5 ${aiProcessing ? 'animate-spin' : ''}`} />
            {aiProcessing ? 'Processing' : 'Idle'}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 leading-none text-white/70">
            <Speech className="h-3.5 w-3.5" />
            {listening ? 'Listening' : 'Voice-ready'}
          </span>
        </div>
      </header>

      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_-40px_rgba(168,85,247,0.55)] backdrop-blur-2xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          <input
            className={`flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white placeholder:text-white/45 shadow-inner shadow-black/30 focus:outline-none focus:ring-2 focus:ring-purple-400/40 ${aiProcessing ? 'opacity-40 cursor-not-allowed' : ''}`}
            placeholder="Tell the agent what to do..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !aiProcessing) send();
            }}
            disabled={aiProcessing}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-nowrap">
            <button
              onClick={send}
              disabled={aiProcessing}
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-500/40 bg-gradient-to-r from-fuchsia-500/60 via-purple-500/60 to-blue-500/50 text-white shadow-[0_12px_30px_-18px_rgba(168,85,247,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:border-fuchsia-400/60 hover:shadow-[0_18px_40px_-20px_rgba(59,130,246,0.8)] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/40"
            >
              {aiProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send size={18} />}
            </button>

            <button
              onClick={listening ? stopVoice : startVoice}
              className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-200 ${
                listening
                  ? 'border-rose-400/50 bg-gradient-to-r from-rose-500/60 to-orange-500/60 text-white shadow-[0_12px_30px_-18px_rgba(248,113,113,0.8)] hover:-translate-y-0.5'
                  : 'border-white/10 bg-white/10 text-white/80 hover:border-white/20 hover:text-white'
              }`}
            >
              <Mic size={18} />
            </button>
          </div>
        </div>

        {(aiProcessing || autoSubmitting) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {aiProcessing && (
              <div className="flex items-center gap-3 rounded-2xl border border-purple-400/30 bg-purple-500/15 px-4 py-3 text-sm text-purple-100">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI is processing your command…
              </div>
            )}
            {autoSubmitting && (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100">
                <Sparkles className="h-4 w-4" />
                Processing captured voice transcript…
              </div>
            )}
          </div>
        )}

        {conversationMessage && (
          <div
            className={`rounded-2xl border px-5 py-4 text-sm backdrop-blur ${
              conversationMessage.includes('yes') || conversationMessage.includes('confirm')
                ? 'border-orange-400/30 bg-orange-500/15 text-orange-100'
                : 'border-sky-400/30 bg-sky-500/15 text-sky-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  conversationMessage.includes('yes') || conversationMessage.includes('confirm') ? 'bg-orange-300' : 'bg-sky-300'
                } animate-pulse`}
              ></span>
              <span className="font-medium">{conversationMessage}</span>
            </div>
            <div className="mt-2 text-xs opacity-70">
              {conversationMessage.includes('yes') || conversationMessage.includes('confirm')
                ? 'Reply “yes” to approve or “no” to cancel the current plan.'
                : 'Provide the referenced task number or additional context to continue.'}
            </div>
          </div>
        )}
      </div>

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

      <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.28em] text-white/50">Intent Log</h3>
          <span className="text-xs text-white/40">{intents.length} entries</span>
        </div>
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {intents.map((i, idx) => (
            <div
              key={`${i.meta?.text || 'intent'}-${idx}-${Date.now()}`}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-white/70"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-fuchsia-400/70 via-purple-400/60 to-blue-500/60"></div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{JSON.stringify(i, null, 2)}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
