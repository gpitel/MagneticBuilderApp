<script setup>
import { toTitleCase, deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import { isolationSideOrdered } from '/WebSharedComponents/assets/js/defaults.js'
import PlanarWireSelector from './PlanarWireSelector.vue'
import BasicWireSelector from './BasicWireSelector.vue'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import { useTaskQueueStore } from '../../../stores/taskQueue'
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
        useVisualizers: {
            type: Boolean,
            default: true,
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
        isIsolatedApp: {
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
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const wire2DVisualizerPlotCurrentDensity = this.$stateStore.wire2DVisualizerState.plotCurrentDensity? '1' : '0';
        let numberWindings = 1;
        if (this.masStore.mas.inputs.designRequirements.turnsRatios != null) {
            numberWindings = this.masStore.mas.inputs.designRequirements.turnsRatios.length + 1;
        }
        numberWindings = Math.max(numberWindings, this.masStore.mas.magnetic.coil.functionalDescription.length);

        const numberWindingsAux = {
            numberWindings: numberWindings
        }
        const selectedWindingIndex = 0;
        const blockingRebounds = false;
        const imageUpToDate = false;
        const forceUpdate = 0;
        const subscriptions = [];

        return {
            taskQueueStore,
            blockingRebounds,
            numberWindingsAux,
            selectedWindingIndex,
            wire2DVisualizerPlotCurrentDensity,
            imageUpToDate,
            forceUpdate,
            subscriptions,
        }
    },
    computed: {
    },
    watch: {
    },
    mounted () {

        this.subscriptions.push(this.$stateStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "redraw") {
                    this.forceUpdate += 1;
                    this.imageUpToDate = true;
                }
            });
        }))
        this.subscriptions.push(this.masStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "importedMas") {
                    this.numberWindingsAux.numberWindings = this.masStore.mas.magnetic.coil.functionalDescription.length;
                    this.forceUpdate += 1;
                }
            });
        }))
        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            // Mark image as outdated immediately when wire creation starts
            if (name == "createNewWire" || name == "newWireCreated") {
                this.imageUpToDate = false;
            }
            after(() => {
                if (name == "windingIndexChanged") {
                    this.imageUpToDate = true;
                    this.forceUpdate += 1;
                }
                if (name == "wireDataCalculated") {
                    if (this.$settingsStore.magneticBuilderSettings.autoRedraw) {
                        this.imageUpToDate = true;
                        this.forceUpdate += 1;
                    }
                }
                if (name == "newWireCreated") {
                    if (args[0] && this.masStore.hasMirroredWindings && !this.taskQueueStore.windingIndexChangeBlock) {
                        const newWire = args[1];
                        if (newWire && this.masStore.mas.magnetic.coil.functionalDescription.length > 1) {
                            const modifiedWindingIndex = this.selectedWindingIndex;
                            const tempCoilFunctionalDescription = deepCopy(this.masStore.mas.magnetic.coil.functionalDescription);
                            this.masStore.mas.magnetic.coil.functionalDescription.forEach((_, windingIndex) => {
                                if (modifiedWindingIndex != windingIndex) {
                                    tempCoilFunctionalDescription[windingIndex].wire = newWire;
                                }
                            });
                            this.masStore.mas.magnetic.coil.functionalDescription = tempCoilFunctionalDescription;
                        }
                    }
                    if (this.$settingsStore.magneticBuilderSettings.autoRedraw) {
                        this.imageUpToDate = true;
                        this.forceUpdate += 1;
                    }
                }
            });
        }))

        if (this.$settingsStore.magneticBuilderSettings.autoRedraw) {
            this.forceUpdate += 1;
            this.imageUpToDate = true;
        }

    },
    beforeUnmount () {
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        turnsUpdated(modifiedWindingIndex) {
            if (!this.blockingRebounds && !this.taskQueueStore.windingIndexChangeBlock) {
                this.blockingRebounds = true;
                if (this.masStore.hasMirroredWindings) {
                    const tempCoilFunctionalDescription = deepCopy(this.masStore.mas.magnetic.coil.functionalDescription)
                    this.masStore.mas.magnetic.coil.functionalDescription.forEach((_, windingIndex) => {
                        if (modifiedWindingIndex != windingIndex) {
                            tempCoilFunctionalDescription[windingIndex].numberTurns = this.masStore.mas.magnetic.coil.functionalDescription[modifiedWindingIndex].numberTurns;
                            tempCoilFunctionalDescription[windingIndex].numberParallels = this.masStore.mas.magnetic.coil.functionalDescription[modifiedWindingIndex].numberParallels;
                            // this.masStore.mas.magnetic.coil.functionalDescription[windingIndex].wire = this.masStore.mas.magnetic.coil.functionalDescription[modifiedWindingIndex].wire;
                        }
                    })
                    this.masStore.mas.magnetic.coil.functionalDescription = tempCoilFunctionalDescription;
                }
                setTimeout(() => this.blockingRebounds = false, 10);
            }
        },
        wireUpdated(modifiedWindingIndex) {
            if (!this.blockingRebounds && !this.taskQueueStore.windingIndexChangeBlock) {
                this.blockingRebounds = true;
                if (this.masStore.hasMirroredWindings) {
                    const tempCoilFunctionalDescription = deepCopy(this.masStore.mas.magnetic.coil.functionalDescription)
                    this.masStore.mas.magnetic.coil.functionalDescription.forEach((_, windingIndex) => {
                        if (modifiedWindingIndex != windingIndex) {
                            tempCoilFunctionalDescription[windingIndex].wire = this.masStore.mas.magnetic.coil.functionalDescription[modifiedWindingIndex].wire;
                        }
                    })
                    this.masStore.mas.magnetic.coil.functionalDescription = tempCoilFunctionalDescription;
                }
                setTimeout(() => this.blockingRebounds = false, 10);
            }

        },
        updatedNumberElements(newLength, name) {
            if (name == 'numberWindings') {
                const newElementsCoil = [];
                const newElementsTurnsRatios = [];
                for (let i = 0; i < newLength - 1; i++) {
                    if (i < this.masStore.mas.inputs.designRequirements.turnsRatios.length) {
                        newElementsTurnsRatios.push(this.masStore.mas.inputs.designRequirements.turnsRatios[i]);
                    }
                    else {
                        newElementsTurnsRatios.push({'nominal': 1});
                    }
                }
                for (let i = 0; i < newLength; i++) {
                    if (i < this.masStore.mas.magnetic.coil.functionalDescription.length) {
                        newElementsCoil.push(this.masStore.mas.magnetic.coil.functionalDescription[i]);
                    }
                    else {
                        newElementsCoil.push({'name': toTitleCase(isolationSideOrdered[i])});
                    }
                }
                for (let operationPointIndex = 0; operationPointIndex < this.masStore.mas.inputs.operatingPoints.length; operationPointIndex++) {
                    const newExcitationsPerWinding = [];

                    for (let i = 0; i < newLength; i++) {
                        if (i < this.masStore.mas.inputs.operatingPoints[operationPointIndex].excitationsPerWinding.length) {
                            newExcitationsPerWinding.push(this.masStore.mas.inputs.operatingPoints[operationPointIndex].excitationsPerWinding[i]);
                        }
                        else {
                            newExcitationsPerWinding.push(null);
                        }
                    }
                    this.masStore.mas.inputs.operatingPoints[operationPointIndex].excitationsPerWinding = newExcitationsPerWinding;
                }

                this.masStore.mas.inputs.designRequirements.turnsRatios = newElementsTurnsRatios;
                this.masStore.mas.magnetic.coil.functionalDescription = newElementsCoil;
                this.masStore.updatedTurnsRatios();
            }
        },
        windingIndexChanged(windingIndex) {
            this.selectedWindingIndex = windingIndex;
            this.taskQueueStore.setWindingIndexChangeBlock();
        },
        onPlotCurrentChange(event) {
            this.$stateStore.wire2DVisualizerState.plotCurrentDensity = event.target.value == '1';
        },
    }
}
</script>

