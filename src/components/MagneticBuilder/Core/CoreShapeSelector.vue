<script setup>
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import { useHistoryStore } from '../../../stores/history'
import { deepCopy, formatDimension, formatArea, formatVolume, removeTrailingZeroes } from '/WebSharedComponents/assets/js/utils.js'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import CoreShapeTableModal from './CoreShapeTableModal.vue'
import { useTaskQueueStore } from '../../../stores/taskQueue'
</script>

<script>

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
                        for (const [shapeFamily, group] of Object.entries(this.coreShapeNames)) {
                            // Planar families are camelCase ("planarE", "planarEl",
                            // "planarEr"); plain toUpperCase() makes them an
                            // unreadable "PLANARE". Render them as "Planar E" etc.
                            this.coreShapeFamilies[shapeFamily] = /^planar/i.test(shapeFamily)
                                ? 'Planar ' + shapeFamily.slice(6).toUpperCase()
                                : shapeFamily.toUpperCase();
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
                        const rows = [];
                        for (const core of cores) {
                            const auxEffectiveLength = core.processedDescription.effectiveParameters.effectiveLength * 1000;
                            const effectiveLength = `${removeTrailingZeroes(auxEffectiveLength, 2)} mm`;
                            const auxEffectiveArea = core.processedDescription.effectiveParameters.effectiveArea * 1000000;
                            const effectiveArea = `${removeTrailingZeroes(auxEffectiveArea, 2)} mm²`;
                            const auxMinimumArea = core.processedDescription.effectiveParameters.minimumArea * 1000000;
                            const minimumArea = `${removeTrailingZeroes(auxMinimumArea, 2)} mm²`;
                            const auxEffectiveVolume = core.processedDescription.effectiveParameters.effectiveVolume * 1000000000;
                            const effectiveVolume = `${removeTrailingZeroes(auxEffectiveVolume, 2)} mm³`;
                            rows.push({
                                name: core.functionalDescription.shape.name,
                                family: core.functionalDescription.shape.family,
                                effectiveLength: effectiveLength,
                                effectiveArea: effectiveArea,
                                minimumArea: minimumArea,
                                effectiveVolume: effectiveVolume,
                                www: "www",
                            });
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

                        const auxEffectiveLength = core.processedDescription.effectiveParameters.effectiveLength * 1000;
                        const effectiveLength = `${removeTrailingZeroes(auxEffectiveLength, 2)} mm`;
                        const auxEffectiveArea = core.processedDescription.effectiveParameters.effectiveArea * 1000000;
                        const effectiveArea = `${removeTrailingZeroes(auxEffectiveArea, 2)} mm²`;
                        const auxMinimumArea = core.processedDescription.effectiveParameters.minimumArea * 1000000;
                        const minimumArea = `${removeTrailingZeroes(auxMinimumArea, 2)} mm²`;
                        const auxEffectiveVolume = core.processedDescription.effectiveParameters.effectiveVolume  * 1000000000;
                        const effectiveVolume = `${removeTrailingZeroes(auxEffectiveVolume, 2)} mm³`;
                        this.coreShapeData = [...this.coreShapeData, {
                            name: core.functionalDescription.shape.name,
                            family: core.functionalDescription.shape.family,
                            effectiveLength: effectiveLength,
                            effectiveArea: effectiveArea,
                            minimumArea: minimumArea,
                            effectiveVolume: effectiveVolume,
                            www: "www",
                        }]

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

                <div
                    v-if="!readOnly"
                    class="core-shape-table-btn-wrapper"
                    v-tooltip="'Open core shape table'"
                >
                    <button
                        :style="$styleStore.magneticBuilder.tableButton"
                        class="shape-table-btn"
                        @click="coreShapeTableVisible = true"
                        >
                        <i class="pi pi-table"></i>
                    </button>
                </div>
            </div>
    </div>
</template>

<style scoped>
/* Shape <select> + "open core-shape table" button on the SAME row,
 * button flush against the select's right edge, not overlapping it. */
.core-shape-input-group {
    position: relative;
    display: flex;
    align-items: stretch;
    width: 100%;
}

/* The ElementFromList wrapper takes the full row width. The button is
 * absolute-positioned over the row's right edge: only the dropdown
 * inside the value column needs to shrink by the button's width. */
.core-shape-input-group :deep(.core-shape-row) {
    flex: 1 1 auto;
    min-width: 0;
}
/* Shrink the dropdown (and only the dropdown) inside the value column so
 * it doesn't slide under the absolute-positioned table button. */
.core-shape-input-group :deep(.core-shape-row .p-select),
.core-shape-input-group :deep(.core-shape-row select.efl-select) {
    width: calc(100% - 2.25rem) !important;
    max-width: calc(100% - 2.25rem) !important;
    margin-right: 2.25rem !important;
}

/* The button is absolute-positioned against `.core-shape-input-group`
 * (relative parent), pinned to the right edge and vertically centered
 * over the select's row inside the ElementFromList. */
.core-shape-table-btn-wrapper {
    position: absolute;
    right: 8px;             /* shim: align button right edge with the other
                               dropdowns (Family / Mfg / Material), which end
                               8px inside the value column's right border */
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    z-index: 2;
    padding: 0;
}

.shape-table-btn {
    height: 1.75rem;
    width: 1.75rem;
    padding: 0;
    background-color: transparent;
    color: var(--p-primary);
    border: 0;
    border-radius: var(--p-border-radius);
    font-family: var(--p-font-family);
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.shape-table-btn:hover {
    background-color: rgba(var(--p-primary-rgb), 0.15);
    color: var(--p-white);
}
</style>
