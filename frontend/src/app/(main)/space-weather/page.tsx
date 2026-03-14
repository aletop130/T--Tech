'use client';

import { SpaceWeatherPanel } from '@/components/SpaceWeather/SpaceWeatherPanel';

export default function SpaceWeatherPage() {
  return (
    <div className="h-full flex flex-col overflow-auto" data-testid="space-weather-page">
      <div className="flex-1 p-4">
        <SpaceWeatherPanel />
      </div>
    </div>
  );
}
