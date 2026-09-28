<script setup>
import { CoilAlignment, WindingOrientation } from '../../../assets/ts/MAS.ts'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import ListOfCharacters from '/WebSharedComponents/DataInput/ListOfCharacters.vue'
import CoilInfo from './CoilInfo.vue'
import BasicCoilFillingFactors from './BasicCoilFillingFactors.vue'
import BasicCoilSectionInsulationSelector from './BasicCoilSectionInsulationSelector.vue'
import BasicCoilSectionAlignmentSelector from './BasicCoilSectionAlignmentSelector.vue'
import Magnetic2DVisualizer from '/WebSharedComponents/Common/Magnetic2DVisualizer.vue'
import WindingStudio from '../WindingStudio/WindingStudio.vue'
import { wiresEqual } from '../WindingStudio/geometry.js'
import { toTitleCase, checkAndFixMas, deepCopy, roundWithDecimals, cleanCoil, generateHash, effectiveBobbin } from '/WebSharedComponents/assets/js/utils.js'
import { useHistoryStore } from '../../../stores/history'
import { useTaskQueueStore } from '../../../stores/taskQueue'
import { useMagneticBuilderSettingsStore } from '../../../stores/magneticBuilderSettings'
import { useWindingStudioStore } from '../../../stores/windingStudio'

import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
</script>

<script>

