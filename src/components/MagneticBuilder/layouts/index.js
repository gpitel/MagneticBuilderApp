import { DEFAULT_BUILDER_LAYOUT } from './constants.js'
import LayoutColumns from './LayoutColumns.vue'
import LayoutRosano from './LayoutRosano.vue'
import LayoutCockpit from './LayoutCockpit.vue'
import LayoutCompare from './LayoutCompare.vue'
import LayoutPlanar from './LayoutPlanar.vue'

/**
 * The builder's layouts (ABT #1121).
 *
 * Every entry is one arrangement of the same components: same design, same
 * stores, same flags (see layoutProps.js). Adding one is a `.vue` file and an
 * entry here — the builder renders whichever the user picked in Settings, and
 * the layout contract test runs the same battery against all of them.
 *
 *   label        what Settings shows
 *   description  the one line under it
 *   component    the layout
 *   suitsPrinted true when it is the natural layout for a printed winding
 */
export const BUILDER_LAYOUTS = {
    columns: {
        label: 'Columns',
        description: 'Core, wire and coil side by side, graphs underneath.',
        component: LayoutColumns,
        suitsPrinted: false,
    },
    rosano: {
        label: 'Rosano',
        description: 'A row per part: what you set, what it gives you, and how it compares.',
        component: LayoutRosano,
        suitsPrinted: false,
    },
    cockpit: {
        label: 'Cockpit',
        description: 'Inputs in a rail, one large canvas, results always on screen.',
        component: LayoutCockpit,
        suitsPrinted: false,
    },
    compare: {
        label: 'Compare',
        description: 'The design pinned as reference against the alternatives to it.',
        component: LayoutCompare,
        suitsPrinted: false,
    },
    planar: {
        label: 'Planar',
        description: 'The layer stack in the middle, for printed windings.',
        component: LayoutPlanar,
        suitsPrinted: true,
    },
};

export { DEFAULT_BUILDER_LAYOUT } from './constants.js';

/**
 * Keys a stored preference may still carry from before a layout was renamed.
 * Without this, a profile holding 'bands' would silently fall back to the
 * default instead of opening the layout the user chose.
 */
const RENAMED_LAYOUTS = {
    bands: 'rosano',
};

/** The registry key a stored value means, following any rename. */
export function resolveLayoutKey(key) {
    return RENAMED_LAYOUTS[key] ?? key;
}

/** `{key: label}` for the Settings dropdown. */
export function layoutLabels() {
    const labels = {};
    for (const [key, layout] of Object.entries(BUILDER_LAYOUTS)) {
        labels[key] = layout.label;
    }
    return labels;
}

/**
 * The layout to render. An unknown key (an older profile, a hand-edited
 * localStorage) falls back to the default rather than rendering nothing.
 */
export function layoutComponent(key) {
    return (BUILDER_LAYOUTS[resolveLayoutKey(key)] ?? BUILDER_LAYOUTS[DEFAULT_BUILDER_LAYOUT]).component;
}

export function isKnownLayout(key) {
    return resolveLayoutKey(key) in BUILDER_LAYOUTS;
}
