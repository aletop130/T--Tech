'use client';

import { useState } from 'react';
import { Card, InputGroup, Button, Tag, Spinner } from '@blueprintjs/core';
import { useCommsStore } from '@/lib/stores/commsStore';
import { api } from '@/lib/api';

export function CommsPanel() {
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const { isStreaming, stages, currentTranscription, setStreaming, addStage, setTranscription, setError, reset } = useCommsStore();

  async function sendChat() {
    if (!message.trim()) return;
    const userMsg = message;
    setMessage('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);

    try {
      const data = await api.commsChat([...chatMessages, { role: 'user', content: userMsg }]);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);

      if (data.command_ready) {
        // Auto-transmit the command via SSE
        transmitCommand(userMsg);
      }
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Communication error.' }]);
    }
  }

  function transmitCommand(msg: string) {
    reset();
    setStreaming(true);

    const params = new URLSearchParams({ message: msg });
    const eventSource = new EventSource(`/api/v1/comms/stream?${params.toString()}`);

    eventSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'comms_stage') {
          addStage(data.stage, data.data);
        } else if (data.type === 'comms_complete') {
          setTranscription(data.data);
          eventSource.close();
        } else if (data.type === 'comms_error') {
          setError(data.message);
          eventSource.close();
        }
      } catch {
        // ignore
      }
    };

    eventSource.onerror = () => {
      setError('Connection lost');
      eventSource.close();
    };
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--sda-text-primary)' }}>
        Iridium SBD Communications
      </h2>

      {/* Chat Messages */}
      <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm p-2 rounded ${msg.role === 'user' ? 'bg-blue-900/30 ml-8' : 'bg-gray-800/50 mr-8'}`}
            style={{ color: 'var(--sda-text-primary)' }}
          >
            <strong>{msg.role === 'user' ? 'Operator' : 'Comms Officer'}:</strong> {msg.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-4">
        <InputGroup
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
          placeholder="Issue satellite command in plain English..."
          fill
        />
        <Button onClick={sendChat} intent="primary">Send</Button>
      </div>

      {/* Protocol Stages */}
      {isStreaming && (
        <div className="flex items-center gap-2 mb-2">
          <Spinner size={16} />
          <span className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>Processing Iridium protocol...</span>
        </div>
      )}

      {stages.length > 0 && (
        <div className="space-y-1">
          {stages.map((s, i) => (
            <div key={i} className="text-xs p-2 rounded" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
              <Tag minimal>{s.stage}</Tag>
              <span className="ml-2" style={{ color: 'var(--sda-text-secondary)' }}>
                {typeof s.data === 'object' ? JSON.stringify(s.data).slice(0, 100) + '...' : String(s.data)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Transcription Result */}
      {currentTranscription && (
        <Card className="p-3 mt-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--sda-text-primary)' }}>
            Transmission Complete
          </h3>
          <div className="text-xs space-y-1" style={{ color: 'var(--sda-text-secondary)' }}>
            <div><strong>Target:</strong> {currentTranscription.parsed_intent.target_satellite_name}</div>
            <div><strong>Command:</strong> {currentTranscription.parsed_intent.summary}</div>
            <div><strong>IMEI:</strong> {currentTranscription.sbd_payload.imei}</div>
            <div><strong>Gateway:</strong> {currentTranscription.gateway_routing.selected_gateway.name}</div>
            <div><strong>Latency:</strong> {currentTranscription.gateway_routing.estimated_latency_ms}ms</div>
          </div>
        </Card>
      )}
    </div>
  );
}
