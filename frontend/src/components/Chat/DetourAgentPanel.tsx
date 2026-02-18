'use client';

import { useState, useEffect } from 'react';
import { Card, Tag, Button, Spinner, Icon, Collapse, Divider } from '@blueprintjs/core';
import { cesiumController, CesiumAction } from '@/lib/cesium/controller';
import { useDetourStore } from '@/lib/store/detour';
import type { AgentStepInfo, StepStatus } from '@/lib/api/detour';

interface DetourAgentPanelProps {
  onStepComplete?: (agent: string, approved: boolean) => void;
  onPipelineComplete?: (result: unknown) => void;
  onPipelineCancelled?: () => void;
}

const AGENT_ORDER = ['scout', 'analyst', 'planner', 'safety', 'ops_brief'];
const AGENT_LABELS: Record<string, string> = {
  scout: '🔍 Scout',
  analyst: '📊 Analyst',
  planner: '🛠️ Planner',
  safety: '✅ Safety',
  ops_brief: '📋 Ops Brief',
};

const STATUS_COLORS: Record<StepStatus, string> = {
  pending: 'gray',
  running: 'blue',
  waiting_approval: 'warning',
  completed: 'success',
  rejected: 'danger',
  error: 'danger',
};

export function DetourAgentPanel({
  onStepComplete,
  onPipelineComplete,
  onPipelineCancelled,
}: DetourAgentPanelProps) {
  const {
    stepSession,
    pendingCesiumActions,
    isLoading,
    isStepByStepMode,
    error,
    executeStep,
    approveStep,
    rejectStep,
    refreshSessionStatus,
    clearStepSession,
  } = useDetourStore();

  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const currentStepIndex = stepSession?.current_step_number 
    ? stepSession.current_step_number - 1 
    : 0;
  const currentAgent = stepSession?.current_agent;
  const status = stepSession?.status;

  useEffect(() => {
    if (pendingCesiumActions.length > 0) {
      pendingCesiumActions.forEach((action) => {
        cesiumController.dispatch(action as CesiumAction);
      });
    }
  }, [pendingCesiumActions]);

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleExecuteNextStep = async () => {
    if (!currentAgent) return;
    
    const result = await executeStep(currentAgent);
    
    if (result) {
      await refreshSessionStatus();
      if (result.status === 'completed' || status === 'completed') {
        onPipelineComplete?.(stepSession?.final_ops_brief);
      }
    }
  };

  const handleApprove = async () => {
    if (!currentAgent) return;
    
    await approveStep(currentAgent);
    onStepComplete?.(currentAgent, true);
    await refreshSessionStatus();
  };

  const handleReject = async () => {
    if (!currentAgent || !rejectReason.trim()) return;
    
    await rejectStep(currentAgent, rejectReason);
    setRejectDialogOpen(false);
    setRejectReason('');
    onPipelineCancelled?.();
  };

  const handleCancel = () => {
    clearStepSession();
    onPipelineCancelled?.();
  };

  const getStepStatus = (step: AgentStepInfo, index: number): StepStatus => {
    if (step.status) return step.status;
    if (index < currentStepIndex) return 'completed';
    if (index === currentStepIndex && status === 'active') return 'running';
    return 'pending';
  };

  if (!isStepByStepMode || !stepSession) {
    return null;
  }

  const steps = stepSession.steps || [];
  const isWaitingApproval = steps.find(
    (s) => s.status === 'waiting_approval'
  );
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';

  return (
    <Card className="detour-agent-panel my-4 p-4 bg-[#1a1d21] border border-[#2f343c]" elevation={2}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-base font-semibold m-0">🤖 Detour AI Pipeline</h3>
        <Tag minimal>
          Session: {stepSession.session_id}
        </Tag>
      </div>

      <Divider />

      <div className="flex flex-col gap-2 my-4">
        {AGENT_ORDER.map((agentName, index) => {
          const step = steps.find((s) => s.agent_name === agentName);
          const stepStatus = step ? getStepStatus(step, index) : 
            (index < currentStepIndex ? 'completed' : 
             index === currentStepIndex ? 'running' : 'pending');
          
          const isActive = index === currentStepIndex;
          const isExpandable = step?.output_summary || step?.cesium_actions;

          const borderColor = 
            stepStatus === 'running' || (isActive && !isWaitingApproval) ? 'border-l-blue-500' :
            stepStatus === 'completed' ? 'border-l-green-500' :
            stepStatus === 'waiting_approval' ? 'border-l-orange-500' :
            stepStatus === 'rejected' || stepStatus === 'error' ? 'border-l-red-500' :
            'border-l-gray-600';

          const bgColor = isActive && !isWaitingApproval ? 'bg-blue-500/10' : '';

          return (
            <div
              key={agentName}
              className={`agent-step p-3 rounded-lg border-l-4 ${borderColor} ${bgColor}`}
            >
              <div className="flex items-center gap-3" onClick={() => isExpandable && toggleStep(index)}>
                <div className="step-status-icon">
                  {stepStatus === 'running' || (isActive && !isWaitingApproval) ? (
                    <Spinner size={16} />
                  ) : stepStatus === 'waiting_approval' ? (
                    <Icon icon="pause" />
                  ) : stepStatus === 'completed' ? (
                    <Icon icon="tick-circle" intent="success" />
                  ) : stepStatus === 'rejected' || stepStatus === 'error' ? (
                    <Icon icon="warning-sign" intent="danger" />
                  ) : (
                    <Icon icon="circle" />
                  )}
                </div>
                
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-gray-500 font-medium">{index + 1}.</span>
                  <span className="font-medium">{AGENT_LABELS[agentName]}</span>
                  <Tag 
                    minimal 
                    intent={STATUS_COLORS[stepStatus] as 'none' | 'primary' | 'success' | 'warning' | 'danger'}
                  >
                    {stepStatus.replace('_', ' ')}
                  </Tag>
                </div>
                
                {isExpandable && (
                  <Icon 
                    icon={expandedSteps.has(index) ? 'chevron-up' : 'chevron-down'} 
                    className="text-gray-500"
                  />
                )}
              </div>

              {isExpandable && expandedSteps.has(index) && step && (
                <div className="mt-3 pl-9 text-sm text-gray-400">
                  {step.output_summary && (
                    <p className="m-0 p-2 bg-black/20 rounded">{step.output_summary}</p>
                  )}
                  {step.cesium_actions && step.cesium_actions.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 text-blue-400">
                      <Icon icon="map" />
                      <span>{step.cesium_actions.length} azioni Cesium</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Divider />

      <div className="flex flex-wrap gap-2 mt-4">
        {!isCompleted && !isCancelled && (
          <>
            {isWaitingApproval ? (
              <>
                <Button
                  intent="success"
                  icon="tick"
                  onClick={handleApprove}
                  loading={isLoading}
                >
                  Approva e Continua
                </Button>
                <Button
                  intent="danger"
                  icon="cross"
                  onClick={() => setRejectDialogOpen(true)}
                  loading={isLoading}
                >
                  Rifiuta
                </Button>
              </>
            ) : (
              <Button
                intent="primary"
                icon="play"
                onClick={handleExecuteNextStep}
                loading={isLoading}
                disabled={!currentAgent || isWaitingApproval !== undefined}
              >
                Esegui Step
              </Button>
            )}
            
            <Button
              minimal
              icon="cross"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Annulla
            </Button>
          </>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10">
            <Icon icon="tick-circle" intent="success" />
            <span>Pipeline completata!</span>
            <Button
              minimal
              icon="cross"
              onClick={handleCancel}
            >
              Chiudi
            </Button>
          </div>
        )}

        {isCancelled && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-500/10">
            <Icon icon="warning-sign" intent="warning" />
            <span>Pipeline annullata</span>
            <Button
              minimal
              icon="cross"
              onClick={handleCancel}
            >
              Chiudi
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 mt-3 p-2 bg-red-500/10 rounded text-red-400">
          <Icon icon="error" intent="danger" />
          <span>{error}</span>
        </div>
      )}

      <Collapse isOpen={rejectDialogOpen}>
        <Card className="mt-4 p-4 bg-[#2a2d31]" elevation={1}>
          <h4 className="m-0 mb-3">Conferma Rifiuto</h4>
          <p>Inserisci il motivo del rifiuto:</p>
          <textarea
            className="bp5-input w-full mb-3"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motivo del rifiuto..."
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRejectDialogOpen(false)}>Annulla</Button>
            <Button
              intent="danger"
              onClick={handleReject}
              disabled={!rejectReason.trim()}
            >
              Conferma Rifiuto
            </Button>
          </div>
        </Card>
      </Collapse>
    </Card>
  );
}
