import { useState, useEffect, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import {
    getFaceNamesFromPrints,
    computeTabLabels,
    getCurrentCardFace,
} from "@/helpers/dfcHelpers";
import { extractMpcIdentifierFromImageId } from "@/helpers/mpcAutofillApi";
import { type ScryfallCard, type CardOption, ImageSource } from "../../../../../shared/types";
import type { ArtSource } from "../../common/ArtSourceToggle";
import type { PrintInfo } from "@/types";
import type { Image, Cardback } from "@/db";

interface PrefetchedData {
    cachedCardPrints: PrintInfo[] | null | undefined;
    imageObject: Image | Cardback | null | undefined;
    linkedBackCard: CardOption | null | undefined;
}

interface UseArtworkDisplayMetadataProps {
    isModalOpen: boolean;
    modalCard: CardOption | null;
    initialFace: "front" | "back";
    selectedFace: "front" | "back";
    prefetchedData: PrefetchedData;
    previewCardData: ScryfallCard | null;
    selectedArtState: { cardUuid: string; artId: string } | null;
    setArtSource: (source: ArtSource) => void;
    setSelectedFace: (face: "front" | "back") => void;
}

export function useArtworkDisplayMetadata({
    isModalOpen,
    modalCard,
    initialFace,
    selectedFace,
    prefetchedData,
    previewCardData,
    selectedArtState,
    setArtSource,
    setSelectedFace,
}: UseArtworkDisplayMetadataProps) {
    const linkedBackCardLive = useLiveQuery(
        () =>
            modalCard?.linkedBackId ? db.cards.get(modalCard.linkedBackId) : undefined,
        [modalCard?.linkedBackId]
    );
    const linkedBackCard =
        prefetchedData?.linkedBackCard !== undefined &&
            modalCard?.linkedBackId === prefetchedData?.linkedBackCard?.uuid
            ? prefetchedData?.linkedBackCard || undefined
            : linkedBackCardLive;

    const hasUploadLibraryItems = useLiveQuery(
        () => db.user_images.count().then((c) => c > 0),
        [],
        false
    );

    const autoMpcSetForBackCardId = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (selectedFace === "back" && linkedBackCard?.imageId) {
            if (autoMpcSetForBackCardId.current !== linkedBackCard.imageId) {
                if (extractMpcIdentifierFromImageId(linkedBackCard.imageId)) {
                    setArtSource("mpc");
                    autoMpcSetForBackCardId.current = linkedBackCard.imageId;
                }
            }
        }
    }, [selectedFace, linkedBackCard?.imageId, setArtSource]);

    const activeCard =
        selectedFace === "back" && linkedBackCard ? linkedBackCard : modalCard;

    const imageObjectLive =
        useLiveQuery(async () => {
            if (!activeCard?.imageId) return undefined;
            const img = await db.images.get(activeCard.imageId);
            if (img && (img.displayBlob || img.originalBlob)) {
                return img;
            }
            if (activeCard.source === ImageSource.Cardback || activeCard.imageId.startsWith('cardback_')) {
                const cb = await db.cardbacks.get(activeCard.imageId);
                if (cb) {
                    return img ? { ...cb, ...img } as typeof img : cb;
                }
            }
            return img;
        }, [activeCard?.imageId]) || null;
    const imageObject =
        prefetchedData?.imageObject !== undefined
            ? prefetchedData?.imageObject
            : imageObjectLive;

    const previousBlobRef = useRef<Blob | null>(null);
    const previousUrlRef = useRef<string | null>(null);

    const processedDisplayUrl = useMemo(() => {
        const currentBlob = imageObject?.displayBlob ?? null;
        if (currentBlob === previousBlobRef.current) {
            return previousUrlRef.current;
        }
        if (previousUrlRef.current) {
            URL.revokeObjectURL(previousUrlRef.current);
        }
        const newUrl = currentBlob ? URL.createObjectURL(currentBlob) : null;
        previousBlobRef.current = currentBlob;
        previousUrlRef.current = newUrl;
        return newUrl;
    }, [imageObject?.displayBlob]);

    useEffect(() => {
        return () => {
            if (previousUrlRef.current) {
                URL.revokeObjectURL(previousUrlRef.current);
            }
        };
    }, []);

    const cardImageId = activeCard?.imageId || undefined;
    const selectedArtId =
        selectedArtState && selectedArtState.cardUuid === activeCard?.uuid
            ? selectedArtState.artId
            : null;
    const effectiveArtId = selectedArtId ?? cardImageId;

    const displayName = previewCardData?.name || activeCard?.name;

    const displayImageUrls = useMemo(() => {
        return (
            previewCardData?.imageUrls ||
            (imageObject && "imageUrls" in imageObject
                ? imageObject.imageUrls
                : undefined)
        );
    }, [previewCardData?.imageUrls, imageObject]);

    const isImageObjectReady =
        imageObject &&
        ("id" in imageObject ? imageObject.id === activeCard?.imageId : true);

    const cachedCardPrintsLive = useLiveQuery(
        async () => {
            if (!modalCard?.name) return null;
            const entry = await db.cardMetadataCache
                .where("name")
                .equals(modalCard.name)
                .first();
            return entry?.hasFullPrints ? entry.data.prints : null;
        },
        [modalCard?.name]
    );
    const cachedCardPrints =
        prefetchedData?.cachedCardPrints !== undefined
            ? prefetchedData?.cachedCardPrints
            : cachedCardPrintsLive;

    const isDataReady =
        (!activeCard?.imageId || !!previewCardData || !!isImageObjectReady) &&
        cachedCardPrints !== undefined;

    const displayPrints =
        previewCardData?.prints ?? (cachedCardPrints || undefined);
    const displaySelectedArtId =
        previewCardData?.imageUrls?.[0] || effectiveArtId;
    const finalProcessedDisplayUrl =
        !previewCardData && effectiveArtId === cardImageId
            ? processedDisplayUrl
            : null;

    const currentRenderProps = useMemo(
        () => ({
            modalCard,
            linkedBackCard,
            selectedFace,
            isDFC: false,
            previewCardData,
            displayName,
            displayImageUrls,
            displayPrints,
            displaySelectedArtId,
            finalProcessedDisplayUrl,
            displayBleedWidth: imageObject?.displayBleedWidth,
            activeCard,
        }),
        [
            modalCard,
            linkedBackCard,
            selectedFace,
            previewCardData,
            displayName,
            displayImageUrls,
            displayPrints,
            displaySelectedArtId,
            finalProcessedDisplayUrl,
            imageObject,
            activeCard,
        ]
    );

    const [frozenProps, setFrozenProps] = useState(currentRenderProps);

    useEffect(() => {
        if (isDataReady) {
            setFrozenProps(currentRenderProps);
        }
    }, [isDataReady, currentRenderProps]);

    const propsToRender = isDataReady ? currentRenderProps : frozenProps;

    const faceNames = useMemo(
        () => getFaceNamesFromPrints(propsToRender.displayPrints),
        [propsToRender.displayPrints]
    );

    const isUsingCardbackLibrary = propsToRender.linkedBackCard?.imageId
        ? (propsToRender.linkedBackCard.source === ImageSource.Cardback || propsToRender.linkedBackCard.imageId.startsWith('cardback_'))
        : false;

    const isDFC = faceNames.length > 1;

    propsToRender.isDFC = isDFC; // Used internally and passed back

    const dfcBackFaceName = faceNames[1] || null;

    const showCardbackButton =
        selectedFace === 'back' &&
        !isDFC &&
        !!propsToRender.linkedBackCard &&
        !isUsingCardbackLibrary;

    const isUploadLibraryItem = !!propsToRender.activeCard?.isUserUpload;

    const tabLabels = useMemo(
        () =>
            computeTabLabels(
                faceNames,
                propsToRender.modalCard?.name || "Card",
                propsToRender.linkedBackCard?.name
            ),
        [faceNames, propsToRender.modalCard?.name, propsToRender.linkedBackCard?.name]
    );

    const hasAutoSelectedFace = useRef(false);
    const currentCardFace = useMemo(
        () =>
            getCurrentCardFace(
                isDFC,
                propsToRender.modalCard?.name || "",
                dfcBackFaceName || undefined
            ),
        [isDFC, dfcBackFaceName, propsToRender.modalCard?.name]
    );

    useEffect(() => {
        if (
            isModalOpen &&
            isDFC &&
            !hasAutoSelectedFace.current &&
            initialFace !== "back"
        ) {
            setSelectedFace(currentCardFace);
            hasAutoSelectedFace.current = true;
        }
    }, [isModalOpen, isDFC, currentCardFace, initialFace, setSelectedFace]);

    useEffect(() => {
        if (!isModalOpen) {
            hasAutoSelectedFace.current = false;
        }
    }, [isModalOpen]);

    return {
        propsToRender,
        isDFC,
        tabLabels,
        showCardbackButton,
        isUploadLibraryItem,
        hasUploadLibraryItems,
    };
}
