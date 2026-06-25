<script setup>
import { GapType } from '../../../../assets/ts/MAS.ts'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import { useHistoryStore } from '../../../../stores/history'
import { combinedStyle, deepCopy, roundWithDecimals, removeTrailingZeroes } from '/WebSharedComponents/assets/js/utils.js'
import { gapTypes, defaultOperatingConditions} from '/WebSharedComponents/assets/js/defaults.js'
import Core3DVisualizer from '/WebSharedComponents/Common/Core3DVisualizer.vue'
import Core2DVisualizer from '/WebSharedComponents/Common/Core2DVisualizer.vue'
import AdvancedCoreSelectorGap from './AdvancedCoreSelectorGap.vue'
import ContextMenu from '../../ContextMenu.vue'
import { useMagneticBuilderSettingsStore } from '../../../../stores/magneticBuilderSettings'
import { useTaskQueueStore } from '../../../../stores/taskQueue'

</script>

<script>

export default {
    emits: ["errorInDimensions", "renderSuccess"],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        core: {
            type: Object,
            required: true,
        },
        inputs: {
            type: Object,
            required: true,
        },
        enableSimulation: {
            type: Boolean,
            default: true,
        },
        allowFamilyChange: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const localData = [];
        const localCoreToDraw = deepCopy(this.core);
        const errorMessage = "";
        const coreTemperatureDependantParametersData = {};
        const gapErrorsPerColumn = [];
        const loading = false;
        const imageUpToDate = true;
        const dataUpToDate = true;
        const engineConstants = {};
        const forceUpdate = 0;
        const forceUpdate3DCore = 0;
        const blockingRebounds = false;
        const magneticBuilderSettingsStore = useMagneticBuilderSettingsStore();
        const subscriptions = [];

        return {
            localData,
            localCoreToDraw,
            imageUpToDate,
            dataUpToDate,
            engineConstants,
            errorMessage,
            coreTemperatureDependantParametersData,
            gapErrorsPerColumn,
            forceUpdate,
            forceUpdate3DCore,
            loading,
            blockingRebounds,
            magneticBuilderSettingsStore,
            taskQueueStore,
            subscriptions,
        }
    },
    watch: { 
    },
    created () {
    },
    mounted () {
        this.getEngineConstants();

        this.subscriptions.push(this.$stateStore.$onAction((action) => {
            if (action.name == "redraw") {
                this.redraw();
            }
        }));
    },
    beforeUnmount() {
        this.subscriptions.forEach((unsubscribe) => unsubscribe());
    },
    methods: {
        getEngineConstants() {
            this.taskQueueStore.getConstants().then((constants) => {
                this.engineConstants['residualGap'] = constants['residualGap'];
                if (this.core.processedDescription != null) {
                    this.assignLocalData(this.core);
                    this.calculateData();
                }
                else {
                    this.taskQueueStore.processCore(this.core).then((core) => {
                        this.core.functionalDescription = core.functionalDescription;
                        this.core.processedDescription = core.processedDescription;
                        this.core.geometricalDescription = core.geometricalDescription;
                        this.assignLocalData(this.core);
                        this.calculateData();
                    })
                    .catch(error => {
                        console.error(error);
                    });

                }
            });
        },
        computeErrorMessages() {},
        assignLocalData(core) {
            this.localData = [];
            this.gapErrorsPerColumn = [];
            core.processedDescription.columns.forEach((elem, index) => {
                this.gapErrorsPerColumn.push([])
                this.localData.push({
                    type: "Ungapped",
                    index: index,
                    gaps: [],
                });
            })
            core.functionalDescription.gapping.forEach((gap, gapIndex) => {
                let closestColumnIndex;
                let closestDistance = Number.MAX_VALUE;
                core.processedDescription.columns.forEach((column, columnIndex) => {
                    const distance = Math.pow(gap.coordinates[0] - column.coordinates[0], 2) + Math.pow(gap.coordinates[2] - column.coordinates[2], 2);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestColumnIndex = columnIndex;
                    }
                })
                this.gapErrorsPerColumn[closestColumnIndex].push("");
                this.localData[closestColumnIndex].gaps.push({
                    index: gapIndex,
                })
            })
            const groundGaps = [];
            this.localData.forEach((elem, index) => {
                if (elem.gaps.length > 1) {
                    elem.type = "Distributed";
                }
                else if (elem.gaps.length < 1) {
                    elem.type = "Ungapped";
                }
                else {
                    const index = elem.gaps[0].index;
                    if (core.functionalDescription.gapping[index].length <= this.engineConstants['residualGap']) {
                        elem.type = "Ungapped";
                    } 
                    else {
                        elem.type = "Ground";
                        groundGaps.push(core.functionalDescription.gapping[index].length);
                    }
                }
            })

            if (groundGaps.length == core.processedDescription.columns.length) {
                let allEqual = true;
                groundGaps.forEach((elem) => {
                    if ((groundGaps[0] - elem) / groundGaps[0] > 1e-6) {
                        allEqual = false;
                    }
                })
                if (allEqual) {
                    this.localData.forEach((elem, index) => {
                        elem.type = "Spacer";
                    })
                }
            }
            this.forceUpdate += 1;
            this.processCore();
        },
        errorInDimensions() {
            this.errorMessage = "There is an error in the dimensions, please review them";
        },
        clearError() {
            this.errorMessage = "";
        },
        gapTypeChanged(newType, columnIndex) {
            if (newType == "Spacer") {
                this.setSpacer(columnIndex);
            }

            if (newType == "Ground") {
                this.setGround(columnIndex);
            }

            if (newType == "Ungapped") {
                this.setUngapped(columnIndex);
            }

            if (newType == "Distributed") {
                this.setDistributed(columnIndex);
            }
            this.processCore();
        },
        setSpacer(columnIndex) {
            const firstGapInColumnIndex = this.reorderedColumns[columnIndex].gaps[0].index;
            const firstGapInColumnLength = this.core.functionalDescription.gapping[firstGapInColumnIndex].length;

            this.reorderedColumns.forEach((elem) => {
                elem.type = "Spacer";
                for (let i = elem.gaps.length - 1; i >= 1; i--) {
                    this.removeGap(elem.gaps[i].index);
                }
            })
            this.reorderedColumns.forEach((elem) => {
                this.core.functionalDescription.gapping[elem.gaps[0].index].length = firstGapInColumnLength;
                this.core.functionalDescription.gapping[elem.gaps[0].index].type = GapType.Additive;
                this.core.functionalDescription.gapping[elem.gaps[0].index].coordinates[1] = 0;
            })
            this.forceUpdate += 1;
        },
        unsetSpacer() {
            this.reorderedColumns.forEach((elem) => {
                if (elem.type == "Spacer") {
                    elem.type = "Ungapped";
                    this.core.functionalDescription.gapping[elem.gaps[0].index].length = this.engineConstants['residualGap'];
                    this.core.functionalDescription.gapping[elem.gaps[0].index].type = GapType.Subtractive;
                }
            })
            this.forceUpdate += 1;
        },
        setUngapped(columnIndex) {
            this.unsetSpacer();
            for (let i = this.reorderedColumns[columnIndex].gaps.length - 1; i >= 1; i--) {
                this.removeGap(this.reorderedColumns[columnIndex].gaps[i].index);
            }
            this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].type = GapType.Subtractive;
            this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].length = this.engineConstants['residualGap'];
            this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].coordinates[1] = 0;
            this.forceUpdate += 1;
        },
        setDistributed(columnIndex) {
            this.unsetSpacer();
            const numberDistributedGaps = 3;
            this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].type = GapType.Subtractive;
            this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].length = this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].length / numberDistributedGaps;
            this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].coordinates[1] = 0;
            for (let i = numberDistributedGaps - 2; i >= 0; i--) {
                this.addGap(columnIndex);
            }
            this.forceUpdate += 1;
        },
        setGround(columnIndex) {
            this.unsetSpacer();
            for (let i = this.reorderedColumns[columnIndex].gaps.length - 1; i >= 1; i--) {
                this.removeGap(this.reorderedColumns[columnIndex].gaps[i].index);
            }
            this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].type = GapType.Subtractive;
            const length = this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].length;
            this.core.functionalDescription.gapping[this.reorderedColumns[columnIndex].gaps[0].index].coordinates[1] = length / 2;
            this.forceUpdate += 1;
        },
        gapLengthChanged(newLength, gapIndex) {
            if (!this.blockingRebounds) {
                this.blockingRebounds = true;

                this.core.functionalDescription.gapping[gapIndex].length = newLength;
                if (this.reorderedColumns[0].type == "Spacer") {
                    this.core.functionalDescription.gapping.forEach((gap, gapIndex) => {
                        gap.length = newLength;
                    })
                }
                this.forceUpdate += 1;
                this.processCore();

                setTimeout(() => this.blockingRebounds = false, 10);
            }
        },
        gapHeightChanged(newHeight, gapIndex) {
            this.core.functionalDescription.gapping[gapIndex].coordinates[1] = newHeight;
            this.processCore();
        },
        addGap(columnIndex) {
            const lastGapInColumnIndex = this.reorderedColumns[columnIndex].gaps[this.reorderedColumns[columnIndex].gaps.length - 1].index
            const lastGapInColumn = deepCopy(this.core.functionalDescription.gapping[lastGapInColumnIndex])
            this.core.functionalDescription.gapping.push(lastGapInColumn);
            this.assignLocalData(this.core);
        },
        removeGap(gapIndex) {
            this.core.functionalDescription.gapping.splice(gapIndex, 1);
            this.assignLocalData(this.core);
            this.forceUpdate += 1;
        },
        processCore() {
            this.dataUpToDate = false;
            this.checkCollisions();
            this.taskQueueStore.processCore(this.core).then((core) => {
                this.core.functionalDescription = core.functionalDescription;
                this.core.processedDescription = core.processedDescription;
                this.core.geometricalDescription = core.geometricalDescription;
                this.calculateData();
                this.imageUpToDate = false;
                if (this.$settingsStore.magneticBuilderSettings.autoRedraw) {
                    this.redraw();
                }

            })
            .catch(error => {
                console.error(error);
            });

        },
        autoDistributeGaps(columnIndex){
            const realColumnIndex = this.reorderedColumns[columnIndex].index;
            let totalAvailableHeight = this.core.processedDescription.columns[realColumnIndex].height;

            this.reorderedColumns[columnIndex].gaps.forEach((elem) => {
                totalAvailableHeight -= this.core.functionalDescription.gapping[elem.index].length;
            })

            const coreChunkSize = totalAvailableHeight / (this.reorderedColumns[columnIndex].gaps.length + 1);
            let heightPosition = this.core.processedDescription.columns[realColumnIndex].height / 2;

            heightPosition -= coreChunkSize;
            const aux = [];
            this.reorderedColumns[columnIndex].gaps.forEach((elem) => {
                const gap = this.core.functionalDescription.gapping[elem.index];
                heightPosition -= gap.length / 2;
                this.core.functionalDescription.gapping[elem.index].coordinates[1] = roundWithDecimals(heightPosition, 0.00001);
                heightPosition -= gap.length / 2 + coreChunkSize;
            })
            this.forceUpdate += 1;
            this.processCore();
        },
        checkCollisions() {
            this.gapErrorsPerColumn = [];
            this.reorderedColumns.forEach((column) => {
                const realColumnIndex = column.index;
                const columnHeight = this.core.processedDescription.columns[realColumnIndex].height;

                const gapErrors = [];
                const gapLimits = [];
                column.gaps.forEach((elem) => {
                    const gap = this.core.functionalDescription.gapping[elem.index];
                    gapLimits.push({
                        topHeight: gap.coordinates[1] + gap.length / 2,
                        bottomHeight: gap.coordinates[1] - gap.length / 2,
                    })                
                })
                gapLimits.forEach((comparedItem, comparedIndex) => {
                    if (comparedItem.topHeight > (columnHeight / 2)) {
                        gapErrors.push(`Gap is too high, it is overlapping with top plate by ${removeTrailingZeroes(roundWithDecimals((comparedItem.topHeight - columnHeight / 2) * 1000, 0.01), 2)} mm`);
                    }
                    else if (comparedItem.bottomHeight < -(columnHeight / 2)) {
                        gapErrors.push(`Gap is too low, it is overlapping with bottom plate by ${removeTrailingZeroes(roundWithDecimals((Math.abs(comparedItem.bottomHeight) - (columnHeight / 2)) * 1000, 0.01), 2)} mm`);
                    }
                    else {
                        gapLimits.forEach((comparingItem, comparingIndex) => {
                            if (comparedIndex != comparingIndex){
                                if ((comparedItem.topHeight >= comparingItem.bottomHeight) && (comparedItem.bottomHeight <= comparingItem.bottomHeight)){
                                    gapErrors.push(`Gap is too high, it is overlapping with another gap by ${removeTrailingZeroes(roundWithDecimals((comparedItem.topHeight - comparingItem.bottomHeight) * 1000, 0.01), 2)} mm`);
                                }
                                else if ((comparedItem.bottomHeight <= comparingItem.topHeight) && (comparedItem.topHeight >= comparingItem.topHeight)){
                                    gapErrors.push(`Gap is too low, it is overlapping with another gap by ${removeTrailingZeroes(roundWithDecimals(Math.abs(comparedItem.bottomHeight - comparingItem.topHeight) * 1000, 0.01), 2)} mm`);
                                }
                            }
                        })          
                    }
                })
                this.gapErrorsPerColumn.push(gapErrors);
            })
        },
        redraw() {
            this.errorMessage = "";
            this.localCoreToDraw= deepCopy(this.core);
            this.forceUpdate3DCore += 1;
            this.imageUpToDate = true;
        },
        calculateData() {
            let conditions = defaultOperatingConditions;
            if (this.inputs.operatingPoints[0] != null && this.inputs.operatingPoints[0].conditions != null) {
                conditions = this.inputs.operatingPoints[0].conditions;
            }
            this.taskQueueStore.getCoreTemperatureDependantParameters(this.core, conditions.ambientTemperature).then((coreTemperatureDependantParametersData) => {
                this.coreTemperatureDependantParametersData = coreTemperatureDependantParametersData
                this.dataUpToDate = true;
            })
            .catch(error => {
                console.error(error);
            });
        },
    },
    computed: {
        reorderedColumns() {
            if (this.localData.length == 3) {
                return [this.localData[1], this.localData[0], this.localData[2]];
            }
            else {
                return this.localData;
            }
        },
        columnNames() {
            if (this.localData.length == 3) {
                return ["Left column", "Central column", "Right column"];
            }
            else {
                return ["Winding column", "Return column"];
            }
        },
        columnImages() {
            if (this.localData.length == 3) {
                return ["/images/columns/leftColumn.svg", "/images/columns/centralColumn.svg", "/images/columns/rightColumn.svg"];
            }
            else {
                return ["/images/columns/centralColumn.svg", "/images/columns/rightColumn.svg"];
            }
        },
        gapTypesWithoutCustom() {
            const gapTypesWithoutCustom = [];
            gapTypes.forEach((elem) => {
                if (elem != "Custom") {
                    gapTypesWithoutCustom.push(elem);
                }
            })
            return gapTypesWithoutCustom;

        },
    }
}
</script>

