import Dexie, { type Table } from 'dexie';
import { ImageSource, type CardOption, type PrintInfo } from '../../shared/types';
import { generateUUID } from './helpers/uuid';

// Define a type for the image data to be stored
export interface Image {
  id: string; // hash for custom, URL for scryfall
  refCount: number;
  source?: ImageSource; // Explicit source tracking (lazy-migrated from ID parsing)
  originalBlob?: Blob;

  // Normal (non-darkened) versions
  displayBlob?: Blob;
  displayDpi?: number;
  displayBleedWidth?: number;

  exportBlob?: Blob;
  exportDpi?: number;
  exportBleedWidth?: number;

  // Generation Metadata (for invalidating cache on setting changes)
  generatedHasBuiltInBleed?: boolean;
  generatedBleedMode?: string;

  // Darkened versions for each mode (instant toggle)
  // Mode 1: Darken All (legacy threshold)
  displayBlobDarkenAll?: Blob;
  exportBlobDarkenAll?: Blob;
  // Mode 2: Contrast Edges (adaptive edge-only)
  displayBlobContrastEdges?: Blob;
  exportBlobContrastEdges?: Blob;
  // Mode 3: Contrast Full (adaptive full-card)
  displayBlobContrastFull?: Blob;
  exportBlobContrastFull?: Blob;
  // Legacy field for backwards compatibility (maps to contrast-edges)
  displayBlobDarkened?: Blob;
  exportBlobDarkened?: Blob;

  // For Card Editor (M1) and Full Canvas (M2)
  baseDisplayBlob?: Blob;      // Processed image, NO darkening applied
  baseExportBlob?: Blob;       // Same but export resolution
  distanceFieldBlob?: Blob;    // Edge distance texture from JFA
  darknessFactor?: number;     // 0-1, pre-computed from histogram

  sourceUrl?: string;
  imageUrls?: string[];

  // Per-print metadata for artwork selection
  prints?: PrintInfo[];
}

// Cardback library images (separate from card images)
// Note: Cardbacks don't need refCount - they're only deleted explicitly via UI
export interface Cardback {
  id: string;
  originalBlob?: Blob;

  // Processed versions
  displayBlob?: Blob;
  displayDpi?: number;
  displayBleedWidth?: number;
  exportBlob?: Blob;
  exportDpi?: number;
  exportBleedWidth?: number;

  // Darkened versions for each mode
  displayBlobDarkenAll?: Blob;
  exportBlobDarkenAll?: Blob;
  displayBlobContrastEdges?: Blob;
  exportBlobContrastEdges?: Blob;
  displayBlobContrastFull?: Blob;
  exportBlobContrastFull?: Blob;
  // Legacy field for backwards compatibility
  displayBlobDarkened?: Blob;
  exportBlobDarkened?: Blob;

  // Generation metadata
  generatedHasBuiltInBleed?: boolean;
  generatedBleedMode?: string;

  // Source and display
  sourceUrl?: string;
  source?: ImageSource;
  displayName?: string;
  hasBuiltInBleed?: boolean;
  displayVersion?: number;
  processedWithAaBlur?: boolean;

  // Metadata for MPC cardbacks
  mpcSource?: string;
  tags?: string[];

  // Processed version, NO darkening applied (for CardEditor/Canvas)
  baseDisplayBlob?: Blob;
  baseExportBlob?: Blob;
  darknessFactor?: number;
}


export type Json =
  | string
  | number
  | boolean
  | null
  | undefined
  | { [key: string]: Json }
  | Json[];

export interface Setting {
  id: string;
  value: Json;
}

// Persistent image cache for long-term storage (survives card clearing)
export interface Project {
  id: string;              // UUID (primary key)
  name: string;            // User-editable name
  createdAt: number;       // Creation timestamp
  lastOpenedAt: number;    // For "Recent Projects" sorting
  cardCount: number;       // Cached count for UI
  settings: Json;          // Project-specific settings
  shareId?: string;        // Server share ID (for auto-sync)
  lastSharedAt?: number;   // Timestamp of last share (enables auto-sync)
  lastSyncedHash?: string; // Hash of the state at last sync (to detect local edits)
}

// Persistent user uploads (content-addressed, shared across projects)
// Orphan cleanup removes images not referenced by any card
export interface UserImage {
  hash: string;           // Primary key - SHA-256 hash for deduplication
  data: Blob;             // The raw image file
  type: string;           // MIME type
  createdAt: number;
  displayName?: string;
  typeLine?: string;      // From canonical card match (e.g. "Creature — Human Wizard")
  canonicalCardName?: string;
  canonicalCardSet?: string;
  canonicalCardNumber?: string;
  isFavorite?: boolean;
  tags?: string[];
  hasBuiltInBleed?: boolean;
  linkedFrontHash?: string;
  linkedBackHash?: string;
}

