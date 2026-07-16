<script setup>
import InitialPermeabilityVersusTemperature from './AdvancedCoreSelectorMaterial/InitialPermeabilityVersusTemperature.vue'
import InitialPermeabilityVersusTemperatureEquationBased from './AdvancedCoreSelectorMaterial/InitialPermeabilityVersusTemperatureEquationBased.vue'
import InitialPermeabilityVersusFrequency from './AdvancedCoreSelectorMaterial/InitialPermeabilityVersusFrequency.vue'
import InitialPermeabilityVersusFrequencyEquationBased from './AdvancedCoreSelectorMaterial/InitialPermeabilityVersusFrequencyEquationBased.vue'
import InitialPermeabilityVersusMagneticFieldDcBias from './AdvancedCoreSelectorMaterial/InitialPermeabilityVersusMagneticFieldDcBias.vue'
import InitialPermeabilityVersusMagneticFieldDcBiasEquationBased from './AdvancedCoreSelectorMaterial/InitialPermeabilityVersusMagneticFieldDcBiasEquationBased.vue'
import ComplexPermeabilityVersusFrequency from './AdvancedCoreSelectorMaterial/ComplexPermeabilityVersusFrequency.vue'
import CoercivityVersusTemperature from './AdvancedCoreSelectorMaterial/CoercivityVersusTemperature.vue'
import RemanenceVersusTemperature from './AdvancedCoreSelectorMaterial/RemanenceVersusTemperature.vue'
import SaturationVersusTemperature from './AdvancedCoreSelectorMaterial/SaturationVersusTemperature.vue'
import ResistivityVersusTemperature from './AdvancedCoreSelectorMaterial/ResistivityVersusTemperature.vue'
import BhCyclePerTemperature from './AdvancedCoreSelectorMaterial/BhCyclePerTemperature.vue'
import VolumetricLossesPerTemperature from './AdvancedCoreSelectorMaterial/VolumetricLossesPerTemperature.vue'
import LossFactorVersusFrequency from './AdvancedCoreSelectorMaterial/LossFactorVersusFrequency.vue'
import VolumetricLossesPerTemperatureEquationBased from './AdvancedCoreSelectorMaterial/VolumetricLossesPerTemperatureEquationBased.vue'
import VolumetricLossesModelChart from './AdvancedCoreSelectorMaterial/VolumetricLossesModelChart.vue'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import Text from '/WebSharedComponents/DataInput/Text.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import DimensionWithTolerance from '/WebSharedComponents/DataInput/DimensionWithTolerance.vue'
import { MaterialType as MaterialEnum, MaterialComposition } from '/WebSharedComponents/assets/ts/MAS.ts'
import ContextMenu from '../../ContextMenu.vue'
import { useMagneticBuilderSettingsStore } from '../../../../stores/magneticBuilderSettings'
import { useTaskQueueStore } from '../../../../stores/taskQueue'
</script>

<script>

