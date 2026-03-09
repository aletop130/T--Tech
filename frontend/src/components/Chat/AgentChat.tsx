'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Tag, Spinner, Icon } from '@blueprintjs/core';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RotateCcwIcon, WrenchIcon, ChevronDownIcon, ChevronRightIcon, ZapIcon, InfoIcon, AlertTriangleIcon, ShieldIcon, ShieldAlertIcon, PauseIcon, BrainIcon, MapPinIcon } from 'lucide-react';
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

// ── Constants ──

const CHAT_CONNECT_TIMEOUT_MS = 30000;
const CHAT_STREAM_IDLE_TIMEOUT_MS = 120000; // 120s for agent mode (multi-turn can take 30-60s)

// ── Helpers ──

function describeMapUpdate(actionType: string | undefined): string {
  if (!actionType) return 'aggiornamento visuale';
  const normalized = actionType.startsWith('cesium.') ? actionType.replace('cesium.', '') : actionType;
  const labels: Record<string, string> = {
    flyTo: 'focus camera',
    flyToCountry: 'focus paese',
    searchLocation: 'ricerca luogo',
    addEntity: 'nuovo oggetto',
    toggle: 'layer aggiornati',
    setSelected: 'selezione oggetto',
    setClock: 'tempo simulazione',
    loadCzml: 'traiettorie caricate',
    removeLayer: 'layer rimosso',
    showGroundTrack: 'ground track',
    showDebrisCloud: 'debris cloud',
    showReentryFootprint: 'reentry footprint',
    showCoverageGaps: 'coverage gaps',
    showThreatRadius: 'threat radius',
    showConjunctionLine: 'conjunction line',
    showRiskHeatmap: 'risk heatmap',
    showTcaCountdown: 'TCA countdown',
    showManeuverOptions: 'opzioni manovra',
    highlightManeuver: 'manovra evidenziata',
    clearAllOverlays: 'overlay puliti',
    setSceneMood: 'atmosfera cambiata',
    annotatePoint: 'annotazione aggiunta',
    drawRegionHighlight: 'regione evidenziata',
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

const quickPrompts = [
  'Mostrami la minaccia più critica',
  'Tour della costellazione',
  'Briefing situazione',
  'Fly to ISS',
  'Analizza le congiunzioni attive',
];

// ── Component ──

export function AgentChat({
  onSendMessage,
  initialMessages = [],
  useStreaming = true,
  onSimulationControl,
  contextSatellites = [],
  onRemoveContextSatellite,
}: AgentChatProps) {
  const [messages, setMessages] = useState<ChatDisplayMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [currentToolCalls, setCurrentToolCalls] = useState<{ tool_name: string; arguments: Record<string, unknown> }[]>([]);
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

  const [activeAgents, setActiveAgents] = useState<AgentState[]>([]);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [memoryWarning, setMemoryWarning] = useState<string | null>(null);
  const [showAgentTimeline, setShowAgentTimeline] = useState(false);

  const {
    isStepByStepMode,
  } = useDetourStore();

  useEffect(() => {
    return () => {
      sseClientRef.current?.close();
    };
  }, []);

  // ── Main send handler: ALL messages go to /chat/agent ──

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
    setAgentStep(0);
    setAgentPause(null);

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
        sseClientRef.current = new SSEChatClient({
          onThinking: () => {},
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
          },
          onDone: (finalMessage: string, actionsCount: number) => {
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
          onSceneMood: (mood: string) => {
            // Scene mood is handled by the action dispatch (cesium.setSceneMood)
            // This callback is for UI state if needed
          },
        });

        // Build message content — prepend satellite context if any are pinned
        let messageContent = userMessage.content;
        if (contextSatellites.length > 0) {
          const ctx = contextSatellites.map(s =>
            `[${s.name} | NORAD:${s.norad_id} | Type:${s.object_type}${s.country ? ` | Country:${s.country}` : ''}${s.operator ? ` | Op:${s.operator}` : ''}${s.tags.length ? ` | Tags:${s.tags.join(',')}` : ''}]`
          ).join(' ');
          messageContent = `[Contesto satelliti selezionati: ${ctx}]\n\n${messageContent}`;
        }

        // Use streamAgentChat (new agent endpoint) if available, fallback to streamChat
        if (typeof sseClientRef.current.streamAgentChat === 'function') {
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
  }, [isLoading, onSendMessage, useStreaming, contextSatellites]);

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
    setAgentStep(0);
    setAgentPause(null);
  }, [isLoading]);

  const chatStatus = isLoading ? (streamingText ? 'streaming' as const : 'submitted' as const) : ('ready' as const);

  return (
    <TooltipProvider>
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
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* ai-elements PromptInput */}
        <div className="border-t border-sda-border-default/30 [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:shadow-none [&_[data-slot=input-group]]:ring-0 [&_[data-slot=input-group]]:outline-none [&_*:focus]:outline-none [&_*:focus]:ring-0 [&_*:focus]:border-0 [&_*:focus-visible]:outline-none [&_*:focus-visible]:ring-0 [&_*:focus-within]:outline-none [&_*:focus-within]:ring-0">
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
          <PromptInput onSubmit={handlePromptSubmit} className="!rounded-none !border-0 !outline-none !ring-0 !shadow-none focus-within:!border-0 focus-within:!ring-0 focus-within:!outline-none focus-within:!shadow-none">
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Chiedi ad AEGIS di controllare la mappa..."
                className="!min-h-10 !max-h-32 !text-sm !bg-transparent !border-0 !ring-0 !outline-none !shadow-none focus:!ring-0 focus:!outline-none focus:!border-0 focus:!shadow-none focus-visible:!ring-0 focus-visible:!outline-none text-sda-text-primary placeholder:text-sda-text-muted"
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
