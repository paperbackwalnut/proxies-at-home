import { type ImportIntent, parseLineToIntent } from "./importParsers";
import type { TcgId } from "@/config/tcgConfig";
import { streamCards, type CardInfo } from "./streamCards";
import { undoableAddCards } from "./undoableActions";
import { addRemoteImage, createLinkedBackCardsBulk } from "./dbUtils";
import { ImageSource } from '@/types';
import { useSettingsStore, useProjectStore, useUserPreferencesStore } from "@/store";
import { getTcgPrefs } from "@/store/userPreferences";
import { getMpcAutofillImageUrl } from "./mpcAutofillApi";
import { findBestMpcMatches } from "./mpcImportIntegration";
import { convertScryfallToCardOptions } from "./cardConverter";
import { fetchCardBySetAndNumber, fetchCardWithPrints, fetchCardsMetadataBatch } from "./scryfallApi";
import type { CardOption, TokenPart } from "../../../shared/types";
import { fetchTokenParts } from "./tokenApi";
import { db } from "../db";
import { IMPORT_CONFIG } from "./importConfig";

/**
 * Snapshot of settings used for an import operation.
 * Captured once at import start for consistency across all cards.
 */
export interface ImportSettings {
    preferredArtSource: typeof ImageSource.Scryfall | typeof ImageSource.MPC | typeof ImageSource.UploadLibrary;
    globalLanguage: string;
    autoImportTokens: boolean;
    projectId: string;
    favoriteScryfallSets?: string[];
    activeTcg?: TcgId;
}

export interface OrchestratorOptions {
    onProgress?: (processed: number, total: number) => void;
    onComplete?: () => void;
    signal?: AbortSignal;
    /** Settings snapshot - if not provided, captured from store at process start */
    settings?: ImportSettings;
}

export class ImportOrchestrator {
    /**
     * Managed AbortControllers for stream operations when no external signal is provided.
     * Uses a Set to track all concurrent stream operations (e.g., MPC + Scryfall in parallel).
     * Allows cancellation via cancelActiveStreams().
     */
    private static streamControllers: Set<AbortController> = new Set();

    /**
     * Cancel all active stream operations that were started without an external signal.
     */
    static cancelActiveStreams(): void {
        for (const controller of this.streamControllers) {
            controller.abort();
        }
        this.streamControllers.clear();
    }

    private static extractScryfallMetadata(card: { colors?: string[]; cmc?: number; type_line?: string; rarity?: string; mana_cost?: string; token_parts?: CardOption['token_parts'] }) {
        return {
            colors: card.colors,
            cmc: card.cmc,
            type_line: card.type_line,
            rarity: card.rarity,
            mana_cost: card.mana_cost,
            token_parts: card.token_parts,
        };
    }

    private static async resolveDfcBack(
        scryfallCard: { card_faces?: Array<{ name: string; imageUrl?: string }>; set?: string; number?: string },
        quantity: number,
        options?: { tryMpc?: boolean; cardName?: string },
    ): Promise<{ imageId: string; name: string } | undefined> {
        if (!scryfallCard.card_faces || scryfallCard.card_faces.length < 2) return undefined;
        const backFace = scryfallCard.card_faces[1];
        let backImageId: string | undefined;
        if (options?.tryMpc) {
            try {
                const backInfo = { name: backFace.name, set: scryfallCard.set, number: scryfallCard.number, isToken: false };
                const mpcMatches = await findBestMpcMatches([backInfo]);
                if (mpcMatches.length > 0 && mpcMatches[0].imageUrl) {
                    backImageId = await addRemoteImage([mpcMatches[0].imageUrl], quantity, 'mpc');
                    if (backImageId) {
                        console.debug(`[ImportOrchestrator] Found MPC back face for ${options.cardName}: ${backFace.name}`);
                    }
                }
            } catch (e) {
                console.warn(`[ImportOrchestrator] Failed MPC back face lookup for ${options.cardName}`, e);
            }
        }
        if (!backImageId && backFace.imageUrl) {
            backImageId = await addRemoteImage([backFace.imageUrl], quantity, ImageSource.Scryfall);
        }
        return backImageId ? { imageId: backImageId, name: backFace.name } : undefined;
    }

