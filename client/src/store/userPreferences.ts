import { create } from 'zustand';
import { db, type UserPreferences } from '../db';
import { useSettingsStore } from './settings';

interface UserPreferencesState {
    preferences: UserPreferences | null;
    isLoading: boolean;

    load: () => Promise<void>;
    saveCurrentAsDefaults: () => Promise<void>;
    resetToBuiltIn: () => Promise<void>;
    toggleFavoriteMpcSource: (source: string) => Promise<void>;
    toggleFavoriteMpcTag: (tag: string) => Promise<void>;
    setFavoriteMpcDpi: (dpi: number | null) => Promise<void>;
    setFavoriteMpcSort: (sort: 'name' | 'dpi' | 'source' | null) => Promise<void>;
    setFavoriteMpcGroupBySource: (enabled: boolean) => Promise<void>;

    // Generic TCG Actions (Phase 1: TCG Module Architecture)
    toggleFavoriteTcgSet: (tcg: string, set: string) => Promise<void>;
    setFavoriteTcgSort: (tcg: string, sort: 'name' | 'released' | null) => Promise<void>;
    setFavoriteTcgGroupBySet: (tcg: string, enabled: boolean) => Promise<void>;
    setFavoriteTcgSearchMode: (tcg: string, mode: 'cards' | 'prints' | null) => Promise<void>;

    // Legacy Scryfall Actions (deprecated getters, wire to generic actions)
    toggleFavoriteScryfallSet: (set: string) => Promise<void>;
    setFavoriteScryfallSort: (sort: 'name' | 'released' | null) => Promise<void>;
    setFavoriteScryfallGroupBySet: (enabled: boolean) => Promise<void>;
    setFavoriteScryfallSearchMode: (mode: 'cards' | 'prints' | null) => Promise<void>;

    // Legacy Pokémon Actions (deprecated getters, wire to generic actions)
    toggleFavoritePokemonSet: (set: string) => Promise<void>;
    setFavoritePokemonSort: (sort: 'name' | 'released' | null) => Promise<void>;
    setFavoritePokemonGroupBySet: (enabled: boolean) => Promise<void>;

    setUploadLibrarySort: (sort: 'name' | 'date' | 'type' | null) => Promise<void>;
    setUploadLibrarySortDirection: (dir: 'asc' | 'desc') => Promise<void>;
    setFavoriteUploadLibraryGroupByType: (enabled: boolean) => Promise<void>;

    setFavoriteCardbackOrigins: (origins: string[]) => Promise<void>;
    toggleFavoriteCardbackOrigin: (origin: string) => Promise<void>;
    setFavoriteCardbackSources: (sources: string[]) => Promise<void>;
    toggleFavoriteCardbackSource: (source: string) => Promise<void>;
    setFavoriteCardbackSort: (sort: 'name' | 'source' | 'origin' | 'dpi' | null) => Promise<void>;
    setFavoriteCardbackGroupBy: (enabled: boolean) => Promise<void>;

    // UI State Actions
    setSettingsPanelState: (state: { order: string[], collapsed: Record<string, boolean> }) => Promise<void>;
    setSettingsPanelWidth: (width: number) => Promise<void>;
    setIsSettingsPanelCollapsed: (collapsed: boolean) => Promise<void>;
    setIsUploadPanelCollapsed: (collapsed: boolean) => Promise<void>;
    setUploadPanelWidth: (width: number) => Promise<void>;
    setCardEditorSectionCollapsed: (collapsed: Record<string, boolean>) => Promise<void>;
    setCardEditorSectionOrder: (order: string[]) => Promise<void>;
    setFilterSectionCollapsed: (collapsed: Record<string, boolean>) => Promise<void>;
}
type PrefsGetter = () => UserPreferencesState;
type PrefsSetter = (state: Partial<UserPreferencesState>) => void;
type ArrayPreferenceKey = Exclude<{
    [K in keyof UserPreferences]: UserPreferences[K] extends string[] | undefined ? K : never;
}[keyof UserPreferences], undefined>;

// Helper to get active TCG preferences with defaults
export function getTcgPrefs(prefs: UserPreferences | null, tcgId: string) {
    return prefs?.tcgPreferences?.[tcgId] ?? {};
}

