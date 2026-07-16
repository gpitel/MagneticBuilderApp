<script setup>
import { removeTrailingZeroes, deepCopy, isMobile } from '/WebSharedComponents/assets/js/utils.js'
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import WindingSelector from '../Common/WindingSelector.vue'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'
import { useModelSettingsStore } from '../../../stores/modelSettings'
</script>

<script>

export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        masStore: {
            type: Object,
            required: true,
        },
        operatingPointIndex: {
            type: Number,
            default: 0,
        },
        advancedMode: {
            type: Boolean,
            default: true,
        },
        enableAutoSimulation: {
            type: Boolean,
            default: true,
        },
        fillingFactors: {
            type: Object,
            default: null,
        },
        sectionsOrientation: {
            type: String,
            default: null,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const modelSettingsStore = useModelSettingsStore();
        const outputsData = {};
        const selectedWindingIndex = 0;
        const loading = false;
        const recentChange = false;
        const tryingToSend = false;
        const lastSimulatedInputs = "";
        const lastSimulatedMagnetics = "";
        const lastSimulatedModels = "";
        const dataUptoDate = false;
        const simulationError = '';
        const subscriptions = [];

        return {
            taskQueueStore,
            modelSettingsStore,
            outputsData,
            selectedWindingIndex,
            recentChange,
            tryingToSend,
            loading,
            lastSimulatedInputs,
            lastSimulatedMagnetics,
            lastSimulatedModels,
            dataUptoDate,
            simulationError,
            subscriptions,
            _simTimer: null,
            _waitTimer: null,
        }
    },
    computed: {
        hasCalculableData() {
            return this.masStore.mas.magnetic.coil?.turnsDescription != null;
        },
        contiguousLabel() {
            try {
                if (this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].shape == "rectangular") {
                    return "height";
                }
                else {
                    return "angle";
                }
            }
            catch (e) {
                return "height";
            }
        },
        overlappingLabel() {
            try {
                if (this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].shape == "rectangular") {
                    return "width";
                }
                else {
                    return "radial";
                }
            }
            catch (e) {
                return "width";
            }
        },
        // Fill factor above 100 % means the winding physically cannot fit this
        // core. The tinted number alone proved too subtle: the Core "Advise"
        // button keeps the existing wire while swapping the core, and shipped
        // designs ended up at >200 % with only an orange digit as feedback
        // (ABT #147).
        windingDoesNotFit() {
            const f = this.fillingFactors;
            if (f == null) return false;
            if (f.areaFillingFactor > 1) return true;
            if (this.sectionsOrientation == 'contiguous' && f.contiguousFillingFactor > 1) return true;
            if (this.sectionsOrientation == 'overlapping' && f.overlappingFillingFactor > 1) return true;
            return false;
        },
    },
    watch: {
        'operatingPointIndex': {
            handler(newValue, oldValue) {
                this.updateFields(this.masStore.mas.outputs);
            },
          deep: true
        },
        'enableAutoSimulation': {
            handler(newValue, oldValue) {
                // When auto-simulation is turned off, mark data as outdated
                // so the user knows they need to manually resimulate
                if (!newValue) {
                    this.dataUptoDate = false;
                }
            },
        },
    },
    mounted () {
        // Reset simulation cache when component is mounted to ensure fresh simulation
        // This handles the case when returning from operating points or other views
        this.lastSimulatedInputs = "";
        this.lastSimulatedMagnetics = "";
        this.lastSimulatedModels = "";

        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            // Mark as outdated immediately when wind starts
            if (name == "wind" || name == "windPlanar") {
                this.dataUptoDate = false;
            }
            after(() => {
                if (name == "wound" || name == "planarWound" || name == "coreShapeProcessed" || name == "coreMaterialProcessed" || name == "coreProcessed") {
                    if (args[0]) {
                        this.dataUptoDate = false;
                        // Skip simulation on coreProcessed if bobbin is being regenerated —
                        // wound action will trigger simulation after winding with the new bobbin.
                        const skipSim = name == "coreProcessed" && this.taskQueueStore.bobbinRegenerationPending;
                        if (!skipSim && this.enableAutoSimulation) {
                            this.simulate();
                        }
                    }
                    else {
                        console.error(args[1])
                        this.dataUptoDate = false;
                    }
                }
                // When builder is ready with an existing design, run simulation
                if (name == "magneticBuilderReady") {
                    if (this.masStore.mas.magnetic?.coil?.turnsDescription != null && this.enableAutoSimulation) {
                        this.loading = true;
                        this.dataUptoDate = false;
                        this.simulate();
                    }
                }
            });
        }))

        // Listen for global resimulate action from stateStore
        this.subscriptions.push(this.$stateStore.$onAction(({name, after}) => {
            after(() => {
                if (name == "resimulate") {
                    this.loading = true;
                    this.simulate();
                }
            });
        }))

        // Wait for modelSettings to be initialized before starting simulation
        this.waitForModelSettingsAndSimulate();
    },
    beforeUnmount () {
        if (this._simTimer) clearTimeout(this._simTimer);
        if (this._waitTimer) clearTimeout(this._waitTimer);
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        waitForModelSettingsAndSimulate() {
            // Wait for modelSettings to be initialized AND have valid models before calculating
            if (this.modelSettingsStore.isInitialized &&
                Object.keys(this.modelSettingsStore.availableMagneticFieldStrengthModels).length > 0) {
                if (this.enableAutoSimulation) {
                    this.loading = true;
                    this.recentChange = true;
                    this.tryToSimulate();
                } else {
                    this.loading = false;
                    this.dataUptoDate = false;
                }
            } else {
                // Check again in 100ms
                this._waitTimer = setTimeout(() => {
                    this._waitTimer = null;
                    this.waitForModelSettingsAndSimulate();
                }, 100);
            }
        },
        tryToSimulate() {
            if (!this.tryingToSend) {
                this.recentChange = false
                this.dataUptoDate = false
                this.tryingToSend = true
                if (this._simTimer) clearTimeout(this._simTimer);
                this._simTimer = setTimeout(() => {
                    this._simTimer = null;
                    if (this.recentChange) {
                        this.tryingToSend = false
                        this.tryToSimulate()
                    }
                    else {
                        if (this.enableAutoSimulation) {
                            this.simulate();
                            this.loading = true;
                        } else {
                            this.loading = false;
                        }
                        this.tryingToSend = false;
                    }
                }
                , this.$settingsStore.waitingTimeAfterChange);
            }
        },
        updateFields(outputs) {
            this.outputsData.proximityLosses = 0;
            this.outputsData.ohmicLosses = 0;
            this.outputsData.acLosses = 0;
            this.outputsData.skinLosses = 0;
            this.outputsData.dcResistancePerWinding = [];
            this.outputsData.effectiveResistancePerWinding = [];
            this.outputsData.proximityLossesPerWinding = [];
            this.outputsData.ohmicLossesPerWinding = [];
            this.outputsData.skinLossesPerWinding = [];
            this.outputsData.windingLossesPerWinding = [];
            this.outputsData.leakageInductancePerWinding = [0];
            for (let windingIndex = 0; windingIndex < this.masStore.mas.magnetic.coil.functionalDescription.length; windingIndex++) {
                const proximityLosses = outputs[this.operatingPointIndex].windingLosses.windingLossesPerWinding[windingIndex].proximityEffectLosses.lossesPerHarmonic.reduce((a, c) => {return a + c}, 0);
                this.outputsData.proximityLossesPerWinding.push(proximityLosses);
                const skinLosses = outputs[this.operatingPointIndex].windingLosses.windingLossesPerWinding[windingIndex].skinEffectLosses.lossesPerHarmonic.reduce((a, c) => {return a + c}, 0);
                const ohmicLosses = outputs[this.operatingPointIndex].windingLosses.windingLossesPerWinding[windingIndex].ohmicLosses.losses;
                this.outputsData.proximityLosses += proximityLosses;
                this.outputsData.ohmicLosses += ohmicLosses;
                this.outputsData.skinLosses += skinLosses;
                this.outputsData.acLosses += skinLosses + proximityLosses;
                this.outputsData.ohmicLossesPerWinding.push(ohmicLosses);
                this.outputsData.skinLossesPerWinding.push(skinLosses);
                this.outputsData.windingLossesPerWinding.push(proximityLosses + skinLosses + ohmicLosses);
                this.outputsData.dcResistancePerWinding.push(outputs[this.operatingPointIndex].windingLosses.dcResistancePerWinding[windingIndex]);
            }

            if (outputs[this.operatingPointIndex].inductance.leakageInductance?.leakageInductancePerWinding) {
                const perWinding = outputs[this.operatingPointIndex].inductance.leakageInductance.leakageInductancePerWinding;
                const numberWindings = this.masStore.mas.magnetic.coil.functionalDescription.length;
                // The engine emits a winding-indexed array (N entries, 0 at the primary slot);
                // outputs saved by older versions carry a legacy secondaries-only (N-1) shape.
                const windingIndexed = perWinding.length === numberWindings;
                for (let windingIndex = 1; windingIndex < numberWindings; windingIndex++) {
                    const entry = perWinding[windingIndexed ? windingIndex : windingIndex - 1];
                    if (entry != null) {
                        this.outputsData.leakageInductancePerWinding.push(entry.nominal);
                    }
                }
            }
            for (let windingIndex = 0; windingIndex < this.masStore.mas.magnetic.coil.functionalDescription.length; windingIndex++) {
                this.outputsData.effectiveResistancePerWinding.push(this.outputsData.windingLossesPerWinding[windingIndex] / Math.pow(this.masStore.mas.inputs.operatingPoints[this.operatingPointIndex].excitationsPerWinding[windingIndex].current.processed.rms, 2));
            }
            // this.outputsData.proximityLossesPerWinding = outputs[this.operatingPointIndex].windingLosses.windingLossesPerWinding[];
            this.outputsData.windingLosses = outputs[this.operatingPointIndex].windingLosses.windingLosses;
            this.outputsData.totalLosses = outputs[this.operatingPointIndex].windingLosses.windingLosses + outputs[this.operatingPointIndex].coreLosses.coreLosses;
        },
        simulate() {
            
            if (this.masStore.mas.magnetic.coil['turnsDescription'] == null) {
                // turnsDescription not available yet, stop loading state
                this.loading = false;
                this.dataUptoDate = false;
                return;
            }
            
            if (this.masStore.mas.magnetic.coil['turnsDescription'] != null) {

                // Check if there are pending simulation models from the state store
                const pendingModels = this.$stateStore.pendingSimulationModels;
                
                // Use pending models if available, otherwise fall back to store values
                const magneticFieldStrength = pendingModels?.magneticFieldStrengthModel || this.modelSettingsStore.magneticFieldStrengthModel;
                const magneticFieldStrengthFringingEffect = pendingModels?.magneticFieldStrengthFringingEffectModel || this.modelSettingsStore.magneticFieldStrengthFringingEffectModel;
                
                const modelsData = {
                    coreLosses: this.$userStore.selectedModels['coreLosses'] || Defaults.coreLossesModelDefault,
                    coreTemperature: this.$userStore.selectedModels['coreTemperature'] || Defaults.coreTemperatureModelDefault,
                    gapReluctance: this.$userStore.selectedModels['gapReluctance'] || Defaults.reluctanceModelDefault,
                    windingSkinEffectLosses: pendingModels?.windingSkinEffectLossesModel || this.modelSettingsStore.windingSkinEffectLossesModel,
                    windingProximityEffectLosses: pendingModels?.windingProximityEffectLossesModel || this.modelSettingsStore.windingProximityEffectLossesModel,
                    magneticFieldStrength: magneticFieldStrength,
                    magneticFieldStrengthFringingEffect: magneticFieldStrengthFringingEffect
                };
                
                // Clear pending models after using them
                if (pendingModels) {
                    this.$stateStore.pendingSimulationModels = null;
                }


                const inputsString = JSON.stringify(this.masStore.mas.inputs);
                const magneticsString = JSON.stringify(this.masStore.mas.magnetic);
                const modelsString = JSON.stringify(modelsData);


                // The simulate path eventually reaches LeakageInductance, which
                // requires BOTH turns AND layers descriptions to be populated.
                // Without the layers gate, CoilInfo throws [COIL_NOT_PROCESSED]
                // for coils that have turns but not layers (e.g. between wire
                // assignment and full Coil::process()).
                const coil = this.masStore.mas.magnetic.coil;
                const coilReady = coil.turnsDescription != null && coil.layersDescription != null;
                if (coilReady && (inputsString != this.lastSimulatedInputs || magneticsString != this.lastSimulatedMagnetics || modelsString != this.lastSimulatedModels)) {

                    this.taskQueueStore.simulate(this.masStore.mas, modelsData).then((mas) => {

                        this.lastSimulatedInputs = inputsString;
                        this.lastSimulatedMagnetics = magneticsString;
                        this.lastSimulatedModels = modelsString;

                        this.updateFields(mas.outputs);
                        this.masStore.mas.outputs = deepCopy(mas.outputs);
                        this.loading = false;
                        this.dataUptoDate = true;
                        this.simulationError = '';
                    })
                    .catch(error => {
                        // Show the real MKF error in the panel — a console-only
                        // error made simulation failures look like a silent hang.
                        this.simulationError = error?.message || String(error);
                        this.dataUptoDate = false;
                        console.error('[CoilInfo] Simulation error:', error);
                        this.loading = false;
                    });
                }
                else {
                    // Inputs match the last successful simulation — the shown
                    // values are valid, so any lingering error is stale.
                    this.simulationError = '';
                    this.dataUptoDate = true;
                    this.loading = false;
                }
            
            }
        },
        windingIndexChanged(windingIndex) {
            this.selectedWindingIndex = windingIndex;
        },
    }
}
</script>