export interface TcgScopedPreferences {
  favoriteSets?: string[];
  favoriteSort?: 'name' | 'released' | null;
  favoriteGroupBySet?: boolean;
  favoriteSearchMode?: 'cards' | 'prints' | null;
}

export interface UserPreferences {
  id: 'default';           // Singleton record
  settings: Json;          // User's default settings
  favoriteCardbacks: string[];  // Default cardback selections
  lastProjectId?: string;  // Resume last project on app open
  // TCG-scoped preferences (Phase 1: TCG Module Architecture)
  tcgPreferences?: Record<string, TcgScopedPreferences>;
  // MPC Favorites (shared across TCGs with MPC support)
  favoriteMpcSources?: string[];
  favoriteMpcTags?: string[];
  favoriteMpcDpi?: number | null;
  favoriteMpcSort?: 'name' | 'dpi' | 'source' | null;
  favoriteMpcGroupBySource?: boolean;
  // Legacy flat fields (migrated to tcgPreferences on load)
  favoriteScryfallSets?: string[];
  favoriteScryfallSort?: 'name' | 'released' | null;
  favoriteScryfallGroupBySet?: boolean;
  favoriteScryfallSearchMode?: 'cards' | 'prints' | null;
  favoritePokemonSets?: string[];
  favoritePokemonSort?: 'name' | 'released' | null;
  favoritePokemonGroupBySet?: boolean;
  // Upload Library Preferences
  uploadLibrarySort?: 'name' | 'date' | 'type' | null;
  uploadLibrarySortDirection?: 'asc' | 'desc';
  favoriteUploadLibraryGroupByType?: boolean;
  // Cardback Preferences (shared for now)
  favoriteCardbackOrigins?: string[];
  favoriteCardbackSources?: string[];
  favoriteCardbackSort?: 'name' | 'source' | 'origin' | 'dpi' | null;
  favoriteCardbackGroupBy?: boolean;
  // UI State
  settingsPanelState?: { order: string[], collapsed: Record<string, boolean> };
  settingsPanelWidth?: number;
  isSettingsPanelCollapsed?: boolean;
  isUploadPanelCollapsed?: boolean;
  uploadPanelWidth?: number;
  cardEditorSectionCollapsed?: Record<string, boolean>;
  cardEditorSectionOrder?: string[];
  filterSectionCollapsed?: Record<string, boolean>;
}

export interface CachedImage {
  url: string;        // Primary key - the source URL
  blob: Blob;         // Original unprocessed image
  cachedAt: number;   // Timestamp for TTL calculation (last accessed)
  size: number;       // Size in bytes
}

// Pre-rendered effect cache for cards with overrides (holo, brightness, etc.)
export interface EffectCacheEntry {
  key: string;        // imageId + hash(overrides)
  blob: Blob;         // Pre-rendered export image
  size: number;       // Size in bytes
  cachedAt: number;   // For LRU eviction
}

class ProxxiedDexie extends Dexie {
  // 'cards' is the name of the table
  // '&uuid' makes 'uuid' a unique index and primary key
  // 'name, set, number' creates indexes for efficient lookup
  cards!: Table<CardOption, string>;

  // 'cardImages' table to store image blobs
  // '&uuid' makes 'uuid' a unique index and primary key
  images!: Table<Image, string>;

  // Cardbacks table - persists across card clears
  cardbacks!: Table<Cardback, string>;

  settings!: Table<Setting, string>;

  // Persistent image cache - survives card clearing, has TTL
  imageCache!: Table<CachedImage, string>;

  // Persistent metadata cache
  cardMetadataCache!: Table<CachedMetadata, string>;

  // Pre-rendered effect cache (for cards with overrides)
  effectCache!: Table<EffectCacheEntry, string>;

  // MPC search cache - persists for 1 week
  mpcSearchCache!: Table<MpcSearchCacheEntry, [string, string]>;
  projects!: Table<Project, string>;
  userPreferences!: Table<UserPreferences, string>;
  scryfallSetsCache!: Table<ScryfallSetsCacheEntry, string>;

  // Persistent custom image storage (content-addressed)
  user_images!: Table<UserImage, string>;

