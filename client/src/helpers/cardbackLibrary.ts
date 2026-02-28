/**
 * Cardback Library
 * 
 * Provides a unified source for all available cardback images:
 * - Built-in (from server API)
 * - User-uploaded
 * - MPC-imported
 * 
 * Cardbacks are stored in their own table (db.cardbacks) which persists
 * across card clearing operations. Only explicit deletion removes cardbacks.
 */

import { API_BASE } from '../constants';
import { db } from '../db';
import { debugLog } from './debug';
import { ImageSource } from '../../../shared/types';
import type { CardbackSource } from '../../../shared/types';
import type { MpcAutofillCard } from './mpcAutofillApi';
import { getMpcAutofillImageUrl, fetchPrebuiltCardbacks } from './mpcAutofillApi';
import { bucketDpiFromHeight } from './imageProcessing';

export interface CardbackOption {
    id: string;
    name: string;
    imageUrl: string;
    source: string; // The display name for the source
    origin: CardbackSource; // The actual origin system ('builtin' | 'uploaded' | 'mpc')
    hasBuiltInBleed?: boolean;
    displayBleedWidth?: number;
    dpi?: number;
    tags?: string[];
    isFullyIngested?: boolean;
}

/**
 * Built-in cardbacks served from the API
 * Images are hosted on the server to reduce client bundle size
 */
export const BUILTIN_CARDBACKS: CardbackOption[] = [
    {
        id: 'cardback_builtin_mtg',
        name: 'Rose',
        imageUrl: `${API_BASE}/api/cards/images/cardback/mtg`,
        source: 'Proxxied',
        hasBuiltInBleed: false,  // Standard MTG back, no bleed
        origin: 'builtin',
    },
    {
        id: 'cardback_builtin_proxxied',
        name: 'Proxxied',
        imageUrl: `${API_BASE}/api/cards/images/cardback/proxxied`,
        source: 'Proxxied',
        hasBuiltInBleed: true,  // Has 1/8" bleed built in
        origin: 'builtin',
    },
    {
        id: 'cardback_builtin_blank',
        name: 'Blank (No Back)',
        imageUrl: '',  // No image - renders as plain white without cut guides
        source: 'Proxxied',
        hasBuiltInBleed: true,  // No guides needed
        origin: 'builtin',
    },
];

const BUILTIN_VERSION = 5; // Bump to force re-fetch of built-ins to fix previous corruption



/**
 * Track whether builtin cardbacks have been ensured during this session.
 * This avoids redundant database operations on every getAllCardbacks call.
 */
let builtinCardbacksEnsured = false;


/**
 * Ensures builtin cardbacks are stored in the cardbacks table.
 * This allows them to be used for creating linked back cards.
 */
