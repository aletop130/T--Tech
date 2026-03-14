/* eslint-disable @typescript-eslint/no-empty-interface */
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

interface ModelViewerAttributes {
  src?: string;
  alt?: string;
  poster?: string;
  loading?: 'auto' | 'lazy' | 'eager';
  reveal?: 'auto' | 'interaction' | 'manual';
  'auto-rotate'?: boolean | string;
  'auto-rotate-delay'?: number | string;
  'rotation-per-second'?: string;
  'camera-controls'?: boolean | string;
  'camera-orbit'?: string;
  'camera-target'?: string;
  'field-of-view'?: string;
  'min-camera-orbit'?: string;
  'max-camera-orbit'?: string;
  'min-field-of-view'?: string;
  'max-field-of-view'?: string;
  'environment-image'?: string;
  exposure?: number | string;
  'shadow-intensity'?: number | string;
  'shadow-softness'?: number | string;
  style?: React.CSSProperties;
  class?: string;
  className?: string;
  id?: string;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & ModelViewerAttributes,
        HTMLElement
      >;
    }
  }
}

export {};