export default {
    emits: ['fits', 'plotModeChange', 'swapIncludeFringing', 'errorInImage', 'fillingFactorsChanged'],
    props: {
        /**
         * The panel's own info card. A layout that gives the results a cell of
         * their own (the bands layout) turns this off and mounts the info
         * component itself — same component, different place (ABT #1121).
         */
        showInfoPanel: {
            type: Boolean,
            default: true,
        },
        dataTestLabel: {
            type: String,
            default: '',
        },
        masStore: {
            type: Object,
            required: true,
        },
        enableSimulation: {
            type: Boolean,
            default: true,
        },
        enableAutoSimulation: {
            type: Boolean,
            default: true,
        },
        enableSubmenu: {
            type: Boolean,
            default: true,
        },
        readOnly: {
            type: Boolean,
            default: false,
        },
        showInterleavingOrder: {
            type: Boolean,
            default: true,
        },
        operatingPointIndex: {
            type: Number,
            default: 0,
        },
        useVisualizers: {
            type: Boolean,
            default: true,
        },
        imageUpToDate: {
            type: Boolean,
            default: true,
        },
        forceUpdateVisualizer: {
            type: Number,
            default: 0,
        },
        enableTemperaturePlot: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        const historyStore = useHistoryStore();
        const taskQueueStore = useTaskQueueStore();
        const magneticBuilderSettingsStore = useMagneticBuilderSettingsStore();
        const windingStudioStore = useWindingStudioStore();
        const showAlignmentOptions = false;

        const showInsulationOptions = false;
        const loading = false;
        const placingWinding = false;
        const blockingRebounds = false;
        const recentChange = false;
        const tryingToSend = false;
        const forceUpdate = 0; 
        let pattern = "";
        const oldMagneticCoilHash = 1;
        const oldInputsCoilHash = 1;

        let localData = {};

        if (this.masStore.hasMirroredWindings) {
            localData = {
                sectionsOrientation: WindingOrientation.Contiguous,
                sectionsAlignment: CoilAlignment.Spread,
                interlayerThickness: 0,
                intersectionThickness: 0,
                dataPerSection: [{
                    layersOrientation: WindingOrientation.Overlapping,
                    turnsAlignment: CoilAlignment.Centered,
                    topOrLeftMargin: 0,
                    bottomOrRightMargin: 0,
                }],
                pattern: pattern,
                repetitions: 1,
                proportionPerWinding: [],
                bobbinWallThickness: 0.001,
                bobbinColumnThickness: 0.001,
                fillingFactors: {
                    areaFillingFactor: 0,
                    overlappingFillingFactor: 0,
                    contiguousFillingFactor: 0
                }
            };
        }
        else {
            localData = {
                sectionsOrientation: WindingOrientation.Overlapping,
                sectionsAlignment: CoilAlignment.InnerOrTop,
                interlayerThickness: 0,
                intersectionThickness: 0,
                dataPerSection: [{
                    layersOrientation: WindingOrientation.Overlapping,
                    turnsAlignment: CoilAlignment.Spread,
                    topOrLeftMargin: 0,
                    bottomOrRightMargin: 0,
                }],
                pattern: pattern,
                repetitions: 1,
                proportionPerWinding: [],
                bobbinWallThickness: 0.001,
                bobbinColumnThickness: 0.001,
                fillingFactors: {
                    areaFillingFactor: 0,
                    overlappingFillingFactor: 0,
                    contiguousFillingFactor: 0
                }
            };
        }
        this.resetProportionPerWinding(localData);

        const subscriptions = [];

        return {
            blockingRebounds,
            taskQueueStore,
            historyStore,
            magneticBuilderSettingsStore,
            windingStudioStore,
            localData,
            forceUpdate,
            showAlignmentOptions,
            showInsulationOptions,
            loading,
            placingWinding,
            recentChange,
            tryingToSend,
            oldMagneticCoilHash,
            oldInputsCoilHash,
            subscriptions,
            fieldOverlaySvg: null,
            _windTimer: null,
            _reboundsTimer: null,
            _fieldOverlayInFlight: false,
            _studioGestureKey: null,
        }
    },
    computed: {
        conductiveSections() {
            const sections = [];

            if (this.masStore.mas.magnetic.coil.sectionsDescription != null) {
                this.masStore.mas.magnetic.coil.sectionsDescription.forEach((section) => {
                    if (section.type == "conduction") {
                        sections.push(section);
                    }
                })
            }
            return sections;
        },
        numberSections() {
            if (this.masStore.mas.magnetic.coil.sectionsDescription != null) {
                return this.conductiveSections.length;
            }
            else {
                return this.masStore.mas.magnetic.coil.functionalDescription.length;
            }
        },
        windingIndexesCharacters() {
            let pattern = "";
            this.masStore.mas.magnetic.coil.functionalDescription.forEach((item, index) => {
                pattern += String(index + 1);
            })
            return pattern;
        },
        contiguousLabel() {
            try {
                if (effectiveBobbin(this.masStore.mas.magnetic.coil.bobbin).processedDescription.windingWindows[0].shape == "rectangular") {
                    return "height";
                }
                else {
                    return "angle";
                }
            }
            catch (e) {
                return "height"
            }
        },
        overlappingLabel() {
            try {
                if (effectiveBobbin(this.masStore.mas.magnetic.coil.bobbin).processedDescription.windingWindows[0].shape == "rectangular") {
                    return "width";
                }
                else {
                    return "radial";
                }
            }
            catch (e) {
                return "width"
            }
        },
        coreShapeIdentity() {
            const shape = this.masStore.mas.magnetic.core?.functionalDescription?.shape;
            if (shape == null) {
                return "";
            }
            if (typeof shape === "string") {
                return shape;
            }
            return `${shape.family ?? ""}|${shape.name ?? ""}`;
        },
        shortenedNames() {
            const shortenedNames = {}

            let width = 0;
            if (this.$refs.coilSelectorContainer != null) {
                width = this.$refs.coilSelectorContainer.clientWidth / this.localData.pattern.length;
            }

            this.conductiveSections.forEach((section, key) => {
                let label = toTitleCase(section.name.toLowerCase());
                label = label.replace("section", "stn");
                if (width > 0) {
                    let slice = section.name.length
                    if (width < 200)
                        slice = 4;
                    if (width < 150)
                        slice = 3;
                    if (width < 100)
                        slice = 2;
                    label = label.split(' ')
                        .map(item => item.length <= slice? item + ' ' : item.slice(0, slice) + '. ')
                        .join('');
                }
                shortenedNames[key] = label;
            })

            return shortenedNames
        },
    },
    watch: {
        coreShapeIdentity(newIdentity, oldIdentity) {
            // A pinned studio rectangle is absolute winding-window geometry, so a
            // core shape change invalidates it — re-imposing a rect drawn on the
            // old window mangles the coil (a cartesian-meters rect applied to a
            // toroid's polar section shrank it to 0.005deg and silently dropped
            // 38 of 42 turns). Drop the pins and their rect-derived margins.
            if (oldIdentity === "" || newIdentity === oldIdentity) {
                return;
            }
            if (this.windingStudioStore.customSectionCount === 0) {
                return;
            }
            for (const sectionName of Object.keys(this.windingStudioStore.customSectionRects)) {
                const sectionIndex = this.conductiveSections.findIndex((candidate) => candidate.name === sectionName);
                if (sectionIndex >= 0 && this.localData.dataPerSection[sectionIndex] != null) {
                    this.localData.dataPerSection[sectionIndex].topOrLeftMargin = 0;
                    this.localData.dataPerSection[sectionIndex].bottomOrRightMargin = 0;
                }
            }
            this.windingStudioStore.clearCustomSectionRects();
            // The shape-change flow re-winds on its own (bobbin regeneration);
            // invalidating the hash makes sure that wind isn't no-op'd away.
            this.oldMagneticCoilHash = null;
            this.oldInputsCoilHash = null;
        },
    },
    mounted () {
        if (this.$stateStore.loadingDesign) {
            this._loadingTimer = setTimeout(() => {
                this.$stateStore.loadingDesign = false;
                this._loadingTimer = null;
            }, 2000);
        }
        else {
            this.tryToWind();
        }
        this.assignLocalData(this.masStore.mas.magnetic);

        this.getProportionsAndPattern(this.masStore.mas.magnetic.coil);

        this.subscriptions.push(this.masStore.$onAction((action) => {
            action.after(() => {
                if (action.name == "importedMas") {
                    this.resetProportionPerWinding(this.localData);
                    this.tryToWind();
                    this.assignLocalData(this.masStore.mas.magnetic);
                }
                if (action.name == "resetMas") {
                    // Reset localData to defaults based on application type
                    if (this.masStore.hasMirroredWindings) {
                        this.localData.sectionsOrientation = WindingOrientation.Contiguous;
                        this.localData.sectionsAlignment = CoilAlignment.Spread;
                        this.localData.dataPerSection = [{
                            layersOrientation: WindingOrientation.Overlapping,
                            turnsAlignment: CoilAlignment.Centered,
                            topOrLeftMargin: 0,
                            bottomOrRightMargin: 0,
                        }];
                    }
                    else {
                        this.localData.sectionsOrientation = WindingOrientation.Overlapping;
                        this.localData.sectionsAlignment = CoilAlignment.InnerOrTop;
                        this.localData.dataPerSection = [{
                            layersOrientation: WindingOrientation.Overlapping,
                            turnsAlignment: CoilAlignment.Spread,
                            topOrLeftMargin: 0,
                            bottomOrRightMargin: 0,
                        }];
                    }
                    this.resetProportionPerWinding(this.localData);
                    this.assignLocalData(this.masStore.mas.magnetic);
                }
            });
        }));

        this.subscriptions.push(this.historyStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "historyPointerUpdated") {
                    this.tryToWind();
                    this.assignLocalData(this.masStore.mas.magnetic);
                    this.getProportionsAndPattern(this.masStore.mas.magnetic.coil);

                    this.masStore.mas.magnetic.coil.functionalDescription.forEach((datum, sectionIndex) => {
                        if (sectionIndex >= this.localData.dataPerSection.length) {
                            this.localData.dataPerSection.push({
                                layersOrientation: this.localData.dataPerSection[sectionIndex - 1].layersOrientation,
                                turnsAlignment: this.localData.dataPerSection[sectionIndex - 1].turnsAlignment,
                                topOrLeftMargin: this.localData.dataPerSection[sectionIndex - 1].topOrLeftMargin,
                                bottomOrRightMargin: this.localData.dataPerSection[sectionIndex - 1].bottomOrRightMargin,
                            });
                        }
                    })
                }
            });
        }))

        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "numberTurnsUpdated" || name == "newWireCreated") {
                    if (args[0] && !this.taskQueueStore.windingIndexChangeBlock) {
                        this.recentChange = true;
                        this.tryToWind();
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "bobbinFromCoreShapeGenerated" || name == "bobbinDifferentThicknessesGenerated") {
                    if (args[0]) {
                        this.taskQueueStore.bobbinRegenerationPending = false;
                        this.assignLocalData(this.masStore.mas.magnetic);
                        this.assignCoilData();
                        this.recentChange = true;
                        this.tryToWind();
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "coreProcessed") {
                    if (args[0]) {
                        this.assignLocalData(this.masStore.mas.magnetic);
                        this.assignCoilData();
                        // Only trigger winding if no bobbin regeneration is pending.
                        // When shape/material/stacks change, bobbin will be regenerated
                        // and bobbinFromCoreShapeGenerated will trigger the wind instead.
                        // For gapping-only changes, no bobbin regen happens so we wind here.
                        if (!this.taskQueueStore.bobbinRegenerationPending) {
                            this.recentChange = true;
                            this.tryToWind();
                        }
                    }
                    else {
                        console.error(args[1])
                    }
                }
            });
        }))
    },
    beforeUnmount () {
        if (this._windTimer) clearTimeout(this._windTimer);
        if (this._reboundsTimer) clearTimeout(this._reboundsTimer);
        if (this._loadingTimer) clearTimeout(this._loadingTimer);
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        resetProportionPerWinding(localData) {
            localData.proportionPerWinding = [];
            localData.pattern = "";
            this.masStore.mas.magnetic.coil.functionalDescription.forEach((item, index) => {
                localData.pattern += String(index + 1);
                localData.proportionPerWinding.push(1.0 / this.masStore.mas.magnetic.coil.functionalDescription.length);
            })
        },
        getWindingIndex(coil, windinName) {
            let foundWindingIndex = null;
            coil.functionalDescription.forEach((winding, windingIndex) => {
                if (winding.name == windinName) {
                    foundWindingIndex = windingIndex;
                }
            })
            return foundWindingIndex;
        },
        getProportionsAndPattern(coil) {
            if (coil.sectionsDescription != null) {
                const proportionsBobbin = effectiveBobbin(coil.bobbin);
                const bobbinShape = proportionsBobbin.processedDescription.windingWindows[0].shape;
                const sectionsOrientation = proportionsBobbin.processedDescription.windingWindows[0].sectionsOrientation;

                let windingDimensions = [];
                coil.functionalDescription.forEach((winding, windingIndex) => {
                    windingDimensions.push(0);
                })

                let windingDimensionsTotal = 0;
                this.localData.pattern = "";
                coil.sectionsDescription.forEach((section) => {
                    if (section.type == "conduction") {
                        const windingIndex = this.getWindingIndex(coil, section.partialWindings[0].winding);
                        this.localData.pattern += String(windingIndex + 1)
                        // Append wound_with partner indices so the backend wind() sees
                        // ALL real windings, not just the "main" winding of each shared
                        // section. Otherwise center-tap secondaries (e.g. AHB Sb, Push-Pull
                        // Pb/Sb) end up with zero sections and throw "Number of slots
                        // cannot be less than 1".
                        const partners = coil.functionalDescription[windingIndex]?.woundWith ?? [];
                        partners.forEach((partnerName) => {
                            const partnerIndex = this.getWindingIndex(coil, partnerName);
                            if (partnerIndex != null && partnerIndex !== windingIndex) {
                                this.localData.pattern += String(partnerIndex + 1);
                            }
                        });
                        // Distribute this section's dimension across ALL partial windings
                        // sharing it, so center-tap pairs (PH1+PH2, SH1+SH2) end up with
                        // equal proportions. Otherwise only partialWindings[0] gets the
                        // full width, leaving the other halves at ~0 → backend computes
                        // negative section widths ("section dimensions wrong").
                        const sectionPartialWindings = section.partialWindings ?? [];
                        const partialCount = sectionPartialWindings.length || 1;
                        let sectionDim = 0;
                        if (bobbinShape == "round") {
                            sectionDim = (sectionsOrientation == "contiguous")
                                ? section.dimensions[1]
                                : section.dimensions[0];
                        } else {
                            sectionDim = (sectionsOrientation == "contiguous")
                                ? section.dimensions[1]
                                : section.dimensions[0];
                        }
                        const perPartialDim = sectionDim / partialCount;
                        sectionPartialWindings.forEach((pw) => {
                            const pwIdx = this.getWindingIndex(coil, pw.winding);
                            if (pwIdx != null) {
                                windingDimensions[pwIdx] += perPartialDim;
                                windingDimensionsTotal += perPartialDim;
                            }
                        });
                    }
                })
                this.localData.proportionPerWinding = []
                windingDimensions.forEach((elem) => {
                    this.localData.proportionPerWinding.push(roundWithDecimals(elem / windingDimensionsTotal, 0.01));
                })
                // A winding whose derived proportion rounds to 0 (degenerate or
                // corrupt sectionsDescription, e.g. a 0.005deg toroidal section)
                // can never hold its turns: the wind throws "Turns not created"
                // and the coil panel dies. Fall back to equal proportions so the
                // coil re-winds from the functional description instead.
                if (this.localData.proportionPerWinding.some((proportion) => !(proportion > 0))) {
                    this.resetProportionPerWinding(this.localData);
                }
            }
        },
        resizeProportionsFromStudio(proportions) {
            // Winding-studio boundary drag: the studio re-derived the per-winding
            // proportions from the resized section widths; re-wind with them (the
            // winder recomputes the real geometry and enforces the true limits).
            if (this.readOnly || proportions.length !== this.localData.proportionPerWinding.length) {
                return;
            }
            this.localData.proportionPerWinding = proportions.map((value) => roundWithDecimals(value, 0.01));
            // The wind() no-op hash covers the coil + margins but NOT the
            // proportions; reset it so the proportion-only change re-winds.
            this._studioGestureKey = 'studio:proportions';
            this.oldMagneticCoilHash = null;
            this.oldInputsCoilHash = null;
            this.recentChange = true;
            this.tryToWind();
        },
        clearCustomLayoutFromStudio() {
            if (this.readOnly) {
                return;
            }
            // The margins derived from the drawn rectangles' wall gaps are part
            // of the custom layout: reset them for the pinned sections so the
            // automatic placement really comes back.
            for (const sectionName of Object.keys(this.windingStudioStore.customSectionRects)) {
                const sectionIndex = this.conductiveSections.findIndex((candidate) => candidate.name === sectionName);
                if (sectionIndex >= 0 && this.localData.dataPerSection[sectionIndex] != null) {
                    this.localData.dataPerSection[sectionIndex].topOrLeftMargin = 0;
                    this.localData.dataPerSection[sectionIndex].bottomOrRightMargin = 0;
                }
            }
            this.windingStudioStore.clearCustomSectionRects();
            this.recentChange = true;
            this.tryToWind();
        },
        setCompactFromStudio(enabled) {
            if (this.readOnly) {
                return;
            }
            this.windingStudioStore.compactEnabled = enabled;
            this.recentChange = true;
            this.tryToWind();
        },
        resizeMarginsFromStudio({ sectionName, side, value }) {
            // Winding-studio edge drag: the section edge's distance to the window
            // wall IS the margin — same knob the Insulation panel edits. Margins
            // ride the wind call (and its no-op hash), so tryToWind re-winds.
            if (this.readOnly) {
                return;
            }
            const sectionIndex = this.conductiveSections.findIndex((section) => section.name === sectionName);
            if (sectionIndex < 0 || this.localData.dataPerSection[sectionIndex] == null) {
                return;
            }
            if (side === 'topOrLeft') {
                this.localData.dataPerSection[sectionIndex].topOrLeftMargin = value;
            }
            else {
                this.localData.dataPerSection[sectionIndex].bottomOrRightMargin = value;
            }
            this._studioGestureKey = `studio:margin:${sectionName}:${side}`;
            this.recentChange = true;
            this.tryToWind();
        },
        interleaveFromStudio({ source, target, mode }) {
            // Winding-studio chip-on-winding drop: {interleave, swap, clear}
            // drive the SAME pattern/repetitions knobs the Alignment panel edits
            // (PI Expert's gesture). The winder recomputes the real sections.
            if (this.readOnly) {
                return;
            }
            const windings = this.masStore.mas.magnetic.coil.functionalDescription;
            const names = windings.map((winding) => winding.name);
            const sourceIndex = names.indexOf(source);
            const targetIndex = names.indexOf(target);
            if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
                return;
            }
            if (mode === 'group' || mode === 'ungroup') {
                // N-filar grouping (bifilar/multifilar): windings marked as
                // wound together share sections and layers. MAS convention is
                // MUTUAL — every member's woundWith lists the other members
                // (same as the wizards' coil groups).
                if (mode === 'group') {
                    // Mirror the engine's loud constraints (same parallels and
                    // wire) so an invalid group never lands in the MAS. The
                    // isolation side is NOT a constraint: wound-together
                    // windings have no barrier between them, so their sides
                    // JOIN (unified to the senior member's side below).
                    const sourceWinding = windings[sourceIndex];
                    const targetWinding = windings[targetIndex];
                    if (sourceWinding.numberParallels !== targetWinding.numberParallels
                        || !wiresEqual(sourceWinding.wire, targetWinding.wire)) {
                        console.error(`[WindingStudio] Cannot wind '${source}' together with '${target}': the engine requires the same number of parallels and wire on every grouped winding.`);
                        return;
                    }
                    const members = new Set([
                        source, target,
                        ...(windings[sourceIndex].woundWith ?? []),
                        ...(windings[targetIndex].woundWith ?? []),
                    ]);
                    const seniorSide = windings.find((winding) => members.has(winding.name)).isolationSide;
                    for (const winding of windings) {
                        if (members.has(winding.name)) {
                            winding.woundWith = [...members].filter((name) => name !== winding.name);
                            winding.isolationSide = seniorSide;
                        }
                    }
                }
                else {
                    for (const winding of windings) {
                        if (winding.name === source) {
                            delete winding.woundWith;
                        }
                        else if (winding.woundWith != null) {
                            winding.woundWith = winding.woundWith.filter((name) => name !== source);
                            if (winding.woundWith.length === 0) {
                                delete winding.woundWith;
                            }
                        }
                    }
                }
                this.oldMagneticCoilHash = null;
                this.oldInputsCoilHash = null;
                this.recentChange = true;
                this.tryToWind();
                return;
            }
            const naturalOrder = names.map((name, index) => String(index + 1));
            // Base order: unique digits of the current pattern; a stale/partial
            // pattern falls back to the natural order.
            let order = [...new Set((this.localData.pattern || '').split(''))]
                .filter((digit) => naturalOrder.includes(digit));
            if (order.length !== names.length) {
                order = [...naturalOrder];
            }
            const sourceDigit = String(sourceIndex + 1);
            const targetDigit = String(targetIndex + 1);
            if (mode === 'clear') {
                this.localData.pattern = naturalOrder.join('');
                this.localData.repetitions = 1;
            }
            else if (mode === 'swap') {
                const sourcePosition = order.indexOf(sourceDigit);
                const targetPosition = order.indexOf(targetDigit);
                [order[sourcePosition], order[targetPosition]] = [order[targetPosition], order[sourcePosition]];
                this.localData.pattern = order.join('');
            }
            else if (mode === 'interleave') {
                // Adjacency + one more repetition: P S at reps 2 is the classic
                // P S P S sandwich. Capped by the smallest turn count (a section
                // needs at least one turn) and a practical ceiling of 8.
                order = order.filter((digit) => digit !== sourceDigit);
                order.splice(order.indexOf(targetDigit) + 1, 0, sourceDigit);
                this.localData.pattern = order.join('');
                const minTurns = Math.min(...windings.map((winding) => winding.numberTurns ?? 1));
                const repetitionsCap = Math.max(1, Math.min(8, minTurns));
                this.localData.repetitions = Math.min(repetitionsCap, (this.localData.repetitions ?? 1) + 1);
            }
            else {
                return;
            }
            // Pattern/repetitions ride the wind call as args, not the coil hash;
            // reset it so the change definitely re-winds.
            this.oldMagneticCoilHash = null;
            this.oldInputsCoilHash = null;
            this.recentChange = true;
            this.tryToWind();
        },
        async requestFieldOverlayFromStudio() {
            // Winding-studio field toggle: the painter's H-field SVG rendered as
            // a background layer. Needs a wound coil and an operating point.
            const magnetic = this.masStore.mas.magnetic;
            const operatingPoint = this.masStore.mas.inputs?.operatingPoints?.[this.operatingPointIndex ?? 0];
            if (magnetic?.coil?.turnsDescription == null || operatingPoint == null) {
                this.fieldOverlaySvg = null;
                return;
            }
            if (this._fieldOverlayInFlight) {
                return;
            }
            this._fieldOverlayInFlight = true;
            try {
                this.fieldOverlaySvg = await this.taskQueueStore.plotMagneticField(magnetic, operatingPoint);
            }
            catch (error) {
                this.fieldOverlaySvg = null;
                console.error(error);
            }
            finally {
                this._fieldOverlayInFlight = false;
            }
        },
        setSectionLayoutFromStudio({ sectionName, turnsAlignment, layersOrientation, windingName = null, windingStyle = null }) {
            // Winding-studio per-section gear: the SAME dataPerSection knobs the
            // Alignment panel edits per conduction section; they ride the wind
            // call as the per-section _turnsAlignment/_layersOrientation maps.
            // The parallels style is a WINDING-level override riding _windingStyle.
            if (this.readOnly) {
                return;
            }
            const sectionIndex = this.conductiveSections.findIndex((section) => section.name === sectionName);
            if (sectionIndex < 0 || this.localData.dataPerSection[sectionIndex] == null) {
                console.error(`[WindingStudio] No section '${sectionName}' to set the layout on`);
                return;
            }
            this.localData.dataPerSection[sectionIndex].turnsAlignment = turnsAlignment;
            this.localData.dataPerSection[sectionIndex].layersOrientation = layersOrientation;
            if (windingName != null) {
                this.windingStudioStore.setWindingStyleOverride(windingName, windingStyle);
            }
            this._studioGestureKey = `studio:section-layout:${sectionName}`;
            this.oldMagneticCoilHash = null;
            this.oldInputsCoilHash = null;
            this.recentChange = true;
            this.tryToWind();
        },
        setWindingGroupsFromStudio(groups) {
            // Winding-studio groups editor: the partition of windings into
            // wound-together (bifilar) groups, written as MUTUAL woundWith
            // lists (wizard convention). The engine constraints are re-checked
            // defensively — an invalid group must never land in the MAS.
            if (this.readOnly) {
                return;
            }
            const windings = this.masStore.mas.magnetic.coil.functionalDescription;
            for (const group of groups) {
                const members = group.map((name) => windings.find((winding) => winding.name === name));
                if (members.some((member) => member == null)) {
                    console.error(`[WindingStudio] Unknown winding in group [${group.join(', ')}]`);
                    return;
                }
                const first = members[0];
                for (const member of members.slice(1)) {
                    if (member.numberParallels !== first.numberParallels
                        || !wiresEqual(member.wire, first.wire)) {
                        console.error(`[WindingStudio] Cannot wind [${group.join(', ')}] together: the engine requires the same number of parallels and wire on every grouped winding.`);
                        return;
                    }
                }
            }
            for (const winding of windings) {
                const group = groups.find((candidate) => candidate.includes(winding.name));
                if (group != null) {
                    winding.woundWith = group.filter((name) => name !== winding.name);
                    // No barrier between wound-together windings: their
                    // isolation sides JOIN, unified to the senior (first
                    // functionalDescription) member's side.
                    winding.isolationSide = windings.find((candidate) => group.includes(candidate.name)).isolationSide;
                }
                else {
                    delete winding.woundWith;
                }
            }
            this.oldMagneticCoilHash = null;
            this.oldInputsCoilHash = null;
            this.recentChange = true;
            this.tryToWind();
        },
        async autoFitFromStudio() {
            // Winding-studio Auto-fit: drop the hand-drawn rectangles (they pin
            // geometry and would defeat the automatic layout) and re-derive the
            // per-winding proportions from the wires — the engine's own default
            // when none are given — then re-wind with the selected sections
            // distribution (orientation/alignment/pattern/repetitions kept).
            if (this.readOnly) {
                return;
            }
            for (const sectionName of Object.keys(this.windingStudioStore.customSectionRects)) {
                const sectionIndex = this.conductiveSections.findIndex((candidate) => candidate.name === sectionName);
                if (sectionIndex >= 0 && this.localData.dataPerSection[sectionIndex] != null) {
                    this.localData.dataPerSection[sectionIndex].topOrLeftMargin = 0;
                    this.localData.dataPerSection[sectionIndex].bottomOrRightMargin = 0;
                }
            }
            this.windingStudioStore.clearCustomSectionRects();
            try {
                const coil = deepCopy(this.masStore.mas.magnetic.coil);
                coil.functionalDescription?.forEach((winding) => {
                    if (winding.wire == null || winding.wire === "") winding.wire = "Dummy";
                });
                const proportions = await this.taskQueueStore.calculateAutoProportions(coil);
                if (proportions.length !== this.localData.proportionPerWinding.length) {
                    throw new Error(`Auto proportions came back with ${proportions.length} entries for ${this.localData.proportionPerWinding.length} windings`);
                }
                this.localData.proportionPerWinding = proportions.map((value) => roundWithDecimals(value, 0.01));
            }
            catch (error) {
                console.error(error);
                return;
            }
            this._studioGestureKey = 'studio:auto-fit';
            this.oldMagneticCoilHash = null;
            this.oldInputsCoilHash = null;
            this.recentChange = true;
            this.tryToWind();
        },
        setWindowLayoutFromStudio({ windowIndex, sectionsOrientation, sectionsAlignment, windingOrder = null }) {
            // Winding-studio per-window gear: write the layout into THAT window's
            // bobbin entry (array-aware: merged index → owning part) and re-wind.
            if (this.readOnly) {
                return;
            }
            const bobbin = this.masStore.mas.magnetic.coil.bobbin;
            let targetWindow = null;
            if (Array.isArray(bobbin)) {
                let cursor = 0;
                for (const part of bobbin) {
                    const partWindows = part.processedDescription?.windingWindows ?? [];
                    if (windowIndex < cursor + partWindows.length) {
                        targetWindow = partWindows[windowIndex - cursor];
                        break;
                    }
                    cursor += partWindows.length;
                }
            }
            else if (typeof bobbin === 'object' && bobbin != null) {
                targetWindow = bobbin.processedDescription?.windingWindows?.[windowIndex] ?? null;
            }
            if (targetWindow == null) {
                console.error(`[WindingStudio] No bobbin window ${windowIndex} to set the layout on`);
                return;
            }
            targetWindow.sectionsOrientation = sectionsOrientation;
            targetWindow.sectionsAlignment = sectionsAlignment;
            if (windingOrder != null) {
                // U/Z lives on the same window entry as the two above, and the engine
                // resolves it per section as the section's own windingOrder, else this
                // one, else Z. It changes the WIND, not the drawing: U reverses every
                // other layer, so the turns move — which is why it goes through the
                // same re-wind as the rest of this panel.
                targetWindow.windingOrder = windingOrder;
            }
            if (windowIndex === 0) {
                // Keep the legacy window-0 knobs (Alignment panel + assignCoilData)
                // in sync, or the next wind would write the old values back.
                this.localData.sectionsOrientation = sectionsOrientation;
                this.localData.sectionsAlignment = sectionsAlignment;
            }
            this._studioGestureKey = `studio:window:${windowIndex}`;
            this.oldMagneticCoilHash = null;
            this.oldInputsCoilHash = null;
            this.recentChange = true;
            this.tryToWind();
        },
        async resizeSectionRectFromStudio({ sectionName, coordinates, dimensions, margin = null }) {
            // Winding-studio free transform: write the custom rectangle into the
            // section and re-flow layers+turns INSIDE it. The rectangle's gaps to
            // the window walls arrive as the section's margins (tape), kept in
            // dataPerSection so they ride every future wind.
            if (this.readOnly || this.placingWinding) {
                return;
            }
            const coil = deepCopy(this.masStore.mas.magnetic.coil);
            const section = (coil.sectionsDescription ?? []).find((candidate) => candidate.name === sectionName);
            if (section == null) {
                return;
            }
            section.coordinates = coordinates;
            section.dimensions = dimensions;
            // Stale layer count from the previous wind would prevent re-packing
            // into the new rectangle (wind_by_layers honors it when present).
            section.numberLayers = null;
            if (margin != null) {
                section.margin = margin;
                const sectionIndex = this.conductiveSections.findIndex((candidate) => candidate.name === sectionName);
                if (sectionIndex >= 0 && this.localData.dataPerSection[sectionIndex] != null) {
                    this.localData.dataPerSection[sectionIndex].topOrLeftMargin = margin[0];
                    this.localData.dataPerSection[sectionIndex].bottomOrRightMargin = margin[1];
                }
            }
            // Pin the drawn rectangle: every subsequent full wind re-imposes it
            // (the engine applies pins after compaction), so the custom layout
            // survives turns/wire/proportion/margin edits. The window shape rides
            // along so the pin only ever applies to the geometry it was drawn on.
            const windowShape = effectiveBobbin(this.masStore.mas.magnetic.coil?.bobbin)?.processedDescription?.windingWindows?.[0]?.shape ?? null;
            this.windingStudioStore.setCustomSectionRect(sectionName, { coordinates, dimensions, windowShape });
            this.placingWinding = true;
            try {
                const coreColumns = this.masStore.mas.magnetic.core?.processedDescription?.columns ?? null;
                const rewound = await this.taskQueueStore.rewindLayersAndTurns(coil, coreColumns);
                const existingBobbin = this.masStore.mas.magnetic.coil.bobbin;
                this.masStore.mas.magnetic.coil = rewound;
                this.masStore.mas.magnetic.coil.bobbin = existingBobbin;
                this.historyStore.unblockAdditions();
                // Coalesced: successive reshapes of the same section collapse
                // into one undo step (the pre-gesture state stays one step back).
                this.historyStore.addToHistory(this.masStore.mas, `studio:rect:${sectionName}`);
            }
            catch (error) {
                console.error(error);
            }
            finally {
                this.placingWinding = false;
            }
        },
        windingGroupEntries(windingEntry) {
            // Wound-together partners move as one: a leg placement applied to
            // any member applies to the whole group.
            const partners = windingEntry.woundWith ?? [];
            return [windingEntry, ...this.masStore.mas.magnetic.coil.functionalDescription
                .filter((candidate) => partners.includes(candidate.name))];
        },
        async placeWindingInColumn({ winding, columnIndex }) {
            // Winding-studio drop: place a winding around the given core leg.
            // The intent is winding-level windingWindow; the WASM winder computes
            // every coordinate on the columns-aware re-wind below.
            if (this.placingWinding || this.readOnly) {
                return;
            }
            // Catalog bobbins are real parts: never silently replace them with a
            // generated simple bobbin. Dropping on the CENTER leg keeps the part
            // (its window is merged window 0). Dropping on a LATERAL leg keeps it
            // too: the leg gets its own generated ad-hoc bobbin and coil.bobbin
            // becomes the MAS per-column ARRAY [catalogPart, ...lateralParts] —
            // two items on the BOM. The engine winds the merged windows.
            const currentBobbin = this.masStore.mas.magnetic.coil.bobbin;
            const centrePart = Array.isArray(currentBobbin) ? currentBobbin[0] : currentBobbin;
            const isCatalogBobbin = typeof centrePart === 'string'
                || (centrePart != null && centrePart !== 'Dummy' && centrePart.functionalDescription != null);
            if (isCatalogBobbin) {
                const targetColumn = this.masStore.mas.magnetic.core?.processedDescription?.columns?.[columnIndex];
                if (targetColumn == null) {
                    console.error(`[WindingStudio] Column ${columnIndex} not found in the processed core`);
                    return;
                }
                const windingEntry = this.masStore.mas.magnetic.coil.functionalDescription
                    .find((entry) => entry.name === winding);
                if (windingEntry == null) {
                    return;
                }
                for (const member of this.windingGroupEntries(windingEntry)) {
                    this.windingStudioStore.clearCustomSectionRectsForWinding(member.name);
                }
                if (targetColumn.type === 'central') {
                    for (const member of this.windingGroupEntries(windingEntry)) {
                        member.windingWindow = 0;
                    }
                    this.pruneUnusedLateralBobbinParts();
                    this.recentChange = true;
                    this.tryToWind();
                    return;
                }
                await this.placeCatalogWindingLaterally(windingEntry, columnIndex);
                return;
            }
            this.placingWinding = true;
            // Moving a winding to another leg invalidates its drawn rectangles.
            this.windingStudioStore.clearCustomSectionRectsForWinding(winding);
            try {
                // 1. From now on the engine emits one winding window per wound-column
                //    edge (idempotent; legacy geometry is byte-identical when nothing
                //    is placed laterally).
                const settings = await this.taskQueueStore.getSettings();
                if (!settings.corePerColumnWindingWindows) {
                    settings.corePerColumnWindingWindows = true;
                    await this.taskQueueStore.setSettings(settings);
                }

                // 2. Reprocess the core so it carries the per-column windows. Flag the
                //    pending bobbin regeneration so the coreProcessed subscriber does
                //    not fire an interim wind with the stale placement.
                this.taskQueueStore.bobbinRegenerationPending = true;
                const core = await this.taskQueueStore.processCore(deepCopy(this.masStore.mas.magnetic.core));
                this.masStore.mas.magnetic.core = core;

                // 3. Map the dropped leg to its winding window.
                const windows = core.processedDescription?.windingWindows ?? [];
                const windowIndex = windows.findIndex((window) => (window.column ?? 0) === columnIndex);
                if (windowIndex < 0) {
                    throw new Error(`No winding window wraps column ${columnIndex} (the core has ${windows.length} windows)`);
                }

                // 4. Placement intent on the winding — and on its whole
                //    wound-together group (partners share sections, so they
                //    move between legs as one).
                const windingEntry = this.masStore.mas.magnetic.coil.functionalDescription
                    .find((entry) => entry.name === winding);
                if (windingEntry == null) {
                    throw new Error(`Winding ${winding} not found in the functional description`);
                }
                for (const member of this.windingGroupEntries(windingEntry)) {
                    member.windingWindow = windowIndex;
                    this.windingStudioStore.clearCustomSectionRectsForWinding(member.name);
                }

                // 5. Regenerate the bobbin from the reprocessed core (keeps the custom
                //    thicknesses); its callback re-triggers the wind machinery, which
                //    now rides the columns-aware path.
                const bobbin = await this.taskQueueStore.generateBobbinDifferentThicknesses(
                    this.masStore.mas.magnetic.core,
                    this.localData.bobbinWallThickness,
                    this.localData.bobbinColumnThickness);
                this.masStore.mas.magnetic.coil.bobbin = bobbin;
            }
            catch (error) {
                console.error(error);
                this.taskQueueStore.bobbinRegenerationPending = false;
            }
            finally {
                this.placingWinding = false;
            }
        },
        async placeCatalogWindingLaterally(windingEntry, columnIndex) {
            // Lateral drop with a catalog bobbin: keep the catalog part on the
            // centre leg and give the dropped leg its own generated ad-hoc bobbin
            // (a second BOM item). MAS models this as the coil.bobbin per-column
            // array; the engine merges every part's winding windows for the wind.
            this.placingWinding = true;
            try {
                const currentBobbin = this.masStore.mas.magnetic.coil.bobbin;
                let catalogPart = Array.isArray(currentBobbin) ? currentBobbin[0] : currentBobbin;
                if (typeof catalogPart === 'string' || catalogPart?.processedDescription == null) {
                    // By-name (or unprocessed) catalog bobbin: materialize the full
                    // part — only the engine can resolve names / process geometry.
                    const magneticWithCatalogBobbin = deepCopy(this.masStore.mas.magnetic);
                    magneticWithCatalogBobbin.coil.bobbin = catalogPart;
                    catalogPart = await this.taskQueueStore.materializeBobbin(magneticWithCatalogBobbin);
                }
                if (catalogPart?.processedDescription == null) {
                    throw new Error('[WindingStudio] The catalog bobbin has no processedDescription; cannot derive the ad-hoc lateral bobbin');
                }

                // 1. Engine emits one winding window per wound-column edge.
                const settings = await this.taskQueueStore.getSettings();
                if (!settings.corePerColumnWindingWindows) {
                    settings.corePerColumnWindingWindows = true;
                    await this.taskQueueStore.setSettings(settings);
                }

                // 2. Reprocess the core so it carries the per-column windows. Flag
                //    the pending bobbin regeneration so the coreProcessed subscriber
                //    does not fire an interim wind with the stale placement.
                this.taskQueueStore.bobbinRegenerationPending = true;
                const core = await this.taskQueueStore.processCore(deepCopy(this.masStore.mas.magnetic.core));
                this.masStore.mas.magnetic.core = core;

                // 3. Ad-hoc lateral part: generate the simple bobbin for the whole
                //    core with the catalog part's own thicknesses, then keep only
                //    the dropped column's window(s) — each carries its column edge,
                //    which is what the winder follows.
                const wallThickness = catalogPart.processedDescription.wallThickness;
                const columnThickness = catalogPart.processedDescription.columnThickness;
                if (wallThickness == null || columnThickness == null) {
                    throw new Error('[WindingStudio] The catalog bobbin has no wall/column thickness; cannot derive the ad-hoc lateral bobbin');
                }
                const generated = await this.taskQueueStore.generateBobbinDifferentThicknesses(core, wallThickness, columnThickness);
                const lateralWindows = (generated.processedDescription?.windingWindows ?? [])
                    .filter((window) => (window.column ?? 0) === columnIndex);
                if (lateralWindows.length === 0) {
                    throw new Error(`[WindingStudio] The generated bobbin has no winding window for column ${columnIndex}`);
                }
                const lateralPart = {
                    ...generated,
                    processedDescription: { ...generated.processedDescription, windingWindows: lateralWindows },
                };

                // 4. Assemble the per-column array (replacing any existing part for
                //    this column) and point the winding at the part's first window
                //    in the merged (concatenated) window order the engine builds.
                const parts = Array.isArray(currentBobbin) ? [...currentBobbin] : [catalogPart];
                parts[0] = catalogPart;
                let partIndex = parts.findIndex((part, index) => index > 0
                    && (part.processedDescription?.windingWindows ?? []).some((window) => (window.column ?? 0) === columnIndex));
                if (partIndex < 0) {
                    parts.push(lateralPart);
                    partIndex = parts.length - 1;
                }
                else {
                    parts[partIndex] = lateralPart;
                }
                let mergedWindowIndex = 0;
                for (let index = 0; index < partIndex; index++) {
                    mergedWindowIndex += (parts[index].processedDescription?.windingWindows ?? []).length;
                }
                for (const member of this.windingGroupEntries(windingEntry)) {
                    member.windingWindow = mergedWindowIndex;
                }
                this.masStore.mas.magnetic.coil.bobbin = parts;
                this.pruneUnusedLateralBobbinParts();
                // The generateBobbinDifferentThicknesses callback clears the pending
                // flag and triggers the wind with the assembled array.
            }
            catch (error) {
                console.error(error);
                this.taskQueueStore.bobbinRegenerationPending = false;
            }
            finally {
                this.placingWinding = false;
            }
        },
        pruneUnusedLateralBobbinParts() {
            // Per-column bobbin housekeeping: drop ad-hoc lateral parts no winding
            // references any more (an unused part would be a phantom BOM item) and
            // remap every winding's merged window index. Collapses back to the
            // plain catalog scalar when only the centre part remains.
            const bobbin = this.masStore.mas.magnetic.coil.bobbin;
            if (!Array.isArray(bobbin)) {
                return;
            }
            const windowCounts = bobbin.map((part) => (part.processedDescription?.windingWindows ?? []).length);
            const partStart = [];
            let cursor = 0;
            windowCounts.forEach((count) => { partStart.push(cursor); cursor += count; });
            const partOfWindow = (windowIndex) => {
                for (let index = bobbin.length - 1; index >= 0; index--) {
                    if (windowIndex >= partStart[index]) {
                        return index;
                    }
                }
                return 0;
            };
            const windings = this.masStore.mas.magnetic.coil.functionalDescription;
            const referencedParts = new Set([0]);
            windings.forEach((entry) => { referencedParts.add(partOfWindow(entry.windingWindow ?? 0)); });
            if (referencedParts.size === bobbin.length) {
                return;
            }
            const keptIndices = bobbin.map((part, index) => index).filter((index) => referencedParts.has(index));
            const newStart = new Map();
            let newCursor = 0;
            keptIndices.forEach((oldIndex) => { newStart.set(oldIndex, newCursor); newCursor += windowCounts[oldIndex]; });
            windings.forEach((entry) => {
                const oldWindow = entry.windingWindow ?? 0;
                const oldPart = partOfWindow(oldWindow);
                entry.windingWindow = newStart.get(oldPart) + (oldWindow - partStart[oldPart]);
            });
            const keptParts = keptIndices.map((oldIndex) => bobbin[oldIndex]);
            this.masStore.mas.magnetic.coil.bobbin = keptParts.length === 1 ? keptParts[0] : keptParts;
        },
        wind() {
            // Skip winding for toroidal cores or when bobbin is dummy/invalid
            const bobbin = this.masStore.mas.magnetic.coil?.bobbin;
            if (!bobbin || bobbin === "Dummy" || bobbin === "") {
                this.tryingToSend = false;
                return;
            }

            const inputCoil = deepCopy(this.masStore.mas.magnetic.coil);

            // Normalize wire: "" to "Dummy" — empty string is not a valid wire name
            // and will cause a WASM schema error in find_wire_by_name("").
            // This can occur for extra windings that have not yet been assigned by the adviser.
            inputCoil.functionalDescription?.forEach(w => {
                if (w.wire == null || w.wire === "") w.wire = "Dummy";
            });

            const margins = [];
            // Use object format only when there are existing sections AND no new sections were added.
            // When new sections are added (e.g. interleaving pattern changed), we must use the array
            // format so the backend applies alignments by index to ALL sections, including new ones.
            if (this.conductiveSections.length > 0 && this.conductiveSections.length === this.localData.dataPerSection.length) {
                inputCoil["_turnsAlignment"] = {};
                inputCoil["_layersOrientation"] = {};
                this.localData.dataPerSection.forEach((datum, sectionIndex) => {
                    if (sectionIndex in this.conductiveSections) {
                        const sectionName = this.conductiveSections[sectionIndex].name
                        inputCoil["_turnsAlignment"][sectionName] = datum.turnsAlignment;
                        inputCoil["_layersOrientation"][sectionName] = datum.layersOrientation;
                    }
                    margins.push([datum.topOrLeftMargin, datum.bottomOrRightMargin])
                })
            }
            else {
                inputCoil["_turnsAlignment"] = [];
                inputCoil["_layersOrientation"] = [];
                this.localData.dataPerSection.forEach((datum, sectionIndex) => {
                    inputCoil["_turnsAlignment"].push(datum.turnsAlignment);
                    inputCoil["_layersOrientation"].push(datum.layersOrientation);
                    margins.push([datum.topOrLeftMargin, datum.bottomOrRightMargin])
                })
            }
            inputCoil["_interlayerInsulationThickness"] = this.localData.interlayerThickness;
            inputCoil["_intersectionInsulationThickness"] = this.localData.intersectionThickness;
            
            // Include margins in hash computation to detect margin changes even when sectionsDescription doesn't exist yet.
            // The winding-studio pins (drawn section rects) and the compact switch also
            // ride the hash so clearing/toggling them re-winds.
            // Defense in depth for the shape-change watcher: a pin only rides the
            // wind when the current winding window has the same shape it was
            // drawn on. A rect from a rectangular window applied to a round one
            // (or vice versa) reinterprets meters as degrees and corrupts the coil.
            const currentWindowShape = effectiveBobbin(bobbin)?.processedDescription?.windingWindows?.[0]?.shape ?? null;
            let customSectionRects = null;
            if (this.windingStudioStore.customSectionCount > 0) {
                const matchingRects = {};
                for (const [sectionName, rect] of Object.entries(this.windingStudioStore.customSectionRects)) {
                    if (rect.windowShape == null || rect.windowShape === currentWindowShape) {
                        matchingRects[sectionName] = { coordinates: rect.coordinates, dimensions: rect.dimensions };
                    }
                }
                if (Object.keys(matchingRects).length > 0) {
                    customSectionRects = matchingRects;
                }
            }
            const compactEnabled = this.windingStudioStore.compactEnabled;
            // Winding-style overrides (studio parallels knob) ride the wind and
            // the no-op hash so changing one re-winds.
            const windingStyleOverrides = Object.keys(this.windingStudioStore.windingStyleOverrides).length > 0
                ? { ...this.windingStudioStore.windingStyleOverrides }
                : null;
            if (windingStyleOverrides != null) {
                inputCoil["_windingStyle"] = windingStyleOverrides;
            }
            const coilWithMargins = {
                ...this.masStore.mas.magnetic.coil,
                _margins: margins,
                _customSectionRects: customSectionRects,
                _windingStyle: windingStyleOverrides,
                _compact: compactEnabled
            };
            const inputCoilWithMargins = {
                ...inputCoil,
                _margins: margins,
                _customSectionRects: customSectionRects,
                _windingStyle: windingStyleOverrides,
                _compact: compactEnabled
            };
            
            const newMagneticCoilHash = generateHash(JSON.stringify(coilWithMargins));
            const newInputsCoilHash = generateHash(JSON.stringify(inputCoilWithMargins));



            if (this.oldMagneticCoilHash != newMagneticCoilHash || this.oldInputsCoilHash != newInputsCoilHash) {
                this.oldMagneticCoilHash = newMagneticCoilHash;
                this.oldInputsCoilHash = newInputsCoilHash;

                this.$emit("fits", true);
                try {
                    const pattern = [];
                    this.localData.pattern.split('').forEach((char) => {
                        pattern.push(Number(char) - 1);
                    });

                    // Core columns ride along so multi-column placements (winding
                    // studio) can wind lateral-leg frames; no-op for classic coils.
                    const coreColumns = this.masStore.mas.magnetic.core?.processedDescription?.columns ?? null;
                    this.taskQueueStore.wind(inputCoil, this.localData.repetitions, this.localData.proportionPerWinding, pattern, margins, coreColumns, customSectionRects, compactEnabled).then((coil) => {
                        this.taskQueueStore.calculateFillingFactors(coil).then((fillingFactors) => {
                            this.localData.fillingFactors = fillingFactors;
                            // A layout that shows the coil's numbers away from this
                            // panel needs them too (ABT #1121).
                            this.$emit('fillingFactorsChanged', fillingFactors);
                        })

                        this.taskQueueStore.checkIfSectionsAndLayersFit(coil).then((fits) => {
                            this.$emit("fits", fits);
                        })

                        // Preserve the bobbin from the existing coil before assigning the new coil
                        // The wind() function returns a coil without bobbin data
                        const existingBobbin = this.masStore.mas.magnetic.coil.bobbin;
                        this.masStore.mas.magnetic.coil = coil;
                        this.masStore.mas.magnetic.coil.bobbin = existingBobbin;

                        // Unblock FIRST so addToHistory succeeds — during initial
                        // mount and file import, history is blocked until this point.
                        this.historyStore.unblockAdditions();
                        // Studio gestures pass a key so a flurry of re-winds from
                        // one drag coalesces into a single undo step.
                        this.historyStore.addToHistory(this.masStore.mas, this._studioGestureKey);
                        this._studioGestureKey = null;
                        this.tryingToSend = false;
                    })
                    .catch(error => {
                        console.error(error);
                        this.tryingToSend = false;
                    });
                }
                catch (e) {
                    console.error(e);
                    this.tryingToSend = false;
                    this.recentChange = true;
                    this.blockingRebounds = true;
                    this.assignLocalData(this.masStore.mas.magnetic);
                    this.tryToWind();
                    if (this._reboundsTimer) clearTimeout(this._reboundsTimer);
                    this._reboundsTimer = setTimeout(() => {
                        this.blockingRebounds = false;
                        this._reboundsTimer = null;
                    }, 100);
                }
            }
            else {
                this.tryingToSend = false;
            }

        },
        tryToWind() {
            if (!this.tryingToSend) {
                this.recentChange = false
                this.tryingToSend = true
                if (this._windTimer) clearTimeout(this._windTimer);
                this._windTimer = setTimeout(() => {
                    this._windTimer = null;
                    if (this.recentChange) {
                        this.tryingToSend = false
                        this.tryToWind()
                    }
                    else {
                        this.wind();
                    }
                }
                , this.$settingsStore.waitingTimeAfterChange);
            }
        },
        assignLocalData(magnetic) {
            if (!this.blockingRebounds) {
                try {
                    if (magnetic.coil.bobbin != "" && magnetic.coil.bobbin != "Dummy") {
                        const localDataBobbin = effectiveBobbin(magnetic.coil.bobbin);
                        if (localDataBobbin.processedDescription != null) {
                            if (localDataBobbin.processedDescription.windingWindows != null) {
                                if (localDataBobbin.processedDescription.windingWindows[0].sectionsAlignment != null) {
                                    this.localData.sectionsAlignment = localDataBobbin.processedDescription.windingWindows[0].sectionsAlignment;
                                }
                                if (localDataBobbin.processedDescription.windingWindows[0].sectionsOrientation != null) {
                                    this.localData.sectionsOrientation = localDataBobbin.processedDescription.windingWindows[0].sectionsOrientation;
                                }
                                if (localDataBobbin.processedDescription.wallThickness != null && localDataBobbin.processedDescription.columnThickness != null) {
                                    this.localData.bobbinWallThickness = localDataBobbin.processedDescription.wallThickness;
                                    this.localData.bobbinColumnThickness = localDataBobbin.processedDescription.columnThickness;
                                }
                            }
                        }
                    }
                    if (magnetic.coil.sectionsDescription != null && magnetic.coil.layersDescription != null) {
                        let conductionSectionIndex = 0;
                        magnetic.coil.sectionsDescription.forEach((section) => {
                            if (section.type == "conduction") {
                                if (this.localData.dataPerSection.length <= conductionSectionIndex) {
                                    const previousSection = conductionSectionIndex > 0
                                        ? this.localData.dataPerSection[conductionSectionIndex - 1]
                                        : null;
                                    // Try to inherit from the last section of the same winding
                                    const currentWindingChar = this.localData.pattern[conductionSectionIndex];
                                    let sameWindingSection = null;
                                    for (let i = conductionSectionIndex - 1; i >= 0; i--) {
                                        if (this.localData.pattern[i] == currentWindingChar) {
                                            sameWindingSection = this.localData.dataPerSection[i];
                                            break;
                                        }
                                    }
                                    const template = sameWindingSection || previousSection;
                                    this.localData.dataPerSection.push({
                                        layersOrientation: template ? template.layersOrientation : WindingOrientation.Overlapping,
                                        turnsAlignment: template ? template.turnsAlignment : CoilAlignment.Spread,
                                        topOrLeftMargin: template ? template.topOrLeftMargin : 0,
                                        bottomOrRightMargin: template ? template.bottomOrRightMargin : 0,
                                    });
                                }
                                this.localData.dataPerSection[conductionSectionIndex].layersOrientation = section.layersOrientation;

                                magnetic.coil.layersDescription.forEach((layer, layerIndex) => {
                                    if (layer.section == section.name) {
                                        if (layer.type == "conduction") {
                                            this.localData.dataPerSection[conductionSectionIndex].turnsAlignment = layer.turnsAlignment;
                                        }
                                        else {

                                            if (section.layersOrientation == "overlapping") {
                                                this.localData.interlayerThickness = layer.dimensions[0];
                                            }
                                            else {
                                                this.localData.interlayerThickness = layer.dimensions[1];
                                            }

                                        }
                                    }
                                })

                                if (section.margin != null) {
                                    if (section.margin.bottomOrRightWidth != null) {
                                        this.localData.dataPerSection[conductionSectionIndex].topOrLeftMargin = section.margin.topOrLeftWidth;
                                        this.localData.dataPerSection[conductionSectionIndex].bottomOrRightMargin = section.margin.bottomOrRightWidth;
                                    }
                                    else {
                                        this.localData.dataPerSection[conductionSectionIndex].topOrLeftMargin = section.margin[0];
                                        this.localData.dataPerSection[conductionSectionIndex].bottomOrRightMargin = section.margin[1];
                                    }
                                }

                                conductionSectionIndex += 1;
                            }
                            else {
                                if (this.localData.sectionsOrientation == "overlapping") {
                                    this.localData.intersectionThickness = section.dimensions[0];
                                }
                                else {
                                    if (this.masStore.mas.magnetic.core.functionalDescription.shape.family == 't') {
                                        const thickness = section.dimensions[0] * Math.sin(section.dimensions[1]);
                                        this.localData.intersectionThickness = thickness;
                                    }
                                    else {
                                        this.localData.intersectionThickness = section.dimensions[1];
                                    }
                                }
                            }
                        })
                    }

                    this.masStore.mas.magnetic.coil.functionalDescription.forEach((datum, sectionIndex) => {
                        if (sectionIndex >= this.localData.dataPerSection.length) {
                            this.localData.dataPerSection.push({
                                layersOrientation: this.localData.dataPerSection[sectionIndex - 1].layersOrientation,
                                turnsAlignment: this.localData.dataPerSection[sectionIndex - 1].turnsAlignment,
                                topOrLeftMargin: this.localData.dataPerSection[sectionIndex - 1].topOrLeftMargin,
                                bottomOrRightMargin: this.localData.dataPerSection[sectionIndex - 1].bottomOrRightMargin,
                            });
                        }
                    })

                    this.forceUpdate += 1;
                    this.$stateStore.storeWoundConfiguration(this.localData);
                }
                catch (e) {
                }
            }
        },
        assignCoilData() {
            // Per-column array form: the alignment/orientation knobs belong to the
            // centre part's window (element 0), never to the Array object itself.
            const coilDataBobbin = Array.isArray(this.masStore.mas.magnetic.coil.bobbin)
                ? this.masStore.mas.magnetic.coil.bobbin[0]
                : this.masStore.mas.magnetic.coil.bobbin;
            if (coilDataBobbin.processedDescription == null) {
                coilDataBobbin.processedDescription = {};
            }
            if (coilDataBobbin.processedDescription.windingWindows == null) {
                coilDataBobbin.processedDescription.windingWindows = [];
                coilDataBobbin.processedDescription.windingWindows.push({});
            }

            coilDataBobbin.processedDescription.windingWindows[0].sectionsAlignment = this.localData.sectionsAlignment;
            coilDataBobbin.processedDescription.windingWindows[0].sectionsOrientation = this.localData.sectionsOrientation;

            // Update margins in the coil's sectionsDescription
            if (this.masStore.mas.magnetic.coil.sectionsDescription != null) {
                let conductionSectionIndex = 0;
                this.masStore.mas.magnetic.coil.sectionsDescription.forEach((section) => {
                    if (section.type == "conduction" && conductionSectionIndex < this.localData.dataPerSection.length) {
                        if (section.margin == null) {
                            section.margin = {};
                        }
                        section.margin.topOrLeftWidth = this.localData.dataPerSection[conductionSectionIndex].topOrLeftMargin;
                        section.margin.bottomOrRightWidth = this.localData.dataPerSection[conductionSectionIndex].bottomOrRightMargin;
                        conductionSectionIndex++;
                    }
                });
            }
        },
        coilUpdated() {
            this.updateDataPerSection();
            this.assignCoilData();
            this.recentChange = true;
            this.tryToWind();
        },
        updateDataPerSection() {

            while (this.localData.dataPerSection.length > this.localData.pattern.length) {
                this.localData.dataPerSection.pop();
            }

            this.localData.pattern.split('').forEach((windingIndexPlusOne, newSectionIndex) => {
                if (newSectionIndex >= this.localData.dataPerSection.length) {
                    let newSection = null;
                    // Inherit from the last section of the same winding
                    for (let i = newSectionIndex - 1; i >= 0; i--) {
                        if (this.localData.pattern[i] == windingIndexPlusOne) {
                            newSection = deepCopy(this.localData.dataPerSection[i]);
                            break;
                        }
                    }
                    // Fallback to the immediately previous section
                    if (!newSection && newSectionIndex > 0) {
                        newSection = deepCopy(this.localData.dataPerSection[newSectionIndex - 1]);
                    }
                    // Final fallback to defaults
                    if (!newSection) {
                        newSection = {
                            layersOrientation: WindingOrientation.Overlapping,
                            turnsAlignment: CoilAlignment.Spread,
                            topOrLeftMargin: 0,
                            bottomOrRightMargin: 0,
                        };
                    }
                    this.localData.dataPerSection.push(newSection);
                }
            })

        },
        marginUpdated(sectionIndex) {
            this.coilUpdated();
        },
        swapShowAlignmentOptions(showAlignmentOptions) {
            this.showAlignmentOptions = showAlignmentOptions;
        },
        swapShowInsulationOptions(showInsulationOptions) {
            this.showInsulationOptions = showInsulationOptions;
        },
        bobbinUpdated(thickness) {
            // Prevent regenerating bobbin with zero thickness values
            if (this.localData.bobbinWallThickness <= 0 || this.localData.bobbinColumnThickness <= 0) {
                console.warn('[BasicCoilSelector] Bobbin thickness must be greater than 0. Current values:', {
                    wall: this.localData.bobbinWallThickness,
                    column: this.localData.bobbinColumnThickness
                });
                return;
            }

            // Check if thickness actually changed from current bobbin to avoid infinite loop
            const currentBobbin = this.masStore.mas.magnetic.coil.bobbin;
            if (Array.isArray(currentBobbin)) {
                // Per-column bobbins (catalog centre part + ad-hoc lateral parts):
                // regenerating a single simple bobbin here would silently discard
                // the catalog part. The centre part's thickness is the part's own.
                console.error('[BasicCoilSelector] Bobbin thickness cannot be edited on a per-column bobbin set: the centre part is a real catalog bobbin.');
                return;
            }
            if (currentBobbin && currentBobbin !== "Dummy" && currentBobbin.processedDescription) {
                const currentWall = currentBobbin.processedDescription.wallThickness;
                const currentColumn = currentBobbin.processedDescription.columnThickness;
                const newWall = this.localData.bobbinWallThickness;
                const newColumn = this.localData.bobbinColumnThickness;
                
                if (Math.abs(currentWall - newWall) < 1e-9 && Math.abs(currentColumn - newColumn) < 1e-9) {
                    return;
                }
            }

            this.taskQueueStore.generateBobbinDifferentThicknesses(this.masStore.mas.magnetic.core, this.localData.bobbinWallThickness, this.localData.bobbinColumnThickness).then((bobbin) => {
                this.masStore.mas.magnetic.coil.bobbin = bobbin;
                this.coilUpdated();
            })
            .catch(error => {
                this.tryingToSend = false;
                console.error(error);
            });
        },
        showParasiticsView() {
            this.$stateStore.magneticBuilder.mode.coil = this.$stateStore.MagneticBuilderModes.Advanced;
        },
        toggleTemperaturePlot() {
            const currentMode = this.$stateStore.magnetic2DVisualizerState.plotMode;
            if (currentMode === 'temperature_field') {
                this.$emit('plotModeChange', 'basic');
            } else {
                this.$emit('plotModeChange', 'temperature_field');
            }
        },
    }
}
</script>

