import { useEffect, useState } from 'react';
import { Icon, IconName } from '@blueprintjs/core';
import { NARRATIVE_SCRIPT, type NarrativeEvent } from '@/lib/simulation/italyDefenseScenario';

interface ItalyDefenseNarrativeProps {
  simulationTime: number;
  isPlaying: boolean;
}

export function ItalyDefenseNarrative({ simulationTime, isPlaying }: ItalyDefenseNarrativeProps) {
  const [currentMessage, setCurrentMessage] = useState<NarrativeEvent | null>(null);
  const [messageHistory, setMessageHistory] = useState<NarrativeEvent[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Find the most recent message that should be displayed
    const currentEvent = NARRATIVE_SCRIPT
      .filter(event => event.time <= simulationTime)
      .pop();

    if (currentEvent && currentEvent.time !== currentMessage?.time) {
      setCurrentMessage(currentEvent);
      setIsVisible(true);

      // Add to history if new
      setMessageHistory(prev => {
        if (prev.find(m => m.time === currentEvent.time)) return prev;
        return [...prev, currentEvent];
      });

      // Auto-clear after a delay (except critical)
      if (currentEvent.priority !== 'critical') {
        const timeout = setTimeout(() => {
          setCurrentMessage(null);
        }, 10000);
        return () => clearTimeout(timeout);
      }
    }
  }, [simulationTime, currentMessage]);

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
      case 'critical': return 'text-red-400';
      case 'warning': return 'text-orange-400';
      case 'success': return 'text-green-400';
      default: return 'text-cyan-400';
    }
  };

  return (
    <>
      {/* Current Message Display */}
      {isVisible && currentMessage && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 max-w-sm p-3 rounded-lg border-2 shadow-2xl backdrop-blur-sm animate-fade-in ${getPriorityStyles(currentMessage.priority)}`}
        >
          <div className="flex items-start gap-2">
            <div className={`flex-shrink-0 mt-0.5 ${getIconColor(currentMessage.priority)}`}>
              <Icon icon={(currentMessage.icon || 'info-sign') as IconName} size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                  {currentMessage.speaker}
                </span>
                <span className="text-xs opacity-50">
                  {(() => {
                    const mins = Math.floor(currentMessage.time / 60);
                    const secs = currentMessage.time % 60;
                    return `T+${mins}:${String(secs).padStart(2, '0')}`;
                  })()}
                </span>
              </div>
              <p className="text-xs leading-relaxed font-medium">
                {currentMessage.message}
              </p>
            </div>
            <button
              onClick={() => setIsVisible(false)}
              className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
              title="Close"
            >
              <Icon icon="cross" size={14} className="opacity-70" />
            </button>
          </div>
        </div>
      )}

      {/* Mission Log Toggle */}
      {messageHistory.length > 0 && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="fixed bottom-4 right-4 z-50 px-3 py-1.5 bg-slate-800/90 border border-slate-600 rounded-lg text-xs text-slate-300 hover:bg-slate-700 transition-colors"
        >
          <Icon icon="history" size={12} className="mr-1" />
          Log ({messageHistory.length})
        </button>
      )}

      {/* Message History Panel */}
      {showHistory && (
        <div className="fixed bottom-12 right-4 z-50 w-96 max-h-64 overflow-y-auto bg-slate-900/95 border border-slate-600 rounded-lg shadow-2xl backdrop-blur-sm">
          <div className="sticky top-0 bg-slate-900 p-3 border-b border-slate-700 flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-300">Mission Log</span>
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
                  <Icon icon={(msg.icon || 'info-sign') as IconName} size={14} className={getIconColor(msg.priority)} />
                  <span className="text-xs font-bold opacity-70">{msg.speaker}</span>
                  <span className="text-xs opacity-50">
                    T+{Math.floor(msg.time / 60)}:{String(msg.time % 60).padStart(2, '0')}
                  </span>
                </div>
                <p className="text-xs leading-relaxed">{msg.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
