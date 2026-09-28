<script setup>
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import { useHistoryStore } from '../../../stores/history'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import CoreShapeTableModal from './CoreShapeTableModal.vue'
import { useTaskQueueStore } from '../../../stores/taskQueue'
</script>

<script>
/**
 * Human label of a MAS core shape family. Planar families are camelCase
 * ("planarE", "planarEL", "planarER"); a plain toUpperCase() makes them an
 * unreadable "PLANARE", so they render as "Planar E" etc.
 */
export function shapeFamilyLabel(shapeFamily) {
    return /^planar/i.test(shapeFamily)
        ? 'Planar ' + shapeFamily.slice(6).toUpperCase()
        : shapeFamily.toUpperCase();
}

function requireNumber(value, what, shapeName) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Core shape "${shapeName}" has no ${what} in its processed description`);
    }
    return value;
}

/**
 * One row of the core shape table (CoreShapeTableModal) from a processed
 * core JSON. Every numeric field is a plain number in the unit the table's
 * column title names (mm, mm², mm³, mm⁴), so the table can order and
 * range-filter them numerically. `family` stays the raw MAS enum value
 * (it is what the selector applies); `familyLabel` is what the table shows.
 */
export function buildShapeRow(core) {
    const shape = core.functionalDescription.shape;
    const processed = core.processedDescription;
    const effective = processed.effectiveParameters;
    const name = shape.name;
    const windingWindow = processed.windingWindows[0];
    if (windingWindow == null) {
        throw new Error(`Core shape "${name}" has no winding window in its processed description`);
    }
    const effectiveArea = requireNumber(effective.effectiveArea, 'effective area', name) * 1e6;
    const windowArea = requireNumber(windingWindow.area, 'winding window area', name) * 1e6;
    return {
        name,
        aliases: Array.isArray(shape.aliases) ? shape.aliases.filter((alias) => alias !== name) : [],
        family: shape.family,
        familyLabel: shapeFamilyLabel(shape.family),
        width: requireNumber(processed.width, 'width', name) * 1e3,
        height: requireNumber(processed.height, 'height', name) * 1e3,
        depth: requireNumber(processed.depth, 'depth', name) * 1e3,
        effectiveLength: requireNumber(effective.effectiveLength, 'effective length', name) * 1e3,
        effectiveArea,
        minimumArea: requireNumber(effective.minimumArea, 'minimum area', name) * 1e6,
        effectiveVolume: requireNumber(effective.effectiveVolume, 'effective volume', name) * 1e9,
        windowArea,
        areaProduct: effectiveArea * windowArea,
    };
}


export default {
    emits: ["update"],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        masStore: {
            type: Object,
            required: true,
        },
        readOnly: {
            type: Boolean,
            default: false,
        },
        /**
         * Bumped by the parent to open the "all shapes" table (the button lives
         * in the Core Configuration header, ABT #1072). A counter, not a
         * boolean: this component is <script setup>, so its instance is closed
         * to $refs, and a prop survives the dialog closing itself.
         */
        openTableRequest: {
            type: Number,
            default: 0,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const historyStore = useHistoryStore();
        const coreShapeNames = {}; 
        const coreShapeFamilies = {}; 
        const localData = {};

        const loading = false;
        const forceUpdate = 0;

        const coreShapeData = []; 
        const subscriptions = []; 
        return {
            taskQueueStore,
            historyStore,
            localData,
            coreShapeTableVisible: false,
            coreShapeNames,
            coreShapeFamilies,
            loading,
            forceUpdate,
            coreShapeData,

            subscriptions,
        }
    },
    computed: {
        wiringTechnology() {
            return this.masStore.mas?.inputs?.designRequirements?.wiringTechnology;
        }
    },
    watch: {
        openTableRequest(count) {
            if (count > 0) {
                this.coreShapeTableVisible = true;
            }
        },
        wiringTechnology(newVal, oldVal) {
            // When wiringTechnology changes, reload core shapes to filter appropriately
            // (e.g., exclude toroidal cores when in Planar mode)
            if (newVal !== oldVal) {
                // If switching to Printed/Planar and currently a toroidal core is selected, clear it
                if (newVal?.toLowerCase() === 'printed' && this.localData.shapeFamily?.toLowerCase() === 't') {
                    this.localData.shapeFamily = null;
                    this.localData.shape = null;
                    // Also clear from the mas store
                    if (this.masStore.mas?.magnetic?.core?.functionalDescription?.shape) {
                        this.masStore.mas.magnetic.core.functionalDescription.shape = {};
                        this.masStore.mas.magnetic.core.processedDescription = null;
                        this.masStore.mas.magnetic.core.geometricalDescription = null;
                    }
                }
                this.coreShapeNames = {};
                this.coreShapeFamilies = {};
                this.coreShapeData = [];
                this.getShapeNames();
            }
        }
    },
    created () {
    },
    mounted () {
        this.subscriptions.push(this.historyStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "historyPointerUpdated") {
                    this.assignLocalData(this.masStore.mas.magnetic.core);
                }
            });
        }))
        this.subscriptions.push(this.masStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "importedMas") {
                    this.assignLocalData(this.masStore.mas.magnetic.core);
                }
            });
        }))

        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "coreAdvised") {
                    if (args[0]) {
                        const magnetic = args[1];
                        this.localData["shape"] = magnetic.core.functionalDescription.shape.name;
                        this.localData["shapeFamily"] = magnetic.core.functionalDescription.shape.family;
                    }
                }
                if (name == "coreShapeProcessed") {
                    if (args[0]) {
                        const shape = args[1];
                        this.localData["shape"] = shape.name;
                        this.localData["shapeFamily"] = shape.family;
                    }
                }
                if (name == "coreShapesGotten") {
                    const success = args[0];
                    if (args[0]) {
                        this.coreShapeNames = args[1];
                        for (const shapeFamily of Object.keys(this.coreShapeNames)) {
                            this.coreShapeFamilies[shapeFamily] = shapeFamilyLabel(shapeFamily);
                        }
                        // Use bulk function to get all core data at once
                        this.taskQueueStore.processAllCoresFromShapes();
                    }
                    else {
                        console.error(args[1]);
                    }
                    this.loading = false;
                }
                if (name == "allCoresFromShapesProcessed") {
                    if (args[0]) {
                        const cores = args[1];
                        // The engine enumerates its alias index, so a shape
                        // with N aliases arrives N+1 times (ABT #924 for the
                        // dropdown; MKF get_shapes() has the same root). One
                        // row per shape name.
                        const seen = new Set();
                        const rows = [];
                        for (const core of cores) {
                            const row = buildShapeRow(core);
                            if (seen.has(row.name)) continue;
                            seen.add(row.name);
                            rows.push(row);
                        }
                        this.coreShapeData = rows;
                    }
                    else {
                        console.error(args[1]);
                    }
                }
                if (name == "coreFromShapeProcessed") {
                    if (args[0]) {
                        const core = args[1];
                        const row = buildShapeRow(core);
                        if (!this.coreShapeData.some((r) => r.name === row.name)) {
                            this.coreShapeData = [...this.coreShapeData, row];
                        }
                    }
                    else {
                        console.error(args[1]);
                    }
                }
            });
        }))

        this.getShapeNames();       
        this.assignLocalData(this.masStore.mas.magnetic.core);
    },
    beforeUnmount () {
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        isStackable(shape) {
            let shapeName = shape;
            if (shape == null) {
                shapeName = this.masStore.mas.magnetic.core.functionalDescription.shape;
            }
            if (! (typeof shapeName === 'string' || shapeName instanceof String)) {
                shapeName = shapeName.name;
            }

            if (shapeName.startsWith("E ") || shapeName.startsWith("U ") || shapeName.startsWith("T ")) {
                return true;
            }
            else {
                return false;
            }
        },
        assignLocalData(core) {
            if (typeof(core.functionalDescription.shape) == 'string') {
            }
            else {
                this.localData["shape"] = deepCopy(core.functionalDescription.shape.name);
                this.localData["shapeFamily"] = deepCopy(core.functionalDescription.shape.family)
            }
            this.forceUpdate += 1;
        },
        addToTableData(shapeName, shapeFamily) {
            this.taskQueueStore.processCoreFromShape(shapeName)
        },
        getShapeNames() {
            this.loading = true;
            this.taskQueueStore.getCoreShapes(this.masStore.mas, this.onlyManufacturer);
        },
        loadCore() {
        },
        async coreShapeSelected(value) {
            this.masStore.mas.magnetic.core.name = "Custom";
            this.masStore.mas.magnetic.core.manufacturerInfo = null;
            this.masStore.mas.magnetic.core.processedDescription = null;
            this.masStore.mas.magnetic.core.geometricalDescription = null;

            let mas = deepCopy(this.masStore.mas);
            mas.magnetic.core.geometricalDescription = null;
            mas.magnetic.core.processedDescription = null;

            let name = value;
            if (value.name != null) {
                name = value.name;
            }
            if (value.family != null) {
                this.localData.shapeFamily = value.family;
            }

            this.localData.shape = name;
            this.$emit('update', name, this.localData.shapeFamily)
        },
    }
}
</script>
<template>
    <CoreShapeTableModal
        v-model:visible="coreShapeTableVisible"
        :dataTestLabel="dataTestLabel"
        :coreShapeData="coreShapeData"
        :shapeFamily="localData.shapeFamily"
        @coreShapeSelected="coreShapeSelected"
    />

    <div class="row g-0">
        <img :data-cy="dataTestLabel + '-BasicCoreSelector-loading'" v-if="loading" class="mx-auto d-block col-12" alt="loading" style="width: 60%; height: auto;" :src="$settingsStore.loadingGif">
        <ElementFromList
                v-tooltip="tooltipsMagneticBuilder.coreShapeFamily"
                v-if="!loading"
                :disabled="readOnly"
                class="col-12 mb-1 text-left"
                :dataTestLabel="dataTestLabel + '-ShapeFamilies'"
                :name="'shapeFamily'"
                :titleSameRow="true"
                :justifyContent="true"
                v-model="localData"
                :options="coreShapeFamilies"
                :labelWidthProportionClass="'col-12 md:col-5'"
                :valueWidthProportionClass="'col-12 md:col-7'"
                :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
            />
            <div
                v-if="!loading && localData.shapeFamily != null && coreShapeNames[localData.shapeFamily] != null && coreShapeNames[localData.shapeFamily].length > 0"
                class="core-shape-input-group col-12"
            >
                <ElementFromList
                    v-tooltip="tooltipsMagneticBuilder.coreShape"
                    :disabled="readOnly"
                    class="col-12 text-left core-shape-row"
                    :dataTestLabel="dataTestLabel + '-ShapeNames'"
                    :name="'shape'"
                    :titleSameRow="true"
                    :justifyContent="true"
                    v-model="localData"
                    :optionsToDisable="Object.keys(coreShapeFamilies)"
                    :options="coreShapeNames[localData.shapeFamily]"
                    @update="$emit('update', localData.shape, localData.shapeFamily)"
                    :labelWidthProportionClass="'col-12 md:col-5'"
                    :valueWidthProportionClass="'col-12 md:col-7'"
                    :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                    :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                    :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                    :textColor="$styleStore.magneticBuilder.inputTextColor"
                />

            </div>
    </div>
</template>

<style scoped>
.core-shape-input-group {
    display: flex;
    align-items: stretch;
    width: 100%;
}

.core-shape-input-group :deep(.core-shape-row) {
    flex: 1 1 auto;
    min-width: 0;
}
</style>
