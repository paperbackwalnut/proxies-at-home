import { useState, useCallback } from "react";
import type { ScryfallCard } from "../../../../../shared/types";
import { fetchCardWithPrints, fetchCardBySetAndNumber } from "@/helpers/scryfallApi";
import { debugLog } from "@/helpers/debug";
import type { ArtSource } from "../../common/ArtSourceToggle";

interface UseArtworkSearchProps {
    artSource: ArtSource;
}

export function useArtworkSearch({ artSource }: UseArtworkSearchProps) {
    const [isSearching, setIsSearching] = useState(false);
    const [previewCardData, setPreviewCardData] = useState<ScryfallCard | null>(null);

    const handleSearch = useCallback(
        async (
            name: string,
            exact: boolean = false,
            specificPrint?: { set: string; number: string }
        ) => {
            if (!name && !specificPrint) return;
            debugLog("[ArtworkModal] handleSearch:", {
                name,
                exact,
                specificPrint,
                artSource,
            });
            setIsSearching(true);
            try {
                let cardWithPrints: ScryfallCard | null = null;
                if (specificPrint) {
                    cardWithPrints = await fetchCardBySetAndNumber(
                        specificPrint.set,
                        specificPrint.number
                    );
                } else {
                    cardWithPrints = await fetchCardWithPrints(name, exact, true);
                }
                debugLog("[ArtworkModal] handleSearch result:", {
                    name: cardWithPrints?.name,
                    imageUrlsCount: cardWithPrints?.imageUrls?.length,
                    printsCount: cardWithPrints?.prints?.length,
                    firstImageUrl: cardWithPrints?.imageUrls?.[0]?.substring(0, 80),
                });
                if (cardWithPrints) {
                    setPreviewCardData(cardWithPrints);
                } else {
                    debugLog("No cards found for query:", name);
                }
            } catch (e) {
                debugLog("Search failed:", e);
            } finally {
                setIsSearching(false);
            }
        },
        [artSource]
    );

    return {
        isSearching,
        previewCardData,
        setPreviewCardData,
        handleSearch,
    };
}
