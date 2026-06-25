<script setup>
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import { removeTrailingZeroes, deepCopy, isMobile, toCamelCase } from '/WebSharedComponents/assets/js/utils.js'
import LineVisualizer from '/WebSharedComponents/Common/LineVisualizer.vue'
import { useTaskQueueStore } from '../../../stores/taskQueue'
import { defaultOperatingConditions } from '/WebSharedComponents/assets/js/defaults.js'
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
    },
    data() {
        const taskQueueStore = useTaskQueueStore();

        const resistancesOverFrequencyData = [{
            label: 'Resistance',
            data: {
                x: [0, 1],
                y: [0, 1],
            },
            colorLabel: getComputedStyle(document.documentElement).getPropertyValue('--p-primary').trim() || 'var(--p-primary)',
            type: 'log', // log or value
            position: 'left',
            unit: 'Ω',
        }]
        const frequencyData = {
            label: 'Frequency',
            colorLabel: getComputedStyle(document.documentElement).getPropertyValue('--p-secondary').trim() || 'var(--p-secondary)',
            type: 'log', // log or value
            unit: 'Hz',
        }
        const forceUpdate = 0;
        const recentChange = false;
        const tryingToSend = false;
        const loading = false;
        const localData = {
            selectedWinding: this.masStore.mas.magnetic.coil.functionalDescription[0].name,
        }

        return {
            taskQueueStore,
            resistancesOverFrequencyData,
            frequencyData,
            forceUpdate,
            localData,
            loading,
            recentChange,
            tryingToSend,
            _sweepTimer: null,
            _triggerTimer: null,
        }
    },
    computed: {
        windingNames() {
            const windingNames = [];
            this.masStore.mas.magnetic.coil.functionalDescription.forEach((elem) => {
                windingNames.push(elem.name);
            })

            return windingNames;
        }
    },
    watch: {
        'masStore.mas.magnetic.core': {
            handler(newValue, oldValue) {
                this.loading = true;
                if (this._triggerTimer) clearTimeout(this._triggerTimer);
                this._triggerTimer = setTimeout(() => {this.tryToSend(); }, 10);
            },
          deep: true
        },
        'masStore.mas.magnetic.coil.functionalDescription': {
            handler(newValue, oldValue) {
                this.loading = true;
                if (this._triggerTimer) clearTimeout(this._triggerTimer);
                this._triggerTimer = setTimeout(() => {this.tryToSend(); }, 10);
            },
          deep: true
        },
        '$stateStore.graphParameters': {
            handler(newValue, oldValue) {
                this.loading = true;
                if (this._triggerTimer) clearTimeout(this._triggerTimer);
                this._triggerTimer = setTimeout(() => {this.tryToSend(); }, 10);
            },
          deep: true
        },
    },
    mounted () {
        this.loading = true;
        if (this._triggerTimer) clearTimeout(this._triggerTimer);
        this._triggerTimer = setTimeout(() => {this.sweepResistancesOverFrequency(); }, 10);
    },
    beforeUnmount () {
        if (this._sweepTimer) clearTimeout(this._sweepTimer);
        if (this._triggerTimer) clearTimeout(this._triggerTimer);
    },
    methods: {
        tryToSend() {
            if (!this.tryingToSend) {
                this.recentChange = false;
                this.tryingToSend = true;
                if (this._sweepTimer) clearTimeout(this._sweepTimer);
                this._sweepTimer = setTimeout(() => {
                    if (this.recentChange) {
                        this.tryingToSend = false;
                        this.tryToSend();
                    }
                    else {
                        this.tryingToSend = false;
                        this.sweepResistancesOverFrequency();
                    }
                }
                , 500);
            }
        },
        updatedNumberWindings() {
            this.loading = true;
            if (this._triggerTimer) clearTimeout(this._triggerTimer);
            this._triggerTimer = setTimeout(() => {this.sweepResistancesOverFrequency(); }, 10);
        },
        sweepResistancesOverFrequency() {
            let ambientTemperature = defaultOperatingConditions.ambientTemperature;
            this.masStore.mas.inputs.operatingPoints.forEach((operatingPoint) => {
                ambientTemperature = Math.max(ambientTemperature, operatingPoint.conditions.ambientTemperature);
            })

            this.frequencyData.type = this.$stateStore.graphParameters.xAxisMode == "linear"? "value" : this.$stateStore.graphParameters.xAxisMode;
            this.resistancesOverFrequencyData[0].type = this.$stateStore.graphParameters.yAxisMode == "linear"? "value" : this.$stateStore.graphParameters.yAxisMode;

            let windingIndex = 0;
            this.masStore.mas.magnetic.coil.functionalDescription.forEach((elem, index) => {
                if (elem.name == this.localData.selectedWinding) {
                    windingIndex = index;
                }
            })

            this.taskQueueStore.sweepWindingResistanceOverFrequency(this.masStore.mas.magnetic, this.$stateStore.graphParameters.minimumFrequency, this.$stateStore.graphParameters.maximumFrequency, this.$stateStore.graphParameters.numberPoints, windingIndex, ambientTemperature, this.$stateStore.graphParameters.xAxisMode, "Resistance over frequency").then((curve2D) => {
                    this.resistancesOverFrequencyData[0].data = {
                        x: curve2D.xPoints,
                        y: curve2D.yPoints,
                    };
                    this.resistancesOverFrequencyData[0].xMaximum =Math.max(...curve2D.xPoints);
                    this.resistancesOverFrequencyData[0].xMinimum =Math.min(...curve2D.xPoints);
                    this.resistancesOverFrequencyData[0].yMaximum =Math.max(...curve2D.yPoints);
                    this.resistancesOverFrequencyData[0].yMinimum =Math.min(...curve2D.yPoints);
                    this.forceUpdate += 1;
                    this.loading = false;
            })
            .catch(error => {
                console.error(error);
                this.loading = false;
                this.resistancesOverFrequencyData[0].data = {
                    x: [],
                    y: [],
                };
                this.forceUpdate += 1;
            });
        },
    }
}
</script>

