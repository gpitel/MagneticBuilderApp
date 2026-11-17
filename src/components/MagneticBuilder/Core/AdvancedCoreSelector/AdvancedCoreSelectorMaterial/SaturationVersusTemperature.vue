<script setup>
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import PropertyTool from '/WebSharedComponents/Common/PropertyTool.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import Text from '/WebSharedComponents/DataInput/Text.vue'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import { useTaskQueueStore } from '../../../../../stores/taskQueue'

</script>

<script>

export default {
    emits: ["convertToArray"],
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
        const taskQueueStore = useTaskQueueStore();
        const indexes = [];
        const configuration = {
                xAxisLabel: 'temperature',
                yAxisLabel: 'magneticFluxDensity',
                xAxisReplaceLabel: 'Temp.',
                yAxisReplaceLabel: ['Sat.'],
                xAxisMode: 'linear',
                yAxisMode: 'linear',
                xAxisUnit: '°C',
                yAxisUnit: 'T',
                xAxisAllowNegative: true,
                yAxisAllowNegative: false,
                xAxisDefaultValue: 25,
                yAxisDefaultValue: 1,
                xAxisNumberDecimals: 1,
                yAxisNumberDecimals: 3,
                xAxisMin: -100,
                yAxisMin: 0.001,
                xAxisMax: 300,
                yAxisMax: 2,
                // A saturation point is a MAS bhCyclePoint: flux density AND magnetic field AND
                // temperature are all required. The chart plots flux density against temperature;
                // the field is edited on each point's row.
                extraFields: [{
                    name: 'magneticField',
                    replaceLabel: 'Magnetic field',
                    unit: 'A/m',
                    min: 1e-3,
                    max: 1e7,
                    numberDecimals: 1,
                    allowNegative: false,
                    allowZero: false,
                    tooltip: tooltipsMagneticBuilder.materialSaturationMagneticField,
                }],
        }

        const localData = [];

        return {
            taskQueueStore,
            indexes,
            configuration,
            localData,
        }
    },
    watch: {
        'data': {
            handler(newValue, oldValue) {
                this.assignLocalData();
            },
          deep: false
        },
    },
    created () {
    },
    mounted () {
        if (this.data != null) {
            if (this.data.length != null) {
                this.assignLocalData();
            }
            else {
                this.$emit("convertToArray")
            }
        }
    },
    methods: {
        assignLocalData() {

            if (typeof(this.data) == "object") {
                this.taskQueueStore.getDefaults().then((defaults) => {
                    // Rebuilt from scratch on every call: appending to the previous list showed every
                    // point again after each add or remove. The rows are the data's own points, in
                    // order, so row i edits data[i].
                    const localData = [];
                    const indexes = [];
                    this.data.forEach((elem, index) => {
                        if (elem.temperature == null) {
                            elem.temperature = defaults.get('ambientTemperature');
                        }
                        localData.push(elem);
                        indexes.push(index);
                    })
                    this.localData = localData;
                    this.indexes = indexes;
                })
            }
        },
        onRemovePoint(seriesIndex, index) {
            this.data.splice(this.indexes[index], 1);
            this.assignLocalData();
        },
        onAddPoint(seriesIndex, index) {
            if (this.localData.length > 0) {
                const newElement = deepCopy(this.data[this.indexes[index]])
                this.data.splice(this.indexes[index] + 1, 0, newElement)
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
            this.data[this.indexes[index]][event.dimension] = event.value;
        },
    }
}
</script>

<template>
    <PropertyTool
        v-if="data != null"
        :dataTestLabel="dataTestLabel + '-PropertyTool'"
        :title="'Saturation vs Temperature'"
        :properties="[localData]"
        :propertiesConfiguration="configuration"
        :chartStyle="'height: 20vh'"
        :chartPaddings="{top: 30, left: 60, right: 10, bottom: 30}"
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
