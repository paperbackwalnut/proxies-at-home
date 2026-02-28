import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const {
    mockCloseModal,
    mockGoToNextCard,
    mockGoToPrevCard,
    mockSetDefaultCardbackId,
    mockSelectedCards,
    mockState,
    mockHandleSearch,
    mockHandleSelectCardback,
    mockHandleSetAsDefaultCardback,
    mockHandleRequestDelete,
    mockConfirmDelete,
    mockCancelDelete,
    mockHandleSelectArtwork,
    mockHandleSelectMpcArt,
    mockHandleSelectUploadLibraryArt,
    mockCardbackManagementReturn,
    mockDisplayMetadataReturn,
    mockSearchReturn,
    mockUpdateCard,
} = vi.hoisted(() => {
    const mockHandleSelectCardback = vi.fn();
    const mockHandleSetAsDefaultCardback = vi.fn();
    const mockHandleRequestDelete = vi.fn();
    const mockHandleExecuteDelete = vi.fn();
    const mockConfirmDelete = vi.fn();
    const mockCancelDelete = vi.fn();
    const mockSetCardbackOptions = vi.fn();
    const mockSetShowCardbackLibrary = vi.fn();
    const mockSetDontShowAgain = vi.fn();
    const mockHandleSearch = vi.fn();
    const mockSetPreviewCardData = vi.fn();
    const mockHandleSelectArtwork = vi.fn().mockResolvedValue(undefined);
    const mockHandleSelectMpcArt = vi.fn().mockResolvedValue(undefined);
    const mockHandleSelectUploadLibraryArt = vi.fn().mockResolvedValue(undefined);

    return {
        mockCloseModal: vi.fn(),
        mockGoToNextCard: vi.fn(),
        mockGoToPrevCard: vi.fn(),
        mockSetDefaultCardbackId: vi.fn(),
        mockSelectedCards: new Set<string>(),
        mockUpdateCard: vi.fn(),
        mockState: {
            isModalOpen: false,
            modalCard: null as { uuid: string; name: string; imageId?: string; linkedBackId?: string; isUserUpload?: boolean } | null,
            initialTab: 'artwork' as 'artwork' | 'settings',
            initialFace: 'front' as 'front' | 'back',
            initialArtSource: undefined as 'scryfall' | 'mpc' | undefined,
            initialOpenAdvancedSearch: false,
            allCards: [] as { uuid: string; name: string }[],
            index: null as number | null,
        },
        mockHandleSearch,
        _mockSetPreviewCardData: mockSetPreviewCardData,
        mockHandleSelectCardback,
        mockHandleSetAsDefaultCardback,
        mockHandleRequestDelete,
        _mockHandleExecuteDelete: mockHandleExecuteDelete,
        mockConfirmDelete,
        mockCancelDelete,
        _mockSetCardbackOptions: mockSetCardbackOptions,
        _mockSetShowCardbackLibrary: mockSetShowCardbackLibrary,
        _mockSetDontShowAgain: mockSetDontShowAgain,
        mockHandleSelectArtwork,
        mockHandleSelectMpcArt,
        mockHandleSelectUploadLibraryArt,
        mockCardbackManagementReturn: {
            showCardbackLibrary: false,
            setShowCardbackLibrary: mockSetShowCardbackLibrary,
            pendingDeleteId: null as string | null,
            pendingDeleteName: '',
            dontShowAgain: false,
            setDontShowAgain: mockSetDontShowAgain,
            handleSelectCardback: mockHandleSelectCardback,
            handleSetAsDefaultCardback: mockHandleSetAsDefaultCardback,
            handleRequestDelete: mockHandleRequestDelete,
            handleExecuteDelete: mockHandleExecuteDelete,
            confirmDelete: mockConfirmDelete,
            cancelDelete: mockCancelDelete,
        },
        mockDisplayMetadataReturn: {
            propsToRender: {
                modalCard: null as { uuid: string; name: string; imageId?: string } | null,
                linkedBackCard: undefined as { uuid: string; name: string; imageId?: string } | undefined,
                selectedFace: 'front' as 'front' | 'back',
                isDFC: false,
                previewCardData: null as { name: string; imageUrls?: string[]; prints?: unknown[] } | null,
                displayName: 'Test Card',
                displayImageUrls: undefined as string[] | undefined,
                displayPrints: undefined as unknown[] | undefined,
                displaySelectedArtId: 'test-image-id',
                finalProcessedDisplayUrl: null as string | null,
                activeCard: null as { uuid: string; name: string; imageId?: string } | null,
            },
            isDFC: false,
            tabLabels: { front: 'Front', back: 'Back' } as Record<string, string>,
            showCardbackButton: false,
            isUploadLibraryItem: false,
            hasUploadLibraryItems: false,
        },
        mockSearchReturn: {
            isSearching: false,
            previewCardData: null as unknown,
            setPreviewCardData: mockSetPreviewCardData,
            handleSearch: mockHandleSearch,
        },
    };
});

