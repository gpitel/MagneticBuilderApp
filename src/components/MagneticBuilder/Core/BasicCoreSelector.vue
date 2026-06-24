<script setup>
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import CoreGappingSelector from '/WebSharedComponents/Common/CoreGappingSelector.vue'
import Magnetic3DVisualizer from '/WebSharedComponents/Common/Magnetic3DVisualizer.vue'
import BasicCoreSubmenu from './BasicCoreSubmenu.vue'
import { coreAdviserWeights, defaultUngappedGapping } from '/WebSharedComponents/assets/js/defaults.js'
import CoreInfo from './CoreInfo.vue'
import CoreShapeSelector from './CoreShapeSelector.vue'
import { useHistoryStore } from '../../../stores/history'
import { useTaskQueueStore } from '../../../stores/taskQueue'

import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
</script>

<script>

export default {
    emits: ['customizeCore', 'gappingUpdated', 'coreProcessed', 'coreProcessingStarted'],
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
        enableAdvise: {
            type: Boolean,
            default: true,
        },
        enableCustomize: {
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
        forceUpdateVisualizer: {
            type: Number,
            default: 0,
        },
        imageUpToDate: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const historyStore = useHistoryStore();
        const coreMaterialManufacturers = [];
        const coreMaterialNames = {};
        const localData = {};
        const onlyManufacturer = null;

        if (this.masStore.coreAdviserWeights == null) {
            this.masStore.coreAdviserWeights = coreAdviserWeights;
        }

        const errorMessage = "";
        const loading = false;
        const forceUpdate = 0;
        const subscriptions = [];
        const pendingBobbinThickness = null; // Store bobbin thickness during material change
        const cachedMagnetic = deepCopy(this.masStore.mas.magnetic); // Cache magnetic data for 3D visualizer

        return {
            taskQueueStore,
            historyStore,
            localData,
            onlyManufacturer,
            coreMaterialManufacturers,
            coreMaterialNames,
            errorMessage,
            loading,
            forceUpdate,
            subscriptions,
            pendingBobbinThickness,
            cachedMagnetic,
            changeMadeByUser: false,
            updatingLocalData: false,
            _mountTimer: null,
        }
    },
    computed: {
        isCoreIncomplete() {
            // Returns true while shape OR material is missing — used to highlight
            // the "Advise" button in danger color so the user knows it's the
            // shortcut to get a starting selection.
            const fd = this.masStore?.mas?.magnetic?.core?.functionalDescription;
            if (fd == null) return true;
            const shape = fd.shape;
            const shapeMissing = shape == null
                || (typeof shape === 'string' && shape === '')
                || (typeof shape === 'object' && (shape.name == null || shape.name === ''));
            const material = fd.material;
            const materialMissing = material == null
                || (typeof material === 'string' && material === '')
                || (typeof material === 'object' && (material.name == null || material.name === ''));
            return shapeMissing || materialMissing;
        },
        magneticForVisualizer() {
            // Force re-evaluation when visualizer update is triggered
            const forceUpdate = this.forceUpdateVisualizer;
            // Only update magnetic data for visualizer when not blocked
            if (this.taskQueueStore.windingIndexChangeBlock) {
                return this.cachedMagnetic;
            }
            // Update cache when not blocked (deep copy to prevent reference issues)
            this.cachedMagnetic = deepCopy(this.masStore.mas.magnetic);
            return this.cachedMagnetic;
        },
    },
    watch: {
        // NOTE: previously watched `operatingPointIndex` and called
        // `processCore` here. That was wrong: operating point has no
        // effect on core geometry (shape / gapping / material), so the
        // only thing the call did was null-then-rewrite
        // `mas.magnetic.core.{geometrical,processed}Description`, which
        // tripped the deep watcher in Magnetic3DVisualizer and forced an
        // unnecessary 3D STL rebuild on every operating-point change.
        // Loss / temperature calculations that DO depend on the operating
        // point are handled by `simulate`, not `processCore`.
    },
    created () {
    },
    mounted () {
        this.getMaterialNames();

        this._mountTimer = setTimeout(() => {
            this._mountTimer = null;
            this.assignLocalData(this.masStore.mas.magnetic.core);
        }, 1000);
        this.subscriptions.push(this.historyStore.$onAction((action) => {
            if (action.name == "historyPointerUpdated") {
                this.assignLocalData(this.masStore.mas.magnetic.core);
            }
        }));
        this.subscriptions.push(this.masStore.$onAction((action) => {
            if (action.name == "importedMas") {
                this.assignLocalData(this.masStore.mas.magnetic.core);
            }
        }));

        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "coreProcessed") {
                    if (args[0]) {
                        const core = args[1];
                        // Don't run the bobbin-regenerate-and-clear branch during import:
                        // loadingDesign means a file was just loaded and the imported coil
                        // (layers/turns/sections/bobbin) must be preserved as-is.
                        if (this.changeMadeByUser && !this.$stateStore.loadingDesign) {
                            this.masStore.mas.magnetic.core = core;
                            this.changeMadeByUser = false;
                            this.masStore.mas.magnetic.manufacturerInfo = null;
                            const currentBobbin = this.masStore.mas.magnetic.coil.bobbin;
                            // Use custom thickness if available, otherwise use default
                            const hasCustomThickness = this.pendingBobbinThickness &&
                                (this.pendingBobbinThickness.wallThickness !== undefined || this.pendingBobbinThickness.columnThickness !== undefined);

                            // Signal that bobbin will be regenerated — prevents
                            // BasicCoilSelector from starting a premature wind() on
                            // coreProcessed with the old bobbin.
                            this.taskQueueStore.bobbinRegenerationPending = true;

                            const generateBobbinPromise = hasCustomThickness
                                ? this.taskQueueStore.generateBobbinDifferentThicknesses(
                                    core,
                                    this.pendingBobbinThickness.wallThickness,
                                    this.pendingBobbinThickness.columnThickness
                                  )
                                : this.taskQueueStore.generateBobbinFromCoreShape(core, this.masStore.mas.inputs.designRequirements.wiringTechnology);

                            generateBobbinPromise.then((bobbin) => {
                                // Only update if bobbin actually changed
                                if (JSON.stringify(currentBobbin) !== JSON.stringify(bobbin)) {
                                    this.masStore.mas.magnetic.coil.bobbin = bobbin;
                                    this.pendingBobbinThickness = null;
                                    // Clear coil data since bobbin changed
                                    this.masStore.mas.magnetic.coil.turnsDescription = null;
                                    this.masStore.mas.magnetic.coil.layersDescription = null;
                                    this.masStore.mas.magnetic.coil.sectionsDescription = null;
                                }
                                // Note: BasicCoilSelector listens for bobbinFromCoreShapeGenerated
                                // and will automatically trigger rewinding
                            });
                        }
                        else {
                        }
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "masCheckedAndFixed") {
                    if (args[0]) {
                        const mas = args[1];
                        if (this.masStore.mas == null) {
                            this.taskQueueStore.processCore(mas.magnetic.core);
                        }
                        else {
                            const coreHash = JSON.stringify(this.masStore.mas.magnetic.core);

                            if (coreHash != JSON.stringify(mas.magnetic.core)) {
                                this.taskQueueStore.processCore(mas.magnetic.core);
                            }
                            else if (this.changeMadeByUser && !this.$stateStore.loadingDesign) {
                                // Core hash is the same but user changed shape - still need to regenerate bobbin
                                this.masStore.mas.magnetic.core = mas.magnetic.core;
                                this.changeMadeByUser = false;
                                // Only generate bobbin if material is set (backend requires it)
                                if (mas.magnetic.core.functionalDescription?.material) {
                                    this.taskQueueStore.bobbinRegenerationPending = true;
                                    const currentBobbin = this.masStore.mas.magnetic.coil.bobbin;
                                    this.taskQueueStore.generateBobbinFromCoreShape(
                                        mas.magnetic.core,
                                        this.masStore.mas.inputs.designRequirements.wiringTechnology
                                    ).then((bobbin) => {
                                        // Only update if bobbin actually changed
                                        if (JSON.stringify(currentBobbin) !== JSON.stringify(bobbin)) {
                                            this.masStore.mas.magnetic.coil.bobbin = bobbin;
                                            // Clear coil data since bobbin changed
                                            this.masStore.mas.magnetic.coil.turnsDescription = null;
                                            this.masStore.mas.magnetic.coil.layersDescription = null;
                                            this.masStore.mas.magnetic.coil.sectionsDescription = null;
                                        }
                                    });
                                }
                            }
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
        if (this._mountTimer) clearTimeout(this._mountTimer);
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        isStackable(shape) {
            // Accept an explicit shape so callers in mid-transition (shape just
            // swapped in a local mas copy but not yet committed to the store)
            // can ask about the *new* shape; otherwise default to the store.
            let shapeData = shape ?? this.masStore.mas.magnetic.core.functionalDescription.shape;
            if (shapeData == null) return false;
            let shapeFamily = (typeof shapeData === 'string' || shapeData instanceof String)
                ? shapeData
                : shapeData.family;
            if (shapeFamily == null) return false;

            if (shapeFamily == "e" || shapeFamily == "planarE" || shapeFamily == "t" || shapeFamily == "u") {
                return true;
            }
            else {
                return false;
            }
        },
        assignLocalData(core) {
            if (typeof(core.functionalDescription.shape) == 'string') {
                if (core.functionalDescription.shape != "") {
                    this.localData["shape"] = deepCopy(core.functionalDescription.shape);
                    this.taskQueueStore.processCoreShape(core.functionalDescription.shape).then((coreShape) => {
                        this.localData["shapeFamily"] = coreShape.family;  
                    })
                    .catch(error => {
                        console.error(error);
                    });
                }
            }
            else {
                this.localData["shape"] = deepCopy(core.functionalDescription.shape.name);
                this.localData["shapeFamily"] = deepCopy(core.functionalDescription.shape.family);
            }

            if (typeof(core.functionalDescription.material) == 'string') {
                if (core.functionalDescription.material != "") {
                    this.localData["material"] = deepCopy(core.functionalDescription.material);
                    this.taskQueueStore.processCoreMaterial(core.functionalDescription.material).then((coreMaterial) => {
                        this.localData["materialManufacturer"] = coreMaterial.manufacturerInfo.name;
                    })
                    .catch(error => {
                        console.error(error);
                    });
                }
            }
            else {
                this.localData["material"] = deepCopy(core.functionalDescription.material.name);
                this.localData["materialManufacturer"] = core.functionalDescription.material.manufacturerInfo.name;
            }

            if (core.functionalDescription.shape != "" && core.functionalDescription.material != "") {
                if (core.processedDescription) {
                    // Core already processed (e.g. loaded from file or undo/redo) — read directly
                    // to avoid triggering processCore → forceUpdate → numberStacksUpdated cascade.
                    this.localData["numberStacks"] = deepCopy(core.functionalDescription.numberStacks);
                    this.localData["gapping"] = deepCopy(core.functionalDescription.gapping);
                    this.updatingLocalData = true;
                    this.forceUpdate += 1;
                    this.$nextTick(() => { this.updatingLocalData = false; });
                } else {
                    this.taskQueueStore.processCore(core).then((core) => {
                        this.localData["numberStacks"] = deepCopy(core.functionalDescription.numberStacks);
                        this.localData["gapping"] = deepCopy(core.functionalDescription.gapping);
                        this.updatingLocalData = true;
                        this.forceUpdate += 1;
                        this.$nextTick(() => { this.updatingLocalData = false; });
                    })
                    .catch(error => {
                        console.error(error);
                    });
                }
            }
        },
        getMaterialNames() {
            this.taskQueueStore.getCoreMaterials(this.onlyManufacturer).then((coreMaterialNames) => {
                this.coreMaterialNames = coreMaterialNames;
                this.coreMaterialManufacturers = Object.keys(coreMaterialNames);
            })
            .catch(error => {
                console.error(error);
            });
        },
        async coreShapeUpdated(name, family) {
            this.localData.shapeFamily = family;
            this.localData.shape = name;
            this.shapeUpdated(name);
        },
        async shapeUpdated(value) {
            if (value.startsWith("Custom")) {
                const mas = deepCopy(this.masStore.mas);
                this.taskQueueStore.checkAndFixMas(mas);
            }
            else {
                this.masStore.mas.magnetic.core.name = "Custom";
                this.changeMadeByUser = true;
                this.taskQueueStore.processCoreShape(value).then((shape) => {
                    if (this.localData.material == null) {
                        this.masStore.mas.magnetic.core.functionalDescription.shape = shape;
                        // Cannot generate bobbin without material - backend requires it
                    }
                    else {
                        const mas = deepCopy(this.masStore.mas);
                        mas.magnetic.core.functionalDescription.shape = shape;

                        if (!this.isStackable(shape)) {
                            mas.magnetic.core.functionalDescription.numberStacks = 1;
                        }

                        this.taskQueueStore.checkAndFixMas(mas);
                    }
                })
                .catch(error => {
                    console.error(error);
                });
            }
        },
        materialUpdated(value) {
            this.changeMadeByUser = true;
            
            // Save current bobbin wall and column thickness before material change
            const currentBobbin = this.masStore.mas.magnetic.coil.bobbin;
            this.pendingBobbinThickness = {
                wallThickness: currentBobbin?.processedDescription?.wallThickness,
                columnThickness: currentBobbin?.processedDescription?.columnThickness
            };
            
            this.taskQueueStore.changeCoreMaterial(value, deepCopy(this.masStore.mas.magnetic.core)).then((core) => {
                // Ensure default gapping is set so core losses can be calculated
                if (!core.functionalDescription.gapping || (core.functionalDescription.type == 'twoPieceSet' && core.functionalDescription.gapping.length === 0)) {
                    core.functionalDescription.gapping = deepCopy(defaultUngappedGapping);
                }
                this.masStore.mas.magnetic.core = core;

                this.taskQueueStore.processCore(this.masStore.mas.magnetic.core).then((core) => {
                    this.localData["numberStacks"] = deepCopy(core.functionalDescription.numberStacks);
                    this.localData["gapping"] = deepCopy(core.functionalDescription.gapping);
                    this.updatingLocalData = true;
                    this.forceUpdate += 1;
                    this.$nextTick(() => { this.updatingLocalData = false; });
                    // Note: Bobbin thickness will be restored in coreProcessed handler after bobbin regeneration
                })
                .catch(error => {
                    console.error(error);
                });
                
                // Ensure coil has at least one turn so core losses can be calculated
                const coil = this.masStore.mas.magnetic.coil;
                const hasValidCoil = coil?.functionalDescription?.some(w => w.numberTurns > 0);
                if (!hasValidCoil && coil?.functionalDescription?.length > 0) {
                    coil.functionalDescription[0].numberTurns = 1;
                }
            }) 
        },
        numberStacksUpdated(value) {
            if (this.updatingLocalData) return;
            this.changeMadeByUser = true;
            this.masStore.mas.magnetic.core.functionalDescription.numberStacks = value;
            // Set image as outdated immediately
            this.$emit('coreProcessingStarted');
            this.taskQueueStore.processCore(this.masStore.mas.magnetic.core).then((core) => {
                this.masStore.mas.magnetic.core = core;
                // Don't addToHistory here — the subsequent wind() completion
                // will addToHistory with the fully wound coil state.
                this.$emit('coreProcessed');
            })
            .catch(error => {
                console.error(error);
            });
        },
        gappingUpdated(value) {
            this.masStore.mas.magnetic.core.functionalDescription.gapping = value;
            this.$emit('gappingUpdated');
            // Set image as outdated immediately
            this.$emit('coreProcessingStarted');
            this.taskQueueStore.processCore(this.masStore.mas.magnetic.core).then((core) => {
                this.masStore.mas.magnetic.core = core;
                // Don't addToHistory here — the subsequent wind() completion
                // will addToHistory with the fully wound coil state.
                this.$emit('coreProcessed');
            })
            .catch(error => {
                console.error(error);
            });
        },
        adviseCoreRequested() {
            this.loading = true;
            setTimeout(() => this.adviseCore(), 100);
        },
        adviseCore() {
            if (this.masStore.mas.inputs.operatingPoints.length > 0) {
                this.$settingsStore.adviserSettings.coreAdviseMode = "standard cores";

                // Use magneticBuilderSettings (where the UI toggles write)
                // instead of adviserSettings (which is never updated by the UI)
                const settings = {
                    ...this.$settingsStore.adviserSettings,
                    allowToroidalCores: this.$settingsStore.magneticBuilderSettings.allowToroidalCores,
                    allowDistributedGaps: this.$settingsStore.magneticBuilderSettings.allowDistributedGaps,
                    allowStacks: this.$settingsStore.magneticBuilderSettings.allowStacks,
                    useOnlyCoresInStock: this.$settingsStore.magneticBuilderSettings.useOnlyCoresInStock,
                };

                this.taskQueueStore.adviseCore(this.masStore.mas.inputs, this.masStore.coreAdviserWeights, settings).then(async (magnetic) => {
                    this.masStore.mas.magnetic.core = magnetic.core;
                    
                    // Generate bobbin first
                    const bobbin = await this.taskQueueStore.generateBobbinFromCoreShape(magnetic.core, this.masStore.mas.inputs.designRequirements.wiringTechnology);
                    
                    // Then calculate turns
                    const numberTurns = await this.taskQueueStore.calculateNumberTurns(magnetic.coil.functionalDescription[0].numberTurns, this.masStore.mas.inputs.designRequirements);
                    
                    // Update windings with calculated turns
                    const windings = this.masStore.mas.magnetic.coil.functionalDescription;
                    for (let i = 0; i < numberTurns.length; i++) {
                        windings[i].numberTurns = numberTurns[i];
                    }
                    
                    // Assign everything atomically: first coil data, then bobbin last
                    this.masStore.mas.magnetic.coil.turnsDescription = null;
                    this.masStore.mas.magnetic.coil.layersDescription = null;
                    this.masStore.mas.magnetic.coil.sectionsDescription = null;
                    this.masStore.mas.magnetic.coil.functionalDescription = windings;
                    this.masStore.mas.magnetic.coil.bobbin = bobbin;
                    
                    setTimeout(() => {this.historyStore.addToHistory(this.masStore.mas);}, 1000);

                    this.errorMessage = "";
                    this.assignLocalData(magnetic.core);
                    this.loading = false;
                    this.$emit('coreProcessed', true, magnetic.core);
                })
                .catch(error => {
                    this.errorMessage = "No core can be advised. You are on your own."
                    this.loading = false;
                    this.$emit('coreProcessed', false, error);
                    setTimeout(() => {this.errorMessage = ""}, 10000);
                });
            }
            else {
                this.loading = false;
            }
        },
        loadCore() {
        },
    }
}
</script>

<template>
    <div class="container">
        <div
            class="core-config-panel"
            :style="{ '--core-config-value-font-size': $styleStore.magneticBuilder.inputFontSize?.['font-size'] ?? $styleStore.magneticBuilder.inputFontSize?.fontSize }"
        >
            <div class="core-config-header">
                <div class="core-config-header-left">
                    <i class="pi pi-box"></i>
                    <span>Core Configuration</span>
                </div>
                <div v-if="enableAdvise && enableSubmenu && !readOnly" class="core-config-header-right">
                    <button
                        type="button"
                        :disabled="loading"
                        :data-cy="dataTestLabel + '-Core-Advise-button'"
                        :class="['core-config-header-btn', 'core-config-header-btn-primary', { 'core-config-header-btn-needs-attention': isCoreIncomplete }]"
                        v-tooltip="isCoreIncomplete ? 'Core not fully configured — click to get a recommended starting core' : 'Get a recommended core for these requirements'"
                        @click="adviseCoreRequested"
                    >
                        <i class="pi pi-sparkles"></i>
                        <span>Advise</span>
                    </button>
                </div>
            </div>
            <div class="core-config-body">
                <div
                    v-if="useVisualizers && masStore.mas.magnetic.core.functionalDescription != null"
                    class="row mb-2"
                    style="height: 25vh"
                    :style="imageUpToDate? 'opacity: 100%;' : 'opacity: 20%;'"
                >
                    <Magnetic3DVisualizer 
                        :dataTestLabel="`${dataTestLabel}-Magnetic3DVisualizer`"
                        :magnetic="magneticForVisualizer"
                        :forceUpdate="forceUpdateVisualizer"
                        :showCore="true"
                        :showTurns="true"
                        :showBobbin="true"
                        :buttonColor="$styleStore.magneticBuilder.visualizerButtonColor?.color || 'var(--p-white)'"
                        :loadingGif="$settingsStore.loadingGif"
                        :backgroundColor="$styleStore.magneticBuilder.main['background-color'] || $styleStore.magneticBuilder.main['background'] || 'var(--p-dark)'"
                    />
                </div>
                <img :data-cy="dataTestLabel + '-BasicCoreSelector-loading'" v-if="loading" class="mx-auto d-block" alt="loading" style="width: 60%; max-width: 100%; height: auto;" :src="$settingsStore.loadingGif">
                <div class="core-config-grid">
                    <div class="core-config-cell core-config-cell-wide">
                        <CoreShapeSelector
                            :dataTestLabel="dataTestLabel + '-AdvancedCoreInfo'"
                            :readOnly="readOnly"
                            :masStore="masStore"
                            @update="coreShapeUpdated"
                        />
                    </div>
                    <div v-if="localData.shape != '' && localData.shapeFamily != null && !loading" class="core-config-cell core-config-cell-wide">
                        <ElementFromList
                            v-tooltip="tooltipsMagneticBuilder.coreMaterialManufacturer"
                            :disabled="readOnly"
                            class="text-left"
                            :dataTestLabel="dataTestLabel + '-MaterialManufacturers'"
                            :name="'materialManufacturer'"
                            :replaceTitle="'Manufacturer'"
                            :titleSameRow="true"
                            :justifyContent="true"
                            v-model="localData"
                            :options="coreMaterialManufacturers"
                            :labelWidthProportionClass="'col-12 md:col-5'"
                            :valueWidthProportionClass="'col-12 md:col-7'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>

                    <div v-if="localData.shape != '' && !loading && localData.materialManufacturer != null && coreMaterialNames[localData.materialManufacturer] != null && coreMaterialNames[localData.materialManufacturer].length > 0" class="core-config-cell core-config-cell-wide">
                        <ElementFromList
                            v-tooltip="tooltipsMagneticBuilder.coreMaterial"
                            :disabled="readOnly"
                            class="text-left"
                            :dataTestLabel="dataTestLabel + '-MaterialNames'"
                            :name="'material'"
                            :titleSameRow="true"
                            :justifyContent="true"
                            v-model="localData"
                            :optionsToDisable="coreMaterialManufacturers"
                            :options="coreMaterialNames[localData.materialManufacturer]"
                            @update="materialUpdated"
                            :labelWidthProportionClass="'col-12 md:col-5'"
                            :valueWidthProportionClass="'col-12 md:col-7'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <h5 v-if="localData.shape == '' && !loading" class="text-danger my-2 col-12">Select a family and a shape for the core</h5>

                    <div v-if="isStackable() && localData.shape != '' && !loading" class="core-config-cell core-config-cell-wide">
                        <Dimension class="text-left"
                            v-tooltip="tooltipsMagneticBuilder.coreNumberStacks"
                            :disabled="readOnly"
                            :name="'numberStacks'"
                            :replaceTitle="'Number of Stacks'"
                            :unit="null"
                            :forceUpdate="forceUpdate"
                            :dataTestLabel="dataTestLabel + '-NumberStacks'"
                            :min="1"
                            :justifyContent="true"
                            :defaultValue="1"
                            :allowNegative="false"
                            :modelValue="localData"
                            @update="numberStacksUpdated"
                            :labelWidthProportionClass="'col-12 md:col-5'"
                            :valueWidthProportionClass="'col-12 md:col-7'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div v-if="localData.shape != '' && localData.shapeFamily != null && localData.shape != null && !loading && masStore.mas.magnetic.core.functionalDescription.type == 'twoPieceSet' && masStore.mas.magnetic.core.processedDescription != null" class="core-config-cell core-config-cell-wide core-config-gap-cell">
                        <CoreGappingSelector class="text-left"
                            :disabled="readOnly"
                            :title="'Gap Info: '"
                            :dataTestLabel="dataTestLabel + '-Gap'"
                            :forceUpdate="forceUpdate"
                            :autoupdate="false"
                            :core="masStore.mas.magnetic.core"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="gappingUpdated"
                        />
                    </div>
                </div>

                <CoreInfo 
                    v-if="!loading && enableSimulation"
                    ref="coreInfo"
                    :dataTestLabel="dataTestLabel + '-CoreInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                />

                <BasicCoreSubmenu 
                    v-if="enableSubmenu && !readOnly"
                    class="col-12 mb-1 text-left"
                    :dataTestLabel="dataTestLabel + '-BasicCoreSubmenu'"
                    :masStore="masStore"
                    :enableCustomize="enableCustomize"
                    @customizeCore="$emit('customizeCore')"
                    @loadCore="loadCore"
                />
                <label class="text-danger col-12 pt-1" style="font-size: 0.7em">{{errorMessage}}</label>
            </div>
        </div>
    </div>
</template>

<style scoped>
.core-config-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.06) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 14px;
    padding: 0;
    margin: 0.15rem 0 0.25rem 0;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.12), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    overflow: hidden;
}

