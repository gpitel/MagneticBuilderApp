<script setup>
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
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
        operatingPointIndex: {
            type: Number,
            default: 0,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();

        const coreLossesOverFrequencyData = [{
            label: 'Losses',
            data: {
                x: [0, 1],
                y: [0, 1],
            },
            colorLabel: getComputedStyle(document.documentElement).getPropertyValue('--p-primary').trim() || 'var(--p-primary)',
            type: 'log', // log or value
            position: 'left',
            unit: 'W',
        }]
        const frequencyData = {
            label: 'Frequency',
            colorLabel: getComputedStyle(document.documentElement).getPropertyValue('--p-secondary').trim() || 'var(--p-secondary)',
            type: 'log', // log or value
            unit: 'Hz',
        }
        const forceUpdate = 0;
        const recentChange = false;
        const tryingToSweep = false;
        const loading = false;
        const errorMessage = "";
        const subscriptions = [];

        return {
            taskQueueStore,
            coreLossesOverFrequencyData,
            frequencyData,
            forceUpdate,
            loading,
            recentChange,
            tryingToSweep,
            errorMessage,
            subscriptions,
            _sweepTimer: null,
            _triggerTimer: null,
        }
    },
    computed: {
    },
    watch: {
        '$stateStore.graphParameters': {
            handler(newValue, oldValue) {
                this.loading = true;
                if (this._triggerTimer) clearTimeout(this._triggerTimer);
                this._triggerTimer = setTimeout(() => {this.tryToSweep(); }, 10);
            },
          deep: true
        },
    },
    mounted () {
        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "wound" || name == "planarWound" || name == "coreShapeProcessed" || name == "coreMaterialProcessed") {
                    if (args[0]) {
                        this.loading = true;
                        this.recentChange = true;
                        if (this._triggerTimer) clearTimeout(this._triggerTimer);
                        this._triggerTimer = setTimeout(() => {this.tryToSweep(); }, 10);
                    }
                    else {
                        console.error(args[1])
                    }
                }
            });
        }))
        this.loading = true;
        this.recentChange = true;
        if (this._triggerTimer) clearTimeout(this._triggerTimer);
        this._triggerTimer = setTimeout(() => {this.tryToSweep(); }, 10);
    },
    beforeUnmount () {
        if (this._sweepTimer) clearTimeout(this._sweepTimer);
        if (this._triggerTimer) clearTimeout(this._triggerTimer);
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        tryToSweep() {
            if (!this.tryingToSweep) {
                this.recentChange = false;
                this.tryingToSweep = true;
                if (this._sweepTimer) clearTimeout(this._sweepTimer);
                this._sweepTimer = setTimeout(() => {
                    if (this.recentChange) {
                        this.tryingToSweep = false;
                        this.tryToSweep();
                    }
                    else {
                        this.tryingToSweep = false;
                        this.sweepCoreLossesOverFrequency();
                    }
                }
                , 500);
            }
        },
        sweepCoreLossesOverFrequency() {
            let ambientTemperature = defaultOperatingConditions.ambientTemperature;
            this.masStore.mas.inputs.operatingPoints.forEach((operatingPoint) => {
                ambientTemperature = Math.max(ambientTemperature, operatingPoint.conditions.ambientTemperature);
            })
            this.frequencyData.type = this.$stateStore.graphParameters.xAxisMode == "linear"? "value" : this.$stateStore.graphParameters.xAxisMode;
            this.coreLossesOverFrequencyData[0].type = this.$stateStore.graphParameters.yAxisMode == "linear"? "value" : this.$stateStore.graphParameters.yAxisMode;
            this.taskQueueStore.sweepCoreLossesOverFrequency(this.masStore.mas.magnetic, this.masStore.mas.inputs.operatingPoints[this.operatingPointIndex], this.$stateStore.graphParameters.minimumFrequency, this.$stateStore.graphParameters.maximumFrequency, this.$stateStore.graphParameters.numberPoints, ambientTemperature, this.$stateStore.graphParameters.xAxisMode, "Core Losses over frequency").then((curve2D) => {
                    this.coreLossesOverFrequencyData[0].data = {
                        x: curve2D.xPoints,
                        y: curve2D.yPoints,
                    };
                    this.coreLossesOverFrequencyData[0].xMaximum =Math.max(...curve2D.xPoints);
                    this.coreLossesOverFrequencyData[0].xMinimum =Math.min(...curve2D.xPoints);
                    this.coreLossesOverFrequencyData[0].yMaximum =Math.max(...curve2D.yPoints);
                    this.coreLossesOverFrequencyData[0].yMinimum =Math.min(...curve2D.yPoints);
                    this.forceUpdate += 1;
                    this.errorMessage = "";
                    this.loading = false;
            })
            .catch(error => {
                console.error(error);
                this.loading = false;
                this.errorMessage = "Error calculating core losses";
                this.coreLossesOverFrequencyData[0].data = {
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
                </div>
            </div>
            <div class="col-12 md:col-9 graph-viz-col">
                <img :data-cy="dataTestLabel + '-CoreLossesOverFrequency-loading'" v-if="loading" class="mx-auto d-block graph-loading" alt="loading" :src="$settingsStore.loadingGif">
                <label v-if="errorMessage != ''" :data-cy="dataTestLabel + '-BottomOrRightMarginErrorMessage'" class="text-danger m-0" style="font-size: 0.9em"> {{errorMessage}}</label>
                <LineVisualizer 
                    v-show="!loading"
                    :data="coreLossesOverFrequencyData"
                    :xAxisOptions="frequencyData"
                    :title="'Core Losses over Frequency'"
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