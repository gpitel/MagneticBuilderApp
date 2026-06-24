import { defineStore } from 'pinia'
import { ref, watch, computed  } from 'vue'

export const useSettingsStore = defineStore("settings", () => {
    const loadingGif = ref("/images/loading.gif");
    const waitingTimeAfterChange = 200;
    const waitingTimeForPlottingAfterChange = 500;

    const catalogAdviserSettings = ref({
        advancedMode: true,
        useAllParts: false,
    })

    const coreAdviserSettings = ref({
        weights: null,
    })

    const adviserSettings = ref({
        useOnlyCoresInStock: true,
        allowDistributedGaps: true,
        allowStacks: true,
        allowToroidalCores: true,
        coreAdviseMode: "standard cores",
    })

    const magneticBuilderSettings = ref({
        useOnlyCoresInStock: true,
        allowDistributedGaps: true,
        allowStacks: true,
        allowToroidalCores: true,
        advancedMode: true,
        autoRedraw: true,
        // Optional whitelist of core shape families (case-insensitive codes
        // like "t", "e", "etd"). When null (default) all families MKF reports
        // are shown. When set to an array, both Basic and Advanced core
        // selectors only list families whose lowercase code is in the array.
        // Used by host apps (e.g. el-choker which only supports toroidal
        // cores) to restrict the catalog without forking MagneticBuilder.
        restrictedShapeFamilies: null,
    })

    const magneticAdviserSettings = ref({
        weights: null,
        maximumNumberResults: 6,
    })

    const operatingPointSettings = ref({
        advancedMode: true,
    })

    function reset() {
        this.adviserSettings ={
            useOnlyCoresInStock: true,
            allowDistributedGaps: true,
            allowStacks: true,
            allowToroidalCores: true,
            coreAdviseMode: "standard cores",
        };
        this.magneticBuilderSettings = {
            useOnlyCoresInStock: true,
            allowDistributedGaps: true,
            allowStacks: true,
            allowToroidalCores: true,
            advancedMode: true,
            autoRedraw: true,
            restrictedShapeFamilies: null,
        };
        this.coreAdviserSettings ={
            weights: null
        };
        this.magneticAdviserSettings ={
            weights: null,
            maximumNumberResults: 6,
        };
        this.operatingPointSettings ={
            advancedMode: true,
        };


        this.catalogAdviserSettings = {
            advancedMode: true,
            useAllParts: null,
        };


    }

    return {
        adviserSettings,
        magneticBuilderSettings,
        coreAdviserSettings,
        magneticAdviserSettings,
        operatingPointSettings,

        catalogAdviserSettings,

        reset,

        loadingGif,
        waitingTimeAfterChange,
        waitingTimeForPlottingAfterChange,
    }
},
{
    persist: true,
})
