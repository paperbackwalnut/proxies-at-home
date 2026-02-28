import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { getOptimalScryfallResolution, getOptimalMpcResolution, applyScryfallResolution } from './imageHelper';

describe('imageHelper resolution functions', () => {
  let originalDpr: number;

  beforeEach(() => {
    // Save original DPR and mock it
    originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', {
      writable: true,
      value: 1,
    });
  });

  afterEach(() => {
    // Restore original DPR
    Object.defineProperty(window, 'devicePixelRatio', {
      writable: true,
      value: originalDpr,
    });
  });

  describe('getOptimalScryfallResolution', () => {
    it('returns small for tiny zoom levels', () => {
      // targetWidth = 275 * 0.5 * 1 = 137.5 <= 146
      expect(getOptimalScryfallResolution(0.5)).toBe('small');
    });

    it('returns normal for standard zoom levels', () => {
      // targetWidth = 275 * 1.0 * 1 = 275 <= 488
      expect(getOptimalScryfallResolution(1.0)).toBe('normal');
    });

    it('returns large for zoomed in levels', () => {
      // targetWidth = 275 * 2.0 * 1 = 550 <= 672
      expect(getOptimalScryfallResolution(2.0)).toBe('large');
    });

    it('returns png for max zoom', () => {
      // targetWidth = 275 * 3.0 * 1 = 825 > 672
      expect(getOptimalScryfallResolution(3.0)).toBe('png');
    });

    it('accounts for devicePixelRatio automatically', () => {
      Object.defineProperty(window, 'devicePixelRatio', {
        writable: true,
        value: 2, // Retina display
      });
      // zoomLevel 1.0 but dpr 2.0 = 550 physical pixels -> large
      expect(getOptimalScryfallResolution(1.0)).toBe('large');
    });
  });

  describe('getOptimalMpcResolution', () => {
    it('returns small for standard zoom', () => {
      // targetWidth = 275 * 1.0 * 1 = 275 <= 300
      expect(getOptimalMpcResolution(1.0)).toBe('small');
    });

    it('returns large for zoomed in', () => {
      // targetWidth = 275 * 2.0 * 1 = 550 <= 672
      expect(getOptimalMpcResolution(2.0)).toBe('large');
    });

    it('returns full for max zoom', () => {
      // targetWidth = 275 * 3.0 * 1 = 825 > 672
      expect(getOptimalMpcResolution(3.0)).toBe('full');
    });

    it('returns full for normal zoom on high dpr', () => {
      Object.defineProperty(window, 'devicePixelRatio', {
        writable: true,
        value: 2.5, // High res display
      });
      // zoomLevel 1.0 but dpr 2.5 = 687 physical pixels -> full
      expect(getOptimalMpcResolution(1.0)).toBe('full');
    });
  });

  describe('applyScryfallResolution', () => {
    it('modifies Scryfall URLs correctly for jpg tier', () => {
      const originalUrl = 'https://cards.scryfall.io/png/front/8/e/8ea51dc5-6677-4c75-ba4d-2a3b04332924.png';
      const expectedUrl = 'https://cards.scryfall.io/small/front/8/e/8ea51dc5-6677-4c75-ba4d-2a3b04332924.jpg';

      expect(applyScryfallResolution(originalUrl, 'small')).toBe(expectedUrl);
    });

    it('modifies Scryfall URLs correctly for png tier', () => {
      const originalUrl = 'https://cards.scryfall.io/normal/front/8/e/8ea51dc5-6677-4c75-ba4d-2a3b04332924.jpg';
      const expectedUrl = 'https://cards.scryfall.io/png/front/8/e/8ea51dc5-6677-4c75-ba4d-2a3b04332924.png';

      expect(applyScryfallResolution(originalUrl, 'png')).toBe(expectedUrl);
    });

    it('ignores non-scryfall URLs', () => {
      const originalUrl = 'https://google.com/images/cat.jpg';
      expect(applyScryfallResolution(originalUrl, 'small')).toBe(originalUrl);
    });

    it('ignores invalid URLs without throwing', () => {
      const invalidUrl = 'not-a-url';
      expect(applyScryfallResolution(invalidUrl, 'small')).toBe(invalidUrl);
    });
  });
});
