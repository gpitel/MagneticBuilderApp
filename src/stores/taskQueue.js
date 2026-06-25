import { defineStore } from 'pinia'
import { waitForMkf, isWorkerMode } from '/WebSharedComponents/assets/js/mkfRuntime'
import { checkAndFixMas, clean, toTitleCase, deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import { wireMaterialDefault } from '/WebSharedComponents/assets/js/defaults.js'
import { Convert as MasConvert } from '/WebSharedComponents/assets/ts/MAS.ts'
import { useSettingsStore } from './settings'

// Returns the restricted shape-family whitelist (lowercase) if set in
// magneticBuilderSettings, or null when no restriction applies. Defensive
// against the field being absent in older persisted settings blobs.
function getRestrictedShapeFamilies() {
    try {
        const s = useSettingsStore();
        const list = s?.magneticBuilderSettings?.restrictedShapeFamilies;
        if (!Array.isArray(list) || list.length === 0) return null;
        return list.map(f => String(f).toLowerCase());
    } catch (_) {
        return null;
    }
}

// MAS sentry. Validates an outgoing payload against the generated MAS schema
// (via quicktype's `Convert.to*`) before we hand it to the WASM. Loud failure
// here is far cheaper to diagnose than a generic "Input JSON does not conform
// to schema!" coming back from C++ MAS.hpp deserialization.
//
// `where`: short label for the call site (e.g. "simulate").
// `obj`:   the JS object we are about to JSON.stringify and send to WASM.
// `kind`:  one of "Mas" | "Inputs" | "Magnetic" | "Coil" | "Wire".
//
// We never silently downgrade — on failure we throw with the full quicktype
// error message (which includes the offending field path).
function masSentry(where, obj, kind = 'Mas') {
    const fn = MasConvert['to' + kind];
    if (typeof fn !== 'function') {
        throw new Error(`[MAS sentry @ ${where}] Unknown sentry kind "${kind}" (no Convert.to${kind} in MAS.ts)`);
    }
    // Sentry-local cleaner. Recursively strips object keys whose value is
    // `null`, `"null"`, or `undefined`. Quicktype's optional fields are
    // decoded as `u(undefined, ...)` and reject explicit `null`. We do NOT
    // strip empty arrays or empty objects: required array fields (e.g.
    // `outputs`) must remain present even when empty.
    function stripNulls(v) {
        if (Array.isArray(v)) {
            for (const item of v) stripNulls(item);
            return v;
        }
        if (v && typeof v === 'object') {
            for (const k of Object.keys(v)) {
                const val = v[k];
                if (val === null || val === 'null' || val === undefined) {
                    delete v[k];
                } else {
                    stripNulls(val);
                }
            }
        }
        return v;
    }
    try {
        const cleaned = stripNulls(JSON.parse(JSON.stringify(obj)));
        fn(JSON.stringify(cleaned));
    } catch (e) {
        const msg = `[MAS sentry @ ${where}/${kind}] Frontend produced invalid payload: ${e.message}`;
        // eslint-disable-next-line no-console
        console.error(msg);
        throw new Error(msg);
    }
}

/**
 * Convert Embind vector or array to JS array.
 * In worker mode, vectors are already converted to arrays.
 * In main-thread mode, we need to iterate using .size() and .get()
 */
function toArray(vectorOrArray) {
    if (vectorOrArray == null) return [];
    
    // Already a JS array (worker mode)
    if (Array.isArray(vectorOrArray)) {
        return vectorOrArray;
    }
    
    // Embind vector (main-thread mode)
    if (typeof vectorOrArray.size === 'function') {
        const arr = [];
        for (let i = 0; i < vectorOrArray.size(); i++) {
            arr.push(vectorOrArray.get(i));
        }
        return arr;
    }
    
    // Unknown type, return as-is
    return vectorOrArray;
}

export const useTaskQueueStore = defineStore('magneticBuilderTaskQueue', {
    state: () => ({
        task_standard_response_delay: 20,
        windingIndexChangeBlock: false,
        bobbinRegenerationPending: false,
        _windingBlockTimer: null,
        _windingChangedTimer: null,
    }),
    actions: {
        // Called when the magnetic builder mounts with an existing complete design
        // This allows components to subscribe and refresh their visualizations/simulations
        magneticBuilderReady(magnetic) {
        },

        windingIndexChanged(success = true, dataOrMessage = '') {
        },

        setWindingIndexChangeBlock() {
            this.windingIndexChangeBlock = true;
            // Cancel any previous timers so rapid clicks don't leak
            if (this._windingBlockTimer) clearTimeout(this._windingBlockTimer);
            if (this._windingChangedTimer) clearTimeout(this._windingChangedTimer);
            this._windingBlockTimer = setTimeout(() => {
                this.windingIndexChangeBlock = false;
                this._windingBlockTimer = null;
            }, 1000);
            this._windingChangedTimer = setTimeout(() => {
                this.windingIndexChanged(true);
                this._windingChangedTimer = null;
            }, this.task_standard_response_delay);
        },

        masCheckedAndFixed(success = true, dataOrMessage = '') {
        },

        async checkAndFixMas(mas) {
            // Pass 'this' (the taskQueueStore) so checkAndFixMas uses masAutocomplete
            // which properly JSON stringifies before calling the worker
            checkAndFixMas(mas, this).then(response => {
                setTimeout(() => {this.masCheckedAndFixed(true, response)}, this.task_standard_response_delay);
                return response;
            })
            .catch(error => {
                setTimeout(() => {this.masCheckedAndFixed(false, error)}, this.task_standard_response_delay);
                throw new Error(error);
            });
        },

        masAutocompleted(success = true, dataOrMessage = '') {
        },

        async masAutocomplete(mas, flag = false, settings = {}) {
            const mkf = await waitForMkf();
            await mkf.ready;

            masSentry('masAutocomplete', mas, 'Mas');
            const result = await mkf.mas_autocomplete(JSON.stringify(mas), flag, JSON.stringify(settings));
            if (result.startsWith('Exception')) {
                setTimeout(() => { this.masAutocompleted(false, result); }, this.task_standard_response_delay);
                throw new Error(result);
            }
            // Emscripten's musl printf omits the leading "0" for fractional numbers
            // whose absolute value is in (0, 1) on some WASM builds — both positive
            // (e.g. 0.95 → ".95") and negative (e.g. -0.0015 → "-.0015") — which is
            // not valid JSON. Repair before parsing.
            // eslint-disable-next-line no-console
            console.warn('[taskQueue] masAutocomplete: sanitizing WASM output (leading-decimal fix active)');
            const sanitized = result.replace(/([{,\[:][ \t]*)(-?)\.(\d)/g, '$1$2' + '0.$3');
            let masResult;
            try {
                masResult = JSON.parse(sanitized);
            } catch (parseErr) {
                // eslint-disable-next-line no-console
                console.error('[taskQueue] masAutocomplete: JSON.parse still failed after sanitization. First 500 chars of WASM output:', result.substring(0, 500));
                // eslint-disable-next-line no-console
                console.error('[taskQueue] masAutocomplete: First 500 chars of sanitized output:', sanitized.substring(0, 500));
                throw parseErr;
            }
            setTimeout(() => { this.masAutocompleted(true, masResult); }, this.task_standard_response_delay);
            return masResult;
        },

        coreShapeProcessed(success = true, dataOrMessage = '') {
        },

        async processCoreShape(coreShapeName) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const shapeResult = await mkf.get_shape_data(coreShapeName)
            if (shapeResult.startsWith('Exception')) {
                setTimeout(() => {this.coreShapeProcessed(false, shapeResult)}, this.task_standard_response_delay);
                throw new Error(shapeResult);
            }
            else {
                const coreShape = JSON.parse(shapeResult);
                setTimeout(() => {this.coreShapeProcessed(true, coreShape)}, this.task_standard_response_delay);
                return coreShape;
            }
        },

        coreMaterialProcessed(success = true, dataOrMessage = '') {
        },

        async processCoreMaterial(coreMaterialName) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const materialResult = await mkf.get_material_data(coreMaterialName)
            if (materialResult.startsWith('Exception')) {
                setTimeout(() => {this.coreMaterialProcessed(false, materialResult)}, this.task_standard_response_delay);
                throw new Error(materialResult);
            }
            else {
                const coreMaterial = JSON.parse(materialResult);
                setTimeout(() => {this.coreMaterialProcessed(true, coreMaterial)}, this.task_standard_response_delay);
                return coreMaterial;
            }
        },

        coreProcessed(success = true, dataOrMessage = '') {
        },

        async processCore(core) {
            const mkf = await waitForMkf();
            await mkf.ready;

            core.geometricalDescription = null;
            core.processedDescription = null;
            const coreResult = await mkf.calculate_core_data(JSON.stringify(core), false)
            if (coreResult.startsWith('Exception')) {
                setTimeout(() => {this.coreProcessed(false, coreResult);}, this.task_standard_response_delay);
                throw new Error(coreResult);
            }
            else {
                const auxCore = JSON.parse(coreResult);
                core.functionalDescription = auxCore.functionalDescription;
                core.processedDescription = auxCore.processedDescription;
                core.geometricalDescription = auxCore.geometricalDescription;
                
                setTimeout(() => {this.coreProcessed(true, core);}, this.task_standard_response_delay);
                return core;
            }
        },

        coreFromShapeProcessed(success = true, dataOrMessage = '') {
        },

        async processCoreFromShape(shapeName) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const shapeResult = await mkf.get_shape_data(shapeName);
            const coreResult = await mkf.calculate_core_data_from_shape(shapeResult);
            if (coreResult.startsWith('Exception')) {
                this.coreFromShapeProcessed(false, coreResult);
                throw new Error(coreResult);
            }
            else {
                const core = JSON.parse(coreResult);                
                this.coreFromShapeProcessed(true, core);
                return core;
            }
        },

        allCoresFromShapesProcessed(success = true, dataOrMessage = '') {
        },

        async processAllCoresFromShapes() {
            const mkf = await waitForMkf();
            await mkf.ready;

            const allCoresResult = await mkf.calculate_all_core_data_from_shapes();
            if (allCoresResult.startsWith('Exception')) {
                this.allCoresFromShapesProcessed(false, allCoresResult);
                throw new Error(allCoresResult);
            }
            else {
                const cores = JSON.parse(allCoresResult);
                // Honour the same shape-family whitelist that filters the
                // family/shape dropdowns (see getCoreShapes / getCoreShapeFamilies).
                // Without this the "open core shape table" modal would list
                // every family in the WASM database even though the rest of
                // the UI is restricted (e.g. el-choker forces ['t']).
                const allowed = getRestrictedShapeFamilies();
                const filtered = allowed
                    ? cores.filter(c => allowed.includes(
                        String(c?.functionalDescription?.shape?.family ?? '').toLowerCase()
                    ))
                    : cores;
                this.allCoresFromShapesProcessed(true, filtered);
                return filtered;
            }
        },

        coreShapeFamiliesGotten(success = true, dataOrMessage = '') {
        },

        async getCoreShapeFamilies(wiringTechnology=null) {
            const mkf = await waitForMkf();
            await mkf.ready;

            let coreShapeFamilies = [];
            const allowed = getRestrictedShapeFamilies();

            const coreShapeFamiliesArr = toArray(await mkf.get_available_core_shape_families());
            for (const shapeFamily of coreShapeFamiliesArr) {
                if (!shapeFamily.includes("pqi") && !shapeFamily.includes("ut") &&
                    !shapeFamily.includes("ui") && !shapeFamily.includes("h") && !shapeFamily.includes("drum")) {
                    if (wiringTechnology == null || wiringTechnology?.toLowerCase() === 'wound' || shapeFamily.toLowerCase() !== 't') {
                        if (allowed != null && !allowed.includes(shapeFamily.toLowerCase())) continue;
                        coreShapeFamilies.push(shapeFamily);
                    }
                }
            }

            coreShapeFamilies = coreShapeFamilies.sort();

            setTimeout(() => {this.coreShapeFamiliesGotten(true, coreShapeFamilies);}, this.task_standard_response_delay);
            return coreShapeFamilies;
        },

        coreShapeFamilySubtypesGotten(success = true, dataOrMessage = '') {
        },

        async getCoreShapeFamilySubtype(family) {
            const mkf = await waitForMkf();
            await mkf.ready;
            const availableFamilySubtypes = [];

            const coreShapeFamilSubtypesArr = toArray(await mkf.get_shape_family_subtypes(family));
            for (const shapeFamilySubtype of coreShapeFamilSubtypesArr) {
                if (!shapeFamilySubtype.includes("pqi") && !shapeFamilySubtype.includes("ut") &&
                    !shapeFamilySubtype.includes("ui") && !shapeFamilySubtype.includes("h") && !shapeFamilySubtype.includes("drum")) {
                    availableFamilySubtypes.push(shapeFamilySubtype);
                }
            }

            setTimeout(() => {this.coreShapeFamilySubtypesGotten(true, availableFamilySubtypes);}, this.task_standard_response_delay);
            return availableFamilySubtypes;
        },

        coreShapeFamilyDimensionsGotten(success = true, dataOrMessage = '') {
        },

        async getCoreShapeFamilyDimensions(family, familySubtype, dimensionsExceptionsPerFamily, oldDimensions) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const dimensionsArr = toArray(await mkf.get_shape_family_dimensions(family, familySubtype));
            const dimensions = {};
            for (const key of dimensionsArr) {
                // Skip dimensions that are in the exceptions list for this family
                if (family in dimensionsExceptionsPerFamily) {
                    if (dimensionsExceptionsPerFamily[family].includes(key)) {
                        continue;
                    }
                }
                // Preserve old dimension value or default to 0
                if (key in oldDimensions) {
                    dimensions[key] = oldDimensions[key];
                }
                else {
                    dimensions[key] = 0;
                }
            }
            setTimeout(() => {this.coreShapeFamilyDimensionsGotten(true, dimensions);}, this.task_standard_response_delay);
            return dimensions;
        },

        coreShapesGotten(success = true, dataOrMessage = '') {
        },

        async getCoreShapes(mas, onlyManufacturer) {
            const mkf = await waitForMkf();
            await mkf.ready;

            let coreShapeFamilies = [];
            const coreShapeNames = {};
            const allowed = getRestrictedShapeFamilies();

            const coreShapeFamiliesArr = toArray(await mkf.get_available_core_shape_families());
            for (const shapeFamily of coreShapeFamiliesArr) {
                if (!shapeFamily.includes("pqi") && !shapeFamily.includes("ut") &&
                    !shapeFamily.includes("ui") && !shapeFamily.includes("h") && !shapeFamily.includes("drum")) {
                    // Exclude toroidal cores (T family) when in Planar/Printed mode
                    const isToroidal = shapeFamily.toLowerCase() === 't';
                    const isPlanarMode = mas.inputs.designRequirements.wiringTechnology != null &&
                                         mas.inputs.designRequirements.wiringTechnology?.toLowerCase() !== 'wound';
                    if (!(isToroidal && isPlanarMode)) {
                        if (allowed != null && !allowed.includes(shapeFamily.toLowerCase())) continue;
                        coreShapeFamilies.push(shapeFamily);
                    }
                }
            }

            coreShapeFamilies = coreShapeFamilies.sort();

            if (onlyManufacturer != '' && onlyManufacturer != null) {
                const coreShapeNamesArr = toArray(await mkf.get_available_core_shapes_by_manufacturer(onlyManufacturer));

                coreShapeFamilies.forEach((shapeFamily) => {
                    if (!shapeFamily.includes("pqi") && !shapeFamily.includes("ut") &&
                        !shapeFamily.includes("ui") && !shapeFamily.includes("h") && !shapeFamily.includes("drum")) {


                        coreShapeNames[shapeFamily] = [];
                        
                        let numberShapes = 0;
                        for (const aux of coreShapeNamesArr) {
                            if (aux.startsWith(shapeFamily + " ")) {
                                numberShapes += 1;
                                coreShapeNames[shapeFamily].push(aux);
                            }
                        }
                        if (numberShapes == 0) {
                            coreShapeNames[shapeFamily].pop();
                        }

                    }
                })
            }
            else {
                for (const shapeFamily of coreShapeFamilies) {
                    if (!shapeFamily.includes("pqi") && !shapeFamily.includes("ut") &&
                        !shapeFamily.includes("ui") && !shapeFamily.includes("h") && !shapeFamily.includes("drum")) {
                        coreShapeNames[shapeFamily] = [];
                        // Pass the family name exactly as get_available_core_shape_families
                        // returned it. The CoreShapeFamily enum is case-sensitive
                        // ("planarE"/"planarEL"/"planarER"); lowercasing breaks the
                        // WASM from_json parse, leaving an uninitialized family that
                        // returns another family's shapes.
                        const coreShapeNamesArr = toArray(await mkf.get_available_core_shapes_by_family(shapeFamily));

                        let numberShapes = 0;
                        for (const aux of coreShapeNamesArr) {
                            numberShapes += 1;
                            coreShapeNames[shapeFamily].push(aux);
                        }
                        if (numberShapes == 0) {
                            coreShapeNames[shapeFamily].pop();
                        }

                    }
                }
            }

            if (mas.magnetic.core.functionalDescription.shape.type == "custom") {
                coreShapeNames[mas.magnetic.core.functionalDescription.shape.family].unshift(mas.magnetic.core.functionalDescription.shape.name);
            }
            setTimeout(() => {this.coreShapesGotten(true, coreShapeNames);}, this.task_standard_response_delay);
            return coreShapeNames;
        },

        coreMaterialsGotten(success = true, dataOrMessage = '') {
        },

        async getCoreMaterials(onlyManufacturer) {
            const mkf = await waitForMkf();
            await mkf.ready;

            let coreMaterialManufacturers = [];
            const coreMaterialNames = {};

            const coreMaterialManufacturersArr = toArray(await mkf.get_available_core_manufacturers());
            for (const manufacturer of coreMaterialManufacturersArr) {
                coreMaterialManufacturers.push(manufacturer);
            }

            coreMaterialManufacturers = coreMaterialManufacturers.sort();

            for (const manufacturer of coreMaterialManufacturers) {
                coreMaterialNames[manufacturer] = []
                if (!(onlyManufacturer != '' && onlyManufacturer != null && manufacturer != onlyManufacturer)) {
                    const coreMaterialNamesArr = toArray(await mkf.get_available_core_materials(manufacturer));
                    for (const materialName of coreMaterialNamesArr) {
                        coreMaterialNames[manufacturer].push(materialName);
                    }
                }
                // coreMaterialNames[manufacturer] = coreMaterialNames[manufacturer].sort();
            }
            setTimeout(() => {this.coreMaterialsGotten(true, coreMaterialNames);}, 10);
            return coreMaterialNames;
        },

        coreLossesCalculated(success = true, dataOrMessage = '') {
        },

        async calculateCoreLosses(magnetic, inputs, operatingPointIndex, modelsData) {
            // Validate all required fields exist
            const shape = magnetic.core?.functionalDescription?.shape;
            const material = magnetic.core?.functionalDescription?.material;
            const gapping = magnetic.core?.functionalDescription?.gapping;
            const operatingPoint = inputs?.operatingPoints?.[operatingPointIndex];
            const ambientTemperature = operatingPoint?.conditions?.ambientTemperature;
            const coil = magnetic.coil;
            
            // Check shape - can be a string (name) or object (with family/dimensions)
            const hasValidShape = shape && (
                (typeof shape === 'string' && shape !== '') ||
                (typeof shape === 'object' && shape.family)
            );
            
            // Check coil has required fields - need at least one winding with numberTurns > 0
            const hasValidCoil = coil && 
                coil.functionalDescription && 
                Array.isArray(coil.functionalDescription) && 
                coil.functionalDescription.length > 0 &&
                coil.functionalDescription.some(w => w.numberTurns > 0);
            
            // Check all required fields (coil is optional - we'll skip inductance/loss calculations if missing)
            if (!hasValidShape || !material || material === '' || 
                !gapping || !Array.isArray(gapping) ||
                !operatingPoint || ambientTemperature == null) {
                return null;
            }
            
            try {
                const mkf = await waitForMkf();
                await mkf.ready;

                let coreTemperatureDependantParametersData;
                let magnetizingInductance;
                let coreLossesData;
                let magnetizingInductanceCheck;

                {
                    const result = await mkf.get_core_temperature_dependant_parameters(JSON.stringify(magnetic.core), inputs.operatingPoints[operatingPointIndex].conditions.ambientTemperature);
                    if (result.startsWith("Exception")) {
                        return null;
                    }
                    else {
                        coreTemperatureDependantParametersData = JSON.parse(result);
                    }

                }

                {
                    const result = await mkf.calculate_inductance_from_number_turns_and_gapping(JSON.stringify(magnetic.core), JSON.stringify(magnetic.coil), JSON.stringify(inputs.operatingPoints[operatingPointIndex]), JSON.stringify(modelsData));
                    if (result == -1) {
                        return null;
                    }
                    else {
                        // Result is already a number from the worker, no need to parse
                        magnetizingInductance = result;
                    }
                }

                {
                    const result = await mkf.calculate_core_losses(JSON.stringify(magnetic.core), JSON.stringify(magnetic.coil), JSON.stringify(inputs), JSON.stringify(modelsData), operatingPointIndex);
                    if (result.startsWith("Exception")) {
                        return null;
                    }
                    else {
                        coreLossesData = JSON.parse(result);
                    }
                }

                {
                    magnetizingInductanceCheck = await mkf.check_requirement(JSON.stringify(inputs.designRequirements.magnetizingInductance), magnetizingInductance);

                }

                coreTemperatureDependantParametersData["saturationProportion"] = coreLossesData.magneticFluxDensityPeak / coreTemperatureDependantParametersData.magneticFluxDensitySaturation * 100;

                const data = {
                    coreTemperatureDependantParametersData: coreTemperatureDependantParametersData,
                    magnetizingInductance: magnetizingInductance,
                    coreLossesData: coreLossesData,
                    magnetizingInductanceCheck: magnetizingInductanceCheck,
                };

                setTimeout(() => {this.coreLossesCalculated(true, data);}, this.task_standard_response_delay);
                return data;
            } catch (error) {
                // Silently return null - data may be incomplete during editing
                return null;
            }
        },

        coreTemperatureDependantParametersGotten(success = true, dataOrMessage = '') {
        },

        async getCoreTemperatureDependantParameters(core, ambientTemperature) {
            if (core?.functionalDescription?.shape && core?.functionalDescription?.material) {
                const mkf = await waitForMkf();
                await mkf.ready;

                const result = await mkf.get_core_temperature_dependant_parameters(JSON.stringify(core), ambientTemperature);
                if (result.startsWith("Exception")) {
                    setTimeout(() => {this.coreTemperatureDependantParametersGotten(false, result);}, this.task_standard_response_delay);
                    throw new Error(result);
                }
                else {
                    const coreTemperatureDependantParametersData = JSON.parse(result);
                    setTimeout(() => {this.coreTemperatureDependantParametersGotten(true, coreTemperatureDependantParametersData);}, this.task_standard_response_delay);
                    return coreTemperatureDependantParametersData;
                }
            }
        },

        coreMaterialChanged(success = true, dataOrMessage = '') {
        },

        async changeCoreMaterial(materialName, core) {
            core.functionalDescription.material = materialName;
            core.name = "Custom";
            core.manufacturerInfo = null;
            if (core.geometricalDescription != null) {
                core.geometricalDescription.forEach((elem) => {
                    if (elem.type == "half set") {
                        elem.material = materialName;
                    }
                })
            }
            setTimeout(() => {this.coreMaterialChanged(true, core);}, this.task_standard_response_delay);
            return core;
        },

        bobbinFromCoreShapeGenerated(success = true, dataOrMessage = '') {
        },

        async generateBobbinFromCoreShape(core, wiringTechnology) {
            const mkf = await waitForMkf();
            await mkf.ready;

            let bobbinResult = "";
            if (wiringTechnology?.toLowerCase() === "printed") {
                bobbinResult = await mkf.create_simple_bobbin_from_core_with_custom_thickness(JSON.stringify(core), 0);
            }
            else {
                bobbinResult = await mkf.create_simple_bobbin_from_core(JSON.stringify(core));
            }
            
            if (bobbinResult.startsWith("Exception")) {
                setTimeout(() => {this.bobbinFromCoreShapeGenerated(false, bobbinResult);}, this.task_standard_response_delay);
                throw new Error(bobbinResult);
            }
            else {
                const bobbin = JSON.parse(bobbinResult);
                setTimeout(() => {this.bobbinFromCoreShapeGenerated(true, bobbin);}, this.task_standard_response_delay);
                return bobbin;
            }
        },

        bobbinDifferentThicknessesGenerated(success = true, dataOrMessage = '') {
        },

        async generateBobbinDifferentThicknesses(core, bobbinWallThickness, bobbinColumnThickness) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const bobbinResult = await mkf.create_simple_bobbin_from_core_with_custom_thicknesses(JSON.stringify(core), bobbinWallThickness, bobbinColumnThickness);

            if (bobbinResult.startsWith("Exception")) {
                setTimeout(() => {this.bobbinDifferentThicknessesGenerated(false, bobbinResult);}, this.task_standard_response_delay);
                throw new Error(bobbinResult);
            }
            else {
                const bobbin = JSON.parse(bobbinResult);
                setTimeout(() => {this.bobbinDifferentThicknessesGenerated(true, bobbin);}, this.task_standard_response_delay);
                return bobbin;
            }
        },

        coreAdvised(success = true, dataOrMessage = '') {
        },

        async adviseCore(inputs, coreAdviserWeights, adviserSettings) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const settings = JSON.parse(await mkf.get_settings());

            // CMC topology → force toroidal, no distributed gaps (winding goes around).
            const isCmc = inputs?.designRequirements?.topology?.toLowerCase() === 'commonmodechoke';

            if (isCmc) {
                settings["coreIncludeDistributedGaps"] = false;
                settings["coreIncludeMargin"] = true;
                settings["coreIncludeStacks"] = true;
                settings["useToroidalCores"] = true;
                settings["useConcentricCores"] = false;
                settings["useOnlyCoresInStock"] = false;
            }
            else {
                settings["coreIncludeDistributedGaps"] = adviserSettings.allowDistributedGaps;
                settings["coreIncludeMargin"] = true;
                settings["coreIncludeStacks"] = adviserSettings.allowStacks;
                settings["useToroidalCores"] = adviserSettings.allowToroidalCores;
                settings["useOnlyCoresInStock"] = false;
            }
            settings["coreAdviserEnableTemperatureFilter"] = adviserSettings.enableTemperatureFilter ?? false;
            settings["coreAdviserMaximumTemperature"] = adviserSettings.maximumTemperature ?? 130;
            await mkf.set_settings(JSON.stringify(settings));

            // Ensure coreAdviseMode is a string, not an object
            let coreAdviseMode = adviserSettings.coreAdviseMode;
            if (typeof coreAdviseMode === 'object') {
                console.warn('[taskQueue] coreAdviseMode was an object, resetting to default');
                coreAdviseMode = "standard cores";
            }
            
            // Validate and fix frequency before calling WASM
            // Frequency must be a reasonable value (1 Hz to 100 MHz range)
            // Values outside this range are likely uninitialized/garbage
            const DEFAULT_FREQUENCY = 100000; // 100 kHz default
            const MIN_VALID_FREQUENCY = 1; // 1 Hz minimum
            const MAX_VALID_FREQUENCY = 100000000; // 100 MHz maximum
            if (inputs.operatingPoints && inputs.operatingPoints.length > 0) {
                inputs.operatingPoints.forEach((op, opIndex) => {
                    if (op.excitationsPerWinding && op.excitationsPerWinding.length > 0) {
                        op.excitationsPerWinding.forEach((exc, excIndex) => {
                            const freq = exc.frequency;
                            if (!freq || !Number.isFinite(freq) || freq < MIN_VALID_FREQUENCY || freq > MAX_VALID_FREQUENCY) {
                                console.warn(`[taskQueue] Invalid frequency=${freq} in operating point ${opIndex}, excitation ${excIndex}. Set to ${DEFAULT_FREQUENCY}`);
                                exc.frequency = DEFAULT_FREQUENCY;
                            }
                        });
                    }
                });
            }

            // Deep-clone inputs (strips Vue reactivity) and sanitize excitation signals.
            // WASM calculate_buck_inputs returns garbage for some operating points:
            //   - all-zero frequency harmonics → strip zero-freq entries, remove key if empty
            //   - waveform.time arrays with trailing nulls → truncate at first null
            //   - waveform.data arrays mismatched with time → truncate to match
            const inputsClean = JSON.parse(JSON.stringify(inputs));
            if (inputsClean.operatingPoints) {
                for (const op of inputsClean.operatingPoints) {
                    if (op.excitationsPerWinding == null) continue;
                    for (const exc of op.excitationsPerWinding) {
                        for (const signal of ['current', 'voltage']) {
                            if (!exc[signal]) continue;

                            // Sanitize harmonics
                            const harmonics = exc[signal].harmonics;
                            if (harmonics != null) {
                                if (harmonics.amplitudes != null) harmonics.amplitudes = harmonics.amplitudes.filter(v => v !== null);
                                if (harmonics.frequencies != null) harmonics.frequencies = harmonics.frequencies.filter(v => v !== null);
                                const keep = (harmonics.frequencies || []).map(f => f !== 0);
                                if (harmonics.amplitudes) harmonics.amplitudes = harmonics.amplitudes.filter((_, i) => keep[i]);
                                if (harmonics.frequencies) harmonics.frequencies = harmonics.frequencies.filter((_, i) => keep[i]);
                                if (!harmonics.amplitudes?.length && !harmonics.frequencies?.length) {
                                    delete exc[signal].harmonics;
                                }
                            }

                            // Sanitize waveform — truncate arrays at first null in time
                            const waveform = exc[signal].waveform;
                            if (waveform?.time) {
                                const firstNull = waveform.time.indexOf(null);
                                if (firstNull === 0) {
                                    delete exc[signal].waveform;
                                } else if (firstNull > 0) {
                                    waveform.time = waveform.time.slice(0, firstNull);
                                    if (waveform.data) waveform.data = waveform.data.slice(0, firstNull);
                                }
                            }
                        }
                    }
                }
            }

            masSentry('adviseCore', inputsClean, 'Inputs');
            const result = await mkf.calculate_advised_cores(JSON.stringify(inputsClean), JSON.stringify(coreAdviserWeights), 1, coreAdviseMode);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.coreAdvised(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }

            const aux = JSON.parse(result);
            const log = aux["log"];
            const data = aux["data"];
            // Diagnostic: expose raw result on window so capture specs can read the full payload
            try { if (typeof window !== 'undefined') window.__lastAdviseCoreRaw = aux; } catch (_) {}

            if (data.length > 0) {
                const magnetic = data[0].mas.magnetic;
                setTimeout(() => {this.coreAdvised(true, magnetic);}, this.task_standard_response_delay);
                return magnetic;
            }
            else {
                // Surface the MKF Core Adviser log so we can see WHY every
                // candidate was rejected (gap too large, temperature, losses, etc).
                const logSummary = Array.isArray(log)
                    ? log.slice(-20).join('\n')
                    : (typeof log === 'string' ? log : JSON.stringify(log));
                throw new Error(`No suitable core found for the given requirements\n--- MKF Core Adviser log ---\n${logSummary}`);
            }
        },

        dimensionWithToleranceResolved(success = true, dataOrMessage = '') {
        },

        async resolveDimensionWithTolerance(dimensionWithTolerance) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const dimension = await mkf.resolve_dimension_with_tolerance(JSON.stringify(dimensionWithTolerance));

            this.dimensionWithToleranceResolved(true, dimension);
            return dimension;
        },

        numberTurnsUpdated(success = true, dataOrMessage = '') {
        },

        numberTurnsCalculated(success = true, dataOrMessage = '') {
        },

        async calculateNumberTurns(numberTurnsPrimary, designRequirements) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const numberTurnsArr = toArray(await mkf.calculate_number_turns(numberTurnsPrimary, JSON.stringify(designRequirements)));

            setTimeout(() => {this.numberTurnsCalculated(true, numberTurnsArr);}, this.task_standard_response_delay);
            return numberTurnsArr;
        },

        complexPermeabilityGotten(success = true, dataOrMessage = '') {
        },

        async getComplexPermeability(material) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const complexPermeabilityResult = await mkf.calculate_complex_permeability(JSON.stringify(material));

            if (complexPermeabilityResult.startsWith("Exception")) {
                setTimeout(() => {this.complexPermeabilityGotten(false, complexPermeabilityResult);}, this.task_standard_response_delay);
                throw new Error(complexPermeabilityResult);
            }
            else {
                const complexPermeability = JSON.parse(complexPermeabilityResult);
                setTimeout(() => {this.complexPermeabilityGotten(true, complexPermeability);}, this.task_standard_response_delay);
                return complexPermeability;
            }
        },

        defaultsGotten(success = true, dataOrMessage = '') {
        },

        async getDefaults() {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.get_defaults();
            setTimeout(() => {this.defaultsGotten(true, result);}, this.task_standard_response_delay);
            return result;
        },

        constantsGotten(success = true, dataOrMessage = '') {
        },

        async getConstants() {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.get_constants();
            setTimeout(() => {this.constantsGotten(true, result);}, this.task_standard_response_delay);
            return result;
        },

        onlyFrequencyDependentIndexesGotten(success = true, dataOrMessage = '') {
        },

        async getOnlyFrequencyDependentIndexes(data) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const stringVector = [];
            data.forEach((elem) => {
                stringVector.push(JSON.stringify(elem));
            })
            const handleArr = toArray(await mkf.get_only_frequency_dependent_indexes(JSON.stringify(stringVector)));

            const indexes = [];
            for (const aux of handleArr) {
                if (data[aux].frequency != null) {
                    indexes.push(aux);
                }
            }

            this.onlyFrequencyDependentIndexesGotten(true, indexes);
            return indexes;
        },

        onlyMagneticFieldDcBiasDependentIndexesGotten(success = true, dataOrMessage = '') {
        },

        async getOnlyMagneticFieldDcBiasDependentIndexes(data) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const stringVector = [];
            data.forEach((elem) => {
                stringVector.push(JSON.stringify(elem));
            })
            const handleArr = toArray(await mkf.get_only_magnetic_field_dc_bias_dependent_indexes(JSON.stringify(stringVector)));

            const indexes = [];
            for (const aux of handleArr) {
                if (data[aux].magneticFieldDcBias != null) {
                    indexes.push(aux);
                }
            }

            this.onlyMagneticFieldDcBiasDependentIndexesGotten(true, indexes);
            return indexes;
        },

        onlyTemperatureDependentIndexesGotten(success = true, dataOrMessage = '') {
        },

        async getOnlyTemperatureDependentIndexes(data) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const stringVector = [];
            data.forEach((elem) => {
                stringVector.push(JSON.stringify(elem));
            })
            const handleArr = toArray(await mkf.get_only_temperature_dependent_indexes(JSON.stringify(stringVector)));

            const indexes = [];
            for (const aux of handleArr) {
                indexes.push(aux);
            }

            this.onlyMagneticFieldDcBiasDependentIndexesGotten(true, indexes);
            return indexes;
        },

        initialPermeabilityEquationsGotten(success = true, dataOrMessage = '') {
        },

        async getInitialPermeabilityEquations(data) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const handle = await mkf.get_initial_permeability_equations(JSON.stringify(data));

            this.initialPermeabilityEquationsGotten(true, handle);
            return handle;
        },

        coreVolumetricLossesEquationsGotten(success = true, dataOrMessage = '') {
        },

        async getCoreVolumetricLossesEquations(data) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const handle = await mkf.get_core_volumetric_losses_equations(JSON.stringify(data));

            this.coreVolumetricLossesEquationsGotten(true, handle);
            return handle;
        },

        requirementChecked(success = true, dataOrMessage = '') {
        },

        async checkRequirement(requirement, value) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const requirementCheckResult = await mkf.check_requirement(JSON.stringify(requirement), value);

            this.requirementChecked(true, requirementCheckResult);
            return requirementCheckResult;
        },

        wireDataCalculated(success = true, dataOrMessage = '') {
        },

        async calculateWireData(coil, operatingPoints, windingIndex) {
            const mkf = await waitForMkf();
            await mkf.ready;

            let wire = coil.functionalDescription[windingIndex].wire;

            // If the wire is still an unresolved string name, resolve it first
            if (typeof wire === 'string' && wire !== '' && wire !== 'Dummy') {
                const wireResult = await mkf.get_wire_data(JSON.stringify(coil.functionalDescription[windingIndex]));
                if (wireResult.startsWith('Exception')) {
                    this.wireDataCalculated(false, wireResult);
                    throw new Error(wireResult);
                }
                wire = JSON.parse(wireResult);
                coil.functionalDescription[windingIndex].wire = wire;
            }

            const wireString = JSON.stringify(wire);
            
            // Check if we have valid operating point data with current that the WASM can process.
            // A current object is only "usable" if it has:
            //   - harmonics with at least one amplitude value, OR
            //   - a waveform with time data (so WASM can compute harmonics), OR
            //   - processed data that includes an rms value
            const rawCurrent = operatingPoints?.excitationsPerWinding?.[windingIndex]?.current;
            const hasUsableCurrent = rawCurrent && (
                (rawCurrent.harmonics?.amplitudes?.length > 0) ||
                (rawCurrent.waveform?.time?.length > 1) ||
                (rawCurrent.processed?.rms != null)
            );
            const hasCurrentData = !!hasUsableCurrent;
            
            const currentString = hasCurrentData ? JSON.stringify(rawCurrent) : null;
            
            let wireMaterial = wireMaterialDefault;
            if (wire.material != null) {
                wireMaterial = wire.material;
            }

            const data = {};

            data.turnsRatio = coil.functionalDescription[0].numberTurns / coil.functionalDescription[windingIndex].numberTurns;
            data.dcResistancePerMeter = await mkf.calculate_dc_resistance_per_meter(wireString, operatingPoints?.conditions?.ambientTemperature || 25);

            if (hasCurrentData) {
                data.skinAcResistancePerMeter = await mkf.calculate_skin_ac_resistance_per_meter(wireString, currentString, operatingPoints.conditions.ambientTemperature);
                data.skinAcFactor = await mkf.calculate_skin_ac_factor(wireString, currentString, operatingPoints.conditions.ambientTemperature);
                data.dcLossesPerMeter = await mkf.calculate_dc_losses_per_meter(wireString, currentString, operatingPoints.conditions.ambientTemperature);
                data.skinAcLossesPerMeter = await mkf.calculate_skin_ac_losses_per_meter(wireString, currentString, operatingPoints.conditions.ambientTemperature);
                data.effectiveCurrentDensity = (await mkf.calculate_effective_current_density(wireString, currentString, operatingPoints.conditions.ambientTemperature)) / 1000000 / coil.functionalDescription[windingIndex].numberParallels;
                data.effectiveSkinDepth = await mkf.calculate_effective_skin_depth(wireMaterial, currentString, operatingPoints.conditions.ambientTemperature);
            } else {
                // Set default values when no current data is available
                data.skinAcResistancePerMeter = data.dcResistancePerMeter;
                data.skinAcFactor = 1.0;
                data.dcLossesPerMeter = 0;
                data.skinAcLossesPerMeter = 0;
                data.effectiveCurrentDensity = 0;
                data.effectiveSkinDepth = 0;
            }
            
            const outerDimensionsArr = toArray(await mkf.get_outer_dimensions(wireString));
            data.outerDimensions = [outerDimensionsArr[0], outerDimensionsArr[1]];

            this.wireDataCalculated(true, data);
            return data;
        },

        wireProcessed(success = true, dataOrMessage = '') {
        },

        async processWire(winding) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const wireResult = await mkf.get_wire_data(JSON.stringify(winding))

            if (wireResult.startsWith('Exception')) {
                setTimeout(() => {this.wireProcessed(false, wireResult);}, this.task_standard_response_delay);
                throw new Error(wireResult);
            }
            else {
                const wire = JSON.parse(wireResult);
                setTimeout(() => {this.wireProcessed(true, wire);}, this.task_standard_response_delay);
                return wire;
            }
        },

        wireCoatingLabelGotten(success = true, dataOrMessage = '') {
        },

        async getWireCoatingLabel(wire) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const coatingLabel = await mkf.get_coating_label(JSON.stringify(wire));
            setTimeout(() => {this.wireCoatingLabelGotten(true, coatingLabel);}, this.task_standard_response_delay);
            return coatingLabel;
        },

        wireByNameGotten(success = true, dataOrMessage = '') {
        },

        async getWireByName(wireName) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const wire = await mkf.get_wire_data_by_name(wireName);
            setTimeout(() => {this.wireByNameGotten(true, wire);}, this.task_standard_response_delay);
            return wire;
        },

        newWireCreated(success = true, dataOrMessage = '') {
        },

        async createNewWire(newWireDataDict, oldWire) {
            const mkf = await waitForMkf();
            await mkf.ready;

            // So the outer diameter gets updated for Litz
            if (newWireDataDict["type"] == "litz") {
                if (typeof(oldWire) != "string") {
                    oldWire.strand = newWireDataDict["litzStrandConductingDiameter"];
                    oldWire.outerDiameter = null;
                }
            }

            let wire = {};

            if (oldWire != "" && oldWire != "Dummy") {
                wire = oldWire;
            }
            let coating = null;
            if (newWireDataDict["coating"] != null) {
                coating = JSON.parse(await mkf.get_wire_coating_by_label(newWireDataDict["coating"]));
            }

            wire.standard = "IEC 60317";

            if (newWireDataDict["type"] == "round") {

                if (newWireDataDict["standard"] != null) {
                    wire.standard = newWireDataDict["standard"];
                }
                wire = JSON.parse(await mkf.get_wire_data_by_standard_name(newWireDataDict["roundConductingDiameter"]));
            }
            else if (newWireDataDict["type"] == "litz") {
                if (newWireDataDict["standard"] != null) {
                    wire.standard = newWireDataDict["standard"];
                }
                wire.type = "litz";

                if (typeof(wire.strand) == "string" || wire.strand == null || (wire.strand != null && wire.strand.coating == null)) {
                    wire.strand = JSON.parse(await mkf.get_wire_data_by_standard_name(newWireDataDict["litzStrandConductingDiameter"]));
                }
                wire.numberConductors = newWireDataDict["numberConductors"];
                if (coating != null) {
                    if (wire.outerDiameter == null) {
                        wire.outerDiameter = {};
                    }

                    if (wire.outerDiameter.nominal == null && (wire.outerDiameter.minimum != null || wire.outerDiameter.maximum != null)) {
                        wire.outerDiameter.nominal = await mkf.resolve_dimension_with_tolerance(JSON.stringify(wire.outerDiameter));  
                    }
                    if (wire.outerDiameter.nominal == null && wire.outerDiameter.minimum == null && wire.outerDiameter.maximum == null) {
                        const strandConductingDiameter = await mkf.resolve_dimension_with_tolerance(JSON.stringify(wire.strand.conductingDiameter));  
                        if (coating.type == "bare") {
                            wire.outerDiameter.nominal = await mkf.get_wire_outer_diameter_bare_litz(strandConductingDiameter, wire.numberConductors, wire.strand.coating.grade, wire.standard);
                        }
                        if (coating.type == "served") {
                            wire.outerDiameter.nominal = await mkf.get_wire_outer_diameter_served_litz(strandConductingDiameter, wire.numberConductors, wire.strand.coating.grade, coating.numberLayers, wire.standard);
                        }
                        if (coating.type == "insulated") {
                            wire.outerDiameter.nominal = await mkf.get_wire_outer_diameter_insulated_litz(strandConductingDiameter, wire.numberConductors, coating.numberLayers, coating.thicknessLayers, wire.strand.coating.grade, wire.standard);
                        }
                    }

                }
            }
            else if (newWireDataDict["type"] == "rectangular") {
                wire.type = "rectangular";
                if (wire.conductingHeight == null) {
                    wire.conductingHeight = {};
                }
                if (wire.conductingWidth == null) {
                    wire.conductingWidth = {};
                }
                wire.conductingHeight.nominal = newWireDataDict["rectangularConductingHeight"];
                wire.conductingWidth.nominal = newWireDataDict["rectangularConductingWidth"];
                wire.numberConductors = 1;
                
                // Always set outerHeight and outerWidth for rectangular wires
                // If coating exists, calculate with coating thickness, otherwise default to conducting dimensions
                if (wire.outerHeight == null) {
                    wire.outerHeight = {};
                }
                if (wire.outerWidth == null) {
                    wire.outerWidth = {};
                }
                
                if (coating != null) {
                    const grade = coating.grade || 1;
                    if (coating.type != "bare" || coating.type != "enamelled") {
                        coating.type = "enamelled"
                        coating.grade = 1
                    }
                    wire.outerHeight.nominal = await mkf.get_wire_outer_height_rectangular(newWireDataDict["rectangularConductingHeight"], grade, wire.standard);
                    wire.outerWidth.nominal = await mkf.get_wire_outer_width_rectangular(newWireDataDict["rectangularConductingWidth"], grade, wire.standard);
                } else {
                    // Default to conducting dimensions if no coating
                    wire.outerHeight.nominal = newWireDataDict["rectangularConductingHeight"];
                    wire.outerWidth.nominal = newWireDataDict["rectangularConductingWidth"];
                }
            }
            else if (newWireDataDict["type"] == "foil") {
                wire.type = "foil";
                if (wire.conductingHeight == null) {
                    wire.conductingHeight = {};
                }
                if (wire.conductingWidth == null) {
                    wire.conductingWidth = {};
                }
                wire.conductingHeight.nominal = newWireDataDict["foilConductingHeight"];
                wire.conductingWidth.nominal = newWireDataDict["foilConductingWidth"];
                wire.numberConductors = 1;
                
                // Always set outerHeight and outerWidth for foil wires
                // Default to conducting dimensions
                if (wire.outerHeight == null) {
                    wire.outerHeight = {};
                }
                if (wire.outerWidth == null) {
                    wire.outerWidth = {};
                }
                wire.outerHeight.nominal = wire.conductingHeight.nominal;
                wire.outerWidth.nominal = wire.conductingWidth.nominal;
            }

            wire.coating = coating;
            wire.material = "copper";
            wire = clean(wire);
            setTimeout(() => {this.newWireCreated(true, wire);}, this.task_standard_response_delay);
            return wire;
        },

        wireDataByStandardNameGotten(success = true, dataOrMessage = '') {
        },

        async getWireDataByStandardName(conductingDiamension) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.get_wire_data_by_standard_name(conductingDiamension);
            if (result.startsWith("Exception")) {
                setTimeout(() => {this.wireDataByStandardNameGotten(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const wire = JSON.parse(result);
                setTimeout(() => {this.wireDataByStandardNameGotten(true, wire);}, this.task_standard_response_delay);
                return wire;
            }
        },

        availableWiresGotten(success = true, dataOrMessage = '') {
        },

        async getAvailableWires() {
            const mkf = await waitForMkf();
            await mkf.ready;

            const wireTypes = {};
            const wireTypesArr = toArray(await mkf.get_available_wire_types());
            for (const type of wireTypesArr) {
                wireTypes[type] = toTitleCase(type);
            }

            setTimeout(() => {this.availableWiresGotten(true, wireTypes);}, this.task_standard_response_delay);
            return wireTypes;
        },

        availableStandardsGotten(success = true, dataOrMessage = '') {
        },

        async getAvailableWireStandards() {
            const mkf = await waitForMkf();
            await mkf.ready;

            const wireStandardsArr = toArray(await mkf.get_available_wire_standards());

            setTimeout(() => {this.availableStandardsGotten(true, wireStandardsArr);}, this.task_standard_response_delay);
            return wireStandardsArr;
        },

        uniqueWireDiametersGotten(success = true, dataOrMessage = '') {
        },

        async getUniqueWireDiameters(standard) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const aux = {};
            const wireConductingDiametersArr = toArray(await mkf.get_unique_wire_diameters(JSON.stringify(standard)));
            for (const wireDiameter of wireConductingDiametersArr) {
                const key = Number(wireDiameter.split(" ")[0]);
                aux[key] = wireDiameter;
            }
            let orderedKeys = Object.keys(aux).sort(function(a, b) {
                return a - b;
            })
            const wireConductingDiameters = [];
            orderedKeys.forEach((key) => {
                wireConductingDiameters.push(aux[key]);
            });

            setTimeout(() => {this.uniqueWireDiametersGotten(true, wireConductingDiameters);}, this.task_standard_response_delay);
            return wireConductingDiameters;
        },

        coatingLabelsByTypeGotten(success = true, dataOrMessage = '') {
        },

        async getCoatingLabelsByType(wireType) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const wireCoatingsArr = toArray(await mkf.get_coating_labels_by_type(JSON.stringify(wireType)));

            setTimeout(() => {this.coatingLabelsByTypeGotten(true, wireCoatingsArr);}, this.task_standard_response_delay);
            return wireCoatingsArr;
        },

        equivalentWireCalculated(success = true, dataOrMessage = '') {
        },

        async calculateEquivalentWire(oldWire, newType, effectiveFrequency) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const wireString = await mkf.get_equivalent_wire(JSON.stringify(oldWire), JSON.stringify(newType), effectiveFrequency);

            if (wireString.startsWith("Exception")) {
                setTimeout(() => {this.equivalentWireCalculated(false, wireString);}, this.task_standard_response_delay);
                throw new Error(wireString);
            }
            else {
                const wire = JSON.parse(wireString);
                setTimeout(() => {this.equivalentWireCalculated(true, wire);}, this.task_standard_response_delay);
                return wire;
            }
        },

        allWiresAdvised(success = true, dataOrMessage = '') {
        },

        async adviseAllWires(mas) {
            const mkf = await waitForMkf();
            await mkf.ready;

            masSentry('adviseAllWires', mas, 'Mas');
            const resultMasWithCoil = await mkf.calculate_advised_coil(JSON.stringify(mas));

            if (resultMasWithCoil.startsWith("Exception")) {
                setTimeout(() => {this.allWiresAdvised(false, resultMasWithCoil);}, this.task_standard_response_delay);
                throw new Error(resultMasWithCoil);
            }
            else {
                const masWithCoil = JSON.parse(resultMasWithCoil);
                setTimeout(() => {this.allWiresAdvised(true, masWithCoil.magnetic.coil);}, this.task_standard_response_delay);
                return masWithCoil.magnetic.coil;
            }
        },

        wiresAdvised(success = true, dataOrMessage = '') {
        },

        async adviseWire(mas, windingIndex) {
            // Check if bobbin is valid (not Dummy or empty) - if so, generate one from core
            let bobbin = mas?.magnetic?.coil?.bobbin;
            if (!bobbin || bobbin === 'Dummy' || bobbin === '') {
                // Check if we have a valid core to generate a bobbin from
                const core = mas?.magnetic?.core;
                const hasValidCore = core?.functionalDescription?.shape && 
                                     core?.functionalDescription?.material;
                
                if (!hasValidCore) {
                    const error = 'Cannot advise wire: core shape and material must be set first.';
                    setTimeout(() => {this.allWiresAdvised(false, error);}, this.task_standard_response_delay);
                    return null;
                }
                
                // Generate a basic bobbin from the core shape
                try {
                    const wiringTechnology = mas?.inputs?.designRequirements?.wiringTechnology || 'Wound';
                    bobbin = await this.generateBobbinFromCoreShape(core, wiringTechnology);
                    mas.magnetic.coil.bobbin = bobbin;
                } catch (error) {
                    const errorMsg = 'Cannot advise wire: failed to generate bobbin from core shape.';
                    setTimeout(() => {this.allWiresAdvised(false, errorMsg);}, this.task_standard_response_delay);
                    return null;
                }
            }
            
            const mkf = await waitForMkf();
            await mkf.ready;

            masSentry('adviseWire', mas, 'Mas');
            const resultMasWithCoil = await mkf.calculate_advised_coil(JSON.stringify(mas));

            if (resultMasWithCoil.startsWith("Exception")) {
                setTimeout(() => {this.allWiresAdvised(false, resultMasWithCoil);}, this.task_standard_response_delay);
                throw new Error(resultMasWithCoil);
            }
            else {
                const masWithCoil = JSON.parse(resultMasWithCoil);
                setTimeout(() => {this.allWiresAdvised(true, masWithCoil.magnetic.coil.functionalDescription[windingIndex]);}, this.task_standard_response_delay);
                return {
                    winding: masWithCoil.magnetic.coil.functionalDescription[windingIndex],
                    coil: masWithCoil.magnetic.coil
                };
            }
        },

        simulated(success = true, dataOrMessage = '') {
        },

        async simulate(mas, modelsData) {
            const mkf = await waitForMkf();
            await mkf.ready;

            // MAS sentry — validate before WASM round-trip. Catches schema
            // drift at the boundary with the exact bad field, not deep in C++.
            masSentry('simulate', mas, 'Mas');

            const inputsString = JSON.stringify(mas.inputs);
            const magneticsString = JSON.stringify(mas.magnetic);
            const modelsString = JSON.stringify(modelsData);

            const result = await mkf.simulate(inputsString, magneticsString, modelsString);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.simulated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const simulation = JSON.parse(result);
                setTimeout(() => {this.simulated(true, simulation);}, this.task_standard_response_delay);
                return simulation;
            }
        },

        availableWindingOrientationsGotten(success = true, dataOrMessage = '') {
        },

        async getAvailableWindingOrientations(mas, modelsData) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const sectionsOrientations = {};
            const handleArr = toArray(await mkf.get_available_winding_orientations());
            for (const type of handleArr) {
                sectionsOrientations[type] = toTitleCase(type);
            }

            setTimeout(() => {this.availableWindingOrientationsGotten(true, sectionsOrientations);}, this.task_standard_response_delay);
            return sectionsOrientations;
        },

        availableCoilAlignmentsGotten(success = true, dataOrMessage = '') {
        },

        async getAvailableCoilAlignments(mas, modelsData) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const coilAlignments = {};
            const handleArr = toArray(await mkf.get_available_coil_alignments());
            for (const type of handleArr) {
                coilAlignments[type] = toTitleCase(type);
            }

            setTimeout(() => {this.availableCoilAlignmentsGotten(true, coilAlignments);}, this.task_standard_response_delay);
            return coilAlignments;
        },

        fitChecked(success = true, dataOrMessage = '') {
        },

        async checkIfFits(bobbin, bottomOrRightMargin, isMarginHorizontal) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const fits = await mkf.check_if_fits(JSON.stringify(bobbin), bottomOrRightMargin, isMarginHorizontal);

            setTimeout(() => {this.fitChecked(true, fits);}, this.task_standard_response_delay);
            return fits;
        },

        wound(success = true, dataOrMessage = '') {
        },

        async wind(inputCoil, repetitions, proportionPerWinding, pattern, margins) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.wind(JSON.stringify(inputCoil), repetitions, JSON.stringify(proportionPerWinding), JSON.stringify(pattern), JSON.stringify(margins));

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.wound(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                let coil = JSON.parse(result);
                // Call delimit_and_compact to compact additional turns for toroidal coils
                const compactResult = await mkf.delimit_and_compact(JSON.stringify(coil));
                if (!compactResult.startsWith("Exception")) {
                    coil = JSON.parse(compactResult);
                }
                setTimeout(() => {this.wound(true, coil);}, this.task_standard_response_delay);
                return coil;
            }
        },

        planarWound(success = true, dataOrMessage = '') {
        },

        async windPlanar(inputCoil, stackUp, borderToWireDistance, clearancePerWinding, insulationThicknessPerLayer, coreToLayerDistance) {
            const mkf = await waitForMkf();
            await mkf.ready;

            let insulationThicknessPerLayerString = "[";
            for (const [key, value] of Object.entries(insulationThicknessPerLayer)) {
                insulationThicknessPerLayerString += `[[${key.split('-')[0] - 1}, ${key.split('-')[1] - 1}], ${value}], `
            }
            if (insulationThicknessPerLayerString.length > 1) {
                insulationThicknessPerLayerString = insulationThicknessPerLayerString.slice(0, -2);
            }
            insulationThicknessPerLayerString += "]";

            let clearancePerWindingString = "[";
            for (const [key, value] of Object.entries(clearancePerWinding)) {
                clearancePerWindingString += `[${key}, ${value}], `
            }
            if (clearancePerWindingString.length > 1) {
                clearancePerWindingString = clearancePerWindingString.slice(0, -2);
            }
            clearancePerWindingString += "]";

            const result = await mkf.wind_planar(JSON.stringify(inputCoil), JSON.stringify(stackUp), borderToWireDistance, clearancePerWindingString, insulationThicknessPerLayerString, coreToLayerDistance);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.planarWound(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                let coil = JSON.parse(result);
                // Call delimit_and_compact to compact additional turns
                const compactResult = await mkf.delimit_and_compact(JSON.stringify(coil));
                if (!compactResult.startsWith("Exception")) {
                    coil = JSON.parse(compactResult);
                }
                setTimeout(() => {this.planarWound(true, coil);}, this.task_standard_response_delay);
                return coil;
            }
        },

        planarThicknessesGotten(success = true, dataOrMessage = '') {
        },

        async getPlanarThicknesses() {
            const mkf = await waitForMkf();
            await mkf.ready;

            const planarThicknesses = await mkf.get_planar_thicknesses();

            setTimeout(() => {this.planarThicknessesGotten(true, planarThicknesses);}, this.task_standard_response_delay);
            return planarThicknesses;
        },

        planarWireByStandardNameGotten(success = true, dataOrMessage = '') {
        },

        async getPlanarWireByStandardName(standardName) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.get_planar_wire_by_standard_name(standardName);
            if (result.startsWith("Exception")) {
                setTimeout(() => {this.planarWireByStandardNameGotten(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const wire = JSON.parse(result);
                setTimeout(() => {this.planarWireByStandardNameGotten(true, wire);}, this.task_standard_response_delay);
                return wire;
            }
        },

        fillingFactorsCalculated(success = true, dataOrMessage = '') {
        },

        async calculateFillingFactors(coil) {
            const mkf = await waitForMkf();
            await mkf.ready;

            masSentry('calculateFillingFactors', coil, 'Coil');
            const result = await mkf.calculate_filling_factor(JSON.stringify(coil));

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.fillingFactorsCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const fillingFactors = JSON.parse(result);
                setTimeout(() => {this.fillingFactorsCalculated(true, fillingFactors);}, this.task_standard_response_delay);
                return fillingFactors;
            }
        },

        sectionsAndLayersFittingChecked(success = true, dataOrMessage = '') {
        },

        async checkIfSectionsAndLayersFit(coil) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const fits = await mkf.are_sections_and_layers_fitting(JSON.stringify(coil));

            setTimeout(() => {this.sectionsAndLayersFittingChecked(true, fits);}, this.task_standard_response_delay);
            return fits;
        },

        windingIndexChanged(success = true, dataOrMessage = '') {
        },

        settingsSet(success = true, dataOrMessage = '') {
        },

        async setSettings(settings) {
            const mkf = await waitForMkf();
            await mkf.ready;

            await mkf.set_settings(JSON.stringify(settings));

            setTimeout(() => {this.settingsSet(true, true);}, this.task_standard_response_delay);
            return true;
        },

        settingsGotten(success = true, dataOrMessage = '') {
        },

        async getSettings() {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.get_settings();

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.settingsGotten(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const settings = JSON.parse(result);
                setTimeout(() => {this.settingsGotten(true, settings);}, this.task_standard_response_delay);
                return settings;
            }
        },

        gapReluctanceCalculated(success = true, dataOrMessage = '') {
        },

        async calculateGapReluctance(gap, gapReluctanceModel) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.calculate_gap_reluctance(JSON.stringify(gap), gapReluctanceModel);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.gapReluctanceCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const reluctanceData = JSON.parse(result);
                setTimeout(() => {this.gapReluctanceCalculated(true, reluctanceData);}, this.task_standard_response_delay);
                return reluctanceData;
            }
        },

        coreLossesOverFrequencySwept(success = true, dataOrMessage = '') {
        },

        async sweepCoreLossesOverFrequency(magnetic, operatingPoint, minimumFrequency, maximumFrequency, numberPoints, temperature, xAxisMode, title) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.sweep_core_losses_over_frequency(JSON.stringify(magnetic), JSON.stringify(operatingPoint), minimumFrequency, maximumFrequency, numberPoints, temperature, xAxisMode, title);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.coreLossesOverFrequencySwept(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const sweepData = JSON.parse(result);
                setTimeout(() => {this.coreLossesOverFrequencySwept(true, sweepData);}, this.task_standard_response_delay);
                return sweepData;
            }
        },

        windingLossesOverFrequencySwept(success = true, dataOrMessage = '') {
        },

        async sweepWindingLossesOverFrequency(magnetic, operatingPoint, minimumFrequency, maximumFrequency, numberPoints, temperature, xAxisMode, title) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.sweep_winding_losses_over_frequency(JSON.stringify(magnetic), JSON.stringify(operatingPoint), minimumFrequency, maximumFrequency, numberPoints, temperature, xAxisMode, title);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.windingLossesOverFrequencySwept(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const sweepData = JSON.parse(result);
                setTimeout(() => {this.windingLossesOverFrequencySwept(true, sweepData);}, this.task_standard_response_delay);
                return sweepData;
            }
        },

        impedanceOverFrequencySwept(success = true, dataOrMessage = '') {
        },

        async sweepImpedanceOverFrequency(magnetic, minimumFrequency, maximumFrequency, numberPoints, xAxisMode, title) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.sweep_impedance_over_frequency(JSON.stringify(magnetic), minimumFrequency, maximumFrequency, numberPoints, xAxisMode, title);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.impedanceOverFrequencySwept(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const sweepData = JSON.parse(result);
                setTimeout(() => {this.impedanceOverFrequencySwept(true, sweepData);}, this.task_standard_response_delay);
                return sweepData;
            }
        },

        magnetizingInductanceOverFrequencySwept(success = true, dataOrMessage = '') {
        },

        async sweepMagnetizingInductanceOverFrequency(magnetic, minimumFrequency, maximumFrequency, numberPoints, temperature, xAxisMode, title) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.sweep_magnetizing_inductance_over_frequency(JSON.stringify(magnetic), minimumFrequency, maximumFrequency, numberPoints, temperature, xAxisMode, title);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.magnetizingInductanceOverFrequencySwept(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const sweepData = JSON.parse(result);
                setTimeout(() => {this.magnetizingInductanceOverFrequencySwept(true, sweepData);}, this.task_standard_response_delay);
                return sweepData;
            }
        },

        qFactorOverFrequencySwept(success = true, dataOrMessage = '') {
        },

        async sweepQFactorOverFrequency(magnetic, minimumFrequency, maximumFrequency, numberPoints, xAxisMode, title) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.sweep_q_factor_over_frequency(JSON.stringify(magnetic), minimumFrequency, maximumFrequency, numberPoints, xAxisMode, title);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.qFactorOverFrequencySwept(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const sweepData = JSON.parse(result);
                setTimeout(() => {this.qFactorOverFrequencySwept(true, sweepData);}, this.task_standard_response_delay);
                return sweepData;
            }
        },

        resistanceOverFrequencySwept(success = true, dataOrMessage = '') {
        },

        async sweepResistanceOverFrequency(magnetic, minimumFrequency, maximumFrequency, numberPoints, temperature, xAxisMode, title) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.sweep_resistance_over_frequency(JSON.stringify(magnetic), minimumFrequency, maximumFrequency, numberPoints, temperature, xAxisMode, title);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.resistanceOverFrequencySwept(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const sweepData = JSON.parse(result);
                setTimeout(() => {this.resistanceOverFrequencySwept(true, sweepData);}, this.task_standard_response_delay);
                return sweepData;
            }
        },

        windingResistanceOverFrequencySwept(success = true, dataOrMessage = '') {
        },

        async sweepWindingResistanceOverFrequency(magnetic, minimumFrequency, maximumFrequency, numberPoints, windingIndex, temperature, xAxisMode, title) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.sweep_winding_resistance_over_frequency(JSON.stringify(magnetic), minimumFrequency, maximumFrequency, numberPoints, windingIndex, temperature, xAxisMode, title);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.windingResistanceOverFrequencySwept(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const sweepData = JSON.parse(result);
                setTimeout(() => {this.windingResistanceOverFrequencySwept(true, sweepData);}, this.task_standard_response_delay);
                return sweepData;
            }
        },

        magnetizingInductanceOverDcBiasSwept(success = true, dataOrMessage = '') {
        },

        async sweepMagnetizingInductanceOverDcBias(magnetic, minimumDcBias, maximumDcBias, numberPoints, temperature, xAxisMode, title) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.sweep_magnetizing_inductance_over_dc_bias(JSON.stringify(magnetic), minimumDcBias, maximumDcBias, numberPoints, temperature, xAxisMode, title);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.magnetizingInductanceOverDcBiasSwept(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const sweepData = JSON.parse(result);
                setTimeout(() => {this.magnetizingInductanceOverDcBiasSwept(true, sweepData);}, this.task_standard_response_delay);
                return sweepData;
            }
        },

        magnetizingInductanceOverTemperatureSwept(success = true, dataOrMessage = '') {
        },

        async sweepMagnetizingInductanceOverTemperature(magnetic, minimumTemperature, maximumTemperature, numberPoints, frequency, xAxisMode, title) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.sweep_magnetizing_inductance_over_temperature(JSON.stringify(magnetic), minimumTemperature, maximumTemperature, numberPoints, frequency, xAxisMode, title);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.magnetizingInductanceOverTemperatureSwept(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const sweepData = JSON.parse(result);
                setTimeout(() => {this.magnetizingInductanceOverTemperatureSwept(true, sweepData);}, this.task_standard_response_delay);
                return sweepData;
            }
        },

        // ==========================================
        // Matrix Calculation Methods
        // ==========================================

        resistanceMatrixCalculated(success = true, dataOrMessage = '') {
        },

        async calculateResistanceMatrix(magnetic, temperature, frequency) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const magneticJson = JSON.stringify(magnetic);
            console.log('📤 Sending to calculate_resistance_matrix:', {
                magneticKeys: Object.keys(magnetic),
                coreKeys: magnetic.core ? Object.keys(magnetic.core) : 'NO CORE',
                hasProcessedDescription: !!magnetic.core?.processedDescription,
                coilKeys: magnetic.coil ? Object.keys(magnetic.coil) : 'NO COIL',
                turnsCount: magnetic.coil?.turnsDescription?.length || 0,
                layersCount: magnetic.coil?.layersDescription?.length || 0,
                temperature,
                frequency
            });

            const result = await mkf.calculate_resistance_matrix(magneticJson, temperature, frequency);

            if (result.startsWith("Exception")) {
                console.error('❌ calculate_resistance_matrix Exception:', result);
                setTimeout(() => {this.resistanceMatrixCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const matrix = JSON.parse(result);
                setTimeout(() => {this.resistanceMatrixCalculated(true, matrix);}, this.task_standard_response_delay);
                return matrix;
            }
        },

        inductanceMatrixCalculated(success = true, dataOrMessage = '') {
        },

        async calculateInductanceMatrix(magnetic, frequency, modelsData = {}) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const magneticJson = JSON.stringify(magnetic);
            console.log('📤 Sending to calculate_inductance_matrix:', {
                magneticKeys: Object.keys(magnetic),
                coreKeys: magnetic.core ? Object.keys(magnetic.core) : 'NO CORE',
                hasProcessedDescription: !!magnetic.core?.processedDescription,
                hasEffectiveParams: !!magnetic.core?.processedDescription?.effectiveParameters,
                coilKeys: magnetic.coil ? Object.keys(magnetic.coil) : 'NO COIL',
                windingsCount: magnetic.coil?.functionalDescription?.length || 0,
                frequency
            });

            const result = await mkf.calculate_inductance_matrix(magneticJson, frequency, JSON.stringify(modelsData));

            if (result.startsWith("Exception")) {
                console.error('❌ calculate_inductance_matrix Exception:', result);
                setTimeout(() => {this.inductanceMatrixCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const matrix = JSON.parse(result);
                setTimeout(() => {this.inductanceMatrixCalculated(true, matrix);}, this.task_standard_response_delay);
                return matrix;
            }
        },

        leakageInductanceMatrixCalculated(success = true, dataOrMessage = '') {
        },

        async calculateLeakageInductanceMatrix(magnetic, frequency, modelsData = {}) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const magneticJson = JSON.stringify(magnetic);
            console.log('📤 Sending to calculate_leakage_inductance_matrix:', {
                magneticKeys: Object.keys(magnetic),
                coreKeys: magnetic.core ? Object.keys(magnetic.core) : 'NO CORE',
                hasProcessedDescription: !!magnetic.core?.processedDescription,
                hasEffectiveParams: !!magnetic.core?.processedDescription?.effectiveParameters,
                coilKeys: magnetic.coil ? Object.keys(magnetic.coil) : 'NO COIL',
                windingsCount: magnetic.coil?.functionalDescription?.length || 0,
                frequency
            });

            const result = await mkf.calculate_leakage_inductance_matrix(magneticJson, frequency, JSON.stringify(modelsData));

            if (result.startsWith("Exception")) {
                console.error('❌ calculate_leakage_inductance_matrix Exception:', result);
                setTimeout(() => {this.leakageInductanceMatrixCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const matrix = JSON.parse(result);
                setTimeout(() => {this.leakageInductanceMatrixCalculated(true, matrix);}, this.task_standard_response_delay);
                return matrix;
            }
        },

        couplingCoefficientMatrixCalculated(success = true, dataOrMessage = '') {
        },

        async calculateCouplingCoefficientMatrix(magnetic, frequency, modelsData = {}) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const magneticJson = JSON.stringify(magnetic);
            console.log('📤 Sending to calculate_coupling_coefficient_matrix:', {
                magneticKeys: Object.keys(magnetic),
                hasProcessedDescription: !!magnetic.core?.processedDescription,
                windingsCount: magnetic.coil?.functionalDescription?.length || 0,
                frequency
            });

            const result = await mkf.calculate_coupling_coefficient_matrix(magneticJson, frequency, JSON.stringify(modelsData));

            if (result.startsWith("Exception")) {
                console.error('❌ calculate_coupling_coefficient_matrix Exception:', result);
                setTimeout(() => {this.couplingCoefficientMatrixCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const matrix = JSON.parse(result);
                setTimeout(() => {this.couplingCoefficientMatrixCalculated(true, matrix);}, this.task_standard_response_delay);
                return matrix;
            }
        },

        strayCapacitanceCalculated(success = true, dataOrMessage = '') {
        },

        async calculateStrayCapacitance(coil, operatingPoint, modelsData = {}) {
            const mkf = await waitForMkf();
            await mkf.ready;

            console.log('📤 Sending to calculate_stray_capacitance:', {
                coilKeys: Object.keys(coil),
                turnsCount: coil.turnsDescription?.length || 0,
                layersCount: coil.layersDescription?.length || 0,
                windingsCount: coil.functionalDescription?.length || 0,
                hasOperatingPoint: !!operatingPoint
            });

            const result = await mkf.calculate_stray_capacitance(JSON.stringify(coil), JSON.stringify(operatingPoint), JSON.stringify(modelsData));

            if (result.startsWith("Exception")) {
                console.error('❌ calculate_stray_capacitance Exception:', result);
                setTimeout(() => {this.strayCapacitanceCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const capacitanceData = JSON.parse(result);
                setTimeout(() => {this.strayCapacitanceCalculated(true, capacitanceData);}, this.task_standard_response_delay);
                return capacitanceData;
            }
        },

        maxwellCapacitanceMatrixCalculated(success = true, dataOrMessage = '') {
        },

        async calculateMaxwellCapacitanceMatrix(coil, modelsData = {}) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.calculate_maxwell_capacitance_matrix(JSON.stringify(coil), JSON.stringify(modelsData));

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.maxwellCapacitanceMatrixCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const matrix = JSON.parse(result);
                setTimeout(() => {this.maxwellCapacitanceMatrixCalculated(true, matrix);}, this.task_standard_response_delay);
                return matrix;
            }
        },

        capacitanceMatrixCalculated(success = true, dataOrMessage = '') {
        },

        async calculateCapacitanceMatrix(coil, modelsData = {}) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.calculate_capacitance_matrix(JSON.stringify(coil), JSON.stringify(modelsData));

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.capacitanceMatrixCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const matrix = JSON.parse(result);
                setTimeout(() => {this.capacitanceMatrixCalculated(true, matrix);}, this.task_standard_response_delay);
                return matrix;
            }
        },

        capacitanceModelsBetweenWindingsCalculated(success = true, dataOrMessage = '') {
        },

        async calculateCapacitanceModelsBetweenWindings(energy, voltageDrop, relativeTurnsRatio) {
            const mkf = await waitForMkf();
            await mkf.ready;

            const result = await mkf.calculate_capacitance_models_between_windings(energy, voltageDrop, relativeTurnsRatio);

            if (result.startsWith("Exception")) {
                setTimeout(() => {this.capacitanceModelsBetweenWindingsCalculated(false, result);}, this.task_standard_response_delay);
                throw new Error(result);
            }
            else {
                const models = JSON.parse(result);
                setTimeout(() => {this.capacitanceModelsBetweenWindingsCalculated(true, models);}, this.task_standard_response_delay);
                return models;
            }
        },
    }
})
