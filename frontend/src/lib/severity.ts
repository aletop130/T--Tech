import type { Intent } from '@blueprintjs/core';

/** Map a severity string to a Blueprint Intent for Tags/Callouts. */
export function severityIntent(severity: string): Intent {
  const normalized = severity.toLowerCase();
  if (['critical', 'high', 'threatened'].includes(normalized)) return 'danger';
  if (['medium', 'watched'].includes(normalized)) return 'warning';
  if (['low', 'nominal'].includes(normalized)) return 'success';
  if (normalized === 'info') return 'primary';
  return 'none';
}

/** Map a severity string to a Tailwind background-color class. */
export function severityColor(severity: string): string {
  const colors: Record<string, string> = {
    critical: 'bg-sda-accent-red',
    high: 'bg-sda-accent-yellow',
    medium: 'bg-sda-accent-yellow',
    low: 'bg-sda-accent-green',
    info: 'bg-sda-accent-blue',
  };
  return colors[severity] || colors.info;
}

/** Map a severity string to a hex color for inline styles. */
export function severityHex(severity: string): string {
  switch (severity) {
    case 'critical':
    case 'high':
    case 'threatened':
      return '#ff6b6b';
    case 'medium':
    case 'watched':
      return '#ffd43b';
    default:
      return '#51cf66';
  }
}
