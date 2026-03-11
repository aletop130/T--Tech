'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { AdminPanel } from '@/components/Admin/AdminPanel';
import { IngestionPanel } from '@/components/Ingestion/IngestionPanel';

export default function SystemPage() {
  return (
    <TabbedPage
      tabsId="system-tabs"
      icon="cog"
      title="System"
      color="var(--sda-text-secondary)"
      testId="system-page"
      tabs={[
        { id: 'status',    title: 'Status & Settings', component: <AdminPanel /> },
        { id: 'ingestion', title: 'Data Ingestion',    component: <IngestionPanel /> },
      ]}
    />
  );
}
