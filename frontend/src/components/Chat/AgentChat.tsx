'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, InputGroup, Card, Elevation, Tag, Spinner, Icon, Collapse, Divider } from '@blueprintjs/core';
import { cesiumController, CesiumAction } from '@/lib/cesium/controller';
import { SSEChatClient } from '@/lib/sse-client';
import { MarkdownMessage } from './MarkdownMessage';

interface ChatDisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  actions?: CesiumAction[];
  toolCalls?: { tool_name: string; arguments: Record<string, unknown> }[];
  timestamp: string;
  isStreaming?: boolean;
}

interface AgentChatProps {
  onSendMessage?: (message: string, sceneState: Record<string, unknown>) => Promise<{ message: string; actions: CesiumAction[] }>;
  initialMessages?: ChatDisplayMessage[];
  useStreaming?: boolean;
}

export function AgentChat({ onSendMessage, initialMessages = [], useStreaming = true }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatDisplayMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [currentToolCalls, setCurrentToolCalls] = useState<{ tool_name: string; arguments: Record<string, unknown> }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sseClientRef = useRef<SSEChatClient | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  useEffect(() => {
    return () => {
      sseClientRef.current?.close();
    };
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatDisplayMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingText('');
    setCurrentToolCalls([]);

    try {
      const sceneState = cesiumController.getSceneState();

      if (useStreaming) {
        const assistantMessageId = (Date.now() + 1).toString();
        
        const assistantMessage: ChatDisplayMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          actions: [],
          toolCalls: [],
          timestamp: new Date().toISOString(),
          isStreaming: true,
        };
        
        setMessages((prev) => [...prev, assistantMessage]);

        sseClientRef.current = new SSEChatClient({
          onThinking: () => {},
          
          onMessageChunk: (chunk: string, isComplete: boolean) => {
            setStreamingText((prev) => {
              const newText = prev + chunk;
              setMessages((msgs) =>
                msgs.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: newText, isStreaming: !isComplete }
                    : msg
                )
              );
              return newText;
            });
          },
          
          onToolCall: (toolName: string, args: Record<string, unknown>) => {
            const toolCall = { tool_name: toolName, arguments: args };
            setCurrentToolCalls((prev) => [...prev, toolCall]);
            setMessages((msgs) =>
              msgs.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, toolCalls: [...(msg.toolCalls || []), toolCall] }
                  : msg
              )
            );
          },
          
          onAction: (action: { type: string; payload: Record<string, unknown> }) => {
            const cesiumAction: CesiumAction = {
              type: action.type as CesiumAction['type'],
              payload: action.payload,
            };
            try {
              cesiumController.dispatch(cesiumAction);
            } catch (error) {
              console.warn('Cesium action failed (viewer not available):', error);
            }
            setMessages((msgs) =>
              msgs.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, actions: [...(msg.actions || []), cesiumAction] }
                  : msg
              )
            );
          },
          
          onError: (error: string, details?: string) => {
            console.error('SSE Error:', error, details);
            setMessages((msgs) =>
              msgs.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + `\n\nError: ${error}`, isStreaming: false }
                  : msg
              )
            );
          },
          
          onDone: (finalMessage: string, actionsCount: number) => {
            setMessages((msgs) =>
              msgs.map((msg) =>
                msg.id === assistantMessageId
                  ? { 
                      ...msg, 
                      content: finalMessage || msg.content,
                      isStreaming: false,
                    }
                  : msg
              )
            );
            setIsLoading(false);
          },
        });

        await sseClientRef.current.streamChat(
          [{ role: 'user', content: userMessage.content }],
          sceneState as unknown as Record<string, unknown>,
        );
        
        } else if (onSendMessage) {
        const response = await onSendMessage(userMessage.content, sceneState as unknown as Record<string, unknown>);
        
        const assistantMessage: ChatDisplayMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.message,
          actions: response.actions,
          timestamp: new Date().toISOString(),
        };
        
        setMessages((prev) => [...prev, assistantMessage]);
        
        if (response.actions && response.actions.length > 0) {
          try {
            cesiumController.dispatchAll(response.actions);
          } catch (error) {
            console.warn('Cesium actions failed (viewer not available):', error);
          }
        }
        
        setIsLoading(false);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        const mockResponse: ChatDisplayMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Analizzando la richiesta: "${userMessage.content}"\n\nPer procedere con la simulazione, ho bisogno di ulteriori dettagli sui parametri desiderati.`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, mockResponse]);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatDisplayMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Errore: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
    }
  }, [input, isLoading, onSendMessage, useStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleActions = (messageId: string) => {
    setExpandedActions((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const toggleTools = (messageId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const formatAction = (action: CesiumAction): string => {
    switch (action.type) {
      case 'cesium.setClock':
        return `⏱️ Set Clock: ${action.payload.multiplier}x`;
      case 'cesium.loadCzml':
        return `📡 Load CZML: "${String(action.payload.layerId)}"`;
      case 'cesium.addEntity':
        return `🛰️ Add ${String(action.payload.entityType)}: ${String(action.payload.name)}`;
      case 'cesium.flyTo':
        const coords = action.payload.entityId 
          ? `entity: ${String(action.payload.entityId)}`
          : `(${Number(action.payload.longitude).toFixed(2)}, ${Number(action.payload.latitude).toFixed(2)})`;
        return `🎯 FlyTo: ${coords}`;
      case 'cesium.toggle':
        const toggles = [];
        if (action.payload.showOrbits !== undefined) toggles.push(`orbits: ${action.payload.showOrbits ? 'ON' : 'OFF'}`);
        if (action.payload.showCoverage !== undefined) toggles.push(`coverage: ${action.payload.showCoverage ? 'ON' : 'OFF'}`);
        return `🔘 Toggle: ${toggles.join(', ')}`;
      case 'cesium.removeLayer':
        return `🗑️ Remove Layer: ${String(action.payload.layerId)}`;
      case 'cesium.setSelected':
        return `👆 Select: ${action.payload.entityId ? String(action.payload.entityId) : 'none'}`;
      default:
        return `❓ Unknown action`;
    }
  };

  const formatToolCall = (toolCall: { tool_name: string; arguments: Record<string, unknown> }): string => {
    const args = Object.entries(toolCall.arguments)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(', ');
    return `🔧 ${toolCall.tool_name}(${args})`;
  };

  const quickPrompts = [
    'Simula 2 ore con 3 satelliti',
    'Mostra access windows a Fucino',
    'Fly to ISS',
    'Calcola conjunctions',
  ];

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

   return (
     <div className="flex flex-col h-full glass-panel">
       <div className="p-3 border-b border-sda-border-default/50">
        <h2 className="text-lg font-semibold text-sda-text-primary flex items-center gap-2">
          <Icon icon="chat" className="text-sda-accent-cyan" />
          AI Assistant
          {useStreaming && (
            <Tag minimal intent="success" className="ml-2">
              <Icon icon="satellite" size={10} /> SSE
            </Tag>
          )}
        </h2>
        <p className="text-xs text-sda-text-muted">Ask for simulations, analysis, or map controls</p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sda-text-muted py-8">
            <Icon icon="chat" size={40} className="mb-2 opacity-50" />
            <p className="text-sm">Start a conversation with the AI agent</p>
            <p className="text-xs mt-1">Try asking for simulations or analysis</p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
               <div
                 className={`max-w-[85%] rounded-lg px-3 py-2 ${
                   message.role === 'user'
                     ? 'bg-sda-bg-tertiary text-sda-accent-blue'
                     : 'bg-sda-bg-secondary text-sda-text-primary'
                 }`}
               >
                <div className="text-sm">
                  {message.role === 'assistant' ? (
                    <MarkdownMessage content={message.content} />
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 ml-1 bg-sda-accent-cyan animate-pulse" />
                  )}
                </div>
                <div className="text-xs opacity-60 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>

            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="pl-4">
                <Button
                  small
                  minimal
                  icon={expandedTools.has(message.id) ? 'chevron-down' : 'chevron-right'}
                  onClick={() => toggleTools(message.id)}
                  className="text-sda-text-muted text-xs"
                >
                  Tools ({message.toolCalls.length})
                </Button>
                 <Collapse isOpen={expandedTools.has(message.id)}>
                   <Card elevation={Elevation.ONE} className="mt-2 p-2 glass-panel">
                     {message.toolCalls.map((toolCall, idx) => (
                       <div
                         key={idx}
                         className="text-xs text-sda-text-secondary py-1 border-b border-sda-border-default last:border-0 font-mono"
                       >
                        {formatToolCall(toolCall)}
                      </div>
                    ))}
                  </Card>
                </Collapse>
              </div>
            )}

            {message.actions && message.actions.length > 0 && (
              <div className="pl-4">
                <Button
                  small
                  minimal
                  icon={expandedActions.has(message.id) ? 'chevron-down' : 'chevron-right'}
                  onClick={() => toggleActions(message.id)}
                  className="text-sda-text-muted text-xs"
                >
                  Actions ({message.actions.length})
                </Button>
                 <Collapse isOpen={expandedActions.has(message.id)}>
                   <Card elevation={Elevation.ONE} className="mt-2 p-2 glass-panel">
                     {message.actions.map((action, idx) => (
                       <div
                         key={idx}
                         className="text-xs text-sda-text-secondary py-1 border-b border-sda-border-default last:border-0"
                       >
                        {formatAction(action)}
                      </div>
                    ))}
                  </Card>
                </Collapse>
              </div>
            )}
          </div>
        ))}

         {isLoading && !streamingText && (
           <div className="flex justify-start">
             <div className="glass-panel rounded-lg px-3 py-2 flex items-center gap-2">
              <Spinner size={16} />
              <span className="text-sm text-sda-text-muted">AI is thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length === 0 && (
        <div className="px-3 pb-2">
          <p className="text-xs text-sda-text-muted mb-2">Quick prompts:</p>
          <div className="flex flex-wrap gap-1">
            {quickPrompts.map((prompt) => (
              <Tag
                key={prompt}
                minimal
                interactive
                className="cursor-pointer text-xs"
                onClick={() => handleQuickPrompt(prompt)}
              >
                {prompt}
              </Tag>
            ))}
          </div>
        </div>
      )}

      <Divider />

      <div className="p-3">
        <InputGroup
          placeholder="Ask for a simulation, analysis, or map action..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          large
          rightElement={
            <Button
              icon="send-message"
              intent="primary"
              minimal
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            />
          }
          className="bg-sda-bg-primary"
        />
      </div>
    </div>
  );
}
