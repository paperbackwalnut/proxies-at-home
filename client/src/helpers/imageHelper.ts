import { API_BASE } from "../constants";
import {
  toProxied as toProxiedBase,
  fetchWithRetry as fetchWithRetryBase,
  getBleedInPixels as getBleedInPixelsBase,
} from "./imageProcessing";

const DPI = 300;

export function toProxied(url: string) {
  return toProxiedBase(url, API_BASE);
}

export function getBleedInPixels(bleedEdgeWidth: number, unit: string): number {
  return getBleedInPixelsBase(bleedEdgeWidth, unit, DPI);
}

export function getLocalBleedImageUrl(originalUrl: string): string {
  return toProxied(originalUrl);
}

export async function urlToDataUrl(url: string): Promise<string> {
  const resp = await fetch(toProxied(url));
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

export function pngToNormal(pngUrl: string) {
  try {
    const u = new URL(pngUrl);
    if (u.hostname.endsWith("scryfall.io")) {
      u.pathname = u.pathname.replace("/png/", "/normal/").replace(/\.png$/i, ".jpg");
    }
    return u.toString();
  } catch {
    return pngUrl;
  }
}

export async function fetchWithRetry(url: string, retries = 3, baseDelay = 250): Promise<Response> {
  return fetchWithRetryBase(url, retries, baseDelay);
}

/**
 * Parse an image ID from a URL.
 * - Scryfall URLs: strips query params (e.g., "https://cards.scryfall.io/.../front.jpg?1234" → "https://cards.scryfall.io/.../front.jpg")
 * - MPC/Drive URLs: extracts the ID from "id=" parameter (e.g., "...?id=abc123" → "abc123")
 * - Other URLs: returns as-is
 */
export function parseImageIdFromUrl(url: string): string {
  if (!url) return url;

  if (url.includes("scryfall")) {
    return url.split("?")[0];
  }

  if (url.includes("id=")) {
    return url.split("id=")[1] || url;
  }
  return url;
}

/**
 * Calculates the target physical pixel width for a card in the grid.
 * Base column width is 275px, scaled by zoom level and device pixel ratio.
 */
function getTargetPhysicalWidth(zoomLevel: number): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return 275 * zoomLevel * dpr;
}

/**
 * Determines the optimal Scryfall image tier based on zoom level.
 * Tiers: small (146), normal (488), large (672), png (745)
 */
export function getOptimalScryfallResolution(zoomLevel: number): 'small' | 'normal' | 'large' | 'png' {
  const targetWidth = getTargetPhysicalWidth(zoomLevel);
  if (targetWidth <= 146) return 'small';
  if (targetWidth <= 488) return 'normal';
  if (targetWidth <= 672) return 'large';
  return 'png';
}

/**
 * Determines the optimal MPC image tier based on zoom level.
 */
export function getOptimalMpcResolution(zoomLevel: number): 'small' | 'large' | 'full' {
  const targetWidth = getTargetPhysicalWidth(zoomLevel);
  if (targetWidth <= 300) return 'small';
  if (targetWidth <= 672) return 'large';
  return 'full';
}

/**
 * Replaces the resolution segment in a Scryfall URL.
 */
export function applyScryfallResolution(url: string, resolution: 'small' | 'normal' | 'large' | 'png'): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('scryfall.io')) {
      // Find the current resolution segment (small, normal, large, png, art_crop, border_crop)
      // Usually looks like /cards/{size}/front/...
      // The size is always the directory right after 'cards' or the top level if not cards
      // Format 1: /large/front/1/2/1234.jpg
      // Format 2: /cards/large/front/1/2/1234.jpg
      // Actually Scryfall image URIs often look like: https://cards.scryfall.io/png/front/...

      const newExt = resolution === 'png' ? '.png' : '.jpg';

      // We can use a regex to replace the known size paths
      u.pathname = u.pathname
        .replace(/\/(small|normal|large|png|art_crop|border_crop)\//, `/${resolution}/`)
        .replace(/\.(png|jpg|jpeg)$/i, newExt);

      return u.toString();
    }
  } catch {
    // Return original if parsing fails
  }
  return url;
}