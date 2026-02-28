import { useCallback } from "react";
import { changeCardArtwork, createLinkedBackCard } from "@/helpers/dbUtils";
import { parseImageIdFromUrl } from "@/helpers/imageHelper";
import {
    type MpcAutofillCard,
} from "@/helpers/mpcAutofillApi";
import type { UploadLibraryItem } from "@/helpers/uploadLibrary";
import { useProjectStore } from "@/store";
import { useSelectionStore } from "@/store/selection";
import { useToastStore } from "@/store/toast";
import { useArtworkModalStore } from "@/store/artworkModal";
import { useSettingsStore } from "@/store/settings";
import { getTcgConfig } from "@/config/tcgConfig";
import { ImportOrchestrator } from "@/helpers/ImportOrchestrator";
import type { ImportIntent } from "@/helpers/importParsers";
import { handleAutoImportTokens } from "@/helpers/tokenImportHelper";
import { addRemoteImage } from "@/helpers/dbUtils";
import { db } from "@/db";
import { ImageSource, type ScryfallCard, type CardOption } from "../../../../../shared/types";
import { debugLog } from "@/helpers/debug";

export type ArtApplicationConfig = {
    targetImageId: string;
    cardName?: string;
    needsEnrichment?: boolean;
    hasBuiltInBleed?: boolean;
    cardMetadata?: Parameters<typeof changeCardArtwork>[6];
    previewImageUrls?: string[];
    overrides?: Partial<CardOption["overrides"]>;
    cardToUpdate?: CardOption;
};

interface UseArtworkApplicationProps {
    activeCard: CardOption | null | undefined;
    modalCard: CardOption | null;
    selectedFace: "front" | "back";
    applyToAll: boolean;
    linkedBackCard: CardOption | undefined;
    isDFC: boolean;
    previewCardData: ScryfallCard | null;
    displayPrints: ScryfallCard["prints"];
    artSource: string;
    setSelectedArtId: (artId: string) => void;
    setAppliedMpcCardId: (mpcId: string) => void;
    setPreviewCardData: (data: ScryfallCard | null) => void;
    handleFaceTabChange: (face: "front" | "back") => void;
}

