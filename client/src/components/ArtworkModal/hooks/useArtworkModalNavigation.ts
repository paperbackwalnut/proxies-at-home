import { useEffect } from "react";

interface UseArtworkModalNavigationProps {
    isModalOpen: boolean;
    isSearching?: boolean;
    isEditingName?: boolean;
    canGoNext: boolean;
    canGoPrev: boolean;
    onNext: () => void;
    onPrev: () => void;
}

export function useArtworkModalNavigation({
    isModalOpen,
    isSearching,
    isEditingName,
    canGoNext,
    canGoPrev,
    onNext,
    onPrev,
}: UseArtworkModalNavigationProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isSearching || isEditingName) return;
            if (!e.ctrlKey && !e.metaKey) return;

            if (e.key === "ArrowLeft" && canGoPrev) {
                e.preventDefault();
                onPrev();
            } else if (e.key === "ArrowRight" && canGoNext) {
                e.preventDefault();
                onNext();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isModalOpen, isSearching, isEditingName, canGoNext, canGoPrev, onNext, onPrev]);
}
