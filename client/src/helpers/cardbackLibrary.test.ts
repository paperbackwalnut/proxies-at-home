import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { getAllCardbacks, BUILTIN_CARDBACKS, ingestMpcCardback, _resetCardbackState, type CardbackOption } from './cardbackLibrary';
import type { MpcAutofillCard } from './mpcAutofillApi';

vi.mock('./mpcAutofillApi', () => ({
    getMpcAutofillImageUrl: (id: string, size?: string) => `https://proxy.test/mpc?id=${id}&size=${size || 'full'}`,
    fetchPrebuiltCardbacks: vi.fn().mockResolvedValue({}),
}));

describe('Cardback Library', () => {
    beforeEach(async () => {
        await db.cardbacks.clear();
        vi.restoreAllMocks();
        _resetCardbackState();

        // Mock URL global
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob://test-url');
        globalThis.URL.revokeObjectURL = vi.fn();

        // Global mock for fetch
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            blob: async () => new Blob(['test-data'], { type: 'image/png' }),
        } as Response);

        // Global mock for createImageBitmap
        globalThis.createImageBitmap = vi.fn().mockResolvedValue({
            width: 744,
            height: 1039,
            close: vi.fn(),
        });

        // Mock Canvas getContext
        const mockContext = {
            drawImage: vi.fn(),
            fillRect: vi.fn(),
            clearRect: vi.fn(),
            putImageData: vi.fn(),
            setTransform: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            arc: vi.fn(),
            closePath: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            scale: vi.fn(),
            translate: vi.fn(),
            rotate: vi.fn(),
            setFilter: vi.fn(),
            set imageSmoothingEnabled(_v: boolean) { },
            set imageSmoothingQuality(_v: ImageSmoothingQuality) { },
            set filter(_v: string) { },
            getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(), width: 0, height: 0 })),
            createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(), width: 0, height: 0 })),
            measureText: vi.fn(() => ({ width: 0 })),
            toBlob: vi.fn((cb) => cb(new Blob())),
            canvas: document.createElement('canvas'),
        } as unknown as CanvasRenderingContext2D;

        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((id: string) => {
            return id === '2d' ? mockContext : null;
        }) as unknown as typeof HTMLCanvasElement.prototype.getContext);
    });

    describe('BUILTIN_CARDBACKS', () => {
        it('should have at least one built-in cardback', () => {
            expect(BUILTIN_CARDBACKS.length).toBeGreaterThanOrEqual(1);
        });

        it('should have valid structure for each built-in cardback', () => {
            for (const cb of BUILTIN_CARDBACKS) {
                expect(cb.id).toBeDefined();
                expect(cb.name).toBeDefined();
                expect(cb.imageUrl).toBeDefined();
                expect(cb.origin).toBe('builtin');
            }
        });

        it('should have IDs starting with cardback_builtin_', () => {
            for (const cb of BUILTIN_CARDBACKS) {
                expect(cb.id.startsWith('cardback_builtin_')).toBe(true);
            }
        });

        it('should not include classic-dots', () => {
            const classicDots = BUILTIN_CARDBACKS.find(cb => cb.id.includes('classic'));
            expect(classicDots).toBeUndefined();
        });
    });

    describe('getAllCardbacks', () => {
        it('should include built-in cardbacks', async () => {
            // Re-mount the console spy to ignore startup logs during tests
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
            const cardbacks = await getAllCardbacks();
            const builtinCardbacks = cardbacks.filter((c: CardbackOption) => c.origin === 'builtin');
            expect(builtinCardbacks.length).toBeGreaterThanOrEqual(1);
            consoleSpy.mockRestore();
        });

        it('should include uploaded cardbacks', async () => {
            await db.cardbacks.add({
                id: 'cardback_uploaded_test1',
                sourceUrl: 'blob:mock-url',
                hasBuiltInBleed: true,
            });

            const cardbacks = await getAllCardbacks();
            const uploadedCardback = cardbacks.find((c: CardbackOption) => c.id === 'cardback_uploaded_test1');
            expect(uploadedCardback).toBeDefined();
            expect(uploadedCardback?.origin).toBe('uploaded');
            expect(uploadedCardback?.source).toBe('My Uploads');
        });

        it('should derive mpc source for cardback_mpc_ IDs', async () => {
            await db.cardbacks.add({
                id: 'cardback_mpc_abc123',
                sourceUrl: 'https://example.com/mpc-image',
                hasBuiltInBleed: true,
            });

            const cardbacks = await getAllCardbacks();
            const mpcCardback = cardbacks.find((c: CardbackOption) => c.id === 'cardback_mpc_abc123');
            expect(mpcCardback).toBeDefined();
            expect(mpcCardback?.origin).toBe('mpc');
            expect(mpcCardback?.source).toBe('MPC (Saved)');
        });
    });

    describe('ingestMpcCardback', () => {
        const mockMpcCard: MpcAutofillCard = {
            identifier: 'test-mpc-id',
            name: 'Test MPC Cardback',
            smallThumbnailUrl: '',
            mediumThumbnailUrl: '',
            dpi: 300,
            tags: [],
            sourceName: 'test-source',
            source: 'test',
            extension: 'png',
            size: 5000,
        };

        it('should return existing ID without re-fetching', async () => {
            const existingBlob = new Blob(['existing'], { type: 'image/png' });
            await db.cardbacks.put({
                id: 'cardback_mpc_test-mpc-id',
                sourceUrl: 'https://proxy.test/mpc?id=test-mpc-id&size=full',
                originalBlob: existingBlob,
                displayBlob: existingBlob,
                displayName: 'Test MPC Cardback',
                hasBuiltInBleed: true,
                source: 'cardback',
            });

            vi.clearAllMocks();
            const result = await ingestMpcCardback(mockMpcCard);
            expect(result).toBe('cardback_mpc_test-mpc-id');
            expect(globalThis.fetch).not.toHaveBeenCalled();
        });

        it('should fetch and store new MPC cardback', async () => {
            const mockBlob = new Blob(['mock-image-data'], { type: 'image/png' });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                status: 200,
                blob: async () => mockBlob,
            } as Response);

            const result = await ingestMpcCardback(mockMpcCard);
            expect(result).toBe('cardback_mpc_test-mpc-id');
            expect(globalThis.fetch).toHaveBeenCalledWith(
                expect.stringContaining('test-mpc-id'),
            );
            const stored = await db.cardbacks.get('cardback_mpc_test-mpc-id');
            expect(stored).toBeDefined();
            expect(stored?.displayName).toBe('Test MPC Cardback');
            expect(stored?.hasBuiltInBleed).toBe(true);
            expect(stored?.originalBlob).toBeDefined();
        });

        it('should use cardback_mpc_ prefix for the ID', async () => {
            const mockBlob = new Blob(['data'], { type: 'image/png' });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                status: 200,
                blob: async () => mockBlob,
            } as Response);

            const card = { ...mockMpcCard, identifier: 'unique-abc-456' };
            const result = await ingestMpcCardback(card);
            expect(result).toBe('cardback_mpc_unique-abc-456');
        });
    });
});
