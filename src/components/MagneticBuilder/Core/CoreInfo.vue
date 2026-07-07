    <script setup>
import { toTitleCase } from '/WebSharedComponents/assets/js/utils.js'
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import * as Defaults from '/WebSharedComponents/assets/js/defaults.js'
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
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const modelSettingsStore = useModelSettingsStore();
        const coreTemperatureDependantParametersData = {};
        const coreEffectiveParameters = {};
        const coreLossesData = {};
        const magnetizingInductance = 0;
        const magnetizingInductanceCheck = false;
        const recentChange = false;
        const tryingToSend = false;
        const dataUptoDate = false;
        const simulationError = '';
        const subscriptions = [];

        return {
            taskQueueStore,
            modelSettingsStore,
            coreTemperatureDependantParametersData,
            coreEffectiveParameters,
            coreLossesData,
            magnetizingInductance,
            magnetizingInductanceCheck,
            recentChange,
            tryingToSend,
            dataUptoDate,
            simulationError,
            subscriptions,
        }
    },
    computed: {
        closeOrOverSaturation() {
            return (this.coreLossesData.magneticFluxDensityPeak / this.coreTemperatureDependantParametersData.magneticFluxDensitySaturation) > 0.85;
        },
        hasCalculableData() {
            const shape = this.masStore.mas.magnetic.core?.functionalDescription?.shape;
            const material = this.masStore.mas.magnetic.core?.functionalDescription?.material;
            const hasShape = shape && ((typeof shape === 'string' && shape !== '') || (typeof shape === 'object' && shape.family));
            return hasShape && material && material !== '';
        },
    },
    watch: {
        'operatingPointIndex': {
            handler(newValue, oldValue) {
                // Operating point change invalidates loss/inductance/flux density
                // outputs (they depend on excitation waveform & frequency, not on
                // core geometry). Re-run the simulation so Bpeak / BACpeak / Pcore
                // / L reflect the newly selected OP. Geometry (Leff, Aeff, ...) is
                // OP-independent and reused from the cached coreEffectiveParameters.
                if (this.enableAutoSimulation) {
                    this.calculateCoreLosses();
                }
                else {
                    this.dataUptoDate = false;
                }
            },
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
        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "processCore") {
                    this.dataUptoDate = false;
                }
                if (name == "calculateCoreLosses") {
                    this.dataUptoDate = false;
                }
                if (name == "coreProcessed") {
                    if (args[0]) {
                        const core = args[1];
                        this.coreEffectiveParameters = core.processedDescription.effectiveParameters;
                        this.dataUptoDate = false;
                        if (this.enableAutoSimulation) {
                            this.calculateCoreLosses();
                        }
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "numberTurnsUpdated") {
                    if (args[0] && !this.taskQueueStore.windingIndexChangeBlock) {
                        this.dataUptoDate = false;
                        if (this.enableAutoSimulation) {
                            this.calculateCoreLosses();
                        }
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "coreMaterialChanged") {
                    if (args[0]) {
                        // Just mark as outdated — the subsequent coreProcessed action
                        // will trigger calculateCoreLosses with the fully processed core.
                        this.dataUptoDate = false;
                    }
                    else {
                        console.error(args[1])
                    }
                }
            });
        }))

        // Listen for global resimulate action from stateStore
        this.subscriptions.push(this.$stateStore.$onAction(({name, after}) => {
            after(() => {
                if (name == "resimulate") {
                    this.calculateCoreLosses();
                }
            });
        }))

        // Listen for importedMas to trigger simulation after file load
        this.subscriptions.push(this.masStore.$onAction((action) => {
            action.after(() => {
                if (action.name == "importedMas") {
                    const effParams = this.masStore.mas.magnetic.core?.processedDescription?.effectiveParameters;
                    if (effParams) {
                        this.coreEffectiveParameters = effParams;
                    }
                    if (this.enableAutoSimulation) {
                        this.calculateCoreLosses();
                    }
                }
            });
        }))

        // Populate coreEffectiveParameters from existing processedDescription on mount
        const existingEffParams = this.masStore.mas.magnetic.core?.processedDescription?.effectiveParameters;
        if (existingEffParams) {
            this.coreEffectiveParameters = existingEffParams;
        }

        // Auto-simulate on mount if valid data exists (e.g., after navigating back from file load)
        if (this.enableAutoSimulation) {
            const shape = this.masStore.mas.magnetic.core?.functionalDescription?.shape;
            const material = this.masStore.mas.magnetic.core?.functionalDescription?.material;
            const hasValidShape = shape && (
                (typeof shape === 'string' && shape !== '') ||
                (typeof shape === 'object' && shape.family)
            );
            if (hasValidShape && material && material !== '') {
                this.calculateCoreLosses();
            }
        }

    },
    beforeUnmount () {
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        calculateCoreLosses() {
            // Check if there are pending simulation models from the state store
            const pendingModels = this.$stateStore.pendingSimulationModels;
            
            // Use pending models if available, otherwise fall back to store values
            const modelsData = {
                coreLosses: this.$userStore.selectedModels['coreLosses'] || Defaults.coreLossesModelDefault,
                coreTemperature: this.$userStore.selectedModels['coreTemperature'] || Defaults.coreTemperatureModelDefault,
                gapReluctance: this.$userStore.selectedModels['gapReluctance'] || Defaults.reluctanceModelDefault,
                magneticFieldStrength: pendingModels?.magneticFieldStrengthModel || this.modelSettingsStore.magneticFieldStrengthModel,
                magneticFieldStrengthFringingEffect: pendingModels?.magneticFieldStrengthFringingEffectModel || this.modelSettingsStore.magneticFieldStrengthFringingEffectModel
            };
            
            // Note: Don't clear pending models here - let CoilInfo.vue also use them
            if (pendingModels) {
            }
            const shape = this.masStore.mas.magnetic.core?.functionalDescription?.shape;
            const material = this.masStore.mas.magnetic.core?.functionalDescription?.material;
            const gapping = this.masStore.mas.magnetic.core?.functionalDescription?.gapping;
            const operatingPoint = this.masStore.mas.inputs?.operatingPoints?.[this.operatingPointIndex];
            
            // Check shape - can be a string (name) or object (with family/dimensions)
            const hasValidShape = shape && (
                (typeof shape === 'string' && shape !== '') ||
                (typeof shape === 'object' && shape.family)
            );
            
            // All required fields must exist (gapping can be empty for toroidal cores)
            if (hasValidShape && material && material !== '' && 
                gapping && Array.isArray(gapping) &&
                operatingPoint?.conditions?.ambientTemperature != null) {
                this.taskQueueStore.calculateCoreLosses(this.masStore.mas.magnetic, this.masStore.mas.inputs, this.operatingPointIndex, modelsData).then((data) => {
                    if (data) {
                        this.coreTemperatureDependantParametersData = data.coreTemperatureDependantParametersData;
                        this.magnetizingInductance = data.magnetizingInductance;
                        this.coreLossesData = data.coreLossesData;
                        this.magnetizingInductanceCheck = data.magnetizingInductanceCheck;
                        this.dataUptoDate = true;
                        this.simulationError = '';
                    }
                })
                .catch(error => {
                    // Show the real MKF error in the panel — a console-only error
                    // left the user staring at losses that never arrive.
                    this.simulationError = error?.message || String(error);
                    this.dataUptoDate = false;
                    console.error(error);
                });
            }
        },
    }
}
</script>

