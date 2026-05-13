/**
 * useRegistrationMarks Hook
 *
 * Renders registration marks on the page preview.
 * Supports Silhouette 3-point, 4-point, and Cricut PTC modes.
 * Portrait mode rotates mark positions for Silhouette paper loaded in portrait orientation.
 * Cricut mode uses landscape letter layout with marks derived directly from SVG ground truth.
 */

import { useRef, useEffect } from "react";
import { Graphics, type Container, type Application } from "pixi.js";
import type { PageLayoutInfo } from "./PixiVirtualCanvas";
import { CONSTANTS } from "@/constants/commonConstants";

// Silhouette registration mark constants (must match pdf.worker.ts)
const REG_MARK_OFFSET_MM = 10.0076; // 0.394" from page edge (Silhouette spec)
const REG_MARK_SQUARE_SIZE_MM = 5; // Size of the top-left square (3-point)
const REG_MARK_ARM_LENGTH_MM = 8.382; // 0.33" length of L-shape arms (Silhouette spec)
const REG_MARK_LINE_WIDTH_MM = 0.9906; // 0.039" thickness of L-shape lines

interface UseRegistrationMarksProps {
  isReady: boolean;
  container: Container | null;
  app: Application | null;
  pages: PageLayoutInfo[];
  registrationMarks: "none" | "3" | "4" | "cricut";
  registrationMarksPortrait: boolean;
}

/**
 * Draw a Silhouette L-shape mark at the given position using filled rectangles
 */
function drawLShape(
  g: Graphics,
  x: number,
  y: number,
  armLength: number,
  thickness: number,
  verticalDir: "up" | "down",
  horizontalDir: "left" | "right"
): void {
  const w = thickness;
  const L = armLength;

  const vx = x - w / 2;
  const vy = verticalDir === "down" ? y - w / 2 : y - L - w / 2;
  g.rect(vx, vy, w, L + w);

  const hx = horizontalDir === "right" ? x - w / 2 : x - L - w / 2;
  const hy = y - w / 2;
  g.rect(hx, hy, L + w, w);
}

/**
 * Hook to render registration marks on each page
 */