<template>
    <div class="container">
        <div
            class="coil-config-panel"
            :style="{ '--coil-config-value-font-size': $styleStore.magneticBuilder.inputFontSize?.['font-size'] ?? $styleStore.magneticBuilder.inputFontSize?.fontSize }"
        >
            <div class="coil-config-header">
                <div class="coil-config-header-left">
                    <i class="pi pi-cog-wide-connected"></i>
                    <span>Coil Configuration</span>
                </div>
                <div class="coil-config-header-right">
                    <button
                        type="button"
                        :disabled="loading"
                        :class="['coil-config-header-btn', magneticBuilderSettingsStore.enableWindingStudio ? 'coil-config-header-btn-primary' : 'coil-config-header-btn-outline']"
                        :data-cy="dataTestLabel + '-Coil-WindingStudio-button'"
                        @click="magneticBuilderSettingsStore.enableWindingStudio = !magneticBuilderSettingsStore.enableWindingStudio"
                    >
                        <i class="pi pi-objects-column"></i>
                        <span>Studio</span>
                    </button>
                    <button
                        v-if="!masStore.hasMirroredWindings"
                        type="button"
                        :disabled="!enableSubmenu || loading"
                        :class="['coil-config-header-btn', showAlignmentOptions ? 'coil-config-header-btn-primary' : 'coil-config-header-btn-outline']"
                        @click="swapShowAlignmentOptions(!showAlignmentOptions)"
                    >
                        <i class="pi pi-align-center"></i>
                        <span>Alignment</span>
                    </button>
                    <button
                        type="button"
                        :disabled="!enableSubmenu || loading"
                        :class="['coil-config-header-btn', showInsulationOptions ? 'coil-config-header-btn-primary' : 'coil-config-header-btn-outline']"
                        @click="swapShowInsulationOptions(!showInsulationOptions)"
                    >
                        <i class="pi pi-shield"></i>
                        <span>Insulation</span>
                    </button>
                </div>
            </div>
            <div class="coil-config-body">
                <!-- min-height, not just max-height: Magnetic2DVisualizer sizes its drawing
                     FROM this box, and this box was sized BY its content, so a portrait core
                     collapsed the row to the drawing's own intrinsic height and the drawing
                     was then "scaled" to the size it already was (measured: a 50 x 83 SVG in
                     a 524 x 91 row). Landscape cores never showed it, taking the visualizer's
                     100%-width branch instead. A real height breaks the circularity.

                     It has to be `height`, not `min-height`: the visualizer's own box is
                     height:100%, and a percentage height resolves against the parent's
                     DEFINITE height — min-height does not make one, so height:100% fell back
                     to auto and the row collapsed to its content exactly as before. -->
                <div
                    v-if="magneticBuilderSettingsStore.enableWindingStudio && useVisualizers && masStore.mas.magnetic != null && masStore.mas.magnetic.core != null && masStore.mas.magnetic.core.functionalDescription.shape != ''"
                    class="mb-3"
                    :style="(imageUpToDate? 'opacity: 100%;' : 'opacity: 20%;') + ' max-height: 50vh;'"
                >
                    <WindingStudio
                        :dataTestLabel="dataTestLabel"
                        :masStore="masStore"
                        :editable="!readOnly"
                        :busy="placingWinding"
                        :customCount="windingStudioStore.customSectionCount"
                        :showCompactToggle="true"
                        :compact="windingStudioStore.compactEnabled"
                        :fieldOverlay="fieldOverlaySvg"
                        :windingStyleOverrides="windingStudioStore.windingStyleOverrides"
                        @placeWinding="placeWindingInColumn"
                        @resizeProportions="resizeProportionsFromStudio"
                        @resizeMargins="resizeMarginsFromStudio"
                        @resizeSectionRect="resizeSectionRectFromStudio"
                        @clearCustomRects="clearCustomLayoutFromStudio"
                        @update:compact="setCompactFromStudio"
                        @interleaveWinding="interleaveFromStudio"
                        @requestFieldOverlay="requestFieldOverlayFromStudio"
                        @setWindowLayout="setWindowLayoutFromStudio"
                        @setSectionLayout="setSectionLayoutFromStudio"
                        @autoFit="autoFitFromStudio"
                        @setWindingGroups="setWindingGroupsFromStudio"
                        :ferriteColor="$styleStore.magneticBuilder.painterColorFerrite || '0x7b7c7d'"
                        :bobbinColor="$styleStore.magneticBuilder.painterColorBobbin || '0x539796'"
                        :copperColor="$styleStore.magneticBuilder.painterColorCopper || '0xb87333'"
                        :insulationColor="$styleStore.magneticBuilder.painterColorInsulation || '0xfff05b'"
                        :marginColor="$styleStore.magneticBuilder.painterColorMargin || '0xfff05b'"
                        :backgroundColor="$styleStore.magneticBuilder.main['background-color'] || $styleStore.magneticBuilder.main['background'] || 'transparent'"
                        :textColor="$styleStore.magneticBuilder.inputTextColor?.color || '#ffffff'"
                    />
                </div>
                <div
                    v-else-if="useVisualizers && masStore.mas.magnetic != null && masStore.mas.magnetic.core != null && masStore.mas.magnetic.core.functionalDescription.shape != ''"
                    class="row mb-3"
                    :style="(imageUpToDate? 'opacity: 100%;' : 'opacity: 20%;') + ' height: 260px; max-height: 50vh;'"
                >
                     <Magnetic2DVisualizer
                         :modelValue="masStore.mas"
                         :forceUpdate="forceUpdateVisualizer"
                         :operatingPointIndex="operatingPointIndex"
                         :enableZoom="false"
                         :enableOptions="false"
                         :enableHideOnFitting="enableSimulation"
                         :coilFits="true"
                         :plotModeInit="$stateStore.magnetic2DVisualizerState.plotMode"
                         :includeFringingInit="$stateStore.magnetic2DVisualizerState.includeFringing"
                         :backgroundColor="$styleStore.magneticBuilder.main['background-color'] || $styleStore.magneticBuilder.main['background'] || 'var(--p-dark)'"
                         :textColor="$styleStore.magneticBuilder.inputTextColor?.color || 'var(--p-white)'"
                         :buttonStyle="$styleStore.magneticBuilder.coilVisualizerButton"
                         :insulationColor="$styleStore.magneticBuilder.painterColorInsulation || '0xfff05b'"
                         :marginColor="$styleStore.magneticBuilder.painterColorMargin || '0xfff05b'"
                         :spacerColor="$styleStore.magneticBuilder.painterColorSpacer || '0x3b3b3b'"
                         :ferriteColor="$styleStore.magneticBuilder.painterColorFerrite || '0x7b7c7d'"
                         :copperColor="$styleStore.magneticBuilder.painterColorCopper || '0xb87333'"
                         :drawSpacer="$styleStore.magneticBuilder.painterDrawSpacer !== undefined ? $styleStore.magneticBuilder.painterDrawSpacer : true"
                         :enableTemperaturePlot="enableTemperaturePlot"
                         @plotModeChange="$emit('plotModeChange', $event)"
                         @swapIncludeFringing="$emit('swapIncludeFringing', $event)"
                        @errorInImage="$emit('errorInImage', $event)"
                        :loadingGif="$settingsStore.loadingGif"
                    />
                </div>

                <div class="builder-actions">
                    <button
                        v-if="enableSimulation"
                        :disabled="masStore.mas.magnetic == null || masStore.mas.magnetic.core == null || masStore.mas.magnetic.core.functionalDescription.shape == ''"
                        :data-cy="dataTestLabel + '-Coil-ShowParasiticsView-button'"
                        class="builder-action-btn builder-action-btn-outline"
                        @click="showParasiticsView"
                    >
                        <i class="pi pi-volume-up mr-2"></i>Advanced Parasitics
                    </button>

                    <button
                        v-if="enableSimulation && enableTemperaturePlot"
                        :disabled="masStore.mas.magnetic == null || masStore.mas.magnetic.core == null || masStore.mas.magnetic.core.functionalDescription.shape == ''"
                        :data-cy="dataTestLabel + '-Coil-ToggleTemperaturePlot-button'"
                        :class="['builder-action-btn', $stateStore.magnetic2DVisualizerState.plotMode === 'temperature_field' ? 'builder-action-btn-primary' : 'builder-action-btn-ghost']"
                        @click="toggleTemperaturePlot"
                    >
                        <i class="pi pi-sun mr-2 temp-icon"></i>{{ $stateStore.magnetic2DVisualizerState.plotMode === 'temperature_field' ? 'Hide Temperature' : 'Show Temperature' }}
                    </button>
                </div>

                <div v-if="showInterleavingOrder || masStore.mas.magnetic.core.functionalDescription.shape.family != 't'" class="coil-config-grid">
                    <div v-if="masStore.mas.magnetic.core.functionalDescription.shape.family != 't'" class="coil-config-cell coil-config-cell-wide">
                        <Dimension 
                            :disabled="readOnly"
                            class="text-left"
                            :name="'bobbinWallThickness'"
                            :replaceTitle="'Wall Thickness'"
                            :unit="'m'"
                            :defaultZeroUnit="0.001"
                            :dataTestLabel="dataTestLabel + '-BobbinWallThickness'"
                            :numberDecimals="6"
                            :min="1e-6"
                            :max="1"
                            :allowNegative="false"
                            :allowZero="true"
                            :modelValue="localData"
                            :forceUpdate="forceUpdate"
                            :styleClassInput="'col-offset-3 col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="bobbinUpdated"
                        />
                    </div>
                    <div v-if="masStore.mas.magnetic.core.functionalDescription.shape.family != 't'" class="coil-config-cell coil-config-cell-wide">
                        <Dimension 
                            :disabled="readOnly"
                            class="text-left"
                            :name="'bobbinColumnThickness'"
                            :replaceTitle="'Column Thickness'"
                            :unit="'m'"
                            :defaultZeroUnit="0.001"
                            :dataTestLabel="dataTestLabel + '-BobbinColumnThickness'"
                            :numberDecimals="6"
                            :min="1e-6"
                            :max="1"
                            :allowNegative="false"
                            :allowZero="true"
                            :modelValue="localData"
                            :forceUpdate="forceUpdate"
                            :styleClassInput="'col-offset-3 col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="bobbinUpdated"
                        />
                    </div>
                    <div v-if="showInterleavingOrder && !loading && masStore.mas.magnetic.coil.functionalDescription.length > 1" class="coil-config-cell coil-config-cell-wide">
                        <img :data-cy="dataTestLabel + '-BasicCoilSelector-loading'" v-if="loading" class="mx-auto d-block col-12" alt="loading" style="width: 60%; height: auto;" :src="$settingsStore.loadingGif">
                        <ListOfCharacters
                            v-tooltip="tooltipsMagneticBuilder.sectionsInterleaving"
                            :disabled="readOnly"
                            class="text-left"
                            :dataTestLabel="dataTestLabel + '-SectionsInterleaving'"
                            :modelValue="localData.pattern" 
                            @updateModelValue="localData.pattern = $event"
                            :name="'pattern'"
                            :replaceTitle="'Interleaving Order'"
                            :allowConsecutive="true"
                            :allowedCharacters="windingIndexesCharacters"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="coilUpdated"
                        />
                    </div>

                </div>

                <CoilInfo
                    v-if="showInfoPanel && !loading && enableSimulation"
                    ref="coilInfo"
                    :dataTestLabel="dataTestLabel + '-BasicCoreInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                    :fillingFactors="localData.fillingFactors"
                    :sectionsOrientation="localData.sectionsOrientation"
                />

            </div>
        </div>
               
        <BasicCoilSectionAlignmentSelector
            v-if="!masStore.hasMirroredWindings"
            :data="localData"
            :showAlignmentOptions="showAlignmentOptions"
            :masStore="masStore"
            :readOnly="readOnly"
            @coilUpdated="coilUpdated"
            @closeAlignment="swapShowAlignmentOptions(false)"
        />

        <BasicCoilSectionInsulationSelector
            :data="localData"
            :showInsulationOptions="showInsulationOptions"
            :masStore="masStore"
            :readOnly="readOnly"
            @marginUpdated="marginUpdated"
            @closeInsulation="swapShowInsulationOptions(false)"
        />
    </div>