<template>
    <div class="coreinfo-panel">
        <div class="coreinfo-header">
            <div class="coreinfo-header-left">
                <i class="pi pi-box"></i>
                <span>Core Info</span>
            </div>
            <div v-if="!dataUptoDate && hasCalculableData" class="coreinfo-outdated-badge">Outdated</div>
        </div>
        <div class="coreinfo-body">
            <h6
                v-if="simulationError"
                :data-cy="dataTestLabel + '-CoreInfo-SimulationError'"
                class="text-danger my-2"
            >{{ simulationError }}</h6>
            <template v-if="advancedMode">
                <div class="coreinfo-grid" :class="{ 'coreinfo-dimmed': !dataUptoDate }" v-if="coreEffectiveParameters.effectiveLength != null">
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.effectiveLength"
                            class="text-left"
                            :name="'L'"
                            :subscriptName="'eff'"
                            :unit="'m'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-EffectiveLength'"
                            :numberDecimals="2"
                            :value="coreEffectiveParameters.effectiveLength"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.effectiveArea"
                            class="text-left"
                            :name="'A'"
                            :subscriptName="'eff'"
                            :unit="'m²'"
                            :power="2"
                            :dataTestLabel="dataTestLabel + '-EffectiveArea'"
                            :numberDecimals="1"
                            :value="coreEffectiveParameters.effectiveArea"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.effectiveVolume"
                            class="text-left"
                            :name="'V'"
                            :subscriptName="'eff'"
                            :unit="'m³'"
                            :power="3"
                            :dataTestLabel="dataTestLabel + '-EffectiveVolume'"
                            :numberDecimals="1"
                            :value="coreEffectiveParameters.effectiveVolume"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.minimumArea"
                            class="text-left"
                            :name="'A'"
                            :subscriptName="'min'"
                            :unit="'m²'"
                            :power="2"
                            :dataTestLabel="dataTestLabel + '-MinimumArea'"
                            :numberDecimals="1"
                            :value="coreEffectiveParameters.minimumArea"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.initialPermeability"
                            class="text-left"
                            :name="'μ'"
                            :subscriptName="'ini'"
                            :unit="null"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-InitialPermeability'"
                            :numberDecimals="0"
                            :value="coreTemperatureDependantParametersData.initialPermeability"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.effectivePermeability"
                            class="text-left"
                            :name="'μ'"
                            :subscriptName="'eff'"
                            :unit="null"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-EffectivePermeability'"
                            :numberDecimals="0"
                            :value="coreTemperatureDependantParametersData.effectivePermeability"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.permeance"
                            class="text-left"
                            :name="'A'"
                            :subscriptName="'L'"
                            :unit="'H/tu²'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-Permeance'"
                            :numberDecimals="0"
                            :value="coreTemperatureDependantParametersData.permeance"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.saturatingMagneticFluxDensity"
                            class="text-left"
                            :name="'B'"
                            :subscriptName="'sat'"
                            :unit="'T'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-MagneticFluxDensitySaturation'"
                            :numberDecimals="3"
                            :value="coreTemperatureDependantParametersData.magneticFluxDensitySaturation"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.magneticFluxDensityPeak"
                            class="text-left"
                            :name="'B'"
                            :subscriptName="'peak'"
                            :unit="'T'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-MagneticFluxDensityPeak'"
                            :numberDecimals="3"
                            :value="coreLossesData.magneticFluxDensityPeak"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="closeOrOverSaturation? $styleStore.magneticBuilder.inputLabelDangerBgColor : $styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.magneticFluxDensityAcPeak"
                            class="text-left"
                            :name="'B'"
                            :subscriptName="'ACpeak'"
                            :unit="'T'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-MagneticFluxDensityAcPeak'"
                            :numberDecimals="3"
                            :value="coreLossesData.magneticFluxDensityAcPeak"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="closeOrOverSaturation? $styleStore.magneticBuilder.inputLabelDangerBgColor : $styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.magnetizingInductance"
                            class="text-left"
                            :name="'L'"
                            :unit="'H'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-MagnetizingInductance'"
                            :numberDecimals="2"
                            :value="magnetizingInductance"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="magnetizingInductanceCheck? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                        />
                    </div>
                    <div class="coreinfo-cell">
                        <DimensionReadOnly 
                            v-tooltip="tooltipsMagneticBuilder.coreLosses"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'core'"
                            :unit="'W'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-CoreLosses'"
                            :numberDecimals="2"
                            :value="coreLossesData.coreLosses"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
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
                <div class="coreinfo-simple" :class="{ 'coreinfo-dimmed': !dataUptoDate }" v-if="coreEffectiveParameters.effectiveLength != null">
                    <DimensionReadOnly 
                        v-tooltip="tooltipsMagneticBuilder.magnetizingInductance"
                        class="text-left pl-4 pr-4"
                        :name="'L'"
                        :replaceTitle="'Magnetizing Inductance'"
                        :unit="'H'"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-MagnetizingInductance'"
                        :numberDecimals="2"
                        :value="magnetizingInductance"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="magnetizingInductanceCheck? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                    />
                    <DimensionReadOnly 
                        v-tooltip="tooltipsMagneticBuilder.coreLosses"
                        class="text-left pl-4 pr-4"
                        :replaceTitle="'Core Losses'"
                        :name="'P'"
                        :unit="'W'"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-CoreLosses'"
                        :numberDecimals="2"
                        :value="coreLossesData.coreLosses"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <DimensionReadOnly 
                        v-tooltip="tooltipsMagneticBuilder.saturationProportion"
                        class="text-left pl-4 pr-4"
                        :name="'Saturation Proportion'"
                        :unit="'%'"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-SaturationProportion'"
                        :numberDecimals="2"
                        :value="coreTemperatureDependantParametersData.saturationProportion"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="closeOrOverSaturation? $styleStore.magneticBuilder.inputLabelDangerBgColor : $styleStore.magneticBuilder.inputTextColor"
                    />
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.coreinfo-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.06) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 14px;
    padding: 0;
    margin: 0.05rem 0 0.5rem 0;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.12), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    overflow: hidden;
}

