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
      speak('Confirmation required');
    });
    socket.on('agent:status', (payload) => {
      console.log('Agent status:', payload);
    });
    socket.on('agent:error', (payload) => {
      console.error('Agent error:', payload);
      speak(payload.message || 'An error occurred');
    });
    return () => {
      socket.off('agent:intent');
      socket.off('agent:needs_clarification');
      socket.off('agent:needs_confirmation');
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
    rec.onend = () => setListening(false);
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
    const { data } = await axios.post('http://localhost:4000/api/agent/command', { sessionId: effectiveSessionId, command: text });
    if (data?.pending_confirmation) {
      setConfirmations((prev) => [data.pending_confirmation, ...prev]);
    }
    setText('');
  };

  const confirm = async (confirmationToken, approve) => {
    const payload = approve ? { sessionId: effectiveSessionId, confirmationToken } : { sessionId: effectiveSessionId, confirmationToken, cancel: true };
    await axios.post('http://localhost:4000/api/agent/confirm', payload);
    setConfirmations((prev) => prev.filter((c) => c.confirmationToken !== confirmationToken));
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
    <div className="border rounded-lg p-4 space-y-4">
      <h2 className="font-semibold">Agent</h2>
      <div className="flex gap-2">
        <input className="flex-1 border rounded px-3 py-2" placeholder="Tell the agent what to do..." value={text} onChange={(e)=>setText(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter') send();}} />
        <button onClick={send} className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded">
          <Send size={16} /> Send
        </button>
        <button onClick={listening ? stopVoice : startVoice} className={`inline-flex items-center gap-2 ${listening? 'bg-red-600':'bg-gray-800'} text-white px-3 py-2 rounded`}>
          <Mic size={16} /> {listening ? 'Stop' : 'Speak'}
        </button>
      </div>

      {paramReqs.length > 0 && (
        <div className="space-y-2">
          {paramReqs.map((r) => (
            <div key={r.id} className="border rounded p-3">
              <div className="text-sm text-gray-600">Missing parameters</div>
              {r.message && <div className="text-sm mb-2">{r.message}</div>}
              <div className="grid grid-cols-2 gap-2">
                {(r.missing || []).map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <label className="text-xs w-24 capitalize">{m}</label>
                    <input className="flex-1 border rounded px-2 py-1 text-sm" value={(paramInputs[r.id]?.[m] ?? '')} onChange={(e)=>setParam(r.id, m, e.target.value)} />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <button onClick={() => continueFlow(r.id)} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Continue</button>
              </div>
              <pre className="text-xs bg-gray-50 p-2 rounded max-h-40 overflow-auto mt-2">{JSON.stringify(r.intent, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}

      {confirmations.length > 0 && (
        <div className="space-y-2">
          {confirmations.map((c) => (
            <div key={c.confirmationToken || c.id} className="border rounded p-3 flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Requires confirmation</div>
                <pre className="text-xs bg-gray-50 p-2 rounded max-h-40 overflow-auto">{JSON.stringify(c.plan || c.intent, null, 2)}</pre>
              </div>
              <div className="flex gap-2">
                <button onClick={() => confirm(c.confirmationToken || c.id, true)} className="inline-flex items-center gap-1 bg-green-600 text-white px-2 py-1 rounded text-sm"><Check size={14}/>Confirm</button>
                <button onClick={() => confirm(c.confirmationToken || c.id, false)} className="inline-flex items-center gap-1 bg-gray-200 px-2 py-1 rounded text-sm"><X size={14}/>Cancel</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {intents.map((i, idx) => (
          <div key={idx} className="bg-gray-50 rounded p-2">
            <pre className="text-xs overflow-auto max-h-48">{JSON.stringify(i, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
