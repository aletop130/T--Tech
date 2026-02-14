import { Icon } from '@blueprintjs/core';
import { GUARDIAN_ANGEL_SCENARIO } from '@/lib/simulation/scenarioData';

interface MissionHUDProps {
  simulationTime: number;
  totalDuration: number;
  stepMode: boolean;
  currentStep: number;
  keyEvents: number[];
  satellites: {
    id: string;
    name: string;
    status: string;
    fuelPercent: number;
  }[];
  groundAssets: {
    id: string;
    name: string;
    status: string;
  }[];
  isPlaying: boolean;
  isComplete: boolean;
  isPaused?: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onToggleStepMode: () => void;
  onNextStep: () => void;
  onPrevStep: () => void;
}

export function MissionHUD({
  simulationTime,
  totalDuration,
  stepMode,
  currentStep,
  keyEvents,
  satellites,
  groundAssets,
  isPlaying,
  isComplete,
  isPaused = false,
  onPlayPause,
  onReset,
  onToggleStepMode,
  onNextStep,
  onPrevStep,
}: MissionHUDProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `T+${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = (simulationTime / totalDuration) * 100;
  const totalSteps = Math.ceil(totalDuration / 30);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
      case 'operational':
      case 'nominal':
        return 'bg-green-500';
      case 'degraded':
      case 'caution':
        return 'bg-yellow-500';
      case 'maneuvering':
        return 'bg-blue-500 animate-pulse';
      case 'offline':
      case 'critical':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const nextEventTime = keyEvents.find(e => e > simulationTime);
  const currentEventIndex = keyEvents.findIndex(e => e > simulationTime) - 1;
  const currentEvent = currentEventIndex >= 0 ? GUARDIAN_ANGEL_SCENARIO.events[currentEventIndex] : null;
  const isAtKeyEvent = keyEvents.includes(Math.floor(simulationTime / 30) * 30);

  return (
    <div className="fixed top-4 right-4 z-50 w-80 bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl backdrop-blur-sm">
      {/* Header */}
      <div className="p-3 border-b border-slate-700 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-bold text-cyan-400">OPERATION GUARDIAN ANGEL</h3>
          <p className="text-xs text-slate-400">SAR Warfare Simulation</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPrevStep}
            disabled={simulationTime <= 0 || isComplete}
            className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            title="Previous Step"
          >
            <Icon icon="chevron-left" size={16} className="text-white" />
          </button>
          
          {isPaused && !isComplete ? (
            <button
              onClick={onNextStep}
              className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded transition-colors flex items-center gap-1"
              title="Continue Simulation"
            >
              <Icon icon="play" size={14} className="text-white" />
              <span className="text-xs text-white font-semibold">CONTINUE</span>
            </button>
          ) : (
            <button
              onClick={onPlayPause}
              className="p-2 bg-cyan-600 hover:bg-cyan-500 rounded transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              <Icon icon={isPlaying ? 'pause' : 'play'} size={14} className="text-white" />
            </button>
          )}
          
          <button
            onClick={onReset}
            className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            title="Reset"
          >
            <Icon icon="reset" size={14} className="text-slate-300" />
          </button>
        </div>
      </div>

      {/* Timer and Progress */}
      <div className="p-3 border-b border-slate-700">
        <div className="flex justify-between items-center mb-2">
          <span className="text-2xl font-mono font-bold text-white">
            {formatTime(simulationTime)}
          </span>
          <span className="text-xs text-slate-400">
            / {formatTime(totalDuration)}
          </span>
        </div>
        
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-cyan-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {nextEventTime && (
          <div className="mt-2 text-xs text-slate-500">
            Next checkpoint: {formatTime(nextEventTime)}
          </div>
        )}
      </div>

      {/* Current Event Description */}
      {currentEvent && (
        <div className="p-3 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-2 mb-1">
            <Icon icon="info-sign" size={12} className="text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-400 uppercase">Current Event</span>
          </div>
          <p className="text-sm text-slate-200">{currentEvent.description}</p>
        </div>
      )}

      {/* Satellites Status */}
      <div className="p-3 border-b border-slate-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          <Icon icon="satellite" size={12} className="mr-1" />
          Space Assets
        </h4>
        <div className="space-y-2">
          {satellites.map((sat) => (
            <div key={sat.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(sat.status)}`} />
                <span className="text-sm text-slate-200">{sat.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${sat.status === 'maneuvering' ? 'text-blue-400 animate-pulse' : 'text-slate-400'}`}>
                  {sat.status.toUpperCase()}
                </span>
                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500"
                    style={{ width: `${sat.fuelPercent}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ground Assets */}
      <div className="p-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          <Icon icon="globe" size={12} className="mr-1" />
          Ground Assets
        </h4>
        <div className="space-y-2">
          {groundAssets.map((asset) => (
            <div key={asset.id} className="flex items-center justify-between">
              <span className="text-sm text-slate-200">{asset.name}</span>
              <span className={`text-xs ${getStatusColor(asset.status).replace('bg-', 'text-')}`}>
                {asset.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Status Footer */}
      <div className="p-2 bg-slate-800/50 rounded-b-lg">
        <div className="flex justify-center">
          <span className={`text-xs font-mono ${isComplete ? 'text-green-400' : isPaused ? 'text-amber-400' : 'text-green-400'}`}>
            {isComplete ? '✓ MISSION COMPLETE' : isPaused ? '⏸ PAUSED - Press Continue to advance' : '▶ SIMULATION RUNNING'}
          </span>
        </div>
      </div>
    </div>
  );
}
