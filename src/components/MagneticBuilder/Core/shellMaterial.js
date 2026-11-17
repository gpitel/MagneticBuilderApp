// The magnetic-epoxy shell of a semi-shielded drum (ABT #2410): functionalDescription.material[1], a core
// material of type magneticEpoxy that MKF reads in Core::resolve_semishielded_shell_material.

/**
 * A shell the user starts defining. It carries NO magnetic data: nothing is copied from the drum (whose
 * permeability, about 3000, would silently become the shell's) and no "typical" epoxy value is assumed.
 * The name, the type and the permeability are the user's to enter; until they are, the shell is not
 * applied to the core (shellMaterialMissingData), and MKF refuses a shell without permeability anyway.
 */
export function newShellMaterial() {
    return {
        type: 'custom',
        name: '',
        material: '',
        manufacturerInfo: { name: '' },
        permeability: { initial: [] },
        saturation: [],
        volumetricLosses: { default: [] },
    };
}

function numberEntered(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

// A saturation point as MAS states it (bhCyclePoint): flux density, field and temperature, all given.
function saturationPointEntered(point) {
    return point != null && numberEntered(point.magneticFluxDensity) && point.magneticFluxDensity > 0
        && numberEntered(point.magneticField) && numberEntered(point.temperature);
}

// A core-loss model the engine can price the shell with: a model's coefficients. Measured points alone
// are not one (MKF's CoreLossesModel::get_methods reads only the models); the editor fits a Steinmetz
// model to them.
function lossModelEntered(method) {
    return method != null && !Array.isArray(method) && typeof method === 'object' && typeof method.method === 'string';
}

function permeabilityPointEntered(point) {
    return point != null && typeof point.value === 'number' && Number.isFinite(point.value) && point.value > 0;
}

/**
 * What a shell material still lacks before the core can be simulated with it, as phrases for a message:
 * what MKF reads for the shell (its permeability for the reluctance, its loss model for the core losses)
 * and what MAS requires of any core material (a saturation point).
 * A catalogue shell given by name is complete (the engine holds its data). An entry of the initial
 * permeability left at the editor's blank row (value 0) is not a permeability the user entered.
 */
export function shellMaterialMissingData(material) {
    if (typeof material === 'string') {
        return material === '' ? ['a name'] : [];
    }
    if (material == null) {
        return ['a name', 'the type magnetic epoxy', 'its initial permeability', 'its saturation', 'a core-loss model (enter its measured loss points and fit the Steinmetz model)'];
    }
    const missing = [];
    if (material.name == null || material.name === '') missing.push('a name');
    if (material.material !== 'magneticEpoxy') missing.push('the type magnetic epoxy');
    const initial = material.permeability?.initial;
    const points = Array.isArray(initial) ? initial : (initial == null ? [] : [initial]);
    if (points.length === 0 || !points.every(permeabilityPointEntered)) missing.push('its initial permeability');
    // MAS requires at least one complete saturation point on every core material.
    const saturation = material.saturation;
    if (!Array.isArray(saturation) || saturation.length === 0 || !saturation.every(saturationPointEntered)) missing.push('its saturation');
    // MKF prices the shell's core losses from its own loss model and throws when it has none.
    const methods = Object.values(material.volumetricLosses ?? {}).flat(1);
    if (!methods.some(lossModelEntered)) missing.push('a core-loss model (enter its measured loss points and fit the Steinmetz model)');
    return missing;
}

/** The message shown while a shell lacks data, or null when it has all the engine needs to start. */
export function shellMaterialIncompleteMessage(material) {
    const missing = shellMaterialMissingData(material);
    if (missing.length === 0) return null;
    const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
    return `The shell material needs ${list} before the semi-shielded drum can be simulated.`;
}
