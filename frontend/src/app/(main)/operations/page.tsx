'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import OperationsDashboard from '@/components/Operations/OperationsDashboard';
import { CommsPanel } from '@/components/Comms/CommsPanel';

export default function OperationsPage() {
  return (
    <TabbedPage
      tabsId="operations-tabs"
      icon="flows"
      title="Operations & Comms"
      color="var(--sda-accent-blue)"
      testId="operations-page"
      tabs={[
        { id: 'operations', title: 'Operations', component: <OperationsDashboard /> },
        { id: 'comms', title: 'Communications', component: <CommsPanel /> },
      ]}
    />
  );
}