// --- Store Mocks ---
vi.mock('@/store/artworkModal', () => {
    const getStore = () => ({
        open: mockState.isModalOpen,
        card: mockState.modalCard,
        index: mockState.index,
        initialTab: mockState.initialTab,
        initialFace: mockState.initialFace,
        initialArtSource: mockState.initialArtSource,
        initialOpenAdvancedSearch: mockState.initialOpenAdvancedSearch,
        allCards: mockState.allCards,
        navigationDirection: null,
        prefetchedData: {},
        closeModal: mockCloseModal,
        goToNextCard: mockGoToNextCard,
        goToPrevCard: mockGoToPrevCard,
        updateCard: mockUpdateCard,
    });
    const fn = (selector: (state: ReturnType<typeof getStore>) => unknown) => {
        const state = getStore();
        return typeof selector === 'function' ? selector(state) : state;
    };
    fn.getState = getStore;
    return { useArtworkModalStore: fn };
});

vi.mock('@/store/settings', () => ({
    useSettingsStore: Object.assign(
        vi.fn((selector) => {
            const state = {
                defaultCardbackId: 'default-cardback-1',
                setDefaultCardbackId: mockSetDefaultCardbackId,
                preferredArtSource: 'scryfall',
            };
            return typeof selector === 'function' ? selector(state) : state;
        }),
        {
            getState: () => ({
                defaultCardbackId: 'default-cardback-1',
                setDefaultCardbackId: mockSetDefaultCardbackId,
                preferredArtSource: 'scryfall',
            }),
            subscribe: vi.fn(() => vi.fn()),
        }
    ),
}));

vi.mock('@/store/selection', () => ({
    useSelectionStore: {
        getState: () => ({
            selectedCards: mockSelectedCards,
            setFlipped: vi.fn(),
        }),
    },
}));

// --- Hook Mocks ---
vi.mock('./hooks/useArtworkSearch', () => ({
    useArtworkSearch: vi.fn(() => mockSearchReturn),
}));

vi.mock('./hooks/useCardbackManagement', () => ({
    useCardbackManagement: vi.fn(() => mockCardbackManagementReturn),
}));

vi.mock('./hooks/useArtworkDisplayMetadata', () => ({
    useArtworkDisplayMetadata: vi.fn(() => mockDisplayMetadataReturn),
}));

vi.mock('./hooks/useArtworkApplication', () => ({
    useArtworkApplication: vi.fn(() => ({
        handleSelectArtwork: mockHandleSelectArtwork,
        handleSelectMpcArt: mockHandleSelectMpcArt,
        handleSelectUploadLibraryArt: mockHandleSelectUploadLibraryArt,
    })),
}));

vi.mock('./hooks/usePinchToZoom', () => ({
    usePinchToZoom: vi.fn(() => ({ containerRef: { current: null } })),
}));

vi.mock('./hooks/useArtworkModalNavigation', () => ({
    useArtworkModalNavigation: vi.fn(),
}));

