/**
 * Per-TCG UI configuration.
 *
 * To add a new TCG:
 *  1. Add an entry here.
 *  2. Add a server router (e.g. server/src/routes/newTcgRouter.ts).
 *  3. Add a stream handler branch in streamRouter.ts.
 *  4. Add client hooks (e.g. client/src/hooks/useNewTcgSearch.ts).
 *  5. Wire the hooks in CardArtContent.tsx.
 */

export type TcgId = string;

export interface TcgConfig {
    id: TcgId;
    label: string;
    activeButtonClass: string;
    searchSourceLabel: string;
    searchSourceColor: string;
    hasMpcSource: boolean;
    decklistPlaceholder: string;
    filters: {
        manaValue: boolean;
        colors: boolean;
        categories: boolean;
        energyType: boolean;
        matchType: boolean;
    };
    sortOptions: Array<{ value: string; label: string }>;
}

export const TCG_CONFIGS: Record<string, TcgConfig> = {
    mtg: {
        id: 'mtg',
        label: 'MTG',
        activeButtonClass: 'bg-blue-600 text-white',
        searchSourceLabel: 'Scryfall',
        searchSourceColor: '#431e3f',
        hasMpcSource: true,
        decklistPlaceholder:
            `1x Sol Ring\n2x Counterspell\nFor specific art include set / CN\neg. Strionic Resonator (lcc)\nor Repurposing Bay (dft) 380`,
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
        searchSourceLabel: 'TCGdex',
        searchSourceColor: '#e6343a',
        hasMpcSource: false,
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
