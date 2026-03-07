import { Icon } from '@blueprintjs/core';
import {
  PHASE_LABELS,
  type SimPhase,
  type DefenseBaseState,
  type DefenseScore,
  type SatelliteDefenseState,
  type ASATMissileState,
  type HostileSatelliteState,
} from '@/lib/simulation/italyDefenseScenario';

interface ItalyDefenseHUDProps {
  simulationTime: number;
  totalDuration: number;
  currentPhase: SimPhase;
  keyEvents: number[];
  bases: DefenseBaseState[];
  satellites: SatelliteDefenseState[];
  score: DefenseScore;
  isPlaying: boolean;
  isComplete: boolean;
  isPaused?: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onNextStep: () => void;
  onPrevStep: () => void;
  freeCameraMode?: boolean;
  onToggleFreeCameraMode?: () => void;
  asatMissiles?: ASATMissileState[];
  hostileSatellites?: HostileSatelliteState[];
  defenseModifier?: number;
}

export function ItalyDefenseHUD({
  simulationTime,
  totalDuration,
  currentPhase,
  keyEvents,
  bases,
  satellites,
  score,
  isPlaying,
  isComplete,
  isPaused = false,
  onPlayPause,
  onReset,
  onNextStep,
  onPrevStep,
  asatMissiles = [],
  hostileSatellites = [],
  defenseModifier = 1.0,
}: ItalyDefenseHUDProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `T+${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = (simulationTime / totalDuration) * 100;

  const getBaseStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-green-500';
      case 'engaged': return 'bg-yellow-500 animate-pulse';
      case 'firing': return 'bg-orange-500 animate-pulse';
      case 'damaged': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getBaseStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'READY';
      case 'engaged': return 'ENGAGED';
      case 'firing': return 'FIRING';
      case 'damaged': return 'HIT';
      default: return 'UNKNOWN';
    }
  };

  const modifierPercent = Math.round(defenseModifier * 100);
  const modifierBarColor = modifierPercent >= 80 ? 'bg-green-500' :
    modifierPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const modifierTextColor = modifierPercent >= 80 ? 'text-green-400' :
    modifierPercent >= 50 ? 'text-yellow-400' : 'text-red-400';

  // Count active space threats
  const activeASATs = asatMissiles.filter(a => a.status === 'inflight').length;
  const activeHostiles = hostileSatellites.filter(h =>
    h.status === 'maneuvering' || h.status === 'proximate'
  ).length;
  const proximateHostiles = hostileSatellites.filter(h => h.status === 'proximate').length;
  const activeThreatSats = satellites.filter(s => s.activeThreats.length > 0).length;

  const nextEventTime = keyEvents.find(e => e > simulationTime);

  return (
    <div className="absolute left-4 top-16 z-50 w-96 bg-black/95 border border-slate-700 rounded-lg shadow-2xl backdrop-blur-sm max-h-[calc(100vh-6rem)] overflow-y-auto pointer-events-auto">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-cyan-400">OPERATION SCUDO D'ITALIA</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${
              currentPhase === 'BATTLE' || currentPhase === 'ENGAGEMENT'
                ? 'bg-red-900 text-red-300 animate-pulse'
                : currentPhase === 'BDA'
                  ? 'bg-green-900 text-green-300'
                  : 'bg-slate-700 text-slate-300'
            }`}>
              {PHASE_LABELS[currentPhase]}
            </span>
          </div>
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
          {!isPlaying && !isComplete ? (
            <button
              onClick={onNextStep}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded transition-colors flex items-center gap-2"
              title="Continue Simulation"
            >
              <Icon icon="play" size={16} className="text-white" />
              <span className="text-sm text-white font-semibold">CONTINUE</span>
            </button>
          ) : (
            <button
              onClick={onPlayPause}
              className="p-3 bg-cyan-600 hover:bg-cyan-500 rounded transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              <Icon icon={isPlaying ? 'pause' : 'play'} size={16} className="text-white" />
            </button>
          )}
          <button
            onClick={onReset}
            className="p-3 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            title="Reset"
          >
            <Icon icon="cross" size={16} className="text-slate-300" />
          </button>
        </div>
      </div>

      {/* Timer and Progress */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex justify-between items-center mb-3">
          <span className="text-3xl font-mono font-bold text-white">
            {formatTime(simulationTime)}
          </span>
          <span className="text-sm text-slate-400">
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

      {/* Defense Modifier Bar */}
      <div className="p-3 border-b border-slate-700">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Icon icon="satellite" size={12} className="mr-1" />
            Space-Ground Defense Link
          </h4>
          <span className={`text-sm font-mono font-bold ${modifierTextColor}`}>
            {modifierPercent}%
          </span>
        </div>
        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${modifierBarColor} transition-all duration-500`}
            style={{ width: `${modifierPercent}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Interceptor accuracy: {Math.round(defenseModifier * 100)}% | Reaction time: {
            defenseModifier > 0.3 ? `${Math.round(15 / defenseModifier)}s` : '45s (MAX)'
          }
        </div>
      </div>

      {/* Ground Threat Board */}
      <div className="p-3 border-b border-slate-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          <Icon icon="warning-sign" size={12} className="mr-1" />
          Ground Threat Board
        </h4>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="text-2xl font-mono font-bold text-red-400">{score.launched}</div>
            <div className="text-xs text-slate-500">LAUNCHED</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-mono font-bold text-green-400">{score.intercepted}</div>
            <div className="text-xs text-slate-500">KILLED</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-mono font-bold text-orange-400">{score.missed}</div>
            <div className="text-xs text-slate-500">MISSED</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-mono font-bold text-red-600">{score.basesHit}</div>
            <div className="text-xs text-slate-500">HITS</div>
          </div>
        </div>
      </div>

      {/* Space Threat Board */}
      <div className="p-3 border-b border-slate-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          <Icon icon="satellite" size={12} className="mr-1" />
          Space Threat Board
        </h4>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="text-center">
            <div className="text-lg font-mono font-bold text-fuchsia-400">{score.asatLaunched}</div>
            <div className="text-xs text-slate-500">ASAT</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono font-bold text-green-400">{score.asatIntercepted}</div>
            <div className="text-xs text-slate-500">EVADED</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono font-bold text-red-400">{score.satellitesDestroyed}</div>
            <div className="text-xs text-slate-500">LOST</div>
          </div>
        </div>
        <div className="space-y-1">
          {activeASATs > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
              <span className="text-fuchsia-300">{activeASATs} ASAT missile(s) inflight</span>
            </div>
          )}
          {activeHostiles > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${proximateHostiles > 0 ? 'bg-red-500' : 'bg-orange-500'} animate-pulse`} />
              <span className={proximateHostiles > 0 ? 'text-red-300' : 'text-orange-300'}>
                {activeHostiles} co-orbital threat(s) {proximateHostiles > 0 ? '- PROXIMATE' : 'approaching'}
              </span>
            </div>
          )}
          {score.ewAttacksCountered > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-green-300">{score.ewAttacksCountered} EW attack(s) countered</span>
            </div>
          )}
          {score.cyberAttacksDetected > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              <span className="text-cyan-300">{score.cyberAttacksDetected} cyber attack(s) detected</span>
            </div>
          )}
        </div>
      </div>

      {/* Base Status Grid */}
      <div className="p-3 border-b border-slate-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          <Icon icon="shield" size={12} className="mr-1" />
          Defense Installations
        </h4>
        <div className="grid grid-cols-2 gap-1">
          {bases.map(bs => (
            <div key={bs.id} className="flex items-center gap-2 py-1">
              <div className={`w-2 h-2 rounded-full ${getBaseStatusColor(bs.status)}`} />
              <span className="text-xs text-slate-300 flex-1 truncate">{bs.base.name}</span>
              <span className={`text-xs font-mono ${
                bs.status === 'damaged' ? 'text-red-400' :
                bs.status === 'firing' ? 'text-orange-400' :
                'text-green-400'
              }`}>
                {getBaseStatusText(bs.status)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Satellite Status */}
      <div className="p-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          <Icon icon="satellite" size={12} className="mr-1" />
          Space Assets
        </h4>
        <div className="space-y-1">
          {satellites.map(sat => {
            const eff = Math.round((sat.effectivenessMultiplier ?? 1) * 100);
            const effColor = eff >= 80 ? 'text-green-400' :
              eff >= 50 ? 'text-yellow-400' :
              eff >= 30 ? 'text-orange-400' : 'text-red-400';
            const dotColor = sat.isDestroyed ? 'bg-gray-500' :
              eff >= 80 ? 'bg-green-500' :
              eff >= 50 ? 'bg-yellow-500 animate-pulse' :
              eff >= 30 ? 'bg-orange-500 animate-pulse' : 'bg-red-500 animate-pulse';

            return (
              <div key={sat.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                  <span className="text-xs text-slate-300 truncate">{sat.name}</span>
                  {(sat.activeThreats?.length ?? 0) > 0 && (
                    <span className="text-xs px-1 py-0 rounded bg-red-900/60 text-red-300 truncate max-w-[100px]">
                      {sat.activeThreats[0]}
                    </span>
                  )}
                </div>
                <span className={`text-xs font-mono ml-2 flex-shrink-0 ${effColor}`}>
                  {sat.isDestroyed ? 'DESTROYED' : `${eff}%`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Footer */}
      <div className="p-2 bg-slate-800/50 rounded-b-lg">
        <div className="flex justify-center">
          <span className={`text-xs font-mono ${
            isComplete ? 'text-green-400' :
            !isPlaying ? 'text-amber-400' :
            'text-green-400'
          }`}>
            {isComplete
              ? `MISSION COMPLETE - Ground: ${score.intercepted}/${score.launched} | Space: ${score.asatIntercepted}/${score.asatLaunched} ASAT evaded, ${score.satellitesDestroyed} lost`
              : !isPlaying
                ? 'PAUSED - Press Continue to advance'
                : 'SIMULATION RUNNING'
            }
          </span>
        </div>
      </div>
    </div>
  );
}