    /**
     * Main entry point. Takes a raw list of intents, buckets them by strategy,
     * and executes them (potentially in parallel or sequence).
     */
    static async process(intents: ImportIntent[], options: OrchestratorOptions = {}) {
        const { onProgress, onComplete } = options;
        const total = intents.length;
        let processed = 0;

        const reportProgress = (inc: number = 0) => {
            processed += inc;
            onProgress?.(Math.min(processed, total), total);
        };

        // Snapshot settings once at start for consistency across entire import
        const settings: ImportSettings = options.settings ?? {
            preferredArtSource: useSettingsStore.getState().preferredArtSource,
            globalLanguage: useSettingsStore.getState().globalLanguage ?? 'en',
            autoImportTokens: useSettingsStore.getState().autoImportTokens,
            projectId: useProjectStore.getState().currentProjectId!,
            favoriteScryfallSets: getTcgPrefs(
                useUserPreferencesStore.getState().preferences,
                useSettingsStore.getState().activeTcg ?? 'mtg'
            ).favoriteSets,
            activeTcg: useSettingsStore.getState().activeTcg ?? 'mtg',
        };

        if (!settings.projectId) throw new Error("No active project");

        // 1. Bucket Intents
        const directIntents: ImportIntent[] = [];
        const mpcSearchIntents: ImportIntent[] = [];
        const scryfallSearchIntents: ImportIntent[] = [];

        for (const intent of intents) {
            // Priority 1: Direct / Explicit Identity
            if (intent.preloadedData || intent.mpcId || intent.localImageId) {
                directIntents.push(intent);
                continue;
            }

            // Priority 2: Text Search (MPC Preference) - use snapshotted settings
            const preference = intent.sourcePreference ?? settings.preferredArtSource;
            if (preference === 'mpc') {
                mpcSearchIntents.push(intent);
                continue;
            }

            // Fallback: Text Search (Scryfall)
            scryfallSearchIntents.push(intent);
        }

        // Execute strategies in parallel (they don't depend on each other)
        const tasks: Promise<void>[] = [];

        if (directIntents.length > 0) {
            tasks.push(this.executeDirect(directIntents, settings.projectId).then(() => reportProgress(directIntents.length)));
        }
        if (mpcSearchIntents.length > 0) {
            tasks.push(this.executeStream(mpcSearchIntents, 'mpc', options, reportProgress, settings));
        }
        if (scryfallSearchIntents.length > 0) {
            tasks.push(this.executeStream(scryfallSearchIntents, 'scryfall', options, reportProgress, settings));
        }

        await Promise.all(tasks);

        onProgress?.(total, total);
        onComplete?.();
    }

