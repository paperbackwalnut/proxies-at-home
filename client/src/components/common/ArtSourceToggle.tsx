import { ToggleButtonGroup, type ToggleButtonGroupProps } from './ToggleButtonGroup';
import { useSettingsStore } from '@/store/settings';
import { getTcgConfig } from '@/config/tcgConfig';

import { ImageSource } from '../../db';

export type ArtSource = typeof ImageSource.Scryfall | typeof ImageSource.MPC | typeof ImageSource.UploadLibrary;

const SCRYFALL_OPTION = { id: ImageSource.Scryfall, label: 'Scryfall', highlightColor: '#431e3f' };
const MPC_OPTION = { id: ImageSource.MPC, label: 'MPC Autofill', highlightColor: 'rgb(76, 155, 232)' };

const UPLOAD_LIBRARY_OPTION = { id: ImageSource.UploadLibrary, label: 'My Uploads', highlightColor: '#2d7a4f' };

type ArtSourceToggleProps = {
    value: ArtSource;
    onChange: (value: ArtSource) => void;
    reversed?: boolean;
    showUploadLibrary?: boolean;
} & Omit<ToggleButtonGroupProps<ArtSource>, 'options' | 'value' | 'onChange'>;

export function ArtSourceToggle({
    value,
    onChange,
    reversed = false,
    showUploadLibrary = false,
    ...rest
}: ArtSourceToggleProps) {
    const activeTcg = useSettingsStore((s) => s.activeTcg ?? 'mtg');
    const cfg = getTcgConfig(activeTcg);

    const baseOptions: Array<{ id: ArtSource; label: string; highlightColor: string }> = [
        { id: ImageSource.Scryfall, label: cfg.searchSourceLabel, highlightColor: cfg.searchSourceColor },
        ...(cfg.hasMpcSource ? [{ id: ImageSource.MPC, label: 'MPC Autofill', highlightColor: 'rgb(76, 155, 232)' }] : []),
    ];

    const base = showUploadLibrary ? [...baseOptions, UPLOAD_LIBRARY_OPTION] : baseOptions;
    const options = reversed ? [...base].reverse() : base;

    return (
        <ToggleButtonGroup
            options={options}
            value={value}
            onChange={onChange}
            {...rest}
        />
    );
}
