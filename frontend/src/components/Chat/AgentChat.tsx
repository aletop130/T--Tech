'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Tag, Spinner, Icon } from '@blueprintjs/core';
import { RotateCcwIcon, WrenchIcon, ChevronDownIcon, ChevronRightIcon, ZapIcon, InfoIcon, AlertTriangleIcon, ShieldIcon, ShieldAlertIcon, PauseIcon, BrainIcon, MapPinIcon, SendIcon } from 'lucide-react';
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

// ── Types ──

interface ChatDisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  actions?: CesiumAction[];
  toolCalls?: { tool_name: string; arguments: Record<string, unknown> }[];
  narrations?: { text: string; style: string }[];
  timestamp: string;
  isStreaming?: boolean;
}

export interface SimulationControlCommand {
  action: string;
  mode?: string;
  source?: string;
  prompt?: string;
}

/** Minimal satellite info passed as chat context */
export interface ChatSatelliteContext {
  id: string;
  name: string;
  norad_id: number;
  object_type: string;
  country?: string;
  operator?: string;
  tags: string[];
}

interface AgentChatProps {
  onSendMessage?: (message: string, sceneState: Record<string, unknown>) => Promise<{ message: string; actions: CesiumAction[] }>;
  initialMessages?: ChatDisplayMessage[];
  useStreaming?: boolean;
  onSimulationControl?: (command: SimulationControlCommand) => void;
  quickPrompts?: string[];
  /** Satellites pinned by the user as context for the chat */
  contextSatellites?: ChatSatelliteContext[];
  /** Called when user removes a satellite from the context chips */
  onRemoveContextSatellite?: (id: string) => void;
}

interface AgentState {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  message?: string;
}

interface PendingOperation {
  operation_type?: string;
  summary?: string;
}

// ── Helpers ──

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
    case 'cesium.flyToCountry':
      return `FlyTo Country: ${String(action.payload.country)}`;
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
    case 'cesium.clearAllOverlays':
      return 'Clear All Overlays';
    case 'cesium.setSceneMood':
      return `Scene Mood: ${String(action.payload.mood)}`;
    default: {
      const typeName = action.type.replace('cesium.', '').replace('simulation.', '');
      return typeName;
    }
  }
}

function formatToolCall(toolCall: { tool_name: string; arguments: Record<string, unknown> }): string {
  const args = Object.entries(toolCall.arguments)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(', ');
  return `${toolCall.tool_name}(${args})`;
}

function isCesiumAction(toolName: string): boolean {
  return toolName.startsWith('cesium_') || toolName.startsWith('simulation_');
}

// ── Narration Style Config ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NARRATION_STYLES: Record<string, { bg: string; border: string; icon: any }> = {
  info: { bg: 'bg-blue-950/60', border: 'border-blue-700/50', icon: InfoIcon },
  warning: { bg: 'bg-orange-950/60', border: 'border-orange-700/50', icon: AlertTriangleIcon },
  dramatic: { bg: 'bg-red-950/60', border: 'border-red-700/50', icon: ShieldAlertIcon },
  briefing: { bg: 'bg-emerald-950/60', border: 'border-emerald-700/50', icon: ShieldIcon },
};

// ── Quick Prompts ──

const DEFAULT_QUICK_PROMPTS = [
  'Mostrami la minaccia più critica',
  'Tour della costellazione',
  'Briefing situazione',
  'Fly to ISS',
  'Analizza le congiunzioni attive',
];

const DETOUR_TIMELINE_AGENTS = new Set(['scout', 'analyst', 'planner', 'safety', 'ops_brief']);

function buildContextPrefixedMessage(
  text: string,
  contextSatellites: ChatSatelliteContext[]
): string {
  if (contextSatellites.length === 0) {
    return text;
  }

  const context = contextSatellites.map((satellite) =>
    `[${satellite.name} | NORAD:${satellite.norad_id} | Type:${satellite.object_type}${satellite.country ? ` | Country:${satellite.country}` : ''}${satellite.operator ? ` | Op:${satellite.operator}` : ''}${satellite.tags.length ? ` | Tags:${satellite.tags.join(',')}` : ''}]`
  ).join(' ');

  return `[Contesto satelliti selezionati: ${context}]\n\n${text}`;
}

