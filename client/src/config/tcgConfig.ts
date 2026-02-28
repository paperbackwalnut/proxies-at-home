/**
 * Per-TCG UI configuration — Phase 1 of TCG Module Architecture.
 *
 * Each TCG is a self-contained config bundle. Consumer code reads data from the
 * config without knowing which TCG is active. See tcg_module_architecture.md.
 *
 * To add a new TCG:
 *  1. Add an entry here.
 *  2. Add a server router (e.g. server/src/routes/newTcgRouter.ts).
 *  3. Add a stream handler branch in streamRouter.ts.
 *  4. Add client hooks (e.g. client/src/hooks/useNewTcgSearch.ts).
 *  5. Wire the hooks in CardArtContent.tsx.
 */

export type TcgId = string;

export interface ArtSource {
    id: string;
    label: string;
    color: string;
}

export interface TcgConfig {
    id: TcgId;
    label: string;
    activeButtonClass: string;
    decklistPlaceholder: string;
    artSources: ArtSource[];
    emptyState: { message: string; link?: { url: string; label: string } };
    noResultsLabel: string;
    syntaxHint?: string;
    filters: {
        manaValue: boolean;
        colors: boolean;
        categories: boolean;
        energyType: boolean;
        matchType: boolean;
    };
    sortOptions: Array<{ value: string; label: string }>;
}

export function getSearchSourceLabel(cfg: TcgConfig): string {
    return cfg.artSources[0]?.label ?? cfg.label;
}

export function getSearchSourceColor(cfg: TcgConfig): string {
    return cfg.artSources[0]?.color ?? '#333';
}

export function hasMpcSource(cfg: TcgConfig): boolean {
    return cfg.artSources.some(s => s.id === 'mpc');
}

export const TCG_CONFIGS: Record<string, TcgConfig> = {
    mtg: {
        id: 'mtg',
        label: 'MTG',
        activeButtonClass: 'bg-blue-600 text-white',
        artSources: [
            { id: 'scryfall', label: 'Scryfall', color: '#431e3f' },
            { id: 'mpc', label: 'MPC Autofill', color: '#4c9be8' },
        ],
        emptyState: {
            message: 'Search for a card to preview artwork.',
            link: { url: 'https://scryfall.com/docs/syntax', label: 'syntax guide' },
        },
        noResultsLabel: 'No Scryfall results found.',
        decklistPlaceholder:
            `1x Sol Ring\n2x Swamp\nFor a specific art use set code and collector number:\nSol Ring (C19) 221`,
        syntaxHint: 'Supports Scryfall syntax',
        filters: {
            manaValue: true,
            colors: true,
            categories: true,
            energyType: false,
            matchType: true,
        },
        sortOptions: [
            { value: 'manual', label: 'Manual' },
            { value: 'name', label: 'Name' },
            { value: 'type', label: 'Type' },
            { value: 'cmc', label: 'Mana Value' },
            { value: 'color', label: 'Color' },
            { value: 'rarity', label: 'Rarity' },
        ],
    },
    pokemon: {
        id: 'pokemon',
        label: 'Pokémon',
        activeButtonClass: 'bg-yellow-500 text-white',
        artSources: [
            { id: 'tcgdex', label: 'TCGdex', color: '#e6343a' },
        ],
        emptyState: {
            message: 'Search for a Pokémon card to preview.\nResults from TCGdex',
            link: { url: 'https://tcgdex.dev', label: 'TCGdex' },
        },
        noResultsLabel: 'No TCGdex results found.',
        decklistPlaceholder:
            `1x Gengar\n2x Pikachu\nFor a specific art use number:\nMewtwo 059/159`,
        filters: {
            manaValue: false,
            colors: false,
            categories: false,
            energyType: true,
            matchType: false,
        },
        sortOptions: [
            { value: 'manual', label: 'Manual' },
            { value: 'name', label: 'Name' },
            { value: 'type', label: 'Type' },
        ],
    },
};

export const TCG_ORDER: TcgId[] = ['mtg', 'pokemon'];

export function getTcgConfig(tcgId: TcgId): TcgConfig {
    return TCG_CONFIGS[tcgId] ?? TCG_CONFIGS['mtg'];
}
