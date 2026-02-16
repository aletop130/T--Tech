// WRITE_TARGET="frontend/src/lib/api/debris.ts"
// WRITE_CONTENT_LENGTH=0

/* Debris API client
 * Provides functions to fetch debris and orbit data from the backend.
 * Implements exponential backoff on errors to improve resilience.
 */

const API_BASE: string = typeof window !== 'undefined'
  ? '' // Relative URL via Next.js rewrites
  : (process.env.NEXT_PUBLIC_API_URL || '');

const DEFAULT_TENANT_ID = 'default';

/**
 * Perform a fetch request with exponential backoff on failure.
 * @param url Full request URL.
 * @param init Optional fetch init options.
 * @param maxAttempts Number of attempts before giving up (default 3).
 * @param baseDelay Initial delay in ms before retrying (default 500ms).
 */
async function fetchWithBackoff<T>(
  url: string,
  init: RequestInit = {},
  maxAttempts = 3,
  baseDelay = 500
): Promise<T> {
  let attempt = 0;
  let delay = baseDelay;

  while (true) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'X‑Tenant‑ID': DEFAULT_TENANT_ID,
        ...(init.headers ?? {}),
      } as Record<string, string>;

      const response = await fetch(url, { ...init, headers });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const message = errBody.detail || `API error: ${response.status}`;
        throw new Error(message);
      }

      const text = await response.text();
      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw err;
      }
      // Wait for delay then double it for next attempt
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

import type { DebrisResponse, OrbitResponse } from '../types/debris';

/** Fetch debris objects for visualization.
 * @param limit Number of debris objects to retrieve (default 2500).
 * @param orbitClasses Comma‑separated orbit classes to filter (default "LEO").
 */
export async function getDebris(
  limit: number = 2500,
  orbitClasses: string = 'LEO'
): Promise<DebrisResponse> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (orbitClasses) {
    params.set('orbitClasses', orbitClasses);
  }
  const url = `${API_BASE}/api/v1/debris?${params}`;
  return fetchWithBackoff<DebrisResponse>(url);
}

/** Fetch orbit propagation for a specific NORAD identifier.
 * @param noradId NORAD identifier of the satellite or debris.
 * @param minutes Propagation duration in minutes (default 180).
 * @param stepSec Time step between points in seconds (default 60).
 */
export async function getOrbit(
  noradId: number,
  minutes: number = 180,
  stepSec: number = 60
): Promise<OrbitResponse> {
  const params = new URLSearchParams();
  params.set('norad', noradId.toString());
  params.set('minutes', minutes.toString());
  params.set('stepSec', stepSec.toString());
  const url = `${API_BASE}/api/v1/orbit?${params}`;
  return fetchWithBackoff<OrbitResponse>(url);
}
