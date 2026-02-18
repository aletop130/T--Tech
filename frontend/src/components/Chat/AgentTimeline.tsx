'use client';

import { Icon, IconName } from '@blueprintjs/core';

interface AgentState {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  message?: string;
}

interface AgentTimelineProps {
  agents: AgentState[];
}

const agentConfig: Record<string, { icon: IconName; color: string; label: string; description: string }> = {
  scout: {
    icon: 'search',
    color: '#4CAF50',
    label: 'Scout',
    description: 'Screening catalogo oggetti',
  },
  analyst: {
    icon: 'chart',
    color: '#2196F3',
    label: 'Analyst',
    description: 'Valutazione rischio',
  },
  planner: {
    icon: 'clipboard',
    color: '#FF9800',
    label: 'Planner',
    description: 'Generazione manovre',
  },
  safety: {
    icon: 'shield',
    color: '#f44336',
    label: 'Safety',
    description: 'Validazione piano',
  },
  ops_brief: {
    icon: 'notifications',
    color: '#9C27B0',
    label: 'Ops Brief',
    description: 'Riepilogo operativo',
  },
};

export function AgentTimeline({ agents }: AgentTimelineProps) {
  const allAgents = ['scout', 'analyst', 'planner', 'safety', 'ops_brief'];
  
  const getAgentStatus = (agentName: string): AgentState['status'] => {
    const agent = agents.find(a => a.name === agentName);
    return agent?.status || 'pending';
  };

  const getAgentMessage = (agentName: string): string | undefined => {
    const agent = agents.find(a => a.name === agentName);
    return agent?.message;
  };

  return (
    <div className="bg-sda-bg-secondary rounded-lg p-3 mb-3 border border-sda-border-default/30">
      <div className="text-xs font-semibold text-sda-text-muted mb-2 flex items-center gap-1">
        <Icon icon="flow-linear" size={12} />
        Pipeline Detour
      </div>
      
      <div className="space-y-2">
        {allAgents.map((agentName, index) => {
          const config = agentConfig[agentName];
          const status = getAgentStatus(agentName);
          const message = getAgentMessage(agentName);
          const isLast = index === allAgents.length - 1;
          
          return (
            <div key={agentName} className="flex items-start gap-2">
              {/* Connector line */}
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{
                    backgroundColor: status === 'pending' ? '#374151' : config.color,
                    opacity: status === 'pending' ? 0.5 : 1,
                    boxShadow: status === 'running' ? `0 0 10px ${config.color}` : 'none',
                  }}
                >
                  <Icon
                    icon={config.icon}
                    size={14}
                    color={status === 'pending' ? '#9CA3AF' : '#FFFFFF'}
                  />
                </div>
                {!isLast && (
                  <div
                    className="w-0.5 h-6 transition-all duration-300"
                    style={{
                      backgroundColor: status === 'complete' ? config.color : '#374151',
                      opacity: status === 'complete' ? 1 : 0.3,
                    }}
                  />
                )}
              </div>
              
              {/* Agent info */}
              <div className="flex-1 pt-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: status === 'pending' ? '#9CA3AF' : config.color }}
                  >
                    {config.label}
                  </span>
                  
                  {status === 'running' && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-sda-accent-cyan animate-pulse" />
                      <span className="text-xs text-sda-text-muted">In esecuzione...</span>
                    </div>
                  )}
                  
                  {status === 'complete' && (
                    <Icon icon="tick" size={12} color="#4CAF50" />
                  )}
                  
                  {status === 'error' && (
                    <Icon icon="cross" size={12} color="#f44336" />
                  )}
                </div>
                
                <div className="text-xs text-sda-text-muted">
                  {config.description}
                </div>
                
                {message && status === 'running' && (
                  <div className="text-xs text-sda-text-secondary mt-1 italic">
                    {message}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
