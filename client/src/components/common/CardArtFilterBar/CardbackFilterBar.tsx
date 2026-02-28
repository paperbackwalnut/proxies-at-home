import { useState, useMemo, useEffect } from "react";
import { Star } from "lucide-react";
import { SharedFilterLayout } from "./SharedFilterLayout";
import { SelectDropdown, MultiSelectDropdown } from "..";
import { SourceFilterDropdown } from "./SourceFilterDropdown";
import { useUserPreferencesStore } from "@/store";
import type { CardbackSource } from "../../../../../shared/types";

export interface CardbackFilterState {
    originFilters: Set<CardbackSource>;
    sourceFilters: Set<string>; // MPC contributors
    minDpi: number;
    sortBy: "name" | "source" | "origin" | "dpi";
    sortDir: "asc" | "desc";
    groupBy: boolean;
}

export interface CardbackFilterProps {
    className?: string;
    mode: "cardback";
    filters: CardbackFilterState;
    totalCount: number;
    filteredCount: number;
    // Available MPC sources (contributors) from search results
    availableMpcSources: { name: string; hasResults: boolean }[];
    // Handlers
    setMinDpi: (dpi: number) => void;
    setSortBy: (sort: "name" | "source" | "origin" | "dpi") => void;
    setSortDir: (dir: "asc" | "desc") => void;
    setGroupBy: (enabled: boolean) => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    toggleOriginFilter: (origin: CardbackSource) => void;
    toggleSourceFilter: (source: string) => void;
    setOriginFilters: (origins: Set<CardbackSource>) => void;
    setSourceFilters: (sources: Set<string>) => void;
    clearFilters: () => void;
    searchBar?: React.ReactNode;
}

const ORIGIN_LABELS: Record<CardbackSource, string> = {
    builtin: "Proxxied",
    uploaded: "My Uploads",
    mpc: "MPC Autofill",
};

const ORIGIN_ORDER: CardbackSource[] = ["builtin", "uploaded", "mpc"];

