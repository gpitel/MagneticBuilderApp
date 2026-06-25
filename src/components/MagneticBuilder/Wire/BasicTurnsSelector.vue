<script setup>
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import { checkAndFixMas, deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import { useHistoryStore } from '../../../stores/history'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'
</script>

<script>

export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        windingIndex: {
            type: Number,
            default: 0,
        },
        masStore: {
            type: Object,
            required: true,
        },
        readOnly: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const historyStore = useHistoryStore();
        const loading = false;
        const blockingRebounds = false;
        const forceUpdate = 0;
        const recentChange = false;
        const tryingToAssign = false;
        const localData = {
            numberTurns: 1,
            numberParallels: 1,
        };
        const subscriptions = [];

        return {
            taskQueueStore,
            blockingRebounds,
            historyStore,
            localData,
            forceUpdate,
            loading,
            recentChange,
            tryingToAssign,
            subscriptions,
        }
    },
    computed: {
    },
    watch: {
        // 'masStore.mas.magnetic.coil.functionalDescription': {
        //     handler(newValue, oldValue) {
        //         if (!this.blockingRebounds && (newValue[this.windingIndex].numberTurns != this.localData.numberTurns || newValue[this.windingIndex].numberParallels != this.localData.numberParallels)) {
        //             this.assignLocalData(newValue[this.windingIndex])
        //             this.blockingRebounds = true;
        //             setTimeout(() => this.blockingRebounds = false, 10);
        //         }
        //     },
        //   deep: true
        // },
    },
    mounted () {
        // this.cleanCoil();


        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "numberTurnsCalculated") {
                    if (args[0]) {
                        const numberTurns = args[1];
                        const dummyWinding = {
                            numberTurns: numberTurns[this.windingIndex],
                            numberParallels: 1,
                        }
                        this.assignLocalData(dummyWinding);
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "newWireCreated") {
                    if (args[0]) {
                        // Update local data when wire is advised/created
                        this.assignLocalData(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex]);
                    }
                }
            });
        }))

        this.blockingRebounds = true;
        setTimeout(() => this.blockingRebounds = false, 10);

        this.subscriptions.push(this.historyStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "historyPointerUpdated") {
                    this.assignLocalData(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex])
                    this.blockingRebounds = true;
                    setTimeout(() => this.blockingRebounds = false, 10);
                }
            });
        }))

        try {
            this.assignLocalData(this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex])
        }
        catch (error) {
            console.error(error);
        }
    },
    beforeUnmount () {
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        tryToAssign() {
            if (!this.tryingToAssign) {
                this.recentChange = false;
                this.tryingToAssign = true;
                setTimeout(() => {
                    if (this.recentChange) {
                        this.tryingToAssign = false;
                        this.tryToAssign();
                    }
                    else {
                        this.assignTurns();
                    }
                }
                , 100);
            }
        },
        cleanCoil() {
            setTimeout(() => {
                this.masStore.mas.magnetic.coil.turnsDescription = null;
                this.masStore.mas.magnetic.coil.layersDescription = null;
                this.masStore.mas.magnetic.coil.sectionsDescription = null;
            }, 50);
        },
        assignLocalData(winding) {
            this.localData["numberTurns"] = winding.numberTurns;
            this.localData["numberParallels"] = winding.numberParallels;
            this.forceUpdate += 1;
        },
        assignTurns() {
            if (!this.blockingRebounds && !this.taskQueueStore.windingIndexChangeBlock) {
                this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].numberTurns = this.localData["numberTurns"];
                this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].numberParallels = this.localData["numberParallels"];
                this.tryingToAssign = false;
                this.$emit("turnsUpdated", this.windingIndex);
                this.taskQueueStore.numberTurnsUpdated(true);
            }
            else {
                this.tryingToAssign = false;
                this.$emit("turnsUpdated", this.windingIndex);
            }
        },
        turnsUpdated() {
            if (this.masStore.mas != null) {
                if (this.localData["numberTurns"] != this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].numberTurns ||
                    this.localData["numberParallels"] != this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].numberParallels) {

                    if (!this.taskQueueStore.windingIndexChangeBlock) {
                        this.cleanCoil();
                    }
                }
                this.recentChange = true;
                this.tryToAssign();
            }
        },

    }
}
</script>

<template>
    <div class="turns-wrapper">
        <img :data-cy="dataTestLabel + '-BasicWireSelector-loading'" v-if="loading" class="mx-auto d-block col-12" alt="loading" style="width: 60%; height: auto;" :src="$settingsStore.loadingGif">
        <Dimension class="text-left"
            v-tooltip="tooltipsMagneticBuilder.wireNumberTurns"
            v-if="!loading"
            :disabled="readOnly"
            :name="'numberTurns'"
            :replaceTitle="'No. Turns'"
            :unit="null"
            :dataTestLabel="dataTestLabel + '-NumberTurns'"
            :numberDecimals="0"
            :min="1"
            :max="1000000"
            :allowNegative="false"
            :modelValue="localData"
            :forceUpdate="forceUpdate"
            :labelWidthProportionClass="'col-12 md:col-5'"
            :valueWidthProportionClass="'col-12 md:col-7'"
            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
            :textColor="$styleStore.magneticBuilder.inputTextColor"
            @update="turnsUpdated"
        />
        <Dimension class="text-left"
            v-tooltip="tooltipsMagneticBuilder.wireNumberParallels"
            v-if="!loading"
            :disabled="readOnly"
            :name="'numberParallels'"
            :replaceTitle="'No. Parallels'"
            :unit="null"
            :dataTestLabel="dataTestLabel + '-NumberParallels'"
            :numberDecimals="0"
            :min="1"
            :max="1000000"
            :allowNegative="false"
            :modelValue="localData"
            :forceUpdate="forceUpdate"
            :labelWidthProportionClass="'col-12 md:col-5'"
            :valueWidthProportionClass="'col-12 md:col-7'"
            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
            :textColor="$styleStore.magneticBuilder.inputTextColor"
            @update="turnsUpdated"
        />
    </div>
</template>
