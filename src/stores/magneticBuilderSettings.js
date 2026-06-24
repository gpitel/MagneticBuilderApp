import { defineStore } from 'pinia'
import { ref, watch, computed  } from 'vue'

export const useMagneticBuilderSettingsStore = defineStore("magneticBuilderSettings", () => {
    const enableVisualizers = ref(true);
    const enableSimulation = ref(true);
    const enableAutoSimulation = ref(true);
    const enableSubmenu = ref(true);
    const enableCustomize = ref(true);
    const enableGraphs = ref(false);
    const enableContextMenu = ref(false);
    
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
        coilDataOutdated,
        coreDataOutdated,
        wireDataOutdated,
        reset,
    }
},
{
    persist: true,
})
