<script setup>
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import BasicWireSubmenu from './BasicWireSubmenu.vue'
import WireInfo from './WireInfo.vue'
import BasicTurnsSelector from './BasicTurnsSelector.vue'
import BasicLabelPinSelector from './BasicLabelPinSelector.vue'
import Wire2DVisualizer from '/WebSharedComponents/Common/Wire2DVisualizer.vue'
import WindingSelector from '../Common/WindingSelector.vue'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
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
        const wireTypes = {};
        const wireConductingDiameters = [];
        const wireHeights = [];
        const wireWidths = [];
        const wireStandards = []; 
        const wireCoatings = []; 
        const errorMessage = ""; 
        const localData = {
            type: null,
            standard: "IEC 60317",
            roundConductingDiameter: null,
            litzStrandConductingDiameter: null,
            coating: null,
            numberConductors: 13,
            rectangularConductingHeight: 0.001,
            rectangularConductingWidth: 0.002,
            foilConductingHeight: 0.005,
            foilConductingWidth: 0.0001,
        };
        if (typeof(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire) == 'string' && this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != "" && this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != "Dummy") {
            taskQueueStore.processWire(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex]);
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
            wireTypes,
            wireConductingDiameters,
            wireHeights,
            wireWidths,
            wireStandards,
            wireCoatings,
            forceUpdate,
            loading,
            errorMessage,
            subscriptions,
        }
    },
    computed: {
        isCurrentWireIncomplete() {
            // Returns true when the wire of the currently visible winding is
            // missing or incomplete — used to highlight the "Advise" button.
            const winding = this.masStore?.mas?.magnetic?.coil?.functionalDescription?.[this.windingIndex];
            if (winding == null) return true;
            const wire = winding.wire;
            if (wire == null) return true;
            if (typeof wire === 'string') return wire === '' || wire === 'Dummy';
            if (typeof wire === 'object') {
                if (wire.type == null) return true;
                if (wire.name == null || wire.name === '' || wire.name === 'Dummy') return true;
            }
            return false;
        },
        anyWireIncomplete() {
            // True if ANY winding's wire is incomplete (drives the "Advise all" button).
            const windings = this.masStore?.mas?.magnetic?.coil?.functionalDescription;
            if (!Array.isArray(windings) || windings.length === 0) return true;
            for (let i = 0; i < windings.length; i++) {
                const wire = windings[i]?.wire;
                if (wire == null) return true;
                if (typeof wire === 'string') {
                    if (wire === '' || wire === 'Dummy') return true;
                } else if (typeof wire === 'object') {
                    if (wire.type == null) return true;
                    if (wire.name == null || wire.name === '' || wire.name === 'Dummy') return true;
                }
            }
            return false;
        },
    },
    watch: {
        // 'masStore.mas.magnetic.coil.functionalDescription': {
        //     handler(newValue, oldValue) {
        //         const newWireHash = JSON.stringify(newValue[this.windingIndex].wire);
        //         if (!this.blockingRebounds && newWireHash != this.wireHash) {
        //             this.assignLocalData(newValue[this.windingIndex].wire)
        //             this.blockingRebounds = true;
        //             this.wireHash = newWireHash;
        //             setTimeout(() => this.blockingRebounds = false, 10);
        //         }
        //     },
        //   deep: true
        // },
    },
    mounted () {

        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "wireProcessed") {
                    if (args[0]) {
                        if (!this.taskQueueStore.windingIndexChangeBlock) {
                            this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire = args[1];
                            this.assignLocalData(args[1]);
                        }
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "newWireCreated") {
                    if (args[0]) {
                        if (!this.$stateStore.loadingDesign && !this.taskQueueStore.windingIndexChangeBlock) {
                            const newWire = args[1];
                            const currentWire = this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire;
                            const wireUnchanged = currentWire && typeof currentWire === 'object' && newWire && typeof newWire === 'object' &&
                                currentWire.standardName === newWire.standardName &&
                                currentWire.type === newWire.type &&
                                currentWire.numberConductors === newWire.numberConductors;
                            this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire = newWire;
                            if (!wireUnchanged) {
                                this.cleanCoil();
                                this.$emit("wireUpdated", this.windingIndex);
                            }
                        }
                    }
                    else {
                        console.error(args[1])
                    }
                }
            });
        }))

        if (this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != null) {
            this.assignLocalData(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire);
        }
        this.subscriptions.push(this.historyStore.$onAction((action) => {
            if (action.name == "historyPointerUpdated") {
                this.assignLocalData(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire);
            }
        }));
    },
    beforeUnmount () {
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        cleanCoil() {
            this.masStore.mas.magnetic.coil.turnsDescription = null;
            this.masStore.mas.magnetic.coil.layersDescription = null;
            this.masStore.mas.magnetic.coil.sectionsDescription = null;
        },
        assignLocalData(wire) {
            this.errorMessage = "";
            if (wire && wire != "" && wire.type != null) {

                this.localData["type"] = wire.type;
                if (wire.standard != null) {
                    this.localData["standard"] = wire.standard;
                }
                else {
                    this.localData["standard"] = "IEC 60317";
                }


                if (wire.type == "round") {
                    this.localData["roundConductingDiameter"] = wire.standardName;
                    this.taskQueueStore.getWireCoatingLabel(wire).then((coatingLabel) => {
                        this.localData["coating"] = coatingLabel;
                    });
                    this.localData["numberConductors"] = 1;
                }
                else if (wire.type == "litz") {
                    if (typeof(wire.strand) == 'string') {
                        this.taskQueueStore.getWireByName(wire.strand).then((strandJson) => {
                            if (!this.taskQueueStore.windingIndexChangeBlock) {
                                if (typeof strandJson === 'string' && strandJson.startsWith('Exception')) {
                                    console.error('Failed to resolve strand wire:', wire.strand, strandJson);
                                    return;
                                }
                                const strandObj = typeof strandJson === 'string' ? JSON.parse(strandJson) : strandJson;
                                this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire.strand = strandObj;
                                this.localData["standard"] = strandObj.standard;
                                this.localData["litzStrandConductingDiameter"] = strandObj.standardName;
                                this.getWireDiameters();
                                this.forceUpdate += 1;
                            }
                        });
                    }
                    else {
                        this.localData["standard"] = wire.strand.standard;
                        this.localData["litzStrandConductingDiameter"] = wire.strand.standardName;
                    }
                    this.localData["numberConductors"] = wire.numberConductors;
                }
                else if (wire.type == "rectangular") {
                    // Handle both dimension object and simple numeric value
                    const heightValue = wire.conductingHeight?.nominal || wire.conductingHeight;
                    const widthValue = wire.conductingWidth?.nominal || wire.conductingWidth;
                    this.localData["rectangularConductingHeight"] = heightValue;
                    this.localData["rectangularConductingWidth"] = widthValue;
                    this.localData["numberConductors"] = 1;
                }
                else if (wire.type == "foil") {
                    // Handle both dimension object and simple numeric value
                    const heightValue = wire.conductingHeight?.nominal || wire.conductingHeight;
                    const widthValue = wire.conductingWidth?.nominal || wire.conductingWidth;
                    this.localData["foilConductingHeight"] = heightValue;
                    this.localData["foilConductingWidth"] = widthValue;
                    this.localData["numberConductors"] = 1;
                }
                this.taskQueueStore.getWireCoatingLabel(wire).then((coatingLabel) => {
                    this.localData["coating"] = coatingLabel;
                });
                this.forceUpdate += 1;
            }
            this.getWireTypes();
            this.getWireStandards();
            this.getWireDiameters();
            this.getWireCoatings();
        },
        async assignWire() {
            this.errorMessage = "";
            return await this.taskQueueStore.createNewWire(this.localData, this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire);
        },
        getWireTypes() {
            this.taskQueueStore.getAvailableWires().then((wireTypes) => {
                this.wireTypes = wireTypes;
            });
        },
        getWireStandards() {
            this.taskQueueStore.getAvailableWireStandards().then((wireTypes) => {
                this.wireStandards = wireTypes;
            });
        },
        getWireDiameters() {
            try {
                this.taskQueueStore.getUniqueWireDiameters(this.localData.standard).then((wireConductingDiameters) => {
                    this.wireConductingDiameters = wireConductingDiameters;
                });
            }
            catch (e) {
                setTimeout(() => this.getWireDiameters(), 100);
            }
        },
        getWireCoatings() {
            if (this.localData.type != null) {

                this.taskQueueStore.getCoatingLabelsByType(this.localData.type).then((labels) => {
                    this.wireCoatings = labels;
                    if (this.wireCoatings.length > 0 && !this.wireCoatings.includes(this.localData["coating"])) {
                        this.localData["coating"] = this.wireCoatings[0];
                    }
                });
            }
        },
        async wireStandardUpdated() {
            this.getWireDiameters();
            await this.assignWire();
        },
        async wireCoatingUpdated() {
            await this.assignWire();
        },
        async wireUpdated() {
            await this.assignWire();
        },
        isAnyLitzLoaded() {
            return this.localData["litzStrandConductingDiameter"] != null
        },
        isAnyRoundLoaded() {
            return this.localData["roundConductingDiameter"] != null
        },
        isAnyRectangularLoaded() {
            return this.localData["rectangularConductingWidth"] != null
        },
        isAnyFoilLoaded() {
            return this.localData["foilConductingWidth"] != null
        },
        async wireTypeUpdated() {
            try {

                this.getWireCoatings();

                const newType = this.localData.type;
                if (this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != "" &&
                    this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire.type != null) {
                    const oldWire = deepCopy(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire);
                    const effectiveFrequency = this.masStore.mas.inputs.operatingPoints[0].excitationsPerWinding[0].current.processed.effectiveFrequency;

                    if ((newType == "litz" && !this.isAnyLitzLoaded()) ||
                        (newType == "round" && !this.isAnyRoundLoaded()) ||
                        (newType == "rectangular" && !this.isAnyRectangularLoaded()) ||
                        (newType == "foil" && !this.isAnyFoilLoaded())) {

                        this.taskQueueStore.calculateEquivalentWire(oldWire, newType, effectiveFrequency).then(async (wire) => {
                            this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire = wire;
                            this.assignLocalData(wire);
                            await this.assignWire();
                        });

                    }
                    else if (newType == "rectangular" || newType == "foil") {
                        // For rectangular and foil, always trigger rewinding when type changes
                        // even if dimensions are already filled
                        const newWire = await this.assignWire();
                        this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire = newWire;
                        if (!this.taskQueueStore.windingIndexChangeBlock) {
                            this.cleanCoil();
                            this.taskQueueStore.newWireCreated(true, newWire);
                        }
                    }
                    else {
                        await this.assignWire();
                    }
                }
                else if (newType == "rectangular" || newType == "foil") {
                    // For rectangular and foil, trigger rewinding even when wire is initially empty
                    // This handles the case when manually setting up a new inductor
                    const newWire = await this.assignWire();
                    this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire = newWire;
                    if (!this.taskQueueStore.windingIndexChangeBlock) {
                        this.cleanCoil();
                        this.taskQueueStore.newWireCreated(true, newWire);
                    }
                }
            }
            catch(e) {
                // console.error(e)
                setTimeout(() => this.wireTypeUpdated(), 100);
            }
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
            if (this.masStore.mas.inputs.operatingPoints.length > 0) {

                // this.taskQueueStore.checkAndFixMas(this.masStore.mas).then(() => {
                // });

                this.taskQueueStore.adviseAllWires(this.masStore.mas)
                .then((coil) => {
                    this.errorMessage = "";
                    
                    // Always update UI (localData) regardless of block
                    this.assignLocalData(coil.functionalDescription[this.windingIndex].wire);
                    
                    // Only update coil and trigger actions if not blocked
                    if (!this.taskQueueStore.windingIndexChangeBlock) {
                        this.masStore.mas.magnetic.coil.functionalDescription = coil.functionalDescription;
                        this.cleanCoil();
                        this.$emit("wireUpdated", this.windingIndex);

                        this.$stateStore.wire2DVisualizerState.plotCurrentViews = {};

                        // Trigger rewinding and resimulation
                        this.taskQueueStore.newWireCreated(true, coil.functionalDescription[this.windingIndex].wire);
                    }
                    
                    setTimeout(() => this.loading = false, 100);

                })
                .catch(error => {
                    this.errorMessage = "Our advisers could not find a wire. Sorry, you are on your own!";
                    setTimeout(() => {this.errorMessage = ""}, 10000);
                    this.loading = false;
                    console.error(error);
                })
            }
            else {
                console.error("No operating points found")
                this.loading = false;
            }
        },
        adviseWire() {
            if (this.masStore.mas.inputs.operatingPoints.length > 0) {
                this.taskQueueStore.adviseWire(this.masStore.mas, this.windingIndex)
                .then((result) => {
                    if (!result) {
                        this.errorMessage = "Our advisers could not find a wire. Sorry, you are on your own!";
                        this.loading = false;
                        setTimeout(() => {this.errorMessage = ""}, 10000);
                        return;
                    }
                    this.errorMessage = "";
                    
                    const winding = result.winding;
                    
                    // Always update UI (localData) regardless of block
                    this.assignLocalData(winding.wire);
                    
                    // Only update coil and trigger actions if not blocked
                    if (!this.taskQueueStore.windingIndexChangeBlock) {
                        this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex] = winding;
                        this.cleanCoil();
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
                })
            }
            else {
                this.loading = false;
            }
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
                    <i class="fa-solid fa-bolt"></i>
                    <span>Wire Configuration</span>
                </div>
                <div v-if="enableAdvise && enableSubmenu && !readOnly" class="wire-config-header-right">
                    <button
                        v-if="masStore.mas.magnetic.coil.functionalDescription.length > 1"
                        type="button"
                        :disabled="loading"
                        :data-cy="dataTestLabel + 'Wire-Advise-button'"
                        :class="['wire-config-header-btn', 'wire-config-header-btn-primary', { 'wire-config-header-btn-needs-attention': isCurrentWireIncomplete }]"
                        v-tooltip="isCurrentWireIncomplete ? 'Wire not configured for this winding — click to get a recommendation' : 'Get a recommended wire for this winding'"
                        @click="adviseWireRequested"
                    >
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        <span>Advise</span>
                    </button>
                    <button
                        v-if="masStore.mas.magnetic.coil.functionalDescription.length > 1"
                        type="button"
                        :disabled="loading"
                        :data-cy="dataTestLabel + 'Wire-Advise-All-button'"
                        :class="['wire-config-header-btn', 'wire-config-header-btn-primary', { 'wire-config-header-btn-needs-attention': anyWireIncomplete }]"
                        v-tooltip="anyWireIncomplete ? 'Some wires are not configured — click to get a recommendation for every winding' : 'Get a recommendation for every winding'"
                        @click="adviseAllWiresRequested"
                    >
                        <i class="fa-solid fa-wand-sparkles"></i>
                        <span>Advise all</span>
                    </button>
                    <button
                        v-if="masStore.mas.magnetic.coil.functionalDescription.length == 1"
                        type="button"
                        :disabled="loading"
                        :data-cy="dataTestLabel + 'Wire-Advise-button'"
                        :class="['wire-config-header-btn', 'wire-config-header-btn-primary', { 'wire-config-header-btn-needs-attention': isCurrentWireIncomplete }]"
                        v-tooltip="isCurrentWireIncomplete ? 'Wire not configured — click to get a recommendation' : 'Get a recommended wire'"
                        @click="adviseWireRequested"
                    >
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        <span>Advise</span>
                    </button>
                </div>
            </div>
            <div class="wire-config-body">
                <img :data-cy="dataTestLabel + '-BasicWireSelector-loading'" v-if="loading" class="mx-auto d-block col-12" alt="loading" style="width: 60%; height: auto;" :src="$settingsStore.loadingGif">
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
                        :backgroundColor="$styleStore.magneticBuilder.main['background-color'] || $styleStore.magneticBuilder.main['background'] || '#1a1a1a'"
                    />
                </div>
                <div
                    v-if="!$stateStore.hasCurrentApplicationMirroredWindings()"
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
                    <BasicLabelPinSelector
                        :readOnly="readOnly"
                        :masStore="masStore"
                        :windingIndex="windingIndex"
                        :dataTestLabel="dataTestLabel + '-LabelPin'"
                    />
                </div>
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
                        v-tooltip="tooltipsMagneticBuilder.wireType"
                            :disabled="readOnly"
                            class="text-start"
                            :dataTestLabel="dataTestLabel + '-WireType'"
                            :name="'type'"
                            :titleSameRow="true"
                            :justifyContent="true"
                            v-model="localData"
                            :options="wireTypes"
                            :labelWidthProportionClass="'col-5'"
                            :selectStyleClass="'col-7'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="wireTypeUpdated"
                        />
                    </div>
                    <h5 v-if="!loading && localData.type == null" class="text-danger my-2 col-12">Select a type for the wire</h5>

                    <div v-if="!loading && (localData.type == 'round' || localData.type == 'litz' && localData.standard != null)" class="wire-config-cell wire-config-cell-wide">
                        <ElementFromList
                            v-tooltip="tooltipsMagneticBuilder.wireStandard"
                            :disabled="readOnly"
                            class="text-start"
                            :dataTestLabel="dataTestLabel + '-WireStandard'"
                            :name="'standard'"
                            :titleSameRow="true"
                            :justifyContent="true"
                            :labelWidthProportionClass="'col-3'"
                            :selectStyleClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            v-model="localData"
                            :options="wireStandards"
                            @update="wireStandardUpdated"
                        />
                    </div>
                    <div v-if="!loading && localData.type == 'round'" class="wire-config-cell wire-config-cell-wide">
                        <ElementFromList
                            v-tooltip="tooltipsMagneticBuilder.wireRoundConductingDiameter"
                            :disabled="readOnly"
                            class="text-start"
                            :dataTestLabel="dataTestLabel + '-WireConductingDiameter'"
                            :replaceTitle="'Cond. diameter'"
                            :name="'roundConductingDiameter'"
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
                            :options="wireConductingDiameters"
                            @update="wireUpdated"
                        />
                    </div>
                    <div v-if="!loading && localData.type == 'litz'" class="wire-config-cell wire-config-cell-wide">
                        <ElementFromList
                            v-tooltip="tooltipsMagneticBuilder.wireLitzStrandConductingDiameter"
                            :disabled="readOnly"
                            class="text-start"
                            :dataTestLabel="dataTestLabel + '-StrandConductingDiameter'"
                            :replaceTitle="'Cond. diameter'"
                            :name="'litzStrandConductingDiameter'"
                            :labelWidthProportionClass="'col-6'"
                            :selectStyleClass="'col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            :titleSameRow="true"
                            :justifyContent="true"
                            v-model="localData"
                            :options="wireConductingDiameters"
                            @update="wireUpdated"
                        />
                    </div>
                    <div v-if="!loading && localData.type != null" class="wire-config-cell wire-config-cell-wide">
                        <ElementFromList
                            v-tooltip="tooltipsMagneticBuilder.wireCoating"
                            :disabled="readOnly"
                            class="text-start"
                            :dataTestLabel="dataTestLabel + '-WireCoating'"
                            :name="'coating'"
                            :titleSameRow="true"
                            :justifyContent="true"
                            :labelWidthProportionClass="'col-3'"
                            :selectStyleClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            v-model="localData"
                            :options="wireCoatings"
                            @update="wireCoatingUpdated"
                        />
                    </div>
                    <div v-if="!loading && localData.type == 'litz'" class="wire-config-cell wire-config-cell-wide">
                        <Dimension class="text-start"
                            v-tooltip="tooltipsMagneticBuilder.wireLitzNumberConductors"
                            :disabled="readOnly"
                            :name="'numberConductors'"
                            :replaceTitle="'No. Strands'"
                            :unit="null"
                            :dataTestLabel="dataTestLabel + '-NumberConductors'"
                            :numberDecimals="0"
                            :min="1"
                            :max="1000000"
                            :allowNegative="false"
                            :modelValue="localData"
                            :forceUpdate="forceUpdate"
                            :labelWidthProportionClass="'col-xs-12 col-md-7'"
                            :valueWidthProportionClass="'col-xs-8 col-md-5'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="wireUpdated"
                        />
                    </div>
                    <div v-if="!loading && localData.type == 'rectangular'" class="wire-config-cell">
                        <Dimension class="text-start"
                            v-tooltip="tooltipsMagneticBuilder.wireRectangularConductingHeight"
                            :disabled="readOnly"
                            :name="'rectangularConductingHeight'"
                            :replaceTitle="'Cond. Height'"
                            :unit="'m'"
                            :defaultZeroUnit="0.001"
                            :dataTestLabel="dataTestLabel + '-WireConductingHeight'"
                            :min="1e-9"
                            :max="0.1"
                            :allowNegative="false"
                            :modelValue="localData"
                            :forceUpdate="forceUpdate"
                            :styleClassInput="'offset-3 col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="wireUpdated"
                        />
                    </div>
                    <div v-if="!loading && localData.type == 'rectangular'" class="wire-config-cell">
                        <Dimension class="text-start"
                            v-tooltip="tooltipsMagneticBuilder.wireRectangularConductingWidth"
                            :disabled="readOnly"
                            :name="'rectangularConductingWidth'"
                            :replaceTitle="'Cond. Width'"
                            :unit="'m'"
                            :defaultZeroUnit="0.001"
                            :dataTestLabel="dataTestLabel + '-WireConductingWidth'"
                            :min="1e-9"
                            :max="0.1"
                            :allowNegative="false"
                            :modelValue="localData"
                            :forceUpdate="forceUpdate"
                            :styleClassInput="'offset-3 col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="wireUpdated"
                        />
                    </div>
                    <div v-if="!loading && localData.type == 'foil'" class="wire-config-cell">
                        <Dimension class="text-start"
                            v-tooltip="tooltipsMagneticBuilder.wireFoilConductingHeight"
                            :disabled="readOnly"
                            :name="'foilConductingHeight'"
                            :replaceTitle="'Cond. Height'"
                            :unit="'m'"
                            :defaultZeroUnit="0.001"
                            :dataTestLabel="dataTestLabel + '-WireConductingHeight'"
                            :min="1e-9"
                            :max="0.1"
                            :allowNegative="false"
                            :modelValue="localData"
                            :forceUpdate="forceUpdate"
                            :styleClassInput="'offset-3 col-6'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="wireUpdated"
                        />
                    </div>
                    <div v-if="!loading && localData.type == 'foil'" class="wire-config-cell">
                        <Dimension class="text-start"
                            v-tooltip="tooltipsMagneticBuilder.wireFoilConductingWidth"
                            :disabled="readOnly"
                            :name="'foilConductingWidth'"
                            :replaceTitle="'Cond. Width'"
                            :unit="'m'"
                            :defaultZeroUnit="0.001"
                            :dataTestLabel="dataTestLabel + '-WireConductingWidth'"
                            :min="1e-9"
                            :max="0.1"
                            :allowNegative="false"
                            :modelValue="localData"
                            :forceUpdate="forceUpdate"
                            :styleClassInput="'offset-3 col-6'"
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
                    class="col-12 mb-1 text-start"
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
    background: linear-gradient(145deg, rgba(var(--bs-primary-rgb), 0.06) 0%, rgba(var(--bs-primary-rgb), 0.02) 100%);
    border: 1px solid rgba(var(--bs-primary-rgb), 0.15);
    border-radius: 14px;
    padding: 0;
    margin: 0.15rem 0 0.25rem 0;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    overflow: hidden;
}

.wire-config-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.9rem;
    background: rgba(var(--bs-primary-rgb), 0.1);
    border-bottom: 1px solid rgba(var(--bs-primary-rgb), 0.12);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--bs-primary);
    letter-spacing: 0.02em;
}

