'use client';

import { Callout, Button, type Intent } from '@blueprintjs/core';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  intent?: Intent;
  className?: string;
}

export function ErrorState({
  message,
  onRetry,
  intent = 'danger',
  className,
}: ErrorStateProps) {
  return (
    <Callout intent={intent} icon="error" className={className ?? 'm-4'}>
      <p>{message}</p>
      {onRetry && (
        <Button
          small
          intent={intent}
          icon="refresh"
          onClick={onRetry}
          className="mt-2"
        >
          Retry
        </Button>
      )}
    </Callout>
  );
}
