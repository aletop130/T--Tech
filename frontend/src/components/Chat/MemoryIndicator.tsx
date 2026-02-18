'use client';

import { Icon, Tooltip } from '@blueprintjs/core';

interface MemoryIndicatorProps {
  percentage: number;
}

export function MemoryIndicator({ percentage }: MemoryIndicatorProps) {
  const getColor = () => {
    if (percentage < 50) return '#4CAF50';
    if (percentage < 80) return '#FF9800';
    return '#f44336';
  };

  const getStatus = () => {
    if (percentage < 50) return 'Basso';
    if (percentage < 80) return 'Medio';
    return 'Alto';
  };

  const color = getColor();
  const status = getStatus();

  return (
    <Tooltip
      content={`Utilizzo memoria contesto: ${percentage.toFixed(1)}% / 100K token`}
      position="top"
    >
      <div className="flex items-center gap-2 px-2 py-1 bg-sda-bg-secondary rounded-md border border-sda-border-default/30 cursor-help">
        <Icon icon="database" size={12} color={color} />
        
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-sda-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
          
          <span className="text-xs font-medium" style={{ color }}>
            {percentage.toFixed(1)}%
          </span>
        </div>
        
        <span className="text-xs text-sda-text-muted hidden sm:inline">
          {status}
        </span>
      </div>
    </Tooltip>
  );
}
