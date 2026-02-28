import React, { useState } from "react";
import { Star } from "lucide-react";
import { MultiSelectDropdown } from "..";

export interface SourceItem {
    name: string;
    hasResults: boolean;
}

export interface SourceFilterDropdownProps {
    label?: string;
    items: SourceItem[];
    selectedFilters: Set<string>;
    favoriteItems: string[];
    searchPlaceholder?: string;
    onToggleFilter: (name: string) => void;
    onSetFilters: React.Dispatch<React.SetStateAction<Set<string>>> | ((next: Set<string>) => void);
    onToggleFavorite: (name: string) => void;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
}

export function SourceFilterDropdown({
    label = "Source",
    items,
    selectedFilters,
    favoriteItems,
    searchPlaceholder = "Search sources...",
    onToggleFilter,
    onSetFilters,
    onToggleFavorite,
    isOpen,
    onToggle,
    onClose,
}: SourceFilterDropdownProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const handleClose = () => {
        onClose();
        setSearchQuery("");
    };

    const handleSelectAll = () => {
        if (selectedFilters.size > 0) {
            onSetFilters(new Set());
        } else {
            onSetFilters(new Set(items.filter(s => s.hasResults).map(s => s.name)));
        }
    };

    const handleToggleFavorites = () => {
        const anyFavsSelected = favoriteItems.some(s => selectedFilters.has(s));
        const next = new Set(selectedFilters);
        if (anyFavsSelected) {
            favoriteItems.forEach(s => next.delete(s));
        } else {
            favoriteItems.forEach(s => next.add(s));
        }
        onSetFilters(next);
    };

    const filtered = items.filter(
        s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <MultiSelectDropdown
            label={label}
            buttonText="Any"
            selectedCount={selectedFilters.size}
            isOpen={isOpen}
            onToggle={onToggle}
            onClose={handleClose}
        >
            <div className="sticky top-0 z-10 p-2 bg-white dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
                <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
            <button
                onClick={handleSelectAll}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-b border-gray-100 dark:border-gray-600"
            >
                {selectedFilters.size > 0 ? "Clear All" : "Select All"}
            </button>
            {favoriteItems.length > 0 && (
                <button
                    onClick={handleToggleFavorites}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400 border-b border-gray-100 dark:border-gray-600"
                >
                    {favoriteItems.some(s => selectedFilters.has(s)) ? "Clear Favorites" : "Select Favorites"}
                </button>
            )}
            <div className="py-1">
                {filtered.map((s) => (
                    <div
                        key={s.name}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onToggleFavorite(s.name);
                            }}
                            className="p-0.5 hover:text-yellow-500 transition-colors"
                            title={favoriteItems.includes(s.name) ? "Remove from favorites" : "Add to favorites"}
                        >
                            <Star
                                className={`w-3.5 h-3.5 ${favoriteItems.includes(s.name) ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                            />
                        </button>
                        <label className={`flex items-center gap-2 flex-1 min-w-0 ${s.hasResults ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
                            <input
                                type="checkbox"
                                checked={selectedFilters.has(s.name) && s.hasResults}
                                onChange={() => s.hasResults && onToggleFilter(s.name)}
                                disabled={!s.hasResults}
                                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-white dark:bg-gray-800"
                            />
                            <span className={`text-sm truncate ${s.hasResults ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}>
                                {s.name}
                                {!s.hasResults && " (no results)"}
                            </span>
                        </label>
                    </div>
                ))}
            </div>
        </MultiSelectDropdown>
    );
}