    /**
     * Handles intents that have known data (Preloaded or MPC ID).
     * Shows placeholder cards immediately, then updates with images in background.
     */
    private static async executeDirect(intents: ImportIntent[], projectId: string) {
        if (intents.length === 0) return;

        // Step 1: Add placeholder cards IMMEDIATELY (shows loading spinners in UI)
        const placeholderCards = intents.flatMap(intent => {
            const quantity = intent.quantity ?? 1;
            // Clean name for display (strip MPC annotations)
            const cleanedName = parseLineToIntent(intent.name).name;

            return Array.from({ length: quantity }, () => ({
                name: intent.preloadedData?.name ?? cleanedName,
                set: intent.preloadedData?.set ?? intent.set,
                number: intent.preloadedData?.number ?? intent.number,
                lang: intent.preloadedData?.lang ?? 'en',
                isUserUpload: !!intent.localImageId,
                imageId: intent.localImageId ?? undefined, // Use local ID if available, else undefined
                isToken: intent.isToken,
                category: intent.category,
                projectId,
                order: intent.order, // Use explicit order if provided
                source: intent.localImageId ? ImageSource.UploadLibrary : (intent.mpcId ? ImageSource.MPC : (intent.preloadedData ? ImageSource.Scryfall : undefined)),
            }));
        });

        const addedCards = await undoableAddCards(placeholderCards);

        // Step 2: Resolve images and update cards in background (non-blocking)
        const updateCardsWithImages = async () => {
            const { db } = await import('../db');

            // Step 2a: Batch fetch metadata for all MPC cards that need enrichment
            // Gather unique card names for MPC and Local Image intents to fetch all metadata in one request
            const mpcIntentNames = intents
                .filter(intent => (intent.mpcId || intent.localImageId) && !intent.preloadedData)
                .map(intent => parseLineToIntent(intent.name).name)
                .filter(name => name); // Filter out empty names

            const uniqueMpcNames = [...new Set(mpcIntentNames)];

            // Fetch all metadata in one batch request
            const metadataCache = uniqueMpcNames.length > 0
                ? await fetchCardsMetadataBatch(uniqueMpcNames)
                : new Map();

            // Step 2b: Process each intent using the cached metadata
            let cardIndex = 0;

            for (const intent of intents) {
                const quantity = intent.quantity ?? 1;
                const cardUuids = addedCards.slice(cardIndex, cardIndex + quantity).map(c => c.uuid);
                cardIndex += quantity;

                try {
                    let imageId: string | undefined;
                    let hasBuiltInBleed: boolean | undefined = undefined;
                    let needsEnrichment = false;
                    let scryfallMetadata: {
                        colors?: string[];
                        cmc?: number;
                        type_line?: string;
                        rarity?: string;
                        mana_cost?: string;
                        token_parts?: CardOption['token_parts'];
                    } | undefined;
                    let dfcBackInfo: { imageId: string; name: string } | undefined;

                    // Case 1: Local Image (Custom Upload)
                    if (intent.localImageId) {
                        imageId = intent.localImageId;
                        needsEnrichment = true;
                        hasBuiltInBleed = intent.preloadedData?.hasBuiltInBleed;

                        // Try to enrich DFC metadata for local images (e.g. from Advanced Search)
                        const cleanedName = parseLineToIntent(intent.name).name;
                        if (cleanedName) {
                            const scryfallCard = metadataCache.get(cleanedName.toLowerCase());
                            if (scryfallCard) {
                                scryfallMetadata = ImportOrchestrator.extractScryfallMetadata(scryfallCard);
                                dfcBackInfo = await ImportOrchestrator.resolveDfcBack(
                                    scryfallCard, quantity, { tryMpc: true, cardName: intent.name },
                                );
                            }
                        }
                    }
                    // Case 2: Explicit MPC ID (XML or Manual)
                    else if (intent.mpcId) {
                        const url = getMpcAutofillImageUrl(intent.mpcId);
                        imageId = await addRemoteImage([url], quantity, 'mpc');
                        hasBuiltInBleed = true;

                        // DFC & Metadata Enrichment - use cached batch result
                        const cleanedName = parseLineToIntent(intent.name).name;
                        if (cleanedName) {
                            // Look up in batch cache first (fast path)
                            const scryfallCard = metadataCache.get(cleanedName.toLowerCase());
                            if (scryfallCard) {
                                scryfallMetadata = ImportOrchestrator.extractScryfallMetadata(scryfallCard);
                                dfcBackInfo = await ImportOrchestrator.resolveDfcBack(scryfallCard, quantity);
                            }
                        }
                    }
                    // Case 3: Preloaded Data with images (Scryfall)
                    else if (intent.preloadedData?.imageUrls && intent.preloadedData.imageUrls.length > 0) {
                        const data = intent.preloadedData;
                        imageId = await addRemoteImage(data.imageUrls!, quantity, ImageSource.Scryfall, data.prints);
                    }

                    // Update cards with resolved image data
                    if (imageId || scryfallMetadata) {
                        await db.transaction('rw', db.cards, async () => {
                            for (const uuid of cardUuids) {
                                await db.cards.update(uuid, {
                                    imageId,
                                    hasBuiltInBleed,
                                    needsEnrichment,
                                    ...(scryfallMetadata && {
                                        colors: scryfallMetadata.colors,
                                        cmc: scryfallMetadata.cmc,
                                        type_line: scryfallMetadata.type_line,
                                        rarity: scryfallMetadata.rarity,
                                        mana_cost: scryfallMetadata.mana_cost,
                                        token_parts: scryfallMetadata.token_parts,
                                        needs_token: (scryfallMetadata.token_parts?.length ?? 0) > 0,
                                    }),
                                    // For MPC cards, start with darken-off defaults but merge with intent overrides
                                    overrides: intent.mpcId
                                        ? { ...intent.cardOverrides }
                                        : (intent.cardOverrides ?? undefined),
                                    source: intent.localImageId ? ImageSource.UploadLibrary : (intent.mpcId ? ImageSource.MPC : ImageSource.Scryfall),
                                });
                            }
                        });
                    }

                    // Handle back cards
                    const explicitBackId = intent.linkedBackImageId;
                    if (explicitBackId) {
                        let backImageId = explicitBackId;
                        const backName = intent.linkedBackName || 'Back';

                        if (!backImageId.startsWith('cardback_')) {
                            const backUrl = getMpcAutofillImageUrl(backImageId);
                            backImageId = (await addRemoteImage([backUrl], quantity, 'mpc'))!;
                        }

                        await createLinkedBackCardsBulk(
                            cardUuids.map(uuid => ({
                                frontUuid: uuid,
                                backImageId: backImageId,
                                backName: backName,
                                options: { hasBuiltInBleed: true, usesDefaultCardback: intent.linkedBackSource === ImageSource.Cardback, source: intent.linkedBackSource }
                            }))
                        );
                    } else if (dfcBackInfo) {
                        await createLinkedBackCardsBulk(
                            cardUuids.map(uuid => ({
                                frontUuid: uuid,
                                backImageId: dfcBackInfo!.imageId,
                                backName: dfcBackInfo!.name,
                                options: { hasBuiltInBleed: false }
                            }))
                        );
                    }
                } catch (e) {
                    console.warn(`[ImportOrchestrator] Failed to resolve image for ${intent.name}:`, e);
                    // Mark as error state
                    const { db } = await import('../db');
                    await db.transaction('rw', db.cards, async () => {
                        for (const uuid of cardUuids) {
                            await db.cards.update(uuid, {
                                lookupError: 'Failed to load image'
                            });
                        }
                    });
                }
            }
        };

        updateCardsWithImages().catch(err =>
            console.error('[ImportOrchestrator] Background image resolution failed:', err)
        );
    }

