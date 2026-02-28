import { create } from "zustand";
import type { CardOption } from "../../../shared/types";
import { extractMpcIdentifierFromImageId } from "@/helpers/mpcAutofillApi";
import { db } from "@/db";
import type { PrintInfo } from "@/types";
import type { Image, Cardback } from "@/db";

type ArtworkModalData = {
  card: CardOption | null;
  index: number | null;
  allCards?: CardOption[]; // List of all navigable cards
  initialTab?: 'artwork' | 'settings';
  initialFace?: 'front' | 'back';
  initialArtSource?: 'scryfall' | 'mpc';
  initialOpenAdvancedSearch?: boolean; // Auto-open Advanced Search (for failed lookups)
};

type Store = {
  open: boolean;
  card: CardOption | null;
  index: number | null;
  allCards: CardOption[]; // List of all navigable cards
  initialTab: 'artwork' | 'settings';
  initialFace: 'front' | 'back';
  initialArtSource: 'scryfall' | 'mpc' | null;
  initialOpenAdvancedSearch: boolean;
  navigationDirection: 'next' | 'prev' | null;
  prefetchedData: {
    cachedCardPrints: PrintInfo[] | null | undefined;
    imageObject: Image | Cardback | null | undefined;
    linkedBackCard: CardOption | null | undefined;
  };
  openModal: (data: ArtworkModalData) => void;
  closeModal: () => void;
  updateCard: (updatedCard: CardOption) => void;
  goToNextCard: () => Promise<void>;
  goToPrevCard: () => Promise<void>;
  advancedSearchZoom: number;
  setAdvancedSearchZoom: (zoom: number | ((prev: number) => number)) => void;
};

// Helper to prefetch Dexie data for a specific card
async function prefetchCardData(card: CardOption) {
  const data: Store['prefetchedData'] = {
    cachedCardPrints: undefined,
    imageObject: undefined,
    linkedBackCard: undefined,
  };

  try {
    // 1. Prints
    if (card.name) {
      const entry = await db.cardMetadataCache.where("name").equals(card.name).first();
      data.cachedCardPrints = entry?.hasFullPrints ? entry.data.prints : null;
    } else {
      data.cachedCardPrints = null;
    }

    // 2. Linked back card
    if (card.linkedBackId) {
      const backCard = await db.cards.get(card.linkedBackId);
      data.linkedBackCard = backCard || null;
    } else {
      data.linkedBackCard = null;
    }

    // 3. Image object (determine which card to use first based on modal logic)
    // Note: the modal checks selectedFace === 'back', but on nav doing it generically is hard without knowing initialFace
    // We fetch the main card's image for now; if initialFace is 'back', it might need the back card's image
    // To be safe, we fetch both if they exist, but the modal logic is simpler to just fetch the main one and fallback if not ready.
    // Actually, setting it to undefined allows the LiveQuery to take over correctly if we get it wrong.
    data.imageObject = undefined;
  } catch (err) {
    console.error("[ArtworkModalStore] Error prefetching data:", err);
  }

  return data;
}

async function navigateToCard(
  targetIndex: number,
  direction: 'next' | 'prev',
  get: () => Store,
  set: (state: Partial<Store>) => void,
) {
  const { allCards } = get();
  const card = allCards[targetIndex];
  if (!card) return;
  let newSource: 'scryfall' | 'mpc' | null = null;
  if (card.imageId && extractMpcIdentifierFromImageId(card.imageId)) {
    newSource = 'mpc';
  }
  const prefetched = await prefetchCardData(card);
  set({
    card,
    index: targetIndex,
    initialTab: 'artwork',
    initialFace: 'front',
    initialArtSource: newSource || 'scryfall',
    navigationDirection: direction,
    prefetchedData: prefetched,
  });
}

export const useArtworkModalStore = create<Store>((set, get) => ({
  open: false,
  card: null,
  index: null,
  allCards: [],
  initialTab: 'artwork',
  initialFace: 'front',
  initialArtSource: null,
  initialOpenAdvancedSearch: false,
  navigationDirection: null,
  prefetchedData: {
    cachedCardPrints: undefined,
    imageObject: undefined,
    linkedBackCard: undefined,
  },
  openModal: (data) => set({
    open: true,
    card: data.card,
    index: data.index,
    allCards: data.allCards ?? [],
    initialTab: data.initialTab ?? 'artwork',
    initialFace: data.initialFace ?? 'front',
    initialArtSource: data.initialArtSource ?? null,
    initialOpenAdvancedSearch: data.initialOpenAdvancedSearch ?? false,
    navigationDirection: null,
    prefetchedData: { cachedCardPrints: undefined, imageObject: undefined, linkedBackCard: undefined },
  }),
  closeModal: () => set({ open: false, card: null, index: null, allCards: [], initialTab: 'artwork', initialFace: 'front', initialArtSource: null, initialOpenAdvancedSearch: false, navigationDirection: null, prefetchedData: { cachedCardPrints: undefined, imageObject: undefined, linkedBackCard: undefined } }),
  updateCard: (updatedCard: CardOption) =>
    set((state) => {
      if (!state.card || state.index === null) return state;
      // Update both the current card AND the corresponding entry in allCards
      const updatedAllCards = [...state.allCards];
      updatedAllCards[state.index] = updatedCard;
      return {
        card: updatedCard,
        allCards: updatedAllCards,
      };
    }),
  goToNextCard: async () => {
    const { allCards, index } = get();
    if (allCards.length === 0 || index === null) return;
    const nextIndex = (index + 1) % allCards.length;
    await navigateToCard(nextIndex, 'next', get, set);
  },
  goToPrevCard: async () => {
    const { allCards, index } = get();
    if (allCards.length === 0 || index === null) return;
    const prevIndex = (index - 1 + allCards.length) % allCards.length;
    await navigateToCard(prevIndex, 'prev', get, set);
  },
  advancedSearchZoom: 1,
  setAdvancedSearchZoom: (zoom) => set((state) => ({
    advancedSearchZoom: typeof zoom === 'function' ? (zoom as (prev: number) => number)(state.advancedSearchZoom) : zoom
  })),
}));