<template>
    <h5 v-if="masStore.mas.magnetic.core['functionalDescription']['material'] == null" class="text-danger my-2">Select core material</h5>

    <div v-else class="coilinfo-panel">
        <div class="coilinfo-header">
            <div class="coilinfo-header-left">
                <i class="pi pi-bolt"></i>
                <span>Coil Info</span>
            </div>
            <div v-if="!dataUptoDate && !loading && hasCalculableData" class="coilinfo-outdated-badge">Outdated</div>
        </div>

        <div class="coilinfo-body">
            <h6
                v-if="simulationError"
                :data-cy="dataTestLabel + '-CoilInfo-SimulationError'"
                class="text-danger my-2"
            >{{ simulationError }}</h6>
            <img
                :data-cy="dataTestLabel + '-BasicCoilInfo-loading'"
                v-if="loading"
                class="mx-auto d-block col-12"
                alt="loading"
                style="width: 60%; height: auto;"
                :src="$settingsStore.loadingGif"
            />

            <template v-else-if="advancedMode">
                <div class="coilinfo-grid" :class="{ 'coilinfo-dimmed': !dataUptoDate }">
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.windingLosses"
                            v-if="outputsData.windingLosses != null"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'winding'"
                            :unit="'W'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-WindingLosses'"
                            :numberDecimals="2"
                            :value="outputsData.windingLosses"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.totalLosses"
                            v-if="outputsData.totalLosses != null"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'total'"
                            :unit="'W'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-TotalLosses'"
                            :numberDecimals="2"
                            :value="outputsData.totalLosses"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.ohmicLosses"
                            v-if="outputsData.ohmicLosses != null"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'DC'"
                            :unit="'W'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-OhmicLosses'"
                            :numberDecimals="2"
                            :value="outputsData.ohmicLosses"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.acLosses"
                            v-if="outputsData.acLosses != null"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'AC'"
                            :unit="'W'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-AcLosses'"
                            :numberDecimals="2"
                            :value="outputsData.acLosses"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div v-if="fillingFactors != null" class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.areaFillingFactor"
                            class="text-left"
                            :name="'Fill. F'"
                            :subscriptName="'area'"
                            :unit="'%'"
                            :power="1"
                            :visualScale="100"
                            :dataTestLabel="dataTestLabel + '-FillingFactor'"
                            :numberDecimals="2"
                            :value="fillingFactors.areaFillingFactor"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="fillingFactors.areaFillingFactor < 0.8? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                        />
                    </div>
                    <div v-if="fillingFactors != null && sectionsOrientation == 'contiguous'" class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.contiguousFillingFactor"
                            class="text-left"
                            :name="'Fill. F'"
                            :subscriptName="contiguousLabel"
                            :unit="'%'"
                            :power="1"
                            :visualScale="100"
                            :dataTestLabel="dataTestLabel + '-FillingFactor'"
                            :numberDecimals="2"
                            :value="fillingFactors.contiguousFillingFactor"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="fillingFactors.contiguousFillingFactor < 0.8? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                        />
                    </div>
                    <div v-if="fillingFactors != null && sectionsOrientation == 'overlapping'" class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.overlappingFillingFactor"
                            class="text-left"
                            :name="'Fill. F'"
                            :subscriptName="overlappingLabel"
                            :unit="'%'"
                            :power="1"
                            :visualScale="100"
                            :dataTestLabel="dataTestLabel + '-FillingFactor'"
                            :numberDecimals="2"
                            :value="fillingFactors.overlappingFillingFactor"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="fillingFactors.overlappingFillingFactor < 0.8? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                        />
                    </div>
                </div>

                <label
                    v-if="windingDoesNotFit"
                    :data-cy="dataTestLabel + '-WindingDoesNotFit-warning'"
                    class="coilinfo-nofit-warning"
                    :style="{ color: $styleStore.magneticBuilder.inputLabelDangerBgColor }"
                >
                    Winding does not fit this core (fill factor above 100 %). Advise a new wire or pick a larger core.
                </label>

                <div class="coilinfo-winding-bar">
                    <WindingSelector
                        :masStore="masStore"
                        :dataTestLabel="`${dataTestLabel}-WindingSelector`"
                        :coil="masStore.mas.magnetic.coil"
                        :selectedWindingIndex="selectedWindingIndex"
                        @windingIndexChanged="windingIndexChanged"
                    />
                </div>

                <div class="coilinfo-grid" :class="{ 'coilinfo-dimmed': !dataUptoDate }">
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.ohmicLossesPerWinding"
                            v-if="outputsData.ohmicLossesPerWinding != null"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'DC'"
                            :unit="'W'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-OhmicLossesPerWinding'"
                            :numberDecimals="2"
                            :value="outputsData.ohmicLossesPerWinding[selectedWindingIndex]"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.skinLossesPerWinding"
                            v-if="outputsData.skinLossesPerWinding != null"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'skin'"
                            :unit="'W'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-SkinLossesPerWinding'"
                            :numberDecimals="2"
                            :value="outputsData.skinLossesPerWinding[selectedWindingIndex]"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.proximityLossesPerWinding"
                            v-if="outputsData.proximityLossesPerWinding != null"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'prox.'"
                            :unit="'W'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-ProximityLossesPerWinding'"
                            :numberDecimals="2"
                            :value="outputsData.proximityLossesPerWinding[selectedWindingIndex]"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.windingLossesPerWinding"
                            v-if="outputsData.windingLossesPerWinding != null"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'winding'"
                            :unit="'W'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-WindingLossesPerWinding'"
                            :numberDecimals="2"
                            :value="outputsData.windingLossesPerWinding[selectedWindingIndex]"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.dcResistancePerWinding"
                            v-if="outputsData.dcResistancePerWinding != null"
                            class="text-left"
                            :name="'R'"
                            :subscriptName="'DC'"
                            :unit="'Ω'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-DcResistancePerWinding'"
                            :numberDecimals="2"
                            :value="outputsData.dcResistancePerWinding[selectedWindingIndex]"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.effectiveResistancePerWinding"
                            v-if="outputsData.effectiveResistancePerWinding != null"
                            class="text-left"
                            :name="'R'"
                            :subscriptName="'eff'"
                            :unit="'Ω'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-EffectiveResistancePerWinding'"
                            :numberDecimals="2"
                            :value="outputsData.effectiveResistancePerWinding[selectedWindingIndex]"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div v-if="outputsData.leakageInductancePerWinding != null && selectedWindingIndex > 0" class="coilinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.leakageInductanceReflectedToPrimary"
                            class="text-left"
                            :name="'L'"
                            :subscriptName="'lk'"
                            :unit="'H'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-LeakageInductancePerWinding'"
                            :numberDecimals="2"
                            :value="outputsData.leakageInductancePerWinding[selectedWindingIndex]"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-4'"
                            :valueWidthProportionClass="'col-8'"
                            :inputStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                </div>
            </template>

            <template v-else>
                <div class="coilinfo-simple" :class="{ 'coilinfo-dimmed': !dataUptoDate }">
                    <DimensionReadOnly
                        v-tooltip="tooltipsMagneticBuilder.windingLosses"
                        v-if="outputsData.windingLosses != null"
                        class="text-left pl-4 pr-4"
                        :name="'Winding losses'"
                        :unit="'W'"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-WindingLosses'"
                        :numberDecimals="2"
                        :value="outputsData.windingLosses"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :inputStyleClass="'col-6'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <DimensionReadOnly
                        v-tooltip="tooltipsMagneticBuilder.totalLosses"
                        v-if="outputsData.totalLosses != null"
                        class="text-left pl-4 pr-4"
                        :name="'Total losses'"
                        :unit="'W'"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-TotalLosses'"
                        :numberDecimals="2"
                        :value="outputsData.totalLosses"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :inputStyleClass="'col-6'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <div
                        v-if="masStore.mas.magnetic.coil.functionalDescription.length > 2 && !masStore.hasMirroredWindings"
                        class="coilinfo-winding-bar"
                    >
                        <WindingSelector
                            :dataTestLabel="`${dataTestLabel}-WindingSelector`"
                            :masStore="masStore"
                            :coil="masStore.mas.magnetic.coil"
                            :selectedWindingIndex="selectedWindingIndex"
                            @windingIndexChanged="windingIndexChanged"
                        />
                    </div>
                    <DimensionReadOnly
                        v-tooltip="tooltipsMagneticBuilder.leakageInductanceReflectedToPrimary"
                        v-if="outputsData.leakageInductancePerWinding != null && masStore.mas.magnetic.coil.functionalDescription.length > 1"
                        class="text-left pl-4 pr-4"
                        :name="'Leakage Inductance'"
                        :unit="'H'"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-LeakageInductancePerWinding'"
                        :numberDecimals="2"
                        :value="outputsData.leakageInductancePerWinding[selectedWindingIndex == 0? 1 : selectedWindingIndex]"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :inputStyleClass="'col-6'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.coilinfo-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.06) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 14px;
    padding: 0;
    margin: 0.05rem 0 0.5rem 0;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.12), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    overflow: hidden;
}

