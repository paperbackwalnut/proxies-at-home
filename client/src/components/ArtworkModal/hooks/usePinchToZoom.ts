import { useEffect, useRef } from "react";

interface UsePinchToZoomProps {
    zoomLevel: number;
    setZoomLevel: (zoom: number) => void;
    minZoom?: number;
    maxZoom?: number;
}

export function usePinchToZoom({
    zoomLevel,
    setZoomLevel,
    minZoom = 0.5,
    maxZoom = 3,
}: UsePinchToZoomProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef(zoomLevel);

    useEffect(() => {
        zoomRef.current = zoomLevel;
    }, [zoomLevel]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let initialDistance = 0;
        let initialZoom = 1;

        const getDistance = (touches: TouchList) => {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.stopPropagation();
                initialDistance = getDistance(e.touches);
                initialZoom = zoomRef.current;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault(); // Prevent default browser zoom
                e.stopPropagation();
                const currentDistance = getDistance(e.touches);
                if (initialDistance > 0) {
                    const scale = currentDistance / initialDistance;
                    const newZoom = Math.min(Math.max(minZoom, initialZoom * scale), maxZoom);
                    setZoomLevel(newZoom);
                }
            }
        };

        container.addEventListener("touchstart", handleTouchStart, {
            passive: false,
            capture: true,
        });
        container.addEventListener("touchmove", handleTouchMove, {
            passive: false,
            capture: true,
        });

        return () => {
            container.removeEventListener("touchstart", handleTouchStart, {
                capture: true,
            });
            container.removeEventListener("touchmove", handleTouchMove, {
                capture: true,
            });
        };
    }, [minZoom, maxZoom, setZoomLevel]);

    return { containerRef };
}
