'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Icon, Spinner, Tag, ProgressBar } from '@blueprintjs/core';
import type { RiskSnapshot } from '@/types/threats';
import { riskColor, riskIntent } from '@/lib/severity';
import { SSEChatClient } from '@/lib/sse-client';
import { MessageResponse } from '@/components/ai-elements/message';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface SatelliteRiskDebriefProps {
  satellite: RiskSnapshot;
  onClose: () => void;
}

function generateSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function SatelliteRiskDebrief({ satellite, onClose }: SatelliteRiskDebriefProps) {
  // Debrief state (left panel – streamed via SSE)
  const [debriefText, setDebriefText] = useState('');
  const [debriefLoading, setDebriefLoading] = useState(true);
  const [debriefDone, setDebriefDone] = useState(false);
  const debriefClientRef = useRef<SSEChatClient | null>(null);
  const debriefScrollRef = useRef<HTMLDivElement>(null);

  // Chat state (right panel – streamed via SSE)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const chatClientRef = useRef<SSEChatClient | null>(null);
  const sessionRef = useRef(generateSessionId());
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Track the initial debrief prompt so the chat can include it as context
  const debriefPromptRef = useRef('');
  const debriefResultRef = useRef('');

  const satName = satellite.satellite_name || satellite.satellite_id;
  const riskPct = (satellite.risk_score * 100).toFixed(1);
  const components = satellite.components || {};
  const componentSummary = Object.entries(components)
    .map(([k, v]) => `${k.replace('_', ' ')}: ${(v * 100).toFixed(0)}%`)
    .join(', ');

  // Auto-debrief on mount — stream via AEGIS agent
  useEffect(() => {
    const prompt = `Brief me on the risk situation for ${satName}. Risk score: ${riskPct}%, level: ${satellite.risk_level || 'unknown'}, dominant threat: ${satellite.dominant_threat || 'none'}. Components: ${componentSummary || 'none'}. Explain the threats, why risk is at this level, and what the operator should monitor.`;
    debriefPromptRef.current = prompt;

    let buffer = '';
    debriefClientRef.current = new SSEChatClient({
      onMessageChunk: (chunk: string, isComplete: boolean) => {
        buffer += chunk;
        setDebriefText(buffer);
        if (isComplete) {
          debriefResultRef.current = buffer;
          setDebriefLoading(false);
          setDebriefDone(true);
        }
      },
      onSession: (sid: string) => {
        sessionRef.current = sid;
      },
      onError: (error: string) => {
        buffer += `\n\nError: ${error}`;
        setDebriefText(buffer);
        setDebriefLoading(false);
      },
      onDone: (finalMessage: string) => {
        debriefResultRef.current = finalMessage || buffer;
        setDebriefText(debriefResultRef.current);
        setDebriefLoading(false);
        setDebriefDone(true);
      },
    });

    debriefClientRef.current.streamAgentChat(
      [{ role: 'user', content: prompt }],
      { context: 'fleet_risk_debrief', satellite_id: satellite.satellite_id },
      sessionRef.current,
    );

    return () => {
      debriefClientRef.current?.close();
      chatClientRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll debrief panel as text streams in
  useEffect(() => {
    if (debriefLoading && debriefScrollRef.current) {
      debriefScrollRef.current.scrollTop = debriefScrollRef.current.scrollHeight;
    }
  }, [debriefText, debriefLoading]);

  // Auto-scroll chat panel
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Build full conversation history for contextual follow-ups
  const buildChatHistory = useCallback((newUserText: string): Array<{ role: string; content: string }> => {
    const history: Array<{ role: string; content: string }> = [];

    // Seed with the debrief exchange so chat has full context
    if (debriefPromptRef.current && debriefResultRef.current) {
      history.push({ role: 'user', content: debriefPromptRef.current });
      history.push({ role: 'assistant', content: debriefResultRef.current });
    }

    // Add all previous chat messages (skip streaming placeholders)
    for (const msg of messages) {
      if (msg.content && !msg.isStreaming) {
        history.push({ role: msg.role, content: msg.content });
      }
    }

    // Add the new user message
    history.push({ role: 'user', content: newUserText });
    return history;
  }, [messages]);

  const handleSendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };
    const assistantId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, userMsg, {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }]);
    setInput('');
    setChatLoading(true);
    setStreamingText('');

    chatClientRef.current?.close();

    let chatBuffer = '';
    chatClientRef.current = new SSEChatClient({
      onMessageChunk: (chunk: string, isComplete: boolean) => {
        chatBuffer += chunk;
        const snapshot = chatBuffer;
        setStreamingText(snapshot);
        setMessages(msgs => msgs.map(m =>
          m.id === assistantId ? { ...m, content: snapshot, isStreaming: !isComplete } : m
        ));
      },
      onSession: (sid: string) => {
        sessionRef.current = sid;
      },
      onError: (error: string) => {
        setMessages(msgs => msgs.map(m =>
          m.id === assistantId ? { ...m, content: `Error: ${error}`, isStreaming: false } : m
        ));
        setChatLoading(false);
      },
      onDone: (finalMessage: string) => {
        const content = finalMessage || chatBuffer;
        setMessages(msgs => msgs.map(m =>
          m.id === assistantId ? { ...m, content, isStreaming: false } : m
        ));
        setChatLoading(false);
      },
    });

    // Send full conversation history (debrief + prior chat + new message)
    const fullHistory = buildChatHistory(text);

    await chatClientRef.current.streamAgentChat(
      fullHistory,
      { context: 'fleet_risk_chat', satellite_id: satellite.satellite_id },
      sessionRef.current,
    );
  }, [input, chatLoading, satellite, buildChatHistory]);

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          small
          minimal
          icon="arrow-left"
          onClick={onClose}
        >
          Back to Fleet Risk
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <span className="font-semibold text-sm" style={{ color: 'var(--sda-text-primary)' }}>
            {satName}
          </span>
          <Tag
            minimal
            intent={riskIntent(satellite.risk_level || 'low')}
            style={{ fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' }}
          >
            {satellite.risk_level || 'unknown'}
          </Tag>
          <span className="text-xs font-mono font-bold" style={{ color: riskColor(satellite.risk_level || 'low') }}>
            {riskPct}%
          </span>
        </div>
      </div>

      {/* Split Panel */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Left: Debrief (streaming Markdown) */}
        <div className="lg:w-[60%] flex flex-col min-h-0">
          <div
            ref={debriefScrollRef}
            className="rounded-lg border p-4 flex-1 overflow-y-auto"
            style={{
              backgroundColor: 'var(--sda-bg-secondary)',
              borderColor: 'var(--sda-border-default)',
            }}
          >
            {/* Risk score header */}
            <div className="mb-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium" style={{ color: 'var(--sda-text-secondary)' }}>
                  Overall Risk Score
                </span>
                <span className="text-sm font-mono font-bold" style={{ color: riskColor(satellite.risk_level || 'low') }}>
                  {riskPct}%
                </span>
              </div>
              <ProgressBar
                value={satellite.risk_score}
                intent={riskIntent(satellite.risk_level || 'low')}
                stripes={false}
                animate={false}
              />
            </div>

            {/* Component breakdown */}
            {Object.keys(components).length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.entries(components).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--sda-bg-tertiary)' }}>
                    <span style={{ color: 'var(--sda-text-secondary)' }}>
                      {key.replace('_', ' ')}
                    </span>
                    <span style={{ color: riskColor(val >= 0.6 ? 'high' : val >= 0.3 ? 'medium' : 'low') }}>
                      {(val * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* AI Debrief — streaming Markdown via Streamdown */}
            <div className="border-t pt-3" style={{ borderColor: 'var(--sda-border-default)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon icon="lightning" size={14} style={{ color: 'var(--sda-accent-cyan, #06b6d4)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--sda-text-secondary)' }}>
                  AI Risk Debrief
                </span>
                {debriefLoading && <Spinner size={12} />}
                {debriefDone && (
                  <Tag minimal intent="success" style={{ fontSize: '9px' }}>COMPLETE</Tag>
                )}
              </div>
              <div className="text-sm" style={{ color: 'var(--sda-text-primary)' }}>
                {debriefText ? (
                  <MessageResponse>{debriefText}</MessageResponse>
                ) : debriefLoading ? (
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--sda-text-muted)' }}>
                    <Spinner size={14} />
                    <span>Connecting to AEGIS agent...</span>
                  </div>
                ) : null}
                {debriefLoading && debriefText && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-cyan-400 animate-pulse rounded-sm" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Chat (streaming via SSE) */}
        <div className="lg:w-[40%] flex flex-col min-h-0">
          <div className="rounded-lg border flex flex-col flex-1 min-h-0" style={{
            backgroundColor: 'var(--sda-bg-secondary)',
            borderColor: 'var(--sda-border-default)',
          }}>
            {/* Chat header */}
            <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--sda-border-default)' }}>
              <Icon icon="chat" size={12} style={{ color: 'var(--sda-accent-cyan, #06b6d4)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--sda-text-secondary)' }}>
                Ask about {satName}
              </span>
              {chatLoading && <Spinner size={10} />}
            </div>

            {/* Messages — streaming Markdown rendering */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
              {messages.length === 0 && !chatLoading && (
                <div className="text-center py-6">
                  <Icon icon="chat" size={24} style={{ color: 'var(--sda-text-muted)', opacity: 0.4 }} />
                  <p className="text-xs mt-2" style={{ color: 'var(--sda-text-muted)' }}>
                    Ask follow-up questions about this satellite&apos;s risk situation
                  </p>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-cyan-900/30 border border-cyan-700/30'
                      : ''
                  }`} style={{
                    color: 'var(--sda-text-primary)',
                    ...(msg.role === 'assistant' ? { backgroundColor: 'var(--sda-bg-tertiary)' } : {}),
                  }}>
                    {msg.role === 'assistant' ? (
                      <>
                        {msg.content ? (
                          <MessageResponse>{msg.content}</MessageResponse>
                        ) : msg.isStreaming ? (
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--sda-text-muted)' }}>
                            <Spinner size={12} />
                            <span>Thinking...</span>
                          </div>
                        ) : null}
                        {msg.isStreaming && msg.content && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-cyan-400 animate-pulse rounded-sm" />
                        )}
                      </>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-2 flex gap-2" style={{ borderColor: 'var(--sda-border-default)' }}>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                placeholder="Ask about this satellite..."
                className="flex-1 text-sm px-3 py-1.5 rounded border bg-transparent outline-none"
                style={{
                  color: 'var(--sda-text-primary)',
                  borderColor: 'var(--sda-border-default)',
                  backgroundColor: 'var(--sda-bg-primary)',
                }}
                disabled={chatLoading}
              />
              <Button
                small
                intent="primary"
                icon="send-message"
                disabled={!input.trim() || chatLoading}
                onClick={handleSendChat}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