vi.mock('./hooks/usePreloadNeighborImages', () => ({
    usePreloadNeighborImages: vi.fn(),
}));

vi.mock('@/hooks/useZoomShortcuts', () => ({
    useZoomShortcuts: vi.fn(),
}));

vi.mock('@/helpers/debug', () => ({
    debugLog: vi.fn(),
}));

vi.mock('@/helpers/mpcAutofillApi', () => ({
    getMpcAutofillImageUrl: vi.fn((id: string) => `https://mpc.example.com/${id}`),
    extractMpcIdentifierFromImageId: vi.fn((imageId: string) => {
        if (imageId?.includes('mpc')) return imageId;
        return null;
    }),
}));

vi.mock('@/db', () => ({
    db: {
        cards: { get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
        images: { get: vi.fn() },
        cardbacks: { get: vi.fn() },
    },
}));

// --- Child Component Mocks ---
vi.mock('./ArtworkTabContent', () => ({
    ArtworkTabContent: ({
        onOpenSearch,
        onClose,
        artSource,
        setArtSource,
        onSelectArtwork,
        onSelectMpcArt,
        onSelectCardback,
        onSetAsDefaultCardback,
        onRequestDelete,
        onExecuteDelete,
        setSelectedFace,
        selectedFace,
        displayName,
    }: Record<string, unknown>) => (
        <div data-testid="artwork-tab-content" data-art-source={artSource as string} data-display-name={displayName as string}>
            <button data-testid="open-search" onClick={onOpenSearch as () => void}>Open Search</button>
            <button data-testid="close-button" onClick={onClose as () => void}>Close</button>
            <button data-testid="switch-to-mpc" onClick={() => (setArtSource as (s: string) => void)('mpc')}>Switch to MPC</button>
            <button data-testid="select-artwork" onClick={() => (onSelectArtwork as (u: string) => void)('https://example.com/art.jpg')}>Select</button>
            <button data-testid="select-mpc-art" onClick={() => (onSelectMpcArt as (c: { identifier: string; name: string }) => void)({ identifier: 'mpc-123', name: 'MPC Card' })}>Select MPC</button>
            <button data-testid="select-cardback" onClick={() => (onSelectCardback as (id: string, name: string) => void)('cardback-1', 'Custom Back')}>Select Cardback</button>
            <button data-testid="set-default-cardback" onClick={() => (onSetAsDefaultCardback as (id: string, name: string) => void)('cardback-2', 'Default Back')}>Set Default</button>
            <button data-testid="delete-cardback" onClick={() => (onRequestDelete as (id: string, name: string) => void)('cardback-1', 'Custom Back')}>Delete</button>
            <button data-testid="execute-delete" onClick={() => (onExecuteDelete as (id: string) => void)('cardback-1')}>Execute Delete</button>
            {!!setSelectedFace && (
                <div data-testid="toggle-front-back" data-value={selectedFace as string}>
                    <button data-testid="toggle-btn-front" onClick={() => (setSelectedFace as (f: string) => void)('front')}>Front</button>
                    <button data-testid="toggle-btn-back" onClick={() => (setSelectedFace as (f: string) => void)('back')}>Back</button>
                </div>
            )}
        </div>
    ),
}));

vi.mock('../CardEditorModal/ArtworkBleedSettings', () => ({
    ArtworkBleedSettings: ({ selectedFace }: { selectedFace: string }) => (
        <div data-testid="artwork-bleed-settings" data-selected-face={selectedFace}>Bleed Settings</div>
    ),
}));

vi.mock('./AdvancedSearch', () => ({
    AdvancedSearch: ({
        isOpen,
        onClose,
        onSelectCard,
    }: {
        isOpen: boolean;
        onClose: () => void;
        onSelectCard: (name: string, mpcUrl?: string) => void;
    }) => (
        isOpen ? (
            <div data-testid="advanced-search">
                <button data-testid="close-search" onClick={onClose}>Close Search</button>
                <button data-testid="select-card" onClick={() => onSelectCard('Selected Card')}>Select Card</button>
                <button data-testid="select-mpc-card" onClick={() => onSelectCard('MPC Card', 'https://mpc.example.com/id=abc123')}>Select MPC</button>
            </div>
        ) : null
    ),
}));

vi.mock('../common', () => ({
    ResponsiveModal: ({
        isOpen,
        children,
        header,
    }: {
        isOpen: boolean;
        children: React.ReactNode;
        header: React.ReactNode;
    }) => (
        isOpen ? (
            <div data-testid="responsive-modal">
                <div data-testid="modal-header">{header}</div>
                <div data-testid="modal-content">{children}</div>
            </div>
        ) : null
    ),
    ArtSourceToggle: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <div data-testid="mock-source-toggle" data-value={value}>
            <button data-testid="mock-source-mpc-btn" onClick={() => onChange('mpc')}>MPC</button>
            <button data-testid="mock-source-scryfall-btn" onClick={() => onChange('scryfall')}>Scryfall</button>
        </div>
    ),
}));

