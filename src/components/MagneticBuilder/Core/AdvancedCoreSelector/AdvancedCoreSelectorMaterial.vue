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
        console.log('[AdvancedCoreSelectorMaterial] mounted, material type:', typeof(this.core.functionalDescription.material));
        console.log('[AdvancedCoreSelectorMaterial] material:', this.core.functionalDescription.material);
        if (typeof(this.core.functionalDescription.material) == "string") {
            console.log('[AdvancedCoreSelectorMaterial] calling loadMaterialData');
            this.loadMaterialData();
        }
        else {
            console.log('[AdvancedCoreSelectorMaterial] calling loadAdvancedMaterialData');
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
    },
    methods: {
        loadAdvancedMaterialData() {
            const material = this.core.functionalDescription.material;
            console.log('[AdvancedCoreSelectorMaterial] loadAdvancedMaterialData START');
            console.log('[AdvancedCoreSelectorMaterial] material.bhCycle:', material.bhCycle);
            console.log('[AdvancedCoreSelectorMaterial] material.volumetricLosses:', material.volumetricLosses);
            
            // Check if advanced data (bhCycle, volumetricLosses with actual data points) already exists
            // This handles custom materials and materials that already have their data loaded
            const hasBhCycleData = material.bhCycle != null && material.bhCycle.length > 0;
            console.log('[AdvancedCoreSelectorMaterial] hasBhCycleData:', hasBhCycleData);
            
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
                console.log('[AdvancedCoreSelectorMaterial] Data already present, returning early');
                // Data already present, just load complex permeability if missing
                if (material.permeability != null && material.permeability.complex == null) {
                    this.loadMaterialComplexPermeabilityData();
                }
                return;
            }

            // Use MKF WASM to load full material data (no backend required)
            console.log('[AdvancedCoreSelectorMaterial] Fetching via MKF WASM for material:', material.name);
            this.taskQueueStore.processCoreMaterial(material.name);
        },
        loadMaterialData() {
            this.taskQueueStore.processCoreMaterial(this.core.functionalDescription.material);
        },
        loadMaterialComplexPermeabilityData() {
            this.taskQueueStore.getComplexPermeability(this.core.functionalDescription.material).then((complexPermeability) => {
                this.core.functionalDescription.material.permeability.complex = complexPermeability;
            })
            .catch(error => {
                console.error(materialJson);
                return;
            });
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
            </div>
            <div class="col-12 md:col-4">
                <BhCyclePerTemperature
                    v-if="core.functionalDescription.material.bhCycle != null"
                    :dataTestLabel="dataTestLabel + '-BhCyclePerTemperature'"
                    :data="core.functionalDescription.material.bhCycle"
                />
                <LossFactorVersusFrequency
                    v-if="core.functionalDescription.material.volumetricLosses != null && isCoreLossesLossFactorBased"
                    :dataTestLabel="dataTestLabel + '-LossFactorVersusFrequency'"
                    :data="core.functionalDescription.material.volumetricLosses"
                />
                <VolumetricLossesPerTemperature
                    v-if="core.functionalDescription.material.volumetricLosses != null && !isCoreLossesEquationBased"
                    :dataTestLabel="dataTestLabel + '-VolumetricLossesPerTemperature'"
                    :data="core.functionalDescription.material.volumetricLosses"
                />
                <VolumetricLossesPerTemperatureEquationBased
                    v-if="core.functionalDescription.material.volumetricLosses != null && isCoreLossesEquationBased"
                    :dataTestLabel="dataTestLabel + '-VolumetricLossesPerTemperature'"
                    :data="core.functionalDescription.material.volumetricLosses"
                />
            </div>
        </div>
    </div>
</template>