export async function ensureBuiltinCardbacksInDb(forceCheck = false): Promise<void> {
    if (builtinCardbacksEnsured && !forceCheck) {
        // Quick verification: check if ALL builtins exist in DB
        try {
            const ids = BUILTIN_CARDBACKS.map(cb => cb.id);
            const existingItems = await db.cardbacks.bulkGet(ids);
            const allExist = existingItems.every(item => item !== undefined);
            if (allExist) return;
        } catch {
            // Ignore error, proceed to rebuild
        }
        builtinCardbacksEnsured = false;
    }

    for (const cardback of BUILTIN_CARDBACKS) {
        try {
            const existing = await db.cardbacks.get(cardback.id);

            if (cardback.id === 'cardback_builtin_blank') {
                if (existing) continue;
                await db.cardbacks.put({
                    id: cardback.id,
                    sourceUrl: '',
                    hasBuiltInBleed: true,
                });
                continue;
            }

            const needsUpdate = !existing?.displayBlob ||
                !existing?.displayBlobDarkened ||
                !existing?.originalBlob ||
                existing.displayBleedWidth === undefined ||
                existing.source !== 'cardback' ||
                (existing.displayVersion || 0) < BUILTIN_VERSION;

            let blob: Blob;
            if (existing?.originalBlob && !needsUpdate) {
                blob = existing.originalBlob;
            } else {
                const response = await fetch(cardback.imageUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${cardback.imageUrl}`);
                blob = await response.blob();
            }

            if (!needsUpdate && existing?.displayBlob) {
                continue;
            }

            const displayBlob = await generateCardbackDisplayBlob(blob);

            invalidateCardbackUrl(cardback.id);
            await db.cardbacks.put({
                id: cardback.id,
                sourceUrl: cardback.imageUrl,
                originalBlob: blob, // Store the FULL-RES original blob
                hasBuiltInBleed: cardback.hasBuiltInBleed,
                source: 'cardback',
                displayBlob,
                displayBlobDarkened: displayBlob,
                displayBleedWidth: cardback.hasBuiltInBleed ? 3.175 : 0,
                exportBlob: undefined,
                exportBlobDarkened: undefined,
                displayVersion: BUILTIN_VERSION,
            });
        } catch (error) {
            console.error(`Failed to store builtin cardback ${cardback.id}:`, error);
        }
    }
    builtinCardbacksEnsured = true;

    // After ensuring built-ins, trigger a background sync of the MPC library if it's missing
    void syncMpcCardbackLibrary();
}

/**
 * Syncs the MPC cardback library metadata into the local database.
 * This allows for offline browsing of available cardbacks with on-demand image loading.
 */
export async function syncMpcCardbackLibrary(force = false): Promise<void> {
    try {
        const mpcCount = await db.cardbacks.filter(cb => cb.id.startsWith('cardback_mpc_')).count();
        if (mpcCount > 0 && !force) return;

        debugLog(`[CardbackLib] Pulling MPC cardback library metadata...`);
        const prebuilt = await fetchPrebuiltCardbacks();
        const entries = Object.entries(prebuilt);
        if (entries.length === 0) return;

        await db.transaction('rw', db.cardbacks, async () => {
            const ids = entries.map(([identifier]) => `cardback_mpc_${identifier}`);
            const existingItems = await db.cardbacks.bulkGet(ids);

            const toPut: import('../db').Cardback[] = [];

            for (let i = 0; i < entries.length; i++) {
                const [identifier, card] = entries[i];
                const id = ids[i];
                const existing = existingItems[i];

                if (!existing) {
                    toPut.push({
                        id,
                        sourceUrl: getMpcAutofillImageUrl(identifier, 'large'),
                        displayName: card.name,
                        hasBuiltInBleed: true,
                        source: ImageSource.Cardback,
                        displayVersion: 1,
                        mpcSource: card.sourceName,
                        tags: card.tags,
                        exportDpi: card.dpi,
                    });
                } else {
                    // Update metadata for existing entries if missing
                    let needsUpdate = false;
                    const updated = { ...existing };

                    if (!existing.source) { updated.source = ImageSource.Cardback; needsUpdate = true; }
                    if (!existing.mpcSource && card.sourceName) { updated.mpcSource = card.sourceName; needsUpdate = true; }
                    if (!existing.tags && card.tags) { updated.tags = card.tags; needsUpdate = true; }
                    if (!existing.exportDpi && card.dpi) { updated.exportDpi = card.dpi; needsUpdate = true; }

                    if (!existing.originalBlob && updated.sourceUrl && !updated.sourceUrl.includes('size=large')) {
                        updated.sourceUrl = getMpcAutofillImageUrl(identifier, 'large');
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        toPut.push(updated);
                    }
                }
            }

            if (toPut.length > 0) {
                await db.cardbacks.bulkPut(toPut);
            }
        });
        debugLog(`[CardbackLib] Synced ${entries.length} MPC cardbacks`);
    } catch (error) {
        console.error('[CardbackLib] Failed to sync MPC cardback library:', error);
    }
}

async function generateCardbackDisplayBlob(blob: Blob, options: { isHighRes?: boolean } = {}): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    // Standard card: 63x88mm. Bleed card: 69.35x94.35mm.
    const isProbablyBleed = (Math.abs((bitmap.width / bitmap.height) - (69.35 / 94.35)) < 0.01);

    // Scale factor: 300 DPI (1.0) or 600 DPI (2.0)
    const scale = options.isHighRes ? 2.0 : 1.0;

    const targetWidth = Math.round((isProbablyBleed ? 820 : 744) * scale);
    const targetHeight = Math.round((isProbablyBleed ? 1115 : 1039) * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        bitmap.close();
        return blob;
    }

    // Use stepped downsampling for better quality when scaling down significantly
    let curWidth = bitmap.width;
    let curHeight = bitmap.height;

    // Create temporary canvases for intermediate steps
    const tempCanvas1 = document.createElement('canvas');
    const tempCtx1 = tempCanvas1.getContext('2d');
    const tempCanvas2 = document.createElement('canvas');
    const tempCtx2 = tempCanvas2.getContext('2d');

    if (!tempCtx1 || !tempCtx2) {
        // Fallback to single step if temp canvas fails
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.filter = 'blur(0.4px)';
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    } else {
        let drawSource: CanvasImageSource = bitmap;
        let activeCanvas = tempCanvas1;
        let activeCtx = tempCtx1;

        // Step down until we are close to target (within 2x)
        while (curWidth > targetWidth * 2) {
            curWidth = Math.floor(curWidth * 0.5);
            curHeight = Math.floor(curHeight * 0.5);

            activeCanvas.width = curWidth;
            activeCanvas.height = curHeight;
            activeCtx.imageSmoothingEnabled = true;
            activeCtx.imageSmoothingQuality = 'high';
            activeCtx.clearRect(0, 0, curWidth, curHeight);

            if (drawSource === bitmap) {
                activeCtx.filter = 'blur(0.4px)';
            } else {
                activeCtx.filter = 'none';
            }

            activeCtx.drawImage(drawSource, 0, 0, curWidth, curHeight);

            // For the next step, use the intermediate result
            drawSource = activeCanvas;
            if (activeCanvas === tempCanvas1) {
                activeCanvas = tempCanvas2;
                activeCtx = tempCtx2;
            } else {
                activeCanvas = tempCanvas1;
                activeCtx = tempCtx1;
            }
        }

        // Final draw to target canvas
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (drawSource === bitmap) {
            ctx.filter = 'blur(0.4px)';
        } else {
            ctx.filter = 'none';
        }
        ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);
    }

    bitmap.close();
    return new Promise<Blob>((resolve) => {
        canvas.toBlob((result) => {
            resolve(result || blob);
        }, 'image/png');
    });
}

export async function ingestMpcCardback(card: MpcAutofillCard): Promise<string> {
    const id = `cardback_mpc_${card.identifier}`;
    const existing = await db.cardbacks.get(id);

    // If it's already fully ingested with blobs, check if we need to update metadata
    if (existing?.originalBlob && existing?.displayBlob) {
        if (!existing.mpcSource && card.sourceName) {
            await db.cardbacks.update(id, {
                mpcSource: card.sourceName,
                tags: card.tags,
                exportDpi: card.dpi
            });
        }
        return id;
    }

    const url = getMpcAutofillImageUrl(card.identifier, 'full');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);

    const blob = await response.blob();
    const displayBlob = await generateCardbackDisplayBlob(blob);

    await db.cardbacks.put({
        ...existing,
        id,
        sourceUrl: url,
        originalBlob: blob,
        displayName: card.name,
        hasBuiltInBleed: true,
        source: ImageSource.Cardback,
        displayBlob,
        displayBlobDarkened: displayBlob,
        displayBleedWidth: 3.175,
        mpcSource: card.sourceName,
        tags: card.tags,
        exportDpi: card.dpi,
    });
    return id;
}

// Cache for active blob URLs to prevent redundant creation/revocation
const cardbackUrlCache = new Map<string, string>();

/**
 * Invalidates the cached URL for a given cardback ID.
 * Call this when a cardback is updated or deleted.
 */
export function invalidateCardbackUrl(id: string) {
    const url = cardbackUrlCache.get(id);
    if (url) {
        URL.revokeObjectURL(url);
        cardbackUrlCache.delete(id);
    }
}

/**
 * Revokes all cached blob URLs and clears the cache.
 * Call this during app cleanup, when clearing all cards, or when unmounting.
 * Prevents memory leaks from accumulated blob URLs.
 */
export function revokeAllCardbackUrls(): void {
    cardbackUrlCache.forEach(url => URL.revokeObjectURL(url));
    cardbackUrlCache.clear();
}

/**
 * Resets cardback state for testing purposes.
 * Revokes all cached URLs and clears the ensured flag.
 */
export function _resetCardbackState(): void {
    revokeAllCardbackUrls();
    builtinCardbacksEnsured = false;
}

/**
 * Get all available cardbacks from the cardbacks table.
 * Returns built-in cardbacks plus any user-uploaded or MPC-imported cardbacks.
 */
export async function getAllCardbacks(): Promise<CardbackOption[]> {
    // Ensure builtin cardbacks are in the database
    await ensureBuiltinCardbacksInDb();

    // Fetch all cardbacks from database
    const cardbackImages = await db.cardbacks.toArray();

    // Map database cardbacks to CardbackOption
    const cardbackOptions: CardbackOption[] = await Promise.all(cardbackImages.map(async img => {
        // Check if this is a builtin cardback
        const builtinInfo = BUILTIN_CARDBACKS.find(b => b.id === img.id);

        // Name priority: builtin name > custom displayName > last segment of sourceUrl > default
        const name = builtinInfo?.name
            || img.displayName
            || img.sourceUrl?.split('/').pop()
            || 'Uploaded Cardback';

        // hasBuiltInBleed priority: image record override > builtin default > fallback false for uploaded
        const hasBuiltInBleed = img.hasBuiltInBleed ?? builtinInfo?.hasBuiltInBleed ?? false;

        // Determine DPI
        // Use the explicitly saved exportDpi (which holds the original image DPI), then fallback to displayDpi
        let dpi = img.exportDpi || img.displayDpi;
        if (!dpi && img.id !== 'cardback_builtin_blank') {
            if (builtinInfo) {
                dpi = Infinity; // Proxxied/Builtin highest quality
            } else if (img.originalBlob) {
                try {
                    const bitmap = await createImageBitmap(img.originalBlob);
                    dpi = bucketDpiFromHeight(bitmap.height);
                    bitmap.close();

                    // Fire-and-forget save to DB so we don't calculate again
                    db.cardbacks.update(img.id, { exportDpi: dpi }).catch(console.error);
                } catch (e) {
                    console.error(`[CardbackLib] Failed to determine DPI for ${img.id}:`, e);
                }
            }
        }

        let imageUrl = '';
        const isMpc = img.id.startsWith('cardback_mpc_');
        
        if (isMpc) {
            const identifier = img.id.replace('cardback_mpc_', '');
            imageUrl = getMpcAutofillImageUrl(identifier, 'large');
            // Cleanup legacy blob from cache if it somehow got in there
            if (cardbackUrlCache.has(img.id)) {
                URL.revokeObjectURL(cardbackUrlCache.get(img.id)!);
                cardbackUrlCache.delete(img.id);
            }
        } else if (cardbackUrlCache.has(img.id)) {
            // debugLog(`[CardbackLib] Cache hit for ${img.id}`); // Mute the noisy cache hits
            imageUrl = cardbackUrlCache.get(img.id)!;
        } else {
            if (img.displayBlob) {
                // debugLog(`[CardbackLib] Creating new Blob URL for ${img.id}`);
                imageUrl = URL.createObjectURL(img.displayBlob);
                cardbackUrlCache.set(img.id, imageUrl);
            } else if (img.originalBlob) {
                // debugLog(`[CardbackLib] Creating new Blob URL for ${img.id}`);
                imageUrl = URL.createObjectURL(img.originalBlob);
                cardbackUrlCache.set(img.id, imageUrl);
            } else {
                imageUrl = img.sourceUrl || '';
            }
        }

        const origin: CardbackSource = builtinInfo ? 'builtin' : img.id.startsWith('cardback_mpc_') ? 'mpc' : 'uploaded';

        // Use the saved MPC source (artist name) if available.
        // For legacy ingested cards where mpcSource wasn't saved, we might need to re-fetch or just use a fallback.
        // But for all new cards, img.mpcSource will be the correct artist name (e.g. "JohnPrime").
        let sourceDisplayName = img.mpcSource;

        if (!sourceDisplayName) {
            if (origin === 'builtin') sourceDisplayName = 'Proxxied';
            else if (origin === 'uploaded') sourceDisplayName = 'My Uploads';
            else sourceDisplayName = 'MPC (Saved)'; // Legacy fallback
        }

        return {
            id: img.id,
            name,
            imageUrl,
            source: sourceDisplayName,
            origin,
            hasBuiltInBleed,
            displayBleedWidth: img.displayBleedWidth,
            dpi,
            tags: img.tags,
            isFullyIngested: origin === 'builtin' || !!img.originalBlob,
        };
    }));

    // Sort: builtins first in defined order, then user-uploaded alphabetically
    const priorityOrder = ['cardback_builtin_mtg', 'cardback_builtin_proxxied', 'cardback_builtin_blank'];
    return cardbackOptions.sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a.id);
        const bIndex = priorityOrder.indexOf(b.id);

        // Both are priority items - sort by priority order
        if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
        }
        // Only a is priority - a comes first
        if (aIndex !== -1) return -1;
        // Only b is priority - b comes first
        if (bIndex !== -1) return 1;
        // Neither is priority - sort alphabetically
        return a.name.localeCompare(b.name);
    });
}


