import express, { type Request, type Response } from "express";
import axios from "axios";
import { getCachedMpcSearch, cacheMpcSearch, type MpcCard } from "../db/mpcSearchCache.js";
import { debugLog } from "../utils/debug.js";

const MPC_AUTOFILL_BASE = "https://mpcfill.com";

const mpcAutofillRouter = express.Router();
// Search settings - API requires sourceSettings
// Base settings without fuzzySearch (will be set per-request)
const getSearchSettings = (fuzzySearch: boolean = true) => ({
    searchTypeSettings: {
        filterCardbacks: false,
        fuzzySearch,
    },
    sourceSettings: {
        sources: Array.from({ length: 264 }, (_, i) => [i + 1, true] as [number, boolean]),
    },
    filterSettings: {
        excludesTags: ["NSFW"],
        includesTags: [],
        languages: ["EN"],
        maximumDPI: 1500,
        maximumSize: 30,
        minimumDPI: 0,
    },
});


interface MpcBatchSearchRequest {
    queries: string[];
    cardType?: "CARD" | "CARDBACK" | "TOKEN";
}

interface MpcIdsRequest {
    query: string | null; // Allow null/empty for browse-all (MPC auto-load)
    cardType?: "CARD" | "CARDBACK" | "TOKEN";
    fuzzySearch?: boolean;
}

interface MpcDetailsRequest {
    cardIdentifiers: string[];
}

interface EditorSearchResponse {
    results: Record<string, Record<string, string[]>>;
}

interface CardsResponse {
    results: Record<string, {
        identifier: string;
        name: string;
        smallThumbnailUrl: string;
        mediumThumbnailUrl: string;
        dpi: number;
        tags: string[];
        sourceName: string;
        source: string;
        extension: string;
        size: number;
    }>;
}

// Standardize DPI to match the buckets used across the frontend
function bucketDpi(dpi: number): number {
    if (dpi >= 1150) return 1200;
    if (dpi >= 750) return 800;
    if (dpi >= 550) return 600;
    return 300;
}

