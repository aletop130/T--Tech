import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Return the API base URL.
 * Browser: empty string (uses Next.js rewrites).
 * Server: reads NEXT_PUBLIC_API_URL or falls back to the Docker service name.
 */
export function getApiBase(): string {
  return typeof window !== 'undefined'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000');
}

/**
 * Format a date as a relative time string (e.g., "2 minutes ago", "just now")
 */
export function formatDistanceToNow(date: Date | string | number): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 10) {
    return 'just now';
  }

  if (diffInSeconds < 60) {
    return `${diffInSeconds}s ago`;
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays}d ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}mo ago`;
  }

  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears}y ago`;
}

/**
 * Format a date as a locale string
 */
export function formatDate(date: Date | string | number): string {
  return new Date(date).toLocaleString();
}

/**
 * Format a date as a time string
 */
export function formatTime(date: Date | string | number): string {
  return new Date(date).toLocaleTimeString();
}

/**
 * Format a number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format a distance in kilometers
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${(km * 1000).toFixed(0)} m`;
  }
  if (km < 1000) {
    return `${km.toFixed(2)} km`;
  }
  return `${(km / 1000).toFixed(2)}k km`;
}

/**
 * Format a velocity in km/s
 */
export function formatVelocity(kms: number): string {
  return `${kms.toFixed(2)} km/s`;
}