<template>
    <div class="container">
        <div class="row">
            <h2 
                class="col-4 mb-3 text-center"
                >
                {{'Core Gap Customizer'}}
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
        <div class="row">
            <div
                v-for="(gapsPerColumn, columnIndex) in reorderedColumns"
                :key="'column-' + columnIndex"
                class="column-container col-4 md:col-3 row mb-1 text-center mx-0"
                :style="{'background-image': `url(${columnImages[columnIndex]}`}"
            >
                <div>
                    <label
                        :style="combinedStyle([{'background': 'transparent'}, $styleStore.magneticBuilder.inputTitleFontSize])"
                        class="text-center"
                    >
                        {{columnNames[columnIndex]}}
                    </label>
                    <ElementFromList
                        class="col-12 px-4 mb-3 text-left"
                        :dataTestLabel="dataTestLabel + '-GapType'"
                        :name="'type'"
                        :titleSameRow="true"
                        :justifyContent="true"
                        v-model="reorderedColumns[columnIndex]"
                        :options="gapTypesWithoutCustom"
                        :labelWidthProportionClass="'col-12 md:col-4'"
                        :valueWidthProportionClass="'col-12 md:col-8'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="{'background': 'transparent'}"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                        @update="gapTypeChanged($event, columnIndex)"
                    />
                    <div 
                        v-if="gapsPerColumn.type == 'Distributed'"
                        class="px-3 my-1 mb-3"
                    >
                        <button
                            :style="$styleStore.magneticBuilder.addButton"
                            :data-cy="dataTestLabel + 'add-gap-button'"
                            class="btn col-12 md:col-6 px-0"
                            @click="addGap(columnIndex)"

                        >
                            {{'Add Gap'}}
                        </button>
                        <button
                            :style="$styleStore.magneticBuilder.utilityButton"
                            :data-cy="dataTestLabel + 'add-gap-button'"
                            class="btn col-12 md:col-6 px-0"
                            @click="autoDistributeGaps(columnIndex)"

                        >
                            {{'Auto Place'}}
                        </button>
                    </div>
                    <div
                        v-for="(gap, gapIndex) in gapsPerColumn.gaps"
                        :key="'gap-' + gapIndex"
                        class="col-12 mb-1 px-2 text-left"
                    >
                        <AdvancedCoreSelectorGap 
                            :dataTestLabel="dataTestLabel + '-AdvancedCoreSelectorGap-' + gap.index"
                            :gap="core.functionalDescription.gapping[gap.index]"
                            :forceUpdate="forceUpdate"
                            :readOnly="reorderedColumns[columnIndex].type == 'Ungapped'"
                            :enableRemoveButton="gapsPerColumn.gaps.length > 1"
                            @gapLengthChanged="gapLengthChanged($event, gap.index)"
                            @gapHeightChanged="gapHeightChanged($event, gap.index)"
                            @removeGap="removeGap(gap.index)"

                        >
                        <label class="text-danger col-12 pt-1" style="font-size: 1em">{{gapErrorsPerColumn[columnIndex][gapIndex]}}</label>
                        
                        </AdvancedCoreSelectorGap>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <h3 class= "mb-3"> {{'3D model'}} </h3>
                <div
                    v-if="core.functionalDescription != null"
                    class="row"
                    style="height: 30vh"
                    :style="imageUpToDate? 'opacity: 100%;' : 'opacity: 20%;'"
                >
                    <Core3DVisualizer 
                        :dataTestLabel="`${dataTestLabel}-Core3DVisualizer`"
                        :core="localCoreToDraw"
                        :forceUpdate="forceUpdate3DCore"
                        :fullCoreModel="true"
                        :loadingGif="$settingsStore.loadingGif"
                        :backgroundColor="$styleStore.magneticBuilder.main['background-color']"
                        @errorInDimensions="errorInDimensions"
                        @renderSuccess="clearError"
                    />
                </div>
                <h3 class= "mb-3"> {{'Technical Drawing'}} </h3>
                <div
                    v-if="core.functionalDescription != null"
                    class="row"
                    :style="imageUpToDate? 'opacity: 100%;' : 'opacity: 20%;'"
                >
                    <Core2DVisualizer
                        :dataTestLabel="`${dataTestLabel}-Core2DVisualizerGapping`"
                        :core="localCoreToDraw"
                        :forceUpdate="forceUpdate3DCore"
                        :gappingMode="true"
                        :loadingGif="$settingsStore.loadingGif"
                        :backgroundColor="$styleStore.magneticBuilder.main['background-color']"
                        @errorInDimensions="errorInDimensions"
                        @renderSuccess="clearError"
                    />
                </div>
                <div
                    v-if="core.functionalDescription != null"
                    class="border-bottom border-top row text-left py-2"
                    :style="dataUpToDate? 'opacity: 100%;' : 'opacity: 20%;'"
                >
                    <DimensionReadOnly 
                        class="col-12 pr-4 pl-3"
                        :name="'μ'"
                        :subscriptName="'ini'"
                        :unit="null"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-InitialPermeability'"
                        :numberDecimals="0"
                        :value="coreTemperatureDependantParametersData.initialPermeability"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-5'"
                        :valueWidthProportionClass="'col-7'"
                        :valueFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <DimensionReadOnly 
                        class="col-12 pr-4 pl-3"
                        :name="'μ'"
                        :subscriptName="'eff'"
                        :unit="null"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-EffectivePermeability'"
                        :numberDecimals="0"
                        :value="coreTemperatureDependantParametersData.effectivePermeability"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-5'"
                        :valueWidthProportionClass="'col-7'"
                        :valueFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <DimensionReadOnly 
                        class="col-12 pr-4 pl-3"
                        :name="'A'"
                        :subscriptName="'L ungap.'"
                        :unit="'H/tu²'"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-Permeance'"
                        :numberDecimals="0"
                        :value="coreTemperatureDependantParametersData.permeance"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-5'"
                        :valueWidthProportionClass="'col-7'"
                        :valueFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <DimensionReadOnly 
                        class="col-12 pr-4 pl-3"
                        :name="'A'"
                        :subscriptName="'L gap.'"
                        :unit="'H/tu²'"
                        :power="1"
                        :dataTestLabel="dataTestLabel + '-Permeance'"
                        :numberDecimals="0"
                        :value="1 / coreTemperatureDependantParametersData.reluctance"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-5'"
                        :valueWidthProportionClass="'col-7'"
                        :valueFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                </div>
            </div>
            <label class="text-danger col-12 pt-1" style="font-size: 1em">{{errorMessage}}</label>

        </div>
    </div>
</template>

<style>
@media (min-width: 1200px) {
    .column-container {
        background-size: 80%; 
        background-repeat: no-repeat;
        background-position: center top;
        height: auto;
        min-height: 52vh;
    }
}
</style>