<template>
    <div class="graph-wrapper">
        <div class="grid">
            <div class="col-12 md:col-3">
                <div class="graph-params">
                    <slot/>
                    <ElementFromList class="text-left"
                        :name="'selectedWinding'"
                        :dataTestLabel="dataTestLabel + '-NumberWindings'"
                        :options="windingNames"
                        :titleSameRow="true"
                        v-model="localData"
                        @update="updatedNumberWindings"
                        :labelWidthProportionClass="'col-7'"
                        :selectStyleClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                </div>
            </div>
            <div class="col-12 md:col-9 graph-viz-col">
                <img :data-cy="dataTestLabel + '-ResistancesOverFrequency-loading'" v-if="loading" class="mx-auto d-block graph-loading" alt="loading" :src="$settingsStore.loadingGif">
                <LineVisualizer 
                    v-show="!loading"
                    :data="resistancesOverFrequencyData"
                    :xAxisOptions="frequencyData"
                    :title="'Resistances over Frequency'"
                    :forceUpdate="forceUpdate"
                    :bgColor="$styleStore.magneticBuilder.graphBgColor['background-color']"
                    :lineColor="$styleStore.magneticBuilder.graphLineColor.color"
                    :showPoints="false"
                    :tooltipTrigger="'axis'"
                    :pointsColor="$styleStore.magneticBuilder.graphPointsColor.color"
                    :textColor="$styleStore.magneticBuilder.inputTextColor.color"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.graph-wrapper {
    width: 100%;
}

.graph-params {
    background: rgba(var(--p-white-rgb), 0.04);
    border: 1px solid rgba(var(--p-white-rgb), 0.1);
    border-radius: 12px;
    padding: 0.6rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}

.graph-viz-col {
    display: flex;
    flex-direction: column;
}

.graph-loading {
    max-width: 60%;
    height: auto;
}
</style>