function shouldUseOrchestration(message: string): boolean {
  const normalized = message.toLowerCase().trim();

  const phrasePatterns = [
    'briefing turno',
    'shift brief',
    'briefing di turno',
    'briefing operativo',
    'stato del mondo',
    'situazione generale',
    'morning brief',
    'handover brief',
    'scansione minacce',
    'fleet threat',
    'threat scan',
    'minacce attive',
    'ci sono minacce',
    'any threats',
  ];

  if (phrasePatterns.some((pattern) => normalized.includes(pattern))) {
    return true;
  }

  if (/^(conferma|confirm|yes|ok|procedi|esegui|vai|approve|approved)\b/.test(normalized)) {
    return true;
  }

  const orchestrationPatterns = [
    /\b(sandbox|custom simulation|custom scenario|simulation workspace)\b/,
    /\b(what if|what-if|simula|scenario)\b/,
    /\b(congiunzione|conjunction|collisione|collision|rischio|risk|manovra evasiva|avoidance|detour)\b/,
    /\b(crea|create|add)\b.*\b(satellite|satellit)\b/,
    /\b(crea|create|add)\b.*\b(base|ground station|stazione)\b/,
    /\b(crea|create|add|spawn)\b.*\b(vehicle|veicolo|ground vehicle)\b/,
    /\b(start|avvia|avviare|inizia|iniziare|lancia|launch)\b.*\b(sar|simulation|simulazione|missione|mission)\b/,
    /\b(crea|create|start|avvia)\b.*\b(operation|operazione)\b/,
  ];

  return orchestrationPatterns.some((pattern) => pattern.test(normalized));
}

// ── Component ──