.core-config-header {
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

.core-config-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.core-config-header-left i {
    font-size: 0.95rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.core-config-header-right {
    display: flex;
    align-items: center;
    gap: 0.35rem;
}

.core-config-header-btn {
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

.core-config-header-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.core-config-header-btn:not(:disabled):hover {
    filter: brightness(1.12);
    transform: translateY(-1px);
}

.core-config-header-btn-primary {
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

/* Highlight the Advise button in danger color while the core is incomplete,
   so the user is reminded they can use it to get a starting selection. */
.core-config-header-btn.core-config-header-btn-needs-attention {
    color: var(--p-danger) !important;
    border-color: rgb(var(--p-danger-rgb) / 0.6) !important;
    text-shadow: 0 1px 1px rgba(var(--p-black-rgb), 0.35);
    box-shadow:
        0 0 0 1px rgb(var(--p-danger-rgb) / 0.4),
        0 2px 10px rgb(var(--p-danger-rgb) / 0.4),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
    animation: core-advise-pulse 1.8s ease-in-out infinite;
}

.core-config-header-btn.core-config-header-btn-needs-attention i {
    color: var(--p-danger);
}

@keyframes core-advise-pulse {
    0%, 100% {
        filter: brightness(1);
    }
    50% {
        filter: brightness(1.18);
    }
}

.core-config-body {
    padding: 0.5rem 0.6rem;
}

.core-config-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.15rem;
    background: var(--p-dark);
    border-radius: 10px;
    padding: 0.35rem;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
}

.core-config-cell {
    border-radius: 10px;
    padding: 0.1rem 0.35rem;
    box-sizing: border-box;
    min-width: 0;
    overflow: hidden;
}

.core-config-cell-wide {
    grid-column: 1 / -1;
}

.core-config-gap-cell {
    margin-bottom: 0;
}

/* Shape Family / Shape value columns fill to the cell's right edge (the
 * Shape Family dropdown's right edge then matches Manufacturer / Material;
 * the Shape row's table button is pinned to that same right edge above). */
.core-config-cell :deep(.row.g-0) > [class*="col-"] {
    padding-right: 0 !important;
}

/* Core Shape row: dropdown + table-icon button act as ONE element
 * aligned left and right with the Shape Family dropdown above.
 * - Dropdown's left edge = Shape Family dropdown's left edge (via the
 *   inner ElementFromList's col-5 label + col-7 select split)
 * - Button right edge = Shape Family dropdown's right edge (the button
 *   is pinned with `right: 12px` to compensate for the row gutter that
 *   insets the other selects from the cell's right edge)
 * - Dropdown is shrunk by 3rem so it doesn't overlap the 28px button
 *   and there's a visible gap between them. */
.core-config-cell :deep(.core-shape-input-group) {
    position: relative !important;
    display: block;
}
/* Reserve room on the right for the table button (the p-select fills the rest
 * via flex:1, so constrain the row, not the select). */
.core-config-cell :deep(.core-shape-input-group .core-shape-row) {
    width: 100%;
    padding-right: 2.25rem;
    box-sizing: border-box;
}
.core-config-cell :deep(.core-shape-input-group .core-shape-row .p-select) {
    width: 100% !important;
    max-width: 100% !important;
    margin-right: 0 !important;
}
/* Shape Family fills the whole value column so its right edge lines up with the
 * Manufacturer / Material dropdowns. */
.core-config-cell :deep(.efl-container.mb-1 .p-select) {
    width: 100% !important;
    max-width: 100% !important;
    margin-right: 0 !important;
}
/* Table button pinned to the right edge — aligns with the Manufacturer /
 * Material dropdowns' right edge. */
.core-config-cell :deep(.core-shape-table-btn-wrapper) {
    position: absolute !important;
    right: 0 !important;
    top: 50%;
    transform: translateY(-50%) !important;
}

/* Align all labels (Shape Family / Shape / Manufacturer / Material /
 * Number of Stacks / Gap Info / Type / Length) to the SAME left x.
 * Cause of the misalignment: the .row has a default
 * margin-left:-0.75rem and PrimeFlex's .col-12 adds its own
 * padding-left, so the rows inside CoreShapeSelector / CoreGappingSelector
 * end up offset from cells that don't use a .row wrapper. Zero both. */
.core-config-cell :deep(.row),
.core-config-gap-cell :deep(.row) {
    margin-left: 0 !important;
    margin-right: 0 !important;
}
.core-config-cell :deep(.row) > [class*="col-"],
.core-config-gap-cell :deep(.row) > [class*="col-"] {
    padding-left: 0 !important;
}
/* Nested .efl-container.col-12 (e.g. inside CoreShapeSelector's
 * .core-shape-input-group) also has PrimeFlex padding-left; zero it
 * so the Shape label lines up with Shape Family / Manufacturer / etc. */
.core-config-cell :deep(.efl-container[class*="col-"]) {
    padding-left: 0 !important;
}
/* Gap Info (CoreGappingSelector) lays its fields out in a .grid (not a .row),
 * and the per-field col-12 wrappers carry inconsistent PrimeFlex padding
 * (GapType has p-0, GapLength/NumberGaps don't) → Type and Length were offset
 * from each other. Zero the padding on the fields inside the indented
 * .col-offset-* wrapper so Type/Length labels and inputs share one left edge.
 * The col-offset-1 margin (the intentional Gap-Info indent) is preserved. */
.core-config-gap-cell :deep([class*="col-offset"]) > [class*="col-"] {
    padding-left: 0 !important;
    padding-right: 0 !important;
}
/* Gap value columns fill to the right edge so Type's dropdown and Length's
 * number+unit end at the same right edge (their col-5/col-6 proportions
 * otherwise leave them short). flex-basis 0 + min-width 0 makes them fill the
 * available space exactly (the inner number input shrinks rather than
 * overflowing the cell). */
.core-config-gap-cell :deep(.dim-value-row),
.core-config-gap-cell :deep(.efl-row .efl-select) {
    flex: 1 1 0% !important;
    min-width: 0 !important;
    width: auto !important;
    max-width: none !important;
}
.core-config-gap-cell :deep(.dim-input) {
    min-width: 0 !important;
}
.core-config-cell :deep(.form-label),
.core-config-cell :deep(label) {
    text-align: start !important;
}
.core-config-gap-cell :deep(.form-label),
.core-config-gap-cell :deep(label) {
    text-align: start !important;
}

/* Input value/unit font size. Externally themable: driven by the host's
 * style store via the --core-config-value-font-size CSS variable (set on
 * .core-config-panel from $styleStore.magneticBuilder.inputFontSize), so
 * OM and embedders (asgard, …) can each pick their own size. Falls back to
 * 1.15rem when no token is provided. PrimeVue Aura's defaults on Select /
 * InputNumber inner text override what we set on the parent, so we have to
 * bump everything explicitly with !important. */
.core-config-cell :deep(.p-select-label),
.core-config-cell :deep(.p-select .p-select-label),
.core-config-cell :deep(.p-inputnumber-input),
.core-config-cell :deep(.p-inputnumber input),
.core-config-cell :deep(input.p-inputtext),
.core-config-cell :deep(.dwt-unit-addon),
.core-config-cell :deep(.dim-unit),
.core-config-cell :deep(.dim-input),
.core-config-cell :deep(.dim-input input) {
    font-size: var(--core-config-value-font-size, 1.15rem) !important;
}

/* One fixed label-column width for EVERY field (Shape Family / Shape /
 * Manufacturer / Material / Number of Stacks / Gap …). ElementFromList and
 * Dimension otherwise size their label to its text (efl-label-inline is
 * flex:0 0 auto) and the cells have different row gutters, so the input boxes
 * landed at slightly different x. Pinning the label to a fixed width makes the
 * value column start at the same left edge regardless of label text or gutter;
 * labels longer than this clip (overflow:hidden is already set) instead of
 * shoving the inputs around. */
.core-config-panel :deep(.efl-label),
.core-config-panel :deep(.dim-label) {
    flex: 0 0 9rem !important;
    width: 9rem !important;
    max-width: 9rem !important;
    box-sizing: border-box;
}

/* Constant vertical rhythm between fields. Shape Family / Shape live inside one
 * cell (CoreShapeSelector) with taller wrappers than the plain Manufacturer /
 * Material cells, so gaps were uneven. Drop the grid row-gap and per-cell
 * vertical padding, strip the wrappers' vertical padding, and give every field
 * one uniform bottom margin — so the spacing is identical regardless of which
 * cell a field lives in. */
.core-config-grid { gap: 0 !important; }
.core-config-cell { padding-top: 0 !important; padding-bottom: 0 !important; }
/* Zero the vertical padding PrimeFlex `col-*` wrappers add (e.g. the Shape
 * field's col-12 carried 8px top/bottom, making its row 44px vs 28px). */
.core-config-cell :deep([class*="col-"]) {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
}
.core-config-cell :deep(.efl-container),
.core-config-cell :deep(.dim-container),
.core-config-cell :deep(.core-shape-input-group) {
    margin-top: 0 !important;
    margin-bottom: 0.4rem !important;
}
/* The Shape field's efl-container is nested inside .core-shape-input-group;
 * without this it would carry the margin twice (Shape row gap > the rest). */
.core-config-cell :deep(.core-shape-input-group .efl-container) {
    margin-bottom: 0 !important;
}
/* Separate the "Gap Info:" section heading from the Material field above it
 * (it was sitting tighter than the regular field rhythm). */
.core-config-gap-cell :deep([data-cy$="-Gap-title"]) {
    display: block;
    margin-top: 0.5rem !important;
    margin-bottom: 0.15rem !important;
}
</style>
