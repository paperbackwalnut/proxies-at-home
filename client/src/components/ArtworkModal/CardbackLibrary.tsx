import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X, ChevronDown, ChevronRight, Star } from "lucide-react";
import { TextInput } from "flowbite-react";
import { CardbackTile } from "./CardbackTile";
import { db } from "@/db";
import {
    BUILTIN_CARDBACKS,
    getAllCardbacks,
    invalidateCardbackUrl,
    ingestMpcCardback,
} from "@/helpers/cardbackLibrary";
import { useMpcSearch } from "@/hooks/useMpcSearch";
import { getMpcAutofillImageUrl, type MpcAutofillCard } from "@/helpers/mpcAutofillApi";
import type { CardOption, CardbackSource } from "../../../../shared/types";
import { CardGrid } from "../common";
import { CardArtFilterBar } from "../common/CardArtFilterBar/CardArtFilterBar";
import type { CardbackFilterState } from "../common/CardArtFilterBar/CardbackFilterBar";
import { useUserPreferencesStore } from "@/store";

const CARDBACK_DELETE_CONFIRM_KEY = "cardback-delete-confirm-disabled";

export interface CardbackLibraryProps {
    linkedBackCard: CardOption | undefined;
    modalCard: CardOption | null;
    defaultCardbackId: string;
    onSelectCardback: (id: string, name: string) => void;
    onSetAsDefaultCardback: (id: string, name: string) => void;
    onClose: () => void;
    onRequestDelete: (cardbackId: string, cardbackName: string) => void;
    onExecuteDelete: (cardbackId: string) => Promise<void>;
    cardSize?: number;
    filtersCollapsed?: boolean;
    onFiltersCollapsedChange?: (collapsed: boolean) => void;
}

interface MergedCardbackItem {
    id: string;
    name: string;
    imageUrl: string;
    source: string;
    origin: CardbackSource;
    hasBuiltInBleed: boolean;
    displayBleedWidth?: number;
    dpi?: number;
    tags?: string[];
    mpcCard?: MpcAutofillCard; // Only for ephemeral MPC items
    isPersisted: boolean;
    isFullyIngested: boolean;
}

