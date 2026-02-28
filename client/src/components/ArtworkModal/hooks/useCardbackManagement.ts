import { useState, useCallback } from "react";
import { db } from "@/db";
import { changeCardArtwork, createLinkedBackCard } from "@/helpers/dbUtils";
import { undoableChangeCardback } from "@/helpers/undoableActions";
import { useSelectionStore } from "@/store/selection";
import { getAllCardbacks } from "@/helpers/cardbackLibrary";
import { BUILTIN_CARDBACKS } from "@/helpers/cardbackLibrary";
import type { CardOption } from "../../../../../shared/types";

interface UseCardbackManagementProps {
    isModalOpen: boolean;
    modalCard: CardOption | null;
    selectedFace: "front" | "back";
    applyToAll: boolean;
    defaultCardbackId: string;
    setDefaultCardbackId: (id: string) => void;
}

async function lookupCardbackBleed(cardbackId: string): Promise<boolean> {
    const builtin = BUILTIN_CARDBACKS.find(b => b.id === cardbackId);
    if (builtin) return builtin.hasBuiltInBleed ?? false;
    const record = await db.cardbacks.get(cardbackId);
    return record?.hasBuiltInBleed ?? true;
}

export function useCardbackManagement({
    modalCard,
    selectedFace,
    applyToAll,
    defaultCardbackId,
    setDefaultCardbackId,
}: UseCardbackManagementProps) {
    const [showCardbackLibrary, setShowCardbackLibrary] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [pendingDeleteName, setPendingDeleteName] = useState<string>("");
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const handleSelectCardback = useCallback(
        (cardbackId: string, cardbackName: string) => {
            if (!modalCard) return;

            // Fire and forget the DB updates so UI reacts instantly
            (async () => {
                const hasBleed = await lookupCardbackBleed(cardbackId);
                const selectedCards = useSelectionStore.getState().selectedCards;
                const isMultiSelect =
                    selectedCards.size > 1 && selectedCards.has(modalCard.uuid);
                let frontCardUuids: string[];
                if (applyToAll) {
                    const allFrontCards = await db.cards
                        .filter((c) => !c.linkedFrontId)
                        .toArray();
                    frontCardUuids = allFrontCards.map((c) => c.uuid);
                } else if (isMultiSelect) {
                    const selectedUuids = Array.from(selectedCards);
                    const cardsToUpdate = await db.cards.bulkGet(selectedUuids);
                    frontCardUuids = cardsToUpdate
                        .filter((c): c is CardOption => c !== undefined && !c.linkedFrontId)
                        .map((c) => c.uuid);
                } else {
                    frontCardUuids = [modalCard.uuid];
                }
                await undoableChangeCardback(
                    frontCardUuids,
                    cardbackId,
                    cardbackName,
                    hasBleed,
                );
                if (modalCard?.uuid) {
                    useSelectionStore
                        .getState()
                        .setFlipped([modalCard.uuid], selectedFace === "back");
                }
            })();
        },
        [modalCard, applyToAll, selectedFace]
    );

    const handleSetAsDefaultCardback = useCallback(
        async (cardbackId: string, cardbackName: string) => {
            const oldDefaultCardbackId = defaultCardbackId;
            setDefaultCardbackId(cardbackId);
            const hasBleed = await lookupCardbackBleed(cardbackId);
            const frontCardsWithoutBacks = await db.cards
                .filter((c) => !c.linkedFrontId && !c.linkedBackId)
                .toArray();
            for (const frontCard of frontCardsWithoutBacks) {
                await createLinkedBackCard(frontCard.uuid, cardbackId, cardbackName, {
                    hasBuiltInBleed: hasBleed,
                    usesDefaultCardback: true,
                });
            }
            if (oldDefaultCardbackId !== cardbackId) {
                const linkedBackCardsUsingDefault = await db.cards
                    .filter((c) => !!c.linkedFrontId && c.usesDefaultCardback === true)
                    .toArray();
                for (const backCard of linkedBackCardsUsingDefault) {
                    await changeCardArtwork(
                        backCard.imageId,
                        cardbackId,
                        backCard,
                        false,
                        cardbackName,
                        undefined,
                        undefined,
                        hasBleed,
                    );
                }
            }
        },
        [defaultCardbackId, setDefaultCardbackId]
    );

    const handleRequestDelete = useCallback(
        (cardbackId: string, cardbackName: string) => {
            setPendingDeleteId(cardbackId);
            setPendingDeleteName(cardbackName);
        },
        []
    );

    const handleExecuteDelete = useCallback(
        async (cardbackId: string) => {
            const isBuiltin = BUILTIN_CARDBACKS.some(b => b.id === cardbackId);
            if (isBuiltin) return;

            const isDeletingDefault = cardbackId === defaultCardbackId;
            const allCardbacks = await getAllCardbacks();
            const fallbackDefault =
                allCardbacks.find(
                    (cb) => cb.id !== cardbackId && cb.source === "builtin",
                ) || allCardbacks.find((cb) => cb.id !== cardbackId);
            if (isDeletingDefault && fallbackDefault) {
                await handleSetAsDefaultCardback(
                    fallbackDefault.id,
                    fallbackDefault.name,
                );
            }
            const newCardback = isDeletingDefault
                ? fallbackDefault
                : allCardbacks.find((cb) => cb.id === defaultCardbackId);
            if (newCardback) {
                const cardsUsingCardback = await db.cards
                    .filter(
                        (card) =>
                            card.imageId === cardbackId && card.linkedFrontId !== undefined,
                    )
                    .toArray();
                if (cardsUsingCardback.length > 0) {
                    await Promise.all(
                        cardsUsingCardback.map(async (backCard) => {
                            await db.cards.update(backCard.uuid, {
                                imageId: newCardback.id,
                                name: newCardback.name,
                                usesDefaultCardback: true,
                                needsEnrichment: false,
                                hasBuiltInBleed: newCardback.hasBuiltInBleed,
                            });
                        }),
                    );
                }
            }
            await db.cardbacks.delete(cardbackId);
        },
        [defaultCardbackId, handleSetAsDefaultCardback]
    );

    const confirmDelete = useCallback(async () => {
        if (!pendingDeleteId) return;
        if (dontShowAgain) {
            localStorage.setItem("cardback-delete-confirm-disabled", "true");
        }
        await handleExecuteDelete(pendingDeleteId);
        setPendingDeleteId(null);
        setDontShowAgain(false);
    }, [pendingDeleteId, dontShowAgain, handleExecuteDelete]);

    const cancelDelete = useCallback(() => {
        setPendingDeleteId(null);
        setDontShowAgain(false);
    }, []);

    return {
        showCardbackLibrary,
        setShowCardbackLibrary,
        pendingDeleteId,
        pendingDeleteName,
        dontShowAgain,
        setDontShowAgain,
        handleSelectCardback,
        handleSetAsDefaultCardback,
        handleRequestDelete,
        handleExecuteDelete,
        confirmDelete,
        cancelDelete,
    };
}
