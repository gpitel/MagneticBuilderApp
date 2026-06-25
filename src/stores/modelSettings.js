import { defineStore, getActivePinia } from 'pinia'
import { ref, watch } from 'vue'

// Helper to convert array of strings to dictionary (key=value)
function arrayToDict(arr) {
    const dict = {}
    arr.forEach(item => {
        dict[item] = item
    })
    return dict
}

export const useModelSettingsStore = defineStore("modelSettings", () => {
    // Model values (display names as strings)
    const magneticFieldStrengthModel = ref(null)
    const magneticFieldStrengthFringingEffectModel = ref(null)
    const reluctanceModel = ref(null)
    const coreLossesModel = ref(null)
    const coreTemperatureModel = ref(null)
    const coreThermalResistanceModel = ref(null)
    const windingSkinEffectLossesModel = ref(null)
    const windingProximityEffectLossesModel = ref(null)
    const strayCapacitanceModel = ref(null)
    
    // Toggle for manual winding losses selection
    const coilEnableUserWindingLossesModels = ref(false)

    // Painter resolution settings
    const painterNumberPointsX = ref(25)
    const painterNumberPointsY = ref(50)

    // Available options (dictionaries loaded from WASM)
    const availableMagneticFieldStrengthModels = ref({})
    const availableFringingEffectModels = ref({})
    const availableReluctanceModels = ref({})
    const availableWindingSkinEffectModels = ref({})
    const availableWindingProximityEffectModels = ref({})
    const availableStrayCapacitanceModels = ref({})
    const availableCoreLossesMethods = ref([])
    const availableCoreLossesMethodsLoading = ref(false)
    const availableCoreLossesMethodsError = ref(null)
    
    // Track initialization
    const isInitialized = ref(false)
    const isLoading = ref(false)

    // Load all available model lists from WASM
    async function loadAvailableModels() {
        try {
            const { waitForMkf } = await import('/WebSharedComponents/assets/js/mkfRuntime')
            const mkf = await waitForMkf()
            
            // Fetch all model lists in parallel
            const [
                magneticFieldStrength,
                fringingEffect,
                reluctance,
                skinEffect,
                proximityEffect,
                strayCapacitance
            ] = await Promise.all([
                mkf.get_all_magnetic_field_strength_models(),
                mkf.get_all_fringing_effect_models(),
                mkf.get_all_reluctance_models(),
                mkf.get_all_winding_skin_effect_models(),
                mkf.get_all_winding_proximity_effect_models(),
                mkf.get_all_stray_capacitance_models()
            ])
            
            // Convert arrays to dictionaries
            availableMagneticFieldStrengthModels.value = arrayToDict(JSON.parse(magneticFieldStrength))
            availableFringingEffectModels.value = arrayToDict(JSON.parse(fringingEffect))
            availableReluctanceModels.value = arrayToDict(JSON.parse(reluctance))
            availableWindingSkinEffectModels.value = arrayToDict(JSON.parse(skinEffect))
            availableWindingProximityEffectModels.value = arrayToDict(JSON.parse(proximityEffect))
            availableStrayCapacitanceModels.value = arrayToDict(JSON.parse(strayCapacitance))
            
        } catch (error) {
            console.error('[ModelSettings] Failed to load available models:', error)
        }
    }

    // Load current settings from WASM
    async function loadFromWASM() {
        isLoading.value = true
        try {
            const { waitForMkf } = await import('/WebSharedComponents/assets/js/mkfRuntime')
            const mkf = await waitForMkf()
            
            // First load available model lists
            await loadAvailableModels()
            
            const settings = JSON.parse(await mkf.get_settings())
            
            
            // Settings come as integers, convert to display names using available models
            const magneticFieldStrengthOptions = Object.keys(availableMagneticFieldStrengthModels.value)
            const fringingEffectOptions = Object.keys(availableFringingEffectModels.value)
            const reluctanceOptions = Object.keys(availableReluctanceModels.value)
            const skinEffectOptions = Object.keys(availableWindingSkinEffectModels.value)
            const proximityEffectOptions = Object.keys(availableWindingProximityEffectModels.value)
            const strayCapacitanceOptions = Object.keys(availableStrayCapacitanceModels.value)
            
            // Map integer indices to display names (or set first available as default)
            if (settings.magneticFieldStrengthModel !== undefined && settings.magneticFieldStrengthModel < magneticFieldStrengthOptions.length) {
                magneticFieldStrengthModel.value = magneticFieldStrengthOptions[settings.magneticFieldStrengthModel]
            } else if (magneticFieldStrengthOptions.length > 0) {
                magneticFieldStrengthModel.value = magneticFieldStrengthOptions[0]
            }
            if (settings.magneticFieldStrengthFringingEffectModel !== undefined && settings.magneticFieldStrengthFringingEffectModel < fringingEffectOptions.length) {
                magneticFieldStrengthFringingEffectModel.value = fringingEffectOptions[settings.magneticFieldStrengthFringingEffectModel]
            } else if (fringingEffectOptions.length > 0) {
                magneticFieldStrengthFringingEffectModel.value = fringingEffectOptions[0]
            }
            if (settings.reluctanceModel !== undefined && settings.reluctanceModel < reluctanceOptions.length) {
                reluctanceModel.value = reluctanceOptions[settings.reluctanceModel]
            } else if (reluctanceOptions.length > 0) {
                reluctanceModel.value = reluctanceOptions[0]
            }
            if (settings.coreLossesModel !== undefined) {
                // Core losses model depends on available methods
                coreLossesModel.value = settings.coreLossesModel
            }
            if (settings.coreTemperatureModel !== undefined) {
                coreTemperatureModel.value = settings.coreTemperatureModel
            }
            if (settings.coreThermalResistanceModel !== undefined) {
                coreThermalResistanceModel.value = settings.coreThermalResistanceModel
            }
            if (settings.windingSkinEffectLossesModel !== undefined && settings.windingSkinEffectLossesModel < skinEffectOptions.length) {
                windingSkinEffectLossesModel.value = skinEffectOptions[settings.windingSkinEffectLossesModel]
            } else if (skinEffectOptions.length > 0) {
                windingSkinEffectLossesModel.value = skinEffectOptions[0]
            }
            if (settings.windingProximityEffectLossesModel !== undefined && settings.windingProximityEffectLossesModel < proximityEffectOptions.length) {
                windingProximityEffectLossesModel.value = proximityEffectOptions[settings.windingProximityEffectLossesModel]
            } else if (proximityEffectOptions.length > 0) {
                windingProximityEffectLossesModel.value = proximityEffectOptions[0]
            }
            if (settings.strayCapacitanceModel !== undefined && settings.strayCapacitanceModel < strayCapacitanceOptions.length) {
                strayCapacitanceModel.value = strayCapacitanceOptions[settings.strayCapacitanceModel]
            } else if (strayCapacitanceOptions.length > 0) {
                strayCapacitanceModel.value = strayCapacitanceOptions[0]
            }
            if (settings.coilEnableUserWindingLossesModels !== undefined) {
                coilEnableUserWindingLossesModels.value = settings.coilEnableUserWindingLossesModels
            }

            // Load painter resolution settings
            if (settings.painterNumberPointsX !== undefined) {
                painterNumberPointsX.value = settings.painterNumberPointsX
            }
            if (settings.painterNumberPointsY !== undefined) {
                painterNumberPointsY.value = settings.painterNumberPointsY
            }

            isInitialized.value = true
        } catch (error) {
            console.error('[ModelSettings] Failed to load from WASM:', error)
        } finally {
            isLoading.value = false
        }
    }

    // Sync current settings to WASM (convert display names to indices)
    async function syncToWASM() {
        if (!isInitialized.value) return
        
        try {
            const { waitForMkf } = await import('/WebSharedComponents/assets/js/mkfRuntime')
            const mkf = await waitForMkf()
            
            const settings = JSON.parse(await mkf.get_settings())
            
            // Convert display names to integer indices
            const magneticFieldStrengthOptions = Object.keys(availableMagneticFieldStrengthModels.value)
            const fringingEffectOptions = Object.keys(availableFringingEffectModels.value)
            const reluctanceOptions = Object.keys(availableReluctanceModels.value)
            const skinEffectOptions = Object.keys(availableWindingSkinEffectModels.value)
            const proximityEffectOptions = Object.keys(availableWindingProximityEffectModels.value)
            const strayCapacitanceOptions = Object.keys(availableStrayCapacitanceModels.value)
            
            // Only sync valid (non-null) model values
            
            if (magneticFieldStrengthModel.value !== null && magneticFieldStrengthModel.value !== undefined) {
                const index = magneticFieldStrengthOptions.indexOf(magneticFieldStrengthModel.value)
                if (index >= 0) settings.magneticFieldStrengthModel = index
            }
            if (magneticFieldStrengthFringingEffectModel.value !== null && magneticFieldStrengthFringingEffectModel.value !== undefined) {
                const index = fringingEffectOptions.indexOf(magneticFieldStrengthFringingEffectModel.value)
                if (index >= 0) settings.magneticFieldStrengthFringingEffectModel = index
            }
            if (reluctanceModel.value !== null && reluctanceModel.value !== undefined) {
                const index = reluctanceOptions.indexOf(reluctanceModel.value)
                if (index >= 0) settings.reluctanceModel = index
            }
            if (coreLossesModel.value !== null && coreLossesModel.value !== undefined) {
                settings.coreLossesModel = coreLossesModel.value
            }
            if (coreTemperatureModel.value !== null && coreTemperatureModel.value !== undefined) {
                settings.coreTemperatureModel = coreTemperatureModel.value
            }
            if (coreThermalResistanceModel.value !== null && coreThermalResistanceModel.value !== undefined) {
                settings.coreThermalResistanceModel = coreThermalResistanceModel.value
            }
            if (windingSkinEffectLossesModel.value !== null && windingSkinEffectLossesModel.value !== undefined) {
                const index = skinEffectOptions.indexOf(windingSkinEffectLossesModel.value)
                if (index >= 0) settings.windingSkinEffectLossesModel = index
            }
            if (windingProximityEffectLossesModel.value !== null && windingProximityEffectLossesModel.value !== undefined) {
                const index = proximityEffectOptions.indexOf(windingProximityEffectLossesModel.value)
                if (index >= 0) settings.windingProximityEffectLossesModel = index
            }
            if (strayCapacitanceModel.value !== null && strayCapacitanceModel.value !== undefined) {
                const index = strayCapacitanceOptions.indexOf(strayCapacitanceModel.value)
                if (index >= 0) settings.strayCapacitanceModel = index
            }
            settings.coilEnableUserWindingLossesModels = coilEnableUserWindingLossesModels.value

            // Sync painter resolution settings
            settings.painterNumberPointsX = painterNumberPointsX.value
            settings.painterNumberPointsY = painterNumberPointsY.value

            await mkf.set_settings(JSON.stringify(settings))
            
            // Verify the setting was applied
            const verifySettings = JSON.parse(await mkf.get_settings())
            
            // Trigger resimulation AFTER settings are synced to WASM
            try {
                // Small delay to ensure WASM has processed the settings
                await new Promise(resolve => setTimeout(resolve, 100))
                
                // Access the state store via Pinia's getActivePinia
                const pinia = getActivePinia()
                if (pinia) {
                    // Get the state store from Pinia's store cache
                    const stateStore = pinia._s.get('state')
                    if (stateStore && stateStore.resimulate) {
                        // Pass current model values to ensure they're used in simulation
                        const currentModels = {
                            magneticFieldStrengthModel: magneticFieldStrengthModel.value,
                            magneticFieldStrengthFringingEffectModel: magneticFieldStrengthFringingEffectModel.value,
                            reluctanceModel: reluctanceModel.value,
                            coreLossesModel: coreLossesModel.value,
                            coreTemperatureModel: coreTemperatureModel.value,
                            coreThermalResistanceModel: coreThermalResistanceModel.value,
                            windingSkinEffectLossesModel: windingSkinEffectLossesModel.value,
                            windingProximityEffectLossesModel: windingProximityEffectLossesModel.value,
                            strayCapacitanceModel: strayCapacitanceModel.value,
                            coilEnableUserWindingLossesModels: coilEnableUserWindingLossesModels.value,
                        }
                        stateStore.resimulate(currentModels)
                    } else {
                    }
                } else {
                }
            } catch (e) {
                console.error('[ModelSettings] Failed to trigger resimulation:', e)
            }
        } catch (error) {
            console.error('[ModelSettings] Failed to sync to WASM:', error)
        }
    }

    // Reset to MKF defaults
    async function reset() {
        try {
            const { waitForMkf } = await import('/WebSharedComponents/assets/js/mkfRuntime')
            const mkf = await waitForMkf()
            
            await mkf.reset_settings('')
            await loadFromWASM()
            
            // Set winding losses to automatic mode (not manual)
            coilEnableUserWindingLossesModels.value = false
            
        } catch (error) {
            console.error('[ModelSettings] Failed to reset:', error)
        }
    }

    // Fetch available core losses methods for the current core material
    async function fetchAvailableCoreLossesMethods(magnetic) {
        if (!magnetic || !magnetic.core) {
            availableCoreLossesMethods.value = []
            availableCoreLossesMethodsError.value = 'No core material selected'
            return
        }
        
        availableCoreLossesMethodsLoading.value = true
        availableCoreLossesMethodsError.value = null
        
        try {
            const { waitForMkf } = await import('/WebSharedComponents/assets/js/mkfRuntime')
            const mkf = await waitForMkf()
            
            const result = JSON.parse(await mkf.get_available_core_losses_methods(JSON.stringify(magnetic)))
            
            if (result.hasMaterial) {
                availableCoreLossesMethods.value = result.methods || []
                
                // If current selection is not available, select first available
                const currentDisplayName = coreLossesModel.value
                const isCurrentValid = result.methods.some(m => m.displayName === currentDisplayName)
                
                if (!isCurrentValid && result.methods.length > 0) {
                    coreLossesModel.value = result.methods[0].displayName
                }
            } else {
                availableCoreLossesMethods.value = []
                availableCoreLossesMethodsError.value = result.error || 'No core material data available'
            }
            
        } catch (error) {
            console.error('[ModelSettings] Failed to fetch available core losses methods:', error)
            availableCoreLossesMethods.value = []
            availableCoreLossesMethodsError.value = error.message
        } finally {
            availableCoreLossesMethodsLoading.value = false
        }
    }

    // Watch for changes and sync to WASM
    watch([
        magneticFieldStrengthModel,
        magneticFieldStrengthFringingEffectModel,
        reluctanceModel,
        coreLossesModel,
        coreTemperatureModel,
        coreThermalResistanceModel,
        windingSkinEffectLossesModel,
        windingProximityEffectLossesModel,
        strayCapacitanceModel,
        coilEnableUserWindingLossesModels,
        painterNumberPointsX,
        painterNumberPointsY,
    ], (newValues, oldValues) => {
        if (isInitialized.value) {
            syncToWASM()
        }
    }, { deep: true })

    // Initialise from the WASM defaults as soon as the store is created.
    // The H-field / fringing / winding-loss / stray-capacitance model NAMES have
    // no static default (unlike IGSE / Maniktala / Zhang) — they are only known
    // after querying the WASM, so until loadFromWASM() runs these refs are null.
    // Passing a null model name to MKF throws
    // "[json.exception.type_error.302] type must be string, but is null", which
    // aborts every core-loss / inductance simulation (Core Info shows OUTDATED
    // zeros, Graphs stay empty). Previously loadFromWASM() was triggered only by
    // opening the Settings panel, so any builder opened without visiting Settings
    // — e.g. the El Choker and La Ferrita advanced-detail embeds — simulated with
    // null models. Kick it off on creation (consumers already gate on
    // `isInitialized`); guarded so a later Settings open / reset still re-syncs.
    if (!isInitialized.value && !isLoading.value) {
        loadFromWASM()
    }

    return {
        // State
        magneticFieldStrengthModel,
        magneticFieldStrengthFringingEffectModel,
        reluctanceModel,
        coreLossesModel,
        coreTemperatureModel,
        coreThermalResistanceModel,
        windingSkinEffectLossesModel,
        windingProximityEffectLossesModel,
        strayCapacitanceModel,
        coilEnableUserWindingLossesModels,
        painterNumberPointsX,
        painterNumberPointsY,
        // Available options
        availableMagneticFieldStrengthModels,
        availableFringingEffectModels,
        availableReluctanceModels,
        availableWindingSkinEffectModels,
        availableWindingProximityEffectModels,
        availableStrayCapacitanceModels,
        availableCoreLossesMethods,
        availableCoreLossesMethodsLoading,
        availableCoreLossesMethodsError,
        isInitialized,
        isLoading,
        // Actions
        loadFromWASM,
        syncToWASM,
        reset,
        fetchAvailableCoreLossesMethods,
    }
}, {
    persist: true,
})