<template>
    <h5 v-if="masStore.mas.magnetic.core == null || masStore.mas.magnetic.core.functionalDescription.shape ==''" class="text-danger my-2">Select a core first</h5>

    <div v-else class="container">
        <div v-if="isIsolatedApp" class="row">
            <ElementFromList class="border-bottom py-2 px-4 col-12 text-left"
                :name="'numberWindings'"
                :disabled="readOnly"
                :dataTestLabel="dataTestLabel + '-NumberWindings'"
                :options="Array.from({length: 12}, (_, i) => i + 1)"
                :titleSameRow="true"
                v-model="numberWindingsAux"
                :labelWidthProportionClass="'col-8'"
                :selectStyleClass="'col-4'"
                :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
                :justifyContent="true"
                @update="updatedNumberElements"
            />
        </div>

        <div class="row">
            <div v-for="value, key in masStore.mas.magnetic.coil.functionalDescription" :key="key">
                <BasicWireSelector
                    v-if="selectedWindingIndex==key && (masStore.mas.inputs.designRequirements.wiringTechnology == null || masStore.mas.inputs.designRequirements.wiringTechnology.toLowerCase() == 'wound')"
                    :masStore="masStore"
                    :readOnly="readOnly"
                    :operatingPointIndex="operatingPointIndex"
                    :windingIndex="key"
                    :enableSimulation="enableSimulation"
                    :enableAutoSimulation="enableAutoSimulation"
                    :enableSubmenu="enableSubmenu"
                    :enableAdvise="enableAdvise"
                    :useVisualizers="useVisualizers"
                    :imageUpToDate="imageUpToDate"
                    :forceUpdateVisualizer="forceUpdate"
                    @wireUpdated="wireUpdated"
                    @turnsUpdated="turnsUpdated"
                    @windingIndexChanged="windingIndexChanged"
                />
                <PlanarWireSelector
                    v-if="selectedWindingIndex==key && (masStore.mas.inputs.designRequirements.wiringTechnology != null && masStore.mas.inputs.designRequirements.wiringTechnology.toLowerCase() == 'printed')"
                    :masStore="masStore"
                    :readOnly="readOnly"
                    :operatingPointIndex="operatingPointIndex"
                    :windingIndex="key"
                    :enableSimulation="enableSimulation"
                    :enableAutoSimulation="enableAutoSimulation"
                    :enableSubmenu="enableSubmenu"
                    :enableAdvise="enableAdvise"
                    :useVisualizers="useVisualizers"
                    :imageUpToDate="imageUpToDate"
                    :forceUpdateVisualizer="forceUpdate"
                    @wireUpdated="wireUpdated"
                    @turnsUpdated="turnsUpdated"
                    @windingIndexChanged="windingIndexChanged"
                />
            </div>
        </div>
    </div>
</template>


<style type="text/css">
/* --------------------------- webkit browsers */
.slider::-webkit-slider-thumb {
  background-color: var(--p-primary);
}
/* -------------------------- Firefox */
.slider::-moz-range-thumb { 
  background-color: var(--p-primary);
}
</style>