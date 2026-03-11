'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { SpaceWeatherPanel } from '@/components/SpaceWeather/SpaceWeatherPanel';
import { RFSpectrumPanel } from '@/components/RFSpectrum/RFSpectrumPanel';

export default function EnvironmentPage() {
  return (
    <TabbedPage
      tabsId="environment-tabs"
      icon="flash"
      title="Environment"
      color="#f1c40f"
      testId="environment-page"
      tabs={[
        { id: 'space-weather', title: 'Space Weather', component: <SpaceWeatherPanel /> },
        { id: 'rf-spectrum', title: 'RF Spectrum', component: <RFSpectrumPanel /> },
      ]}
    />
  );
}