export function CardbackFilterBar(props: CardbackFilterProps) {
    const { className, filters, totalCount, filteredCount, availableMpcSources, searchBar } = props;

    // --- State & Handlers ---
    const [showOriginDropdown, setShowOriginDropdown] = useState(false);
    const [showSourceDropdown, setShowSourceDropdown] = useState(false);
    const [showMinDpiDropdown, setShowMinDpiDropdown] = useState(false);

    // Stable sources to prevent jumping while dropdown is open
    const [stableAvailableSources, setStableAvailableSources] = useState<typeof availableMpcSources>([]);

    // User Preferences for favorites
    const preferences = useUserPreferencesStore((s) => s.preferences);
    const favoriteOrigins = useMemo(() => (preferences?.favoriteCardbackOrigins || []) as CardbackSource[], [preferences?.favoriteCardbackOrigins]);
    const favoriteSources = useMemo(() => preferences?.favoriteCardbackSources || [], [preferences?.favoriteCardbackSources]);
    const favoriteSort = preferences?.favoriteCardbackSort || null;
    const favoriteGroupBy = preferences?.favoriteCardbackGroupBy ?? null;
    const favoriteMpcDpi = preferences?.favoriteMpcDpi ?? null;

    const {
        toggleFavoriteCardbackOrigin,
        toggleFavoriteCardbackSource,
        setFavoriteCardbackSort,
        setFavoriteCardbackGroupBy,
        setFavoriteMpcDpi,
    } = useUserPreferencesStore();

    useEffect(() => {
        if (!showSourceDropdown || stableAvailableSources.length === 0) {
            const sortedSources = Array.from(new Set([...availableMpcSources.map(s => s.name), ...favoriteSources]))
                .map(name => {
                    const hasResults = availableMpcSources.find(s => s.name === name)?.hasResults || false;
                    return { name, hasResults };
                })
                .sort((a, b) => {
                    const aFav = favoriteSources.includes(a.name);
                    const bFav = favoriteSources.includes(b.name);
                    if (aFav && !bFav) return -1;
                    if (!aFav && bFav) return 1;
                    return a.name.localeCompare(b.name);
                });
            setStableAvailableSources(sortedSources);
        }
    }, [availableMpcSources, showSourceDropdown, favoriteSources, stableAvailableSources.length]);

    // Favorites selection logic
    const hasAnyFavorites =
        favoriteOrigins.length > 0 ||
        favoriteSources.length > 0 ||
        favoriteSort !== null ||
        favoriteMpcDpi !== null;

    const isAllFavoritesSelected = useMemo(() => {
        if (!hasAnyFavorites) return false;

        const allFavOrigins = favoriteOrigins.length === 0 || favoriteOrigins.every(o => filters.originFilters.has(o));
        const allFavSources = favoriteSources.length === 0 || favoriteSources.every(s => filters.sourceFilters.has(s));
        const favSort = favoriteSort === null || filters.sortBy === favoriteSort;
        const favDpi = favoriteMpcDpi === null || filters.minDpi === favoriteMpcDpi;

        return allFavOrigins && allFavSources && favSort && favDpi;
    }, [hasAnyFavorites, favoriteOrigins, favoriteSources, favoriteSort, filters, favoriteMpcDpi]);

    const handleToggleAllFavorites = () => {
        if (isAllFavoritesSelected) {
            // Deselect favorites
            const nextOrigins = new Set(filters.originFilters);
            favoriteOrigins.forEach(o => nextOrigins.delete(o));
            props.setOriginFilters(nextOrigins);

            const nextSources = new Set(filters.sourceFilters);
            favoriteSources.forEach(s => nextSources.delete(s));
            props.setSourceFilters(nextSources);

            if (favoriteMpcDpi !== null && filters.minDpi === favoriteMpcDpi) props.setMinDpi(0);
        } else {
            // Select favorites
            const nextOrigins = new Set(filters.originFilters);
            favoriteOrigins.forEach(o => nextOrigins.add(o));
            props.setOriginFilters(nextOrigins);

            const nextSources = new Set(filters.sourceFilters);
            favoriteSources.forEach(s => nextSources.add(s));
            props.setSourceFilters(nextSources);

            if (favoriteSort) props.setSortBy(favoriteSort as "name" | "source" | "origin" | "dpi");
            if (favoriteMpcDpi !== null) props.setMinDpi(favoriteMpcDpi);
        }
    };

    const hasActiveFilters = filters.originFilters.size > 0 || filters.sourceFilters.size > 0 || filters.minDpi > 0;

    return (
        <SharedFilterLayout
            className={className}
            favorites={{
                isAllSelected: isAllFavoritesSelected,
                hasAny: !!hasAnyFavorites,
                onToggle: handleToggleAllFavorites,
            }}
            sort={{
                options: [
                    { value: "name", label: "Name" },
                    { value: "source", label: "Source (MPC)" },
                    { value: "origin", label: "Origin" },
                    { value: "dpi", label: "DPI" },
                ],
                value: filters.sortBy,
                onChange: (val) => props.setSortBy(val as "name" | "source" | "origin" | "dpi"),
                dir: filters.sortDir,
                onDirChange: props.setSortDir,
                favoriteSortValue: favoriteSort,
                onToggleFavoriteSort: (val) => setFavoriteCardbackSort(val === favoriteSort ? null : (val as "name" | "source" | "origin" | "dpi")),
            }}
            viewOptions={{
                groupBy: filters.groupBy,
                onToggleGroupBy: () => {
                    props.setGroupBy(!filters.groupBy);
                },
                favoriteGroupBy: !!favoriteGroupBy,
                onToggleFavoriteGroupBy: () => setFavoriteCardbackGroupBy(!favoriteGroupBy),
                isCollapsed: props.isCollapsed,
                onToggleCollapse: props.onToggleCollapse,
            }}
            clear={{
                show: hasActiveFilters,
                onClear: props.clearFilters,
            }}
            searchBar={searchBar}
            count={{
                total: totalCount,
                filtered: hasActiveFilters ? filteredCount : undefined,
            }}
        >
            {/* Origin Dropdown */}
            <MultiSelectDropdown
                label="Origin"
                buttonText="Any"
                selectedCount={filters.originFilters.size}
                isOpen={showOriginDropdown}
                onToggle={() => setShowOriginDropdown(!showOriginDropdown)}
                onClose={() => setShowOriginDropdown(false)}
            >
                <button
                    onClick={() => {
                        if (filters.originFilters.size === ORIGIN_ORDER.length) {
                            props.setOriginFilters(new Set());
                        } else {
                            props.setOriginFilters(new Set(ORIGIN_ORDER));
                        }
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-b border-gray-100 dark:border-gray-600"
                >
                    {filters.originFilters.size === ORIGIN_ORDER.length ? "Clear All" : "Select All"}
                </button>
                {favoriteOrigins.length > 0 && (
                    <button
                        onClick={() => {
                            const anyFavsSelected = favoriteOrigins.some(o => filters.originFilters.has(o));
                            const next = new Set(filters.originFilters);
                            if (anyFavsSelected) {
                                favoriteOrigins.forEach(o => next.delete(o));
                            } else {
                                favoriteOrigins.forEach(o => next.add(o));
                            }
                            props.setOriginFilters(next);
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-b border-gray-100 dark:border-gray-600"
                    >
                        {favoriteOrigins.some(o => filters.originFilters.has(o)) ? "Clear Favorites" : "Select Favorites"}
                    </button>
                )}
                <div className="py-1">
                    {ORIGIN_ORDER.map((origin) => (
                        <div
                            key={origin}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleFavoriteCardbackOrigin(origin);
                                }}
                                className="p-0.5 hover:text-yellow-500 transition-colors"
                                title={favoriteOrigins.includes(origin) ? "Remove from favorites" : "Add to favorites"}
                            >
                                <Star className={`w-4 h-4 ${favoriteOrigins.includes(origin) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                            </button>
                            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={filters.originFilters.has(origin)}
                                    onChange={() => props.toggleOriginFilter(origin)}
                                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-white dark:bg-gray-800"
                                />
                                <span className="text-sm truncate text-gray-900 dark:text-white">
                                    {ORIGIN_LABELS[origin]}
                                </span>
                            </label>
                        </div>
                    ))}
                </div>
            </MultiSelectDropdown>

            {/* DPI Dropdown */}
            <SelectDropdown
                label="DPI"
                buttonText={
                    filters.minDpi === 0 ? "Any" : `${filters.minDpi} +`
                }
                selectedLabel={
                    filters.minDpi === 0 ? "Any" : `${filters.minDpi} +`
                }
                singleSelectMode
                disableFavorites
                isOpen={showMinDpiDropdown}
                onToggle={() => setShowMinDpiDropdown(!showMinDpiDropdown)}
                onClose={() => setShowMinDpiDropdown(false)}
            >
                {[0, 600, 800, 1000, 1200, 1400].map((dpi) => (
                    <div
                        key={dpi}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setFavoriteMpcDpi(favoriteMpcDpi === dpi ? null : dpi);
                            }}
                            className="p-0.5 hover:text-yellow-500 transition-colors"
                            title={
                                favoriteMpcDpi === dpi
                                    ? "Remove from favorites"
                                    : "Set as favorite"
                            }
                        >
                            <Star
                                className={`w-4 h-4 ${favoriteMpcDpi === dpi ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                            />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                props.setMinDpi(dpi);
                                setShowMinDpiDropdown(false);
                            }}
                            className={`flex-1 text-left text-sm transition-colors whitespace-nowrap ${filters.minDpi === dpi ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}
                        >
                            {dpi === 0 ? "Any" : `${dpi} +`}
                        </button>
                    </div>
                ))}
            </SelectDropdown>

            {/* Source Dropdown (MPC Contributors) */}
            <SourceFilterDropdown
                items={stableAvailableSources.length > 0 ? stableAvailableSources : availableMpcSources}
                selectedFilters={filters.sourceFilters}
                favoriteItems={favoriteSources}
                onToggleFilter={(name) => props.toggleSourceFilter(name)}
                onSetFilters={props.setSourceFilters}
                onToggleFavorite={toggleFavoriteCardbackSource}
                isOpen={showSourceDropdown}
                onToggle={() => setShowSourceDropdown(!showSourceDropdown)}
                onClose={() => setShowSourceDropdown(false)}
            />
        </SharedFilterLayout>
    );
}
