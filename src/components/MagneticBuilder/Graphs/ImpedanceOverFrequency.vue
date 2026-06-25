<script setup>
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'

import { removeTrailingZeroes, deepCopy, isMobile, toCamelCase } from '/WebSharedComponents/assets/js/utils.js'
import LineVisualizer from '/WebSharedComponents/Common/LineVisualizer.vue'
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
    },
    data() {
        const taskQueueStore = useTaskQueueStore();

        const impedanceOverFrequencyData = [{
            label: 'Impedance',
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
        const loading = false;
        const recentChange = false;
        const tryingToSweep = false;
        const errorMessage = "";
        const subscriptions = [];

        return {
            taskQueueStore,
            impedanceOverFrequencyData,
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
        impedancePoints() {
            const points = [];
            if (this.masStore.mas.inputs.designRequirements.minimumImpedance != null) {
                // The CMC-inputs builder can emit several entries at the same
                // frequency (the user's requirement + a derived/margined one), and
                // impedance.magnitude is a DimensionWithTolerance ({nominal,…})
                // after autocomplete. Collapse to one point per frequency, keeping
                // the smallest |Z| — the user's un-margined requirement (e.g. the
                // entered 1 kΩ, not the derived 1.53 kΩ) — so it matches the input.
                const reqByFrequency = new Map();
                this.masStore.mas.inputs.designRequirements.minimumImpedance.forEach((elem) => {
                    const mag = elem.impedance.magnitude;
                    const y = (mag != null && typeof mag === 'object')
                        ? (mag.nominal ?? mag.minimum ?? mag.maximum)
                        : mag;
                    if (y == null) return;
                    const prev = reqByFrequency.get(elem.frequency);
                    if (prev == null || y < prev) reqByFrequency.set(elem.frequency, y);
                });
                reqByFrequency.forEach((y, x) => {
                    points.push({
                        data: { x, y },
                        unit: 'Ω',
                        colorLabel: 'danger',
                    });
                });
            }
            return points;
        }
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
                        this.sweepImpedanceOverFrequency();
                    }
                }
                , 500);
            }
        },
        sweepImpedanceOverFrequency() {
            this.frequencyData.type = this.$stateStore.graphParameters.xAxisMode == "linear"? "value" : this.$stateStore.graphParameters.xAxisMode;
            this.impedanceOverFrequencyData[0].type = this.$stateStore.graphParameters.yAxisMode == "linear"? "value" : this.$stateStore.graphParameters.yAxisMode;
            this.taskQueueStore.sweepImpedanceOverFrequency(this.masStore.mas.magnetic, this.$stateStore.graphParameters.minimumFrequency, this.$stateStore.graphParameters.maximumFrequency, this.$stateStore.graphParameters.numberPoints, this.$stateStore.graphParameters.xAxisMode, "Impedance over frequency").then((curve2D) => {
                this.impedanceOverFrequencyData[0].data = {
                    x: curve2D.xPoints,
                    y: curve2D.yPoints,
                };
                this.impedanceOverFrequencyData[0].xMaximum =Math.max(...curve2D.xPoints);
                this.impedanceOverFrequencyData[0].xMinimum =Math.min(...curve2D.xPoints);
                this.impedanceOverFrequencyData[0].yMaximum =Math.max(...curve2D.yPoints);
                this.impedanceOverFrequencyData[0].yMinimum =Math.min(...curve2D.yPoints);
                this.forceUpdate += 1;
                this.errorMessage = "";
                this.loading = false;
            })
            .catch(error => {
                console.error(error);
                this.loading = false;
                
                // Parse the error message to provide user-friendly feedback
                const errorStr = error?.message || error?.toString() || "";
                if (errorStr.includes("MATERIAL_DATA_MISSING") && errorStr.includes("Complex permeability")) {
                    // Extract material name from error message
                    const materialMatch = errorStr.match(/Material data missing for: ([^(]+)/);
                    const materialName = materialMatch ? materialMatch[1].trim() : "the selected material";
                    this.errorMessage = `Complex permeability data is not available for ${materialName}. Please select a different material with complex permeability data.`;
                } else if (errorStr.includes("MATERIAL_DATA_MISSING")) {
                    this.errorMessage = "Required material data is missing. Please select a different material.";
                } else {
                    this.errorMessage = "Error calculating impedance";
                }
                
                this.impedanceOverFrequencyData[0].data = {
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

                <img :data-cy="dataTestLabel + '-ResistancesOverFrequency-loading'" v-if="loading" class="mx-auto d-block graph-loading" alt="loading" :src="$settingsStore.loadingGif">
                <label v-if="errorMessage != ''" :data-cy="dataTestLabel + '-BottomOrRightMarginErrorMessage'" class="text-danger m-0" style="font-size: 0.9em"> {{errorMessage}}</label>
                <LineVisualizer 
                    v-else
                    v-show="!loading"
                    :data="impedanceOverFrequencyData"
                    :points="impedancePoints"
                    :xAxisOptions="frequencyData"
                    :title="'Impedance over Frequency'"
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