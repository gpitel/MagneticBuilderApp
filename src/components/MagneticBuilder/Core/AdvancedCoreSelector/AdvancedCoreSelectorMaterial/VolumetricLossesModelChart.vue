<script setup>
import PropertyTool from '/WebSharedComponents/Common/PropertyTool.vue'
import { useTaskQueueStore } from '../../../../../stores/taskQueue'
</script>

<script>
// ABT #166: display-only Pv(f) curves computed BY THE ENGINE for the
// material's active loss model. This is what renders core losses for
// materials whose model has no measured points and no frontend-displayable
// equation (steinmetz/roshen ferrites — previously a silent blank).
export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        material: {
            type: Object,
            required: true,
        },
        temperature: {
            type: Number,
            default: 25,
        },
        magneticFluxDensityPeaks: {
            type: Array,
            default: () => [0.05, 0.1, 0.2],
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const configuration = {
            xAxisLabel: 'frequency',
            yAxisLabel: 'value',
            xAxisReplaceLabel: 'freq.',
            yAxisReplaceLabel: [],
            xAxisMode: 'log',
            yAxisMode: 'log',
            xAxisUnit: 'Hz',
            yAxisUnit: 'W/m³',
            xAxisAllowNegative: false,
            yAxisAllowNegative: false,
            xAxisDefaultValue: 10000,
            yAxisDefaultValue: 1,
            xAxisNumberDecimals: 0,
            yAxisNumberDecimals: 0,
            xAxisMin: 1000,
            yAxisMin: 1,
            xAxisMax: 15000000,
            yAxisMax: 10000000000,
        };
        return {
            taskQueueStore,
            configuration,
            localData: [],
            methodUsed: "",
            errorMessage: "",
        };
    },
    mounted() {
        this.sample();
    },
    methods: {
        async sample() {
            this.errorMessage = "";
            try {
                const series = [];
                const labels = [];
                for (const peak of this.magneticFluxDensityPeaks) {
                    const sweep = await this.taskQueueStore.sweepVolumetricLossesOverFrequency(
                        this.material, this.temperature, peak, 10000, 1000000, 16);
                    series.push(sweep.points);
                    labels.push(`${peak * 1000} mT`);
                    this.methodUsed = sweep.methodUsed;
                }
                this.configuration.yAxisReplaceLabel = labels;
                this.localData = series;
            }
            catch (error) {
                // Loud in place: the engine could not evaluate this material's
                // loss model (e.g. the model needs data the material lacks).
                this.errorMessage = String(error?.message ?? error);
                console.error(error);
            }
        },
    },
}
</script>

<template>
    <PropertyTool
        v-if="localData.length > 0"
        :dataTestLabel="dataTestLabel + '-PropertyTool'"
        :title="`Volumetric Losses model (${methodUsed}) at ${temperature} °C`"
        :enableEditing="false"
        :properties="localData"
        :propertiesConfiguration="configuration"
        :chartStyle="'height: 30vh'"
        :smoothLine="true"
        :chartPaddings="{top: 30, left: 75, right: 2, bottom: 30}"
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
    <label v-if="errorMessage != ''" class="text-danger col-12 pt-1" style="font-size: 0.9em">{{ errorMessage }}</label>
</template>
