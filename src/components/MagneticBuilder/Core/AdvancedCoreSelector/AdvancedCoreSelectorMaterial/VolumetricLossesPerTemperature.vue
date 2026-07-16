<script setup>
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import PropertyTool from '/WebSharedComponents/Common/PropertyTool.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import { useTaskQueueStore } from '../../../../../stores/taskQueue'

</script>

<script>

export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        data: {
            type: Object,
            required: true,
        },
        frequencyRanges: {
            type: Object,
            default: [[0, 150000], [150000, 350000], [350000, 40000000]]
        },
        enableSimulation: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const indexes = [];
        const blockingRebounds = false;
        const configurationPerTemperature = {
            xAxisLabel: '',
            yAxisLabel: 'value',
            xAxisReplaceLabel: 'freq.',
            yAxisReplaceLabel: [],
            xAxisMode: 'log',
            yAxisMode: 'log',
            xAxisUnit: 'Hz',
            yAxisUnit: 'W/m³',
            xAxisAllowNegative: true,
            yAxisAllowNegative: true,
            xAxisDefaultValue: 10000,
            yAxisDefaultValue: 1,
            xAxisNumberDecimals: 0,
            yAxisNumberDecimals: 2,
            xAxisMin: 1,
            yAxisMin: 0,
            xAxisMax: 15000000,
            yAxisMax: 10000000000,
        }


        const localData = [];
        const volumetricLossesPoints = [];
        const configuration = [];
        const temperatures = [];

        return {
            taskQueueStore,
            blockingRebounds,
            indexes,
            configurationPerTemperature,
            localData,
            volumetricLossesPoints,
            configuration,
            temperatures,
        }
    },
    watch: { 
        'data': {
            handler(newValue, oldValue) {
                if (!this.blockingRebounds) {
                    this.assignLocalData();
                    this.blockingRebounds = true;
                    setTimeout(() => this.blockingRebounds = false, 10);
                }
            },
          deep: true
        },
    },
    created () {
    },
    mounted () {
        this.assignLocalData();
    },
    methods: {
        assignLocalData() {
            this.localData = [];
            this.indexes = [];

            let distictTemperatures = [];
            let distictMagneticFluxDensities = [];
            let distictFrequencies = [];
            this.data.default.forEach((method) => {
                if (Array.isArray(method)) {
                    this.volumetricLossesPoints = method;
                }
            })
            this.volumetricLossesPoints.forEach((elem) => {
                if (!distictTemperatures.includes(elem.temperature)) {
                    distictTemperatures.push(elem.temperature);
                }
                if (!distictMagneticFluxDensities.includes(elem.magneticFluxDensity.magneticFluxDensity.processed.peak)) {
                    distictMagneticFluxDensities.push(elem.magneticFluxDensity.magneticFluxDensity.processed.peak);
                }
                if (!distictFrequencies.includes(elem.magneticFluxDensity.frequency)) {
                    distictFrequencies.push(elem.magneticFluxDensity.frequency);
                }
            })

            distictTemperatures = distictTemperatures.sort(function(a, b) {return a - b; });
            distictMagneticFluxDensities = distictMagneticFluxDensities.sort(function(a, b) {return a - b; });
            distictFrequencies = distictFrequencies.sort(function(a, b) {return a - b; });
            this.volumetricLossesPoints = this.volumetricLossesPoints.sort(function(a, b) {return a.value - b.value; });

            distictTemperatures.forEach((temperature, temperatureIndex) => {
                this.localData.push([]);
                this.indexes.push([]);
                if (distictMagneticFluxDensities.length <= distictFrequencies.length) {
                    this.configurationPerTemperature.xAxisLabel = 'frequency';
                    this.configurationPerTemperature.xAxisReplaceLabel = 'freq.';
                    this.configurationPerTemperature.xAxisUnit = 'Hz';
                    this.configurationPerTemperature.xAxisMin = 1;
                    this.configurationPerTemperature.xAxisMax = 15000000;
                    this.configuration.push(deepCopy(this.configurationPerTemperature));
                    distictMagneticFluxDensities.forEach((magneticFluxDensity, magneticFluxDensityIndex) => {
                        this.localData[this.localData.length - 1].push([]);
                        this.indexes[this.indexes.length - 1].push([]);
                        this.configuration[this.configuration.length - 1].yAxisReplaceLabel.push(String(magneticFluxDensity * 1000) + " mT")
                    })
                }
                else {
                    this.configurationPerTemperature.xAxisLabel = 'magneticFluxDensity';
                    this.configurationPerTemperature.xAxisReplaceLabel = 'B peak';
                    this.configurationPerTemperature.xAxisUnit = 'T';
                    this.configurationPerTemperature.xAxisMin = 0.001;
                    this.configurationPerTemperature.xAxisMax = 2;
                    this.configuration.push(deepCopy(this.configurationPerTemperature));
                    distictFrequencies.forEach((frequency, frequencyIndex) => {
                        this.localData[this.localData.length - 1].push([]);
                        this.indexes[this.indexes.length - 1].push([]);
                        this.configuration[this.configuration.length - 1].yAxisReplaceLabel.push(String(frequency / 1000) + " kHz")
                    })
                }
            })
            this.volumetricLossesPoints.forEach((datum, index) => {
                distictTemperatures.forEach((temperature, temperatureIndex) => {
                    if (datum.temperature == temperature) {
                        if (distictMagneticFluxDensities.length <= distictFrequencies.length) {
                            distictMagneticFluxDensities.forEach((magneticFluxDensity, magneticFluxDensityIndex) => {
                                if (datum.magneticFluxDensity.magneticFluxDensity.processed.peak == magneticFluxDensity) {
                                    this.indexes[temperatureIndex][magneticFluxDensityIndex].push(index);
                                    this.localData[temperatureIndex][magneticFluxDensityIndex].push({
                                        frequency: datum.magneticFluxDensity.frequency,
                                        value: datum.value
                                    })
                                }
                            })
                        }
                        else {
                            distictFrequencies.forEach((frequency, frequencyIndex) => {
                                if (datum.magneticFluxDensity.frequency == frequency) {
                                    this.indexes[temperatureIndex][frequencyIndex].push(index);
                                    this.localData[temperatureIndex][frequencyIndex].push({
                                        magneticFluxDensity: datum.magneticFluxDensity.magneticFluxDensity.processed.peak,
                                        value: datum.value
                                    })
                                }
                            })
                        }
                    }
                })
            })
            this.localData.forEach((elem, index) => {
                for (let i = elem.length - 1; i >=0 ; i--) {
                    if (elem[i].length < 1) {
                        elem.splice(i, 1);
                    }
                }
            })
            this.indexes.forEach((elem, index) => {
                for (let i = elem.length - 1; i >=0 ; i--) {
                    if (elem[i].length < 1) {
                        elem.splice(i, 1);
                    }
                }
            })
            this.temperatures = distictTemperatures;
        },
        onRemovePoint(temperatureIndex, seriesIndex, index) {
            this.volumetricLossesPoints.splice(this.indexes[temperatureIndex][seriesIndex][index], 1);
            this.assignLocalData();
        },
        onAddPoint(temperatureIndex, seriesIndex, index) {
            if (this.localData.length > 0) {
                const newElement = deepCopy(this.volumetricLossesPoints[this.indexes[temperatureIndex][seriesIndex][index]])
                this.volumetricLossesPoints.splice(this.indexes[temperatureIndex][seriesIndex][index] + 1, 0, newElement)
            }
            else {
                const aux = {};
                aux[this.configuration[temperatureIndex].xAxisLabel] = 0;
                aux[this.configuration[temperatureIndex].yAxisLabel] = 0;
                this.volumetricLossesPoints.push(aux);
            }
            this.assignLocalData();
        },
        onDimensionUpdate(temperatureIndex, event, seriesIndex, index) {
            if (!this.blockingRebounds) {
                // The guard used to check `this.event` (always undefined), so
                // inline edits were silently dropped; use the event argument.
                if (event != null) {
                    if (event.dimension == 'frequency') {
                        this.volumetricLossesPoints[this.indexes[temperatureIndex][seriesIndex][index]].magneticFluxDensity.frequency = event.value;
                    }

                    if (event.dimension == 'magneticFluxDensity') {
                        this.volumetricLossesPoints[this.indexes[temperatureIndex][seriesIndex][index]].magneticFluxDensity.magneticFluxDensity.processed.peak = event.value;
                    }
                    if (event.dimension == 'value') {
                        this.volumetricLossesPoints[this.indexes[temperatureIndex][seriesIndex][index]].value = event.value;
                    }
                }
                this.blockingRebounds = true;
                setTimeout(() => this.blockingRebounds = false, 10);
            }
        },
    }
}
</script>

