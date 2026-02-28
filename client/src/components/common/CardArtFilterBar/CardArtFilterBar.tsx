import {
  MpcFilterBar,
  type MpcFilterProps,
} from "./MpcFilterBar";
import {
  ScryfallFilterBar,
  type ScryfallFilterProps,
} from "./ScryfallFilterBar";
import {
  PokemonFilterBar,
  type PokemonFilterProps,
} from "./PokemonFilterBar";
import { UploadLibraryFilterBar, type UploadLibraryFilterProps } from "./UploadLibraryFilterBar";
import { CardbackFilterBar, type CardbackFilterProps } from "./CardbackFilterBar";

export type { MpcFilterProps, ScryfallFilterProps, PokemonFilterProps, UploadLibraryFilterProps, CardbackFilterProps };
export type CardArtFilterBarProps =
  | MpcFilterProps
  | ScryfallFilterProps
  | PokemonFilterProps
  | UploadLibraryFilterProps
  | CardbackFilterProps;

/**
 * Unified filter bar for MPC, Scryfall, Pokemon/TCGdex, and Upload Library.
 * Delegates to specific sub-components based on `mode`.
 */
export function CardArtFilterBar(props: CardArtFilterBarProps) {
  const { mode } = props;

  if (mode === "mpc") {
    return <MpcFilterBar {...(props as MpcFilterProps)} />;
  }

  if (mode === "scryfall") {
    return <ScryfallFilterBar {...(props as ScryfallFilterProps)} />;
  }

  if (mode === "pokemon") {
    return <PokemonFilterBar {...(props as PokemonFilterProps)} />;
  }

  if (mode === "upload-library") {
    return <UploadLibraryFilterBar {...(props as UploadLibraryFilterProps)} />;
  }

  if (mode === "cardback") {
    return <CardbackFilterBar {...(props as CardbackFilterProps)} />;
  }

  return null;
}
