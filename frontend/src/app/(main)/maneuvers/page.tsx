'use client';

import { ManeuverDetectionPanel } from '@/components/ManeuverAlertPanel';

export default function ManeuversPage() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <ManeuverDetectionPanel />
    </div>
  );
}