  constructor() {
    super('ProxxiedDB');
    this.version(1).stores({
      cards: '&uuid, imageId, order, name',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
    });
    // Version 2: Add darkened blob fields (no schema change needed, just new optional fields)
    this.version(2).stores({
      cards: '&uuid, imageId, order, name',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
    });
    // Version 3: Add needsEnrichment index for efficient querying of unenriched cards
    this.version(3).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
    });
    // Version 4: Add imageCache table for persistent image caching across sessions
    this.version(4).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
      imageCache: '&url, cachedAt',
    });
    // Version 5: Add cardMetadataCache table
    this.version(5).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
    });
    // Version 6: Add DFC support - linked card indexes
    this.version(6).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
    });
    // Version 7: Add separate cardbacks table (persists across card clears)
    this.version(7).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
    });
    // Version 8: Add effectCache table for pre-rendered exports
    this.version(8).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
    });
    // Version 9: Add mpcSearchCache table for MPC Autofill search caching
    this.version(9).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    });
    // Version 10: Clear cardMetadataCache to fix stale DFC data
    this.version(10).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    }).upgrade(tx => {
      // Clear all cached metadata to force re-enrichment with correct DFC handling
      return tx.table('cardMetadataCache').clear();
    });
    // Version 11: Add source field for explicit image source tracking
    // No schema change needed (source is optional), but version bump ensures clean upgrade
    this.version(11).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    });
    // Version 12: Add needs_token index for efficient querying of cards requiring tokens
    this.version(12).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    });
    // Version 13: Clean up self-referential tokens (e.g. Treasure needing Treasure)
    // This fixes the infinite loop button state for existing cards
    this.version(13).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    }).upgrade(async tx => {
      // Iterate only cards that flagged as needing tokens
      // We use the index for performance since we just added it in v12, but we query it via filtering to avoid key errors
      await tx.table('cards').filter(c => c.needs_token).modify(card => {
        if (card.token_parts && card.token_parts.length > 0) {
          // Filter out parts that have the same name as the card (case-insensitive)
          const validParts = card.token_parts.filter((p: { name?: string }) =>
            !p.name || p.name.toLowerCase() !== card.name.toLowerCase()
          );

          if (validParts.length !== card.token_parts.length) {
            card.token_parts = validParts;
            card.needs_token = validParts.length > 0;
          }
        }
      });
    });
    // Version 14: Strict cleanup - Tokens should NOT have token_parts
    // This removes spurious links (e.g. Treasure -> Smaug)
    this.version(14).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    }).upgrade(async tx => {
      await tx.table('cards').filter(c => c.needs_token).modify(card => {
        // If card itself is a token, clear dependencies
        if (card.type_line && card.type_line.toLowerCase().includes('token')) {
          card.token_parts = [];
          card.needs_token = false;
        }
      });
    });
    // Version 15: Clear cardMetadataCache to force re-enrichment with token_parts
    // Previous cached data doesn't include token_parts, causing needs_token to not be set
    this.version(15).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
    }).upgrade(tx => {
      return tx.table('cardMetadataCache').clear();
    });

    // Version 16: Add projects and userPreferences tables
    this.version(16).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId, projectId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
      projects: '&id, lastOpenedAt',
      userPreferences: '&id',
    }).upgrade(async tx => {
      // Create default project
      const defaultProjectId = generateUUID();
      const cardCount = await tx.table('cards').count();

      // Copy existing global settings
      const settingRecord = await tx.table('settings').get('proxxied:layout-settings:v1');
      const existingSettings = settingRecord?.value || {};

      await tx.table('projects').add({
        id: defaultProjectId,
        name: 'My Project',
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        cardCount,
        settings: existingSettings,
      });

      // Assign all existing cards to default project
      await tx.table('userPreferences').add({
        id: 'default',
        settings: existingSettings,
        favoriteCardbacks: [],
        lastProjectId: defaultProjectId,
      });
    });

    // Version 17: Unified Project Architecture
    // - 'cards' table holds ALL cards, filtered by projectId on read
    // - 'images' table is ephemeral cache (cleared on project switch)
    // - 'user_images' stores persistent custom uploads (content-addressed by hash)
    this.version(17).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId, projectId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
      projects: '&id, lastOpenedAt',
      userPreferences: '&id',
      user_images: '&hash', // Content-addressed by SHA-256 hash
    });

    // Version 19: Add scryfallSetsCache table for caching sets list
    this.version(19).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId, projectId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
      projects: '&id, shareId, lastOpenedAt',
      userPreferences: '&id',
      user_images: '&hash',
      scryfallSetsCache: '&key, cachedAt',
    });
    // Version 20: Extend user_images with metadata for Custom Upload Library
    this.version(20).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId, projectId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
      projects: '&id, shareId, lastOpenedAt',
      userPreferences: '&id',
      user_images: '&hash, displayName, isFavorite, createdAt',
      scryfallSetsCache: '&key, cachedAt',
    });

    // Version 21: Rename 'custom' source to 'upload-library'
    this.version(21).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId, projectId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
      projects: '&id, shareId, lastOpenedAt',
      userPreferences: '&id',
      user_images: '&hash, displayName, isFavorite, createdAt',
      scryfallSetsCache: '&key, cachedAt',
    }).upgrade(async tx => {
      await tx.table('images')
        .filter(img => img.source === 'custom')
        .modify({ source: ImageSource.UploadLibrary });
    });

    // Version 22: Backfill 'source' field in images and cardbacks tables
    this.version(22).stores({
      cards: '&uuid, imageId, order, name, needsEnrichment, needs_token, linkedFrontId, linkedBackId, projectId',
      images: '&id, refCount, displayDpi, displayBleedWidth, exportDpi, exportBleedWidth',
      cardbacks: '&id',
      settings: '&id',
      imageCache: '&url, cachedAt',
      cardMetadataCache: 'id, name, set, number, cachedAt',
      effectCache: '&key, cachedAt',
      mpcSearchCache: '&[query+cardType], cachedAt',
      projects: '&id, shareId, lastOpenedAt',
      userPreferences: '&id',
      user_images: '&hash, displayName, isFavorite, createdAt',
      scryfallSetsCache: '&key, cachedAt',
    }).upgrade(async tx => {
      // 1. Update cardbacks - all existing cardbacks should have 'cardback' source
      await tx.table('cardbacks')
        .filter(cb => !cb.source)
        .modify({ source: ImageSource.Cardback });

      // 2. Update images - infer source from ID patterns if missing
      await tx.table('images')
        .filter(img => !img.source)
        .modify(img => {
          if (img.id.startsWith('http://') || img.id.startsWith('https://')) {
            img.source = ImageSource.Scryfall;
          } else if (img.id.startsWith('mpc-')) {
            img.source = ImageSource.MPC;
          } else {
            // Default to upload-library for remaining (usually hashes/UUIDs)
            img.source = ImageSource.UploadLibrary;
          }
        });

      // 3. Update cards - backfill 'source' field based on imageId patterns or isUserUpload
      await tx.table('cards')
        .filter(card => !card.source)
        .modify(card => {
          if (card.isUserUpload) {
            card.source = ImageSource.UploadLibrary;
          } else if (card.imageId) {
            if (card.imageId.startsWith('http://') || card.imageId.startsWith('https://')) {
              card.source = ImageSource.Scryfall;
            } else if (card.imageId.startsWith('mpc-')) {
              card.source = ImageSource.MPC;
            } else if (card.imageId.startsWith('cardback_')) {
              card.source = ImageSource.Cardback;
            }
          }
        });
    });
  }
}