export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        core: {
            type: Object,
            required: true,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const magneticBuilderSettingsStore = useMagneticBuilderSettingsStore();
        const subscriptions = []
        return {
            taskQueueStore,
            magneticBuilderSettingsStore,
            subscriptions,
        }
    },
    watch: { 
    },
    created () {
    },
    mounted () {
        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "coreMaterialProcessed") {
                    if (args[0]) {
                        const coreMaterial = args[1];
                        this.core.functionalDescription.material = coreMaterial;
                        // Do not call loadAdvancedMaterialData() — that would re-trigger
                        // processCoreMaterial and loop. Just load complex permeability if needed.
                        if (coreMaterial.permeability != null && coreMaterial.permeability.complex == null) {
                            this.loadMaterialComplexPermeabilityData();
                        }
                    }
                    else {
                        console.error(args[1]);
                    }
                }
                if (name == "complexPermeabilityGotten") {
                    if (args[0]) {
                        const complexPermeability = args[1];
                        this.core.functionalDescription.material.permeability.complex = complexPermeability;
                    }
                    else {
                        console.error(args[1]);
                    }
                }
            });
        }))
        if (typeof(this.core.functionalDescription.material) == "string") {
            this.loadMaterialData();
        }
        else {
            this.loadAdvancedMaterialData();
        }
    },
    beforeUnmount () {
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    computed: {
        materialEnumInversed() {
            const materialEnumInversed = {};
            Object.keys(MaterialEnum).forEach((key) => {
                materialEnumInversed[MaterialEnum[key]] = key;  
            })
            return materialEnumInversed;
        },
        materialCompositionInversed() {
            const materialCompositionInversed = {};
            Object.keys(MaterialComposition).forEach((key) => {
                materialCompositionInversed[MaterialComposition[key]] = key;  
            })
            return materialCompositionInversed;
        },
        isInitialPermeabilityEquationBased() {
            if (this.core.functionalDescription.material.permeability == null) {
                return false
            }
            if (!Array.isArray(this.core.functionalDescription.material.permeability.initial)) {
                if (this.core.functionalDescription.material.permeability.initial.modifiers == null) {
                    return false;
                }
                if (this.core.functionalDescription.material.permeability.initial.modifiers.default == null) {
                    return false;
                }
                if (this.core.functionalDescription.material.permeability.initial.modifiers.default.method == null) {
                    return false;
                }

                return true;

            }
            else {
                return false;
            }
        },
        isCoreLossesEquationBased() {
            if (this.core.functionalDescription.material.volumetricLosses == null) {
                return false;
            }
            let isCoreLossesEquationBased = false; 
            this.core.functionalDescription.material.volumetricLosses.default.forEach((method) => {
                if (!Array.isArray(method)) {
                    if (method.method == "magnetics" || method.method == "micrometals") {
                        isCoreLossesEquationBased = true;
                    }
                }
            }) 
            return isCoreLossesEquationBased;
        },
        isCoreLossesLossFactorBased() {
            if (this.core.functionalDescription.material.volumetricLosses == null) {
                return false;
            }
            let isCoreLossesLossFactorBased = false;
            this.core.functionalDescription.material.volumetricLosses.default.forEach((method) => {
                if (!Array.isArray(method)) {
                    if (method.method == "lossFactor") {
                        isCoreLossesLossFactorBased = true;
                    }
                }
            })
            return isCoreLossesLossFactorBased;
        },
        hasMeasuredVolumetricLossesPoints() {
            const methods = this.core.functionalDescription.material.volumetricLosses?.default;
            if (methods == null) {
                return false;
            }
            return methods.some((method) => Array.isArray(method) && method.length > 0);
        },
        // ABT #166: steinmetz / roshen / other engine-side models have no
        // frontend-displayable representation — their curves must be sampled
        // from the engine.
        hasEngineOnlyLossModel() {
            const methods = this.core.functionalDescription.material.volumetricLosses?.default;
            if (methods == null) {
                return false;
            }
            return methods.some((method) => !Array.isArray(method)
                && !['magnetics', 'micrometals', 'lossFactor'].includes(method.method));
        },
    },
    methods: {
        loadAdvancedMaterialData() {
            const material = this.core.functionalDescription.material;

            // Check if advanced data (bhCycle, volumetricLosses with actual data points) already exists
            // This handles custom materials and materials that already have their data loaded
            const hasBhCycleData = material.bhCycle != null && material.bhCycle.length > 0;

            // volumetricLosses.default contains either:
            // 1. Arrays of data points (measured data) - these are displayable
            // 2. Method objects with Steinmetz coefficients (k, alpha, beta) - displayable via equation
            // 3. Method objects with other coefficients (roshen, etc.) - NOT displayable as charts
            // We need to check if there's actually displayable data (measured points or Steinmetz)
            let hasVolumetricLossesData = false;
            if (material.volumetricLosses != null && material.volumetricLosses.default != null) {
                material.volumetricLosses.default.forEach((method) => {
                    if (Array.isArray(method) && method.length > 0) {
                        // Has measured data points - displayable
                        hasVolumetricLossesData = true;
                    } else if (method != null && !Array.isArray(method)) {
                        // Check for Steinmetz/micrometals/magnetics equation coefficients
                        // These methods have 'a' coefficient for equation-based display
                        // Roshen method has 'coefficients' object but no 'a' - not displayable as chart
                        if (method.a != null || method.k != null) {
                            hasVolumetricLossesData = true;
                        }
                    }
                });
            }
            
            if (hasBhCycleData || hasVolumetricLossesData) {
                // Data already present, just load complex permeability if missing
                if (material.permeability != null && material.permeability.complex == null) {
                    this.loadMaterialComplexPermeabilityData();
                }
                return;
            }

            // Use MKF WASM to load full material data (no backend required)
            this.taskQueueStore.processCoreMaterial(material.name);
        },
        loadMaterialData() {
            this.taskQueueStore.processCoreMaterial(this.core.functionalDescription.material);
        },
        loadMaterialComplexPermeabilityData() {
            this.taskQueueStore.getComplexPermeability(this.core.functionalDescription.material).then((complexPermeability) => {
                this.core.functionalDescription.material.permeability.complex = complexPermeability;
            })
            .catch(() => {
                // Materials without complex-permeability data throw
                // MATERIAL_DATA_MISSING (already logged once by the global
                // task-queue error handler in main.js). The section renders
                // its "no data / Add data" card so the user can enter values.
            });
        },
        // "Add data" seeds: create one editable starter row so the property
        // editor renders for materials that lack the dataset entirely. The
        // zeros are a blank row for the user to fill, not physics defaults —
        // the record only persists if the user applies their edits.
        seedBhCycle() {
            this.core.functionalDescription.material.bhCycle = [
                { temperature: 25, magneticField: 0, magneticFluxDensity: 0 },
            ];
        },
        seedVolumetricLossesPoints() {
            if (this.core.functionalDescription.material.volumetricLosses == null) {
                this.core.functionalDescription.material.volumetricLosses = { default: [] };
            }
            this.core.functionalDescription.material.volumetricLosses.default.push([
                {
                    magneticFluxDensity: {
                        frequency: 100000,
                        magneticFluxDensity: { processed: { label: "Sinusoidal", offset: 0, peak: 0.1, peakToPeak: 0.2 } },
                    },
                    temperature: 25,
                    value: 0,
                    origin: "manufacturer",
                },
            ]);
        },
        seedComplexPermeability() {
            this.core.functionalDescription.material.permeability.complex = {
                real: [{ value: 0, frequency: 100000 }],
                imaginary: [{ value: 0, frequency: 100000 }],
            };
        },
    }
}
</script>