async function updatePreference<K extends keyof UserPreferences>(
    key: K, value: UserPreferences[K], get: PrefsGetter, set: PrefsSetter,
) {
    const prefs = get().preferences;
    if (!prefs) return;
    const newPrefs = { ...prefs, [key]: value };
    await db.userPreferences.put(newPrefs);
    set({ preferences: newPrefs });
}

async function toggleArrayPreference(
    key: ArrayPreferenceKey, item: string, get: PrefsGetter, set: PrefsSetter,
) {
    const prefs = get().preferences;
    if (!prefs) return;
    const current = (prefs[key] as string[] | undefined) || [];
    const updated = current.includes(item)
        ? current.filter(s => s !== item)
        : [...current, item];
    const newPrefs = { ...prefs, [key]: updated };
    await db.userPreferences.put(newPrefs);
    set({ preferences: newPrefs });
}

export const useUserPreferencesStore = create<UserPreferencesState>((set, get) => ({
    preferences: null,
    isLoading: false,

    load: async () => {
        set({ isLoading: true });
        try {
            let prefs = await db.userPreferences.get('default');

            if (!prefs) {
                // Initialize with built-in defaults if none exist
                const builtInDefaults = useSettingsStore.getState();
                // Filter out function properties
                const settingsData = JSON.parse(JSON.stringify(builtInDefaults));

                prefs = {
                    id: 'default',
                    settings: settingsData,
                    favoriteCardbacks: [],
                    favoriteMpcSources: [],
                    favoriteMpcTags: [],
                    favoriteMpcDpi: null,
                    favoriteMpcSort: null,
                    favoriteScryfallSets: [],
                    favoriteScryfallSort: null,
                    favoriteCardbackOrigins: [],
                    favoriteCardbackSources: [],
                    tcgPreferences: {
                        mtg: { favoriteSets: [], favoriteSort: null, favoriteGroupBySet: false, favoriteSearchMode: null },
                        pokemon: { favoriteSets: [], favoriteSort: null, favoriteGroupBySet: false }
                    }
                };
                await db.userPreferences.add(prefs);
            }

            // Ensure new fields exist on old records
            if (!prefs.tcgPreferences) {
                prefs.tcgPreferences = {};
                // Migrate legacy flat fields to scoped structure
                prefs.tcgPreferences['mtg'] = {
                    favoriteSets: prefs.favoriteScryfallSets ?? [],
                    favoriteSort: prefs.favoriteScryfallSort ?? null,
                    favoriteGroupBySet: prefs.favoriteScryfallGroupBySet ?? false,
                    favoriteSearchMode: prefs.favoriteScryfallSearchMode ?? null,
                };
                prefs.tcgPreferences['pokemon'] = {
                    favoriteSets: prefs.favoritePokemonSets ?? [],
                    favoriteSort: prefs.favoritePokemonSort ?? null,
                    favoriteGroupBySet: prefs.favoritePokemonGroupBySet ?? false,
                };
            }
            if (!prefs.favoriteMpcSources) prefs.favoriteMpcSources = [];
            if (!prefs.favoriteMpcTags) prefs.favoriteMpcTags = [];
            if (!prefs.favoriteCardbackOrigins) prefs.favoriteCardbackOrigins = [];
            if (!prefs.favoriteCardbackSources) prefs.favoriteCardbackSources = [];

            // Migration: customXXX -> uploadLibraryXXX
            /* eslint-disable @typescript-eslint/no-explicit-any */
            if ((prefs as any).customUploadSort) {
                (prefs as any).uploadLibrarySort = (prefs as any).customUploadSort;
                delete (prefs as any).customUploadSort;
            }
            if ((prefs as any).favoriteCustomGroupByType !== undefined) {
                (prefs as any).favoriteUploadLibraryGroupByType = (prefs as any).favoriteCustomGroupByType;
                delete (prefs as any).favoriteCustomGroupByType;
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */

            // Ensure UI fields exist
            const defaultOrder = ['projects', 'layout', 'bleed', 'card', 'guides', 'darken', 'filterSort', 'export', 'application'];

            if (!prefs.settingsPanelState) {
                prefs.settingsPanelState = {
                    order: defaultOrder,
                    collapsed: {}
                };
            } else {
                if (!prefs.settingsPanelState.collapsed) {
                    prefs.settingsPanelState.collapsed = {};
                }
                // Repair/Migrate old or bad IDs (e.g. "Application" -> "application")
                // If any ID in the order is not in our known list, or if the list is just the old human-readable ones, reset proper IDs
                const validIds = new Set(defaultOrder);
                const hasInvalidIds = prefs.settingsPanelState.order.some(id => !validIds.has(id));

                if (hasInvalidIds) {
                    // Try to map old names if possible, otherwise just append/reset
                    const newOrder: string[] = [];
                    const seen = new Set<string>();

                    // Helper to add if valid
                    const safeAdd = (id: string) => {
                        if (validIds.has(id) && !seen.has(id)) {
                            newOrder.push(id);
                            seen.add(id);
                        }
                    };

                    for (const oldId of prefs.settingsPanelState.order) {
                        if (validIds.has(oldId)) {
                            safeAdd(oldId);
                        } else {
                            // Map known legacy names
                            if (oldId === 'Application') safeAdd('application');
                            if (oldId === 'Layout') safeAdd('layout');
                            if (oldId === 'Bleed & Guides') { safeAdd('bleed'); safeAdd('guides'); }
                            if (oldId === 'Card Backs' || oldId === 'Card') safeAdd('card');
                            if (oldId === 'Export') safeAdd('export');
                        }
                    }

                    // Add any missing default sections (like 'projects' or 'filterSort' if not present)
                    for (const defId of defaultOrder) {
                        safeAdd(defId);
                    }

                    // FORCE 'projects' to be first
                    const projectsIndex = newOrder.indexOf('projects');
                    if (projectsIndex > -1) {
                        newOrder.splice(projectsIndex, 1);
                        newOrder.unshift('projects');
                    }

                    // FORCE 'application' to be last
                    const appIndex = newOrder.indexOf('application');
                    if (appIndex > -1) {
                        newOrder.splice(appIndex, 1);
                        newOrder.push('application');
                    }

                    prefs.settingsPanelState.order = newOrder;
                }
            }

            if (prefs.settingsPanelWidth === undefined) prefs.settingsPanelWidth = 320;
            if (prefs.isSettingsPanelCollapsed === undefined) prefs.isSettingsPanelCollapsed = false;
            if (prefs.isUploadPanelCollapsed === undefined) prefs.isUploadPanelCollapsed = false;
            if (prefs.uploadPanelWidth === undefined) prefs.uploadPanelWidth = 320;
            // Section IDs must match SECTION_CONFIG keys in CardEditorModal
            const defaultEditorSectionOrder = ['basic', 'enhance', 'darkPixels', 'holographic', 'colorReplace', 'gamma', 'colorEffects', 'borderEffects'];
            if (!prefs.cardEditorSectionCollapsed) prefs.cardEditorSectionCollapsed = {};
            // Migrate legacy section order (old human-readable names -> new technical IDs)
            if (!prefs.cardEditorSectionOrder || prefs.cardEditorSectionOrder.some(id => !defaultEditorSectionOrder.includes(id))) {
                prefs.cardEditorSectionOrder = defaultEditorSectionOrder;
            }
            if (!prefs.filterSectionCollapsed) prefs.filterSectionCollapsed = { "Source": false, "Quality": false };

            set({ preferences: prefs });
        } catch (error) {
            console.error('Failed to load user preferences:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    saveCurrentAsDefaults: async () => {
        const currentSettings = useSettingsStore.getState();
        // Filter out function properties by serializing
        const { hasHydrated: _hasHydrated, ...settingsToSave } = currentSettings;
        const cleanSettings = JSON.parse(JSON.stringify(settingsToSave));

        const currentPrefs = get().preferences;

        const newPrefs: UserPreferences = {
            ...(currentPrefs || {}), // Preserve existing prefs (UI state, favorites, etc.)
            id: 'default', // Ensure ID is default
            settings: cleanSettings,
            favoriteCardbacks: currentPrefs?.favoriteCardbacks || [],
            favoriteMpcSources: currentPrefs?.favoriteMpcSources || [],
            favoriteMpcTags: currentPrefs?.favoriteMpcTags || [],
            favoriteMpcDpi: currentPrefs?.favoriteMpcDpi ?? null,
            favoriteMpcSort: currentPrefs?.favoriteMpcSort ?? null,
            favoriteScryfallSets: currentPrefs?.favoriteScryfallSets || [],
            favoriteScryfallSort: currentPrefs?.favoriteScryfallSort ?? null,
            uploadLibrarySort: currentPrefs?.uploadLibrarySort ?? null,
            uploadLibrarySortDirection: currentPrefs?.uploadLibrarySortDirection,
            favoriteUploadLibraryGroupByType: currentPrefs?.favoriteUploadLibraryGroupByType ?? false,
            favoriteCardbackOrigins: currentPrefs?.favoriteCardbackOrigins || [],
            favoriteCardbackSources: currentPrefs?.favoriteCardbackSources || [],
            favoriteCardbackSort: currentPrefs?.favoriteCardbackSort ?? null,
            favoriteCardbackGroupBy: currentPrefs?.favoriteCardbackGroupBy ?? false,
            tcgPreferences: currentPrefs?.tcgPreferences ?? {},
        };

        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    resetToBuiltIn: async () => {
        // Reset settings store to built-in defaults
        useSettingsStore.getState().resetSettings();

        // Save these as the new user defaults
        await get().saveCurrentAsDefaults();
    },

    toggleFavoriteMpcSource: async (source: string) => toggleArrayPreference('favoriteMpcSources', source, get, set),
    toggleFavoriteMpcTag: async (tag: string) => toggleArrayPreference('favoriteMpcTags', tag, get, set),
    setFavoriteMpcDpi: async (dpi: number | null) => updatePreference('favoriteMpcDpi', dpi, get, set),
    setFavoriteMpcSort: async (sort: 'name' | 'dpi' | 'source' | null) => updatePreference('favoriteMpcSort', sort, get, set),
    setSettingsPanelState: async (state: { order: string[], collapsed: Record<string, boolean> }) => updatePreference('settingsPanelState', state, get, set),
    setSettingsPanelWidth: async (width: number) => updatePreference('settingsPanelWidth', width, get, set),
    setIsSettingsPanelCollapsed: async (collapsed: boolean) => updatePreference('isSettingsPanelCollapsed', collapsed, get, set),
    setIsUploadPanelCollapsed: async (collapsed: boolean) => updatePreference('isUploadPanelCollapsed', collapsed, get, set),
    setUploadPanelWidth: async (width: number) => updatePreference('uploadPanelWidth', width, get, set),
    setCardEditorSectionCollapsed: async (collapsed: Record<string, boolean>) => updatePreference('cardEditorSectionCollapsed', collapsed, get, set),
    setCardEditorSectionOrder: async (order: string[]) => updatePreference('cardEditorSectionOrder', order, get, set),
    setFilterSectionCollapsed: async (collapsed: Record<string, boolean>) => updatePreference('filterSectionCollapsed', collapsed, get, set),

    // Generic TCG Actions
    toggleFavoriteTcgSet: async (tcg: string, setKey: string) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const currentTcgPrefs = getTcgPrefs(prefs, tcg);
        const currentSets = currentTcgPrefs.favoriteSets || [];
        const updated = currentSets.includes(setKey)
            ? currentSets.filter(s => s !== setKey)
            : [...currentSets, setKey];

        const newPrefs: UserPreferences = {
            ...prefs,
            tcgPreferences: {
                ...(prefs.tcgPreferences || {}),
                [tcg]: { ...currentTcgPrefs, favoriteSets: updated }
            }
        };

        if (tcg === 'mtg') newPrefs.favoriteScryfallSets = updated;
        if (tcg === 'pokemon') newPrefs.favoritePokemonSets = updated;
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },
    setFavoriteTcgSort: async (tcg: string, sort: 'name' | 'released' | null) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const currentTcgPrefs = getTcgPrefs(prefs, tcg);
        const newPrefs: UserPreferences = {
            ...prefs,
            tcgPreferences: {
                ...(prefs.tcgPreferences || {}),
                [tcg]: { ...currentTcgPrefs, favoriteSort: sort }
            }
        };

        if (tcg === 'mtg') newPrefs.favoriteScryfallSort = sort;
        if (tcg === 'pokemon') newPrefs.favoritePokemonSort = sort;
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },
    setFavoriteTcgGroupBySet: async (tcg: string, enabled: boolean) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const currentTcgPrefs = getTcgPrefs(prefs, tcg);
        const newPrefs: UserPreferences = {
            ...prefs,
            tcgPreferences: {
                ...(prefs.tcgPreferences || {}),
                [tcg]: { ...currentTcgPrefs, favoriteGroupBySet: enabled }
            }
        };

        if (tcg === 'mtg') newPrefs.favoriteScryfallGroupBySet = enabled;
        if (tcg === 'pokemon') newPrefs.favoritePokemonGroupBySet = enabled;
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },
    setFavoriteTcgSearchMode: async (tcg: string, mode: 'cards' | 'prints' | null) => {
        const prefs = get().preferences;
        if (!prefs) return;
        const currentTcgPrefs = getTcgPrefs(prefs, tcg);
        const newPrefs: UserPreferences = {
            ...prefs,
            tcgPreferences: {
                ...(prefs.tcgPreferences || {}),
                [tcg]: { ...currentTcgPrefs, favoriteSearchMode: mode }
            }
        };

        if (tcg === 'mtg') newPrefs.favoriteScryfallSearchMode = mode;
        await db.userPreferences.put(newPrefs);
        set({ preferences: newPrefs });
    },

    // Legacy TCG Actions (wrappers)
    toggleFavoriteScryfallSet: async (setKey: string) => get().toggleFavoriteTcgSet('mtg', setKey),
    setFavoriteScryfallSort: async (sort: 'name' | 'released' | null) => get().setFavoriteTcgSort('mtg', sort),
    setFavoriteScryfallGroupBySet: async (enabled: boolean) => get().setFavoriteTcgGroupBySet('mtg', enabled),
    setFavoriteScryfallSearchMode: async (mode: 'cards' | 'prints' | null) => get().setFavoriteTcgSearchMode('mtg', mode),
    toggleFavoritePokemonSet: async (setKey: string) => get().toggleFavoriteTcgSet('pokemon', setKey),
    setFavoritePokemonSort: async (sort: 'name' | 'released' | null) => get().setFavoriteTcgSort('pokemon', sort),
    setFavoritePokemonGroupBySet: async (enabled: boolean) => get().setFavoriteTcgGroupBySet('pokemon', enabled),

    setFavoriteMpcGroupBySource: async (enabled: boolean) => updatePreference('favoriteMpcGroupBySource', enabled, get, set),
    setUploadLibrarySort: async (sort: 'name' | 'date' | 'type' | null) => updatePreference('uploadLibrarySort', sort, get, set),
    setUploadLibrarySortDirection: async (dir: 'asc' | 'desc') => updatePreference('uploadLibrarySortDirection', dir, get, set),
    setFavoriteUploadLibraryGroupByType: async (enabled: boolean) => updatePreference('favoriteUploadLibraryGroupByType', enabled, get, set),
    setFavoriteCardbackOrigins: async (origins: string[]) => updatePreference('favoriteCardbackOrigins', origins, get, set),
    toggleFavoriteCardbackOrigin: async (origin: string) => toggleArrayPreference('favoriteCardbackOrigins', origin, get, set),
    setFavoriteCardbackSources: async (sources: string[]) => updatePreference('favoriteCardbackSources', sources, get, set),
    toggleFavoriteCardbackSource: async (source: string) => toggleArrayPreference('favoriteCardbackSources', source, get, set),
    setFavoriteCardbackSort: async (sort: 'name' | 'source' | 'origin' | 'dpi' | null) => updatePreference('favoriteCardbackSort', sort, get, set),
    setFavoriteCardbackGroupBy: async (enabled: boolean) => updatePreference('favoriteCardbackGroupBy', enabled, get, set),
}));
