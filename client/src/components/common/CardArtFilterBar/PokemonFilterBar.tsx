import React, { useState, useMemo, useEffect, useRef } from "react";
import { Star } from "lucide-react";
import { SelectDropdown } from "..";
import { SharedFilterLayout } from "./SharedFilterLayout";
import { useUserPreferencesStore } from "@/store";
import { fetchPokemonSets, type PokemonSet } from "@/helpers/tcgdexApi";

export interface PokemonFilterProps {
    className?: string;
    mode: "pokemon";
    availableSets: Set<string>;
    selectedSets: Set<string>;
    onSelectSet: (setCodes: Set<string>) => void;
    sortBy: string;
    setSortBy: (sort: string) => void;
    sortDir: "asc" | "desc";
    setSortDir: (dir: "asc" | "desc") => void;
    groupBySet: boolean;
    onToggleGroupBySet: () => void;
    collapsedSets: Set<string>;
    setCollapsedSets: React.Dispatch<React.SetStateAction<Set<string>>>;
    allSetsCollapsed: boolean;
    setAllSetsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    totalCount?: number;
    filteredCount?: number;
    exactMatch: boolean;
    onToggleExactMatch: () => void;
}

interface DisplayPokemonSet {
    code: string;
    name: string;
    isAvailable: boolean;
}

