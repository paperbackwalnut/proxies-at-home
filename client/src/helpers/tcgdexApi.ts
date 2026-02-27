import axios from "axios";
import { API_BASE } from "@/constants";
import type { ScryfallCard, PrintInfo } from "../../../shared/types";

const tcgdexApi = axios.create({
  baseURL: `${API_BASE}/api/tcgdex`,
});

function translateAxiosError(error: unknown): string {
  if (axios.isCancel(error)) return "Request canceled.";
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) return "No cards found.";
    if (error.response && error.response.status >= 500)
      return "Server error. Please try again later.";
    if (error.request) return "Could not connect to the server.";
  }
  return "An unexpected error occurred.";
}

async function apiCall<T>(request: () => Promise<{ data: T }>): Promise<T> {
  try {
    const response = await request();
    return response.data;
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    throw new Error(translateAxiosError(error));
  }
}

export async function searchPokemonCards(
  name: string,
  signal?: AbortSignal,
  lang = "en"
): Promise<ScryfallCard[]> {
  const data = await apiCall<{ data: ScryfallCard[] }>(() =>
    tcgdexApi.get("/search", { params: { name, lang }, signal })
  );
  return data.data || [];
}

export async function fetchPokemonPrints(
  name: string,
  signal?: AbortSignal,
  lang = "en"
): Promise<{ name: string; total: number; prints: PrintInfo[] }> {
  return apiCall(() => tcgdexApi.get("/prints", { params: { name, lang }, signal }));
}

export interface PokemonSet {
  id: string;
  name: string;
  card_count: number;
}

let pokemonSetsCache: PokemonSet[] | null = null;
let pendingPokemonSetsRequest: Promise<PokemonSet[]> | null = null;

export async function fetchPokemonSets(lang = "en"): Promise<PokemonSet[]> {
  if (pokemonSetsCache) return pokemonSetsCache;
  if (!pendingPokemonSetsRequest) {
    pendingPokemonSetsRequest = apiCall<{ data: PokemonSet[] }>(() =>
      tcgdexApi.get("/sets", { params: { lang } })
    ).then((data) => {
      pokemonSetsCache = data.data || [];
      return pokemonSetsCache;
    }).finally(() => {
      pendingPokemonSetsRequest = null;
    });
  }
  return pendingPokemonSetsRequest;
}

export async function fetchPokemonCard(
  id: string,
  signal?: AbortSignal,
  lang = "en"
): Promise<ScryfallCard> {
  return apiCall(() => tcgdexApi.get(`/card/${encodeURIComponent(id)}`, { params: { lang }, signal }));
}