export function useRegistrationMarks({
  isReady,
  container,
  app,
  pages,
  registrationMarks,
  registrationMarksPortrait,
}: UseRegistrationMarksProps): void {
  const graphicsRef = useRef<Graphics | null>(null);

  useEffect(() => {
    if (!isReady || !container) return;

    // Always destroy old graphics to ensure clean state
    if (graphicsRef.current) {
      try {
        graphicsRef.current.parent?.removeChild(graphicsRef.current);
        graphicsRef.current.destroy();
      } catch {
        /* ignore */
      }
      graphicsRef.current = null;
    }

    if (registrationMarks === "none") {
      if (app) app.render();
      return;
    }

    // Create fresh graphics object
    const g = new Graphics();
    container.addChild(g);
    graphicsRef.current = g;

    // ── CRICUT PTC MODE ──────────────────────────────────────────────
    // Coordinates derived directly from SVG ground truth (landscape letter page)
    if (registrationMarks === "cricut") {
      pages.forEach((page) => {
        const W = page.pageWidthPx;
        const H = page.pageHeightPx;
        const Y = page.pageYOffset;
        const s = CONSTANTS.DISPLAY_MM_TO_PX;

        // TOP-LEFT: vertical rect + horizontal rect + triangle
        g.rect(3.3514 * s, Y + 10.6264 * s, 1.4746 * s, 22.3908 * s);
        g.rect(6.4107 * s, Y + 10.6264 * s, 22.4162 * s, 1.4746 * s);
        g.poly([
          3.3532 * s, Y + 11.3637 * s,
          4.8278 * s, Y + 10.6264 * s,
          4.8278 * s, Y + 12.101 * s,
        ]);

        // TOP-RIGHT: double-line L polygon
        g.poly([
          W - 4.826 * s,  Y + 36.025 * s,
          W - 3.351 * s,  Y + 36.025 * s,
          W - 3.351 * s,  Y + 10.625 * s,
          W - 28.825 * s, Y + 10.625 * s,
          W - 28.825 * s, Y + 12.100 * s,
          W - 4.826 * s,  Y + 12.100 * s,
        ]);

        // BOTTOM-LEFT: vertical rect + horizontal rect + triangle
        g.rect(3.3514 * s, Y + H - 13.6342 * s - 22.3908 * s, 1.4746 * s, 22.3908 * s);
        g.rect(6.4107 * s, Y + H - 10.6264 * s - 1.4746 * s, 22.4162 * s, 1.4746 * s);
        g.poly([
          3.3532 * s, Y + H - 11.3637 * s,
          4.8278 * s, Y + H - 10.6264 * s,
          4.8278 * s, Y + H - 12.101 * s,
        ]);

        // BOTTOM-RIGHT: double-line L polygon
        g.poly([
          W - 4.826 * s,  Y + H - 36.025 * s,
          W - 3.351 * s,  Y + H - 36.025 * s,
          W - 3.351 * s,  Y + H - 10.625 * s,
          W - 28.825 * s, Y + H - 10.625 * s,
          W - 28.825 * s, Y + H - 12.100 * s,
          W - 4.826 * s,  Y + H - 12.100 * s,
        ]);
      });

      g.fill({ color: 0x000000 });
      if (app) app.render();
      return;
    }

    // ── SILHOUETTE MODE ──────────────────────────────────────────────
    const offsetPx = REG_MARK_OFFSET_MM * CONSTANTS.DISPLAY_MM_TO_PX;
    const squareSizePx = REG_MARK_SQUARE_SIZE_MM * CONSTANTS.DISPLAY_MM_TO_PX;
    const armLengthPx = REG_MARK_ARM_LENGTH_MM * CONSTANTS.DISPLAY_MM_TO_PX;
    const lineWidthPx = REG_MARK_LINE_WIDTH_MM * CONSTANTS.DISPLAY_MM_TO_PX;

    pages.forEach((page) => {
      const pageY = page.pageYOffset;
      const pageW = page.pageWidthPx;
      const pageH = page.pageHeightPx;

      const topLeftX = offsetPx;
      const topLeftY = pageY + offsetPx;
      const topRightX = pageW - offsetPx;
      const topRightY = pageY + offsetPx;
      const bottomLeftX = offsetPx;
      const bottomLeftY = pageY + pageH - offsetPx;
      const bottomRightX = pageW - offsetPx;
      const bottomRightY = pageY + pageH - offsetPx;

      if (registrationMarksPortrait) {
        if (registrationMarks === "3") {
          g.rect(bottomLeftX, bottomLeftY - squareSizePx, squareSizePx, squareSizePx);
        } else {
          drawLShape(g, bottomLeftX, bottomLeftY, armLengthPx, lineWidthPx, "up", "right");
        }
        drawLShape(g, topLeftX,     topLeftY,     armLengthPx, lineWidthPx, "down", "right");
        drawLShape(g, bottomRightX, bottomRightY, armLengthPx, lineWidthPx, "up",   "left");
        if (registrationMarks === "4") {
          drawLShape(g, topRightX, topRightY, armLengthPx, lineWidthPx, "down", "left");
        }
      } else {
        if (registrationMarks === "3") {
          g.rect(topLeftX, topLeftY, squareSizePx, squareSizePx);
        } else {
          drawLShape(g, topLeftX, topLeftY, armLengthPx, lineWidthPx, "down", "right");
        }
        drawLShape(g, topRightX,   topRightY,   armLengthPx, lineWidthPx, "down", "left");
        drawLShape(g, bottomLeftX, bottomLeftY, armLengthPx, lineWidthPx, "up",   "right");
        if (registrationMarks === "4") {
          drawLShape(g, bottomRightX, bottomRightY, armLengthPx, lineWidthPx, "up", "left");
        }
      }
    });

    g.fill({ color: 0x000000 });

    if (app) {
      app.render();
    }
  }, [
    isReady,
    container,
    app,
    pages,
    registrationMarks,
    registrationMarksPortrait,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (graphicsRef.current) {
        try {
          graphicsRef.current.destroy();
        } catch {
          /* ignore */
        }
        graphicsRef.current = null;
      }
    };
  }, []);
}