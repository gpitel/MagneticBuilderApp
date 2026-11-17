import { formatPower, formatTemperature } from '/WebSharedComponents/assets/js/utils.js'

/**
 * A core MKF held at its material's data limit (ABT #2273 / #2370), as the web states it.
 *
 * The core's own losses drove it past its material's data and MKF held it at the limit. Held there
 * (at Curie the core is paramagnetic) its losses and flux density are not the design's, so they are
 * never shown as the result: the web shows this error instead, with the losses just before the hold.
 * Used by Core Info and by the summary/datasheet, so both say the same thing.
 *
 * `coreLosses` is one operating point's outputs.coreLosses. Returns null when the core was not held,
 * else { short, full, error }.
 */
export function describeCoreHold(coreLosses) {
    if (coreLosses?.coreHeldAtDataLimit !== true) return null;
    const heldAt = coreLosses.coreHeldAt;
    // The limits libMKF's calculate_core_losses names (CoreDataCeilingSource).
    const limits = {
        curieTemperature: 'No steady temperature: the core reaches its Curie temperature',
        permeabilityDataEnd: 'No steady temperature within the material\'s data: the core gets past the end of its permeability data',
        lossDataEnd: 'No steady temperature within the material\'s data: the core gets past the end of its loss data',
    };
    if (!(heldAt?.limit in limits) || typeof heldAt?.temperature !== 'number') {
        const message = `The engine held the core at a material data limit it did not describe (limit '${heldAt?.limit}', temperature ${heldAt?.temperature}), so its losses are unknown.`;
        return { short: 'Held at a data limit', full: message, error: message };
    }
    const temperature = formatTemperature(heldAt.temperature);
    const temperatureText = `${temperature.label} ${temperature.unit}`;
    const reason = `${limits[heldAt.limit]} (${temperatureText}).`;
    const before = coreLosses.coreLossesBeforeHold;
    let beforeText;
    if (typeof before?.coreLosses !== 'number') {
        beforeText = 'The engine did not report the losses before the hold, so the core losses are unknown.';
    }
    else if (typeof before.temperature !== 'number') {
        const beforePower = formatPower(before.coreLosses);
        beforeText = `Losses before the hold: ${beforePower.label} ${beforePower.unit}; the engine did not report the temperature they were computed at.`;
    }
    else {
        const beforePower = formatPower(before.coreLosses);
        const beforeTemperature = formatTemperature(before.temperature);
        beforeText = `Losses before the hold: ${beforePower.label} ${beforePower.unit} at ${beforeTemperature.label} ${beforeTemperature.unit}.`;
    }
    const message = `${reason} ${beforeText}`;
    return { short: `Held at ${temperatureText}`, full: message, error: message };
}