</template>

<style scoped>
.coil-config-panel {
    background: linear-gradient(145deg, color-mix(in srgb, var(--p-gray-600) 6%, transparent) 0%, color-mix(in srgb, var(--p-gray-600) 2%, transparent) 100%);
    border: 1px solid color-mix(in srgb, var(--p-gray-600) 20%, transparent);
    border-radius: 14px;
    padding: 0;
    margin: 0.15rem 0 0.25rem 0;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.12), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    overflow: hidden;
}

.coil-config-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* The action buttons do not fit beside the title in a narrow column:
     * let them wrap under it rather than spill past the card (ABT #1121). */
    flex-wrap: wrap;
    row-gap: 0.35rem;
    padding: 0.6rem 0.9rem;
    background: color-mix(in srgb, var(--p-gray-600) 10%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--p-gray-600) 15%, transparent);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.coil-config-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
}

.coil-config-header-left span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.coil-config-header-left i {
    font-size: 0.95rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.coil-config-header-right {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
    justify-content: flex-end;
    row-gap: 0.3rem;
    min-width: 0;
}

.coil-config-header-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    border: 1px solid transparent;
    transition: filter 0.15s, box-shadow 0.2s, transform 0.1s, background 0.15s, color 0.15s;
    white-space: nowrap;
}