export function PokemonFilterBar(props: PokemonFilterProps) {
    const { className } = props;

    const [showSetDropdown, setShowSetDropdown] = useState(false);
    const [setSearchQuery, setSetSearchQuery] = useState("");
    const [stableSets, setStableSets] = useState<DisplayPokemonSet[]>([]);
    const [allSets, setAllSets] = useState<PokemonSet[]>([]);

    const lastSortByRef = useRef<string | null>(null);
    const lastSortDirRef = useRef<string | null>(null);

    const preferences = useUserPreferencesStore((state) => state.preferences);
    const toggleFavoritePokemonSet = useUserPreferencesStore((s) => s.toggleFavoritePokemonSet);
    const setFavoritePokemonSort = useUserPreferencesStore((s) => s.setFavoritePokemonSort);
    const setFavoritePokemonGroupBySet = useUserPreferencesStore((s) => s.setFavoritePokemonGroupBySet);

    const favoritePokemonSets = useMemo(
        () => new Set(preferences?.favoritePokemonSets || []),
        [preferences?.favoritePokemonSets]
    );
    const favoritePokemonSort = preferences?.favoritePokemonSort || null;

    const { availableSets, selectedSets, sortBy, sortDir } = props;

    useEffect(() => {
        if (allSets.length === 0) {
            let mounted = true;
            fetchPokemonSets().then((sets) => {
                if (mounted) setAllSets(sets);
            });
            return () => { mounted = false; };
        }
    }, [allSets.length]);

    const setNameMap = useMemo(() => {
        const map = new Map<string, string>();
        allSets.forEach((s) => map.set(s.id, s.name));
        return map;
    }, [allSets]);

    const getSetName = (code: string) => setNameMap.get(code) || code.toUpperCase();

    const displayData = useMemo(() => {
        const allCodes = new Set<string>();
        availableSets.forEach((c) => allCodes.add(c));
        selectedSets.forEach((c) => allCodes.add(c));
        favoritePokemonSets.forEach((c) => allCodes.add(c));

        let codes = Array.from(allCodes);

        if (setSearchQuery) {
            const q = setSearchQuery.toLowerCase();
            codes = codes.filter((code) => {
                const name = setNameMap.get(code) || "";
                return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
            });
        }

        const displaySets: DisplayPokemonSet[] = codes
            .map((code) => ({
                code,
                name: getSetName(code),
                isAvailable: availableSets.has(code),
            }))
            .sort((a, b) => {
                const isFavA = favoritePokemonSets.has(a.code);
                const isFavB = favoritePokemonSets.has(b.code);
                if (isFavA && !isFavB) return -1;
                if (!isFavA && isFavB) return 1;

                if (sortBy === "name") {
                    return sortDir === "asc"
                        ? a.name.localeCompare(b.name)
                        : b.name.localeCompare(a.name);
                }
                return a.name.localeCompare(b.name);
            });

        return { displaySets };
    }, [availableSets, selectedSets, favoritePokemonSets, setSearchQuery, sortBy, sortDir, setNameMap]);

    useEffect(() => {
        if (!displayData) return;
        const sortChanged =
            props.sortBy !== lastSortByRef.current ||
            props.sortDir !== lastSortDirRef.current;

        if (!showSetDropdown || stableSets.length === 0 || sortChanged) {
            setStableSets(displayData.displaySets);
            lastSortByRef.current = props.sortBy;
            lastSortDirRef.current = props.sortDir;
        }
    }, [displayData, showSetDropdown, props.sortBy, props.sortDir, stableSets.length]);

    const isAllFavoritesSelected = () => {
        if (favoritePokemonSets.size === 0) return true;
        return Array.from(favoritePokemonSets).every(
            (code) => !props.availableSets.has(code) || props.selectedSets.has(code)
        );
    };
    const allFavoritesSelected = isAllFavoritesSelected();
    const hasAnyFavorites = favoritePokemonSets.size > 0;

    const handleToggleAllFavorites = () => {
        const { selectedSets, availableSets, onSelectSet } = props;
        if (allFavoritesSelected) {
            const next = new Set(selectedSets);
            favoritePokemonSets.forEach((code) => next.delete(code));
            onSelectSet(next);
        } else {
            const next = new Set(selectedSets);
            favoritePokemonSets.forEach((code) => {
                if (availableSets.has(code)) next.add(code);
            });
            onSelectSet(next);
        }
    };

    return (
        <SharedFilterLayout
            className={className}
            favorites={{
                isAllSelected: allFavoritesSelected,
                hasAny: hasAnyFavorites,
                onToggle: handleToggleAllFavorites,
            }}
            sort={{
                options: [
                    { value: "name", label: "Set Name" },
                ],
                value: props.sortBy,
                onChange: (val) => props.setSortBy(val),
                dir: props.sortDir,
                onDirChange: props.setSortDir,
                favoriteSortValue: favoritePokemonSort,
                onToggleFavoriteSort: (val) =>
                    setFavoritePokemonSort(val === favoritePokemonSort ? null : val as "name" | "released"),
            }}
            viewOptions={{
                groupBy: props.groupBySet,
                onToggleGroupBy: props.onToggleGroupBySet,
                favoriteGroupBy: !!preferences?.favoritePokemonGroupBySet,
                onToggleFavoriteGroupBy: () =>
                    setFavoritePokemonGroupBySet(!preferences?.favoritePokemonGroupBySet),
                isCollapsed: props.allSetsCollapsed,
                onToggleCollapse: () => {
                    if (props.allSetsCollapsed) {
                        props.setCollapsedSets(new Set());
                        props.setAllSetsCollapsed(false);
                    } else {
                        const allDisplayedSetCodes = stableSets.map((s) => s.code);
                        props.setCollapsedSets(new Set(allDisplayedSetCodes));
                        props.setAllSetsCollapsed(true);
                    }
                },
            }}
            extraControls={
                <button
                    onClick={props.onToggleExactMatch}
                    className={`h-10 px-3 flex items-center gap-1.5 rounded-md border text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
                        props.exactMatch
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                            : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                    }`}
                    title={props.exactMatch ? "Exact match on — only exact name matches shown" : "Exact match off — all substring matches shown"}
                >
                    {props.exactMatch ? "Exact" : "Fuzzy"}
                </button>
            }
            clear={{
                show: props.selectedSets.size > 0,
                onClear: () => props.onSelectSet(new Set()),
            }}
            count={{
                total: props.totalCount,
                filtered: props.filteredCount,
            }}
        >
            <SelectDropdown
                label="Set"
                buttonText="Any"
                selectedCount={props.selectedSets.size}
                isOpen={showSetDropdown}
                onToggle={() => setShowSetDropdown(!showSetDropdown)}
                onClose={() => {
                    setShowSetDropdown(false);
                    setSetSearchQuery("");
                }}
            >
                <div className="sticky top-0 z-10 p-2 bg-white dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
                    <input
                        type="text"
                        placeholder="Search sets..."
                        value={setSearchQuery}
                        onChange={(e) => setSetSearchQuery(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>

                <button
                    onClick={() => {
                        if (props.selectedSets.size > 0) {
                            props.onSelectSet(new Set());
                        } else {
                            props.onSelectSet(
                                props.availableSets.size > 0
                                    ? props.availableSets
                                    : new Set(stableSets.map((s) => s.code))
                            );
                        }
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
                >
                    {props.selectedSets.size > 0 ? "Clear All" : "Select All"}
                </button>

                {favoritePokemonSets.size > 0 && (
                    <button
                        onClick={() => {
                            const anyFavSelected = Array.from(favoritePokemonSets).some(
                                (code) => props.selectedSets.has(code)
                            );
                            if (anyFavSelected) {
                                const next = new Set(props.selectedSets);
                                favoritePokemonSets.forEach((code) => next.delete(code));
                                props.onSelectSet(next);
                            } else {
                                const next = new Set(props.selectedSets);
                                favoritePokemonSets.forEach((code) => {
                                    if (props.availableSets.has(code)) next.add(code);
                                });
                                props.onSelectSet(next);
                            }
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-gray-600"
                    >
                        {Array.from(favoritePokemonSets).some((code) =>
                            props.selectedSets.has(code)
                        )
                            ? "Clear Favorites"
                            : "Select Favorites"}
                    </button>
                )}

                <div className="max-h-60 overflow-y-auto">
                    {stableSets
                        .filter((set) => {
                            if (!setSearchQuery) return true;
                            const q = setSearchQuery.toLowerCase();
                            return set.code.toLowerCase().includes(q) || set.name.toLowerCase().includes(q);
                        })
                        .map((set) => (
                            <div
                                key={set.code}
                                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavoritePokemonSet(set.code);
                                    }}
                                    className="p-0.5 hover:text-yellow-500 transition-colors"
                                    title={
                                        favoritePokemonSets.has(set.code)
                                            ? "Remove from favorites"
                                            : "Add to favorites"
                                    }
                                >
                                    <Star
                                        className={`w-3.5 h-3.5 ${
                                            favoritePokemonSets.has(set.code)
                                                ? "fill-yellow-400 text-yellow-400"
                                                : "text-gray-400"
                                        }`}
                                    />
                                </button>

                                <label
                                    className={`flex items-center gap-2 flex-1 min-w-0 ${
                                        set.isAvailable
                                            ? "cursor-pointer"
                                            : "opacity-50 cursor-not-allowed"
                                    }`}
                                    title={
                                        !set.isAvailable
                                            ? "No cards from this set in current results"
                                            : ""
                                    }
                                >
                                    <input
                                        type="checkbox"
                                        checked={props.selectedSets.has(set.code)}
                                        onChange={() => {
                                            const next = new Set(props.selectedSets);
                                            if (next.has(set.code)) next.delete(set.code);
                                            else next.add(set.code);
                                            props.onSelectSet(next);
                                        }}
                                        disabled={!set.isAvailable}
                                        className="rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                                    />
                                    <span
                                        className={`text-sm truncate ${
                                            set.isAvailable
                                                ? "text-gray-900 dark:text-white"
                                                : "text-gray-400 dark:text-gray-500"
                                        }`}
                                    >
                                        {set.name}{" "}
                                        <span className="text-gray-500 text-xs">
                                            ({set.code.toUpperCase()})
                                        </span>
                                    </span>
                                </label>
                            </div>
                        ))}
                </div>
            </SelectDropdown>
        </SharedFilterLayout>
    );
}
