import { Button, Checkbox, Label } from "flowbite-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useArtworkModalStore } from "@/store/artworkModal";
import { useCardEditorModalStore } from "@/store/cardEditorModal";
import { useSettingsStore } from "@/store/settings";
import { useSelectionStore } from "@/store/selection";
import { undoableUpdateCardBleedSettings } from "@/helpers/undoableActions";
import { BleedModeControl } from "./BleedModeControl";
import { getHasBuiltInBleed } from "@/helpers/imageSpecs";
import { AutoTooltip } from "../common";
import { db } from "@/db";
import { Palette } from "lucide-react";

interface ArtworkBleedSettingsProps {
    selectedFace: 'front' | 'back';
}

export function ArtworkBleedSettings({ selectedFace }: ArtworkBleedSettingsProps) {
    const modalCard = useArtworkModalStore((state) => state.card);
    const closeModal = useArtworkModalStore((state) => state.closeModal);

    const linkedBackCard = useLiveQuery(
        () => (modalCard?.linkedBackId ? db.cards.get(modalCard.linkedBackId) : undefined),
        [modalCard?.linkedBackId]
    );

    const activeCard = selectedFace === 'back' && linkedBackCard ? linkedBackCard : modalCard;

    const activeImage = useLiveQuery(
        () => (activeCard?.imageId ? db.images.get(activeCard.imageId) : undefined),
        [activeCard?.imageId]
    );

    const globalBleedWidth = useSettingsStore((state) => state.bleedEdgeWidth);

    // --- Local State ---
    const [sameAsFront, setSameAsFront] = useState(true);
    const globalSourceAmount = useSettingsStore((state) => state.withBleedSourceAmount);
    const [hasBleedBuiltIn, setHasBleedBuiltIn] = useState<boolean>(false);
    const [sourceMode, setSourceMode] = useState<'default' | 'manual'>('default');
    const [providedBleedAmount, setProvidedBleedAmount] = useState<number>(3.175);
    const [targetMode, setTargetMode] = useState<'default' | 'manual' | 'none'>('default');
    const [manualTargetAmount, setManualTargetAmount] = useState<number>(3.175);

    const userEditedRef = useRef(false);
    const lastCardUuidRef = useRef<string | null>(null);
    const lastBackCardImageIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (activeCard) {
            userEditedRef.current = false;
            setHasBleedBuiltIn(getHasBuiltInBleed(activeCard) ?? false);
            if (activeCard.existingBleedMm !== undefined) {
                setSourceMode('manual');
                setProvidedBleedAmount(activeCard.existingBleedMm);
            } else {
                setSourceMode('default');
                setProvidedBleedAmount(globalSourceAmount);
            }
            if (activeCard.bleedMode === 'none') {
                setTargetMode('none');
            } else if (activeCard.generateBleedMm !== undefined) {
                setTargetMode('manual');
                setManualTargetAmount(activeCard.generateBleedMm);
            } else {
                setTargetMode('default');
                setManualTargetAmount(globalBleedWidth);
            }
            const cardChanged = lastCardUuidRef.current !== modalCard?.uuid;
            const backCardChanged = lastBackCardImageIdRef.current !== linkedBackCard?.imageId;
            
            lastCardUuidRef.current = modalCard?.uuid ?? null;
            lastBackCardImageIdRef.current = linkedBackCard?.imageId ?? null;
            
            if ((cardChanged || backCardChanged) && selectedFace === 'back' && modalCard && linkedBackCard) {
                const settingsMatch =
                    modalCard.bleedMode === linkedBackCard.bleedMode &&
                    modalCard.generateBleedMm === linkedBackCard.generateBleedMm;
                setSameAsFront(settingsMatch);
            }
        }
    }, [activeCard, globalBleedWidth, globalSourceAmount, selectedFace, modalCard, linkedBackCard]);

    const isBackTab = selectedFace === 'back';
    const hasLinkedBack = !!linkedBackCard;

    const editSameAsFront = useCallback((v: boolean) => { userEditedRef.current = true; setSameAsFront(v); }, []);
    const editHasBleedBuiltIn = useCallback((v: boolean) => { userEditedRef.current = true; setHasBleedBuiltIn(v); }, []);
    const editSourceMode = useCallback((v: 'default' | 'manual') => { userEditedRef.current = true; setSourceMode(v); }, []);
    const editProvidedBleedAmount = useCallback((v: number) => { userEditedRef.current = true; setProvidedBleedAmount(v); }, []);
    const editTargetMode = useCallback((v: 'default' | 'manual' | 'none') => { userEditedRef.current = true; setTargetMode(v); }, []);
    const editManualTargetAmount = useCallback((v: number) => { userEditedRef.current = true; setManualTargetAmount(v); }, []);

    useEffect(() => {
        if (!userEditedRef.current) return;
        userEditedRef.current = false;

        const persistSettings = async () => {
            if (!activeCard) return;

            let bleedMode: 'generate' | 'none' | undefined;
            let existingBleedMm: number | undefined;
            let generateBleedMm: number | undefined;

            if (isBackTab && sameAsFront && modalCard) {
                await undoableUpdateCardBleedSettings(
                    [activeCard.uuid],
                    {
                        hasBuiltInBleed: getHasBuiltInBleed(activeCard), // Keep back card's intrinsic property
                        bleedMode: modalCard.bleedMode,
                        existingBleedMm: activeCard.existingBleedMm, // Keep back card's intrinsic property
                        generateBleedMm: modalCard.generateBleedMm
                    }
                );
                return;
            }

            if (hasBleedBuiltIn) {
                existingBleedMm = sourceMode === 'manual' ? providedBleedAmount : undefined;
            } else {
                existingBleedMm = undefined;
            }

            if (targetMode === 'none') {
                bleedMode = 'none';
                generateBleedMm = undefined;
            } else if (targetMode === 'manual') {
                bleedMode = 'generate';
                generateBleedMm = manualTargetAmount;
            } else {
                bleedMode = undefined;
                generateBleedMm = undefined;
            }

            const selectedCards = useSelectionStore.getState().selectedCards;
            const cardUuids = !isBackTab && selectedCards.size > 1 && modalCard && selectedCards.has(modalCard.uuid)
                ? Array.from(selectedCards)
                : [activeCard.uuid];

            await undoableUpdateCardBleedSettings(
                cardUuids,
                {
                    hasBuiltInBleed: hasBleedBuiltIn,
                    bleedMode,
                    existingBleedMm,
                    generateBleedMm
                }
            );
        };

        void persistSettings();
    }, [hasBleedBuiltIn, sourceMode, providedBleedAmount, targetMode, manualTargetAmount, sameAsFront, isBackTab, activeCard, modalCard]);

    if (isBackTab && !hasLinkedBack) {
        return (
            <div className="p-4 space-y-4">
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>No back card selected.</strong> Please select a cardback from the Artwork tab first to configure bleed settings for the back.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-700 max-h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 px-16 space-y-6 min-h-0">
                {selectedFace === 'back' && linkedBackCard && (
                    <div className="space-y-3">
                        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="same-as-front"
                                    checked={sameAsFront}
                                    onChange={(e) => editSameAsFront(e.target.checked)}
                                    className="mt-0.5"
                                />
                                <div className="flex items-center gap-2 flex-1">
                                    <Label htmlFor="same-as-front" className="cursor-pointer font-medium dark:text-white">
                                        Same as front
                                    </Label>
                                    <AutoTooltip content="Use the same bleed settings as the front face of this card" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {(selectedFace === 'front' || !sameAsFront) && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-medium dark:text-white">Bleed Settings</h3>
                            <AutoTooltip
                                content="Configure how bleed edges are handled for this card."
                                className="w-5 h-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer"
                            />
                        </div>
                        <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="has-bleed-built-in"
                                    checked={hasBleedBuiltIn}
                                    onChange={(e) => editHasBleedBuiltIn(e.target.checked)}
                                    className="mt-0.5"
                                />
                                <div className="flex items-center gap-2 flex-1">
                                    <Label htmlFor="has-bleed-built-in" className="cursor-pointer font-medium dark:text-white">
                                        Built-in Bleed
                                    </Label>
                                    <AutoTooltip content="Check this if the image already includes bleed edges (e.g., from MPC Autofill)" />
                                </div>
                            </div>
                            {hasBleedBuiltIn && (
                                <div className="ml-8 mt-2 space-y-2">
                                    <BleedModeControl
                                        idPrefix="source"
                                        groupName="source-mode"
                                        mode={sourceMode}
                                        onModeChange={editSourceMode}
                                        defaultLabel={`Use Type Default`}
                                        amount={providedBleedAmount}
                                        onAmountChange={editProvidedBleedAmount}
                                        showNone={false}
                                        valueDefault="default"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        <span className="font-medium">Tip:</span> Setting to 0mm will ignore the built-in bleed and allow bleed generation at any desired amount.
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium dark:text-white">Bleed Width</h4>
                            <BleedModeControl
                                idPrefix="target"
                                groupName="target-mode"
                                mode={targetMode}
                                onModeChange={editTargetMode}
                                defaultLabel={`Use ${hasBleedBuiltIn ? "Type Default" : "Global Bleed Width"}`}
                                amount={manualTargetAmount}
                                onAmountChange={editManualTargetAmount}
                                valueDefault="default"
                            />
                        </div>
                    </div>
                )}
            </div>
            <div className="flex-none p-4 px-16 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 z-10">
                {activeCard && (
                    <Button
                        color="light"
                        className="w-full"
                        onClick={() => {
                            closeModal();
                            useCardEditorModalStore.getState().openModal({
                                card: activeCard,
                                image: activeImage ?? null,
                                initialFace: selectedFace
                            });
                        }}
                    >
                        <Palette className="w-4 h-4 mr-2" />
                        Adjust Art
                    </Button>
                )}
            </div>
        </div>
    );
}
