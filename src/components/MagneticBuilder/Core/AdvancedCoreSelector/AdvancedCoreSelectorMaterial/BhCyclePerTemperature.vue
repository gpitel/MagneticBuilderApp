<script setup>
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import PropertyTool from '/WebSharedComponents/Common/PropertyTool.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'

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
        enableSimulation: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        const indexes = [];
        const configuration = {
            xAxisLabel: 'magneticField',
            yAxisLabel: 'magneticFluxDensity',
            xAxisReplaceLabel: 'H',
            yAxisReplaceLabel: [],
            xAxisMode: 'linear',
            yAxisMode: 'linear',
            xAxisUnit: 'A/m',
            yAxisUnit: 'T',
            xAxisAllowNegative: true,
            yAxisAllowNegative: true,
            xAxisDefaultValue: 10000,
            yAxisDefaultValue: 1,
            xAxisNumberDecimals: 0,
            yAxisNumberDecimals: 3,
            xAxisMin: -1500,
            yAxisMin: -1,
            xAxisMax: 1500,
            yAxisMax: 1,
        }


        const localData = [];

        return {
            indexes,
            configuration,
            localData,
        }
    },
    watch: { 
    },
    created () {
    },
    mounted () {
        this.assignLocalData();
    },
    methods: {
        assignLocalData() {
            this.localData = [];

            const distictTemperatures = [];
            this.data.forEach((elem) => {
                if (!distictTemperatures.includes(elem.temperature)) {
                    distictTemperatures.push(elem.temperature);
                }
            })

            distictTemperatures.forEach((temperature, temperatureIndex) => {
                this.localData.push([]);
                this.indexes.push([]);
                this.configuration.yAxisReplaceLabel.push(`B@${temperature}`)
            })
            this.data.forEach((datum, index) => {
                distictTemperatures.forEach((temperature, temperatureIndex) => {
                    if (datum.temperature == temperature) {
                        this.indexes[temperatureIndex].push(index);
                        this.localData[temperatureIndex].push({
                            magneticField: datum.magneticField,
                            magneticFluxDensity: datum.magneticFluxDensity,
                        })
                    }
                })
            })
        },
        onRemovePoint(seriesIndex, index) {
            this.data.splice(this.indexes[seriesIndex][index], 1);
            this.assignLocalData();
        },
        onAddPoint(seriesIndex, index) {
            if (this.localData.length > 0) {
                const newElement = deepCopy(this.data[this.indexes[seriesIndex][index]])
                this.data.splice(this.indexes[seriesIndex][index] + 1, 0, newElement)
            }
            else {
                const aux = {};
                aux[this.configuration.xAxisLabel] = 0;
                aux[this.configuration.yAxisLabel] = 0;
                this.data.push(aux);
            }
            this.assignLocalData();
        },
        onDimensionUpdate(event, seriesIndex, index) {
            // Update the edited field of the point; assigning the raw scalar
            // over the whole {temperature, H, B} object corrupted the record.
            this.data[this.indexes[seriesIndex][index]][event.dimension] = event.value;
            this.assignLocalData();
        },
    }
}
</script>

<template>
    <PropertyTool
        v-if="data != null"
        :dataTestLabel="dataTestLabel + '-PropertyTool'"
        :title="'BH Cycle per Temperature'"
        :properties="localData"
        :propertiesConfiguration="configuration"
        :chartStyle="'height: 30vh'"
        :smoothLine="true"
        @onRemovePoint="onRemovePoint"
        @onAddPoint="onAddPoint"
        @onDimensionUpdate="onDimensionUpdate"
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