// Helper to fetch cards in batches with retry on 5xx errors
async function fetchCardsData(identifiers: string[]): Promise<Record<string, MpcCard>> {
    const BATCH_SIZE = 1000;
    const MAX_RETRIES = 3;
    const cardMap: Record<string, MpcCard> = {};

    for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
        const batch = identifiers.slice(i, i + BATCH_SIZE);
        let lastError: Error | null = null;

        // Retry with exponential backoff for 5xx errors
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const cardsResponse = await axios.post<CardsResponse>(
                    `${MPC_AUTOFILL_BASE}/2/cards/`,
                    { cardIdentifiers: batch },
                    {
                        headers: { "Content-Type": "application/json" },
                        timeout: 30000,
                    }
                );

                Object.values(cardsResponse.data.results || {}).forEach(card => {
                    if (card) {
                        cardMap[card.identifier] = {
                            identifier: card.identifier,
                            name: card.name,
                            smallThumbnailUrl: card.smallThumbnailUrl,
                            mediumThumbnailUrl: card.mediumThumbnailUrl,
                            dpi: bucketDpi(card.dpi || 300),
                            tags: card.tags || [],
                            sourceName: card.sourceName,
                            source: card.source,
                            extension: card.extension,
                            size: card.size,
                        };
                    }
                });
                break; // Success - exit retry loop
            } catch (err: unknown) {
                lastError = err instanceof Error ? err : new Error(String(err));
                const axiosError = err as { response?: { status?: number } };
                const status = axiosError?.response?.status || 0;

                // Only retry on 5xx server errors
                if (status >= 500 && attempt < MAX_RETRIES) {
                    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                    console.warn(`[MPC] 5xx error (${status}), retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw lastError;
                }
            }
        }
    }
    return cardMap;
}

let prebuiltCardbacksCache: Record<string, MpcCard> | null = null;
let prebuiltCardbacksTimestamp: number = 0;
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

async function getPrebuiltCardbacks() {
    if (prebuiltCardbacksCache && (Date.now() - prebuiltCardbacksTimestamp < CACHE_TTL)) {
        return prebuiltCardbacksCache;
    }

    try {
        // Use the dedicated /2/cardbacks/ endpoint which correctly retrieves all cardback IDs
        const searchResponse = await axios.post<{ cardbacks: string[] }>(
            `${MPC_AUTOFILL_BASE}/2/cardbacks/`,
            {
                searchSettings: getSearchSettings(true),
            },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 30000,
            }
        );

        const identifiers: string[] = searchResponse.data.cardbacks || [];

        if (identifiers.length > 0) {
            const cardMap = await fetchCardsData(identifiers);
            prebuiltCardbacksCache = cardMap;
            prebuiltCardbacksTimestamp = Date.now();
            debugLog(`[MPC Autofill] Prebuilt cardbacks cache with ${Object.keys(cardMap).length} items`);
        }
        return prebuiltCardbacksCache || {};
    } catch (err) {
        console.error("Failed to prebuild cardbacks cache", err);
        return prebuiltCardbacksCache || {};
    }
}

// Background prebuild on startup
getPrebuiltCardbacks().catch(console.error);

/**
 * Endpoint to get the prebuilt list of all cardbacks.
 */
mpcAutofillRouter.get("/cardbacks", async (_req: Request, res: Response) => {
    try {
        const cardMap = await getPrebuiltCardbacks();
        return res.json({ results: cardMap });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MPC Autofill] Cardbacks fetch error:", msg);
        return res.status(502).json({ error: "Failed to fetch cardbacks from MPC", details: msg });
    }
});

/**
 * Combined search endpoint that:
 * 1. Calls MPC Autofill /2/editorSearch/ to get identifiers
 * 2. Calls /2/cards/ to get full card data
 * 3. Returns combined results
 */
/**
 * Endpoint to get only card identifiers for a query.
 * Supports "browse all" if query is empty/null.
 */
mpcAutofillRouter.post("/ids", async (req: Request<unknown, unknown, MpcIdsRequest>, res: Response) => {
    const { query, cardType = "CARD", fuzzySearch = true } = req.body;

    try {
        // If query is null/empty, we interpret this as "browse all"
        // MPC Autofill API accepts empty string for browse all in some contexts, 
        // but often it's better to search for a space or common character if true browse isn't supported.
        // However, /2/editorSearch with an empty query often returns nothing.
        // For cardbacks, we might need a generic query like " " or "." if true browse fails.
        const normalizedQuery = (query || "").toLowerCase().trim();

        debugLog(`[MPC Autofill] ID search for "${normalizedQuery}" type=${cardType} fuzzy=${fuzzySearch}`);

        const searchResponse = await axios.post<EditorSearchResponse>(
            `${MPC_AUTOFILL_BASE}/2/editorSearch/`,
            {
                queries: [{ query: normalizedQuery, cardType }],
                searchSettings: getSearchSettings(fuzzySearch),
            },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 15000,
            }
        );

        const results = searchResponse.data.results;
        const identifiers: string[] = [];

        if (results) {
            // Check for normalized match
            if (results[normalizedQuery]?.[cardType]) {
                identifiers.push(...results[normalizedQuery][cardType]);
            } else {
                // Return whatever matches the cardType
                for (const value of Object.values(results)) {
                    if (value[cardType]) {
                        identifiers.push(...value[cardType]);
                        // We only take the first set of matches for single query
                        break;
                    }
                }
            }
        }

        return res.json({ identifiers });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MPC Autofill] IDs search error:", msg);
        return res.status(502).json({ error: "Failed to fetch identifiers from MPC", details: msg });
    }
});

/**
 * Endpoint to fetch full card details for a batch of identifiers.
 */
mpcAutofillRouter.post("/details", async (req: Request<unknown, unknown, MpcDetailsRequest>, res: Response) => {
    const { cardIdentifiers } = req.body;

    if (!cardIdentifiers || !Array.isArray(cardIdentifiers) || cardIdentifiers.length === 0) {
        return res.status(400).json({ error: "Missing or invalid cardIdentifiers array" });
    }

    try {
        const cardMap = await fetchCardsData(cardIdentifiers);
        return res.json({ results: cardMap });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MPC Autofill] Details fetch error:", msg);
        return res.status(502).json({ error: "Failed to fetch card details from MPC", details: msg });
    }
});

/**
 * Batch search endpoint
 */
mpcAutofillRouter.post("/batch-search", async (req: Request<unknown, unknown, MpcBatchSearchRequest>, res: Response) => {
    const { queries, cardType = "CARD" } = req.body;

    if (!queries || !Array.isArray(queries) || queries.length === 0) {
        return res.status(400).json({ error: "Missing or invalid queries array" });
    }

    try {
        const finalResults: Record<string, MpcCard[]> = {};
        const uncachedQueries: string[] = [];

        // Check server cache first for each query (batch always uses fuzzy=true)
        for (const q of queries) {
            const cacheKey = `${q.toLowerCase().trim()}:fuzzy`;
            const cached = getCachedMpcSearch(cacheKey, cardType);
            if (cached) {
                finalResults[q] = cached;
            } else {
                uncachedQueries.push(q);
            }
        }

        const cacheHits = queries.length - uncachedQueries.length;
        if (cacheHits > 0) {
            debugLog(`[MPC Autofill] Batch: ${cacheHits} cache hits, ${uncachedQueries.length} misses`);
        }

        if (uncachedQueries.length === 0) {
            return res.json({ results: finalResults });
        }

        debugLog(`[MPC Autofill] Batch fetching ${uncachedQueries.length} uncached queries, type: ${cardType}`);

        // Step 1: Search for card identifiers (only uncached queries)
        const searchResponse = await axios.post<EditorSearchResponse>(
            `${MPC_AUTOFILL_BASE}/2/editorSearch/`,
            {
                queries: uncachedQueries.map(q => ({ query: q.toLowerCase(), cardType })),
                searchSettings: getSearchSettings(true), // Always fuzzy for batch imports
            },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 30000,
            }
        );

        // Map queries to identifiers
        const queryToIds: Record<string, string[]> = {};
        const allIdentifiers = new Set<string>();

        const results = searchResponse.data.results || {};
        const resultsLower = Object.fromEntries(
            Object.entries(results).map(([k, v]) => [k.toLowerCase(), v])
        );

        uncachedQueries.forEach(q => {
            const qLower = q.toLowerCase();
            const ids: string[] = [];

            // Try match in results
            const match = resultsLower[qLower];
            if (match && match[cardType]) {
                ids.push(...match[cardType]);
            }

            if (ids.length > 0) {
                queryToIds[q] = ids; // Use original query as key
                ids.forEach(id => allIdentifiers.add(id));
            }
        });

        debugLog(`[MPC Autofill] Found ${allIdentifiers.size} unique identifiers across ${Object.keys(queryToIds).length} matched queries`);

        if (allIdentifiers.size === 0) {
            return res.json({ results: finalResults });
        }

        // Step 2: Fetch full card data
        const cardMap = await fetchCardsData(Array.from(allIdentifiers));

        // Step 3: Construct response mapping query -> cards and cache results
        Object.entries(queryToIds).forEach(([query, ids]) => {
            const cards = ids
                .map(id => cardMap[id])
                .filter((c): c is MpcCard => c !== undefined);
            finalResults[query] = cards;

            // Cache the results for this query
            if (cards.length > 0) {
                const cacheKey = `${query.toLowerCase().trim()}:fuzzy`;
                cacheMpcSearch(cacheKey, cardType, cards);
            }
        });

        return res.json({ results: finalResults });

    } catch (err: unknown) {
        // Enhanced error logging for axios errors
        if (axios.isAxiosError(err)) {
            console.error("[MPC Autofill] Batch Search error:", {
                status: err.response?.status,
                message: err.message,
            });
            return res.status(502).json({
                error: "Failed to batch search MPC Autofill",
                details: `${err.response?.status || 'unknown'}: ${err.message}`
            });
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MPC Autofill] Batch Search error:", msg);
        return res.status(502).json({ error: "Failed to batch search MPC Autofill", details: msg });
    }
});

export { mpcAutofillRouter };
