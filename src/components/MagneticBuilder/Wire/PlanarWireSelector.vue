<script setup>
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import BasicWireSubmenu from './BasicWireSubmenu.vue'
import WireInfo from './WireInfo.vue'
import BasicTurnsSelector from './BasicTurnsSelector.vue'
import Wire2DVisualizer from '/WebSharedComponents/Common/Wire2DVisualizer.vue'
import WindingSelector from '../Common/WindingSelector.vue'
import { toTitleCase, checkAndFixMas, deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import { useHistoryStore } from '../../../stores/history'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'
</script>

<script>

export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        windingIndex: {
            type: Number,
            default: 0,
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
        enableAdvise: {
            type: Boolean,
            default: true,
        },
        readOnly: {
            type: Boolean,
            default: false,
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
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const historyStore = useHistoryStore();
        const loading = false; 
        const forceUpdate = 0; 
        const wireThicknesses = [];
        const errorMessage = ""; 
        const localData = {
            wireThickness: 0.001,
            wireWidth: 0.002,
        };
        if (typeof(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire) == 'string' && this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != "" && this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != "Dummy") {
            taskQueueStore.processWire(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex]).then((wire) => {
                if (!taskQueueStore.windingIndexChangeBlock) {
                    this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire = wire;
                    this.assignLocalData(wire);
                }
            })
        }

        const blockingRebounds = false;
        const wireHash = "";
        const subscriptions = [];

        return {
            taskQueueStore,
            blockingRebounds,
            wireHash,
            historyStore,
            localData,
            wireThicknesses,
            forceUpdate,
            loading,
            errorMessage,
            subscriptions,
        }
    },
    computed: {
    },
    watch: {
    },
    mounted () {
        this.getWireThicknesses();
        if (this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != null) {
            this.assignLocalData(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire);
        }
        this.subscriptions.push(this.historyStore.$onAction((action) => {
            if (action.name == "historyPointerUpdated") {
                this.assignLocalData(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire);
            }
        }));
    },
    beforeUnmount() {
        this.subscriptions.forEach((unsubscribe) => unsubscribe());
    },
    methods: {
        cleanCoil() {
            this.masStore.mas.magnetic.coil.turnsDescription = null;
            this.masStore.mas.magnetic.coil.layersDescription = null;
            this.masStore.mas.magnetic.coil.sectionsDescription = null;
        },
        assignLocalData(wire) {
            this.errorMessage = "";
            if (wire != "" && wire.type != null) {
                this.localData["wireThickness"] = wire.standardName;
                this.taskQueueStore.resolveDimensionWithTolerance(wire.conductingWidth).then((dimension) => {
                    this.localData["wireWidth"] = dimension;
                    this.forceUpdate += 1;
                })
            }
        },
        assignWire() {
            this.errorMessage = "";
            let wire = {};
            if (this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != "" && this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != "Dummy") {
                wire = this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire;
            }

            this.taskQueueStore.getPlanarWireByStandardName(this.localData["wireThickness"]).then((wire) => {
                if (!wire || !wire.conductingHeight || !wire.conductingHeight.nominal) {
                    console.warn(`[PlanarWireSelector] Invalid wire data returned for thickness: "${this.localData["wireThickness"]}"`);
                    return;
                }
                wire.conductingWidth = {};
                wire.conductingWidth.nominal = this.localData["wireWidth"];
                wire.outerWidth = {};
                wire.outerWidth.nominal = this.localData["wireWidth"];
                wire.outerHeight = {};
                wire.outerHeight.nominal = wire.conductingHeight.nominal;
                wire.numberConductors = 1;
                wire.material = "copper";

                // Check if the wire is actually different from the current one before cleaning
                const currentWire = this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire;
                const wireUnchanged = currentWire && typeof currentWire === 'object' &&
                    currentWire.standardName === wire.standardName &&
                    currentWire.conductingWidth?.nominal === wire.conductingWidth.nominal &&
                    currentWire.conductingHeight?.nominal === wire.conductingHeight.nominal;

                this.$stateStore.wire2DVisualizerState.plotCurrentViews[this.windingIndex] = null;
                this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire = wire;
                if (!this.taskQueueStore.windingIndexChangeBlock && !wireUnchanged) {
                    this.cleanCoil();
                    this.$emit("wireUpdated", this.windingIndex);
                    // Trigger wire data calculation and coil winding
                    this.taskQueueStore.newWireCreated(true, wire);
                }
                // this.historyStore.addToHistory(this.masStore.mas);
            })
            .catch(error => {
                console.error(error);
                return;
            })
        },
        getWireThicknesses() {
            this.wireThicknesses = [];
            this.taskQueueStore.getPlanarThicknesses().then((planarThicknesses) => {
                for (let i = planarThicknesses.length - 1; i >= 0; i--) {
                    const wireThickness = planarThicknesses[i];
                    this.wireThicknesses.push(toTitleCase(wireThickness));
                }

                this.wireThicknesses.sort(function(a, b){
                    a = Number(a.split(" ")[0]);
                    b = Number(b.split(" ")[0]);
                    return a - b;
                });
            })
        },
        wireUpdated() {
            this.assignWire();
        },
        adviseWireRequested() {
            this.loading = true;
            setTimeout(() => this.adviseWire(), 100);
        },
        adviseAllWiresRequested() {
            this.loading = true;
            setTimeout(() => this.adviseAllWires(), 100);
        },
        adviseAllWires() {
            this.taskQueueStore.getSettings().then((settings) => {
                settings["coilMaximumLayersPlanar"] = 24;
                this.taskQueueStore.setSettings(settings).then(() => {

                    this.taskQueueStore.adviseAllWires(this.masStore.mas)
                    .then((coil) => {
                        this.errorMessage = "";
                        if (!this.taskQueueStore.windingIndexChangeBlock) {
                            this.masStore.mas.magnetic.coil = coil;
                            this.assignLocalData(coil.functionalDescription[this.windingIndex].wire);
                            // Don't clean coil here - the advised coil already has valid layers/turns
                            this.$emit("wireUpdated", this.windingIndex);

                            this.$stateStore.wire2DVisualizerState.plotCurrentViews = {};
                            setTimeout(() => this.loading = false, 100);

                            // Trigger rewinding and resimulation
                            this.taskQueueStore.newWireCreated(true, coil.functionalDescription[this.windingIndex].wire);
                        }

                    })
                    .catch(error => {
                        this.errorMessage = "Our advisers could not find a wire. Sorry, you are on your own!";
                        setTimeout(() => {this.errorMessage = ""}, 10000);
                        this.loading = false;
                        console.error(error);
                    })
                })
            })
        },
        adviseWire() {
            this.taskQueueStore.getSettings().then((settings) => {
                settings["coilMaximumLayersPlanar"] = 24;
                this.taskQueueStore.setSettings(settings).then(() => {
                    this.taskQueueStore.adviseWire(this.masStore.mas, this.windingIndex)
                    .then((result) => {
                        this.errorMessage = "";
                        const winding = result.winding;
                        const coil = result.coil;
                        
                        // Always update UI (localData) regardless of block
                        this.assignLocalData(winding.wire);
                        
                        // Only update coil and trigger actions if not blocked
                        if (!this.taskQueueStore.windingIndexChangeBlock) {
                            this.masStore.mas.magnetic.coil = coil;
                            // Don't clean coil here - the advised coil already has valid layers/turns
                            this.$emit("wireUpdated", this.windingIndex);

                            this.$stateStore.wire2DVisualizerState.plotCurrentViews[this.windingIndex] = null;

                            // Trigger rewinding and resimulation
                            this.taskQueueStore.newWireCreated(true, winding.wire);
                        }
                        
                        setTimeout(() => this.loading = false, 100);

                    })
                    .catch(error => {
                        this.errorMessage = "Our advisers could not find a wire. Sorry, you are on your own!";
                        this.loading = false;
                        setTimeout(() => {this.errorMessage = ""}, 10000);
                        console.error(error);
                    })
                })
            });
        },
        customizeWire() {
        },
        loadWire() {
        },
    }
}
</script>

