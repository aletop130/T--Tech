// WRITE_TARGET="frontend/src/components/Detour/OpsBriefPanel.tsx"
// WRITE_CONTENT_LENGTH=0
'use client';

import React from 'react';
import { Card } from '@blueprintjs/core';

export interface OpsBriefPanelProps {}

/**
 * Displays a concise operational brief for the current Detour session.
 * Currently a placeholder – will be populated with data from the backend.
 */
export function OpsBriefPanel(_: OpsBriefPanelProps) {
  return (
    <Card>
      <h4 className="text-md font-medium mb-2">Operations Brief</h4>
      <p className="text-sm text-sda-text-muted">
        Summary of planned maneuvers, risk assessment, and execution timeline will appear here.
      </p>
    </Card>
  );
}
