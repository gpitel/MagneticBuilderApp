<script setup>
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import PropertyTool from '/WebSharedComponents/Common/PropertyTool.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import Text from '/WebSharedComponents/DataInput/Text.vue'
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
        const indexes = [];
        const configuration = {
                xAxisLabel: 'temperature',
                yAxisLabel: 'magneticField',
                xAxisReplaceLabel: 'Temp.',
                yAxisReplaceLabel: ['Coerc.'],
                xAxisMode: 'linear',
                yAxisMode: 'linear',
                xAxisUnit: '°C',
                yAxisUnit: 'A/m',
                xAxisAllowNegative: true,
                yAxisAllowNegative: false,
                xAxisDefaultValue: 25,
                yAxisDefaultValue: 1,
                xAxisNumberDecimals: 1,
                yAxisNumberDecimals: 1,
                xAxisMin: -100,
                yAxisMin: 1,
                xAxisMax: 300,
                yAxisMax: 10000,
        }

        const localData = [];

        const taskQueueStore = useTaskQueueStore();

        return {
            indexes,
            configuration,
            localData,
            taskQueueStore,
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
                this.localData = [];
                this.taskQueueStore.getDefaults().then((defaults) => {
                    this.data.forEach((elem) => {
                        if (elem.temperature == null) {
                            elem.temperature = defaults.get('ambientTemperature');
                        }
                        this.localData.push(elem);
                    })
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
        :title="'Coercivity vs Temperature'"
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