.coil-config-header-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.coil-config-header-btn:not(:disabled):hover {
    filter: brightness(1.12);
    transform: translateY(-1px);
}

.coil-config-header-btn-primary {
    background: linear-gradient(135deg,
        color-mix(in srgb, var(--p-primary) 115%, transparent 0%) 0%,
        var(--p-primary) 55%,
        rgba(var(--p-primary-rgb), 0.85) 100%);
    color: var(--p-white);
    border: 1px solid color-mix(in srgb, var(--p-primary) 70%, var(--p-white) 30%);
    box-shadow:
        0 0 0 1px rgba(var(--p-primary-rgb), 0.35),
        0 2px 8px rgba(var(--p-primary-rgb), 0.4),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
    text-shadow: 0 1px 1px rgba(var(--p-black-rgb), 0.25);
}

.coil-config-header-btn-outline {
    background: rgba(var(--p-primary-rgb), 0.2);
    border: 1px solid rgba(var(--p-primary-rgb), 0.55);
    color: var(--p-primary);
    box-shadow: 0 1px 4px rgba(var(--p-black-rgb), 0.2);
}

.coil-config-header-btn-outline:hover {
    background: rgba(var(--p-primary-rgb), 0.3);
    border-color: rgba(var(--p-primary-rgb), 0.75);
    box-shadow: 0 2px 6px rgba(var(--p-primary-rgb), 0.25);
}