.wire-config-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.wire-config-header-left i {
    font-size: 0.95rem;
    filter: drop-shadow(0 0 4px rgba(var(--bs-primary-rgb), 0.35));
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
        color-mix(in srgb, var(--bs-primary) 115%, transparent 0%) 0%,
        var(--bs-primary) 55%,
        rgb(var(--bs-primary-rgb) / 0.85) 100%);
    color: var(--bs-white);
    border: 1px solid color-mix(in srgb, var(--bs-primary) 70%, var(--bs-white) 30%);
    box-shadow:
        0 0 0 1px rgb(var(--bs-primary-rgb) / 0.35),
        0 2px 8px rgb(var(--bs-primary-rgb) / 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
}

/* Highlight the Advise / Advise all buttons in danger color while a wire is
   incomplete, so the user is reminded they can use it as a shortcut. */
.wire-config-header-btn.wire-config-header-btn-needs-attention {
    color: var(--bs-danger) !important;
    border-color: rgb(var(--bs-danger-rgb) / 0.6) !important;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
    box-shadow:
        0 0 0 1px rgb(var(--bs-danger-rgb) / 0.4),
        0 2px 10px rgb(var(--bs-danger-rgb) / 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
    animation: wire-advise-pulse 1.8s ease-in-out infinite;
}

.wire-config-header-btn.wire-config-header-btn-needs-attention i {
    color: var(--bs-danger);
}

@keyframes wire-advise-pulse {
    0%, 100% {
        filter: brightness(1);
    }
    50% {
        filter: brightness(1.18);
    }
}

.wire-config-body {
    padding: 0.5rem 0.6rem;
}

.wire-config-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.15rem;
    background: var(--bs-dark);
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
