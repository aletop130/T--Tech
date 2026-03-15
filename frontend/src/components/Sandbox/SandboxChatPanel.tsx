'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Icon } from '@blueprintjs/core';

import type { ChatMessage, SandboxSession } from '@/lib/store/sandbox';

const QUICK_PROMPTS = [
  'Allied base in Rome, hostile base near Belgrade, 2 ships patrolling the Adriatic',
  'Hostile drone approaching from Serbia toward Italy, 2 allied aircraft scramble from Bari heading north',
  '3 allied ships in the Mediterranean, tracking station in Crete, start at 5x',
  'Create satellite at 400km, ground station near Athens',
  'Convoy moving from Munich to Vienna, aircraft escort from Bratislava',
  'Remove the drone and pause the simulation',
];

// chars per tick for the typewriter
const STREAM_CHARS_PER_TICK = 3;
const STREAM_TICK_MS = 12;

interface SandboxChatPanelProps {
  session: SandboxSession | null;
  messages: ChatMessage[];
  input: string;
  isSubmitting: boolean;
  actorCount: number;
  onInputChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  onQuickPrompt: (prompt: string) => void;
}

export function SandboxChatPanel({
  session,
  messages,
  input,
  isSubmitting,
  actorCount,
  onInputChange,
  onSubmit,
  onQuickPrompt,
}: SandboxChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamedLen, setStreamedLen] = useState(0);
  const prevCountRef = useRef(messages.length);

  // Detect new assistant message and start streaming
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant') {
        setStreamingId(last.id);
        setStreamedLen(0);
      }
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  // Typewriter interval
  useEffect(() => {
    if (!streamingId) return;
    const msg = messages.find((m) => m.id === streamingId);
    if (!msg) {
      setStreamingId(null);
      return;
    }
    const fullLen = msg.content.length;
    if (streamedLen >= fullLen) {
      setStreamingId(null);
      return;
    }
    const timer = window.setInterval(() => {
      setStreamedLen((prev) => {
        const next = prev + STREAM_CHARS_PER_TICK;
        if (next >= fullLen) {
          window.clearInterval(timer);
          setStreamingId(null);
          return fullLen;
        }
        return next;
      });
    }, STREAM_TICK_MS);
    return () => window.clearInterval(timer);
  }, [streamingId, messages, streamedLen]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamedLen]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (input.trim() && !isSubmitting) {
        void onSubmit();
      }
    }
  };

  const status = session?.status ?? 'draft';

  /** Render assistant message content, with streaming support. */
  function renderAssistantContent(msg: ChatMessage) {
    const text = msg.id === streamingId ? msg.content.slice(0, streamedLen) : msg.content;
    const isStreaming = msg.id === streamingId;

    const sentences = text.split(/\.\s+/).filter(Boolean);
    return (
      <>
        {sentences.map((sentence, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <span className="mt-[5px] inline-block h-1 w-1 flex-shrink-0 bg-sda-accent-cyan/40" />
            <span>{sentence.endsWith('.') ? sentence : `${sentence}.`}</span>
          </div>
        ))}
        {isStreaming && (
          <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-sda-accent-cyan/60" />
        )}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#080808]">
      {/* ── MISSION HEADER ── */}
      <div className="mil-accent-top relative flex-shrink-0 border-b border-[#1a1a1a] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`h-1.5 w-1.5 flex-shrink-0 ${
                status === 'running'
                  ? 'animate-pulse bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
                  : status === 'paused'
                    ? 'bg-amber-500'
                    : 'bg-zinc-600'
              }`}
            />
            <span className="font-code text-[11px] font-semibold uppercase tracking-wider text-sda-text-primary">
              {session?.name ?? 'SANDBOX'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`font-code text-[9px] font-semibold uppercase tracking-widest border px-2 py-0.5 ${
                status === 'running'
                  ? 'border-green-500/30 bg-green-500/[0.08] text-green-400'
                  : status === 'paused'
                    ? 'border-amber-500/30 bg-amber-500/[0.08] text-amber-400'
                    : 'border-zinc-700/40 bg-zinc-700/[0.06] text-zinc-500'
              }`}
            >
              {status === 'running' ? 'ACTIVE' : status === 'paused' ? 'STANDBY' : 'DRAFT'}
            </span>
            <span className="font-code text-[9px] tracking-wider text-zinc-600">
              {actorCount} UNITS
            </span>
          </div>
        </div>
      </div>

      {/* ── COMMS LOG ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="mil-bracket relative border border-[#1a1a1a] bg-[#0a0a0a] p-4">
            <div className="mb-2 font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan">
              // SCENARIO BUILDER
            </div>
            <div className="mb-3 font-code text-[10px] leading-relaxed text-zinc-400">
              Issue directives in natural language. Reference locations by name.
              Deploy, maneuver, and engage assets. Control simulation tempo.
            </div>
            <div className="flex flex-col gap-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onQuickPrompt(prompt)}
                  className="border border-[#1a1a1a] bg-white/[0.015] px-3 py-2 text-left font-code text-[10px] leading-relaxed text-zinc-500 transition-colors hover:border-sda-accent-cyan/25 hover:bg-sda-accent-cyan/[0.03] hover:text-zinc-300"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`border-l-2 px-3 py-2 ${
                  msg.role === 'user'
                    ? 'border-l-sda-accent-cyan/50 bg-sda-accent-cyan/[0.04]'
                    : 'border-l-zinc-700/50 bg-white/[0.015]'
                }`}
              >
                <div
                  className={`mb-1 font-code text-[9px] uppercase tracking-widest ${
                    msg.role === 'user' ? 'text-sda-accent-cyan/40' : 'text-zinc-600'
                  }`}
                >
                  {msg.role === 'user' ? 'CMD >' : 'SYS //'}
                </div>
                <div
                  className={`font-code text-[11px] leading-relaxed ${
                    msg.role === 'user' ? 'text-zinc-300' : 'text-zinc-500'
                  }`}
                >
                  {msg.role === 'assistant' ? renderAssistantContent(msg) : msg.content}
                </div>
              </div>
            ))}
            {/* Typing indicator while waiting */}
            {isSubmitting && !streamingId && (
              <div className="border-l-2 border-l-zinc-700/50 bg-white/[0.015] px-3 py-2">
                <div className="mb-1 font-code text-[9px] uppercase tracking-widest text-zinc-600">
                  SYS //
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1 w-1 animate-pulse bg-sda-accent-cyan/50" style={{ animationDelay: '0ms' }} />
                  <span className="h-1 w-1 animate-pulse bg-sda-accent-cyan/50" style={{ animationDelay: '150ms' }} />
                  <span className="h-1 w-1 animate-pulse bg-sda-accent-cyan/50" style={{ animationDelay: '300ms' }} />
                  <span className="ml-1 font-code text-[10px] text-zinc-600">COMPILING DIRECTIVES</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── COMMAND INPUT ── */}
      <form className="flex-shrink-0 border-t border-[#1a1a1a] p-3" onSubmit={handleSubmit}>
        <div className="relative border border-[#1a1a1a]">
          <div className="px-3 pt-2 pb-0.5 font-code text-[9px] uppercase tracking-widest text-zinc-500">
            ENTER DIRECTIVE
          </div>
          <textarea
            rows={2}
            placeholder="Deploy, maneuver, or simulate..."
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="sandbox-chat-input min-h-[2.5rem] w-full resize-none border-0 bg-transparent px-3 py-1.5 font-code text-[11px] text-zinc-300 outline-none placeholder:text-zinc-700 focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="font-code text-[9px] text-zinc-600">Enter to send</span>
            <button
              type="submit"
              disabled={isSubmitting || !input.trim()}
              className="border border-sda-accent-cyan/30 bg-sda-accent-cyan/[0.08] px-3 py-1 font-code text-[10px] uppercase tracking-wider text-sda-accent-cyan transition-colors hover:bg-sda-accent-cyan/[0.15] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isSubmitting ? (
                <Icon icon="refresh" size={12} className="animate-spin" />
              ) : (
                'SEND'
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
