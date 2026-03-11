'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { IncidentPanel } from '@/components/Incidents/IncidentPanel';
import { DetourDashboard } from '@/components/Detour/DetourDashboard';
import OperationsDashboard from '@/components/Operations/OperationsDashboard';
import { CommsPanel } from '@/components/Comms/CommsPanel';

export default function OperationsPage() {
  return (
    <TabbedPage
      tabsId="operations-tabs"
      icon="flows"
      title="Operations"
      color="var(--sda-accent-blue)"
      testId="operations-page"
      tabs={[
        { id: 'incidents', title: 'Incidents',           component: <IncidentPanel /> },
        { id: 'detour',    title: 'Detour',              component: <DetourDashboard /> },
        { id: 'routes',    title: 'Routes & Formations', component: <OperationsDashboard /> },
        { id: 'comms',     title: 'Communications',      component: <CommsPanel /> },
      ]}
    />
  );
}
