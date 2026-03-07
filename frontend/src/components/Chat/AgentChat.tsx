'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Tag, Spinner, Icon, Collapse, Card, Elevation, Button } from '@blueprintjs/core';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RotateCcwIcon, WrenchIcon, ChevronDownIcon, ChevronRightIcon, ZapIcon } from 'lucide-react';
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { cesiumController, CesiumAction } from '@/lib/cesium/controller';
import { SSEChatClient } from '@/lib/sse-client';
import { DetourAgentPanel } from './DetourAgentPanel';
import { useDetourStore } from '@/lib/store/detour';
import { AgentTimeline } from './AgentTimeline';
import { MemoryIndicator } from './MemoryIndicator';

interface ChatDisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  actions?: CesiumAction[];
  toolCalls?: { tool_name: string; arguments: Record<string, unknown> }[];
  timestamp: string;
  isStreaming?: boolean;
}

export interface SimulationControlCommand {
  action: string;
  mode?: string;
  source?: string;
}

interface AgentChatProps {
  onSendMessage?: (message: string, sceneState: Record<string, unknown>) => Promise<{ message: string; actions: CesiumAction[] }>;
  initialMessages?: ChatDisplayMessage[];
  useStreaming?: boolean;
  onSimulationControl?: (command: SimulationControlCommand) => void;
}

interface AgentState {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  message?: string;
}

const CHAT_CONNECT_TIMEOUT_MS = 20000;
const CHAT_STREAM_IDLE_TIMEOUT_MS = 30000;

const ORCHESTRATION_PATTERNS = [
  /analizza.*congiunzione/i,
  /\bdetour\b/i,
  /collision.*avoidance/i,
  /screening.*satellite/i,
  /manovra.*evasiv/i,
  /evasive.*maneuver/i,
  /\b(CONJ|DET)-\d{4}-\d+\b/i,
  /analisi.*rischio/i,
  /step.*by.*step/i,
  /passo.*passo/i,
  /\b(start|avvia|avviare|inizia|iniziare|lancia|launch)\b.*\b(sar|simulation|simulazione|mission|missione|defense|difesa)\b/i,
  /operation\s+guardian\s+angel/i,
  /operation\s+scudo/i,
  /italy.*defense/i,
  /missile.*defense/i,
];

function requiresOrchestration(message: string): boolean {
  return ORCHESTRATION_PATTERNS.some(pattern => pattern.test(message));
}

function isLikelyConfirmationMessage(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  if (!normalized) return false;
  if (['conferma', 'confirm', 'yes', 'ok', 'procedi', 'esegui'].includes(normalized)) return true;
  return ['conferma', 'confirm', 'procedi', 'esegui'].some((token) => normalized.includes(token));
}

function extractConjunctionId(message: string): string | null {
  const match = message.match(/\b(CONJ|DET)-\d{4}-\d+\b/i);
  return match ? match[0].toUpperCase() : null;
}

function isStepByStepRequest(message: string): boolean {
  return /step.*by.*step|passo.*passo/i.test(message);
}

function describeMapUpdate(actionType: string | undefined): string {
  if (!actionType) return 'aggiornamento visuale';
  const normalized = actionType.startsWith('cesium.') ? actionType.replace('cesium.', '') : actionType;
  const labels: Record<string, string> = {
    flyTo: 'focus camera',
    addEntity: 'nuovo oggetto',
    toggle: 'layer aggiornati',
    setSelected: 'selezione oggetto',
    setClock: 'tempo simulazione',
    loadCzml: 'traiettorie caricate',
    removeLayer: 'layer rimosso',
  };
  return labels[normalized] || 'aggiornamento visuale';
}

