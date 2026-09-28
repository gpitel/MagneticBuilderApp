/**
 * Adopt an advised core into the design (ABT #1121).
 *
 * The Core panel's Advise button did this inline; the alternatives panel adopts
 * a core the same way when a candidate is picked, so the steps live here once.
 * They are not interchangeable in order — the bobbin comes from the new shape,
 * the turns come from the design requirements, and the coil description is
 * cleared before the bobbin is set so nothing is left describing the old core.
 *
 * Throws when the advise carries no shape: a zero-candidate result resolves with
 * an empty magnetic, and assigning it silently leaves the panel looking dead.
 */
export async function applyAdvisedCore({ masStore, taskQueueStore, historyStore, magnetic }) {
    const advisedShape = magnetic?.core?.functionalDescription?.shape;
    const advisedShapeName = typeof advisedShape === 'string' ? advisedShape : advisedShape?.name;
    if (!advisedShapeName) {
        throw new Error('The core adviser returned no candidate for these requirements');
    }

    masStore.mas.magnetic.core = magnetic.core;

    const bobbin = await taskQueueStore.generateBobbinFromCoreShape(
        magnetic.core,
        masStore.mas.inputs.designRequirements.wiringTechnology,
    );

    const numberTurns = await taskQueueStore.calculateNumberTurns(
        magnetic.coil.functionalDescription[0].numberTurns,
        masStore.mas.inputs.designRequirements,
    );

    const windings = masStore.mas.magnetic.coil.functionalDescription;
    for (let i = 0; i < numberTurns.length; i++) {
        windings[i].numberTurns = numberTurns[i];
    }

    // Assign atomically: coil description first, bobbin last.
    masStore.mas.magnetic.coil.turnsDescription = null;
    masStore.mas.magnetic.coil.layersDescription = null;
    masStore.mas.magnetic.coil.sectionsDescription = null;
    masStore.mas.magnetic.coil.functionalDescription = windings;
    masStore.mas.magnetic.coil.bobbin = bobbin;

    // Tell the panels the core changed, exactly as a shape or material pick does
    // (processCore -> coreProcessed): CoreInfo recomputes its effective parameters,
    // inductance and losses on that action. Adopting a core without it left Core
    // Info 'Outdated' with zeros until something else changed.
    if (masStore.mas.magnetic.core.processedDescription?.effectiveParameters == null) {
        await taskQueueStore.processCore(masStore.mas.magnetic.core);
    }
    else {
        taskQueueStore.coreProcessed(true, masStore.mas.magnetic.core);
    }

    if (historyStore != null) {
        setTimeout(() => { historyStore.addToHistory(masStore.mas); }, 1000);
    }

    return magnetic.core;
}