<template>
    <div class="container">
        <div class="wire-config-panel">
            <div class="wire-config-header">
                <div class="wire-config-header-left">
                    <i class="pi pi-bolt"></i>
                    <span>Wire Configuration</span>
                </div>
                <div v-if="enableAdvise && enableSubmenu && !readOnly" class="wire-config-header-right">
                    <button
                        v-if="masStore.mas.magnetic.coil.functionalDescription.length > 1"
                        type="button"
                        :disabled="loading"
                        :data-cy="dataTestLabel + 'Wire-Advise-button'"
                        class="wire-config-header-btn wire-config-header-btn-primary"
                        @click="adviseWireRequested"
                    >
                        <i class="pi pi-sparkles"></i>
                        <span>Advise</span>
                    </button>
                    <button
                        v-if="masStore.mas.magnetic.coil.functionalDescription.length > 1"
                        type="button"
                        :disabled="loading"
                        :data-cy="dataTestLabel + 'Wire-Advise-All-button'"
                        class="wire-config-header-btn wire-config-header-btn-primary"
                        @click="adviseAllWiresRequested"
                    >
                        <i class="pi pi-sparkles"></i>
                        <span>Advise all</span>
                    </button>
                    <button
                        v-if="masStore.mas.magnetic.coil.functionalDescription.length == 1"
                        type="button"
                        :disabled="loading"
                        :data-cy="dataTestLabel + 'Wire-Advise-button'"
                        class="wire-config-header-btn wire-config-header-btn-primary"
                        @click="adviseWireRequested"
                    >
                        <i class="pi pi-sparkles"></i>
                        <span>Advise</span>
                    </button>
                </div>
            </div>
            <div class="wire-config-body">
                <div
                    v-if="useVisualizers && masStore.mas.magnetic.coil.functionalDescription[windingIndex] != null"
                    class="row mb-3"
                    style="max-height: 20vh"
                    :style="imageUpToDate? 'opacity: 100%;' : 'opacity: 20%;'"
                >
                    <Wire2DVisualizer
                        v-if="masStore.mas.magnetic.coil.functionalDescription[windingIndex].wire != null && masStore.mas.magnetic.coil.functionalDescription[windingIndex].wire.type != null"
                        :dataTestLabel="`${dataTestLabel}-Wire2DVisualizer`"
                        :wire="masStore.mas.magnetic.coil.functionalDescription[windingIndex].wire"
                        :forceUpdate="forceUpdateVisualizer"
                        :windingIndex="windingIndex"
                        :operatingPoint="masStore.mas.inputs.operatingPoints[operatingPointIndex]"
                        :includeCurrentDensity="false"
                        :loadingGif="$settingsStore.loadingGif"
                        :backgroundColor="$styleStore.magneticBuilder.main['background-color'] || $styleStore.magneticBuilder.main['background'] || 'var(--p-dark)'"
                    />
                </div>
                <div
                    v-if="!masStore.hasMirroredWindings"
                    class="wire-config-winding-bar"
                >
                    <WindingSelector
                        :dataTestLabel="`${dataTestLabel}-WindingSelector`"
                        :coil="masStore.mas.magnetic.coil"
                        :masStore="masStore"
                        :selectedWindingIndex="windingIndex"
                        @windingIndexChanged="$emit('windingIndexChanged', $event)"
                    />
                </div>
            <div class="wire-config-grid">
                <div v-if="!loading" class="wire-config-cell wire-config-cell-wide">
                    <BasicTurnsSelector
                        :readOnly="readOnly"
                        :masStore="masStore"
                        :windingIndex="windingIndex"
                        @turnsUpdated="$emit('turnsUpdated', windingIndex)"
                    />
                </div>
                <div v-if="!loading" class="wire-config-cell wire-config-cell-wide">
                    <ElementFromList
                        v-tooltip="tooltipsMagneticBuilder.wireRectangularConductingHeight"
                            :disabled="readOnly"
                            class="text-left"
                            :dataTestLabel="dataTestLabel + '-WireThickness'"
                            :replaceTitle="'Cond. diameter'"
                            :name="'wireThickness'"
                            :titleSameRow="true"
                            :justifyContent="true"
                            :labelWidthProportionClass="'col-5'"
                            :selectStyleClass="'col-7'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            v-model="localData"
                            :options="wireThicknesses"
                            @update="wireUpdated"
                        />
                    </div>
                    <div v-if="!loading" class="wire-config-cell wire-config-cell-wide">
                        <Dimension class="text-left"
                            v-tooltip="tooltipsMagneticBuilder.wireRectangularConductingWidth"
                            :disabled="readOnly"
                            :name="'wireWidth'"
                            :replaceTitle="'Cond. Width'"
                            :unit="'m'"
                            :defaultZeroUnit="0.001"
                            :dataTestLabel="dataTestLabel + '-WirWidth'"
                            :min="1e-9"
                            :max="0.1"
                            :allowNegative="false"
                            :modelValue="localData"
                            :forceUpdate="forceUpdate"
                            :styleClassInput="'col-offset-3 col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="wireUpdated"
                        />
                    </div>
                </div>

                <WireInfo
                    v-if="!loading && enableSimulation"
                    ref="wireInfo"
                    :dataTestLabel="dataTestLabel + '-WireInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :windingIndex="windingIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                />

                <BasicWireSubmenu
                    v-if="enableSubmenu && !readOnly"
                    class="col-12 mb-1 text-left"
                    :dataTestLabel="dataTestLabel + '-BasicWireSubmenu'"
                    :enableCustomize="false"
                    @customizeCore="customizeWire"
                    @loadCore="loadWire"
                />

                <label class="text-danger col-12 pt-1" style="font-size: 1em">{{errorMessage}}</label>
            </div>
        </div>
    </div>
