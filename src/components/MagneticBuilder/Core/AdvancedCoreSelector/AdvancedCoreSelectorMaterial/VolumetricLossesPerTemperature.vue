<script setup>
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import PropertyTool from '/WebSharedComponents/Common/PropertyTool.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
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
        const fitting = false;
        const fitReport = null;
        const fitError = null;

        return {
            fitting,
            fitReport,
            fitError,
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
            // One configuration per temperature, rebuilt with the curves: kept from the previous call,
            // a regrouped curve read the old axis and series labels.
            this.configuration = [];

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
                    // A loss point is (flux density, frequency, temperature, value). The chart plots
                    // value against frequency per flux density; the flux density and the temperature
                    // are edited on each row, so the user can enter the points at two or more flux
                    // densities the engine's loss-model fit needs.
                    this.configurationPerTemperature.extraFields = [this.fluxDensityField(), this.temperatureField()];
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
                    this.configurationPerTemperature.extraFields = [this.frequencyField(), this.temperatureField()];
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
                                        value: datum.value,
                                        magneticFluxDensity: datum.magneticFluxDensity.magneticFluxDensity.processed.peak,
                                        temperature: datum.temperature,
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
                                        value: datum.value,
                                        frequency: datum.magneticFluxDensity.frequency,
                                        temperature: datum.temperature,
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
        fluxDensityField() {
            return { name: 'magneticFluxDensity', replaceLabel: 'Peak flux density', unit: 'T', min: 1e-4, max: 2,
                numberDecimals: 4, allowNegative: false, allowZero: false,
                tooltip: tooltipsMagneticBuilder.materialLossesMagneticFluxDensity };
        },
        frequencyField() {
            return { name: 'frequency', replaceLabel: 'Frequency', unit: 'Hz', min: 1, max: 15000000,
                numberDecimals: 0, allowNegative: false, allowZero: false,
                tooltip: tooltipsMagneticBuilder.materialLossesFrequency };
        },
        temperatureField() {
            return { name: 'temperature', replaceLabel: 'Temperature', unit: '°C', min: -100, max: 300,
                numberDecimals: 1, allowNegative: true, allowZero: true,
                tooltip: tooltipsMagneticBuilder.materialLossesTemperature };
        },
        // Measured points give the engine no core-loss model (MKF's CoreLossesModel::get_methods reads only
        // models). MKF fits a Steinmetz model to them over the frequencies they span; it is stored next to
        // the points, replacing a Steinmetz model the material had. MKF refuses points that do not
        // determine the fit (one frequency, one flux density, too few points), and says why.
        async fitSteinmetz() {
            this.fitReport = null;
            this.fitError = null;
            this.fitting = true;
            try {
                const points = this.volumetricLossesPoints.map((point) => deepCopy(point));
                const frequencies = points.map((point) => point.magneticFluxDensity.frequency);
                const range = [Math.min(...frequencies), Math.max(...frequencies)];
                const fit = await this.taskQueueStore.calculateSteinmetzCoefficients(points, [range]);
                const steinmetz = { method: 'steinmetz', ranges: fit.coefficientsPerRange };
                const methods = this.data.default;
                const existing = methods.findIndex((method) => !Array.isArray(method) && method?.method === 'steinmetz');
                if (existing >= 0) {
                    methods.splice(existing, 1, steinmetz);
                }
                else {
                    methods.push(steinmetz);
                }
                const errors = fit.errorPerRange.map((error) => `${(error * 100).toFixed(1)} %`).join(', ');
                this.fitReport = `Steinmetz model fitted to ${points.length} points from ${range[0] / 1000} kHz to ${range[1] / 1000} kHz, average fit error ${errors}`;
            }
            catch (error) {
                this.fitError = String(error?.message ?? error).replace(/^(Error: )?Exception: /, '');
            }
            finally {
                this.fitting = false;
            }
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
                    if (event.dimension == 'temperature') {
                        this.volumetricLossesPoints[this.indexes[temperatureIndex][seriesIndex][index]].temperature = event.value;
                    }
                }
                // A changed flux density, frequency or temperature can move the point to another
                // curve (or another temperature): regroup now, as the data watcher is blocked below.
                const regroup = event != null && ['magneticFluxDensity', 'frequency', 'temperature'].includes(event.dimension);
                this.blockingRebounds = true;
                setTimeout(() => this.blockingRebounds = false, 10);
                if (regroup) {
                    this.assignLocalData();
                }
            }
        },
    }
}
</script>

<template>
    <div>
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
    <div v-if="volumetricLossesPoints.length > 0" class="vl-fit-row">
        <button
            :data-cy="dataTestLabel + '-fit-steinmetz-button'"
            :style="$styleStore.magneticBuilder.addButton"
            class="btn"
            :disabled="fitting"
            v-tooltip="tooltipsMagneticBuilder.materialLossesFitSteinmetz"
            @click="fitSteinmetz"
        >
            {{'Fit Steinmetz model to the points'}}
        </button>
        <label v-if="fitReport != null" :data-cy="dataTestLabel + '-fit-steinmetz-report'" class="vl-fit-report">{{fitReport}}</label>
        <label v-if="fitError != null" :data-cy="dataTestLabel + '-fit-steinmetz-error'" class="text-danger vl-fit-report">{{fitError}}</label>
    </div>
    </div>
</template>

<style scoped>
.vl-fit-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
}

.vl-fit-report {
    flex: 1 1 100%;
    font-size: 0.9em;
    white-space: pre-wrap;
}
</style>