.coil-config-body {
    padding: 0.5rem 0.6rem;
}

.coil-config-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.15rem;
    background: var(--p-dark);
    border-radius: 10px;
    padding: 0.35rem;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
}

.coil-config-cell {
    box-sizing: border-box;
    min-width: 0;
    overflow: hidden;
}

@media (max-width: 576px) {
    .coil-config-grid {
        grid-template-columns: 1fr;
    }
}

.coil-config-cell {
    border-radius: 10px;
    padding: 0.1rem 0.35rem 0.1rem 0.35rem;
}

.coil-config-cell-wide {
    grid-column: 1 / -1;
}

.coil-config-cell :deep(.form-label),
.coil-config-cell :deep(label) {
    padding-left: 0.35rem !important;
    text-align: start !important;
}

/* Wall Thickness / Column Thickness / Interleaving Order rows: same
 * layout discipline as core/wire — labels auto-sized + right-aligned,
 * value column pinned to right at fixed 50%, no overlap, no truncation. */
.coil-config-cell-wide :deep(.dim-row),
.coil-config-cell-wide :deep(.loc-row) {
    display: flex;
    align-items: center;
    column-gap: 0.5rem;
    flex-wrap: nowrap;
    width: 100%;
}
.coil-config-cell-wide :deep(.dim-row > label.dim-label),
.coil-config-cell-wide :deep(.loc-row > label.loc-label) {
    flex: 0 0 auto !important;
    width: auto !important;
    max-width: none !important;
    min-width: 0 !important;
    white-space: nowrap !important;
    overflow: visible !important;
    text-overflow: clip !important;
    text-align: start !important;
}
.coil-config-cell-wide :deep(.dim-value-row),
.coil-config-cell-wide :deep(.loc-input) {
    flex: 0 0 50% !important;
    width: 50% !important;
    max-width: 50% !important;
    margin-left: auto !important;
    box-sizing: border-box;
}
.coil-config-cell-wide :deep(.dwt-unit-addon),
.coil-config-cell-wide :deep(.dim-unit) {
    width: 3.5rem !important;
    min-width: 3.5rem !important;
    max-width: 3.5rem !important;
    flex: 0 0 3.5rem !important;
}
.coil-config-cell-wide :deep(.p-inputnumber),
.coil-config-cell-wide :deep(.p-inputgroup) {
    width: 100%;
    min-width: 0;
}
.coil-config-cell-wide :deep(.p-inputgroup) {
    max-width: 100%;
    flex-wrap: nowrap;
}
.coil-config-cell-wide :deep(.p-inputgroup .p-inputnumber) {
    flex: 1 1 0;
    min-width: 0;
}
.coil-config-cell-wide :deep(.p-inputgroup .p-inputnumber input) {
    width: 100%;
    min-width: 0;
}
.coil-config-cell-wide :deep(.p-inputgroup-addon),
.coil-config-cell-wide :deep(.dwt-unit-addon) {
    flex: 0 0 auto;
    max-width: 4.5rem;
}
/* Match input font size to the surrounding DimensionReadOnly value text.
 * Inherit from the parent's :style="valueFontSize" instead of overriding
 * with a hardcoded small size. */