.coilinfo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(120, 120, 120, 0.1);
    border-bottom: 1px solid rgba(120, 120, 120, 0.15);
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.coilinfo-header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}

.coilinfo-header-left i {
    font-size: 1rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.coilinfo-outdated-badge {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: rgba(var(--p-warning-rgb), 0.2);
    color: var(--p-warning);
    border: 1px solid rgba(var(--p-warning-rgb), 0.35);
}

.coilinfo-body {
    padding: 0.2rem 0.4rem;
}

.coilinfo-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 0.5rem;
}

@media (max-width: 576px) {
    .coilinfo-grid {
        grid-template-columns: 1fr;
    }
}

.coilinfo-cell {
    background: transparent;
    border: 0;
    border-radius: 10px;
    padding: 0.05rem 0.4rem;
    margin: 0;
    transition: opacity 0.3s ease;
    line-height: 1.25;
    font-size: 0.9rem;
}

.coilinfo-cell :deep(.row),
.coilinfo-cell :deep(.grid),
.coilinfo-cell :deep(.dim-ro-row),
.coilinfo-cell :deep(.dim-ro-value-row),
.coilinfo-cell :deep(.dim-ro-container) {
    margin: 0 !important;
    padding: 0 !important;
    --p-gutter-x: 0;
    --p-gutter-y: 0;
    min-height: 0 !important;
    line-height: 1.25 !important;
}
.coilinfo-cell :deep(.row > *),
.coilinfo-cell :deep(.grid > *),
.coilinfo-cell :deep(.dim-ro-row > *) {
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    line-height: 1.25 !important;
}
.coilinfo-cell :deep(.form-label),
.coilinfo-cell :deep(label),
.coilinfo-cell :deep(.dim-ro-label) {
    padding: 0 0 0 0.35rem !important;
    margin: 0 !important;
    line-height: 1.25 !important;
    text-align: start !important;
}
.coilinfo-cell :deep(.p-inputnumber),
.coilinfo-cell :deep(.p-inputnumber > input),
.coilinfo-cell :deep(.p-select),
.coilinfo-cell :deep(.p-inputtext),
.coilinfo-cell :deep(.dim-ro-input),
.coilinfo-cell :deep(.dim-ro-value),
.coilinfo-cell :deep(.dim-ro-unit) {
    padding: 0 !important;
    margin: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    line-height: 1.25 !important;
}

.coilinfo-nofit-warning {
    display: block;
    grid-column: 1 / -1;
    width: 100%;
    text-align: center;
    font-weight: 600;
    font-size: 0.85rem;
    padding: 0.2rem 0.4rem;
}
.coilinfo-winding-bar {
    margin: 0.5rem 0;
}

.coilinfo-simple {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

.coilinfo-dimmed {
    opacity: 0.35;
    transition: opacity 0.3s ease;
}
</style>