.coreinfo-header {
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

.coreinfo-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.coreinfo-header-left i {
    font-size: 0.95rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.coreinfo-outdated-badge {
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

.coreinfo-body {
    padding: 0.2rem 0.4rem;
}

.coreinfo-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 0.5rem;
}

@media (max-width: 576px) {
    .coreinfo-grid {
        grid-template-columns: 1fr;
    }
}

.coreinfo-cell {
    background: transparent;
    border: 0;
    border-radius: 10px;
    padding: 0.05rem 0.4rem;
    margin: 0;
    transition: opacity 0.3s ease;
    line-height: 1.25;
    font-size: 0.9rem;
}

/* Crush the inner Dimension component to just the natural text height. */
.coreinfo-cell :deep(.row),
.coreinfo-cell :deep(.grid),
.coreinfo-cell :deep(.dim-ro-row),
.coreinfo-cell :deep(.dim-ro-value-row),
.coreinfo-cell :deep(.dim-ro-container) {
    margin: 0 !important;
    padding: 0 !important;
    --p-gutter-x: 0;
    --p-gutter-y: 0;
    min-height: 0 !important;
    line-height: 1.25 !important;
}
.coreinfo-cell :deep(.row > *),
.coreinfo-cell :deep(.grid > *),
.coreinfo-cell :deep(.dim-ro-row > *) {
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    line-height: 1.25 !important;
}
.coreinfo-cell :deep(.form-label),
.coreinfo-cell :deep(label),
.coreinfo-cell :deep(.dim-ro-label) {
    padding: 0 0 0 0.35rem !important;
    margin: 0 !important;
    line-height: 1.25 !important;
    text-align: start !important;
}
.coreinfo-cell :deep(.p-inputnumber),
.coreinfo-cell :deep(.p-inputnumber > input),
.coreinfo-cell :deep(.p-select),
.coreinfo-cell :deep(.p-inputtext),
.coreinfo-cell :deep(.dim-ro-input),
.coreinfo-cell :deep(.dim-ro-value),
.coreinfo-cell :deep(.dim-ro-unit) {
    padding: 0 !important;
    margin: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    line-height: 1.25 !important;
}

.coreinfo-simple {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

.coreinfo-dimmed {
    opacity: 0.35;
    transition: opacity 0.3s ease;
}
</style>