import { Star, Trash2, Pencil, Cloud } from 'lucide-react';
import { CardImageSvg } from '../common/CardImageSvg';
import { CONSTANTS } from "@/constants/commonConstants";
import type { CardbackSource } from '../../../../shared/types';
import logoSvg from "@/assets/logo.svg";

export interface CardbackTileProps {
    id: string;
    name: string;
    imageUrl: string;
    source: string; // The display name for the source
    origin: CardbackSource; // The actual origin system ('builtin' | 'uploaded' | 'mpc')
    isSelected: boolean;
    isDefault: boolean;
    isDeleting: boolean;
    isEditing: boolean;
    editingName: string;
    hasBuiltInBleed?: boolean;
    displayBleedWidth?: number;
    cardSize?: number;
    dpi?: number;
    tags?: string[];
    activeSourceFilters?: Set<string>;
    activeMinDpi?: number;
    onSelect: () => void;
    onSetAsDefault: () => void;
    onDelete: () => void;
    onStartEdit: () => void;
    onEditNameChange: (name: string) => void;
    onSaveEdit: () => void;
    onToggleSource?: (source: string) => void;
    onToggleDpi?: (dpi: number) => void;
    onCancelEdit: () => void;
}

export function CardbackTile({
    id,
    name,
    imageUrl,
    source,
    origin,
    isSelected,
    isDefault,
    isDeleting,
    isEditing,
    editingName,
    hasBuiltInBleed,
    displayBleedWidth,
    cardSize = 1,
    dpi,
    tags,
    activeSourceFilters,
    activeMinDpi = 0,
    onSelect,
    onSetAsDefault,
    onDelete,
    onStartEdit,
    onEditNameChange,
    onSaveEdit,
    onCancelEdit,
    onToggleSource,
    onToggleDpi,
}: CardbackTileProps) {
    const isBlank = id === 'cardback_builtin_blank';
    const isBuiltin = origin === 'builtin';
    // MPC source can be 'mpc' or the contributor name from MPC Autofill
    const isMpc = origin === 'mpc';
    const canEdit = origin === 'uploaded'; // Only uploaded can be renamed
    const canDelete = origin === 'uploaded'; // Only uploaded can be deleted

    // Origin for label display (e.g. 'Proxxied', 'My Uploads', or MPC contributor name)
    const originLabel = origin === 'builtin' ? 'Proxxied' : (origin === 'uploaded' ? 'My Uploads' : source);

    // If it's an MPC card, always enforce the MPC standard bleed sizing, 
    // even if displayBleedWidth says something else temporarily, to prevent jumping.
    const effectiveBleedAmount = isMpc ? 3.175 : (displayBleedWidth !== undefined
        ? displayBleedWidth
        : (hasBuiltInBleed ? 3.175 : 0));

    // Calculate dimensions exactly matching how CardArtContent maps source widths
    let sourceWidthMm = 63 + (effectiveBleedAmount * 2);
    let sourceHeightMm = 88 + (effectiveBleedAmount * 2);

    // Only MPC downloaded cards use the strict 69.35 ratio, Proxxied uses mathematical bleed expansion
    if (isMpc) {
        sourceWidthMm = 69.35;
        sourceHeightMm = 94.35;
    }

    const bleedConfig = effectiveBleedAmount > 0 ? {
        amountMm: effectiveBleedAmount,
        sourceWidthMm,
        sourceHeightMm,
    } : undefined;

    const outlineWidth = Math.max(2, Math.round(4 * cardSize));

    return (
        <div
            className="relative cursor-pointer group w-full h-full flex flex-col"
            data-testid={`cardback-tile-${id}`}
            onClick={onSelect}
        >
            <div
                className="relative flex-1 w-full overflow-hidden"
                style={{
                    aspectRatio: '63 / 88',
                    borderRadius: CONSTANTS.CORNER_RADIUS_CSS,
                    ...(isSelected ? { outline: `${outlineWidth}px solid rgb(34 197 94)` } : {})
                }}
            >
                <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: CONSTANTS.CORNER_RADIUS_CSS }}>
                    {isBlank ? (
                        <>
                            <div
                                className="w-full h-full flex items-center justify-center bg-linear-to-br from-white/60 to-white/30 dark:from-gray-700/60 dark:to-gray-800/30 backdrop-blur-sm shadow-inner"
                            >
                                <span className="text-gray-400 dark:text-gray-500 text-xs font-medium italic">No Back</span>
                            </div>
                            <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: CONSTANTS.CORNER_RADIUS_CSS, boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(0,0,0,0.05)' }} />
                        </>
                    ) : (
                        <CardImageSvg
                            url={imageUrl}
                            id={id}
                            bleed={bleedConfig}
                            rounded={true}
                            lazy={true}
                        />
                    )}

                    {/* DPI Badge - Top Right */}
                    {dpi && dpi !== Infinity && (
                        <div
                            className={`absolute top-2 right-2 text-white text-xs px-2 py-1 rounded transition-all z-30 cursor-pointer hover:scale-105 active:scale-95 ${activeMinDpi > 0 && dpi >= activeMinDpi
                                ? "bg-blue-600 hover:bg-blue-500"
                                : "bg-black/70 hover:bg-black/90"
                                }`}
                            title="Set as minimum DPI"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleDpi?.(dpi);
                            }}
                        >
                            {dpi} DPI
                        </div>
                    )}
                    {/* Bottom overlay: name always visible, source/tags on hover */}
                    <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-2 z-30">
                        <div className="transition-opacity opacity-0 group-hover:opacity-100">
                            <div
                                className={`text-[10px] truncate max-w-full px-2 py-0.5 rounded transition-all inline-block mb-1 cursor-pointer hover:scale-105 active:scale-95 ${activeSourceFilters?.has(source)
                                    ? "bg-blue-600 text-white hover:bg-blue-500"
                                    : "bg-black/60 text-white hover:bg-black/80"
                                    }`}
                                title="Add source to filter"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleSource?.(source);
                                }}
                            >
                                {originLabel}
                            </div>
                            {tags && tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {tags.slice(0, 3).map(tag => (
                                        <span
                                            key={tag}
                                            className="text-white text-[10px] px-1.5 py-0.5 rounded transition-all bg-white/20 border border-white/5 truncate max-w-full"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        {isEditing ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                    autoFocus
                                    type="text"
                                    className="w-full text-xs bg-transparent text-white border-b border-white/50 focus:outline-none focus:border-white px-0 py-0"
                                    value={editingName}
                                    onChange={(e) => onEditNameChange(e.target.value)}
                                    onBlur={onSaveEdit}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') onSaveEdit();
                                        if (e.key === 'Escape') onCancelEdit();
                                    }}
                                />
                            </div>
                        ) : (
                            <span className="text-xs text-white truncate block font-medium">
                                {name}
                            </span>
                        )}
                    </div>
                </div>

                <div className={`absolute right-2 top-9 flex flex-col gap-1 z-10 transition-opacity ${isDefault ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onSetAsDefault();
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-sm bg-white hover:bg-gray-100 shadow-xs"
                        title={isDefault ? 'Default Cardback' : 'Set as default'}
                    >
                        <Star
                            className={`w-3.5 h-3.5 ${isDefault ? 'fill-yellow-400 text-yellow-400' : 'text-gray-700'}`}
                        />
                    </button>
                    {isBuiltin && (
                        <div
                            className={`w-6 h-6 flex items-center justify-center rounded-sm bg-white/80 transition-opacity`}
                            title="Proxxied"
                        >
                            <img src={logoSvg} alt="Proxxied" className="w-3.5 h-3.5" />
                        </div>
                    )}
                    {!isBuiltin && (
                        <>
                            {isMpc && (
                                <div
                                    className={`w-6 h-6 flex items-center justify-center rounded-sm bg-white/80 transition-opacity`}
                                    title="MPC Autofill"
                                >
                                    <Cloud className="w-3.5 h-3.5 text-blue-500" />
                                </div>
                            )}
                            {canEdit && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStartEdit();
                                    }}
                                    className={`w-6 h-6 flex items-center justify-center rounded-sm bg-white text-gray-700 hover:bg-gray-100 transition-opacity`}
                                    title="Rename"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {canDelete && (
                                <button
                                    disabled={isDeleting}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete();
                                    }}
                                    className={`w-6 h-6 flex items-center justify-center rounded-sm bg-white text-gray-700 hover:bg-red-100 hover:text-red-600 transition-opacity`}
                                    title="Delete cardback"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div >
    );
}
