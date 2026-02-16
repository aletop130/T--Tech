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
  Tabs,
  Tab,
  FormGroup,
  InputGroup,
  TextArea,
  Callout,
} from '@blueprintjs/core';
import { api, Operation, RoutePlan, Formation, CollisionAlert, OperationType, OperationStatus } from '@/lib/api';
import { format } from 'date-fns';
import { cesiumController } from '@/lib/cesium/controller';

export default function OperationsDashboard() {
  const [activeTab, setActiveTab] = useState<string | number>('operations');
  const [operations, setOperations] = useState<Operation[]>([]);
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [collisions, setCollisions] = useState<CollisionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [opsData, routesData, formationsData] = await Promise.all([
        api.getOperations({ status: statusFilter || undefined, operation_type: typeFilter || undefined }),
        api.getRoutes(),
        api.getFormations(),
      ]);
      setOperations(opsData.items);
      setRoutes(routesData.items);
      setFormations(formationsData.items);
      
      try {
        const collisionsData = await api.getActiveCollisions();
        setCollisions(collisionsData.items);
      } catch (e) {
        console.warn('Failed to load collisions:', e);
        setCollisions([]);
      }
    } catch (error) {
      console.error('Failed to load operations data:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDispatch = async (operationId: string) => {
    try {
      await api.dispatchOperation(operationId);
      await loadData();
      setDispatchDialogOpen(false);
    } catch (error) {
      console.error('Failed to dispatch operation:', error);
    }
  };

  const handleDetectCollisions = async () => {
    const satelliteIds = operations
      .flatMap(op => op.participating_entities)
      .filter((id, index, self) => self.indexOf(id) === index);

    try {
      const alerts = await api.detectCollisions(satelliteIds);
      setCollisions(alerts);
      alerts.forEach(alert => {
        cesiumController.addCollisionAlert({
          id: alert.id,
          entityAId: alert.entity_a_id,
          entityBId: alert.entity_b_id,
          riskLevel: alert.risk_level,
          missDistanceKm: alert.miss_distance_km,
        });
      });
    } catch (error) {
      console.error('Failed to detect collisions:', error);
    }
  };

  const handleVisualizeOperation = (operation: Operation) => {
    cesiumController.addOperation({
      id: operation.id,
      name: operation.name,
      operationType: operation.operation_type,
      participatingEntities: operation.participating_entities,
    });

    operation.route_plans.forEach(route => {
      cesiumController.addRoutePlan({
        id: route.id,
        name: route.name,
        entityId: route.entity_id,
        waypoints: route.waypoints.map(wp => ({
          sequenceOrder: wp.sequence_order,
          name: wp.name,
          positionLat: wp.position_lat,
          positionLon: wp.position_lon,
          positionAltKm: wp.position_alt_km,
        })),
      });
    });

    if (operation.formation_id) {
      const formation = formations.find(f => f.id === operation.formation_id);
      if (formation) {
        cesiumController.addFormation({
          id: formation.id,
          name: formation.name,
          formationType: formation.formation_type,
          leaderEntityId: formation.leader_entity_id || '',
          members: formation.members.map(m => ({
            entityId: m.entity_id,
            slotPosition: m.slot_position,
            relativeX: m.relative_x_m,
            relativeY: m.relative_y_m,
            relativeZ: m.relative_z_m,
          })),
        });
      }
    }

    setSelectedOperation(operation);
  };

  const getStatusIntent = (status: string) => {
    const intents: Record<string, 'none' | 'primary' | 'success' | 'warning' | 'danger'> = {
      planned: 'primary',
      scheduled: 'primary',
      active: 'success',
      in_progress: 'success',
      completed: 'success',
      cancelled: 'warning',
      failed: 'danger',
    };
    return intents[status] || 'none';
  };

  const getRiskIntent = (risk: string) => {
    const intents: Record<string, 'none' | 'primary' | 'success' | 'warning' | 'danger'> = {
      low: 'success',
      medium: 'warning',
      high: 'danger',
      critical: 'danger',
    };
    return intents[risk] || 'none';
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="flows" className="text-sda-accent-blue" />
          Operations Command
        </h1>
        <div className="flex gap-2">
          <Button icon="refresh" onClick={loadData} />
          <Button icon="add" intent="primary" onClick={() => setCreateDialogOpen(true)}>
            New Operation
          </Button>
        </div>
      </div>

      <Card elevation={Elevation.TWO} className="flex-1 overflow-hidden">
        <Tabs selectedTabId={activeTab} onChange={(newTab) => setActiveTab(newTab as string)}>
          <Tab id="operations" title={<><Icon icon="flows" /> Operations</>} />
          <Tab id="routes" title={<><Icon icon="path-search" /> Routes</>} />
          <Tab id="formations" title={<><Icon icon="people" /> Formations</>} />
          <Tab id="collisions" title={<><Icon icon="warning-sign" /> Collisions ({collisions.length})</>} />
        </Tabs>

        <div className="p-4 h-full overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner />
            </div>
          ) : error ? (
            <Callout intent="danger" icon="error">
              <strong>Error loading data:</strong> {error}
            </Callout>
          ) : activeTab === 'operations' ? (
            <OperationsTab
              operations={operations}
              onDispatch={handleDispatch}
              onVisualize={handleVisualizeOperation}
              onSelect={setSelectedOperation}
              statusFilter={statusFilter}
              typeFilter={typeFilter}
              onStatusFilterChange={setStatusFilter}
              onTypeFilterChange={setTypeFilter}
              onRefresh={loadData}
              onCreateOperation={() => setCreateDialogOpen(true)}
            />
          ) : activeTab === 'routes' ? (
            <RoutesTab routes={routes} onVisualize={(route) => console.log('View route', route.id)} />
          ) : activeTab === 'formations' ? (
            <FormationsTab formations={formations} onVisualize={(formation) => console.log('View formation', formation.id)} />
          ) : (
            <CollisionsTab
              collisions={collisions}
              onDetect={handleDetectCollisions}
              getRiskIntent={getRiskIntent}
            />
          )}
        </div>
      </Card>

      <Dialog
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Operation"
        className="bp5-dark"
        style={{ width: 600 }}
      >
        <div className={Classes.DIALOG_BODY}>
          <CreateOperationForm onSuccess={() => { setCreateDialogOpen(false); loadData(); }} />
        </div>
      </Dialog>

      <Dialog
        isOpen={!!selectedOperation && dispatchDialogOpen}
        onClose={() => setDispatchDialogOpen(false)}
        title="Dispatch Operation"
        className="bp5-dark"
        style={{ width: 400 }}
      >
        <div className={Classes.DIALOG_BODY}>
          <p>
            Are you sure you want to dispatch operation <strong>{selectedOperation?.name}</strong>?
          </p>
          <Callout intent="warning" className="mt-4">
            This will activate all routes and tasks associated with this operation.
          </Callout>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button onClick={() => setDispatchDialogOpen(false)}>Cancel</Button>
            <Button
              intent="primary"
              onClick={() => selectedOperation && handleDispatch(selectedOperation.id)}
            >
              Dispatch
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function OperationsTab({
  operations,
  onDispatch,
  onVisualize,
  onSelect,
  statusFilter,
  typeFilter,
  onStatusFilterChange,
  onTypeFilterChange,
  onRefresh,
  onCreateOperation,
}: {
  operations: Operation[];
  onDispatch: (id: string) => void;
  onVisualize: (op: Operation) => void;
  onSelect: (op: Operation | null) => void;
  statusFilter: string;
  typeFilter: string;
  onStatusFilterChange: (s: string) => void;
  onTypeFilterChange: (t: string) => void;
  onRefresh: () => void;
  onCreateOperation: () => void;
}) {
  if (operations.length === 0) {
    return (
      <NonIdealState
        icon="flows"
        title="No Operations"
        description="Create a new operation to get started."
        action={<Button icon="add" intent="primary" onClick={onCreateOperation}>Create Operation</Button>}
      />
    );
  }

  return (
    <>
      <div className="flex gap-3 mb-4">
        <HTMLSelect value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
          <option value="">All Status</option>
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </HTMLSelect>
        <HTMLSelect value={typeFilter} onChange={(e) => onTypeFilterChange(e.target.value)}>
          <option value="">All Types</option>
          <option value="transit">Transit</option>
          <option value="patrol">Patrol</option>
          <option value="intercept">Intercept</option>
          <option value="strike">Strike</option>
          <option value="reconnaissance">Reconnaissance</option>
          <option value="debris_avoidance">Debris Avoidance</option>
        </HTMLSelect>
        <div className="flex-1" />
        <Button icon="refresh" onClick={onRefresh} />
      </div>

      <div className="space-y-3">
        {operations.map((operation) => (
          <Card key={operation.id} elevation={Elevation.ONE} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Tag intent={getStatusIntent(operation.status)} minimal>
                    {operation.status.toUpperCase()}
                  </Tag>
                  <Tag minimal className="capitalize">
                    {operation.operation_type.replace(/_/g, ' ')}
                  </Tag>
                  <Tag minimal>
                    <Icon icon="people" size={12} /> {operation.entity_count}
                  </Tag>
                </div>
                <h3 className="font-semibold text-sda-text-primary mb-1">
                  {operation.name}
                </h3>
                {operation.description && (
                  <p className="text-sm text-sda-text-secondary line-clamp-2">
                    {operation.description}
                  </p>
                )}
                <div className="flex gap-4 mt-2 text-sm text-sda-text-muted">
                  <span>
                    <Icon icon="calendar" size={12} /> {format(new Date(operation.start_time), 'MMM d, HH:mm')}
                  </span>
                  <span>
                    <Icon icon="timeline-events" size={12} /> {operation.tasks.length} tasks
                  </span>
                  <span>
                    <Icon icon="path-search" size={12} /> {operation.route_plans.length} routes
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button icon="eye-open" minimal onClick={() => onVisualize(operation)} />
                {operation.status === 'planned' && (
                  <Button
                    icon="play"
                    intent="success"
                    onClick={() => { onSelect(operation); }}
                  />
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function RoutesTab({ routes, onVisualize }: { routes: RoutePlan[]; onVisualize?: (route: RoutePlan) => void }) {
  if (routes.length === 0) {
    return (
      <NonIdealState
        icon="path-search"
        title="No Routes"
        description="Create routes to plan entity movements."
      />
    );
  }

  return (
    <div className="space-y-3">
      {routes.map((route) => (
        <Card key={route.id} elevation={Elevation.ONE} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Tag minimal>{route.mission_type}</Tag>
                <Tag minimal>{route.entity_type}</Tag>
              </div>
              <h3 className="font-semibold text-sda-text-primary">{route.name}</h3>
                  <p className="text-sm text-sda-text-muted">
                {route.waypoints.length} waypoints • {route.maneuvers.length} maneuvers
              </p>
            </div>
            <Button icon="eye-open" minimal onClick={() => onVisualize?.(route)} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function FormationsTab({ formations, onVisualize }: { formations: Formation[]; onVisualize?: (formation: Formation) => void }) {
  if (formations.length === 0) {
    return (
      <NonIdealState
        icon="people"
        title="No Formations"
        description="Create formations for coordinated multi-entity operations."
      />
    );
  }

  return (
    <div className="space-y-3">
      {formations.map((formation) => (
        <Card key={formation.id} elevation={Elevation.ONE} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Tag intent={formation.is_active ? 'success' : 'none'} minimal>
                  {formation.is_active ? 'ACTIVE' : 'INACTIVE'}
                </Tag>
                <Tag minimal className="capitalize">
                  {formation.formation_type.replace(/_/g, ' ')}
                </Tag>
              </div>
              <h3 className="font-semibold text-sda-text-primary">{formation.name}</h3>
                  <p className="text-sm text-sda-text-muted">
                {formation.members.length} members • {formation.spacing_meters}m spacing
              </p>
            </div>
            <Button icon="eye-open" minimal onClick={() => onVisualize?.(formation)} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function CollisionsTab({
  collisions,
  onDetect,
  getRiskIntent,
}: {
  collisions: CollisionAlert[];
  onDetect: () => void;
  getRiskIntent: (r: string) => 'none' | 'primary' | 'success' | 'warning' | 'danger';
}) {
  const handleAvoidance = async (alert: CollisionAlert) => {
    try {
      const result = await api.generateAvoidanceManeuver({
        entity_id: alert.entity_a_id,
        target_collision_id: alert.id,
        avoidance_type: 'altitude_change',
        prefer_altitude_change: true,
      });
      console.log('Avoidance maneuver created:', result);
    } catch (error) {
      console.error('Failed to create avoidance maneuver:', error);
    }
  };

  const handleView = (alert: CollisionAlert) => {
    console.log('View collision alert details:', alert);
  };
  return (
    <>
      <div className="flex gap-3 mb-4">
        <Button icon="warning-sign" intent="danger" onClick={onDetect}>
          Detect Collisions
        </Button>
      </div>

      {collisions.length === 0 ? (
        <Callout intent="success" icon="tick-circle">
          No active collision alerts. Click "Detect Collisions" to scan for potential threats.
        </Callout>
      ) : (
        <div className="space-y-3">
          {collisions.map((alert) => (
            <Card key={alert.id} elevation={Elevation.ONE} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag intent={getRiskIntent(alert.risk_level)}>
                      {alert.risk_level.toUpperCase()}
                    </Tag>
                    <span className="text-sm text-sda-text-muted">
                      {alert.miss_distance_km.toFixed(3)} km miss distance
                    </span>
                  </div>
                  <p className="text-sm text-sda-text-secondary">
                    {alert.entity_a_id} ↔ {alert.entity_b_id}
                  </p>
                  <p className="text-sm text-sda-text-muted">
                    Predicted: {format(new Date(alert.predicted_collision_time), 'MMM d, HH:mm')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button icon="trending-up" intent="warning" minimal onClick={() => handleAvoidance(alert)}>
                    Avoidance
                  </Button>
                  <Button icon="eye-open" minimal onClick={() => handleView(alert)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function CreateOperationForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [operationType, setOperationType] = useState<OperationType>('transit');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [participatingEntities, setParticipatingEntities] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createOperation({
        name,
        operation_type: operationType,
        description,
        start_time: startTime || new Date().toISOString(),
        participating_entities: participatingEntities.split(',').map(s => s.trim()).filter(Boolean),
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to create operation:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormGroup label="Operation Name" labelFor="name">
        <InputGroup
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter operation name"
          required
        />
      </FormGroup>

      <FormGroup label="Type" labelFor="type">
        <HTMLSelect
          id="type"
          value={operationType}
          onChange={(e) => setOperationType(e.target.value as OperationType)}
          fill
        >
          <option value="transit">Transit</option>
          <option value="patrol">Patrol</option>
          <option value="intercept">Intercept</option>
          <option value="strike">Strike</option>
          <option value="reconnaissance">Reconnaissance</option>
          <option value="debris_avoidance">Debris Avoidance</option>
          <option value="station_keeping">Station Keeping</option>
          <option value="formation">Formation</option>
          <option value="coordinated_maneuver">Coordinated Maneuver</option>
        </HTMLSelect>
      </FormGroup>

      <FormGroup label="Description" labelFor="description">
        <TextArea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter operation description"
          fill
          rows={3}
        />
      </FormGroup>

      <FormGroup label="Start Time" labelFor="startTime">
        <InputGroup
          id="startTime"
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
      </FormGroup>

      <FormGroup label="Participating Entities" labelFor="entities">
        <InputGroup
          id="entities"
          value={participatingEntities}
          onChange={(e) => setParticipatingEntities(e.target.value)}
          placeholder="Entity IDs (comma-separated)"
        />
        <p className="text-xs text-sda-text-muted mt-1">
          Enter satellite or entity IDs separated by commas
        </p>
      </FormGroup>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" intent="primary" loading={submitting}>
          Create Operation
        </Button>
      </div>
    </form>
  );
}

function getStatusIntent(status: string): 'none' | 'primary' | 'success' | 'warning' | 'danger' {
  const intents: Record<string, 'none' | 'primary' | 'success' | 'warning' | 'danger'> = {
    planned: 'primary',
    scheduled: 'primary',
    active: 'success',
    in_progress: 'success',
    completed: 'success',
    cancelled: 'warning',
    failed: 'danger',
  };
  return intents[status] || 'none';
}