    /**
     * Delegates to streamCards for fetching/batch processing.
     */
    private static async executeStream(
        intents: ImportIntent[],
        source: typeof ImageSource.MPC | typeof ImageSource.Scryfall,
        options: OrchestratorOptions,
        reportProgress: (n: number) => void,
        settings: ImportSettings
    ) {
        const cardInfos: CardInfo[] = intents.map(i => ({
            name: i.name,
            set: i.set,
            number: i.number,
            quantity: i.quantity,
            category: i.category,
            isToken: i.isToken,
            mpcIdentifier: i.mpcId, // Map mpcId -> mpcIdentifier
            overrides: i.cardOverrides, // Pass through card overrides for share import
            linkedBackImageId: i.linkedBackImageId,
            linkedBackName: i.linkedBackName,
            linkedBackSet: i.linkedBackSet, // New field for Scryfall back via share
            linkedBackNumber: i.linkedBackNumber, // New field for Scryfall back via share
            preferredImageId: i.preferredImageId, // Fidelity: Specific image ID
            order: i.order, // Fidelity: Specific order
        }));

        // Use settings from snapshot instead of re-fetching from store
        const language = settings.globalLanguage;

        // Use provided signal or create managed controller for cleanup capability
        let signal: AbortSignal;
        let managedController: AbortController | null = null;
        if (options.signal) {
            signal = options.signal;
        } else {
            managedController = new AbortController();
            this.streamControllers.add(managedController);
            signal = managedController.signal;
        }

        try {
            await streamCards({
                cardInfos,
                language,
                importType: 'scryfall',
                artSource: source,
                tcg: settings.activeTcg,
                signal,
                onComplete: () => {
                    reportProgress(intents.length);
                },
                projectId: settings.projectId,
                preferredSets: settings.favoriteScryfallSets,
            });
        } finally {
            // Clean up managed controller from the Set
            if (managedController) {
                this.streamControllers.delete(managedController);
            }
        }
    }