vi.mock('./DeleteCardbackModal', () => ({
    DeleteCardbackModal: ({
        pendingDeleteId,
        onConfirm,
        onCancel,
    }: {
        pendingDeleteId: string | null;
        pendingDeleteName: string;
        defaultCardbackId: string;
        dontShowAgain: boolean;
        onDontShowAgainChange: (v: boolean) => void;
        onConfirm: () => void;
        onCancel: () => void;
    }) => (
        pendingDeleteId ? (
            <div data-testid="delete-cardback-modal">
                <span>Delete Cardback?</span>
                <button onClick={onConfirm}>Yes, delete</button>
                <button onClick={onCancel}>Cancel</button>
            </div>
        ) : null
    ),
}));

vi.mock('./ArtworkModalHeader', () => ({
    ArtworkModalNavigationArrows: ({
        canGoPrev,
        canGoNext,
        onPrev,
        onNext,
    }: {
        canGoPrev: boolean;
        canGoNext: boolean;
        onPrev: () => void;
        onNext: () => void;
    }) => (
        <div data-testid="navigation-arrows">
            <button data-testid="prev-btn" disabled={!canGoPrev} onClick={onPrev}>Prev</button>
            <button data-testid="next-btn" disabled={!canGoNext} onClick={onNext}>Next</button>
        </div>
    ),
    ArtworkModalSidebarHeader: ({ displayName, artSource }: { displayName: string; artSource: string }) => (
        <div data-testid="sidebar-header">Select Artwork for {displayName} ({artSource})</div>
    ),
    ArtworkModalTabBars: ({
        activeTab,
        setActiveTab,
    }: {
        activeTab: string;
        setActiveTab: (tab: string) => void;
    }) => (
        <div data-testid="tab-bars" data-active-tab={activeTab}>
            <button data-testid="tab-btn-artwork" onClick={() => setActiveTab('artwork')}>Artwork</button>
            <button data-testid="tab-btn-settings" onClick={() => setActiveTab('settings')}>Settings</button>
        </div>
    ),
}));

vi.mock('flowbite-react', () => ({
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
        <button onClick={onClick}>{children}</button>
    ),
    Checkbox: ({ id, checked, onChange }: { id: string; checked: boolean; onChange: (e: { target: { checked: boolean } }) => void }) => (
        <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange({ target: { checked: e.target.checked } })} data-testid={id} />
    ),
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) => (
        <label htmlFor={htmlFor}>{children}</label>
    ),
}));

import { ArtworkModal } from './ArtworkModal';