function formatAction(action: CesiumAction): string {
  switch (action.type) {
    case 'cesium.setClock':
      return `Set Clock: ${action.payload.multiplier}x`;
    case 'cesium.loadCzml':
      return `Load CZML: "${String(action.payload.layerId)}"`;
    case 'cesium.addEntity':
      return `Add ${String(action.payload.entityType)}: ${String(action.payload.name)}`;
    case 'cesium.flyTo': {
      const coords = action.payload.entityId
        ? `entity: ${String(action.payload.entityId)}`
        : `(${Number(action.payload.longitude).toFixed(2)}, ${Number(action.payload.latitude).toFixed(2)})`;
      return `FlyTo: ${coords}`;
    }
    case 'cesium.toggle': {
      const toggles = [];
      if (action.payload.showOrbits !== undefined) toggles.push(`orbits: ${action.payload.showOrbits ? 'ON' : 'OFF'}`);
      if (action.payload.showCoverage !== undefined) toggles.push(`coverage: ${action.payload.showCoverage ? 'ON' : 'OFF'}`);
      return `Toggle: ${toggles.join(', ')}`;
    }
    case 'cesium.removeLayer':
      return `Remove Layer: ${String(action.payload.layerId)}`;
    case 'cesium.setSelected':
      return `Select: ${action.payload.entityId ? String(action.payload.entityId) : 'none'}`;
    default:
      return 'Unknown action';
  }
}

function formatToolCall(toolCall: { tool_name: string; arguments: Record<string, unknown> }): string {
  const args = Object.entries(toolCall.arguments)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(', ');
  return `${toolCall.tool_name}(${args})`;
}

const quickPrompts = [
  'Simula 2 ore con 3 satelliti',
  'Mostra access windows a Fucino',
  'Fly to ISS',
  'Calcola conjunctions',
  'Analizza congiunzione CONJ-2024-001',
];

