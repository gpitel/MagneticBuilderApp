<script setup>
import { CoilAlignment } from '../../../assets/ts/MAS.ts'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import ListOfCharacters from '/WebSharedComponents/DataInput/ListOfCharacters.vue'
import CoilInfo from './CoilInfo.vue'
import BasicCoilFillingFactors from './BasicCoilFillingFactors.vue'
import PlanarInsulationSelector from './PlanarInsulationSelector.vue'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import Magnetic2DVisualizer from '/WebSharedComponents/Common/Magnetic2DVisualizer.vue'
import { toTitleCase, checkAndFixMas, deepCopy, roundWithDecimals } from '/WebSharedComponents/assets/js/utils.js'
import { useHistoryStore } from '../../../stores/history'
import { useTaskQueueStore } from '../../../stores/taskQueue'

import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
</script>

<script>

export default {
    emits: ['fits', 'plotModeChange', 'swapIncludeFringing', 'errorInImage'],
    props: {
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
        const taskQueueStore = useTaskQueueStore();
        const historyStore = useHistoryStore();
        const showInsulationOptions = false;

        const loading = false;
        const blockingRebounds = false;
        const recentChange = false;
        const tryingToSend = false;
        const forceUpdate = 0; 
        const subscriptions = []; 

        const localData = {
            stackUp: "",
            insulationThicknessPerLayer: {},
            clearancePerWinding: {},
            coreToLayerDistance: 0.0001,
            borderToWireDistance: 0.0001,
            sectionsAlignment: CoilAlignment.Centered
        }
        const coilAlignments = {};

        return {
            taskQueueStore,
            blockingRebounds,
            historyStore,
            localData,
            forceUpdate,
            showInsulationOptions,
            loading,
            recentChange,
            tryingToSend,
            subscriptions,
            coilAlignments,
            _windTimer: null,
        }
    },
    computed: {
        windingIndexesCharacters() {
            let pattern = "";
            this.masStore.mas.magnetic.coil.functionalDescription.forEach((item, index) => {
                pattern += String(index + 1);
            })
            return pattern;
        },
    },
    watch: {
    },
    mounted () {
        this.tryToWind();
        this.assignLocalData(this.masStore.mas.magnetic);

        this.getStackUp(this.masStore.mas.magnetic.coil);


        this.subscriptions.push(this.historyStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "historyPointerUpdated") {
                    this.tryToWind();
                    this.assignLocalData(this.masStore.mas.magnetic);
                    this.getStackUp(this.masStore.mas.magnetic.coil);
                }
            });
        }))

        this.subscriptions.push(this.masStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "importedMas") {
                    this.assignLocalData(this.masStore.mas.magnetic);
                    this.getStackUp(this.masStore.mas.magnetic.coil);
                    this.tryToWind();
                }
                if (name == "resetMas") {
                    // Reset localData to defaults
                    this.localData.stackUp = "";
                    this.localData.insulationThicknessPerLayer = {};
                    this.localData.clearancePerWinding = {};
                    this.localData.coreToLayerDistance = 0.0001;
                    this.localData.borderToWireDistance = 0.0001;
                    this.localData.sectionsAlignment = CoilAlignment.Centered;
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
                if (name == "allWiresAdvised") {
                    if (args[0]) {
                        // The coil will be wound after this, so we need to wait for newWireCreated
                    }
                }
                if (name == "newWireCreated") {
                    if (args[0]) {
                        // Update local data when wire is advised/created
                        this.assignLocalData(this.masStore.mas.magnetic);
                        this.getStackUp(this.masStore.mas.magnetic.coil);
                    }
                }
            });
        }))

        this.getCoilAlignments();
    },
    beforeUnmount () {
        if (this._windTimer) clearTimeout(this._windTimer);
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        getWindingIndex(coil, windinName) {
            let foundWindingIndex = null;
            coil.functionalDescription.forEach((winding, windingIndex) => {
                if (winding.name == windinName) {
                    foundWindingIndex = windingIndex;
                }
            })
            return foundWindingIndex;
        },
        getStackUp(coil) {
            if (coil.sectionsDescription != null) {
                let stackUp = "";
                coil.sectionsDescription.forEach((section) => {
                    if (section.type == "conduction") {
                        const windingIndex = this.getWindingIndex(coil, section.partialWindings[0].winding);
                        stackUp += String(windingIndex + 1)
                    }
                })
                this.localData.stackUp = stackUp;
            }
        },
        getCoilAlignments() {
            this.taskQueueStore.getAvailableCoilAlignments().then((coilAlignments) => {
                this.coilAlignments = coilAlignments;
            })
            .catch(error => {
                console.error(error);
            });
        },
        wind() {
            this.$emit("fits", true);

            this.taskQueueStore.getSettings().then((settings) => {
                settings["coilMaximumLayersPlanar"] = 24;
                this.taskQueueStore.setSettings(settings).then(() => {
                    const inputCoil = deepCopy(this.masStore.mas.magnetic.coil);

                    const stackUp = [];
                    this.localData.stackUp.split('').forEach((char, index) => {
                        stackUp.push(Number(char) - 1);
                    });

                    this.taskQueueStore.generateBobbinFromCoreShape(this.masStore.mas.magnetic.core, "Printed").then((bobbin) => {
                        // Set sectionsAlignment from localData FIRST (user's current selection takes priority)
                        if (bobbin?.processedDescription?.windingWindows != null && this.localData.sectionsAlignment != null) {
                            bobbin.processedDescription.windingWindows.forEach((window) => {
                                window.sectionsAlignment = this.localData.sectionsAlignment;
                            });
                        }
                        
                        // Preserve other windingWindows settings from original bobbin (only if not set in localData)
                        const originalWindingWindows = this.masStore.mas.magnetic.coil.bobbin?.processedDescription?.windingWindows;
                        if (originalWindingWindows != null && bobbin?.processedDescription?.windingWindows != null) {
                            bobbin.processedDescription.windingWindows.forEach((window, index) => {
                                if (originalWindingWindows[index] != null) {
                                    // Only preserve sectionsOrientation, not sectionsAlignment (which comes from localData)
                                    if (originalWindingWindows[index].sectionsOrientation != null && window.sectionsOrientation == null) {
                                        window.sectionsOrientation = originalWindingWindows[index].sectionsOrientation;
                                    }
                                }
                            });
                        }
                        
                        inputCoil.bobbin = bobbin;

                        this.taskQueueStore.windPlanar(inputCoil, stackUp, this.localData.borderToWireDistance, this.localData.clearancePerWinding, this.localData.insulationThicknessPerLayer, this.localData.coreToLayerDistance)
                        .then((coil) => {
                            this.masStore.mas.magnetic.coil = coil;
                            this.assignLocalData(this.masStore.mas.magnetic);
                            this.historyStore.addToHistory(this.masStore.mas);
                            this.tryingToSend = false;
                            this.taskQueueStore.checkIfSectionsAndLayersFit(coil).then((fits) => {
                                this.$emit("fits", fits);
                            })

                        })
                        .catch(error => {
                            this.tryingToSend = false;
                            console.error(error);
                        })
                    })
                    .catch(error => {
                        this.tryingToSend = false;
                        console.error(error);
                    })
                })
                .catch(error => {
                    this.tryingToSend = false;
                    console.error(error);
                })
            })
            .catch(error => {
                this.tryingToSend = false;
                console.error(error);
            })
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
                        // Check if coil already has layers (from adviser) - if so, skip rewinding
                        if (this.masStore.mas.magnetic.coil?.layersDescription != null &&
                            this.masStore.mas.magnetic.coil.layersDescription.length > 0) {
                            this.assignLocalData(this.masStore.mas.magnetic);
                            this.tryingToSend = false;
                        }
                        else {
                            this.wind();
                        }
                    }
                }
                , this.$settingsStore.waitingTimeAfterChange);
            }
        },
        getLayerWindingIndex(layer) {
            let windingIndex = 0;
            this.masStore.mas.magnetic.coil.functionalDescription.forEach((winding, auxWindingIndex) => {
                if (winding.name == layer.partialWindings[0].winding) {
                    windingIndex = auxWindingIndex;
                }
            })

            return windingIndex;
        },
        assignLocalData(magnetic) {
            if (!this.blockingRebounds) {
                try {
                    if (this.masStore.mas.magnetic.coil.layersDescription != null) {
                        let stackUp = "";
                        this.localData.coreToLayerDistance = (this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].width - this.masStore.mas.magnetic.coil.layersDescription[0].dimensions[0]) / 2;
                        const layerBorderCoordinate = this.masStore.mas.magnetic.coil.layersDescription[0].coordinates[0] - this.masStore.mas.magnetic.coil.layersDescription[0].dimensions[0] / 2;
                        const firstTurnBorderCoordinate = this.masStore.mas.magnetic.coil.turnsDescription[0].coordinates[0] - this.masStore.mas.magnetic.coil.turnsDescription[0].dimensions[0] / 2;
                        this.localData.borderToWireDistance = firstTurnBorderCoordinate - layerBorderCoordinate;

                        // Create new objects to ensure reactivity
                        const insulationThicknessPerLayer = {};
                        
                        this.masStore.mas.magnetic.coil.layersDescription.forEach((layer, index) => {
                            if (layer.type == "conduction") {
                                const windingIndex = this.getLayerWindingIndex(layer);
                                stackUp += String(windingIndex + 1);
                            }
                            else {
                                if (index > 0 && index < this.masStore.mas.magnetic.coil.layersDescription.length - 1) {
                                    const previousWindingIndex = this.getLayerWindingIndex(this.masStore.mas.magnetic.coil.layersDescription[index - 1]);
                                    const nextWindingIndex = this.getLayerWindingIndex(this.masStore.mas.magnetic.coil.layersDescription[index + 1]);
                                    const key = `${previousWindingIndex + 1}-${nextWindingIndex + 1}`;

                                    insulationThicknessPerLayer[key] = layer.dimensions[1];
                                }
                            }
                        })
                        
                        // Assign new object to trigger reactivity
                        this.localData.insulationThicknessPerLayer = insulationThicknessPerLayer;

                        // Create new object to ensure reactivity
                        const clearancePerWinding = {};
                        
                        this.masStore.mas.magnetic.coil.functionalDescription.forEach((winding, windingIndex) => {
                            clearancePerWinding[windingIndex] = 0.0001;

                            for (let i = 0; i < this.masStore.mas.magnetic.coil.turnsDescription.length - 1; i++) {
                                // Check that both current and next turn belong to the same winding AND same layer
                                if (this.masStore.mas.magnetic.coil.turnsDescription[i].winding == winding.name &&
                                    this.masStore.mas.magnetic.coil.turnsDescription[i + 1].winding == winding.name &&
                                    this.masStore.mas.magnetic.coil.turnsDescription[i].layer == this.masStore.mas.magnetic.coil.turnsDescription[i + 1].layer) {
                                    let firstBorder = this.masStore.mas.magnetic.coil.turnsDescription[i].coordinates[0] + this.masStore.mas.magnetic.coil.turnsDescription[i].dimensions[0] / 2;
                                    let secondBorder = this.masStore.mas.magnetic.coil.turnsDescription[i + 1].coordinates[0] - this.masStore.mas.magnetic.coil.turnsDescription[i + 1].dimensions[0] / 2;
                                    clearancePerWinding[windingIndex] = secondBorder - firstBorder;
                                    break;
                                }
                            }
                        })
                        
                        // Assign new object to trigger reactivity
                        this.localData.clearancePerWinding = clearancePerWinding;

                        // Ensure all expected insulation keys exist
                        this.extractInsulationThicknessPerLayer();

                        // Only update stackUp from layers if user hasn't set a custom value
                        // Check if current stackUp is empty or has the same length as generated
                        // If different, user likely customized it - preserve their input
                        const userStackUpLength = this.localData.stackUp ? this.localData.stackUp.length : 0;
                        const generatedStackUpLength = stackUp.length;

                        if (this.localData.stackUp === "" || userStackUpLength === generatedStackUpLength) {
                            // Either empty or same layer count - safe to update
                            // But if same length and values are different, preserve user's input
                            if (!(this.localData.stackUp !== "" && this.localData.stackUp !== stackUp)) {
                                this.localData.stackUp = stackUp;
                            }
                        }
                        this.extractInsulationThicknessPerLayer();
                    }
                    else if (this.localData.stackUp == "") {
                        this.masStore.mas.magnetic.coil.functionalDescription.forEach((item, index) => {
                            this.localData.stackUp += String(index + 1);
                        })
                    }
                    this.$stateStore.storePlanarConfiguration(this.localData);
                    

                    this.forceUpdate += 1;
                }
                catch (e) {
                    console.error(e)
                    // setTimeout(() => this.assignLocalData(magnetic), 50);
                }
            }
        },
        extractInsulationThicknessPerLayer() {
            const insulationThicknessPerLayer = {};
            const stackUpArray = this.localData.stackUp.split('');

            stackUpArray.forEach((elem, index) => {
                if (index < this.localData.stackUp.length - 1) {
                    const key = `${this.localData.stackUp[index]}-${this.localData.stackUp[index + 1]}`
                    if (!(key in insulationThicknessPerLayer)) {
                        if (key in this.localData.insulationThicknessPerLayer) {
                            insulationThicknessPerLayer[key] = this.localData.insulationThicknessPerLayer[key];
                        }
                        else {
                            insulationThicknessPerLayer[key] = 0.0001;
                        }
                    }
                }
            })
            this.localData.insulationThicknessPerLayer = insulationThicknessPerLayer;
        },
        stackUpUpdated() {
            // Check if the stackUp actually changed from the current coil data
            const coil = this.masStore.mas.magnetic.coil;
            if (coil.sectionsDescription != null) {
                let currentStackUp = "";
                coil.sectionsDescription.forEach((section) => {
                    if (section.type == "conduction") {
                        const windingIndex = this.getWindingIndex(coil, section.partialWindings[0].winding);
                        currentStackUp += String(windingIndex + 1);
                    }
                });
                if (currentStackUp === this.localData.stackUp) {
                    return;
                }
            }
            // Clear existing coil layers to force re-wind with new stackUp
            this.masStore.mas.magnetic.coil.layersDescription = null;
            this.masStore.mas.magnetic.coil.turnsDescription = null;
            this.masStore.mas.magnetic.coil.sectionsDescription = null;
            this.extractInsulationThicknessPerLayer();
            this.coilUpdated();
        },
        coilUpdated() {
            this.recentChange = true;
            this.tryToWind();
        },
        sectionsAlignmentUpdated() {
            this.masStore.mas.magnetic.coil.layersDescription = null;
            this.masStore.mas.magnetic.coil.turnsDescription = null;
            this.masStore.mas.magnetic.coil.sectionsDescription = null;
            this.coilUpdated();
        },
        insulationUpdated() {
            this.masStore.mas.magnetic.coil.layersDescription = null;
            this.masStore.mas.magnetic.coil.turnsDescription = null;
            this.masStore.mas.magnetic.coil.sectionsDescription = null;
            this.coilUpdated();
        },
        marginUpdated(sectionIndex) {
            this.coilUpdated();
        },
        swapShowInsulationOptions(showInsulationOptions) {
            if (typeof showInsulationOptions === 'boolean') {
                this.showInsulationOptions = showInsulationOptions;
            } else {
                this.showInsulationOptions = !this.showInsulationOptions;
            }
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
        <div class="coil-config-panel">
            <div class="coil-config-header">
                <div class="coil-config-header-left">
                    <i class="pi pi-cog-wide-connected"></i>
                    <span>Coil Configuration</span>
                </div>
                <div class="coil-config-header-right">
                    <button
                        type="button"
                        :class="['coil-config-header-btn', showInsulationOptions ? 'coil-config-header-btn-primary' : 'coil-config-header-btn-outline']"
                        :data-cy="dataTestLabel + '-Coil-ShowInsulationOptions-button'"
                        @click="swapShowInsulationOptions(!showInsulationOptions)"
                    >
                        <i class="pi pi-shield"></i>
                        <span>Insulation</span>
                    </button>
                </div>
            </div>
            <div class="coil-config-body">
                <div
                    v-if="useVisualizers && masStore.mas.magnetic != null && masStore.mas.magnetic.core != null && masStore.mas.magnetic.core.functionalDescription.shape != ''"
                    class="row mb-3"
                    :style="(imageUpToDate? 'opacity: 100%;' : 'opacity: 20%;') + ' max-height: 40vh;'"
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
                        @errorInImage="$emit('errorInImage')"
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

                <div class="coil-config-grid">
                    <div v-if="showInterleavingOrder && !loading && masStore.mas.magnetic.coil.functionalDescription.length > 0" class="coil-config-cell coil-config-cell-wide">
                        <ListOfCharacters
                            v-tooltip="tooltipsMagneticBuilder.sectionsInterleaving"
                            :disabled="readOnly"
                            class="text-left"
                            :dataTestLabel="dataTestLabel + '-SectionsInterleaving'"
                            :modelValue="localData.stackUp"
                            @updateModelValue="localData.stackUp = $event"
                            :name="'stackUp'"
                            :replaceTitle="'Stack Up'"
                            :allowConsecutive="true"
                            :allowedCharacters="windingIndexesCharacters"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="stackUpUpdated"
                        />
                    </div>
                    <div v-if="!loading && masStore.mas.magnetic.coil.functionalDescription.length > 0" class="coil-config-cell coil-config-cell-wide">
                        <ElementFromList
                            v-tooltip="tooltipsMagneticBuilder.sectionsAlignment"
                            :disabled="readOnly"
                            class="text-left"
                            :dataTestLabel="dataTestLabel + '-SectionsAlignment'"
                            :name="'sectionsAlignment'"
                            :replaceTitle="'PCB Alignment'"
                            :titleSameRow="true"
                            :justifyContent="true"
                            v-model="localData"
                            :options="coilAlignments"
                            :labelWidthProportionClass="'col-5'"
                            :selectStyleClass="'col-5'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="sectionsAlignmentUpdated"
                        />
                    </div>
                </div>

                <div class="col-12">
                    <CoilInfo
                        v-if="!loading && enableSimulation"
                        ref="coilInfo"
                        :dataTestLabel="dataTestLabel + '-CoilInfo'"
                        :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                        :masStore="masStore"
                        :operatingPointIndex="operatingPointIndex"
                        :enableAutoSimulation="enableAutoSimulation"
                    />
                </div>
            </div>
        </div>

        <PlanarInsulationSelector
            class="col-12"
            v-if="!loading && showInsulationOptions"
            :dataTestLabel="dataTestLabel + '-PlanarInsulationSelector'"
            :loading="loading"
            :readOnly="readOnly"
            :data="localData"
            @update="insulationUpdated"
            @closeInsulation="swapShowInsulationOptions(false)"
        />
    </div>
</template>

<style scoped>
.coil-config-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.06) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
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
    padding: 0.6rem 0.9rem;
    background: rgba(120, 120, 120, 0.1);
    border-bottom: 1px solid rgba(120, 120, 120, 0.15);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.coil-config-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.coil-config-header-left i {
    font-size: 0.95rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.coil-config-header-right {
    display: flex;
    align-items: center;
    gap: 0.35rem;
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

.coil-config-header-btn:hover {
    filter: brightness(1.12);
    transform: translateY(-1px);
}

.coil-config-header-btn-primary {
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

.coil-config-header-btn-outline {
    background: rgb(var(--p-primary-rgb) / 0.2);
    border: 1px solid rgb(var(--p-primary-rgb) / 0.55);
    color: var(--p-primary);
    box-shadow: 0 1px 4px rgba(var(--p-black-rgb), 0.2);
}

.coil-config-header-btn-outline:hover {
    background: rgb(var(--p-primary-rgb) / 0.3);
    border-color: rgb(var(--p-primary-rgb) / 0.75);
    box-shadow: 0 2px 6px rgb(var(--p-primary-rgb) / 0.25);
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
        rgb(var(--p-success-rgb) / 0.85) 100%);
    color: var(--p-white);
    border: 2px solid color-mix(in srgb, var(--p-success) 70%, var(--p-white) 30%);
    box-shadow:
        0 0 0 2px rgb(var(--p-success-rgb) / 0.35),
        0 4px 14px rgb(var(--p-success-rgb) / 0.5),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
    text-shadow: 0 1px 2px rgba(var(--p-black-rgb), 0.25);
}

.builder-action-btn-outline {
    background: rgb(var(--p-primary-rgb) / 0.2);
    border: 1px solid rgb(var(--p-primary-rgb) / 0.55);
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