<template>
    <PropertyTool
        v-if="localData.length > 0 && localData[0] != null"
        v-for="(temperature, temperatureIndex) in temperatures"
        :key="'temp-' + temperatureIndex"
        :dataTestLabel="dataTestLabel + '-PropertyTool'"
        :title="`Volumetric Losses at ${temperature} °C`"
        :properties="localData[temperatureIndex]"
        :propertiesConfiguration="configuration[temperatureIndex]"
        :chartStyle="'height: 30vh'"
        :smoothLine="true"
        :chartPaddings="{top: localData[temperatureIndex].length > 8? 80 : localData[temperatureIndex].length > 4? 50 : localData[temperatureIndex].length > 0? 30 : 10, left: 75, right: 2, bottom: 30}"
        @onRemovePoint="(seriesIndex, index) => onRemovePoint(temperatureIndex, seriesIndex, index)"
        @onAddPoint="(seriesIndex, index) => onAddPoint(temperatureIndex, seriesIndex, index)"
        @onDimensionUpdate="(event, seriesIndex, index) => onDimensionUpdate(temperatureIndex, event, seriesIndex, index)"
        :addElementButtonColor="$styleStore.magneticBuilder.addElementButtonColor"
        :removeElementButtonColor="$styleStore.magneticBuilder.removeElementButtonColor"
        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
        :valueBgColor="$styleStore.magneticBuilder.inputTextColor"
        :textColor="$styleStore.magneticBuilder.inputTextColor"
        :activeButton="$styleStore.magneticBuilder.activeButton"
        :inactiveButton="$styleStore.magneticBuilder.button"
        :visualizerBgColor="$styleStore.magneticBuilder.main['background-color']"
        :visualizerLineColor="$styleStore.magneticBuilder.main.color"
        :visualizerTextColor="$styleStore.magneticBuilder.main.color"
    />
</template>
