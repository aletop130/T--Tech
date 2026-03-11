'use client';

import { FormEvent, useEffect, useRef } from 'react';
import { Button, Icon, Tag, TextArea } from '@blueprintjs/core';

import type { ChatMessage, SandboxSession } from '@/lib/store/sandbox';

const QUICK_PROMPTS = [
  'Allied base in Rome, hostile base near Belgrade, 2 ships patrolling the Adriatic',
  'Hostile drone approaching from Serbia toward Italy, 2 allied aircraft scramble from Bari heading north',
  '3 allied ships in the Mediterranean, tracking station in Crete, start at 5x',
  'Create satellite at 400km, ground station near Athens',
  'Convoy moving from Munich to Vienna, aircraft escort from Bratislava',
  'Remove the drone and pause the simulation',
];

interface SandboxChatPanelProps {
  session: SandboxSession | null;
  messages: ChatMessage[];
  input: string;
  isSubmitting: boolean;
  actorCount: number;
  onInputChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  onControl: (action: 'start' | 'pause' | 'resume' | 'reset' | 'set_speed', multiplier?: number) => void;
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
  onControl,
  onQuickPrompt,
}: SandboxChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
  const time = Math.round(session?.current_time_seconds ?? 0);
  const speed = session?.time_multiplier ?? 1;

  return (
    <div className="flex h-full flex-col bg-sda-bg-secondary/95 backdrop-blur-sm">
      {/* Session header */}
      <div className="flex-shrink-0 border-b border-sda-border-default px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="playbook" className="text-sda-accent-cyan" />
            <span className="text-sm font-semibold text-sda-text-primary">
              {session?.name ?? 'Sandbox'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Tag minimal intent={status === 'running' ? 'success' : status === 'paused' ? 'warning' : 'none'}>
              {status}
            </Tag>
            <Tag minimal>{actorCount} actors</Tag>
          </div>
        </div>

        {/* Runtime controls */}
        <div className="flex items-center gap-2">
          {status !== 'running' ? (
            <Button
              small
              intent="success"
              icon="play"
              onClick={() => onControl(status === 'paused' ? 'resume' : 'start')}
            >
              {status === 'paused' ? 'Resume' : 'Start'}
            </Button>
          ) : (
            <Button small intent="warning" icon="pause" onClick={() => onControl('pause')}>
              Pause
            </Button>
          )}
          <Button small minimal icon="reset" onClick={() => onControl('reset')} />
          <div className="ml-auto flex items-center gap-2 text-xs text-sda-text-muted">
            <span>T+{time}s</span>
            <select
              className="rounded border border-sda-border-default bg-sda-bg-tertiary px-2 py-0.5 text-xs text-sda-text-primary"
              value={String(speed)}
              onChange={(e) => onControl('set_speed', Number(e.target.value))}
            >
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="5">5x</option>
              <option value="10">10x</option>
              <option value="50">50x</option>
              <option value="100">100x</option>
            </select>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-dashed border-sda-border-default bg-sda-bg-tertiary/40 p-4">
              <div className="mb-2 text-sm font-medium text-sda-text-primary">Sandbox Copilot</div>
              <div className="mb-3 text-xs text-sda-text-secondary">
                Describe scenarios in natural language. Use place names instead of coordinates.
                Create, move, patrol, and delete actors. Control simulation speed.
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => onQuickPrompt(prompt)}
                    className="rounded-md border border-sda-border-default bg-sda-bg-secondary/60 px-3 py-1.5 text-left text-xs text-sda-text-secondary transition-colors hover:border-sda-accent-cyan/40 hover:text-sda-text-primary"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'ml-6 bg-sda-accent-cyan/15 text-sda-text-primary'
                    : 'mr-4 border border-sda-border-default bg-sda-bg-tertiary/60 text-sda-text-secondary'
                }`}
              >
                {msg.role === 'assistant'
                  ? msg.content.split(/\.\s+/).filter(Boolean).map((sentence, i) => (
                      <div key={i} className="flex items-start gap-1.5 py-0.5">
                        <span className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sda-accent-cyan/60" />
                        <span>{sentence.endsWith('.') ? sentence : `${sentence}.`}</span>
                      </div>
                    ))
                  : msg.content}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <form className="flex-shrink-0 border-t border-sda-border-default p-3" onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <TextArea
            fill
            rows={2}
            placeholder="Describe what to create, move, or simulate..."
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="!min-h-[3rem] !resize-none"
          />
          <Button
            intent="primary"
            icon="send-message"
            loading={isSubmitting}
            disabled={isSubmitting || !input.trim()}
            type="submit"
            className="self-end"
          />
        </div>
      </form>
    </div>
  );
}