// TODO: Refactor handleSelectMpcArt to use ImportOrchestrator.resolve internally
// to eliminate duplicated MPC enrichment and DFC back-face logic.
export function useArtworkApplication({
    activeCard,
    modalCard,
    selectedFace,
    applyToAll,
    linkedBackCard,
    isDFC,
    previewCardData,
    displayPrints,
    setSelectedArtId,
    setAppliedMpcCardId,
    setPreviewCardData,
    handleFaceTabChange,
}: UseArtworkApplicationProps) {
    const applyArtworkToCards = useCallback(
        async (config: ArtApplicationConfig) => {
            const {
                targetImageId,
                cardName,
                needsEnrichment,
                hasBuiltInBleed,
                cardMetadata,
                previewImageUrls,
                overrides,
                cardToUpdate,
            } = config;
            const targetCard = cardToUpdate || activeCard;
            if (!targetCard) return;
            const selectedCards = useSelectionStore.getState().selectedCards;
            const isMultiSelect =
                selectedCards.size > 1 &&
                modalCard &&
                selectedCards.has(modalCard.uuid);
            if (isMultiSelect && selectedFace === "front") {
                const selectedUuids = Array.from(selectedCards);
                const cardsToUpdate = await db.cards.bulkGet(selectedUuids);
                for (const card of cardsToUpdate) {
                    if (card && !card.linkedFrontId) {
                        await changeCardArtwork(
                            card.imageId,
                            targetImageId,
                            card,
                            false,
                            cardName,
                            previewImageUrls,
                            cardMetadata,
                            hasBuiltInBleed,
                            overrides,
                        );
                        if (needsEnrichment) {
                            await db.cards.update(card.uuid, { needsEnrichment: true });
                        }
                    }
                }
                if (modalCard && selectedCards.has(modalCard.uuid)) {
                    const updated = await db.cards.get(modalCard.uuid);
                    if (updated) useArtworkModalStore.getState().updateCard(updated);
                }
            } else {
                await changeCardArtwork(
                    targetCard.imageId,
                    targetImageId,
                    targetCard,
                    applyToAll,
                    cardName,
                    previewImageUrls,
                    cardMetadata,
                    hasBuiltInBleed,
                    overrides,
                );
                if (needsEnrichment) {
                    await db.cards.update(targetCard.uuid, { needsEnrichment: true });
                }
                if (selectedFace === "front" || !linkedBackCard) {
                    const updated = await db.cards.get(targetCard.uuid);
                    if (updated) useArtworkModalStore.getState().updateCard(updated);
                }
            }
            if (modalCard?.uuid) {
                useSelectionStore
                    .getState()
                    .setFlipped([modalCard.uuid], selectedFace === "back");
            }
            handleAutoImportTokens({ silent: true });
            setPreviewCardData(null);
            const toastId = useToastStore.getState().addToast({
                type: "success",
                message: "Art applied successfully",
                dismissible: false,
            });
            setTimeout(() => useToastStore.getState().removeToast(toastId), 2000);
        },
        [activeCard, modalCard, selectedFace, applyToAll, linkedBackCard, setPreviewCardData],
    );

    const linkBackFace = useCallback(
        async (
            backCardTasks: { backImageId: string; backName: string; hasBleed?: boolean }[],
            refreshFrontCard = false,
        ) => {
            if (!backCardTasks.length || selectedFace !== "front" || !modalCard) return;
            const backTask = backCardTasks[0];
            if (modalCard.linkedBackId) {
                await db.cards.update(modalCard.linkedBackId, {
                    imageId: backTask.backImageId,
                    name: backTask.backName,
                    hasBuiltInBleed: backTask.hasBleed ?? false,
                    usesDefaultCardback: false,
                });
            } else {
                await createLinkedBackCard(
                    modalCard.uuid,
                    backTask.backImageId,
                    backTask.backName,
                    { hasBuiltInBleed: backTask.hasBleed ?? false },
                );
                if (refreshFrontCard) {
                    const refreshedCard = await db.cards.get(modalCard.uuid);
                    if (refreshedCard) {
                        useArtworkModalStore.getState().updateCard(refreshedCard);
                    }
                }
            }
        },
        [modalCard, selectedFace],
    );

    const handleSelectArtwork = useCallback(
        async (
            newImageUrl: string,
            newCardName?: string,
            specificPrint?: { set: string; number: string },
        ) => {
            if (!activeCard) return;
            debugLog("[ArtworkModal] handleSelectArtwork:", {
                newImageUrl: newImageUrl?.substring(0, 80),
                newCardName,
                specificPrint,
                activeCardName: activeCard.name,
                previewCardDataName: previewCardData?.name,
                displayDataPrints: displayPrints?.length,
            });

            const activeTcg = useSettingsStore.getState().activeTcg ?? 'mtg';
            const cfg = getTcgConfig(activeTcg);
            const isAltBackend = !!cfg.artSources.find(s => s.id === 'tcgdex');

            if (isAltBackend && newImageUrl) {
                const imageId = await addRemoteImage([newImageUrl], 1, ImageSource.TCGdex);
                if (imageId) {
                    await applyArtworkToCards({
                        targetImageId: imageId,
                        cardName: newCardName,
                    });
                }
                return;
            }

            setSelectedArtId(newImageUrl);
            const isReplacing = !!previewCardData;
            const newImageId = parseImageIdFromUrl(newImageUrl);
            const selectedPrint = displayPrints?.find(
                (p) => p.imageUrl === newImageUrl,
            );
            const newFaceName = selectedPrint?.faceName;
            const shouldUpdateName =
                (!!newCardName && newCardName !== activeCard.name) ||
                (isDFC && newFaceName && newFaceName !== activeCard.name);
            let intent: ImportIntent;
            if (specificPrint) {
                intent = {
                    name: newCardName || activeCard.name,
                    set: specificPrint.set,
                    number: specificPrint.number,
                    quantity: 1,
                    isToken: activeCard.isToken || false,
                };
            } else if (selectedPrint) {
                intent = {
                    name: activeCard.name,
                    set: selectedPrint.set,
                    number: selectedPrint.number,
                    quantity: 1,
                    isToken: activeCard.isToken || false,
                };
            } else if (previewCardData) {
                intent = {
                    name: previewCardData.name,
                    set: previewCardData.set,
                    number: previewCardData.number,
                    quantity: 1,
                    isToken: activeCard.isToken || false,
                };
            } else {
                intent = {
                    name: activeCard.name,
                    quantity: 1,
                    isToken: activeCard.isToken || false,
                };
            }
            try {
                const projectId =
                    activeCard.projectId || useProjectStore.getState().currentProjectId!;
                const { cardsToAdd, backCardTasks } = await ImportOrchestrator.resolve(
                    intent,
                    projectId,
                );
                const resolved = cardsToAdd[0];
                if (resolved) {
                    const cardMetadata: Parameters<typeof changeCardArtwork>[6] = {
                        set: resolved.set,
                        number: resolved.number,
                        rarity: resolved.rarity,
                        lang: resolved.lang,
                        colors: resolved.colors,
                        cmc: resolved.cmc,
                        type_line: resolved.type_line,
                        mana_cost: resolved.mana_cost,
                        token_parts: resolved.token_parts,
                        needs_token: resolved.needs_token,
                        isToken: resolved.isToken,
                    };
                    const newName =
                        newCardName || (shouldUpdateName ? newFaceName : resolved.name);
                    await applyArtworkToCards({
                        targetImageId: newImageId,
                        cardName: newName,
                        hasBuiltInBleed: resolved.hasBuiltInBleed,
                        cardMetadata,
                        previewImageUrls:
                            isReplacing && resolved.imageId ? [resolved.imageId] : undefined,
                    });
                    if (backCardTasks?.length) {
                        await linkBackFace(
                            backCardTasks.map((t) => ({
                                backImageId: t.backImageId,
                                backName: t.backName,
                                hasBleed: (t as { hasBleed?: boolean }).hasBleed,
                            })),
                        );
                    }
                }
            } catch (e) {
                console.error("Failed to resolve artwork selection:", e);
                debugLog("Failed to resolve artwork selection:", e);
            }
        },
        [
            activeCard,
            previewCardData,
            displayPrints,
            isDFC,
            setSelectedArtId,
            applyArtworkToCards,
            linkBackFace,
        ],
    );

    const handleSelectMpcArt = useCallback(
        async (card: MpcAutofillCard) => {
            debugLog("[ArtworkModal] handleSelectMpcArt:", {
                cardIdentifier: card.identifier,
                cardName: card.name,
                activeCardName: activeCard?.name,
                activeCardUuid: activeCard?.uuid,
            });
            if (!activeCard) {
                debugLog(
                    "[ArtworkModal] handleSelectMpcArt: no activeCard, returning early",
                );
                return;
            }
            setAppliedMpcCardId(card.identifier);
            const intent: ImportIntent = {
                name: card.name,
                mpcId: card.identifier,
                sourcePreference: "mpc",
                quantity: 1,
                isToken: activeCard.isToken || false,
            };
            debugLog("[ArtworkModal] handleSelectMpcArt intent:", intent);
            try {
                const projectId =
                    activeCard.projectId || useProjectStore.getState().currentProjectId!;
                const { cardsToAdd, backCardTasks } = await ImportOrchestrator.resolve(
                    intent,
                    projectId,
                );
                const resolved = cardsToAdd[0];
                debugLog("[ArtworkModal] handleSelectMpcArt resolved:", {
                    resolvedName: resolved?.name,
                    resolvedImageId: resolved?.imageId,
                    cardsToAddLength: cardsToAdd.length,
                    backCardTasksLength: backCardTasks?.length,
                });
                if (resolved?.imageId) {
                    await applyArtworkToCards({
                        targetImageId: resolved.imageId,
                        cardName: resolved.name,
                        hasBuiltInBleed: resolved.hasBuiltInBleed,
                        needsEnrichment: resolved.needsEnrichment,
                        cardMetadata: {
                            isToken: resolved.isToken,
                            token_parts: resolved.token_parts,
                            needs_token: resolved.needs_token,
                            set: resolved.set,
                            number: resolved.number,
                            rarity: resolved.rarity,
                            lang: resolved.lang,
                            colors: resolved.colors,
                            cmc: resolved.cmc,
                            type_line: resolved.type_line,
                            mana_cost: resolved.mana_cost,
                        },
                    });
                    if (backCardTasks?.length) {
                        await linkBackFace(
                            backCardTasks.map((t) => ({
                                backImageId: t.backImageId,
                                backName: t.backName,
                                hasBleed: (t as { hasBleed?: boolean }).hasBleed,
                            })),
                            true,
                        );
                    }
                    debugLog(
                        "[ArtworkModal] handleSelectMpcArt: applyArtworkToCards completed",
                    );
                } else {
                    debugLog(
                        "[ArtworkModal] handleSelectMpcArt: no resolved card or imageId",
                    );
                }
            } catch (e) {
                console.error("Failed to resolve MPC selection:", e);
                debugLog("Failed to resolve MPC selection:", e);
            }
        },
        [activeCard, setAppliedMpcCardId, applyArtworkToCards, linkBackFace],
    );

    const handleSelectUploadLibraryArt = useCallback(
        async (upload: UploadLibraryItem) => {
            if (!activeCard || !modalCard) {
                console.warn(
                    `[ArtworkModal] handleSelectUploadLibraryArt aborted because activeCard or modalCard is missing.`,
                );
                return;
            }
            setPreviewCardData(null);
            setSelectedArtId(upload.hash);
            let frontItemHash = upload.hash;
            let frontItemName = upload.displayName || upload.canonicalCardName;
            let frontHasBleed = upload.hasBuiltInBleed ?? false;
            let backItemHash: string | undefined = undefined;
            let backItemName: string | undefined = undefined;
            let backHasBleed = false;
            const isDfcUpload = !!upload.linkedFrontHash || !!upload.linkedBackHash;
            let faceToNavigateTo: "front" | "back" | null = null;
            let targetCardForFrontFace = activeCard;
            if (isDfcUpload) {
                targetCardForFrontFace = modalCard;
                if (upload.linkedFrontHash) {
                    const frontImg = await db.user_images.get(upload.linkedFrontHash);
                    if (frontImg) {
                        frontItemHash = frontImg.hash;
                        frontItemName =
                            frontImg.displayName ||
                            frontImg.canonicalCardName ||
                            "Untitled Front";
                        frontHasBleed = frontImg.hasBuiltInBleed ?? false;
                        backItemHash = upload.hash;
                        backItemName = upload.displayName || upload.canonicalCardName;
                        backHasBleed = upload.hasBuiltInBleed ?? false;
                    }
                    faceToNavigateTo = "back";
                } else if (upload.linkedBackHash) {
                    const backImg = await db.user_images.get(upload.linkedBackHash);
                    if (backImg) {
                        backItemHash = backImg.hash;
                        backItemName =
                            backImg.displayName ||
                            backImg.canonicalCardName ||
                            "Untitled Back";
                        backHasBleed = backImg.hasBuiltInBleed ?? false;
                    }
                    faceToNavigateTo = "front";
                }
            } else {
                faceToNavigateTo = selectedFace === "back" ? "back" : "front";
            }
            await applyArtworkToCards({
                targetImageId: frontItemHash,
                cardName: frontItemName,
                hasBuiltInBleed: frontHasBleed,
                cardMetadata: upload.canonicalCardSet
                    ? {
                        set: upload.canonicalCardSet,
                        number: upload.canonicalCardNumber,
                    }
                    : undefined,
                cardToUpdate: targetCardForFrontFace,
            });
            if (backItemHash && backItemName && isDfcUpload) {
                const wasNewlyLinked = !modalCard.linkedBackId;
                if (modalCard.linkedBackId) {
                    await db.cards.update(modalCard.linkedBackId, {
                        imageId: backItemHash,
                        name: backItemName,
                        hasBuiltInBleed: backHasBleed,
                        usesDefaultCardback: false,
                    });
                } else {
                    await createLinkedBackCard(modalCard.uuid, backItemHash, backItemName, {
                        hasBuiltInBleed: backHasBleed,
                    });
                }
                if (wasNewlyLinked) {
                    const refreshedCard = await db.cards.get(modalCard.uuid);
                    if (refreshedCard) {
                        useArtworkModalStore.getState().updateCard(refreshedCard);
                    }
                }
            }
            if (faceToNavigateTo && faceToNavigateTo !== selectedFace) {
                handleFaceTabChange(faceToNavigateTo);
            } else if (faceToNavigateTo && modalCard) {
                useSelectionStore
                    .getState()
                    .setFlipped([modalCard.uuid], faceToNavigateTo === "back");
            }
        },
        [
            activeCard,
            modalCard,
            selectedFace,
            setPreviewCardData,
            setSelectedArtId,
            applyArtworkToCards,
            handleFaceTabChange,
        ],
    );

    return {
        applyArtworkToCards,
        handleSelectArtwork,
        handleSelectMpcArt,
        handleSelectUploadLibraryArt,
        selectedUploadId: activeCard?.isUserUpload ? activeCard?.imageId : undefined,
    };
}
