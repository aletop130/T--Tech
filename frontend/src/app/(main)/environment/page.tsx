'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, Tab, Icon, Card, Spinner } from '@blueprintjs/core';
import { SpaceWeatherPanel } from '@/components/SpaceWeather/SpaceWeatherPanel';
import { RFSpectrumPanel } from '@/components/RFSpectrum/RFSpectrumPanel';

const VALID_TABS = ['space-weather', 'rf-spectrum'] as const;
type TabId = (typeof VALID_TABS)[number];

function EnvironmentPageInner() {
  const searchParams = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get('tab') as TabId)
    ? (searchParams.get('tab') as TabId)
    : 'space-weather';
  const [selectedTab, setSelectedTab] = useState<TabId>(initialTab);

  const handleTabChange = (newTab: string) => {
    setSelectedTab(newTab as TabId);
    window.history.replaceState(null, '', `?tab=${newTab}`);
  };

  return (
    <div className="h-full flex flex-col" data-testid="environment-page">
      <div className="flex items-center gap-2 px-4 py-3">
        <Icon icon="flash" size={20} style={{ color: '#f1c40f' }} />
        <h1 className="text-xl font-bold m-0" style={{ color: '#f1c40f' }}>
          Environment
        </h1>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden mx-4 mb-4">
        <Tabs
          id="environment-tabs"
          selectedTabId={selectedTab}
          onChange={handleTabChange}
          large
        >
          <Tab id="space-weather" title="Space Weather" />
          <Tab id="rf-spectrum" title="RF Spectrum" />
        </Tabs>

        <div className="flex-1 overflow-auto">
          {selectedTab === 'space-weather' && <SpaceWeatherPanel />}
          {selectedTab === 'rf-spectrum' && <RFSpectrumPanel />}
        </div>
      </Card>
    </div>
  );
}

export default function EnvironmentPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <EnvironmentPageInner />
    </Suspense>
  );
}