function setDefaultMockState() {
    mockState.isModalOpen = true;
    mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'test-image-id' };
    mockState.initialTab = 'artwork';
    mockState.initialFace = 'front';
    mockState.initialArtSource = undefined;
    mockState.initialOpenAdvancedSearch = false;
    mockState.allCards = [];
    mockState.index = null;
    mockDisplayMetadataReturn.propsToRender.modalCard = mockState.modalCard;
    mockDisplayMetadataReturn.propsToRender.activeCard = mockState.modalCard;
    mockDisplayMetadataReturn.propsToRender.displayName = 'Test Card';
    mockDisplayMetadataReturn.propsToRender.selectedFace = 'front';
    mockDisplayMetadataReturn.propsToRender.isDFC = false;
    mockDisplayMetadataReturn.propsToRender.previewCardData = null;
    mockDisplayMetadataReturn.propsToRender.displayPrints = undefined;
    mockDisplayMetadataReturn.propsToRender.displaySelectedArtId = 'test-image-id';
    mockDisplayMetadataReturn.propsToRender.finalProcessedDisplayUrl = null;
    mockDisplayMetadataReturn.propsToRender.linkedBackCard = undefined;
    mockDisplayMetadataReturn.isDFC = false;
    mockDisplayMetadataReturn.showCardbackButton = false;
    mockDisplayMetadataReturn.isUploadLibraryItem = false;
    mockDisplayMetadataReturn.hasUploadLibraryItems = false;
    mockDisplayMetadataReturn.tabLabels = { front: 'Front', back: 'Back' };
    mockCardbackManagementReturn.pendingDeleteId = null;
    mockCardbackManagementReturn.pendingDeleteName = '';
    mockCardbackManagementReturn.showCardbackLibrary = false;
    mockCardbackManagementReturn.dontShowAgain = false;
    mockSearchReturn.isSearching = false;
    mockSearchReturn.previewCardData = null;
}

