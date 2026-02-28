
import {
  getMpcAutofillImageUrl,
  extractMpcIdentifierFromImageId,
} from "@/helpers/mpcAutofillApi";
import { ArtworkBleedSettings } from "../CardEditorModal/ArtworkBleedSettings";
import { ResponsiveModal } from "../common";
import type { ArtSource } from "../common/ArtSourceToggle";
import { ArtworkTabContent } from "./ArtworkTabContent";
import { useState, useEffect, useCallback, useRef } from "react";
import { useArtworkModalStore } from "@/store/artworkModal";
import { db } from "@/db";
import { AdvancedSearch } from "./AdvancedSearch";
import { useSettingsStore } from "@/store/settings";

import { useSelectionStore } from "@/store/selection";
import { useZoomShortcuts } from "@/hooks/useZoomShortcuts";
import { debugLog } from "@/helpers/debug";
import { usePinchToZoom } from "./hooks/usePinchToZoom";
import { useArtworkModalNavigation } from "./hooks/useArtworkModalNavigation";
import { useArtworkApplication } from "./hooks/useArtworkApplication";
import { usePreloadNeighborImages } from "./hooks/usePreloadNeighborImages";
import { DeleteCardbackModal } from "./DeleteCardbackModal";
import {
  ArtworkModalNavigationArrows,
  ArtworkModalSidebarHeader,
  ArtworkModalTabBars,
} from "./ArtworkModalHeader";

import { useArtworkSearch } from "./hooks/useArtworkSearch";
import { useCardbackManagement } from "./hooks/useCardbackManagement";
import { useArtworkDisplayMetadata } from "./hooks/useArtworkDisplayMetadata";

