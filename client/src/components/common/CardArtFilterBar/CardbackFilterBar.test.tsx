import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CardbackFilterBar, type CardbackFilterState } from "./CardbackFilterBar";
import type { CardbackSource } from "@/types";

vi.mock("./SharedFilterLayout", () => ({
    SharedFilterLayout: ({
        children,
        sort,
        viewOptions,
        clear,
        count,
        favorites,
    }: {
        children: React.ReactNode;
        sort?: { dir: string; onDirChange: (dir: string) => void };
        viewOptions?: { groupBy: boolean; onToggleGroupBy: () => void };
        clear?: { show: boolean; onClear: () => void };
        count?: { total: number; filtered?: number };
        favorites?: { hasAny: boolean; isAllSelected: boolean; onToggle: () => void };
    }) => (
        <div data-testid="shared-filter-layout">
            {count && <span data-testid="count">{count.filtered ?? count.total} / {count.total}</span>}
            {favorites?.hasAny && (
                <button data-testid="favorites-toggle" onClick={favorites.onToggle}>
                    All Favs: {favorites.isAllSelected ? "Selected" : "Not Selected"}
                </button>
            )}
            {sort && (
                <div data-testid="sort-controls">
                    <button data-testid="sort-dir" onClick={() => sort.onDirChange(sort.dir === 'asc' ? 'desc' : 'asc')}>
                        {sort.dir}
                    </button>
                </div>
            )}
            {viewOptions && (
                <button data-testid="group-toggle" onClick={viewOptions.onToggleGroupBy}>
                    Group: {viewOptions.groupBy ? 'on' : 'off'}
                </button>
            )}
            {clear?.show && (
                <button data-testid="clear-filters" onClick={clear.onClear}>Clear</button>
            )}
            {children}
        </div>
    ),
}));

const mockPreferences = {
    favoriteCardbackOrigins: [] as string[],
    favoriteCardbackSources: [] as string[],
    favoriteCardbackSort: null as string | null,
    favoriteCardbackGroupBy: false,
    favoriteMpcDpi: null as number | null,
};

const mockStore = {
    preferences: mockPreferences,
    toggleFavoriteCardbackOrigin: vi.fn(),
    toggleFavoriteCardbackSource: vi.fn(),
    setFavoriteCardbackSort: vi.fn(),
    setFavoriteCardbackGroupBy: vi.fn(),
    setFavoriteMpcDpi: vi.fn(),
};

vi.mock("@/store", () => ({
    useUserPreferencesStore: vi.fn((selector) => {
        if (typeof selector === 'function') return selector(mockStore);
        return mockStore;
    }),
}));

