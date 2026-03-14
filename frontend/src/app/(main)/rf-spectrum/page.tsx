'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { RFSpectrumPanel } from '@/components/RFSpectrum/RFSpectrumPanel';

export default function RFSpectrumPage() {
  return (
    <TabbedPage
      tabsId="rf-spectrum-tabs"
      icon="satellite"
      title="RF Spectrum"
      color="#a78bfa"
      testId="rf-spectrum-page"
      tabs={[
        { id: 'overview', title: 'Overview', component: <RFSpectrumPanel /> },
      ]}
    />
  );
}
