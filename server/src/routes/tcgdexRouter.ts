import { Router, type Request, type Response } from "express";
import axios from "axios";
import crypto from "crypto";
import { getDatabase } from "../db/db.js";
import { debugLog } from "../utils/debug.js";

const router = Router();

const TCGDEX_BASE = "https://api.tcgdex.net/v2";

function tcgdexAxiosForLang(lang: string) {
    return axios.create({
        baseURL: `${TCGDEX_BASE}/${lang}`,
        headers: {
            "User-Agent": "Proxxied/1.0 (https://github.com/kclipsto/proxies-at-home)",
            "Accept": "application/json",
        },
    });
}

// Rate limiting: 150ms between requests to avoid TCGdex CDN/GraphQL throttling
let lastRequestTime = 0;
const REQUEST_DELAY_MS = 150;

async function rateLimitedRequest<T>(
    requestFn: () => Promise<{ data: T }>
): Promise<T> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < REQUEST_DELAY_MS) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS - elapsed));
    }
    lastRequestTime = Date.now();
    const response = await requestFn();
    return response.data;
}

const CACHE_TTL = {
    search: 24 * 60 * 60 * 1000,
    card: 7 * 24 * 60 * 60 * 1000,
    sets: 24 * 60 * 60 * 1000,
};

const CACHE_VERSION = "v2";

function getCacheKey(endpoint: string, params: Record<string, string>): string {
    const sortedParams = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join("&");
    return crypto.createHash("sha256").update(`tcgdex:${CACHE_VERSION}:${endpoint}:${sortedParams}`).digest("hex");
}

function getFromCache(endpoint: string, queryHash: string): unknown | null {
    try {
        const db = getDatabase();
        const row = db
            .prepare(
                "SELECT response, expires_at FROM scryfall_cache WHERE endpoint = ? AND query_hash = ?"
            )
            .get(`tcgdex:${endpoint}`, queryHash) as { response: string; expires_at: number } | undefined;

        if (row && row.expires_at > Date.now()) {
            debugLog(`[TCGdex] Cache HIT for ${endpoint}:${queryHash.slice(0, 8)}`);
            return JSON.parse(row.response);
        }
        return null;
    } catch {
        return null;
    }
}

function storeInCache(endpoint: string, queryHash: string, response: unknown, ttlMs: number): void {
    try {
        const db = getDatabase();
        const now = Date.now();
        db.prepare(
            `INSERT OR REPLACE INTO scryfall_cache (endpoint, query_hash, response, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?)`
        ).run(`tcgdex:${endpoint}`, queryHash, JSON.stringify(response), now, now + ttlMs);
    } catch (err) {
        debugLog(`[TCGdex] Cache store error:`, err);
    }
}

interface TcgdexCardBrief {
    id: string;
    localId: string;
    name: string;
    image?: string;
}

interface TcgdexCardDetail {
    id: string;
    localId: string;
    name: string;
    image?: string;
    rarity?: string;
    set?: {
        id: string;
        name: string;
    };
}

function mapTcgdexCard(card: TcgdexCardBrief | TcgdexCardDetail): object {
    const dashIdx = card.id.lastIndexOf("-");
    const setCode = dashIdx >= 0 ? card.id.slice(0, dashIdx) : card.id;
    const cardNumber = dashIdx >= 0 ? card.id.slice(dashIdx + 1) : card.localId;

    const imageUrls: string[] = [];
    if (card.image) {
        imageUrls.push(`${card.image}/high.png`);
    }

    const rarity = (card as TcgdexCardDetail).rarity;

    return {
        name: card.name,
        set: setCode,
        number: cardNumber,
        imageUrls,
        lang: "en",
        rarity,
    };
}

router.get("/search", async (req: Request, res: Response) => {
    const name = req.query.name as string;
    const lang = ((req.query.lang as string) || "en").toLowerCase();
    if (!name || name.trim().length < 2) {
        return res.json({ data: [] });
    }

    const params = { name: name.trim(), lang };
    const queryHash = getCacheKey("search", params);
    const cached = getFromCache("search", queryHash);
    if (cached) {
        return res.json(cached);
    }

    try {
        const data = await rateLimitedRequest(() =>
            tcgdexAxiosForLang(lang).get<TcgdexCardBrief[]>("/cards", {
                params: { name: params.name },
            })
        );

        const cards = (data || []).map(mapTcgdexCard);
        const result = { data: cards };
        storeInCache("search", queryHash, result, CACHE_TTL.search);
        return res.json(result);
    } catch (err) {
        debugLog("[TCGdex] Search error:", err);
        if (axios.isAxiosError(err) && err.response?.status === 404) {
            const empty = { data: [] };
            storeInCache("search", queryHash, empty, CACHE_TTL.search);
            return res.json(empty);
        }
        return res.status(500).json({ error: "Failed to search Pokemon cards" });
    }
});

