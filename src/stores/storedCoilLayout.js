import { defineStore } from 'pinia'
import { ref } from 'vue'

// A coil that arrives already wound (a loaded MAS file) carries the layout its author
// saw and simulated. The coil panel can only re-create a layout from its own knobs
// (pattern, proportions, margins, alignments), which it derives back from the stored
// sections; winding again from those is not the same layout (ABT #1838: the re-wind of
// a loaded 1212121 stack came out 15 % taller than the winding window). So the stored
// layout stays until something a wind depends on changes.
//
// This store holds, per MAS store, the signature of the wind inputs the stored layout
// stands for. The coil panel compares it before every wind: same inputs, the stored
// layout is kept; different inputs, the coil is wound and the entry is dropped.
// Persisted, so that leaving the builder and coming back, or reloading the page, does
// not wind the loaded coil either. Only a hash is kept, never the design.
export const useStoredCoilLayoutStore = defineStore("storedCoilLayout", () => {
    // MAS store id -> hash of the wind inputs (BasicCoilSelector.windInputsSignature).
    const signatures = ref({});

    function keep(masStoreId, signature) {
        signatures.value = { ...signatures.value, [masStoreId]: signature };
    }

    function drop(masStoreId) {
        if (masStoreId in signatures.value) {
            const { [masStoreId]: dropped, ...kept } = signatures.value;
            signatures.value = kept;
        }
    }

    function signatureFor(masStoreId) {
        return signatures.value[masStoreId] ?? null;
    }

    return {
        signatures,
        keep,
        drop,
        signatureFor,
    }
},
{
    persist: true,
})
