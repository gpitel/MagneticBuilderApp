import { defineStore } from 'pinia'
import { ref, watch, computed  } from 'vue'
import * as MAS from '../assets/ts/MAS.ts'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import * as Defaults from '/WebSharedComponents/assets/js/defaults.js'

export const useMasStore = defineStore("mas", () => {

    const mas = ref(MAS.Convert.toMas(JSON.stringify(Defaults.powerMas)));
    const coreAdviserWeights = ref(null);

    const magneticAdviserWeights = ref(null);
    const magneticAdviserMaximumNumberResults = ref(6);
    const magneticManualOperatingPoints = ref([false]);
    const magneticCircuitSimulatorOperatingPoints = ref([false]);
    const magneticCircuitSimulatorColumnNames = ref([]);
    const magneticCircuitSimulatorAllLastReadColumnNames = ref([]);
    const magneticCircuitSimulatorConfirmedColumns = ref([]);

    function importedMas() {
    }
    function updatedTurnsRatios() {
    }
    function updatedInputExcitationWaveformUpdatedFromGraph(signalDescriptor) {
    }
    function updatedInputExcitationWaveformUpdatedFromProcessed(signalDescriptor) {
    }
    function updatedInputExcitationProcessed(signalDescriptor) {
    }

    function setMas(mas) {
        this.mas = null;
        this.mas = mas;
    }

    function resetMas() {
        this.coreAdviserWeights = null;
        this.mas = MAS.Convert.toMas(JSON.stringify(Defaults.powerMas));
        this.magneticManualOperatingPoints = [false];
        this.magneticCircuitSimulatorOperatingPoints = [false];
        this.magneticCircuitSimulatorColumnNames = [];
        this.magneticCircuitSimulatorAllLastReadColumnNames = [];
        this.magneticCircuitSimulatorConfirmedColumns = [];
        console.log("Resetting MAS")
    }

    const hasMirroredWindings = computed(() =>
        mas.value?.inputs?.designRequirements?.topology === 'commonModeChoke'
    );

    return {
        setMas,
        mas,
        hasMirroredWindings,
        resetMas,
        coreAdviserWeights,
        importedMas,
        updatedTurnsRatios,
        updatedInputExcitationWaveformUpdatedFromGraph,
        updatedInputExcitationWaveformUpdatedFromProcessed,
        updatedInputExcitationProcessed,
        magneticAdviserWeights,
        magneticAdviserMaximumNumberResults,
        magneticManualOperatingPoints,
        magneticCircuitSimulatorOperatingPoints,
        magneticCircuitSimulatorColumnNames,
        magneticCircuitSimulatorAllLastReadColumnNames,
        magneticCircuitSimulatorConfirmedColumns,
    }
},
{
    persist: true,
}
)
