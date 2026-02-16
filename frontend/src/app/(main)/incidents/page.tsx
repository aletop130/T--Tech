'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Elevation,
  Icon,
  Button,
  Tag,
  HTMLSelect,
  Spinner,
  NonIdealState,
  Dialog,
  Classes,
  TextArea,
  FormGroup,
  InputGroup,
  Intent,
} from '@blueprintjs/core';
import { api, Incident } from '@/lib/api';
import { format } from 'date-fns';
import { AgentChat } from '@/components/Chat/AgentChat';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiChatIncident, setAiChatIncident] = useState<Incident | null>(null);
  
  // Create incident dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [newIncident, setNewIncident] = useState({
    title: '',
    description: '',
    incident_type: 'proximity',
    severity: 'medium',
  });
  
  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  
  // Comment dialog
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  
  // Action feedback
  const [actionMessage, setActionMessage] = useState<{ text: string; intent: Intent } | null>(null);
  const [detecting, setDetecting] = useState(false);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getIncidents({
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
      });
      setIncidents(data.items);
    } catch (error) {
      console.error('Failed to load incidents:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const severityIntent = (severity: string) => {
    const intents: Record<string, any> = {
      critical: 'danger',
      high: 'warning',
      medium: 'warning',
      low: 'success',
      info: 'primary',
    };
    return intents[severity] || 'none';
  };

  const statusIntent = (status: string) => {
    const intents: Record<string, any> = {
      open: 'warning',
      investigating: 'primary',
      mitigating: 'primary',
      resolved: 'success',
      closed: 'none',
    };
    return intents[status] || 'none';
  };

  const handleCreateIncident = async () => {
    if (!newIncident.title.trim()) return;
    setCreateLoading(true);
    try {
      await api.createIncident(newIncident);
      setCreateDialogOpen(false);
      setNewIncident({ title: '', description: '', incident_type: 'proximity', severity: 'medium' });
      setActionMessage({ text: 'Incident created successfully', intent: Intent.SUCCESS });
      await loadIncidents();
    } catch (error) {
      setActionMessage({ text: error instanceof Error ? error.message : 'Failed to create incident', intent: Intent.DANGER });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!selectedIncident) return;
    try {
      await api.updateIncidentStatus(selectedIncident.id, 'investigating', 'Acknowledged');
      setActionMessage({ text: 'Incident acknowledged', intent: Intent.SUCCESS });
      await loadIncidents();
      // Update selected incident
      const updated = incidents.find(i => i.id === selectedIncident.id);
      if (updated) {
        setSelectedIncident({ ...updated, status: 'investigating' });
      }
    } catch (error) {
      setActionMessage({ text: error instanceof Error ? error.message : 'Failed to acknowledge', intent: Intent.DANGER });
    }
  };

  const handleAssign = async () => {
    if (!selectedIncident || !assignTo.trim()) return;
    setAssignLoading(true);
    try {
      await api.assignIncident(selectedIncident.id, assignTo);
      setAssignDialogOpen(false);
      setAssignTo('');
      setActionMessage({ text: 'Incident assigned successfully', intent: Intent.SUCCESS });
      await loadIncidents();
    } catch (error) {
      setActionMessage({ text: error instanceof Error ? error.message : 'Failed to assign', intent: Intent.DANGER });
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedIncident || !commentContent.trim()) return;
    setCommentLoading(true);
    try {
      await api.addComment(selectedIncident.id, commentContent);
      setCommentDialogOpen(false);
      setCommentContent('');
      setActionMessage({ text: 'Comment added successfully', intent: Intent.SUCCESS });
    } catch (error) {
      setActionMessage({ text: error instanceof Error ? error.message : 'Failed to add comment', intent: Intent.DANGER });
    } finally {
      setCommentLoading(false);
    }
  };

  // Clear action message after 3 seconds
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  const handleRunProximityDetection = async () => {
    setDetecting(true);
    try {
      const result = await api.runProximityDetection();
      setActionMessage({ 
        text: `Detection complete: ${result.events_created} new, ${result.events_updated} updated events`, 
        intent: Intent.SUCCESS 
      });
      await loadIncidents();
    } catch (error) {
      setActionMessage({ 
        text: error instanceof Error ? error.message : 'Failed to run detection', 
        intent: Intent.DANGER 
      });
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="warning-sign" className="text-sda-accent-yellow" />
          Incident Console
        </h1>
        <div className="flex gap-2">
          <Button 
            icon="pulse" 
            outlined 
            onClick={handleRunProximityDetection} 
            loading={detecting}
            title="Run proximity detection to generate new events"
          >
            Run Detection
          </Button>
          <Button icon="add" intent="primary" onClick={() => setCreateDialogOpen(true)}>
            Create Incident
          </Button>
        </div>
      </div>

      {/* Action feedback */}
      {actionMessage && (
        <div className={`mb-4 p-3 rounded-md bg-sda-bg-secondary border border-sda-border-default`}>
          <span className={actionMessage.intent === Intent.SUCCESS ? 'text-sda-accent-green' : 'text-sda-accent-red'}>
            {actionMessage.text}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <HTMLSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="mitigating">Mitigating</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </HTMLSelect>

        <HTMLSelect
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </HTMLSelect>

        <div className="flex-1" />

        <Button icon="refresh" onClick={loadIncidents} />
      </div>

      {/* Incident List */}
      <Card elevation={Elevation.TWO} className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        ) : incidents.length === 0 ? (
          <NonIdealState
            icon="tick-circle"
            title="No incidents"
            description="All clear! No incidents match the current filters."
          />
        ) : (
          <div className="h-full overflow-auto">
            <div className="space-y-3 p-4">
              {incidents.map((incident) => (
                <Card
                  key={incident.id}
                  elevation={Elevation.ONE}
                  className="p-4 cursor-pointer hover:bg-sda-bg-tertiary transition-colors"
                  onClick={() => setSelectedIncident(incident)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Tag intent={severityIntent(incident.severity)} minimal>
                          {incident.severity.toUpperCase()}
                        </Tag>
                        <Tag intent={statusIntent(incident.status)} minimal>
                          {incident.status.toUpperCase()}
                        </Tag>
                        <Tag minimal className="capitalize">
                          {incident.incident_type.replace(/_/g, ' ')}
                        </Tag>
                      </div>
                      <h3 className="font-semibold text-sda-text-primary mb-1">
                        {incident.title}
                      </h3>
                      {incident.description && (
                        <p className="text-sm text-sda-text-secondary line-clamp-2">
                          {incident.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm text-sda-text-muted">
                      <div>
                        {format(new Date(incident.detected_at), 'MMM d, HH:mm')}
                      </div>
                      {incident.assigned_to && (
                        <div className="flex items-center gap-1 mt-1">
                          <Icon icon="user" size={12} />
                          {incident.assigned_to}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* AI Chat Dialog */}
      <Dialog
        isOpen={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        title={`AI Assistant - ${aiChatIncident?.title || 'Incidents'}`}
        className="bp6-dark"
        style={{ width: 700, height: 650 }}
      >
        <div className={Classes.DIALOG_BODY} style={{ height: '100%', padding: 0 }}>
          <div style={{ height: 550 }}>
            <AgentChat
              initialMessages={
                aiChatIncident
                  ? [
                      {
                        id: 'welcome',
                        role: 'assistant',
                        content: `I'm ready to help you with this **${aiChatIncident.severity}** incident: "${aiChatIncident.title}".\n\n**Status:** ${aiChatIncident.status} | **Type:** ${aiChatIncident.incident_type}\n\n${aiChatIncident.description || 'No description available.'}\n\nWhat would you like to know about this incident?`,
                        timestamp: new Date().toISOString(),
                      },
                    ]
                  : []
              }
            />
          </div>
        </div>
      </Dialog>

      {/* Incident Detail Dialog */}
      <Dialog
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
        title={selectedIncident?.title || ''}
        className="bp6-dark"
        style={{ width: 600 }}
      >
        {selectedIncident && (
          <div className={Classes.DIALOG_BODY}>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Tag intent={severityIntent(selectedIncident.severity)}>
                  {selectedIncident.severity.toUpperCase()}
                </Tag>
                <Tag intent={statusIntent(selectedIncident.status)}>
                  {selectedIncident.status.toUpperCase()}
                </Tag>
                <Tag className="capitalize">
                  {selectedIncident.incident_type.replace(/_/g, ' ')}
                </Tag>
              </div>

              <div>
                <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                  Description
                </h4>
                <p className="text-sda-text-primary">
                  {selectedIncident.description || 'No description provided'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                    Detected
                  </h4>
                  <p>
                    {format(new Date(selectedIncident.detected_at), 'PPpp')}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                    Priority
                  </h4>
                  <p>{selectedIncident.priority}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-sda-text-secondary mb-2">
                  Actions
                </h4>
                <div className="flex gap-2">
                  <Button
                    icon="endorsed"
                    intent="success"
                    onClick={handleAcknowledge}
                  >
                    Acknowledge
                  </Button>
                  <Button icon="user" outlined onClick={() => setAssignDialogOpen(true)}>
                    Assign
                  </Button>
                  <Button icon="chat" outlined onClick={() => setCommentDialogOpen(true)}>
                    Comment
                  </Button>
                  <Button
                    icon="lightbulb"
                    outlined
                    onClick={() => {
                      setAiChatIncident(selectedIncident);
                      setAiChatOpen(true);
                    }}
                  >
                    Ask AI
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Create Incident Dialog */}
      <Dialog
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create Incident"
        className="bp6-dark"
        style={{ width: 500 }}
      >
        <div className={Classes.DIALOG_BODY}>
          <FormGroup label="Title" labelFor="incident-title">
            <InputGroup
              id="incident-title"
              value={newIncident.title}
              onChange={(e) => setNewIncident({ ...newIncident, title: e.target.value })}
              placeholder="Enter incident title"
            />
          </FormGroup>
          <FormGroup label="Description" labelFor="incident-desc">
            <TextArea
              id="incident-desc"
              fill
              value={newIncident.description}
              onChange={(e) => setNewIncident({ ...newIncident, description: e.target.value })}
              placeholder="Enter incident description"
            />
          </FormGroup>
          <FormGroup label="Type" labelFor="incident-type">
            <HTMLSelect
              id="incident-type"
              fill
              value={newIncident.incident_type}
              onChange={(e) => setNewIncident({ ...newIncident, incident_type: e.target.value })}
            >
              <option value="proximity">Proximity</option>
              <option value="cyber">Cyber</option>
              <option value="maneuver">Maneuver</option>
              <option value="equipment">Equipment</option>
              <option value="other">Other</option>
            </HTMLSelect>
          </FormGroup>
          <FormGroup label="Severity" labelFor="incident-severity">
            <HTMLSelect
              id="incident-severity"
              fill
              value={newIncident.severity}
              onChange={(e) => setNewIncident({ ...newIncident, severity: e.target.value })}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </HTMLSelect>
          </FormGroup>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button intent="primary" onClick={handleCreateIncident} loading={createLoading}>
            Create Incident
          </Button>
        </div>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog
        isOpen={assignDialogOpen}
        onClose={() => setAssignDialogOpen(false)}
        title="Assign Incident"
        className="bp6-dark"
        style={{ width: 400 }}
      >
        <div className={Classes.DIALOG_BODY}>
          <FormGroup label="Assign to" labelFor="assign-to">
            <InputGroup
              id="assign-to"
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              placeholder="Enter username or team name"
            />
          </FormGroup>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <Button onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
          <Button intent="primary" onClick={handleAssign} loading={assignLoading}>
            Assign
          </Button>
        </div>
      </Dialog>

      {/* Comment Dialog */}
      <Dialog
        isOpen={commentDialogOpen}
        onClose={() => setCommentDialogOpen(false)}
        title="Add Comment"
        className="bp6-dark"
        style={{ width: 500 }}
      >
        <div className={Classes.DIALOG_BODY}>
          <FormGroup label="Comment" labelFor="comment-content">
            <TextArea
              id="comment-content"
              fill
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              placeholder="Enter your comment"
              rows={4}
            />
          </FormGroup>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <Button onClick={() => setCommentDialogOpen(false)}>Cancel</Button>
          <Button intent="primary" onClick={handleAddComment} loading={commentLoading}>
            Add Comment
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