export function AgentChat({
  onSendMessage,
  initialMessages = [],
  useStreaming = true,
  onSimulationControl,
  quickPrompts = DEFAULT_QUICK_PROMPTS,
  contextSatellites = [],
  onRemoveContextSatellite,
}: AgentChatProps) {
  const [messages, setMessages] = useState<ChatDisplayMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [, setCurrentToolCalls] = useState<{ tool_name: string; arguments: Record<string, unknown> }[]>([]);
  const sseClientRef = useRef<SSEChatClient | null>(null);

  // Agent-specific state
  const [agentStep, setAgentStep] = useState<number>(0);
  const [agentPause, setAgentPause] = useState<{ seconds: number; reason: string } | null>(null);

  const generateSessionId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };
  const sessionRef = useRef<string>(generateSessionId());
  const mapSessionRef = useRef<string>(generateSessionId());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [activeAgents, setActiveAgents] = useState<AgentState[]>([]);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [memoryWarning, setMemoryWarning] = useState<string | null>(null);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const [showAgentTimeline, setShowAgentTimeline] = useState(false);

  const {
    isStepByStepMode,
  } = useDetourStore();

  const updateAgentState = useCallback(
    (name: string, status: AgentState['status'], message?: string) => {
      setActiveAgents((prev) => {
        const existingIndex = prev.findIndex((agent) => agent.name === name);
        const nextState = { name, status, message };

        if (existingIndex === -1) {
          return [...prev, nextState];
        }

        const nextAgents = [...prev];
        nextAgents[existingIndex] = {
          ...nextAgents[existingIndex],
          status,
          message: message ?? nextAgents[existingIndex].message,
        };
        return nextAgents;
      });
    },
    []
  );

  useEffect(() => {
    return () => {
      sseClientRef.current?.close();
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  // ── Main send handler: route platform ops to orchestrator, exploration to AEGIS ──

  const handleSendText = useCallback(async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || isLoading) return;

    const userMessage: ChatDisplayMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmedText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingText('');
    setCurrentToolCalls([]);
    setMemoryWarning(null);
    setPendingOperation(null);
    setAgentStep(0);
    setAgentPause(null);
    setActiveAgents([]);
    setShowAgentTimeline(false);

    const assistantMessageId = (Date.now() + 1).toString();

    setMessages((prev) => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      actions: [],
      toolCalls: [],
      narrations: [],
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }]);

    try {
      const sceneState = cesiumController.getSceneState();

      if (useStreaming) {
        sseClientRef.current?.close();
        sseClientRef.current = new SSEChatClient({
          onMessageChunk: (chunk: string, isComplete: boolean) => {
            setStreamingText((prev) => {
              const newText = prev + chunk;
              setMessages((msgs) => msgs.map((msg) =>
                msg.id === assistantMessageId ? { ...msg, content: newText, isStreaming: !isComplete } : msg
              ));
              return newText;
            });
          },
          onToolCall: (toolName: string, args: Record<string, unknown>) => {
            const toolCall = { tool_name: toolName, arguments: args };
            setCurrentToolCalls((prev) => [...prev, toolCall]);
            setMessages((msgs) => msgs.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, toolCalls: [...(msg.toolCalls || []), toolCall] }
                : msg
            ));
          },
          onAction: (action: { type: string; payload: Record<string, unknown> }) => {
            const cesiumAction: CesiumAction = { type: action.type as CesiumAction['type'], payload: action.payload };
            try {
              cesiumController.dispatch(cesiumAction);
            } catch (error) {
              console.warn('Cesium action failed (viewer not available):', error);
            }
            setMessages((msgs) => msgs.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, actions: [...(msg.actions || []), cesiumAction] }
                : msg
            ));
          },
          onSimulationControl: (command) => {
            onSimulationControl?.(command);
          },
          onConfirmationRequired: (operation) => {
            setPendingOperation({
              operation_type: typeof operation.operation_type === 'string' ? operation.operation_type : undefined,
              summary: typeof operation.summary === 'string' ? operation.summary : undefined,
            });
          },
          onAgentStart: (agent: string, message?: string) => {
            updateAgentState(agent, 'running', message);
            if (DETOUR_TIMELINE_AGENTS.has(agent)) {
              setShowAgentTimeline(true);
            }
          },
          onAgentComplete: (agent: string, message?: string) => {
            if (agent !== 'all') {
              updateAgentState(agent, 'complete', message);
            }
          },
          onSession: (sessionId: string) => {
            if (sessionId) sessionRef.current = sessionId;
          },
          onMemoryUsage: (percentage: number) => {
            setMemoryUsage(percentage);
          },
          onMemoryError: (error: string) => {
            setMemoryWarning(error);
          },
          onError: (error: string, details?: string) => {
            console.warn('SSE Error:', error, details);
            setMessages((msgs) => msgs.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + `\n\nError: ${error}`, isStreaming: false }
                : msg
            ));
            setActiveAgents((agents) => agents.map((agent) =>
              agent.status === 'running' ? { ...agent, status: 'error' } : agent
            ));
            setIsLoading(false);
            setAgentStep(0);
            setAgentPause(null);
          },
          onDone: (finalMessage: string) => {
            setMessages((msgs) => msgs.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: finalMessage || msg.content, isStreaming: false }
                : msg
            ));
            setIsLoading(false);
            setAgentStep(0);
            setAgentPause(null);
          },
          // AEGIS agent-specific callbacks
          onAgentThinking: (step: number) => {
            setAgentStep(step);
          },
          onAgentPause: (seconds: number, reason: string) => {
            setAgentPause({ seconds, reason });
            // Auto-clear after the pause duration
            setTimeout(() => setAgentPause(null), seconds * 1000);
          },
          onNarration: (text: string, style: string) => {
            setMessages((msgs) => msgs.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, narrations: [...(msg.narrations || []), { text, style }] }
                : msg
            ));
          },
          onSceneMood: () => {},
        });

        const messageContent = buildContextPrefixedMessage(userMessage.content, contextSatellites);

        if (shouldUseOrchestration(userMessage.content)) {
          await sseClientRef.current.streamOrchestratedChat(
            messageContent,
            sessionRef.current,
            mapSessionRef.current,
          );
        } else if (typeof sseClientRef.current.streamAgentChat === 'function') {
          await sseClientRef.current.streamAgentChat(
            [{ role: 'user', content: messageContent }],
            sceneState as unknown as Record<string, unknown>,
            sessionRef.current,
          );
        } else {
          await sseClientRef.current.streamChat(
            [{ role: 'user', content: messageContent }],
            sceneState as unknown as Record<string, unknown>,
            sessionRef.current,
          );
        }
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
          try { cesiumController.dispatchAll(response.actions); } catch (error) { console.warn('Cesium actions failed:', error); }
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.warn('Chat error:', error);
      setMessages((msgs) => msgs.map((msg) =>
        msg.id === assistantMessageId
          ? { ...msg, content: `Errore: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`, isStreaming: false }
          : msg
      ));
      setIsLoading(false);
    }
  }, [
    contextSatellites,
    isLoading,
    onSendMessage,
    onSimulationControl,
    updateAgentState,
    useStreaming,
  ]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText(input);
    }
  }, [handleSendText, input]);

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
    sseClientRef.current?.close();
    sessionRef.current = generateSessionId();
    mapSessionRef.current = generateSessionId();
    setIsLoading(false);
    setMessages([]);
    setInput('');
    setStreamingText('');
    setCurrentToolCalls([]);
    setExpandedActions(new Set());
    setExpandedTools(new Set());
    setActiveAgents([]);
    setMemoryUsage(0);
    setMemoryWarning(null);
    setPendingOperation(null);
    setShowAgentTimeline(false);
    setAgentStep(0);
    setAgentPause(null);
  }, []);

  return (
      <div className="flex flex-col h-full">
        {/* Compact status bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-sda-border-default/30">
          <div className="flex items-center gap-2">
            <Tag minimal intent="primary" className="!text-[10px] !px-1.5 !py-0 !min-h-0">
              <Icon icon="satellite" size={8} className="mr-0.5" /> AEGIS
            </Tag>
            <MemoryIndicator percentage={memoryUsage} />
            {memoryWarning && (
              <Tag minimal intent="warning" className="!text-[10px] !px-1.5 !py-0 !min-h-0">
                <Icon icon="warning-sign" size={8} className="mr-0.5" /> Mem
              </Tag>
            )}
            {pendingOperation && (
              <Tag minimal intent="warning" className="!text-[10px] !px-1.5 !py-0 !min-h-0">
                <Icon icon="warning-sign" size={8} className="mr-0.5" /> Confirm
              </Tag>
            )}
          </div>
          <button
            onClick={handleNewSession}
            className="p-1 rounded hover:bg-sda-bg-tertiary text-sda-text-muted hover:text-sda-text-primary transition-colors"
            title={isLoading ? 'Stop and reset' : 'New Session'}
          >
            <RotateCcwIcon size={14} />
          </button>
        </div>
        {memoryWarning && (
          <p className="text-[10px] text-orange-300 px-3 py-1">{memoryWarning}</p>
        )}
        {pendingOperation && (
          <div className="px-3 py-2 border-b border-amber-700/20 bg-amber-950/20">
            <p className="text-[11px] font-medium text-amber-300">Confirmation required</p>
            <p className="text-[11px] text-sda-text-secondary">
              {pendingOperation.summary || pendingOperation.operation_type || 'Operazione pronta'}
            </p>
          </div>
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
                  <p className="text-sm font-medium text-sda-text-secondary">AEGIS Agent</p>
                  <p className="text-xs mt-0.5">Autonomous map control, analysis & briefing</p>
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

                {/* Narration blocks */}
                {message.narrations && message.narrations.length > 0 && (
                  <div className="space-y-1.5 pl-1">
                    {message.narrations.map((narration, idx) => {
                      const styleConfig = NARRATION_STYLES[narration.style] || NARRATION_STYLES.info;
                      const NarrationIcon = styleConfig.icon;
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 px-3 py-2 rounded-md ${styleConfig.bg} border ${styleConfig.border}`}
                        >
                          <NarrationIcon size={14} className="mt-0.5 flex-shrink-0 opacity-80" />
                          <p className="text-xs text-sda-text-secondary leading-relaxed">{narration.text}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

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
                      <div className="mt-1 rounded-md bg-sda-bg-primary/80 border border-sda-border-default/50 p-2 max-h-48 overflow-y-auto">
                        {message.toolCalls.map((toolCall, idx) => (
                          <div key={idx} className="text-[11px] py-0.5 font-mono border-b border-sda-border-default/30 last:border-0 flex items-center gap-1.5">
                            {isCesiumAction(toolCall.tool_name) ? (
                              <MapPinIcon size={10} className="text-sda-accent-cyan flex-shrink-0" />
                            ) : (
                              <WrenchIcon size={10} className="text-sda-text-muted flex-shrink-0" />
                            )}
                            <span className="text-sda-text-secondary truncate">
                              {formatToolCall(toolCall)}
                            </span>
                            {isCesiumAction(toolCall.tool_name) && (
                              <span className="text-[9px] text-sda-accent-cyan bg-sda-accent-cyan/10 px-1 rounded flex-shrink-0">MAP</span>
                            )}
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

            {/* Agent thinking indicator */}
            {isLoading && agentStep > 0 && (
              <div className="flex items-center gap-2 text-sda-text-muted px-2 py-1.5 rounded-md bg-sda-bg-tertiary/50">
                <BrainIcon size={14} className="text-sda-accent-cyan animate-pulse" />
                <span className="text-xs">Step {agentStep} &mdash; AEGIS sta elaborando...</span>
              </div>
            )}

            {/* Agent pause indicator */}
            {agentPause && (
              <div className="flex items-center gap-2 text-sda-text-muted px-2 py-1.5 rounded-md bg-amber-950/30 border border-amber-700/30">
                <PauseIcon size={14} className="text-amber-400" />
                <span className="text-xs">
                  AEGIS sta osservando... {agentPause.reason && `(${agentPause.reason})`}
                </span>
              </div>
            )}

            {/* Generic loading */}
            {isLoading && !streamingText && agentStep === 0 && (
              <div className="flex items-center gap-2 text-sda-text-muted">
                <Spinner size={14} />
                <span className="text-xs">Connecting...</span>
              </div>
            )}

            {isStepByStepMode && (
              <DetourAgentPanel
                onStepComplete={(agent, approved) => console.log(`Step ${agent} ${approved ? 'approved' : 'rejected'}`)}
                onPipelineComplete={(result) => console.log('Pipeline completed:', result)}
                onPipelineCancelled={() => console.log('Pipeline cancelled')}
              />
            )}

            <div ref={messagesEndRef} />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Chat input */}
        <div className="border-t border-sda-border-default/30">
          {/* Satellite context chips */}
          {contextSatellites.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1">
              {contextSatellites.map((sat) => (
                <span
                  key={sat.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sda-accent-cyan/15 text-sda-accent-cyan border border-sda-accent-cyan/30"
                >
                  <Icon icon="satellite" size={10} />
                  {sat.name}
                  {onRemoveContextSatellite && (
                    <button
                      onClick={() => onRemoveContextSatellite(sat.id)}
                      className="ml-0.5 hover:text-white transition-colors"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Chiedi ad AEGIS..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-sda-text-primary placeholder:text-sda-text-muted border-0 outline-none min-h-[36px] max-h-[128px] py-2 leading-5"
            />
            <button
              onClick={() => handleSendText(input)}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded bg-sda-accent-cyan text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sda-accent-cyan/80 transition-colors"
            >
              {isLoading ? <Spinner size={14} /> : <SendIcon size={14} />}
            </button>
          </div>
          <div className="px-3 pb-1.5">
            <span className="text-[10px] text-sda-text-muted">Enter to send · Shift+Enter for new line</span>
          </div>
        </div>
      </div>
  );
}