describe("CardbackFilterBar", () => {
    const defaultFilters: CardbackFilterState = {
        originFilters: new Set(),
        sourceFilters: new Set(),
        minDpi: 0,
        sortBy: 'name',
        sortDir: 'asc',
        groupBy: false,
    };

    const defaultProps = {
        mode: 'cardback' as const,
        filters: defaultFilters,
        totalCount: 10,
        filteredCount: 10,
        availableMpcSources: [],
        setMinDpi: vi.fn(),
        setSortBy: vi.fn(),
        setSortDir: vi.fn(),
        setGroupBy: vi.fn(),
        toggleOriginFilter: vi.fn(),
        toggleSourceFilter: vi.fn(),
        setOriginFilters: vi.fn(),
        setSourceFilters: vi.fn(),
        clearFilters: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("rendering", () => {
        it("should render all source options in dropdown", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            fireEvent.click(screen.getByText("Origin"));
            expect(screen.getByText("Proxxied")).toBeTruthy();
            expect(screen.getByText("My Uploads")).toBeTruthy();
            expect(screen.getByText("MPC Autofill")).toBeTruthy();
        });

        it("should render sort controls", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            expect(screen.getByTestId("sort-controls")).toBeTruthy();
        });

        it("should render group-by toggle", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            expect(screen.getByTestId("group-toggle")).toBeTruthy();
        });

        it("should not show clear button when no filters active", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            expect(screen.queryByTestId("clear-filters")).toBeNull();
        });

        it("should show clear button when filters are active", () => {
            const filters: CardbackFilterState = {
                ...defaultFilters,
                sourceFilters: new Set(['builtin'] as const),
            };
            render(<CardbackFilterBar {...defaultProps} filters={filters} />);
            expect(screen.getByTestId("clear-filters")).toBeTruthy();
        });

        it("should show filtered count when filters are active", () => {
            const filters: CardbackFilterState = {
                ...defaultFilters,
                sourceFilters: new Set(['builtin'] as const),
            };
            render(<CardbackFilterBar {...defaultProps} filters={filters} filteredCount={3} />);
            expect(screen.getByTestId("count").textContent).toBe("3 / 10");
        });

        it("should show total count when no filters are active", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            expect(screen.getByTestId("count").textContent).toBe("10 / 10");
        });
    });

    describe("interactions", () => {
        it("should call toggleOriginFilter when MPC Autofill clicked", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            fireEvent.click(screen.getByText("Origin"));
            fireEvent.click(screen.getByText("MPC Autofill"));
            expect(defaultProps.toggleOriginFilter).toHaveBeenCalledWith("mpc");
        });

        it("should call toggleOriginFilter for builtin", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            fireEvent.click(screen.getByText("Origin"));
            fireEvent.click(screen.getByText("Proxxied"));
            expect(defaultProps.toggleOriginFilter).toHaveBeenCalledWith("builtin");
        });

        it("should call toggleOriginFilter for uploaded", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            fireEvent.click(screen.getByText("Origin"));
            fireEvent.click(screen.getByText("My Uploads"));
            expect(defaultProps.toggleOriginFilter).toHaveBeenCalledWith("uploaded");
        });

        it("should call setSortDir when sort direction toggled", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            fireEvent.click(screen.getByTestId("sort-dir"));
            expect(defaultProps.setSortDir).toHaveBeenCalledWith("desc");
        });

        it("should call onToggleGroupBySource when group toggle clicked", () => {
            render(<CardbackFilterBar {...defaultProps} />);
            fireEvent.click(screen.getByTestId("group-toggle"));
            expect(defaultProps.setGroupBy).toHaveBeenCalled();
        });

        it("should call clearFilters when clear button clicked", () => {
            const filters: CardbackFilterState = {
                ...defaultFilters,
                sourceFilters: new Set(['mpc'] as const),
            };
            render(<CardbackFilterBar {...defaultProps} filters={filters} />);
            fireEvent.click(screen.getByTestId("clear-filters"));
            expect(defaultProps.clearFilters).toHaveBeenCalled();
        });
    });

    describe("active state styling", () => {


        it("should apply active class to selected origin", () => {
            const filters = { ...defaultFilters, originFilters: new Set<CardbackSource>(["mpc"]) };
            render(<CardbackFilterBar {...defaultProps} filters={filters} />);
            fireEvent.click(screen.getByText("Origin"));
            const mpcLabel = screen.getByText("MPC Autofill");
            const checkbox = mpcLabel.closest('label')?.querySelector('input');
            expect(checkbox).toBeChecked();
        });

        it("should apply active class to multiple origins", () => {
            const filters = { ...defaultFilters, originFilters: new Set<CardbackSource>(["mpc", "builtin"]) };
            render(<CardbackFilterBar {...defaultProps} filters={filters} />);
            fireEvent.click(screen.getByText("Origin"));
            expect(screen.getByText("MPC Autofill").closest('label')?.querySelector('input')).toBeChecked();
            expect(screen.getByText("Proxxied").closest('label')?.querySelector('input')).toBeChecked();
        });
    });

    describe("favorites", () => {
        it("should not show favorites toggle when no favorites are set", () => {
            mockStore.preferences = { ...mockPreferences };
            render(<CardbackFilterBar {...defaultProps} />);
            expect(screen.queryByTestId("favorites-toggle")).toBeNull();
        });

        it("should show favorites toggle when origins are favorited", () => {
            mockStore.preferences = { ...mockPreferences, favoriteCardbackOrigins: ["builtin"] };
            render(<CardbackFilterBar {...defaultProps} />);
            expect(screen.getByTestId("favorites-toggle")).toBeTruthy();
        });

        it("should highlight favorites toggle when all favorites are selected", () => {
            mockStore.preferences = { ...mockPreferences, favoriteCardbackOrigins: ["builtin"] };
            const filters = { ...defaultFilters, originFilters: new Set<CardbackSource>(["builtin"]) };
            render(<CardbackFilterBar {...defaultProps} filters={filters} />);
            expect(screen.getByTestId("favorites-toggle").textContent).toContain("Selected");
        });

        it("should not highlight favorites toggle when favorites are not selected", () => {
            mockStore.preferences = { ...mockPreferences, favoriteCardbackOrigins: ["builtin"] };
            const filters = { ...defaultFilters, originFilters: new Set<CardbackSource>() };
            render(<CardbackFilterBar {...defaultProps} filters={filters} />);
            expect(screen.getByTestId("favorites-toggle").textContent).toContain("Not Selected");
        });

        it("should not show favorites toggle when only favoriteGroupBy is set", () => {
            mockStore.preferences = { ...mockPreferences, favoriteCardbackGroupBy: true };
            render(<CardbackFilterBar {...defaultProps} />);
            expect(screen.queryByTestId("favorites-toggle")).toBeNull();
        });

        it("should still show favorites toggle if other things are favorited beside groupBy", () => {
            mockStore.preferences = { ...mockPreferences, favoriteCardbackGroupBy: true, favoriteCardbackOrigins: ['builtin'] };
            render(<CardbackFilterBar {...defaultProps} />);
            expect(screen.getByTestId("favorites-toggle")).toBeTruthy();
        });
    });
});
