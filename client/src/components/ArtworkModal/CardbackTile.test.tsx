import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardbackTile } from './CardbackTile';

// Mock CardImageSvg to avoid IO issues and simplify testing
vi.mock('../common/CardImageSvg', () => ({
    CardImageSvg: ({ id, url, bleed }: { id: string, url: string, bleed?: { amountMm: number; sourceWidthMm: number; sourceHeightMm: number } }) => (
        <div data-testid="mock-card-image-svg" data-id={id} data-url={url} data-bleed={bleed ? JSON.stringify(bleed) : 'null'}>
            Mock Card Image
        </div>
    ),
}));

describe("CardbackTile", () => {
    const defaultProps = {
        id: '123',
        name: 'Test Cardback',
        imageUrl: 'http://example.com/image.png',
        source: 'Uploaded',
        origin: 'uploaded' as const,
        isSelected: false,
        isDefault: false,
        isDeleting: false,
        isEditing: false,
        editingName: '',
        onSelect: vi.fn(),
        onSetAsDefault: vi.fn(),
        onDelete: vi.fn(),
        onStartEdit: vi.fn(),
        onEditNameChange: vi.fn(),
        onSaveEdit: vi.fn(),
        onCancelEdit: vi.fn(),
    };

    describe("rendering", () => {
        it("should render correctly", () => {
            render(<CardbackTile {...defaultProps} origin="uploaded" />);
            expect(screen.getByText("Test Cardback")).toBeInTheDocument();
            expect(screen.getByTestId("mock-card-image-svg")).toBeInTheDocument();
        });

        it('should pass bleed config to CardImageSvg when displayBleedWidth is provided', () => {
            render(<CardbackTile {...defaultProps} displayBleedWidth={3.175} />);
            const cardImage = screen.getByTestId('mock-card-image-svg');
            const bleed = JSON.parse(cardImage.getAttribute('data-bleed') || 'null');
            expect(bleed.amountMm).toBe(3.175);
        });

        it('should fallback to 3.175mm when hasBuiltInBleed is true and displayBleedWidth is missing', () => {
            render(<CardbackTile {...defaultProps} hasBuiltInBleed={true} displayBleedWidth={undefined} />);
            const cardImage = screen.getByTestId('mock-card-image-svg');
            const bleed = JSON.parse(cardImage.getAttribute('data-bleed') || 'null');
            expect(bleed.amountMm).toBe(3.175);
        });

        it('should NOT pass bleed config when displayBleedWidth is 0', () => {
            render(<CardbackTile {...defaultProps} displayBleedWidth={0} />);
            const cardImage = screen.getByTestId('mock-card-image-svg');
            expect(cardImage.getAttribute('data-bleed')).toBe('null');
        });

        it('should pass correct source dimensions for bleed', () => {
            render(<CardbackTile {...defaultProps} displayBleedWidth={3.175} />);
            const cardImage = screen.getByTestId('mock-card-image-svg');
            const bleed = JSON.parse(cardImage.getAttribute('data-bleed') || 'null');
            expect(bleed.sourceWidthMm).toBe(63 + (3.175 * 2));
            expect(bleed.sourceHeightMm).toBe(88 + (3.175 * 2));
        });
    });

    describe("selection", () => {
        it("should call onSelect when clicked", () => {
            const onSelect = vi.fn();
            render(<CardbackTile {...defaultProps} onSelect={onSelect} />);

            const tile = screen.getByTestId("cardback-tile-123");
            fireEvent.click(tile);

            expect(onSelect).toHaveBeenCalled();
        });

        it('should apply green outline when selected', () => {
            render(<CardbackTile {...defaultProps} isSelected={true} origin="uploaded" />);
            const highlight = document.querySelector('[style*="outline"]') as HTMLElement;
            expect(highlight).toBeInTheDocument();
            // Match rgb(34, 197, 94) or rgb(34 197 94)
            expect(highlight.style.outline).toMatch(/rgb\(34[ ,]+197[ ,]+94\)/);
            expect(highlight.style.outline).toContain('px solid');
        });

        it('should not apply green outline when not selected', () => {
            render(<CardbackTile {...defaultProps} isSelected={false} />);
            const container = screen.getByTestId('cardback-tile-123').querySelector('div');
            expect(container?.style.outline).toBe('');
        });
    });

    describe("delete functionality (uploaded only)", () => {
        it('should show pencil and trash icons for uploaded cardback only when hovered', () => {
            render(<CardbackTile {...defaultProps} origin="uploaded" source="My Uploads" />);
            const trashButton = screen.getByTitle('Delete cardback');
            const pencilButton = screen.getByTitle('Rename');
            expect(trashButton).toBeInTheDocument();
            expect(pencilButton).toBeInTheDocument();
            const actionContainer = trashButton.closest('.flex.flex-col');
            expect(actionContainer?.className).toContain('opacity-0');
            expect(actionContainer?.className).toContain('group-hover:opacity-100');
        });

        it('should NOT show pencil or trash icons for builtin cardback', () => {
            render(<CardbackTile {...defaultProps} origin="builtin" source="Proxxied" />);
            expect(screen.queryByTitle('Delete cardback')).toBeNull();
            expect(screen.queryByTitle('Rename')).toBeNull();
        });
    });

    describe("blank cardback", () => {
        it('should render MTG cardback (No Back) correctly', () => {
            render(<CardbackTile {...defaultProps} id="cardback_builtin_blank" />);
            expect(screen.getByText('No Back')).toBeInTheDocument();
            expect(screen.queryByTestId('mock-card-image-svg')).toBeNull();
        });
    });
});
