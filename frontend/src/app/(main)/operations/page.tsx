'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, Tab, Icon, Spinner } from '@blueprintjs/core';
import OperationsDashboard from '@/components/Operations/OperationsDashboard';
import { CommsPanel } from '@/components/Comms/CommsPanel';

function OperationsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'operations';
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    window.history.replaceState(null, '', newTab === 'operations' ? '/operations' : `?tab=${newTab}`);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="flows" className="text-sda-accent-blue" />
          Operations & Comms
        </h1>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs selectedTabId={activeTab} onChange={(newTab) => handleTabChange(newTab as string)}>
          <Tab id="operations" title={<><Icon icon="flows" /> Operations</>} />
          <Tab id="comms" title={<><Icon icon="satellite" /> Communications</>} />
        </Tabs>

        <div className="flex-1 overflow-auto mt-2">
          {activeTab === 'operations' ? (
            <OperationsDashboard />
          ) : (
            <CommsPanel />
          )}
        </div>
      </div>
    </div>
  );
}

export default function OperationsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <OperationsPageInner />
    </Suspense>
  );
}