.coil-config-cell-wide :deep(.loc-input) {
    min-height: 2rem;
    padding: 0 0.4rem;
    font-size: var(--coil-config-value-font-size, 1.15rem) !important;
}
.coil-config-cell-wide :deep(.p-inputnumber-input),
.coil-config-cell-wide :deep(.p-inputnumber input),
.coil-config-cell-wide :deep(input.p-inputtext),
.coil-config-cell-wide :deep(.p-select-label),
.coil-config-cell-wide :deep(.dwt-unit-addon),
.coil-config-cell-wide :deep(.dim-unit) {
    font-size: var(--coil-config-value-font-size, 1.15rem) !important;
}

.builder-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
    padding: 0 4px 12px;
}

.builder-action-btn {
    flex: 1 1 auto;
    min-width: fit-content;
    max-width: 260px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    border: 1px solid transparent;
    transition: filter 0.15s, box-shadow 0.2s, transform 0.1s, background 0.15s, color 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.builder-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.builder-action-btn:not(:disabled):hover {
    filter: brightness(1.12);
    transform: translateY(-1px);
}

.builder-action-btn-primary {
    background: linear-gradient(135deg,
        color-mix(in srgb, var(--p-success) 115%, transparent 0%) 0%,
        var(--p-success) 55%,
        rgba(var(--p-success-rgb), 0.85) 100%);
    color: var(--p-white);
    border: 2px solid color-mix(in srgb, var(--p-success) 70%, var(--p-white) 30%);
    box-shadow:
        0 0 0 2px rgba(var(--p-success-rgb), 0.35),
        0 4px 14px rgba(var(--p-success-rgb), 0.5),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
    text-shadow: 0 1px 2px rgba(var(--p-black-rgb), 0.25);
}

.builder-action-btn-outline {
    background: rgba(var(--p-primary-rgb), 0.2);
    border: 1px solid rgba(var(--p-primary-rgb), 0.55);
    color: var(--p-primary);
    box-shadow: 0 2px 6px rgba(var(--p-black-rgb), 0.2);
}

.builder-action-btn-ghost {
    background: rgba(var(--p-white-rgb), 0.08);
    border: 1px solid rgba(var(--p-white-rgb), 0.28);
    color: rgba(var(--p-white-rgb), 0.9);
    box-shadow: 0 2px 6px rgba(var(--p-black-rgb), 0.2);
}

.temp-icon {
    color: var(--p-danger);
}
</style>
