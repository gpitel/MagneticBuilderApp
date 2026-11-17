import * as Defaults from '/WebSharedComponents/assets/js/defaults.js'

/**
 * The models Core Info computes the core's losses with: the user's selection, and for the field
 * strength the pending (not yet applied) choice before the stored one. Shared with the summary so
 * it computes the hold Core Info shows with the same models. The field-strength models are loaded
 * from the engine asynchronously; until they are, both are null and there is nothing to compute with.
 */
export function coreInfoModels(userStore, modelSettingsStore, pendingModels) {
    return {
        coreLosses: userStore.selectedModels['coreLosses'] || Defaults.coreLossesModelDefault,
        coreTemperature: userStore.selectedModels['coreTemperature'] || Defaults.coreTemperatureModelDefault,
        gapReluctance: userStore.selectedModels['gapReluctance'] || Defaults.reluctanceModelDefault,
        magneticFieldStrength: pendingModels?.magneticFieldStrengthModel || modelSettingsStore.magneticFieldStrengthModel,
        magneticFieldStrengthFringingEffect: pendingModels?.magneticFieldStrengthFringingEffectModel || modelSettingsStore.magneticFieldStrengthFringingEffectModel
    };
}
