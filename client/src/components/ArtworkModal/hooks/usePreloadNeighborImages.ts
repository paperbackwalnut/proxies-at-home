import { useEffect, useRef } from 'react';
import { db } from '@/db';
import type { CardOption } from '../../../../../shared/types';

interface UsePreloadNeighborImagesProps {
    allCards: CardOption[];
    currentIndex: number | null;
    navigationDirection: 'next' | 'prev' | null;
    preloadCount?: number;
    enabled?: boolean;
}

export function usePreloadNeighborImages({
    allCards,
    currentIndex,
    navigationDirection,
    preloadCount = 16,
    enabled = true,
}: UsePreloadNeighborImagesProps) {
    const preloadedUrlsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!enabled || currentIndex === null || allCards.length < 2) return;

        const timer = setTimeout(async () => {
            const nextIndex = (currentIndex + 1) % allCards.length;
            const prevIndex = (currentIndex - 1 + allCards.length) % allCards.length;

            const primaryIndex = navigationDirection === 'prev' ? prevIndex : nextIndex;
            const secondaryIndex = navigationDirection === 'prev' ? nextIndex : prevIndex;

            const orderedCards = [allCards[primaryIndex], allCards[secondaryIndex]].filter(Boolean);

            for (const card of orderedCards) {
                if (!card.name) continue;
                try {
                    const entry = await db.cardMetadataCache
                        .where('name')
                        .equals(card.name)
                        .first();
                    if (!entry?.hasFullPrints || !entry.data.prints) continue;
                    const urls = entry.data.prints
                        .slice(0, preloadCount)
                        .map((p) => p.imageUrl)
                        .filter((url): url is string => !!url && !preloadedUrlsRef.current.has(url));
                    for (const url of urls) {
                        preloadedUrlsRef.current.add(url);
                        const img = new Image();
                        img.src = url;
                    }
                } catch {
                    // Silently ignore preload failures
                }
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [allCards, currentIndex, navigationDirection, preloadCount, enabled]);
}