export function CardbackLibrary({
    linkedBackCard,
    defaultCardbackId,
    onSelectCardback,
    onSetAsDefaultCardback,
    onRequestDelete,
    onExecuteDelete,
    cardSize,
    filtersCollapsed = false,
}: CardbackLibraryProps) {
    const [editingCardbackId, setEditingCardbackId] = useState<string | null>(null);
    const [editingCardbackName, setEditingCardbackName] = useState<string>("");
    const [skipConfirmation, setSkipConfirmation] = useState(false);
    const [mpcQuery, setMpcQuery] = useState("");

    // User Preferences for defaults
    const preferences = useUserPreferencesStore(s => s.preferences);
    const { toggleFavoriteCardbackOrigin, toggleFavoriteCardbackSource, setFavoriteMpcDpi } = useUserPreferencesStore();
    const favoriteSort = preferences?.favoriteCardbackSort || 'name';
    const favoriteGroupBy = preferences?.favoriteCardbackGroupBy || false;

    // Filter State
    const [filters, setFilters] = useState<CardbackFilterState>({
        originFilters: new Set<CardbackSource>(['builtin', 'uploaded', 'mpc']),
        sourceFilters: new Set<string>(),
        minDpi: preferences?.favoriteMpcDpi ?? 0,
        sortBy: favoriteSort as 'name' | 'source' | 'origin' | 'dpi',
        sortDir: 'asc',
        groupBy: favoriteGroupBy,
    });

    // Sync from preferences on mount if available
    const filtersInitializedRef = useRef(false);
    useEffect(() => {
        if (preferences && !filtersInitializedRef.current) {
            filtersInitializedRef.current = true;
            setFilters(prev => ({
                ...prev,
                minDpi: preferences.favoriteMpcDpi ?? 0,
                sortBy: (preferences.favoriteCardbackSort || 'name') as "name" | "source" | "origin" | "dpi",
                groupBy: !!preferences.favoriteCardbackGroupBy,
                originFilters: preferences.favoriteCardbackOrigins?.length
                    ? new Set(preferences.favoriteCardbackOrigins as CardbackSource[])
                    : new Set<CardbackSource>(['builtin', 'uploaded', 'mpc']),
                sourceFilters: new Set(preferences.favoriteCardbackSources || []),
            }));
        }
    }, [preferences]);

    const [allGroupsCollapsed, setAllGroupsCollapsed] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const isGroupCollapsed = useCallback((groupName: string) => {
        if (allGroupsCollapsed) return !collapsedGroups.has(groupName);
        return collapsedGroups.has(groupName);
    }, [allGroupsCollapsed, collapsedGroups]);

    const toggleGroupCollapse = useCallback((groupName: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
        });
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem(CARDBACK_DELETE_CONFIRM_KEY);
        if (stored === "true") setSkipConfirmation(true);
    }, []);

    // Local Data
    const persistedCardbacks = useLiveQuery(() => getAllCardbacks(), []);

    // MPC Search Hook
    // We fetch ALL cardbacks by passing an empty query, and filter locally
    const mpcSearch = useMpcSearch("", {
        cardType: 'CARDBACK',
        autoSearch: true,
    });

    // Autocomplete data (names from local cardbacks and current MPC search)
    const autocompleteNames = useMemo(() => {
        const names = new Set<string>();
        const lowerQuery = mpcQuery.trim().toLowerCase();

        if (persistedCardbacks && lowerQuery) {
            persistedCardbacks.forEach(cb => {
                if (cb.name.toLowerCase().includes(lowerQuery)) {
                    names.add(cb.name);
                }
            });
        }

        // Include all names from the current search results (since they already matched fuzzily)
        if (lowerQuery) {
            mpcSearch.cards.forEach(c => names.add(c.name));
        }

        return Array.from(names).sort();
    }, [persistedCardbacks, mpcSearch.cards, mpcQuery]);

    // Stable pin key
    // We only want to pin the selected card to the top on *initial load* of the library
    // If the user clicks a different card, it highlights immediately, but we don't want it to jump.
    const initialSelectedIdRef = useRef<string | undefined>(linkedBackCard?.imageId);
    useEffect(() => {
        // We only care about setting this once when the component mounts.
        // If the user navigates away and back, the modal is unmounted so this will reset.
        if (initialSelectedIdRef.current === undefined && linkedBackCard?.imageId) {
            initialSelectedIdRef.current = linkedBackCard.imageId;
        }
    }, [linkedBackCard?.imageId]);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Keyboard navigation for fast scrolling
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'ArrowUp') {
                e.preventDefault();
                scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (e.ctrlKey && e.key === 'ArrowDown') {
                e.preventDefault();
                const container = scrollContainerRef.current;
                if (container) {
                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Merging & Local Filtering
    const { mergedResults, totalMatchingCount, maxDpi } = useMemo(() => {
        const persisted = persistedCardbacks ?? [];
        const { originFilters, sourceFilters, minDpi, sortBy, sortDir } = filters;
        const trimmedQuery = mpcQuery.trim().toLowerCase();

        // --- Calculate Total Matching Universe (Ignoring Filters) ---
        let localNonMpcCount = 0;
        let localMpcCount = 0;

        if (!trimmedQuery) {
            localNonMpcCount = persisted.filter(cb => cb.origin !== 'mpc').length;
            localMpcCount = persisted.filter(cb => cb.origin === 'mpc').length;
        } else {
            const localMatches = persisted.filter(cb =>
                cb.name.toLowerCase().includes(trimmedQuery) || cb.source.toLowerCase().includes(trimmedQuery)
            );
            localNonMpcCount = localMatches.filter(cb => cb.origin !== 'mpc').length;
            localMpcCount = localMatches.filter(cb => cb.origin === 'mpc').length;
        }

        // 2. Remote items matching query (Total count from server search)
        const remoteMpcCount = mpcSearch.totalCards;

        // Total = (Local Non-MPC) + Max(Local MPC, Remote MPC)
        const totalMatchingCount = localNonMpcCount + Math.max(localMpcCount, remoteMpcCount);


        // --- Calculate Filtered Results ---
        // 1. Collect local items if their origin is selected (or if none are selected, show all)
        const localItems: MergedCardbackItem[] = persisted
            .filter(cb => originFilters.size === 0 || originFilters.has(cb.origin))
            .filter(cb => !trimmedQuery || cb.name.toLowerCase().includes(trimmedQuery) || cb.source.toLowerCase().includes(trimmedQuery))
            .filter(cb => sourceFilters.size === 0 || sourceFilters.has(cb.source))
            .map(cb => ({
                id: cb.id,
                name: cb.name,
                imageUrl: cb.imageUrl,
                source: cb.source,
                origin: cb.origin,
                hasBuiltInBleed: !!cb.hasBuiltInBleed,
                displayBleedWidth: cb.displayBleedWidth,
                isPersisted: true,
                dpi: cb.origin === 'builtin' ? Infinity : cb.dpi,
                tags: cb.tags,
                isFullyIngested: !!cb.isFullyIngested,
            }))
            .filter(cb => minDpi === 0 || cb.dpi === Infinity || (cb.dpi && cb.dpi >= minDpi) || cb.id === 'cardback_builtin_blank');

        // 2. Collect MPC items if 'mpc' origin is selected (or if none are selected)
        // Exclude those already persisted (matching by identifier)
        const ingestedMpcIds = new Set(
            persisted
                .filter(cb => cb.id.startsWith('cardback_mpc_'))
                .map(cb => cb.id.replace('cardback_mpc_', ''))
        );

        const mpcItems: MergedCardbackItem[] = [];
        if (originFilters.size === 0 || originFilters.has('mpc')) {
            mpcSearch.cards.forEach(card => {
                if (!ingestedMpcIds.has(card.identifier)) {
                    // Check if card matches query
                    const matchesQuery = !trimmedQuery ||
                        card.name.toLowerCase().includes(trimmedQuery) ||
                        card.sourceName.toLowerCase().includes(trimmedQuery);

                    if (!matchesQuery) return;

                    // Filter by MPC source and minDpi if active
                    if (
                        (sourceFilters.size === 0 || sourceFilters.has(card.sourceName)) &&
                        (minDpi === 0 || (card.dpi || 0) >= minDpi)
                    ) {
                        mpcItems.push({
                            id: `cardback_mpc_${card.identifier}`,
                            name: card.name,
                            imageUrl: getMpcAutofillImageUrl(card.identifier, 'large'),
                            source: card.sourceName,
                            origin: 'mpc',
                            hasBuiltInBleed: true,
                            dpi: card.dpi,
                            tags: card.tags,
                            mpcCard: card,
                            isPersisted: false,
                            isFullyIngested: false,
                        });
                    }
                }
            });
        }

        const allItems = [...localItems, ...mpcItems];
        const maxDpi = allItems.reduce((max, item) => {
            if (item.dpi && item.dpi !== Infinity) {
                return Math.max(max, item.dpi);
            }
            return max;
        }, 0);

        // 3. Global Sort
        allItems.sort((a, b) => {
            // Pin selected to top (using the initial load value to prevent jumping)
            const aSelected = initialSelectedIdRef.current === a.id;
            const bSelected = initialSelectedIdRef.current === b.id;
            if (aSelected && !bSelected) return -1;
            if (!aSelected && bSelected) return 1;

            // Pin builtins to top by default if sorting by name
            if (sortBy === 'name') {
                const aIsBuiltin = a.origin === 'builtin';
                const bIsBuiltin = b.origin === 'builtin';
                if (aIsBuiltin && !bIsBuiltin) return -1;
                if (!aIsBuiltin && bIsBuiltin) return 1;
                if (aIsBuiltin && bIsBuiltin) {
                    const priorityOrder = BUILTIN_CARDBACKS.map(b => b.id);
                    return priorityOrder.indexOf(a.id) - priorityOrder.indexOf(b.id);
                }
            }

            let cmp = 0;
            if (sortBy === 'name') {
                cmp = a.name.localeCompare(b.name);
            } else if (sortBy === 'source') {
                cmp = a.source.localeCompare(b.source);
            } else if (sortBy === 'origin') {
                cmp = a.origin.localeCompare(b.origin);
            } else if (filters.sortBy === 'dpi') {
                const dpiA = (a.origin === 'builtin' && a.id !== 'cardback_builtin_blank') ? Infinity : (a.dpi || 0);
                const dpiB = (b.origin === 'builtin' && b.id !== 'cardback_builtin_blank') ? Infinity : (b.dpi || 0);
                cmp = dpiA - dpiB;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return { mergedResults: allItems, totalMatchingCount, maxDpi };
    }, [persistedCardbacks, mpcSearch.cards, filters, mpcQuery, mpcSearch.totalCards]);



    const handleToggleAllCollapsed = useCallback(() => {
        setAllGroupsCollapsed(prev => !prev);
        setCollapsedGroups(new Set());
    }, []);

    const groupedResults = useMemo(() => {
        if (!filters.groupBy) return null;
        const groups = new Map<string, MergedCardbackItem[]>();
        for (const item of mergedResults) {
            let key = "Other";
            if (filters.sortBy === "name") {
                key = item.name.charAt(0).toUpperCase();
                if (!/[A-Z]/.test(key)) key = "#";
            } else if (filters.sortBy === "source") {
                key = item.source || "Unknown Source";
            } else if (filters.sortBy === "origin") {
                key = item.origin === "builtin" ? "Proxxied" : item.origin === "uploaded" ? "My Uploads" : "MPC Autofill";
            } else if (filters.sortBy === "dpi") {
                key = item.dpi === Infinity ? "Proxxied" : (item.dpi ? `${item.dpi} DPI` : "Unknown DPI");
            }
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        }

        const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
            if (a === "#" && b !== "#") return 1;
            if (b === "#" && a !== "#") return -1;

            if (filters.sortBy === "origin") {
                const favOrigins = preferences?.favoriteCardbackOrigins || [];
                const originA = a === 'Proxxied' ? 'builtin' : a === 'My Uploads' ? 'uploaded' : a === 'MPC Autofill' ? 'mpc' : null;
                const originB = b === 'Proxxied' ? 'builtin' : b === 'My Uploads' ? 'uploaded' : b === 'MPC Autofill' ? 'mpc' : null;

                const aFav = originA && favOrigins.includes(originA as 'builtin' | 'uploaded' | 'mpc');
                const bFav = originB && favOrigins.includes(originB as 'builtin' | 'uploaded' | 'mpc');
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;

                const order = { "Proxxied": 1, "My Uploads": 2, "MPC Autofill": 3, "Other": 4 };
                const rankA = order[a as keyof typeof order] || 5;
                const rankB = order[b as keyof typeof order] || 5;
                if (rankA !== rankB) return rankA - rankB;
            }

            if (filters.sortBy === "source") {
                const favSources = preferences?.favoriteCardbackSources || [];
                const aFav = favSources.includes(a);
                const bFav = favSources.includes(b);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
            }

            if (filters.sortBy === "dpi") {
                const favDpi = preferences?.favoriteMpcDpi ?? null;
                const dpiA = a === "Unknown DPI" ? -1 : (a.startsWith("Proxxied") ? Infinity : parseInt(a) || 0);
                const dpiB = b === "Unknown DPI" ? -1 : (b.startsWith("Proxxied") ? Infinity : parseInt(b) || 0);
                if (favDpi !== null) {
                    const aIsFav = dpiA === favDpi;
                    const bIsFav = dpiB === favDpi;
                    if (aIsFav && !bIsFav) return -1;
                    if (!aIsFav && bIsFav) return 1;
                }
                if (dpiA !== dpiB) return dpiB - dpiA;
            }

            return a.localeCompare(b);
        });

        if (filters.sortDir === 'desc') {
            sortedKeys.reverse();
        }

        return { groups, sortedKeys };
    }, [mergedResults, filters.sortBy, filters.groupBy, filters.sortDir, preferences]);

    const [optimisticSelectedId, setOptimisticSelectedId] = useState<string | null>(null);

    // Clear optimistic state once the DB catches up
    useEffect(() => {
        if (optimisticSelectedId && linkedBackCard?.imageId === optimisticSelectedId) {
            setOptimisticSelectedId(null);
        }
    }, [linkedBackCard?.imageId, optimisticSelectedId]);

    // Handlers
    const handleSelectCardback = useCallback((item: MergedCardbackItem) => {
        setOptimisticSelectedId(item.id);

        // Defer the heavy DB operations and network requests to the next tick
        // so the React render cycle can paint the optimistic highlight immediately
        setTimeout(() => {
            onSelectCardback(item.id, item.name);
            if (!item.isFullyIngested) {
                const mpcCard = item.mpcCard || {
                    identifier: item.id.replace('cardback_mpc_', ''),
                    name: item.name,
                    sourceName: item.source,
                    tags: item.tags || [],
                    dpi: item.dpi || 0,
                    smallThumbnailUrl: '', // unused in ingestion
                    mediumThumbnailUrl: '', // unused in ingestion
                    source: '', // unused in ingestion
                    extension: '', // unused in ingestion
                    size: 0, // unused in ingestion
                };
                ingestMpcCardback(mpcCard).catch(console.error);
            }
        }, 0);
    }, [onSelectCardback]);

    const handleDelete = async (cardbackId: string) => {
        const cardback = persistedCardbacks?.find(cb => cb.id === cardbackId);
        const cardbackName = cardback?.name || 'Unknown';
        if (skipConfirmation) {
            await onExecuteDelete(cardbackId);
        } else {
            onRequestDelete(cardbackId, cardbackName);
        }
    };

    const handleStartEdit = (cardbackId: string, name: string) => {
        setEditingCardbackId(cardbackId);
        setEditingCardbackName(name);
    };

    const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0, width: 0 });
    const searchInputRef = useRef<HTMLDivElement>(null);
    const [focusedAutocompleteIndex, setFocusedAutocompleteIndex] = useState(-1);
    const [isAutocompleteVisible, setIsAutocompleteVisible] = useState(true);

    const filteredAutocompleteNames = useMemo(() => {
        if (!mpcQuery) return [];
        return autocompleteNames.filter(name => name.toLowerCase() !== mpcQuery.toLowerCase());
    }, [mpcQuery, autocompleteNames]);

    const showAutocomplete = isAutocompleteVisible && filteredAutocompleteNames.length > 0;

    // Reset autocomplete state on query change
    useEffect(() => {
        setFocusedAutocompleteIndex(-1);
        setIsAutocompleteVisible(true);
    }, [mpcQuery]);

    // Handle clicks outside to close autocomplete
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
                setIsAutocompleteVisible(false);
            }
        };

        if (isAutocompleteVisible) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isAutocompleteVisible]);

    useLayoutEffect(() => {
        if (showAutocomplete && searchInputRef.current) {
            const rect = searchInputRef.current.getBoundingClientRect();
            setAutocompletePos({
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
            });
        }
    }, [showAutocomplete, filteredAutocompleteNames]);

    const handleSaveEdit = async (cardbackId: string) => {
        if (editingCardbackName.trim()) {
            await db.cardbacks.update(cardbackId, { displayName: editingCardbackName.trim() });
            invalidateCardbackUrl(cardbackId);
        }
        setEditingCardbackId(null);
    };

    return (
        <div className="flex flex-col h-full w-full min-h-0">
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent flex flex-col min-h-0">
                <div className="px-6 flex flex-col gap-4 w-full flex-1">
                    {/* Filters */}
                    {!filtersCollapsed && (
                        <CardArtFilterBar
                            mode="cardback"
                            filters={filters}
                            totalCount={totalMatchingCount}
                            filteredCount={mergedResults.length}
                            availableMpcSources={Array.from(new Set(mergedResults.map(r => r.source).filter(Boolean))).map(name => ({ name, hasResults: true }))}
                            setMinDpi={(dpi) => setFilters(prev => ({ ...prev, minDpi: dpi }))}
                            setSortBy={(sort) => setFilters(prev => ({ ...prev, sortBy: sort }))}
                            setSortDir={(dir) => setFilters(prev => ({ ...prev, sortDir: dir }))}
                            setGroupBy={(enabled) => setFilters(prev => ({ ...prev, groupBy: enabled }))}
                            toggleOriginFilter={(origin: CardbackSource) => setFilters(prev => {
                                const next = new Set(prev.originFilters);
                                if (next.has(origin)) next.delete(origin);
                                else next.add(origin);
                                return { ...prev, originFilters: next };
                            })}
                            toggleSourceFilter={(source) => setFilters(prev => {
                                const next = new Set(prev.sourceFilters);
                                if (next.has(source)) next.delete(source);
                                else next.add(source);
                                return { ...prev, sourceFilters: next };
                            })}
                            setOriginFilters={(origins) => setFilters(prev => ({ ...prev, originFilters: origins }))}
                            setSourceFilters={(sources) => setFilters(prev => ({ ...prev, sourceFilters: sources }))}
                            clearFilters={() => setFilters(prev => ({
                                ...prev,
                                originFilters: new Set(),
                                sourceFilters: new Set(),
                                minDpi: 0
                            }))}
                            isCollapsed={allGroupsCollapsed}
                            onToggleCollapse={handleToggleAllCollapsed}
                            searchBar={
                                <div className="relative flex-1 h-10 ml-2 min-w-[200px]" ref={searchInputRef}>
                                    <TextInput
                                        sizing="lg"
                                        type="text"
                                        placeholder="Search cardbacks..."
                                        value={mpcQuery}
                                        onClick={() => setIsAutocompleteVisible(true)}
                                        onChange={(e) => setMpcQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (!showAutocomplete) return;

                                            if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                setFocusedAutocompleteIndex(prev =>
                                                    prev < filteredAutocompleteNames.length - 1 ? prev + 1 : prev
                                                );
                                            } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setFocusedAutocompleteIndex(prev => (prev > 0 ? prev - 1 : 0));
                                            } else if (e.key === 'Enter') {
                                                if (focusedAutocompleteIndex >= 0 && focusedAutocompleteIndex < filteredAutocompleteNames.length) {
                                                    e.preventDefault();
                                                    setMpcQuery(filteredAutocompleteNames[focusedAutocompleteIndex]);
                                                    setIsAutocompleteVisible(false);
                                                }
                                            } else if (e.key === 'Escape') {
                                                e.preventDefault();
                                                setIsAutocompleteVisible(false);
                                                setFocusedAutocompleteIndex(-1);
                                            }
                                        }}
                                        theme={{
                                            field: {
                                                input: {
                                                    base: "block w-full border disabled:cursor-not-allowed disabled:opacity-50 h-full",
                                                    sizes: { lg: "p-2.5 sm:text-base pl-10" },
                                                    colors: {
                                                        gray: "bg-gray-100 border-gray-300 text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:focus:border-primary-500 dark:focus:ring-primary-500"
                                                    }
                                                }
                                            }
                                        }}
                                    />
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                                    {mpcQuery && (
                                        <button
                                            onClick={() => setMpcQuery("")}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                        >
                                            <X className="w-5 h-5" strokeWidth={2.5} />
                                        </button>
                                    )}
                                    {showAutocomplete && createPortal(
                                        <div
                                            className="fixed z-[100000] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-y-auto overscroll-contain flex flex-col py-1"
                                            style={{ top: autocompletePos.top, left: autocompletePos.left, minWidth: autocompletePos.width, maxHeight: '14rem' }}
                                        >
                                            {filteredAutocompleteNames
                                                .map((name, index) => (
                                                    <button
                                                        key={name}
                                                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${index === focusedAutocompleteIndex
                                                            ? "bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white"
                                                            : "text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600"
                                                            }`}
                                                        onClick={() => {
                                                            setMpcQuery(name);
                                                            setIsAutocompleteVisible(false);
                                                        }}
                                                    >
                                                        {name}
                                                    </button>
                                                ))
                                            }
                                        </div>,
                                        document.body
                                    )}
                                </div>
                            }
                        />
                    )}

                    {/* Grid Content */}
                    <div className={`flex-1 min-h-0 w-full pb-8 ${!filtersCollapsed ? "" : "pt-6"}`}>
                        {filters.groupBy && groupedResults ? (
                            <div className="flex flex-col gap-4">
                                {groupedResults.sortedKeys.map(groupName => {
                                    const groupItems = groupedResults.groups.get(groupName) || [];
                                    return (
                                        <div
                                            key={groupName}
                                            className="flex flex-col rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600"
                                        >
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => toggleGroupCollapse(groupName)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ")
                                                        toggleGroupCollapse(groupName);
                                                }}
                                                className="w-full flex items-center justify-between px-4 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-900 transition-colors cursor-pointer"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {(filters.sortBy === 'origin' || filters.sortBy === 'source' || filters.sortBy === 'dpi') && (() => {
                                                        let isFav = false;
                                                        let title = "Set as favorite";
                                                        let canFavorite = true;

                                                        if (filters.sortBy === 'origin') {
                                                            const originValue = groupName === 'Proxxied' ? 'builtin' : groupName === 'My Uploads' ? 'uploaded' : groupName === 'MPC Autofill' ? 'mpc' : null;
                                                            if (!originValue) canFavorite = false;
                                                            else isFav = preferences?.favoriteCardbackOrigins?.includes(originValue as CardbackSource) || false;
                                                        } else if (filters.sortBy === 'source') {
                                                            isFav = preferences?.favoriteCardbackSources?.includes(groupName) || false;
                                                        } else if (filters.sortBy === 'dpi') {
                                                            const dpiValue = parseInt(groupName);
                                                            if (isNaN(dpiValue) || ![600, 800, 1000, 1200, 1400].includes(dpiValue)) canFavorite = false;
                                                            else isFav = preferences?.favoriteMpcDpi === dpiValue;
                                                        }

                                                        if (isFav) title = "Remove from favorites";
                                                        if (!canFavorite) return null;

                                                        return (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (filters.sortBy === 'origin') {
                                                                        const originValue = groupName === 'Proxxied' ? 'builtin' : groupName === 'My Uploads' ? 'uploaded' : groupName === 'MPC Autofill' ? 'mpc' : null;
                                                                        if (originValue) toggleFavoriteCardbackOrigin(originValue);
                                                                    } else if (filters.sortBy === 'source') {
                                                                        toggleFavoriteCardbackSource(groupName);
                                                                    } else if (filters.sortBy === 'dpi') {
                                                                        const dpiValue = parseInt(groupName);
                                                                        if (!isNaN(dpiValue)) {
                                                                            setFavoriteMpcDpi(isFav ? null : dpiValue);
                                                                        }
                                                                    }
                                                                }}
                                                                className="p-1 hover:text-yellow-500 transition-colors"
                                                                title={title}
                                                            >
                                                                <Star
                                                                    className={`w-4 h-4 ${isFav ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                                                                />
                                                            </button>
                                                        );
                                                    })()}
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        {groupName}
                                                    </span>
                                                </div>
                                                <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                                    <span>
                                                        {groupItems.length} item{groupItems.length !== 1 ? "s" : ""}
                                                    </span>
                                                    {isGroupCollapsed(groupName) ? (
                                                        <ChevronRight className="w-4 h-4" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4" />
                                                    )}
                                                </span>
                                            </div>
                                            {!isGroupCollapsed(groupName) && (
                                                <div className="p-4">
                                                    <CardGrid cardSize={cardSize}>
                                                        {groupItems.map(item => {
                                                            const isSelected = (optimisticSelectedId || linkedBackCard?.imageId) === item.id;
                                                            const isDefault = defaultCardbackId === item.id;
                                                            return (
                                                                <CardbackTile
                                                                    key={item.id}
                                                                    id={item.id}
                                                                    name={item.name}
                                                                    imageUrl={item.imageUrl}
                                                                    source={item.source}
                                                                    origin={item.origin}
                                                                    isSelected={isSelected}
                                                                    isDefault={isDefault}
                                                                    isDeleting={false}
                                                                    isEditing={editingCardbackId === item.id}
                                                                    editingName={editingCardbackName}
                                                                    hasBuiltInBleed={item.hasBuiltInBleed}
                                                                    displayBleedWidth={item.displayBleedWidth}
                                                                    cardSize={cardSize}
                                                                    dpi={item.origin === 'builtin' ? maxDpi : item.dpi}
                                                                    tags={item.tags}
                                                                    onSelect={() => handleSelectCardback(item)}
                                                                    onSetAsDefault={() => onSetAsDefaultCardback(item.id, item.name)}
                                                                    onDelete={() => handleDelete(item.id)}
                                                                    onStartEdit={() => handleStartEdit(item.id, item.name)}
                                                                    onEditNameChange={setEditingCardbackName}
                                                                    onSaveEdit={() => handleSaveEdit(item.id)}
                                                                    onCancelEdit={() => setEditingCardbackId(null)}
                                                                    activeSourceFilters={filters.sourceFilters}
                                                                    activeMinDpi={filters.minDpi}
                                                                    onToggleSource={(source) => setFilters(prev => {
                                                                        const next = new Set(prev.sourceFilters);
                                                                        if (next.has(source)) next.delete(source);
                                                                        else next.add(source);
                                                                        return { ...prev, sourceFilters: next };
                                                                    })}
                                                                    onToggleDpi={(dpi) => setFilters(prev => ({
                                                                        ...prev, minDpi: prev.minDpi === dpi ? 0 : dpi
                                                                    }))}
                                                                />
                                                            );
                                                        })}
                                                    </CardGrid>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <CardGrid cardSize={cardSize}>
                                {mergedResults.map((item) => {
                                    const isSelected = (optimisticSelectedId || linkedBackCard?.imageId) === item.id;
                                    const isDefault = defaultCardbackId === item.id;
                                    return (
                                        <CardbackTile
                                            key={item.id}
                                            id={item.id}
                                            name={item.name}
                                            imageUrl={item.imageUrl}
                                            source={item.source}
                                            origin={item.origin}
                                            isSelected={isSelected}
                                            isDefault={isDefault}
                                            isDeleting={false}
                                            isEditing={editingCardbackId === item.id}
                                            editingName={editingCardbackName}
                                            hasBuiltInBleed={item.hasBuiltInBleed}
                                            displayBleedWidth={item.displayBleedWidth}
                                            cardSize={cardSize}
                                            dpi={item.dpi}
                                            tags={item.tags}
                                            onSelect={() => handleSelectCardback(item)}
                                            onSetAsDefault={() => onSetAsDefaultCardback(item.id, item.name)}
                                            onDelete={() => handleDelete(item.id)}
                                            onStartEdit={() => handleStartEdit(item.id, item.name)}
                                            onEditNameChange={setEditingCardbackName}
                                            onSaveEdit={() => handleSaveEdit(item.id)}
                                            onCancelEdit={() => setEditingCardbackId(null)}
                                            activeSourceFilters={filters.sourceFilters}
                                            activeMinDpi={filters.minDpi}
                                            onToggleSource={(source) => setFilters(prev => {
                                                const next = new Set(prev.sourceFilters);
                                                if (next.has(source)) next.delete(source);
                                                else next.add(source);
                                                return { ...prev, sourceFilters: next };
                                            })}
                                            onToggleDpi={(dpi) => setFilters(prev => ({
                                                ...prev, minDpi: prev.minDpi === dpi ? 0 : dpi
                                            }))}
                                        />
                                    );
                                })}
                            </CardGrid>
                        )}



                        {/* Empty State */}
                        {mpcSearch.hasSearched && mergedResults.length === 0 && !mpcSearch.isLoading && (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                                <Search className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg">No cardbacks found</p>
                                <p className="text-sm">Try adjusting your filters or search query</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
