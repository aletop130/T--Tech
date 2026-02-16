import { useEffect, useState, useRef, useCallback } from 'react';
import { Icon, IconName } from '@blueprintjs/core';
import { ApiClient } from '@/lib/api';

interface AINarrativeProps {
  simulationTime: number;
  isPlaying: boolean;
  isPaused?: boolean;
  eventKey?: string;
  satellites?: Array<{ id: string; name: string; status: string }>;
  groundAssets?: Array<{ id: string; name: string; status: string }>;
}

interface StreamedMessage {
  id: string;
  content: string;
  speaker: string;
  priority: 'info' | 'warning' | 'success' | 'critical';
  icon?: IconName;
  timestamp: number;
}

const EVENT_PROMPTS: Record<string, { prompt: string; speaker: string; priority: 'info' | 'warning' | 'success' | 'critical'; icon: IconName }> = {
  'start': {
    prompt: 'Describe the start of a SAR (Search and Rescue) operation. Allied special forces team Phantom-6 has been isolated 45km southwest of Misrata. The mission is to extract them using satellite overwatch and a helicopter. Keep it brief - 2-3 sentences maximum.',
    speaker: 'Mission Control',
    priority: 'info',
    icon: 'play',
  },
  'cyber_attack': {
    prompt: 'A cyber attack is in progress. Enemy ground station is attempting to jam the reconnaissance satellite ReconSat-1\'s SAR payload. Signal degradation at 40%. AI defensive protocols are engaging. Keep it brief - 2 sentences.',
    speaker: 'Threat Detection AI',
    priority: 'warning',
    icon: 'warning-sign',
  },
  'evasive_burn': {
    prompt: 'The reconnaissance satellite ReconSat-1 has executed an evasive orbital adjustment maneuver to avoid the cyber attack. Describe this in 2 sentences.',
    speaker: 'AI Control System',
    priority: 'success',
    icon: 'refresh',
  },
  'hostile_approach': {
    prompt: 'A hostile reconnaissance satellite (HostileSat-Alpha) is approaching ReconSat-1. This could be an anti-satellite maneuver or collision attempt. Probability of intentional intercept: 78%. Keep it brief - 2 sentences.',
    speaker: 'Threat Detection AI',
    priority: 'warning',
    icon: 'eye-open',
  },
  'avoidance_success': {
    prompt: 'The avoidance maneuver was successful. The closest approach distance increased to 12.7km. The hostile satellite cannot maintain pursuit without excessive fuel expenditure. The threat has been neutralized. Keep it brief.',
    speaker: 'AI Control System',
    priority: 'success',
    icon: 'shield',
  },
  'ground_ops': {
    prompt: 'Transitioning to ground operations. HMS Defender has launched MH-60 Seahawk for extraction. The Phantom-6 team is located in WADI_AL_KUF, 4km from last known position. Keep it brief - 2 sentences.',
    speaker: 'Mission Control',
    priority: 'info',
    icon: 'airplane',
  },
  'visual_contact': {
    prompt: 'Visual contact established with Phantom-6 team. 6 personnel detected, all vital signs nominal. Helicopter proceeding to extraction point. Keep it brief.',
    speaker: 'Reconnaissance AI',
    priority: 'success',
    icon: 'tick-circle',
  },
  'extraction': {
    prompt: 'All personnel accounted for. Helicopter lifting off with rescue team. En route to HMS Defender. Satellite maintaining overwatch. Keep it brief - 1-2 sentences.',
    speaker: 'Mission Control',
    priority: 'success',
    icon: 'import',
  },
  'complete': {
    prompt: 'Operation Guardian Angel is complete. All 6 personnel recovered safely and transported to HMS Defender. Mission objectives achieved with zero friendly casualties. Keep it brief.',
    speaker: 'Mission Control',
    priority: 'success',
    icon: 'tick',
  },
};