describe('ArtworkModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.isModalOpen = false;
        mockState.modalCard = null;
        mockState.initialTab = 'artwork';
        mockState.initialFace = 'front';
        mockState.initialArtSource = undefined;
        mockState.initialOpenAdvancedSearch = false;
        mockState.allCards = [];
        mockState.index = null;
        mockSelectedCards.clear();
    });

    describe('rendering', () => {
        it('should not render when modal is closed', () => {
            mockState.isModalOpen = false;
            render(<ArtworkModal />);
            expect(screen.queryByTestId('responsive-modal')).toBeNull();
        });

        it('should render when modal is open', () => {
            setDefaultMockState();
            render(<ArtworkModal />);
            expect(screen.getByTestId('responsive-modal')).toBeDefined();
        });

        it('should show card name in header', () => {
            setDefaultMockState();
            mockState.modalCard = { uuid: 'test-uuid', name: 'Lightning Bolt', imageId: 'test-image-id' };
            mockDisplayMetadataReturn.propsToRender.displayName = 'Lightning Bolt';
            render(<ArtworkModal />);
            expect(screen.getByText(/Select Artwork for Lightning Bolt/)).toBeDefined();
        });

        it('should show artwork tab by default', () => {
            setDefaultMockState();
            render(<ArtworkModal />);
            expect(screen.getByTestId('artwork-tab-content')).toBeDefined();
        });

        it('should show settings tab when switched', () => {
            setDefaultMockState();
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('tab-btn-settings'));
            expect(screen.getByTestId('artwork-bleed-settings')).toBeDefined();
            expect(screen.queryByTestId('artwork-tab-content')).toBeNull();
        });
    });

    describe('art source initialization', () => {
        it('should set MPC source when card uses MPC imageId', () => {
            setDefaultMockState();
            mockState.modalCard = { uuid: 'test-uuid', name: 'Test Card', imageId: 'mpc-autofill-123' };
            mockDisplayMetadataReturn.propsToRender.modalCard = mockState.modalCard;
            mockDisplayMetadataReturn.propsToRender.activeCard = mockState.modalCard;
            render(<ArtworkModal />);
            expect(screen.getByTestId('artwork-tab-content').getAttribute('data-art-source')).toBe('mpc');
        });

        it('should use initialArtSource when provided', () => {
            setDefaultMockState();
            mockState.initialArtSource = 'mpc';
            render(<ArtworkModal />);
            expect(screen.getByTestId('artwork-tab-content').getAttribute('data-art-source')).toBe('mpc');
        });

        it('should default to scryfall for non-MPC cards', () => {
            setDefaultMockState();
            render(<ArtworkModal />);
            expect(screen.getByTestId('artwork-tab-content').getAttribute('data-art-source')).toBe('scryfall');
        });
    });

    describe('handler wiring', () => {
        beforeEach(setDefaultMockState);

        it('should wire onSelectArtwork to useArtworkApplication.handleSelectArtwork', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('select-artwork'));
            expect(mockHandleSelectArtwork).toHaveBeenCalledWith('https://example.com/art.jpg');
        });

        it('should wire onSelectMpcArt to useArtworkApplication.handleSelectMpcArt', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('select-mpc-art'));
            expect(mockHandleSelectMpcArt).toHaveBeenCalledWith(
                expect.objectContaining({ identifier: 'mpc-123', name: 'MPC Card' })
            );
        });

        it('should wire onSelectCardback to useCardbackManagement.handleSelectCardback', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('select-cardback'));
            expect(mockHandleSelectCardback).toHaveBeenCalledWith('cardback-1', 'Custom Back');
        });

        it('should wire onSetAsDefaultCardback to useCardbackManagement.handleSetAsDefaultCardback', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('set-default-cardback'));
            expect(mockHandleSetAsDefaultCardback).toHaveBeenCalledWith('cardback-2', 'Default Back');
        });

        it('should wire onRequestDelete to useCardbackManagement.handleRequestDelete', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('delete-cardback'));
            expect(mockHandleRequestDelete).toHaveBeenCalledWith('cardback-1', 'Custom Back');
        });
    });

    describe('search interaction', () => {
        beforeEach(setDefaultMockState);

        it('should open advanced search when button clicked', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('open-search'));
            expect(screen.getByTestId('advanced-search')).toBeDefined();
        });

        it('should close search when close button clicked', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('open-search'));
            expect(screen.getByTestId('advanced-search')).toBeDefined();
            fireEvent.click(screen.getByTestId('close-search'));
            expect(screen.queryByTestId('advanced-search')).toBeNull();
        });

        it('should call handleSearch when selecting a card from search', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('open-search'));
            fireEvent.click(screen.getByTestId('select-card'));
            expect(mockHandleSearch).toHaveBeenCalledWith('Selected Card', true, undefined);
        });

        it('should call handleSelectMpcArt when selecting MPC card from search', async () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('open-search'));
            await act(async () => {
                fireEvent.click(screen.getByTestId('select-mpc-card'));
            });
            expect(mockHandleSelectMpcArt).toHaveBeenCalledWith(
                expect.objectContaining({ identifier: 'abc123' })
            );
        });
    });

    describe('delete cardback modal', () => {
        beforeEach(setDefaultMockState);

        it('should not show delete modal when no pending delete', () => {
            mockCardbackManagementReturn.pendingDeleteId = null;
            render(<ArtworkModal />);
            expect(screen.queryByTestId('delete-cardback-modal')).toBeNull();
        });

        it('should show delete modal when pendingDeleteId is set', () => {
            mockCardbackManagementReturn.pendingDeleteId = 'cardback-1';
            mockCardbackManagementReturn.pendingDeleteName = 'Custom Back';
            render(<ArtworkModal />);
            expect(screen.getByTestId('delete-cardback-modal')).toBeDefined();
            expect(screen.getByText('Delete Cardback?')).toBeDefined();
        });

        it('should wire confirm button to confirmDelete', () => {
            mockCardbackManagementReturn.pendingDeleteId = 'cardback-1';
            render(<ArtworkModal />);
            fireEvent.click(screen.getByText('Yes, delete'));
            expect(mockConfirmDelete).toHaveBeenCalled();
        });

        it('should wire cancel button to cancelDelete', () => {
            mockCardbackManagementReturn.pendingDeleteId = 'cardback-1';
            render(<ArtworkModal />);
            fireEvent.click(screen.getByText('Cancel'));
            expect(mockCancelDelete).toHaveBeenCalled();
        });
    });

    describe('navigation', () => {
        beforeEach(() => {
            setDefaultMockState();
            mockState.allCards = [
                { uuid: 'card-1', name: 'Card 1' },
                { uuid: 'card-2', name: 'Card 2' },
            ];
            mockState.index = 0;
        });

        it('should show navigation arrows when multiple cards exist', () => {
            render(<ArtworkModal />);
            expect(screen.getByTestId('navigation-arrows')).toBeDefined();
        });

        it('should call goToNextCard when next button clicked', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('next-btn'));
            expect(mockGoToNextCard).toHaveBeenCalled();
        });

        it('should call goToPrevCard when prev button clicked', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('prev-btn'));
            expect(mockGoToPrevCard).toHaveBeenCalled();
        });
    });

    describe('auto-search for cards without imageId', () => {
        it('should trigger handleSearch for cards with no imageId', () => {
            setDefaultMockState();
            mockState.modalCard = { uuid: 'test-uuid', name: 'New Card' };
            mockDisplayMetadataReturn.propsToRender.modalCard = mockState.modalCard;
            mockDisplayMetadataReturn.propsToRender.activeCard = mockState.modalCard;
            mockDisplayMetadataReturn.propsToRender.displayName = 'New Card';
            render(<ArtworkModal />);
            expect(mockHandleSearch).toHaveBeenCalledWith('New Card', false);
        });

        it('should NOT trigger handleSearch for cards with imageId', () => {
            setDefaultMockState();
            render(<ArtworkModal />);
            expect(mockHandleSearch).not.toHaveBeenCalled();
        });
    });

    describe('face selection', () => {
        beforeEach(setDefaultMockState);

        it('should display front face by default', () => {
            render(<ArtworkModal />);
            expect(screen.getByTestId('toggle-front-back').getAttribute('data-value')).toBe('front');
        });
    });

    describe('DFC handling', () => {
        it('should pass isDFC from useArtworkDisplayMetadata', () => {
            setDefaultMockState();
            mockDisplayMetadataReturn.isDFC = true;
            render(<ArtworkModal />);
            expect(screen.getByTestId('responsive-modal')).toBeDefined();
        });

        it('should pass showCardbackButton from useArtworkDisplayMetadata', () => {
            setDefaultMockState();
            mockDisplayMetadataReturn.showCardbackButton = true;
            render(<ArtworkModal />);
            expect(screen.getByTestId('responsive-modal')).toBeDefined();
        });
    });

    describe('display name wiring', () => {
        it('should pass displayName from propsToRender to child components', () => {
            setDefaultMockState();
            mockDisplayMetadataReturn.propsToRender.displayName = 'My Custom Card';
            render(<ArtworkModal />);
            expect(screen.getByTestId('artwork-tab-content').getAttribute('data-display-name')).toBe('My Custom Card');
        });
    });

    describe('modal close behavior', () => {
        beforeEach(setDefaultMockState);

        it('should call closeModal from store when close button clicked', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('close-button'));
            expect(mockCloseModal).toHaveBeenCalled();
        });

        it('should prevent close when delete is pending', () => {
            mockCardbackManagementReturn.pendingDeleteId = 'some-id';
            render(<ArtworkModal />);
            expect(screen.getByTestId('delete-cardback-modal')).toBeDefined();
        });
    });

    describe('art source switching', () => {
        beforeEach(setDefaultMockState);

        it('should switch to MPC when toggle button clicked', () => {
            render(<ArtworkModal />);
            fireEvent.click(screen.getByTestId('switch-to-mpc'));
            expect(screen.getByTestId('artwork-tab-content').getAttribute('data-art-source')).toBe('mpc');
        });
    });
});