export function AgentChat({
  onSendMessage,
  initialMessages = [],
  useStreaming = true,
  onSimulationControl,
}: AgentChatProps) {
  const [messages, setMessages] = useState<ChatDisplayMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [currentToolCalls, setCurrentToolCalls] = useState<{ tool_name: string; arguments: Record<string, unknown> }[]>([]);
  const sseClientRef = useRef<SSEChatClient | null>(null);
  const generateSessionId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };
  const sessionRef = useRef<string>(generateSessionId());
  const mapSessionRef = useRef<string>(generateSessionId());

  const [activeAgents, setActiveAgents] = useState<AgentState[]>([]);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [memoryWarning, setMemoryWarning] = useState<string | null>(null);
  const [showAgentTimeline, setShowAgentTimeline] = useState(false);

  const {
    isStepByStepMode,
    startStepByStep,
    selectedSatellite,
    selectedConjunction,
  } = useDetourStore();

  useEffect(() => {
    return () => {
      sseClientRef.current?.close();
    };
  }, []);

  const handleOrchestration = useCallback(async (message: string) => {
    setShowAgentTimeline(true);
    setActiveAgents([]);
    setMemoryWarning(null);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: ChatDisplayMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      actions: [],
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, assistantMessage]);

    let connectTimeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      connectTimeout = setTimeout(() => controller.abort(), CHAT_CONNECT_TIMEOUT_MS);
      const response = await fetch('/api/v1/ai/chat/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          session_id: sessionRef.current,
          map_session_id: mapSessionRef.current,
          mode: 'analyze',
        }),
      });
      clearTimeout(connectTimeout);
      connectTimeout = null;

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (!reader) throw new Error('No response body');

      while (true) {
        const readResult = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: nessuna risposta dal backend.')), CHAT_STREAM_IDLE_TIMEOUT_MS)
          ),
        ]);
        const { done, value } = readResult;
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setMessages((msgs) =>
                msgs.map((msg) =>
                  msg.id === assistantMessageId ? { ...msg, content: fullContent, isStreaming: false } : msg
                )
              );
              setIsLoading(false);
              setShowAgentTimeline(false);
              continue;
            }
            try {
              const event = JSON.parse(data);
              switch (event.type) {
                case 'session':
                  if (typeof event.session_id === 'string' && event.session_id.length > 0) sessionRef.current = event.session_id;
                  break;
                case 'agent_start':
                  setActiveAgents((prev) => [...prev, { name: event.agent, status: 'running', message: event.message }]);
                  fullContent += `\n${event.message}\n`;
                  setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: fullContent } : msg));
                  break;
                case 'agent_complete':
                  setActiveAgents((prev) => prev.map((agent) => agent.name === event.agent ? { ...agent, status: 'complete' } : agent));
                  if (event.agent === 'all') {
                    fullContent += `\n${event.message}`;
                    setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: fullContent, isStreaming: false } : msg));
                  }
                  break;
                case 'cesium_action':
                  try {
                    if (typeof event.action?.type === 'string' && event.action.type.startsWith('cesium.')) {
                      cesiumController.dispatch(event.action as CesiumAction);
                    } else {
                      cesiumController.executeAction(event.action);
                    }
                    fullContent += `\nMappa aggiornata: ${describeMapUpdate(event.action?.type)}`;
                    setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: fullContent } : msg));
                  } catch (error) {
                    console.warn('Cesium action failed:', error);
                  }
                  break;
                case 'confirmation_required':
                  fullContent += `\nConferma richiesta: ${event.operation?.summary || 'operazione pending'}\n`;
                  setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: fullContent } : msg));
                  break;
                case 'memory_usage':
                  setMemoryUsage(event.percentage);
                  break;
                case 'memory_error':
                  if (typeof event.error === 'string') setMemoryWarning(event.error);
                  break;
                case 'content':
                  fullContent += event.chunk;
                  setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: fullContent } : msg));
                  break;
                case 'error':
                  console.error('Orchestration error:', event.error);
                  fullContent += `\nErrore: ${event.error}`;
                  setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: fullContent, isStreaming: false } : msg));
                  setIsLoading(false);
                  break;
                case 'simulation_control':
                  if (typeof event.action === 'string') {
                    onSimulationControl?.({
                      action: event.action,
                      mode: typeof event.mode === 'string' ? event.mode : undefined,
                      source: typeof event.source === 'string' ? event.source : undefined,
                    });
                    fullContent += `\nComando simulazione: ${event.action}`;
                    setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: fullContent } : msg));
                  }
                  break;
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Orchestration error:', error);
      const errorMessage =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Timeout: nessuna risposta dal backend entro il limite previsto.'
          : error instanceof Error ? error.message : 'Errore sconosciuto';
      setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: `Errore: ${errorMessage}`, isStreaming: false } : msg));
      setIsLoading(false);
      setShowAgentTimeline(false);
    } finally {
      if (connectTimeout) clearTimeout(connectTimeout);
    }
  }, [onSimulationControl]);

  const handleSendText = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatDisplayMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingText('');
    setCurrentToolCalls([]);
    setMemoryWarning(null);

    if (isStepByStepRequest(userMessage.content) && !isStepByStepMode) {
      const conjunctionId = extractConjunctionId(userMessage.content) || selectedConjunction;
      const satelliteId = selectedSatellite;
      if (conjunctionId && satelliteId) {
        try {
          await startStepByStep(conjunctionId, satelliteId);
          setMessages((prev) => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Pipeline step-by-step avviata su ${conjunctionId}.`,
            timestamp: new Date().toISOString(),
          }]);
        } catch (error) {
          setMessages((prev) => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Impossibile avviare step-by-step: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
            timestamp: new Date().toISOString(),
          }]);
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    const routeToOrchestrator = requiresOrchestration(userMessage.content) || isLikelyConfirmationMessage(userMessage.content);
    if (routeToOrchestrator) {
      await handleOrchestration(userMessage.content);
      return;
    }

    try {
      const sceneState = cesiumController.getSceneState();

      if (useStreaming) {
        const assistantMessageId = (Date.now() + 1).toString();
        setMessages((prev) => [...prev, {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          actions: [],
          toolCalls: [],
          timestamp: new Date().toISOString(),
          isStreaming: true,
        }]);

        sseClientRef.current = new SSEChatClient({
          onThinking: () => {},
          onMessageChunk: (chunk: string, isComplete: boolean) => {
            setStreamingText((prev) => {
              const newText = prev + chunk;
              setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: newText, isStreaming: !isComplete } : msg));
              return newText;
            });
          },
          onToolCall: (toolName: string, args: Record<string, unknown>) => {
            const toolCall = { tool_name: toolName, arguments: args };
            setCurrentToolCalls((prev) => [...prev, toolCall]);
            setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, toolCalls: [...(msg.toolCalls || []), toolCall] } : msg));
          },
          onAction: (action: { type: string; payload: Record<string, unknown> }) => {
            const cesiumAction: CesiumAction = { type: action.type as CesiumAction['type'], payload: action.payload };
            try { cesiumController.dispatch(cesiumAction); } catch (error) { console.warn('Cesium action failed (viewer not available):', error); }
            setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, actions: [...(msg.actions || []), cesiumAction] } : msg));
          },
          onSession: (sessionId: string) => { if (sessionId) sessionRef.current = sessionId; },
          onMemoryUsage: (percentage: number) => { setMemoryUsage(percentage); },
          onMemoryError: (error: string) => { setMemoryWarning(error); },
          onError: (error: string, details?: string) => {
            console.warn('SSE Error:', error, details);
            setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: msg.content + `\n\nError: ${error}`, isStreaming: false } : msg));
          },
          onDone: (finalMessage: string, actionsCount: number) => {
            setMessages((msgs) => msgs.map((msg) => msg.id === assistantMessageId ? { ...msg, content: finalMessage || msg.content, isStreaming: false } : msg));
            setIsLoading(false);
          },
        });

        await sseClientRef.current.streamChat(
          [{ role: 'user', content: userMessage.content }],
          sceneState as unknown as Record<string, unknown>,
          sessionRef.current,
        );
      } else if (onSendMessage) {
        const response = await onSendMessage(userMessage.content, sceneState as unknown as Record<string, unknown>);
        setMessages((prev) => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.message,
          actions: response.actions,
          timestamp: new Date().toISOString(),
        }]);
        if (response.actions && response.actions.length > 0) {
          try { cesiumController.dispatchAll(response.actions); } catch (error) { console.warn('Cesium actions failed (viewer not available):', error); }
        }
        setIsLoading(false);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setMessages((prev) => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Analizzando la richiesta: "${userMessage.content}"\n\nPer procedere con la simulazione, ho bisogno di ulteriori dettagli sui parametri desiderati.`,
          timestamp: new Date().toISOString(),
        }]);
        setIsLoading(false);
      }
    } catch (error) {
      console.warn('Chat error:', error);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Errore: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        timestamp: new Date().toISOString(),
      }]);
      setIsLoading(false);
    }
  }, [
    handleOrchestration,
    isLoading,
    isStepByStepMode,
    onSendMessage,
    selectedConjunction,
    selectedSatellite,
    startStepByStep,
    useStreaming,
  ]);

  const handlePromptSubmit = useCallback((message: PromptInputMessage) => {
    if (!message.text?.trim()) return;
    handleSendText(message.text);
  }, [handleSendText]);

  const toggleActions = (messageId: string) => {
    setExpandedActions((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const toggleTools = (messageId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const handleNewSession = useCallback(() => {
    if (isLoading) return;
    sseClientRef.current?.close();
    sessionRef.current = generateSessionId();
    mapSessionRef.current = generateSessionId();
    setMessages([]);
    setInput('');
    setStreamingText('');
    setCurrentToolCalls([]);
    setExpandedActions(new Set());
    setExpandedTools(new Set());
    setActiveAgents([]);
    setMemoryUsage(0);
    setMemoryWarning(null);
    setShowAgentTimeline(false);
  }, [isLoading]);

  const chatStatus = isLoading ? (streamingText ? 'streaming' as const : 'submitted' as const) : ('ready' as const);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Compact status bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-sda-border-default/30">
          <div className="flex items-center gap-2">
            {useStreaming && (
              <Tag minimal intent="success" className="!text-[10px] !px-1.5 !py-0 !min-h-0">
                <Icon icon="satellite" size={8} className="mr-0.5" /> SSE
              </Tag>
            )}
            <MemoryIndicator percentage={memoryUsage} />
            {memoryWarning && (
              <Tag minimal intent="warning" className="!text-[10px] !px-1.5 !py-0 !min-h-0">
                <Icon icon="warning-sign" size={8} className="mr-0.5" /> Mem
              </Tag>
            )}
          </div>
          <button
            onClick={handleNewSession}
            disabled={isLoading}
            className="p-1 rounded hover:bg-sda-bg-tertiary text-sda-text-muted hover:text-sda-text-primary transition-colors disabled:opacity-30"
            title="New Session"
          >
            <RotateCcwIcon size={14} />
          </button>
        </div>
        {memoryWarning && (
          <p className="text-[10px] text-orange-300 px-3 py-1">{memoryWarning}</p>
        )}

        {/* Messages area */}
        <Conversation className="flex-1 min-h-0">
          <ConversationContent className="gap-4 p-3">
            {showAgentTimeline && <AgentTimeline agents={activeAgents} />}

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-sda-text-muted py-8 gap-3">
                <div className="w-10 h-10 rounded-full bg-sda-bg-tertiary flex items-center justify-center">
                  <ZapIcon size={20} className="text-sda-accent-cyan" />
                </div>
                <div>
                  <p className="text-sm font-medium text-sda-text-secondary">AI Assistant</p>
                  <p className="text-xs mt-0.5">Simulations, analysis, map controls</p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center mt-2 max-w-[280px]">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setInput(prompt)}
                      className="text-[11px] px-2 py-1 rounded-md bg-sda-bg-tertiary text-sda-text-secondary hover:text-sda-text-primary hover:bg-sda-bg-elevated border border-sda-border-default/50 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className="space-y-1">
                <Message from={message.role === 'system' ? 'assistant' : message.role}>
                  <MessageContent>
                    {message.role === 'assistant' ? (
                      <div className="text-sm">
                        <MessageResponse>{message.content}</MessageResponse>
                        {message.isStreaming && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-sda-accent-cyan animate-pulse rounded-sm" />
                        )}
                      </div>
                    ) : (
                      <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    )}
                  </MessageContent>
                </Message>

                {/* Tool calls expandable */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="pl-1">
                    <button
                      onClick={() => toggleTools(message.id)}
                      className="flex items-center gap-1 text-[11px] text-sda-text-muted hover:text-sda-text-secondary transition-colors py-0.5"
                    >
                      {expandedTools.has(message.id) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                      <WrenchIcon size={10} />
                      Tools ({message.toolCalls.length})
                    </button>
                    {expandedTools.has(message.id) && (
                      <div className="mt-1 rounded-md bg-sda-bg-primary/80 border border-sda-border-default/50 p-2">
                        {message.toolCalls.map((toolCall, idx) => (
                          <div key={idx} className="text-[11px] text-sda-text-secondary py-0.5 font-mono border-b border-sda-border-default/30 last:border-0">
                            {formatToolCall(toolCall)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions expandable */}
                {message.actions && message.actions.length > 0 && (
                  <div className="pl-1">
                    <button
                      onClick={() => toggleActions(message.id)}
                      className="flex items-center gap-1 text-[11px] text-sda-text-muted hover:text-sda-text-secondary transition-colors py-0.5"
                    >
                      {expandedActions.has(message.id) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                      <ZapIcon size={10} />
                      Actions ({message.actions.length})
                    </button>
                    {expandedActions.has(message.id) && (
                      <div className="mt-1 rounded-md bg-sda-bg-primary/80 border border-sda-border-default/50 p-2">
                        {message.actions.map((action, idx) => (
                          <div key={idx} className="text-[11px] text-sda-text-secondary py-0.5 border-b border-sda-border-default/30 last:border-0">
                            {formatAction(action)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isLoading && !streamingText && (
              <div className="flex items-center gap-2 text-sda-text-muted">
                <Spinner size={14} />
                <span className="text-xs">Thinking...</span>
              </div>
            )}

            {isStepByStepMode && (
              <DetourAgentPanel
                onStepComplete={(agent, approved) => console.log(`Step ${agent} ${approved ? 'approved' : 'rejected'}`)}
                onPipelineComplete={(result) => console.log('Pipeline completed:', result)}
                onPipelineCancelled={() => console.log('Pipeline cancelled')}
              />
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* ai-elements PromptInput */}
        <div className="border-t border-sda-border-default/30 [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:shadow-none [&_[data-slot=input-group]]:ring-0">
          <PromptInput onSubmit={handlePromptSubmit} className="!rounded-none !border-0">
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask for a simulation, analysis, or map action..."
                className="!min-h-10 !max-h-32 !text-sm !bg-transparent !border-0 !ring-0 focus:!ring-0 !shadow-none text-sda-text-primary placeholder:text-sda-text-muted"
              />
            </PromptInputBody>
            <PromptInputFooter className="!py-1.5 !px-2">
              <PromptInputTools>
                <span className="text-[10px] text-sda-text-muted">Enter to send</span>
              </PromptInputTools>
              <PromptInputSubmit
                disabled={!input.trim() && !isLoading}
                status={chatStatus}
                className="!h-7 !w-7 !bg-sda-accent-cyan hover:!bg-sda-accent-cyan/80 !text-black !rounded-md"
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </TooltipProvider>
  );
}
