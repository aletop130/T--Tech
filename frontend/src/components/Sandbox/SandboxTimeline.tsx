'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@blueprintjs/core';

import type { SandboxSession } from '@/lib/store/sandbox';

const DURATION_PRESETS = [
  { label: '5M', seconds: 300 },
  { label: '30M', seconds: 1800 },
  { label: '1H', seconds: 3600 },
  { label: '6H', seconds: 21600 },
  { label: '24H', seconds: 86400 },
];

const SPEED_OPTIONS = [1, 2, 5, 10, 50, 100];

function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDurationCompact(seconds: number): string {
  if (seconds >= 86400) {
    const d = seconds / 86400;
    return d === Math.floor(d) ? `${d}d` : `${d.toFixed(1)}d`;
  }
  if (seconds >= 3600) {
    const h = seconds / 3600;
    return h === Math.floor(h) ? `${h}h` : `${h.toFixed(1)}h`;
  }
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds)}s`;
}

interface SandboxTimelineProps {
  session: SandboxSession | null;
  onControl: (
    action: 'start' | 'pause' | 'resume' | 'reset' | 'set_speed' | 'set_duration' | 'seek',
    value?: number,
  ) => void;
}

export function SandboxTimeline({ session, onControl }: SandboxTimelineProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [durationInput, setDurationInput] = useState('');
  const [editingDuration, setEditingDuration] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  const status = session?.status ?? 'draft';
  const currentTime = session?.current_time_seconds ?? 0;
  const duration = session?.duration_seconds ?? null;
  const speed = session?.time_multiplier ?? 1;
  const displayProgress = dragging
    ? dragProgress
    : duration && duration > 0
      ? Math.min((currentTime / duration) * 100, 100)
      : 0;
  const isComplete = duration != null && currentTime >= duration;

  const STEP_SECONDS = 10;

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      if (!duration) return;
      const step = STEP_SECONDS * speed;
      const target = Math.max(0, Math.min(currentTime + step * direction, duration));
      onControl('seek', target);
    },
    [currentTime, duration, onControl, speed],
  );

  // Seek to percentage on the bar
  const seekToPercent = useCallback(
    (pct: number) => {
      if (!duration) return;
      const clamped = Math.max(0, Math.min(pct, 100));
      const targetTime = (clamped / 100) * duration;
      onControl('seek', targetTime);
    },
    [duration, onControl],
  );

  // Click on track to seek
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current || !duration) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      seekToPercent(pct);
    },
    [duration, seekToPercent],
  );

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || !duration) return;
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);
      const rect = barRef.current.getBoundingClientRect();
      setDragProgress(Math.max(0, Math.min(((e.clientX - rect.left) / rect.width) * 100, 100)));
    },
    [duration],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(((e.clientX - rect.left) / rect.width) * 100, 100));
      setDragProgress(pct);
    };

    const handleMouseUp = () => {
      setDragging(false);
      seekToPercent(dragProgress);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, dragProgress, seekToPercent]);

  const handleDurationSubmit = useCallback(() => {
    const text = durationInput.trim().toLowerCase();
    if (!text) return;

    let totalSeconds = 0;
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
    const minMatch = text.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
    const secMatch = text.match(/(\d+(?:\.\d+)?)\s*s/);

    if (hourMatch) totalSeconds += parseFloat(hourMatch[1]) * 3600;
    if (minMatch) totalSeconds += parseFloat(minMatch[1]) * 60;
    if (secMatch) totalSeconds += parseFloat(secMatch[1]);

    if (!hourMatch && !minMatch && !secMatch) {
      const num = parseFloat(text);
      if (isFinite(num) && num > 0) totalSeconds = num * 60;
    }

    if (totalSeconds > 0) {
      onControl('set_duration', totalSeconds);
      setDurationInput('');
      setEditingDuration(false);
    }
  }, [durationInput, onControl]);

  // Generate tick marks
  const tickCount = 10;
  const tickMarks = duration
    ? Array.from({ length: tickCount + 1 }, (_, i) => {
        const pct = (i / tickCount) * 100;
        const time = (duration * i) / tickCount;
        return { pct, time, showLabel: i % 2 === 0 };
      })
    : [];

  return (
    <div className="flex-shrink-0 border-t border-[#1a1a1a] bg-[#060606]">
      {/* Main timeline row */}
      <div className="flex h-11 items-stretch">
        {/* Transport controls */}
        <div className="flex items-stretch border-r border-[#1a1a1a]">
          {/* Reset */}
          <button
            type="button"
            onClick={() => onControl('reset')}
            className="flex w-9 items-center justify-center text-zinc-600 transition-colors hover:bg-white/[0.03] hover:text-zinc-400"
            title="Reset"
          >
            <Icon icon="reset" size={12} />
          </button>

          {/* Step backward */}
          <button
            type="button"
            onClick={() => handleStep(-1)}
            disabled={!duration}
            className="flex w-9 items-center justify-center text-zinc-600 transition-colors hover:bg-white/[0.03] hover:text-zinc-400 disabled:opacity-30"
            title={`Step back ${STEP_SECONDS}s (×${speed})`}
          >
            <Icon icon="step-backward" size={12} />
          </button>

          {/* Play / Pause */}
          <button
            type="button"
            onClick={() =>
              onControl(status === 'running' ? 'pause' : status === 'paused' ? 'resume' : 'start')
            }
            className={`flex w-11 items-center justify-center transition-colors ${
              status === 'running'
                ? 'bg-green-500/[0.06] text-green-400 hover:bg-green-500/[0.12]'
                : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
            }`}
            title={status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Start'}
          >
            <Icon icon={status === 'running' ? 'pause' : 'play'} size={14} />
          </button>

          {/* Step forward */}
          <button
            type="button"
            onClick={() => handleStep(1)}
            disabled={!duration}
            className="flex w-9 items-center justify-center text-zinc-600 transition-colors hover:bg-white/[0.03] hover:text-zinc-400 disabled:opacity-30"
            title={`Step forward ${STEP_SECONDS}s (×${speed})`}
          >
            <Icon icon="step-forward" size={12} />
          </button>
        </div>

        {/* Current time readout */}
        <div className="flex w-[108px] items-center justify-center border-r border-[#1a1a1a] bg-[#0a0a0a]/60">
          <span className="font-code text-[13px] font-semibold tabular-nums tracking-wide text-sda-accent-cyan">
            {dragging && duration
              ? formatTime((dragProgress / 100) * duration)
              : formatTime(currentTime)}
          </span>
        </div>

        {/* Timeline track area */}
        <div className="relative flex min-w-0 flex-1 flex-col justify-center px-4">
          {duration ? (
            <>
              {/* Track background — clickable */}
              <div
                ref={barRef}
                className="relative h-[6px] w-full cursor-pointer bg-[#141414]"
                onClick={handleTrackClick}
              >
                {/* Tick marks on track */}
                {tickMarks.map((tick) => (
                  <div
                    key={tick.pct}
                    className="absolute top-0 h-full w-px bg-[#1e1e1e]"
                    style={{ left: `${tick.pct}%` }}
                  />
                ))}

                {/* Progress fill */}
                <div
                  className={`absolute inset-y-0 left-0 ${dragging ? '' : 'transition-[width] duration-150 ease-linear'}`}
                  style={{
                    width: `${displayProgress}%`,
                    background: isComplete && !dragging
                      ? 'linear-gradient(90deg, rgba(251,191,36,0.3), rgba(251,191,36,0.5))'
                      : 'linear-gradient(90deg, rgba(34,211,238,0.15), rgba(34,211,238,0.45))',
                  }}
                />

                {/* Playhead needle — draggable */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 ${dragging ? '' : 'transition-[left] duration-150 ease-linear'}`}
                  style={{ left: `${displayProgress}%` }}
                  onMouseDown={handleDragStart}
                >
                  <div
                    className={`h-[14px] w-[6px] -translate-x-1/2 ${
                      dragging
                        ? 'cursor-grabbing bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]'
                        : isComplete
                          ? 'cursor-grab bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                          : 'cursor-grab bg-sda-accent-cyan shadow-[0_0_8px_rgba(34,211,238,0.6)]'
                    }`}
                  />
                </div>
              </div>

              {/* Tick labels */}
              <div className="relative mt-1 h-3 w-full select-none">
                {tickMarks
                  .filter((t) => t.showLabel)
                  .map((tick) => (
                    <span
                      key={tick.pct}
                      className="absolute font-code text-[8px] tabular-nums text-zinc-600"
                      style={{
                        left: `${tick.pct}%`,
                        transform: tick.pct === 0 ? 'none' : tick.pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
                      }}
                    >
                      {formatDurationCompact(tick.time)}
                    </span>
                  ))}
              </div>
            </>
          ) : (
            /* No duration set — show prompt */
            <div className="flex items-center gap-3">
              <div className="h-[6px] flex-1 bg-[#141414]">
                {status === 'running' && (
                  <div className="h-full w-full overflow-hidden">
                    <div
                      className="h-full w-1/4 animate-[timeline-sweep_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-sda-accent-cyan/20 to-transparent"
                    />
                  </div>
                )}
              </div>
              {status !== 'running' && (
                <span className="whitespace-nowrap font-code text-[9px] uppercase tracking-widest text-zinc-700">
                  NO DURATION SET
                </span>
              )}
            </div>
          )}
        </div>

        {/* Duration controls */}
        <div className="flex items-stretch border-l border-[#1a1a1a]">
          {editingDuration ? (
            <div className="flex items-center gap-1 px-2">
              <input
                type="text"
                value={durationInput}
                onChange={(e) => setDurationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDurationSubmit();
                  if (e.key === 'Escape') setEditingDuration(false);
                }}
                placeholder="1h, 30m, 2h30m"
                autoFocus
                className="w-[80px] border border-[#222] bg-[#0a0a0a] px-2 py-1 font-code text-[10px] text-zinc-300 outline-none focus:border-sda-accent-cyan/40"
              />
              <button
                type="button"
                onClick={handleDurationSubmit}
                className="border border-sda-accent-cyan/30 bg-sda-accent-cyan/[0.08] px-2 py-1 font-code text-[9px] font-semibold text-sda-accent-cyan hover:bg-sda-accent-cyan/[0.15]"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setEditingDuration(false)}
                className="px-1 text-zinc-600 hover:text-zinc-400"
              >
                <Icon icon="cross" size={10} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingDuration(true)}
              className="flex items-center gap-1.5 px-3 font-code text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300"
              title="Set custom duration"
            >
              <Icon icon="time" size={11} />
              {duration ? formatDurationCompact(duration) : 'SET'}
            </button>
          )}
        </div>

        {/* Preset durations */}
        <div className="flex items-stretch border-l border-[#1a1a1a]">
          {DURATION_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onControl('set_duration', preset.seconds)}
              className={`flex w-9 items-center justify-center font-code text-[9px] font-semibold tracking-wider transition-colors ${
                duration === preset.seconds
                  ? 'bg-sda-accent-cyan/[0.1] text-sda-accent-cyan'
                  : 'text-zinc-600 hover:bg-white/[0.03] hover:text-zinc-400'
              }`}
              title={preset.label}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Speed multiplier */}
        <div className="flex items-stretch border-l border-[#1a1a1a]">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onControl('set_speed', s)}
              className={`flex w-9 items-center justify-center font-code text-[9px] font-semibold transition-colors ${
                speed === s
                  ? 'bg-sda-accent-cyan/[0.1] text-sda-accent-cyan'
                  : 'text-zinc-600 hover:bg-white/[0.03] hover:text-zinc-400'
              }`}
              title={`${s}x speed`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* End time / total duration */}
        <div className="flex w-[108px] items-center justify-center border-l border-[#1a1a1a] bg-[#0a0a0a]/60">
          <span className="font-code text-[13px] tabular-nums tracking-wide text-zinc-500">
            {duration ? formatTime(duration) : '--:--:--'}
          </span>
        </div>
      </div>

    </div>
  );
}
