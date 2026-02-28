import { Button } from "flowbite-react";
import {
    ArrowLeft,
    X,
    Image,
    Settings,
    ChevronLeft,
    ChevronRight,
    Pencil,
    Check,
} from "lucide-react";
import { ArtSourceToggle, TabBar } from "../common";
import type { ArtSource } from "../common/ArtSourceToggle";

interface ArtworkModalHeaderProps {
    activeTab: "artwork" | "settings";
    setActiveTab: (tab: "artwork" | "settings") => void;
    selectedFace: "front" | "back";
    onFaceTabChange: (face: "front" | "back") => void;
    tabLabels: { front: string; back: string };
    showCardbackButton: boolean;
    showCardbackLibrary: boolean;
    setShowCardbackLibrary: (show: boolean) => void;
    previewCardData: unknown;
    setPreviewCardData: (data: null) => void;
    displayName: string | undefined;
    isUploadLibraryItem: boolean;
    isEditingName: boolean;
    editedName: string;
    setEditedName: (name: string) => void;
    setIsEditingName: (editing: boolean) => void;
    onSaveName: () => void;
    modalIndex: number | null;
    allCardsLength: number;
    onClose: () => void;
    artSource: ArtSource;
    setArtSource: (source: ArtSource) => void;
    hasUploadLibraryItems: boolean;
    canGoPrev: boolean;
    canGoNext: boolean;
    onPrev: () => void;
    onNext: () => void;
}

function CardbackIcon() {
    return (
        <svg className="h-5 w-4" viewBox="0 0 50 70" fill="none">
            <rect x="0" y="0" width="50" height="70" rx="4" fill="#1a1a1a" />
            <rect x="3" y="3" width="44" height="64" rx="2" fill="#8B6914" />
            <ellipse cx="25" cy="35" rx="17" ry="24" fill="#4A5899" />
            <ellipse cx="25" cy="35" rx="14" ry="20" fill="#C4956A" />
        </svg>
    );
}

export function ArtworkModalNavigationArrows({
    canGoPrev,
    canGoNext,
    onPrev,
    onNext,
}: Pick<
    ArtworkModalHeaderProps,
    "canGoPrev" | "canGoNext" | "onPrev" | "onNext"
>) {
    return (
        <>
            {canGoPrev && (
                <button
                    onClick={onPrev}
                    className="fixed left-2 top-1/2 -translate-y-1/2 z-100001 p-3 rounded-full bg-black/30 hover:bg-black/70 text-white/60 hover:text-white transition-all duration-200"
                    title="Previous card (Ctrl+←)"
                >
                    <ChevronLeft className="w-8 h-8" />
                </button>
            )}
            {canGoNext && (
                <button
                    onClick={onNext}
                    className="fixed right-2 top-1/2 -translate-y-1/2 z-100001 p-3 rounded-full bg-black/30 hover:bg-black/70 text-white/60 hover:text-white transition-all duration-200"
                    title="Next card (Ctrl+→)"
                >
                    <ChevronRight className="w-8 h-8" />
                </button>
            )}
        </>
    );
}