// Cache version for metadata - bump when adding new required fields
export const METADATA_CACHE_VERSION = 2;

export type JsonObject = { [key: string]: Json };

export interface CachedMetadata {
  id: string;         // UUID
  name: string;       // Card Name
  set: string;        // Set Code (or empty)
  number: string;     // Collector Number (or empty)
  // Data must be an object to hold properties like 'prints' safely
  data: JsonObject & { prints?: PrintInfo[] };
  cachedAt: number;   // Last accessed
  size: number;       // Estimated size in bytes
  cacheVersion?: number;  // Schema version for targeted invalidation
  hasFullPrints?: boolean; // True if 'data.prints' contains complete list of standard prints
}

// MPC search cache entry - for caching MPC Autofill search results
export interface MpcSearchCacheEntry {
  query: string;           // lowercase normalized search query
  cardType: 'CARD' | 'CARDBACK' | 'TOKEN';
  cards: unknown[];        // MpcAutofillCard[] - use unknown to avoid circular deps
  cachedAt: number;        // Timestamp for TTL calculation
}

// Scryfall sets cache entry
export interface ScryfallSetsCacheEntry {
  key: 'sets';        // Singleton key
  sets: unknown[];    // ScryfallSet[] - use unknown to avoid circular deps
  cachedAt: number;   // When data was last checked/updated
  dataHash: string;   // Hash of set codes for change detection
}

export const db = new ProxxiedDexie();
