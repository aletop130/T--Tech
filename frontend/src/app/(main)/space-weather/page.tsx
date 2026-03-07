'use client';

import { Icon } from '@blueprintjs/core';
import { SpaceWeatherPanel } from '@/components/SpaceWeather/SpaceWeatherPanel';

export default function SpaceWeatherPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Icon icon="flash" size={20} style={{ color: '#fcc419' }} />
          <h1 className="text-xl font-semibold">Space Weather Monitor</h1>
          <span className="text-xs text-sda-text-secondary">NOAA SWPC Live Feed</span>
        </div>
        <div className="bg-sda-bg-secondary rounded-lg border border-sda-border-default p-4">
          <SpaceWeatherPanel />
        </div>
      </div>
    </div>
  );
}
