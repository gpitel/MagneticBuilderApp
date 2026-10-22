import { defineStore } from 'pinia'
import { ref } from 'vue'

// MKF's findings on the last simulation of each MAS store (ABT #1855): simulate returns numbers for
// every operating point and analyze_results says which of them describe a saturating core, a voltage
// that is not volt-second balanced, a temperature above a limit or a core past its material's data,
// each naming its operating point. They are MKF's verdict on those outputs, not part of the MAS, so
// they live here and are replaced by every simulation and dropped when a simulation fails.
export const useSimulationFindingsStore = defineStore("simulationFindings", () => {
    // MAS store id -> [{operatingPointIndex, operatingPointName?, code, message}]
    const findingsByMas = ref({});

    function set(masStoreId, findings) {
        findingsByMas.value = { ...findingsByMas.value, [masStoreId]: findings };
    }

    function clear(masStoreId) {
        if (masStoreId in findingsByMas.value) {
            const { [masStoreId]: dropped, ...kept } = findingsByMas.value;
            findingsByMas.value = kept;
        }
    }

    function of(masStoreId) {
        return findingsByMas.value[masStoreId] ?? [];
    }

    return { findingsByMas, set, clear, of };
});