<template>
    <div class="container">
        <div class="row">
            <div class="col-12 container">
                <div class ="row">
                    <h2 
                        class="col-4 mb-3 text-center"
                        >
                        {{'Core Material Cust.'}}
                    </h2>
                    <div
                        v-if="magneticBuilderSettingsStore.enableContextMenu"
                        class="col-8 border mt-2" style="height: fit-content" :style="$styleStore.contextMenu.main">
                        <ContextMenu
                            v-if="magneticBuilderSettingsStore.enableContextMenu"
                            :dataTestLabel="dataTestLabel + '-ContextMenu'"
                        />
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-4">
                <div>
                    <Text
                        v-if="core.functionalDescription.material.name != null"
                        class="col-11 col-offset-1 mb-1 text-left"
                        :name="'name'"
                        v-model="core.functionalDescription.material"
                        :defaultValue="'Material name'"
                        :dataTestLabel="dataTestLabel + '-MaterialName'"
                        :canBeEmpty="false"
                        :labelWidthProportionClass="'col-12 md:col-6'"
                        :valueWidthProportionClass="'col-12 md:col-6'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <Text
                        v-if="core.functionalDescription.material.family != null"
                        class="col-11 col-offset-1 mb-1 text-left"
                        :name="'family'"
                        v-model="core.functionalDescription.material"
                        :defaultValue="'Material Family'"
                        :dataTestLabel="dataTestLabel + '-MaterialFamily'"
                        :canBeEmpty="false"
                        :labelWidthProportionClass="'col-12 md:col-6'"
                        :valueWidthProportionClass="'col-12 md:col-6'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <Text
                        v-if="core.functionalDescription.material.manufacturerInfo != null && core.functionalDescription.material.manufacturerInfo.name != null"
                        class="col-11 col-offset-1 mb-1 text-left"
                        :name="'name'"
                        :replaceTitle="'Manufacturer'"
                        v-model="core.functionalDescription.material.manufacturerInfo"
                        :defaultValue="'Manufacturer name'"
                        :dataTestLabel="dataTestLabel + '-MaterialName'"
                        :canBeEmpty="false"
                        :labelWidthProportionClass="'col-12 md:col-6'"
                        :valueWidthProportionClass="'col-12 md:col-6'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <Dimension
                        v-if="core.functionalDescription.material.curieTemperature != null"
                        :name="'curieTemperature'"
                        :unit="'°C'"
                        class="col-11 col-offset-1 ml-3 pl-1 mb-1 text-left"
                        :dataTestLabel="dataTestLabel + '-CurieTemperature'"
                        :justifyContent="true"
                        :allowNegative="true"
                        :allowZero="true"
                        :min="1"
                        :max="1000"
                        :modelValue="core.functionalDescription.material"
                        :labelWidthProportionClass="'col-12 md:col-6'"
                        :valueWidthProportionClass="'col-12 md:col-6'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <Dimension
                        v-if="core.functionalDescription.material.density != null"
                        :name="'density'"
                        :unit="'g/m³'"
                        class="col-11 col-offset-1 ml-3 pl-1 mb-1 text-left"
                        :dataTestLabel="dataTestLabel + '-Density'"
                        :justifyContent="true"
                        :allowNegative="true"
                        :allowZero="true"
                        :min="1"
                        :max="1000"
                        :modelValue="core.functionalDescription.material"
                        :labelWidthProportionClass="'col-12 md:col-6'"
                        :valueWidthProportionClass="'col-12 md:col-6'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <ElementFromList
                        v-if="core.functionalDescription.material.material != null"
                        class="col-10 col-offset-1 ml-3 pl-1 mb-1 text-left"
                        :dataTestLabel="dataTestLabel + '-Material'"
                        :name="'material'"
                        :titleSameRow="true"
                        :justifyContent="true"
                        v-model="core.functionalDescription.material"
                        :options="materialEnumInversed"
                        :labelWidthProportionClass="'col-12 md:col-5'"
                        :valueWidthProportionClass="'col-12 md:col-7'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <ElementFromList
                        v-if="core.functionalDescription.material.materialComposition != null"
                        class="col-10 col-offset-1 ml-3 pl-1 mb-1 text-left"
                        :dataTestLabel="dataTestLabel + '-MaterialComposition'"
                        :name="'materialComposition'"
                        :replaceTitle="'Material Comp.'"
                        :titleSameRow="true"
                        :justifyContent="true"
                        v-model="core.functionalDescription.material"
                        :options="materialCompositionInversed"
                        :labelWidthProportionClass="'col-12 md:col-5'"
                        :valueWidthProportionClass="'col-12 md:col-7'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <DimensionWithTolerance class="border-bottom py-2 pl-2"
                        v-if="core.functionalDescription.material.heatCapacity != null"
                        :name="'heatCapacity'"
                        unit="J/Kg/K"
                        :dataTestLabel="dataTestLabel + '-HeatCapacity'"
                        :defaultField="'nominal'"
                        :min="1"
                        :max="1000000"
                        v-model="core.functionalDescription.material.heatCapacity"
                        :severalRows="true"
                        :unitExtraStyleClass="'py-1 pl-1 mt-1'"
                        :addButtonStyle="$styleStore.magneticBuilder.requirementButton"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :titleFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <DimensionWithTolerance class="border-bottom py-2 pl-2"
                        v-if="core.functionalDescription.material.heatConductivity != null"
                        :name="'heatConductivity'"
                        unit="W/m/K"
                        :dataTestLabel="dataTestLabel + '-HeatConductivity'"
                        :defaultField="'nominal'"
                        :min="1"
                        :max="1000"
                        v-model="core.functionalDescription.material.heatConductivity"
                        :severalRows="true"
                        :unitExtraStyleClass="'py-1 pl-1 mt-1'"
                        :addButtonStyle="$styleStore.magneticBuilder.requirementButton"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :titleFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <div class="col-12">
                        <ResistivityVersusTemperature
                            v-if="core.functionalDescription.material.resistivity != null"
                            :dataTestLabel="dataTestLabel + '-ResistivityVersusTemperature'"
                            :data="core.functionalDescription.material.resistivity"
                        />
                    </div>
                    <div class="col-12">
                        <SaturationVersusTemperature
                            v-if="core.functionalDescription.material.saturation != null"
                            :dataTestLabel="dataTestLabel + '-SaturationVersusTemperature'"
                            :data="core.functionalDescription.material.saturation"
                        />
                    </div>
                    <div class="col-12">
                        <CoercivityVersusTemperature
                            v-if="core.functionalDescription.material.coercivity != null"
                            :dataTestLabel="dataTestLabel + '-CoercivityVersusTemperature'"
                            :data="core.functionalDescription.material.coercivity"
                        />
                    </div>
                    <div class="col-12">
                        <RemanenceVersusTemperature
                            v-if="core.functionalDescription.material.remanence != null"
                            :dataTestLabel="dataTestLabel + '-RemanenceVersusTemperature'"
                            :data="core.functionalDescription.material.remanence"
                        />
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-4">
                <InitialPermeabilityVersusTemperature
                    v-if="core.functionalDescription.material.permeability != null && !isInitialPermeabilityEquationBased"
                    :dataTestLabel="dataTestLabel + '-InitialPermeabilityVersusTemperature'"
                    :data="core.functionalDescription.material.permeability.initial"
                    :chartStyle="'height: 19vh'"
                />
                <InitialPermeabilityVersusTemperatureEquationBased
                    v-if="core.functionalDescription.material.permeability != null && isInitialPermeabilityEquationBased"
                    :dataTestLabel="dataTestLabel + '-InitialPermeabilityVersusTemperature'"
                    :data="core.functionalDescription.material.permeability.initial"
                    :chartStyle="'height: 19vh'"
                />
                <InitialPermeabilityVersusFrequency
                    v-if="core.functionalDescription.material.permeability != null && !isInitialPermeabilityEquationBased"
                    :dataTestLabel="dataTestLabel + '-InitialPermeabilityVersusFrequency'"
                    :data="core.functionalDescription.material.permeability.initial"
                    :chartStyle="'height: 19vh'"
                />
                <InitialPermeabilityVersusFrequencyEquationBased
                    v-if="core.functionalDescription.material.permeability != null && isInitialPermeabilityEquationBased"
                    :dataTestLabel="dataTestLabel + '-InitialPermeabilityVersusFrequency'"
                    :data="core.functionalDescription.material.permeability.initial"
                    :chartStyle="'height: 19vh'"
                />
                <InitialPermeabilityVersusMagneticFieldDcBias
                    v-if="core.functionalDescription.material.permeability != null && !isInitialPermeabilityEquationBased"
                    :dataTestLabel="dataTestLabel + '-InitialPermeabilityVersusMagneticFieldDcBias'"
                    :data="core.functionalDescription.material.permeability.initial"
                    :chartStyle="'height: 19vh'"
                />
                <InitialPermeabilityVersusMagneticFieldDcBiasEquationBased
                    v-if="core.functionalDescription.material.permeability != null && isInitialPermeabilityEquationBased"
                    :dataTestLabel="dataTestLabel + '-InitialPermeabilityVersusMagneticFieldDcBias'"
                    :data="core.functionalDescription.material.permeability.initial"
                    :chartStyle="'height: 19vh'"
                />
                <ComplexPermeabilityVersusFrequency
                    v-if="core.functionalDescription.material.permeability != null && core.functionalDescription.material.permeability.complex != null"
                    :dataTestLabel="dataTestLabel + '-ComplexPermeabilityVersusFrequency'"
                    :data="core.functionalDescription.material.permeability.complex"
                    :chartStyle="'height: 19vh'"
                />
                <div v-else-if="core.functionalDescription.material.permeability != null" class="missing-data-card">
                    <span>{{'No complex permeability data in this material'}}</span>
                    <button
                        :data-cy="dataTestLabel + '-seed-complex-permeability-button'"
                        :style="$styleStore.magneticBuilder.addButton"
                        class="btn"
                        @click="seedComplexPermeability"
                    >
                        {{'Add data'}}
                    </button>
                </div>
            </div>
            <div class="col-12 md:col-4">
                <BhCyclePerTemperature
                    v-if="core.functionalDescription.material.bhCycle != null && core.functionalDescription.material.bhCycle.length > 0"
                    :dataTestLabel="dataTestLabel + '-BhCyclePerTemperature'"
                    :data="core.functionalDescription.material.bhCycle"
                />
                <div v-else class="missing-data-card">
                    <span>{{'No B-H cycle data in this material'}}</span>
                    <button
                        :data-cy="dataTestLabel + '-seed-bh-cycle-button'"
                        :style="$styleStore.magneticBuilder.addButton"
                        class="btn"
                        @click="seedBhCycle"
                    >
                        {{'Add data'}}
                    </button>
                </div>
                <LossFactorVersusFrequency
                    v-if="core.functionalDescription.material.volumetricLosses != null && isCoreLossesLossFactorBased"
                    :dataTestLabel="dataTestLabel + '-LossFactorVersusFrequency'"
                    :data="core.functionalDescription.material.volumetricLosses"
                />
                <VolumetricLossesPerTemperature
                    v-if="hasMeasuredVolumetricLossesPoints"
                    :dataTestLabel="dataTestLabel + '-VolumetricLossesPerTemperature'"
                    :data="core.functionalDescription.material.volumetricLosses"
                />
                <div v-else class="missing-data-card">
                    <span>{{'No measured loss points in this material'}}</span>
                    <button
                        :data-cy="dataTestLabel + '-seed-loss-points-button'"
                        :style="$styleStore.magneticBuilder.addButton"
                        class="btn"
                        @click="seedVolumetricLossesPoints"
                    >
                        {{'Add data'}}
                    </button>
                </div>
                <VolumetricLossesPerTemperatureEquationBased
                    v-if="core.functionalDescription.material.volumetricLosses != null && isCoreLossesEquationBased"
                    :dataTestLabel="dataTestLabel + '-VolumetricLossesPerTemperature'"
                    :data="core.functionalDescription.material.volumetricLosses"
                />
                <VolumetricLossesModelChart
                    v-if="hasEngineOnlyLossModel"
                    :dataTestLabel="dataTestLabel + '-VolumetricLossesModelChart'"
                    :material="core.functionalDescription.material"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Placeholder card shown when the material lacks a dataset (B-H cycle,
   measured loss points, complex permeability): keeps the section visible and
   editable instead of silently disappearing. */
.missing-data-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border: 1px dashed rgba(var(--p-white-rgb), 0.25);
    border-radius: 8px;
    padding: 0.6rem 0.9rem;
    margin: 0.5rem 0;
    color: rgba(var(--p-white-rgb), 0.6);
    font-size: 0.9rem;
}
</style>