export function ArtworkModalSidebarHeader({
    previewCardData,
    showCardbackLibrary,
    setPreviewCardData,
    setShowCardbackLibrary,
    displayName,
    isUploadLibraryItem,
    isEditingName,
    editedName,
    setEditedName,
    setIsEditingName,
    onSaveName,
    modalIndex,
    allCardsLength,
    onClose,
    activeTab,
    artSource,
    setArtSource,
    hasUploadLibraryItems,
}: Omit<
    ArtworkModalHeaderProps,
    | "setActiveTab"
    | "selectedFace"
    | "onFaceTabChange"
    | "tabLabels"
    | "showCardbackButton"
    | "canGoPrev"
    | "canGoNext"
    | "onPrev"
    | "onNext"
>) {
    return (
        <div className="landscape-sidebar-header border-b border-gray-200 dark:border-gray-600 max-lg:portrait:hidden">
            <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors lg:order-last"
            >
                <X className="w-5 h-5" />
            </button>
            <div className="landscape-sidebar-row">
                {(previewCardData || showCardbackLibrary) && (
                    <Button
                        size="sm"
                        onClick={() =>
                            previewCardData
                                ? setPreviewCardData(null)
                                : setShowCardbackLibrary(false)
                        }
                        className="max-lg:landscape:w-full"
                    >
                        <ArrowLeft className="size-5" />
                    </Button>
                )}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white hidden lg:flex items-center gap-2">
                    {showCardbackLibrary ? (
                        "Choose Cardback"
                    ) : isEditingName ? (
                        <>
                            <span>Select Artwork for</span>
                            <input
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        onSaveName();
                                    } else if (e.key === "Escape") {
                                        setIsEditingName(false);
                                    }
                                }}
                                className="px-2 py-1 text-lg font-semibold border rounded bg-white dark:bg-gray-800 dark:border-gray-600"
                                autoFocus
                            />
                            <button
                                onClick={onSaveName}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                title="Save name"
                            >
                                <Check className="w-4 h-4 text-green-600" />
                            </button>
                        </>
                    ) : (
                        <>
                            {`Select Artwork for ${displayName}`}
                            {isUploadLibraryItem && (
                                <button
                                    onClick={() => {
                                        setEditedName(displayName || "");
                                        setIsEditingName(true);
                                    }}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                    title="Edit card name"
                                >
                                    <Pencil className="w-4 h-4 text-gray-500" />
                                </button>
                            )}
                            {modalIndex !== null && allCardsLength > 1 && (
                                <span className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 whitespace-nowrap text-xs flex items-center overflow-hidden">
                                    <span className="h-full flex items-center px-2 text-gray-900 dark:text-white">
                                        {modalIndex + 1}
                                    </span>
                                    <span className="w-px h-full bg-gray-300 dark:bg-gray-500" />
                                    <span className="h-full flex items-center px-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-600">
                                        {allCardsLength}
                                    </span>
                                </span>
                            )}
                        </>
                    )}
                </h3>
            </div>
            <div className="landscape-spacer" />
            {activeTab === "artwork" && !showCardbackLibrary && (
                <div className="hidden max-lg:landscape:block">
                    <ArtSourceToggle
                        value={artSource}
                        onChange={setArtSource}
                        showUploadLibrary={hasUploadLibraryItems}
                        vertical
                        reversed
                    />
                </div>
            )}
        </div>
    );
}

export function ArtworkModalTabBars({
    activeTab,
    setActiveTab,
    selectedFace,
    onFaceTabChange,
    tabLabels,
    showCardbackButton,
    showCardbackLibrary,
    setShowCardbackLibrary,
    onClose,
}: Pick<
    ArtworkModalHeaderProps,
    | "activeTab"
    | "setActiveTab"
    | "selectedFace"
    | "onFaceTabChange"
    | "tabLabels"
    | "showCardbackButton"
    | "showCardbackLibrary"
    | "setShowCardbackLibrary"
    | "onClose"
>) {
    if (showCardbackLibrary) return null;
    return (
        <div className="hidden lg:block max-lg:portrait:block">
            <div className="flex items-start justify-between">
                <div className="flex-1 overflow-hidden">
                    <TabBar
                        tabs={[
                            { id: "front" as const, label: tabLabels.front },
                            { id: "back" as const, label: tabLabels.back },
                        ]}
                        activeTab={selectedFace}
                        onTabChange={(face) =>
                            onFaceTabChange(face as "front" | "back")
                        }
                        variant="primary"
                    />
                </div>
                <div className="lg:hidden p-2">
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors max-lg:landscape:order-first"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <TabBar
                tabs={[
                    {
                        id: "artwork" as const,
                        label: "Artwork",
                        icon: <Image className="w-5 h-5" />,
                    },
                    {
                        id: "settings" as const,
                        label: "Settings",
                        icon: <Settings className="w-5 h-5" />,
                    },
                    ...(showCardbackButton
                        ? [
                            {
                                id: "cardback" as const,
                                label: "Use Cardback",
                                icon: <CardbackIcon />,
                            },
                        ]
                        : []),
                ]}
                activeTab={activeTab}
                onTabChange={(tab) => {
                    if (tab === "cardback") {
                        setShowCardbackLibrary(true);
                    } else {
                        setActiveTab(tab as "artwork" | "settings");
                    }
                }}
                variant="secondary"
            />
        </div>
    );
}
