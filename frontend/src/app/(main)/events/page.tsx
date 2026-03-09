'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, Tab, Icon, Card, Spinner } from '@blueprintjs/core';
import { LaunchCorrelationPanel } from '@/components/Launch/LaunchCorrelationPanel';
import { ReentryDashboard } from '@/components/Reentry/ReentryDashboard';
import { ManeuverDetectionPanel } from '@/components/ManeuverAlertPanel/ManeuverDetectionPanel';

const VALID_TABS = ['launches', 'reentry', 'maneuvers'] as const;
type TabId = (typeof VALID_TABS)[number];

function EventsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get('tab') as TabId)
    ? (searchParams.get('tab') as TabId)
    : 'launches';
  const [selectedTab, setSelectedTab] = useState<TabId>(initialTab);

  const handleTabChange = (newTab: string) => {
    setSelectedTab(newTab as TabId);
    window.history.replaceState(null, '', `?tab=${newTab}`);
  };

  return (
    <div className="h-full flex flex-col" data-testid="events-page">
      <div className="flex items-center gap-2 px-4 py-3">
        <Icon icon="rocket-slant" size={20} style={{ color: '#2ecc71' }} />
        <h1 className="text-xl font-bold m-0" style={{ color: '#2ecc71' }}>
          Events
        </h1>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden mx-4 mb-4">
        <Tabs
          id="events-tabs"
          selectedTabId={selectedTab}
          onChange={handleTabChange}
          large
        >
          <Tab id="launches" title="Launches" />
          <Tab id="reentry" title="Reentry" />
          <Tab id="maneuvers" title="Maneuvers" />
        </Tabs>

        <div className="flex-1 overflow-auto">
          {selectedTab === 'launches' && <LaunchCorrelationPanel />}
          {selectedTab === 'reentry' && <ReentryDashboard />}
          {selectedTab === 'maneuvers' && <ManeuverDetectionPanel />}
        </div>
      </Card>
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <EventsPageInner />
    </Suspense>
  );
}
