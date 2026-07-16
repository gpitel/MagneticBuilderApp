import { defineStore } from 'pinia'

// Contract-shape copy of WebFrontend's accounts inventory store (same id,
// same state keys). When MagneticBuilder is embedded in WebFrontend, the host
// registers its FULL implementation (fetchContext/applyScope/loadEngineContext)
// under this id first, so useInventoryStore() here returns the host's store.
// Standalone MB (and other consumer repos) have no accounts backend: this
// minimal copy keeps scope at 'public' and engineContextLoaded at false, so
// the taskQueue wire-advise routing always takes the classic full-catalog
// path. Do NOT add behavior here — the implementation lives in
// WebFrontend/src/stores/inventory.js.
export const useInventoryStore = defineStore("inventory", {
    state: () => {
        return {
            scope: 'public',
            context: null,
            catalogRefs: null,
            fetchedAt: null,
            lastError: null,
            engineContextLoaded: false,
        };
    },
    persist: {
        pick: ['scope'],
    },
})