</template>

<style scoped>
.wire-config-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.06) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 14px;
    padding: 0;
    margin: 0.15rem 0 0.25rem 0;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.12), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    overflow: hidden;
}

.wire-config-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.9rem;
    background: rgba(120, 120, 120, 0.1);
    border-bottom: 1px solid rgba(120, 120, 120, 0.15);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.wire-config-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.wire-config-header-left i {
    font-size: 0.95rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.wire-config-header-right {
    display: flex;
    align-items: center;
    gap: 0.35rem;
}

.wire-config-header-btn {
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

.wire-config-header-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.wire-config-header-btn:not(:disabled):hover {
    filter: brightness(1.12);
    transform: translateY(-1px);
}

.wire-config-header-btn-primary {
    background: linear-gradient(135deg,
        color-mix(in srgb, var(--p-primary) 115%, transparent 0%) 0%,
        var(--p-primary) 55%,
        rgb(var(--p-primary-rgb) / 0.85) 100%);
    color: var(--p-white);
    border: 1px solid color-mix(in srgb, var(--p-primary) 70%, var(--p-white) 30%);
    box-shadow:
        0 0 0 1px rgb(var(--p-primary-rgb) / 0.35),
        0 2px 8px rgb(var(--p-primary-rgb) / 0.4),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
    text-shadow: 0 1px 1px rgba(var(--p-black-rgb), 0.25);
}

.wire-config-body {
    padding: 0.5rem 0.6rem;
}

.wire-config-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.15rem;
    background: var(--p-dark);
    border-radius: 10px;
    padding: 0.35rem;
}

@media (max-width: 576px) {
    .wire-config-grid {
        grid-template-columns: 1fr;
    }
}

.wire-config-cell {
    border-radius: 10px;
    padding: 0.1rem 0.35rem 0.1rem 0.35rem;
}

.wire-config-cell-wide {
    grid-column: 1 / -1;
}

.wire-config-winding-bar {
    margin: 0.5rem 0;
}

.wire-config-cell :deep(.form-label),
.wire-config-cell :deep(label) {
    padding-left: 0.35rem !important;
}
</style>
