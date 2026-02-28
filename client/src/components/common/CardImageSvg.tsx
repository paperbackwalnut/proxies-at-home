import React, { useRef, useState, useEffect } from 'react';
import { CONSTANTS } from "@/constants/commonConstants";

interface CardImageSvgProps {
    /** Primary image URL */
    url: string;
    /** Fallback image URL (optional) */
    fallbackUrl?: string;
    /** Unique identifier for clip path generation */
    id: string;
    /** Bleed configuration */
    bleed?: {
        /** Amount of bleed to crop from each side (in mm) */
        amountMm: number;
        /** Total width of the source image including bleed (in mm) */
        sourceWidthMm: number;
        /** Total height of the source image including bleed (in mm) */
        sourceHeightMm: number;
    };
    /** Whether to round corners (default: true) */
    rounded?: boolean;
    /** Whether to use lazy loading (default: true) */
    lazy?: boolean;
}

/**
 * Renders a card image using SVG for precise sub-pixel positioning and cropping.
 * Supports exact mm-based bleed trimming and R2.5mm rounded corners.
 * Uses IntersectionObserver for lazy loading to prevent mass simultaneous fetches.
 */
export const CardImageSvg: React.FC<CardImageSvgProps> = ({
    url,
    fallbackUrl,
    id,
    bleed,
    rounded = true,
    lazy = true,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [isVisible, setIsVisible] = useState(!lazy);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [useFallback, setUseFallback] = useState(false);

    // Track previous successful URL for smooth transitions
    const [previousUrl, setPreviousUrl] = useState<string | null>(null);
    const [previousLoaded, setPreviousLoaded] = useState(false);

    // Track previous values to detect changes without triggering loops
    const prevPropsRef = useRef({ id, url, fallbackUrl });

    // ViewBox always defines the "visible" card area
    // The width/height of the viewBox is always the target card dimensions (63x88).
    // The viewBox origin (x,y) defines what part of the SVG space maps to the top-left of the viewport.
    const viewBoxX = bleed ? bleed.amountMm : 0;
    const viewBoxY = bleed ? bleed.amountMm : 0;

    const clipId = `clip-${id}`;

    // 1. Manage Loading State and Transitions
    useEffect(() => {
        const urlChanged = url !== prevPropsRef.current.url || fallbackUrl !== prevPropsRef.current.fallbackUrl;
        const idChanged = id !== prevPropsRef.current.id;

        if (urlChanged) {
            if (hasLoaded && !useFallback) {
                setPreviousUrl(prevPropsRef.current.url);
                setPreviousLoaded(true);
            } else if (hasLoaded && useFallback && prevPropsRef.current.fallbackUrl) {
                setPreviousUrl(prevPropsRef.current.fallbackUrl);
                setPreviousLoaded(true);
            }
            setHasLoaded(false);
            setUseFallback(false);
        }

        if (urlChanged || idChanged) {
            prevPropsRef.current = { id, url, fallbackUrl };
        }
    }, [id, url, fallbackUrl, hasLoaded, useFallback]);

    // Safety timeout: clear blur state if onLoad never fires
    useEffect(() => {
        if (!previousLoaded || hasLoaded) return;
        const timer = setTimeout(() => {
            setPreviousLoaded(false);
            setPreviousUrl(null);
        }, 2000);
        return () => clearTimeout(timer);
    }, [previousLoaded, hasLoaded]);

    // 2. Manage Intersection/Visibility (Lazy Loading)
    useEffect(() => {
        // If not lazy, or already marked visible, no need to observe
        if (!lazy || isVisible) {
            setIsVisible(true);
            return;
        }

        const svg = svgRef.current;
        if (!svg) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsVisible(true);
                        // Once visible, it stays visible for this component's lifespan
                        // to avoid re-observation cycles during URL swaps.
                    }
                });
            },
            {
                rootMargin: '100px',
                threshold: 0,
            }
        );

        observer.observe(svg);
        return () => observer.disconnect();
    }, [lazy, isVisible]);

    // Determine actual URL to use (primary or fallback)
    const actualUrl = useFallback && fallbackUrl ? fallbackUrl : url;
    const renderUrl = isVisible ? actualUrl : '';

    return (
        <svg
            ref={svgRef}
            viewBox={`${viewBoxX} ${viewBoxY} ${CONSTANTS.CARD_WIDTH_MM} ${CONSTANTS.CARD_HEIGHT_MM}`}
            className="w-full h-full block"
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={`Card image for ${id}`}
        >
            <defs>
                {rounded && (
                    <clipPath id={clipId}>
                        <rect
                            x={viewBoxX}
                            y={viewBoxY}
                            width={CONSTANTS.CARD_WIDTH_MM}
                            height={CONSTANTS.CARD_HEIGHT_MM}
                            rx={CONSTANTS.CORNER_RADIUS_MM}
                            ry={CONSTANTS.CORNER_RADIUS_MM}
                        />
                    </clipPath>
                )}
            </defs>

            {/* Placeholder background while nothing is loaded */}
            {!hasLoaded && !previousLoaded && (
                <rect
                    x={viewBoxX}
                    y={viewBoxY}
                    width={CONSTANTS.CARD_WIDTH_MM}
                    height={CONSTANTS.CARD_HEIGHT_MM}
                    rx={rounded ? CONSTANTS.CORNER_RADIUS_MM : 0}
                    ry={rounded ? CONSTANTS.CORNER_RADIUS_MM : 0}
                    fill="#1f2937"
                    className="animate-pulse"
                />
            )}

            {/* Render previous image if doing a resolution swap to prevent flashing */}
            {isVisible && previousLoaded && previousUrl && !hasLoaded && (
                <image
                    href={previousUrl}
                    x="0"
                    y="0"
                    width={bleed ? bleed.sourceWidthMm : CONSTANTS.CARD_WIDTH_MM}
                    height={bleed ? bleed.sourceHeightMm : CONSTANTS.CARD_HEIGHT_MM}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={rounded ? `url(#${clipId})` : undefined}
                    style={{ opacity: 1, filter: 'blur(2px)' }} // Slight blur implies it's upgrading
                />
            )}

            {/* Only render image element when visible, hide until loaded */}
            {isVisible && renderUrl && (
                <image
                    href={renderUrl}
                    x="0"
                    y="0"
                    // If bleed, use source dimensions. If not, fill the card area (63x88)
                    width={bleed ? bleed.sourceWidthMm : CONSTANTS.CARD_WIDTH_MM}
                    height={bleed ? bleed.sourceHeightMm : CONSTANTS.CARD_HEIGHT_MM}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={rounded ? `url(#${clipId})` : undefined}
                    style={{ opacity: hasLoaded ? 1 : 0, transition: previousLoaded ? 'opacity 0.3s ease-in' : 'none' }}
                    onLoad={() => {
                        setHasLoaded(true);
                        // Once new image loads, clear the previous one
                        setPreviousLoaded(false);
                        setPreviousUrl(null);
                    }}
                    onError={() => {
                        // Switch to fallback URL if available and not already using it
                        if (fallbackUrl && !useFallback) {
                            setUseFallback(true);
                            setHasLoaded(false); // Reset to show placeholder while fallback loads
                        }
                    }}
                />
            )}
        </svg>
    );
};
