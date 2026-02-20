'use client';

import React from 'react';
import { AgentChat as BaseAgentChat, SimulationControlCommand } from '@/components/Chat/AgentChat';

export interface AgentChatProps {
  /** Props are passed through to the underlying chat component */
  onSendMessage?: (message: string, sceneState: Record<string, unknown>) => Promise<{ message: string; actions: any[] }>;
  initialMessages?: any[];
  useStreaming?: boolean;
  onSimulationControl?: (command: SimulationControlCommand) => void;
}

/**
 * Thin wrapper around the generic {@link BaseAgentChat} component, scoped for Detour.
 * Allows future Detour‑specific extensions without altering the core chat UI.
 */
export function AgentChat({
  onSendMessage,
  initialMessages = [],
  useStreaming = true,
  onSimulationControl,
}: AgentChatProps) {
  return (
    <BaseAgentChat
      onSendMessage={onSendMessage}
      initialMessages={initialMessages}
      useStreaming={useStreaming}
      onSimulationControl={onSimulationControl}
    />
  );
}
