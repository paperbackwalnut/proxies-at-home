import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CardbackLibrary } from "./CardbackLibrary";
import type { CardbackOption } from "@/helpers/cardbackLibrary";
import type { CardOption } from "../../../../shared/types";

// --- Mocks ---

const mockDbUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/helpers/imageProcessor", () => ({
    ImageProcessor: {
        getInstance: () => ({
            processImageObject: vi.fn().mockImplementation((_opts: unknown) => Promise.resolve('processed_blob_url')),
            queueImageProcessingTasks: vi.fn(),
            cancelAll: vi.fn(),
        })
    }
}));

vi.mock("@/hooks/useMpcSearch", () => ({
    useMpcSearch: vi.fn((_query: string, _options: unknown) => ({
        cards: [],
        totalCards: 0,
        isLoading: false,
        error: null,
        hasSearched: false,
    })),
}));
vi.mock('@/db', () => ({
    db: {
        cardbacks: {
            add: vi.fn(),
            put: vi.fn(),
            update: (...args: unknown[]) => mockDbUpdate(...args),
        },
    },
}));

vi.mock("@/store", () => ({
    useUserPreferencesStore: vi.fn((selector: unknown) => {
        const state = {
            preferences: {},
            toggleFavoriteCardbackOrigin: vi.fn(),
            toggleFavoriteCardbackSource: vi.fn(),
            setFavoriteMpcDpi: vi.fn(),
        };
        if (typeof selector === "function") return selector(state);
        return state;
    })
}));

let mockLiveQueryReturn: CardbackOption[] | undefined = [];
vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: (fn: () => unknown) => {
        // Evaluate the function to mimic LiveQuery, but don't strictly require it to resolve
        // in a fake timer environment to avoid hangs.
        try { fn(); } catch { /* ignore sync errors in mock fn */ }
        return mockLiveQueryReturn;
    },
}));

const mockGetAllCardbacks = vi.fn().mockResolvedValue([]);
const mockIngestMpcCardback = vi.fn().mockResolvedValue('cardback_mpc_test123');
vi.mock("@/helpers/cardbackLibrary", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/helpers/cardbackLibrary")>();
    return {
        ...actual, // Keep original exports not explicitly mocked
        getAllCardbacks: () => mockGetAllCardbacks(),
        invalidateCardbackUrl: vi.fn(),
        ingestMpcCardback: (...args: unknown[]) => mockIngestMpcCardback(...args),
        BUILTIN_CARDBACKS: [
            { id: 'cb-builtin-1', name: 'Default Back', hasBuiltInBleed: true },
        ],
    };
});

const mockSearchMpcIdentifiers = vi.fn().mockResolvedValue([]);
const mockFetchMpcCardDetails = vi.fn().mockResolvedValue({});
const mockFetchPrebuiltCardbacks = vi.fn().mockResolvedValue({});
vi.mock('@/helpers/mpcAutofillApi', () => ({
    searchMpcIdentifiers: (...args: unknown[]) => mockSearchMpcIdentifiers(...args),
    fetchMpcCardDetails: (...args: unknown[]) => mockFetchMpcCardDetails(...args),
    fetchPrebuiltCardbacks: () => mockFetchPrebuiltCardbacks(),
    getMpcAutofillImageUrl: (id: string, size?: string) => `https://mpc.test/${id}/${size || 'full'}`,
}));

// Mock child components to isolate CardbackLibrary tests
vi.mock("./CardbackTile", () => ({
    CardbackTile: ({ id, name, onSelect, onDelete }: { id: string, name: string, onSelect: () => void, onDelete: () => void }) => (
        <div data-testid={`cardback-tile-${id}`}>
            <span>{name}</span>
            <button onClick={onSelect} data-testid={`select-${id}`}>Select</button>
            <button onClick={onDelete} data-testid={`delete-${id}`}>Delete</button>
        </div>
    )
}));

vi.mock("./DefaultCardbackCheckbox", () => ({
    DefaultCardbackCheckbox: () => <div data-testid="default-cardback-checkbox">Checkbox</div>
}));

vi.mock("../common/CardArtFilterBar/CardArtFilterBar", () => ({
    CardArtFilterBar: ({ searchBar }: { searchBar: React.ReactNode }) => <div data-testid="cardback-filter-bar">{searchBar}</div>
}));

// --- Tests ---

describe("CardbackLibrary", () => {
    const mockCardbackOptions: CardbackOption[] = [
        { id: "cb-1", name: "Default Back", imageUrl: "blob:test-url-1", source: "builtin", origin: "builtin" },
        { id: "cb-2", name: "Custom Back", imageUrl: "blob:test-url-2", source: "uploaded", origin: "uploaded" },
    ];

    const defaultProps = {
        linkedBackCard: undefined,
        modalCard: { uuid: "card-1" } as CardOption,
        defaultCardbackId: "cb-1",
        onSelectCardback: vi.fn(),
        onSetAsDefaultCardback: vi.fn(),
        onClose: vi.fn(),
        onRequestDelete: vi.fn(),
        onExecuteDelete: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mockLiveQueryReturn = mockCardbackOptions;
    });

    afterEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("renders cardbacks from useLiveQuery", () => {
        render(<CardbackLibrary {...defaultProps} />);
        expect(screen.getByTestId("cardback-tile-cb-1")).toBeInTheDocument();
        expect(screen.getByTestId("cardback-tile-cb-2")).toBeInTheDocument();
    });

    it("handles explicit selection of a cardback", async () => {
        render(<CardbackLibrary {...defaultProps} />);
        fireEvent.click(screen.getByTestId("select-cb-2"));

        await waitFor(() => {
            expect(defaultProps.onSelectCardback).toHaveBeenCalledWith("cb-2", "Custom Back");
        });
    });

    it("bypasses deletion confirmation if local storage flag is set", async () => {
        localStorage.setItem("cardback-delete-confirm-disabled", "true");
        render(<CardbackLibrary {...defaultProps} />);

        fireEvent.click(screen.getByTestId("delete-cb-2"));

        await waitFor(() => {
            expect(defaultProps.onExecuteDelete).toHaveBeenCalledWith("cb-2");
            expect(defaultProps.onRequestDelete).not.toHaveBeenCalled();
        });
    });

    it("requests deletion confirmation if local storage flag is missing", async () => {
        render(<CardbackLibrary {...defaultProps} />);

        fireEvent.click(screen.getByTestId("delete-cb-2"));

        await waitFor(() => {
            expect(defaultProps.onRequestDelete).toHaveBeenCalledWith("cb-2", "Custom Back");
            expect(defaultProps.onExecuteDelete).not.toHaveBeenCalled();
        });
    });

    it("hides filters if filtersCollapsed is true", () => {
        render(<CardbackLibrary {...defaultProps} filtersCollapsed={true} />);
        expect(screen.queryByTestId("cardback-filter-bar")).not.toBeInTheDocument();
    });
});