    /**
     * Resolves a single intent into CardOption data without adding it to the database.
     * Used by ArtworkModal to preview/apply changes to existing cards.
     */
    static async resolve(intent: ImportIntent, projectId: string): Promise<import("./cardConverter").ResolvedCardData> {
        const quantity = intent.quantity ?? 1;

        // Strategy 1: Preloaded Data
        if (intent.preloadedData) {
            let imageId: string | undefined;
            const data = intent.preloadedData;
            if (data.imageUrls && data.imageUrls.length > 0) {
                imageId = await addRemoteImage(data.imageUrls!, quantity, ImageSource.Scryfall, data.prints);
            }

            // DFC handling - extract back face info
            const hasDfcBack = data.card_faces && data.card_faces.length > 1;
            let backImageId: string | undefined;
            let backFaceName: string | undefined;

            if (hasDfcBack) {
                const backFace = data.card_faces![1];
                backFaceName = backFace.name;

                // Fetch back face image
                if (backFace.imageUrl) {
                    backImageId = await addRemoteImage([backFace.imageUrl], quantity, ImageSource.Scryfall);
                }
            }

            // Construct base card
            const baseCard = {
                name: data.name ?? intent.name,
                set: data.set ?? intent.set,
                number: data.number ?? intent.number,
                lang: data.lang ?? 'en',
                isUserUpload: false,
                imageId: imageId,
                colors: data.colors,
                cmc: data.cmc,
                type_line: data.type_line,
                rarity: data.rarity,
                mana_cost: data.mana_cost,
                token_parts: data.token_parts,
                needs_token: !!data.token_parts?.length,
                isToken: intent.isToken,
                category: intent.category,
                hasBuiltInBleed: false,
                needsEnrichment: false,
                source: ImageSource.Scryfall,
            };

            // Expand to quantity
            const cardsToAdd = Array.from({ length: quantity }, () => ({ ...baseCard }));

            // Create back card tasks for DFCs
            const backCardTasks = [];
            if (hasDfcBack && backImageId) {
                for (let i = 0; i < quantity; i++) {
                    backCardTasks.push({
                        frontIndex: i,
                        backImageId,
                        backName: backFaceName || 'Back',
                        options: { hasBuiltInBleed: false, source: ImageSource.Scryfall }
                    });
                }
            }

            // Inject projectId into cardsToAdd
            const scopedCardsToAdd = cardsToAdd.map(c => ({ ...c, projectId }));
            return { cardsToAdd: scopedCardsToAdd, backCardTasks };
        }

        // Strategy 2: MPC ID
        if (intent.mpcId) {
            const url = getMpcAutofillImageUrl(intent.mpcId);
            const imageId = await addRemoteImage([url], quantity, 'mpc');

            // Start with base MPC card
            const baseCard = {
                name: intent.name,
                set: intent.set,
                number: intent.number,
                lang: 'en',
                isUserUpload: false, // MPC art, not custom upload
                imageId: imageId,
                hasBuiltInBleed: true,
                needsEnrichment: true, // Auto-enrich later if immediate lookup fails
                isToken: intent.isToken,
                category: intent.category,
                projectId,
                // Fields to be populated from Scryfall
                colors: undefined as string[] | undefined,
                cmc: undefined as number | undefined,
                type_line: undefined as string | undefined,
                rarity: undefined as string | undefined,
                mana_cost: undefined as string | undefined,
                token_parts: undefined as TokenPart[] | undefined,
                needs_token: false,
                source: ImageSource.MPC,
            };

            const backCardTasks: { frontIndex: number; backImageId: string; backName: string, options?: { hasBuiltInBleed?: boolean, source?: ImageSource } }[] = [];

            // DFC & Metadata Enrichment
            try {
                // Fuzzy search/lookup
                const scryfallCard = await fetchCardWithPrints(intent.name, false, false);
                if (scryfallCard) {
                    // Enrich metadata
                    baseCard.needsEnrichment = false;
                    const meta = ImportOrchestrator.extractScryfallMetadata(scryfallCard);
                    Object.assign(baseCard, meta);
                    baseCard.needs_token = !!meta.token_parts?.length;
                    if (!intent.linkedBackImageId) {
                        const dfcBack = await ImportOrchestrator.resolveDfcBack(scryfallCard, quantity);
                        if (dfcBack) {
                            for (let i = 0; i < quantity; i++) {
                                backCardTasks.push({
                                    frontIndex: i,
                                    backImageId: dfcBack.imageId,
                                    backName: dfcBack.name,
                                    options: { hasBuiltInBleed: false, source: ImageSource.Scryfall }
                                });
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn(`[ImportOrchestrator.resolve] Failed to enrich MPC card ${intent.name}:`, e);
            }

            // Explicit Back handling (Priority 1)
            if (intent.linkedBackImageId) {
                // Clear any Scryfall-detected backs (since explicit overrides)
                backCardTasks.length = 0;

                let backImageId = intent.linkedBackImageId;
                const backName = intent.linkedBackName || 'Back';

                if (intent.linkedBackSource !== ImageSource.Cardback) {
                    const backUrl = getMpcAutofillImageUrl(backImageId);
                    backImageId = (await addRemoteImage([backUrl], quantity, 'mpc'))!;
                }

                for (let i = 0; i < quantity; i++) {
                    backCardTasks.push({
                        frontIndex: i,
                        backImageId,
                        backName,
                        options: { hasBuiltInBleed: true, source: intent.linkedBackSource }
                    });
                }
            }

            const cardsToAdd = Array.from({ length: quantity }, () => ({ ...baseCard }));
            return { cardsToAdd, backCardTasks };
        }

        // Strategy 3: Scryfall Search
        // Fetch data from Scryfall API
        let scryfallCard;
        if (intent.set && intent.number) {
            scryfallCard = await fetchCardBySetAndNumber(intent.set, intent.number);
        } else {
            // Fuzzy search
            scryfallCard = await fetchCardWithPrints(intent.name, false, true);
        }

        if (!scryfallCard) {
            throw new Error(`Card not found: ${intent.name}`);
        }

        return convertScryfallToCardOptions(scryfallCard, quantity, {
            category: intent.category,
            isToken: intent.isToken,
            projectId
        });
    }

    // -------------------------------------------------------------------------
    // Token Handling Methods
    // -------------------------------------------------------------------------

    /**
     * Normalize a string for case-insensitive, Unicode-aware comparison.
     * Handles: Æ→AE, accented chars, ligatures, etc.
     */
    private static normalizeString(s: string): string {
        return s
            .normalize('NFKD')                    // Decompose ligatures (Æ → A + combining E)
            .replace(/[\u0300-\u036f]/g, '')      // Remove combining diacritics
            .toLowerCase()
            .trim();
    }

    /**
     * Extract set/number from a Scryfall token URI
     * e.g., "https://api.scryfall.com/cards/t2xm/4" -> { set: "t2xm", number: "4" }
     */
    private static extractTokenPrintFromUri(uri?: string): { set?: string; number?: string } {
        if (!uri) return {};
        try {
            const u = new URL(uri);
            const parts = u.pathname.split("/").filter(Boolean);
            const cardsIdx = parts.findIndex((p) => p === "cards");
            if (cardsIdx >= 0 && parts[cardsIdx + 1] && parts[cardsIdx + 2]) {
                return { set: parts[cardsIdx + 1], number: parts[cardsIdx + 2] };
            }
        } catch {
            // Ignore parsing errors
        }
        return {};
    }

    /**
     * Fetches token_parts data for cards that don't have it (e.g., MPC imports).
     * Calls /api/cards/images/tokens in batches and updates the DB.
     * @param signal - Abort signal
     * @param preloadedCards - Optional pre-fetched cards to avoid redundant DB query
     */
    static async enrichTokenData(signal?: AbortSignal, preloadedCards?: CardOption[]): Promise<void> {
        const projectId = useProjectStore.getState().currentProjectId;
        if (!projectId) return;

        const cards = preloadedCards ?? await db.cards
            .where('projectId').equals(projectId)
            .toArray();

        // Find cards that don't have token_parts yet (likely MPC imports)
        const cardsNeedingTokenLookup = cards.filter(c =>
            c.token_parts === undefined &&
            !c.linkedFrontId && // Skip back cards
            !c.type_line?.toLowerCase().includes('token') // Skip tokens
        );

        if (cardsNeedingTokenLookup.length === 0) return;

        const CHUNK_SIZE = IMPORT_CONFIG.TOKEN_ENRICH_CHUNK_SIZE;

        for (let i = 0; i < cardsNeedingTokenLookup.length; i += CHUNK_SIZE) {
            if (signal?.aborted) break;

            const chunk = cardsNeedingTokenLookup.slice(i, i + CHUNK_SIZE);

            try {
                const tokenResult = await fetchTokenParts(
                    chunk.map(c => ({ name: c.name, set: c.set, number: c.number })),
                    signal
                );

                if (tokenResult.success && tokenResult.data.length > 0) {
                    await db.transaction('rw', db.cards, async () => {
                        for (const data of tokenResult.data) {
                            if (data.token_parts !== undefined) {
                                const matchingCards = chunk.filter(c =>
                                    c.name.toLowerCase() === data.name.toLowerCase()
                                );
                                for (const card of matchingCards) {
                                    await db.cards.update(card.uuid, {
                                        token_parts: data.token_parts,
                                        needs_token: data.token_parts!.length > 0,
                                    });
                                }
                            }
                        }
                    });
                } else if (!tokenResult.success) {
                    // Log error but continue processing other chunks
                    console.warn(`[TokenEnrich] Chunk failed: ${tokenResult.error.message}`);
                }
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') throw e;
                console.error("Token fetch chunk failed", e);
            }
        }
    }

    /**
     * Computes missing tokens and imports them.
     * @param options.skipExisting If true, skip tokens already in collection (for auto-import)
     * @returns The ImportIntents that were processed
     */
    static async importMissingTokens(options: {
        skipExisting?: boolean;
        signal?: AbortSignal;
        onComplete?: () => void;
        onNoTokens?: () => void;
    } = {}): Promise<ImportIntent[]> {
        const { skipExisting = false, signal, onComplete, onNoTokens } = options;

        const projectId = useProjectStore.getState().currentProjectId;
        if (!projectId) {
            onNoTokens?.();
            return [];
        }

        // Fetch cards once, share between enrichTokenData and token computation
        const cards = await db.cards
            .where('projectId').equals(projectId)
            .toArray();
        if (cards.length === 0) {
            onNoTokens?.();
            return [];
        }

        // Enrich cards that don't have token_parts, passing the already-fetched cards
        await this.enrichTokenData(signal, cards);

        // Re-fetch cards from DB to get updated token_parts after enrichment
        const enrichedCards = await db.cards
            .where('projectId').equals(projectId)
            .toArray();

        // Build a set of existing card names to avoid re-fetching tokens already in collection
        const existingCardNames = new Set<string>();
        if (skipExisting) {
            for (const card of enrichedCards) {
                if (card.name) {
                    existingCardNames.add(card.name.toLowerCase());
                }
            }
        }

        // Track seen tokens by normalized name only (set+number are preferences, not identity)
        const seenTokenNames = new Set<string>();
        const tokensToFetch: ImportIntent[] = [];

        for (const card of enrichedCards) {
            // Skip token cards themselves to avoid chaining into their token_parts
            if (card.type_line?.toLowerCase().includes("token")) continue;

            // Skip cards without token_parts
            if (!card.token_parts || card.token_parts.length === 0) continue;

            for (const token of card.token_parts) {
                if (!token.name) continue;

                // Skip if this token is already in the collection (only for auto-import)
                if (skipExisting && existingCardNames.has(token.name.toLowerCase())) continue;

                // Normalize and deduplicate by name only (most efficient)
                const normalizedName = this.normalizeString(token.name);
                if (seenTokenNames.has(normalizedName)) continue;
                seenTokenNames.add(normalizedName);

                const { set, number } = this.extractTokenPrintFromUri(token.uri);
                tokensToFetch.push({
                    name: token.name,
                    set,
                    number,
                    quantity: 1,
                    isToken: true,
                });
            }
        }

        if (tokensToFetch.length === 0) {
            onNoTokens?.();
            return [];
        }

        // Import the tokens
        await this.process(tokensToFetch, {
            signal,
            onComplete
        });

        return tokensToFetch;
    }
}