router.get("/card/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    const lang = ((req.query.lang as string) || "en").toLowerCase();
    if (!id) {
        return res.status(400).json({ error: "Missing card id" });
    }

    const queryHash = getCacheKey("card", { id, lang });
    const cached = getFromCache("card", queryHash);
    if (cached) {
        return res.json(cached);
    }

    try {
        const data = await rateLimitedRequest(() =>
            tcgdexAxiosForLang(lang).get<TcgdexCardDetail>(`/cards/${id}`)
        );
        const card = mapTcgdexCard(data);
        storeInCache("card", queryHash, card, CACHE_TTL.card);
        return res.json(card);
    } catch (err) {
        debugLog("[TCGdex] Card fetch error:", err);
        if (axios.isAxiosError(err) && err.response) {
            return res.status(err.response.status).json({ error: "Card not found" });
        }
        return res.status(500).json({ error: "Failed to fetch Pokemon card" });
    }
});

router.get("/prints", async (req: Request, res: Response) => {
    const name = req.query.name as string;
    const lang = ((req.query.lang as string) || "en").toLowerCase();
    if (!name) {
        return res.status(400).json({ error: "Missing name parameter" });
    }

    const params = { name: name.trim(), lang };
    const queryHash = getCacheKey("prints", params);
    const cached = getFromCache("prints", queryHash);
    if (cached) {
        return res.json(cached);
    }

    try {
        const data = await rateLimitedRequest(() =>
            tcgdexAxiosForLang(lang).get<TcgdexCardBrief[]>("/cards", {
                params: { name: params.name },
            })
        );

        const cards = data || [];
        const prints = cards
            .filter((c) => c.image)
            .map((c) => {
                const dashIdx = c.id.lastIndexOf("-");
                const setCode = dashIdx >= 0 ? c.id.slice(0, dashIdx) : c.id;
                const cardNumber = dashIdx >= 0 ? c.id.slice(dashIdx + 1) : c.localId;
                return {
                    imageUrl: `${c.image}/high.png`,
                    set: setCode,
                    number: cardNumber,
                    lang: "en",
                };
            });

        const result = { name: params.name, lang: "en", total: prints.length, prints };
        storeInCache("prints", queryHash, result, CACHE_TTL.search);
        return res.json(result);
    } catch (err) {
        debugLog("[TCGdex] Prints error:", err);
        if (axios.isAxiosError(err) && err.response?.status === 404) {
            const empty = { name, lang: "en", total: 0, prints: [] };
            storeInCache("prints", queryHash, empty, CACHE_TTL.search);
            return res.json(empty);
        }
        return res.status(500).json({ error: "Failed to fetch Pokemon prints" });
    }
});

interface TcgdexSetBrief {
    id: string;
    name: string;
    cardCount?: { total?: number; official?: number };
}

router.get("/sets", async (req: Request, res: Response) => {
    const lang = ((req.query.lang as string) || "en").toLowerCase();
    const queryHash = getCacheKey("sets", { lang });
    const cached = getFromCache("sets", queryHash);
    if (cached) return res.json(cached);

    try {
        const data = await rateLimitedRequest(() =>
            tcgdexAxiosForLang(lang).get<TcgdexSetBrief[]>("/sets")
        );
        const sets = (data || []).map((s) => ({
            id: s.id,
            name: s.name,
            card_count: s.cardCount?.total ?? 0,
        }));
        const result = { data: sets };
        storeInCache("sets", queryHash, result, CACHE_TTL.sets);
        return res.json(result);
    } catch (err) {
        debugLog("[TCGdex] Sets error:", err);
        return res.status(500).json({ error: "Failed to fetch Pokemon sets" });
    }
});

export { router as tcgdexRouter };
