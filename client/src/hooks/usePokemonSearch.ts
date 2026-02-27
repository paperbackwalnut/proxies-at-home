import { useState, useEffect, useRef, useMemo } from "react";
import { searchPokemonCards } from "@/helpers/tcgdexApi";
import { useSettingsStore } from "@/store/settings";
import type { ScryfallCard } from "../../../shared/types";

export interface PokemonSearchResult {
  cards: ScryfallCard[];
  isLoading: boolean;
  hasSearched: boolean;
  hasResults: boolean;
}

const pokemonSearchCache: Record<string, ScryfallCard[]> = {};

export function usePokemonSearch(
  query: string,
  options: { autoSearch?: boolean } = {}
): PokemonSearchResult {
  const { autoSearch = true } = options;
  const lang = useSettingsStore((s) => s.globalLanguage ?? "en");

  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentQueryRef = useRef<string>("");

  const cacheKey = useMemo(() => {
    const trimmed = query.trim();
    return trimmed.length >= 2 ? `pokemon|${lang}|${trimmed.toLowerCase()}` : null;
  }, [query, lang]);

  const cachedResult = useMemo(() => {
    if (cacheKey && pokemonSearchCache[cacheKey] !== undefined) {
      return pokemonSearchCache[cacheKey];
    }
    return null;
  }, [cacheKey]);

  useEffect(() => {
    if (cachedResult !== null) {
      setCards(cachedResult);
      setHasSearched(true);
    }
  }, [cachedResult]);

  useEffect(() => {
    if (!autoSearch) return;
    if (cachedResult !== null) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const performSearch = async () => {
      const trimmed = query.trim();
      if (!trimmed || trimmed.length < 2) {
        setCards([]);
        return;
      }

      if (!cacheKey) return;

      currentQueryRef.current = query;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setIsLoading(true);
        const results = await searchPokemonCards(trimmed, controller.signal, lang);

        if (currentQueryRef.current !== query) return;

        const queryLower = trimmed.toLowerCase();
        const sorted = results.sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          if (aName === queryLower && bName !== queryLower) return -1;
          if (bName === queryLower && aName !== queryLower) return 1;
          if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1;
          if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1;
          return aName.localeCompare(bName);
        });

        pokemonSearchCache[cacheKey] = sorted;
        setCards(sorted);
        setHasSearched(true);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          if (cacheKey) pokemonSearchCache[cacheKey] = [];
          setCards([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 500);
    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [query, autoSearch, cachedResult, cacheKey]);

  useEffect(() => {
    if (!query.trim()) {
      setCards([]);
      setHasSearched(false);
    }
  }, [query]);

  return { cards, isLoading, hasSearched, hasResults: cards.length > 0 };
}

export function usePokemonPrints(name: string, enabled: boolean) {
  const lang = useSettingsStore((s) => s.globalLanguage ?? "en");
  const [prints, setPrints] = useState<Array<{ imageUrl: string; set: string; number: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !name.trim()) return;

    const controller = new AbortController();
    setIsLoading(true);

    searchPokemonCards(name.trim(), controller.signal, lang)
      .then((cards) => {
        const mapped = cards
          .filter((c) => c.imageUrls?.[0])
          .map((c) => ({ imageUrl: c.imageUrls[0], set: c.set || '', number: c.number || '', lang }));
        setPrints(mapped);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [name, enabled, lang]);

  return { prints, isLoading };
}
