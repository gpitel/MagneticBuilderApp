import { defineStore } from 'pinia'
import { ref, watch, computed  } from 'vue'
import { DEFAULT_BUILDER_LAYOUT } from '../components/MagneticBuilder/layouts/constants.js'

export const useMagneticBuilderSettingsStore = defineStore("magneticBuilderSettings", () => {
    const enableVisualizers = ref(true);
    const enableSimulation = ref(true);
    const enableAutoSimulation = ref(true);
    const enableSubmenu = ref(true);
    const enableCustomize = ref(true);
    const enableGraphs = ref(false);
    const enableContextMenu = ref(false);
    // Winding Studio (interactive cross-section editor). Feature-flagged:
    // default off; the whole feature is removable by deleting the
    // WindingStudio/ folder and the few call sites guarded by this flag.
    const enableWindingStudio = ref(false);

    // Which arrangement of the builder is on screen (ABT #1121). A key of
    // BUILDER_LAYOUTS in components/MagneticBuilder/layouts/index.js; an
    // unknown one falls back to the default rather than rendering nothing.
    // Roams with the profile, like the other builder preferences.
    const layout = ref(DEFAULT_BUILDER_LAYOUT);

    // Track if simulation data is outdated (persists across component remounts)
    const coilDataOutdated = ref(false);
    const coreDataOutdated = ref(false);
    const wireDataOutdated = ref(false);

    function reset() {
        this.enableVisualizers = true;
        this.enableSimulation = true;
        this.enableAutoSimulation = true;
        this.enableSubmenu = true;
        this.enableCustomize = true;
        this.enableGraphs = true;
        this.enableContextMenu = false;
        this.enableWindingStudio = false;
        this.layout = DEFAULT_BUILDER_LAYOUT;
        this.coilDataOutdated = false;
        this.coreDataOutdated = false;
        this.wireDataOutdated = false;
    }

    return {
        enableVisualizers,
        enableSimulation,
        enableAutoSimulation,
        enableSubmenu,
        enableCustomize,
        enableGraphs,
        enableContextMenu,
        enableWindingStudio,
        layout,
        coilDataOutdated,
        coreDataOutdated,
        wireDataOutdated,
        reset,
    }
},
{
    persist: true,
})
