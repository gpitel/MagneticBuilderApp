import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as Defaults from '/WebSharedComponents/assets/js/defaults.js'

export const useUserStore = defineStore("user", () => {

    const showWelcome = ref(true);



    const simulationUseCurrentAsInput = ref(1)
    const selectedModels = ref({
        gapReluctance: Defaults.reluctanceModelDefault,
        coreLosses: Defaults.coreLossesModelDefault,
        coreTemperature: Defaults.coreTemperatureModelDefault,
    })
    function reset() {

        this.simulationUseCurrentAsInput = 1
        this.selectedModels = {
            gapReluctance: Defaults.reluctanceModelDefault,
            coreLosses: Defaults.coreLossesModelDefault,
            coreTemperature: Defaults.coreTemperatureModelDefault,
        }
    }

    function setSelectedModels(variable, model) {
        this.selectedModels[variable] = model
    }
    function setSimulationUseCurrentAsInput(simulationUseCurrentAsInput) {
        this.simulationUseCurrentAsInput = simulationUseCurrentAsInput
    }
    return {
        showWelcome,

        simulationUseCurrentAsInput,
        setSimulationUseCurrentAsInput,

        setSelectedModels,
        selectedModels,
        reset,
    }
},
{
    persist: true,
})