export function AINarrative({
  simulationTime,
  isPlaying,
  isPaused = false,
  satellites = [],
  groundAssets = [],
}: AINarrativeProps) {
  const [currentMessage, setCurrentMessage] = useState<StreamedMessage | null>(null);
  const [messageHistory, setMessageHistory] = useState<StreamedMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const lastEventRef = useRef<string>('');
  const streamControllerRef = useRef<ReadableStreamDefaultController | null>(null);

  const triggerEvent = useCallback(async (eventKey: string) => {
    if (isStreaming || lastEventRef.current === eventKey) return;
    
    lastEventRef.current = eventKey;
    setIsStreaming(true);

    const eventConfig = EVENT_PROMPTS[eventKey];
    if (!eventConfig) {
      setIsStreaming(false);
      return;
    }

    const messageId = `${eventKey}-${Date.now()}`;
    setCurrentMessage({
      id: messageId,
      content: '',
      speaker: eventConfig.speaker,
      priority: eventConfig.priority,
      icon: eventConfig.icon,
      timestamp: simulationTime,
    });

    try {
      const api = new ApiClient();
      const messages = [
        { role: 'user' as const, content: eventConfig.prompt }
      ];

      const sceneState = {
        simulation_time: simulationTime,
        satellites: satellites.map(s => ({ id: s.id, name: s.name, status: s.status })),
        ground_assets: groundAssets.map(a => ({ id: a.id, name: a.name, status: a.status })),
      };

      const response = await api.chatStream(messages, sceneState);
      
      if (!response) {
        throw new Error('No response from AI');
      }

      const reader = response.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content' || data.type === 'message') {
                const content = data.content || data.delta || '';
                accumulatedContent += content;
                setCurrentMessage(prev => prev ? {
                  ...prev,
                  content: accumulatedContent
                } : null);
              }
            } catch {
              // Try to parse as plain text
              const text = line.slice(6).trim();
              if (text && text !== '[DONE]') {
                accumulatedContent += text;
                setCurrentMessage(prev => prev ? {
                  ...prev,
                  content: accumulatedContent
                } : null);
              }
            }
          }
        }
      }

      // Add to history
      if (accumulatedContent.trim()) {
        setMessageHistory(prev => [...prev, {
          id: messageId,
          content: accumulatedContent,
          speaker: eventConfig.speaker,
          priority: eventConfig.priority,
          icon: eventConfig.icon,
          timestamp: simulationTime,
        }]);
      }
    } catch (error) {
      console.error('AI streaming error:', error);
      setCurrentMessage(prev => prev ? {
        ...prev,
        content: prev.content + ' [AI unavailable]'
      } : null);
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, simulationTime, satellites, groundAssets]);

  // Determine which event should be triggered based on simulation time
  useEffect(() => {
    if (!isPlaying && !isPaused) return;

    // Map time to events
    let eventKey = '';
    if (simulationTime >= 0 && simulationTime < 60) {
      eventKey = 'start';
    } else if (simulationTime >= 1440 - 30 && simulationTime < 1440 + 30) {
      eventKey = 'cyber_attack';
    } else if (simulationTime >= 2160 - 30 && simulationTime < 2160 + 30) {
      eventKey = 'evasive_burn';
    } else if (simulationTime >= 2880 - 30 && simulationTime < 2880 + 30) {
      eventKey = 'hostile_approach';
    } else if (simulationTime >= 3600 - 30 && simulationTime < 3600 + 30) {
      eventKey = 'avoidance_success';
    } else if (simulationTime >= 5760 - 30 && simulationTime < 5760 + 30) {
      eventKey = 'ground_ops';
    } else if (simulationTime >= 8640 - 30 && simulationTime < 8640 + 30) {
      eventKey = 'visual_contact';
    } else if (simulationTime >= 10080 - 30 && simulationTime < 10080 + 30) {
      eventKey = 'extraction';
    } else if (simulationTime >= 14400 - 60) {
      eventKey = 'complete';
    }

    if (eventKey) {
      triggerEvent(eventKey);
    }
  }, [simulationTime, isPlaying, isPaused, triggerEvent]);

  // Reset event tracking when simulation resets
  useEffect(() => {
    if (simulationTime === 0) {
      lastEventRef.current = '';
      setCurrentMessage(null);
    }
  }, [simulationTime]);

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-900/90 border-red-500 text-red-100';
      case 'warning':
        return 'bg-orange-900/90 border-orange-500 text-orange-100';
      case 'success':
        return 'bg-green-900/90 border-green-500 text-green-100';
      default:
        return 'bg-slate-800/90 border-cyan-500 text-cyan-100';
    }
  };

  const getIconColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-red-400';
      case 'warning':
        return 'text-orange-400';
      case 'success':
        return 'text-green-400';
      default:
        return 'text-cyan-400';
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `T+${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `T+${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <>
      {/* Current Streaming Message */}
      {currentMessage && (
        <div 
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 max-w-3xl w-[90%] p-4 rounded-lg border-2 shadow-2xl backdrop-blur-sm animate-fade-in ${getPriorityStyles(currentMessage.priority)}`}
        >
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 mt-1 ${getIconColor(currentMessage.priority)}`}>
              <Icon icon={currentMessage.icon || 'info-sign'} size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                  {currentMessage.speaker}
                  {isStreaming && <span className="animate-pulse ml-1">...</span>}
                </span>
                <span className="text-xs opacity-50">
                  {formatTime(currentMessage.timestamp)}
                </span>
              </div>
              <p className="text-sm leading-relaxed font-medium">
                {currentMessage.content}
                {isStreaming && <span className="animate-pulse">▊</span>}
              </p>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
              title="View message history"
            >
              <Icon icon="history" size={16} className="opacity-70" />
            </button>
          </div>
        </div>
      )}

      {/* Message History Panel */}
      {showHistory && messageHistory.length > 0 && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 max-w-3xl w-[90%] max-h-64 overflow-y-auto bg-slate-900/95 border border-slate-600 rounded-lg shadow-2xl backdrop-blur-sm">
          <div className="sticky top-0 bg-slate-900 p-3 border-b border-slate-700 flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-300">AI Mission Log</span>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1 hover:bg-white/10 rounded"
            >
              <Icon icon="cross" size={14} className="text-slate-400" />
            </button>
          </div>
          <div className="p-2 space-y-2">
            {messageHistory.map((msg, idx) => (
              <div 
                key={idx}
                className={`p-3 rounded border-l-2 ${getPriorityStyles(msg.priority)} opacity-80`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon icon={msg.icon || 'info-sign'} size={14} className={getIconColor(msg.priority)} />
                  <span className="text-xs font-bold opacity-70">{msg.speaker}</span>
                  <span className="text-xs opacity-50">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed">{msg.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