export function ArtworkModal() {
  const [applyToAll, setApplyToAll] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedFace, setSelectedFace] = useState<"front" | "back">(
    () => useArtworkModalStore.getState().initialFace,
  );
  const [activeTab, setActiveTab] = useState<"artwork" | "settings">(
    () => useArtworkModalStore.getState().initialTab,
  );
  const [artSource, setArtSource] = useState<ArtSource>("scryfall");
  const [mpcFiltersCollapsed, setMpcFiltersCollapsed] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [selectedArtState, setSelectedArtState] = useState<{
    cardUuid: string;
    artId: string;
  } | null>(null);
  const [lastOpenCardUuid, setLastOpenCardUuid] = useState<string | undefined>(
    undefined,
  );
  const [zoomLevel, setZoomLevel] = useState(1);

  const isModalOpen = useArtworkModalStore((state) => state.open);
  const modalCard = useArtworkModalStore((state) => state.card);
  const modalIndex = useArtworkModalStore((state) => state.index);
  const allCards = useArtworkModalStore((state) => state.allCards);
  const initialTab = useArtworkModalStore((state) => state.initialTab);
  const initialFace = useArtworkModalStore((state) => state.initialFace);
  const initialArtSource = useArtworkModalStore(
    (state) => state.initialArtSource,
  );
  const initialOpenAdvancedSearch = useArtworkModalStore(
    (state) => state.initialOpenAdvancedSearch,
  );
  const closeModal = useArtworkModalStore((state) => state.closeModal);
  const goToNextCard = useArtworkModalStore((state) => state.goToNextCard);
  const goToPrevCard = useArtworkModalStore((state) => state.goToPrevCard);

  const canGoPrev = modalIndex !== null && allCards.length > 1;
  const canGoNext = modalIndex !== null && allCards.length > 1;
  const navigationDirection = useArtworkModalStore((state) => state.navigationDirection);
  usePreloadNeighborImages({ allCards, currentIndex: modalIndex, navigationDirection, enabled: isModalOpen });

  const defaultCardbackId = useSettingsStore(
    (state) => state.defaultCardbackId,
  );
  const setDefaultCardbackId = useSettingsStore(
    (state) => state.setDefaultCardbackId,
  );

  const prefetchedData = useArtworkModalStore((s) => s.prefetchedData);

  const { isSearching, previewCardData, setPreviewCardData, handleSearch } = useArtworkSearch({ artSource });

  const {
    propsToRender,
    isDFC,
    tabLabels,
    showCardbackButton,
    isUploadLibraryItem,
    hasUploadLibraryItems,
  } = useArtworkDisplayMetadata({
    isModalOpen,
    modalCard,
    initialFace,
    selectedFace,
    prefetchedData,
    previewCardData,
    selectedArtState,
    setArtSource,
    setSelectedFace,
  });

  const {
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
  } = useCardbackManagement({
    isModalOpen,
    modalCard,
    selectedFace,
    applyToAll,
    defaultCardbackId,
    setDefaultCardbackId,
  });

  const {
    modalCard: rModalCard,
    linkedBackCard: rLinkedBackCard,
    selectedFace: rSelectedFace,
    previewCardData: rPreviewCardData,
    displayName: rDisplayName,
    displayPrints: rDisplayPrints,
    displaySelectedArtId: rDisplaySelectedArtId,
    finalProcessedDisplayUrl: rFinalProcessedDisplayUrl,
    activeCard: rActiveCard,
  } = propsToRender;

  if (isModalOpen && modalCard?.uuid && modalCard.uuid !== lastOpenCardUuid) {
    setLastOpenCardUuid(modalCard.uuid);
    setPreviewCardData(null);
    setApplyToAll(false);
    setIsSearchOpen(initialOpenAdvancedSearch);
    setShowCardbackLibrary(false);
    setActiveTab(initialTab);
    setSelectedFace(initialFace);
    let newSource: ArtSource = useSettingsStore.getState().preferredArtSource;
    if (initialArtSource) {
      newSource = initialArtSource;
    } else if (modalCard.imageId) {
      if (extractMpcIdentifierFromImageId(modalCard.imageId)) {
        newSource = "mpc";
      } else if (modalCard.isUserUpload) {
        newSource = "upload-library";
      } else {
        newSource = "scryfall";
      }
    }
    const tcg = useSettingsStore.getState().activeTcg;
    if (tcg === "pokemon") {
      newSource = "scryfall";
    }
    setArtSource(newSource);
  }

  useEffect(() => {
    if (!isModalOpen) {
      setLastOpenCardUuid(undefined);
    } else if (modalCard && initialFace) {
      useSelectionStore
        .getState()
        .setFlipped([modalCard.uuid], initialFace === "back");
    }
  }, [isModalOpen, modalCard, initialFace]);

  const handleFaceTabChange = useCallback((face: "front" | "back") => {
    setSelectedFace(face);
  }, []);

  const setSelectedArtId = (artId: string) => {
    if (modalCard?.uuid) {
      setSelectedArtState({ cardUuid: modalCard.uuid, artId });
    }
  };
  const setAppliedMpcCardId = useCallback(
    (mpcId: string) => {
      const url = getMpcAutofillImageUrl(mpcId);
      if (url) setSelectedArtId(url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modalCard?.uuid],
  );

  useEffect(() => {
    if (
      isModalOpen &&
      modalCard &&
      !modalCard.imageId &&
      !previewCardData &&
      !isSearching
    ) {
      void handleSearch(modalCard.name, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, modalCard?.uuid, modalCard?.imageId]);

  const handleSaveName = useCallback(async () => {
    if (!editedName.trim() || !rActiveCard) return;
    const newName = editedName.trim();
    await db.cards.update(rActiveCard.uuid, { name: newName });
    if (rActiveCard.uuid === modalCard?.uuid) {
      const updated = await db.cards.get(rActiveCard.uuid);
      if (updated) {
        useArtworkModalStore.getState().updateCard(updated);
      }
    }
    setIsEditingName(false);
  }, [editedName, rActiveCard, modalCard]);

  const lastAutoAppliedRef = useRef<{ cardUuid: string; imageUrl: string } | null>(null);

  useEffect(() => {
    const imageUrl = rPreviewCardData?.imageUrls?.[0];
    if (imageUrl && rActiveCard) {
      const key = { cardUuid: rActiveCard.uuid, imageUrl };
      if (
        lastAutoAppliedRef.current?.cardUuid === key.cardUuid &&
        lastAutoAppliedRef.current?.imageUrl === key.imageUrl
      ) {
        return;
      }
      lastAutoAppliedRef.current = key;
      debugLog(
        "[ArtworkModal] auto-apply: previewCardData changed, applying first print:",
        imageUrl.substring(0, 80),
      );
      void handleSelectArtwork(imageUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rPreviewCardData]);

  const { handleSelectArtwork, handleSelectMpcArt, handleSelectUploadLibraryArt } =
    useArtworkApplication({
      activeCard: rActiveCard,
      modalCard: rModalCard,
      linkedBackCard: rLinkedBackCard,
      selectedFace: rSelectedFace,
      applyToAll,
      isDFC,
      previewCardData: rPreviewCardData,
      displayPrints: rDisplayPrints,
      artSource,
      setSelectedArtId,
      setAppliedMpcCardId,
      setPreviewCardData,
      handleFaceTabChange,
    });

  useZoomShortcuts({
    setZoom: setZoomLevel,
    isOpen: isModalOpen && activeTab === "artwork",
    minZoom: 0.5,
    maxZoom: 3,
  });

  const { containerRef: contentRef } = usePinchToZoom({
    zoomLevel,
    setZoomLevel,
  });

  const handleGoToNextCard = useCallback(() => {
    if (canGoNext) goToNextCard();
  }, [canGoNext, goToNextCard]);

  const handleGoToPrevCard = useCallback(() => {
    if (canGoPrev) goToPrevCard();
  }, [canGoPrev, goToPrevCard]);

  useArtworkModalNavigation({
    isModalOpen,
    isSearching,
    isEditingName,
    canGoPrev,
    canGoNext,
    onPrev: handleGoToPrevCard,
    onNext: handleGoToNextCard,
  });

  if (!modalCard && isModalOpen) {
    return null;
  }

  // --- Render ---
  return (
    <>
      {isModalOpen && (
        <ArtworkModalNavigationArrows
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={handleGoToPrevCard}
          onNext={handleGoToNextCard}
        />
      )}
      <ResponsiveModal
        isOpen={isModalOpen}
        onClose={pendingDeleteId ? () => { } : closeModal}
        mobileLandscapeSidebar
        header={
          <ArtworkModalSidebarHeader
            previewCardData={rPreviewCardData}
            showCardbackLibrary={showCardbackLibrary}
            setPreviewCardData={() => setPreviewCardData(null)}
            setShowCardbackLibrary={setShowCardbackLibrary}
            displayName={rDisplayName}
            isUploadLibraryItem={isUploadLibraryItem}
            isEditingName={isEditingName}
            editedName={editedName}
            setEditedName={setEditedName}
            setIsEditingName={setIsEditingName}
            onSaveName={handleSaveName}
            modalIndex={modalIndex}
            allCardsLength={allCards.length}
            onClose={closeModal}
            activeTab={activeTab}
            artSource={artSource}
            setArtSource={setArtSource}
            hasUploadLibraryItems={hasUploadLibraryItems}
          />
        }
      >
        <div
          ref={contentRef}
          className="flex-1 flex flex-col overflow-hidden max-lg:landscape:overflow-auto min-h-0"
        >
          <ArtworkModalTabBars
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            selectedFace={rSelectedFace}
            onFaceTabChange={handleFaceTabChange}
            tabLabels={tabLabels}
            showCardbackButton={!!showCardbackButton}
            showCardbackLibrary={showCardbackLibrary}
            setShowCardbackLibrary={setShowCardbackLibrary}
            onClose={closeModal}
          />
          {activeTab === "artwork" && (
            <ArtworkTabContent
              modalCard={rModalCard}
              linkedBackCard={rLinkedBackCard}
              selectedFace={rSelectedFace}
              isDFC={isDFC}
              previewCardData={rPreviewCardData}
              showCardbackLibrary={showCardbackLibrary}
              setShowCardbackLibrary={setShowCardbackLibrary}
              applyToAll={applyToAll}
              setApplyToAll={setApplyToAll}
              tabLabels={tabLabels}
              defaultCardbackId={defaultCardbackId}
              hasUploadLibraryItems={hasUploadLibraryItems}
              displayName={rDisplayName}
              displayPrints={rDisplayPrints}
              displaySelectedArtId={rDisplaySelectedArtId}
              finalProcessedDisplayUrl={rFinalProcessedDisplayUrl}
              zoomLevel={zoomLevel}
              onOpenSearch={() => setIsSearchOpen(true)}
              onSelectCardback={handleSelectCardback}
              onSetAsDefaultCardback={handleSetAsDefaultCardback}
              onSelectArtwork={handleSelectArtwork}
              onSelectMpcArt={handleSelectMpcArt}
              onSelectUploadLibraryArt={handleSelectUploadLibraryArt}
              onClose={closeModal}
              onRequestDelete={handleRequestDelete}
              onExecuteDelete={handleExecuteDelete}
              artSource={artSource}
              setArtSource={setArtSource}
              mpcFiltersCollapsed={mpcFiltersCollapsed}
              onMpcFiltersCollapsedChange={setMpcFiltersCollapsed}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              setSelectedFace={handleFaceTabChange}
              setZoomLevel={setZoomLevel}
              showCardbackButtonProp={showCardbackButton ?? undefined}
            />
          )}
          {activeTab === "settings" && modalCard && (
            <div className="flex flex-col flex-1 min-h-0 rounded-b-2xl overflow-hidden">
              <ArtworkBleedSettings selectedFace={selectedFace} />
            </div>
          )}
        </div>
      </ResponsiveModal>
      <AdvancedSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectCard={(name, mpcImageUrl, specificPrint) => {
          debugLog("[ArtworkModal] onSelectCard:", {
            name,
            mpcImageUrl: mpcImageUrl?.substring(0, 80),
            specificPrint,
            currentArtSource: artSource,
          });
          if (mpcImageUrl) {
            debugLog(
              "[ArtworkModal] onSelectCard: MPC path - calling handleSelectMpcArt",
            );
            const identifier = mpcImageUrl.split("id=")[1] || "";
            handleSelectMpcArt({
              identifier,
              name,
              smallThumbnailUrl: "",
              mediumThumbnailUrl: "",
              dpi: 0,
              tags: [],
              sourceName: "",
              source: "",
              extension: "",
              size: 0,
            }).then(() => setIsSearchOpen(false));
          } else {
            debugLog(
              "[ArtworkModal] onSelectCard: Scryfall path - calling handleSearch",
            );
            handleSearch(name, true, specificPrint);
          }
        }}
        onUploadLibraryItemSelect={(upload) => {
          handleSelectUploadLibraryArt(upload).then(() => {
            setArtSource("upload-library");
            setIsSearchOpen(false);
          });
        }}
        initialSource={artSource}
      />
      <DeleteCardbackModal
        pendingDeleteId={pendingDeleteId}
        pendingDeleteName={pendingDeleteName}
        defaultCardbackId={defaultCardbackId}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={setDontShowAgain}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
}
