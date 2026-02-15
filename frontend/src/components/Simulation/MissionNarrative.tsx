import { useEffect, useState } from 'react';
import { Icon, IconName } from '@blueprintjs/core';

interface NarrativeEvent {
  time: number; // seconds from simulation start
  message: string;
  priority: 'info' | 'warning' | 'success' | 'critical';
  speaker: string;
  icon?: IconName;
}

interface MissionNarrativeProps {
  simulationTime: number; // current simulation time in seconds
  isPlaying: boolean;
  stepMode?: boolean;
}

// Scripted narrative for Operation Guardian Angel - Search and Rescue
// Times scaled to 4-hour mission timeline (48x from original 5-minute scale)
const NARRATIVE_SCRIPT: NarrativeEvent[] = [
  {
    time: 0,
    message: "Operation Guardian Angel initiated. Allied special forces team Phantom-6 has been isolated 45km southwest of Misrata. Awaiting your command to begin precision SAR operation.",
    priority: 'info',
    speaker: 'Mission Control',
    icon: 'geolocation',
  },
  {
    time: 1440, // 24 minutes
    message: "⚠️ CYBER ATTACK IN PROGRESS. Enemy ground station attempting to jam ReconSat-1's SAR payload. Signal degradation at 40%. AI defensive protocols engaging...",
    priority: 'warning',
    speaker: 'Mission Control',
    icon: 'warning-sign',
  },
  {
    time: 2160, // 36 minutes
    message: "Maneuver executed. ReconSat-1 performing evasive orbital adjustment. Delta-V: 2.3 m/s. New orbital path established. Enemy jamming ineffective at new altitude. Maintaining reconnaissance coverage.",
    priority: 'success',
    speaker: 'AI Control System',
    icon: 'refresh',
  },
  {
    time: 2880, // 48 minutes
    message: "SECONDARY THREAT. Hostile reconnaissance satellite adjusting orbit toward ReconSat-1. Possible anti-satellite maneuver or collision attempt. Probability of intentional intercept: 78%.",
    priority: 'warning',
    speaker: 'Threat Detection AI',
    icon: 'eye-open',
  },
  {
    time: 3600, // 1 hour
    message: "Avoidance maneuver successful. Closest approach increased to 12.7km. Hostile satellite unable to maintain pursuit without excessive fuel expenditure. Threat neutralized. ReconSat-1 returning to primary coverage area.",
    priority: 'success',
    speaker: 'AI Control System',
    icon: 'shield',
  },
  {
    time: 5760, // 1h 36m
    message: "Transitioning to ground operations. HMS Defender has launched MH-60 Seahawk for extraction. Coordinating satellite overwatch with pilot. Phantom-6 team located in Wadi al-Kuf, 4km from last known position.",
    priority: 'info',
    speaker: 'Mission Control',
    icon: 'airplane',
  },
  {
    time: 7200, // 2 hours
    message: "ReconSat-1 providing real-time SAR imaging. Team heat signature detected 800m northeast of planned extraction point. Adjusting helicopter approach vector. New route: Bearing 340°, altitude 50ft AGL.",
    priority: 'info',
    speaker: 'Tactical Coordination AI',
    icon: 'arrow-right',
  },
  {
    time: 8640, // 2h 24m
    message: "🎯 VISUAL CONTACT. Phantom-6 team located at grid 32.084°N, 20.315°E. Count: 6 personnel. All vital signs nominal. Helicopter proceeding to extraction point.",
    priority: 'success',
    speaker: 'Reconnaissance AI',
    icon: 'user',
  },
  {
    time: 10080, // 2h 48m
    message: "TEAM BOARDING. All personnel accounted for. Helicopter lifting off with rescue team. En route to HMS Defender. Satellite maintaining overwatch.",
    priority: 'success',
    speaker: 'Mission Control',
    icon: 'import',
  },
  {
    time: 12960, // 3h 36m
    message: "Team extracted successfully. All 6 personnel on board. Satellite constellation providing continuous coverage during transit. En route back to HMS Defender. ETA: 24 minutes.",
    priority: 'success',
    speaker: 'Mission Control',
    icon: 'tick-circle',
  },
  {
    time: 14400, // 4 hours
    message: "Operation Guardian Angel complete. All personnel recovered safely and transported to HMS Defender. Satellite constellation: Full operational status. ReconSat-1 fuel reserves: 94%. Mission objectives achieved with zero friendly casualties.",
    priority: 'success',
    speaker: 'Mission Control',
    icon: 'tick',
  },
];

export function MissionNarrative({ simulationTime, isPlaying, stepMode = false }: MissionNarrativeProps) {
  const [currentMessage, setCurrentMessage] = useState<NarrativeEvent | null>(null);
  const [messageHistory, setMessageHistory] = useState<NarrativeEvent[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    // Show messages in both playing and step mode
    if (!isPlaying && !stepMode) return;

    // Find the most recent message that should be displayed
    const currentEvent = NARRATIVE_SCRIPT
      .filter(event => event.time <= simulationTime)
      .pop();

    if (currentEvent && currentEvent.time !== currentMessage?.time) {
      setCurrentMessage(currentEvent);
      
      // Add to history if new
      setMessageHistory(prev => {
        if (prev.find(m => m.time === currentEvent.time)) {
          return prev;
        }
        return [...prev, currentEvent];
      });

      // Auto-clear after 10 seconds in play mode (except for critical), 30 seconds in step mode
      const autoClearTime = stepMode ? 30000 : 8000;
      if (currentEvent.priority !== 'critical') {
        const timeout = setTimeout(() => {
          setCurrentMessage(null);
        }, autoClearTime);
        return () => clearTimeout(timeout);
      }
    }
  }, [simulationTime, isPlaying, stepMode, currentMessage]);

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

  return (
    <>
      {/* Current Message Display */}
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
                </span>
                <span className="text-xs opacity-50">
                  {(() => {
                    const hours = Math.floor(currentMessage.time / 3600);
                    const mins = Math.floor((currentMessage.time % 3600) / 60);
                    const secs = currentMessage.time % 60;
                    if (hours > 0) {
                      return `T+${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                    }
                    return `T+${mins}:${String(secs).padStart(2, '0')}`;
                  })()}
                </span>
              </div>
              <p className="text-sm leading-relaxed font-medium">
                {currentMessage.message}
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
      {showHistory && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 max-w-3xl w-[90%] max-h-64 overflow-y-auto bg-slate-900/95 border border-slate-600 rounded-lg shadow-2xl backdrop-blur-sm">
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
                  <Icon icon={msg.icon || 'info-sign'} size={14} className={getIconColor(msg.priority)} />
                  <span className="text-xs font-bold opacity-70">{msg.speaker}</span>
                  <span className="text-xs opacity-50">
                    {(() => {
                      const hours = Math.floor(msg.time / 3600);
                      const mins = Math.floor((msg.time % 3600) / 60);
                      const secs = msg.time % 60;
                      if (hours > 0) {
                        return `T+${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                      }
                      return `T+${mins}:${String(secs).padStart(2, '0')}`;
                    })()}
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
