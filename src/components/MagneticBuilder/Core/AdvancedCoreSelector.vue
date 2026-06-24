<script setup>
import AdvancedCoreSelectorShape from './AdvancedCoreSelector/AdvancedCoreSelectorShape.vue'
import AdvancedCoreSelectorGapping from './AdvancedCoreSelector/AdvancedCoreSelectorGapping.vue'
import AdvancedCoreSelectorMaterial from './AdvancedCoreSelector/AdvancedCoreSelectorMaterial.vue'
import { useHistoryStore } from '../../../stores/history'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
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
        enableSimulation: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const historyStore = useHistoryStore();
        const localData = {};
        const errorMessage = "";
        const loading = false;
        const forceUpdate = 0;
        const localCore = deepCopy(this.masStore.mas.magnetic.core);
        const subscriptions = [];

        return {
            taskQueueStore,
            historyStore,
            localData,
            errorMessage,
            loading,
            forceUpdate,
            localCore,
            subscriptions,
        }
    },
    computed: {
    },
    watch: { 
    },
    created () {
    },
    mounted () {
        this.subscriptions.push(this.$stateStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "applyChanges") {
                    this.applyChanges();
                }
                if (name == "cancelChanges") {
                    this.cancelChanges();
                }
            });
        }))

        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "bobbinFromCoreShapeGenerated") {
                    if (args[0]) {
                        const bobbin = args[1];
                        const currentBobbin = this.masStore.mas.magnetic.coil.bobbin;
                        // Only clear turns if bobbin actually changed
                        if (JSON.stringify(currentBobbin) !== JSON.stringify(bobbin)) {
                            this.masStore.mas.magnetic.coil.turnsDescription = null;
                            this.masStore.mas.magnetic.coil.layersDescription = null;
                            this.masStore.mas.magnetic.coil.sectionsDescription = null;
                        }
                        this.masStore.mas.magnetic.coil.bobbin = bobbin;
                        this.historyStore.addToHistory(this.masStore.mas);
                    }
                    else {
                        console.error(args[1])
                    }
                }

            });
        }))
    },
    beforeUnmount () {
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        customizedCore(customCore) {
            this.masStore.mas.magnetic.core = customCore;
        },
        applyChanges() {
            this.localCore.functionalDescription.shape.type = "custom";
            this.localCore.name = "Custom";
            this.masStore.mas.magnetic.manufacturerInfo = null;

            this.masStore.mas.magnetic.core = deepCopy(this.localCore);
            this.$stateStore.magneticBuilder.mode.core = this.$stateStore.MagneticBuilderModes.Basic;
            this.taskQueueStore.generateBobbinFromCoreShape(this.localCore, this.masStore.mas.inputs.designRequirements.wiringTechnology).then((bobbin) => {
                this.masStore.mas.magnetic.coil.bobbin = bobbin;
            });
        },
        cancelChanges() {
            this.$stateStore.magneticBuilder.mode.core = this.$stateStore.MagneticBuilderModes.Basic;
        },
        errorInDimensions() {
            this.errorMessage = "There is an error in the dimensions, please review them";
        },
        clearError() {
            this.errorMessage = "";
        },
    }
}
</script>

<template>
    <div class="advcore-panel">
        <div class="advcore-header">
            <i class="pi pi-wrench"></i>
            <span>Custom magnetic core</span>
        </div>
        <div class="advcore-body">
            <img :data-cy="dataTestLabel + '-BasicCoreSelector-loading'" v-if="loading" class="mx-auto d-block advcore-loading" alt="loading" :src="$settingsStore.loadingGif">
            <AdvancedCoreSelectorShape
                v-if="$stateStore.magneticBuilder.submode.core == $stateStore.MagneticBuilderCoreSubmodes.Shape"
                :dataTestLabel="dataTestLabel + '-AdvancedCoreSelectorShape'"
                :core="localCore"
                :enableSimulation="true"
                @errorInDimensions="errorInDimensions"
                @renderSuccess="clearError"
            />
            <AdvancedCoreSelectorGapping
                v-if="$stateStore.magneticBuilder.submode.core == $stateStore.MagneticBuilderCoreSubmodes.Gapping"
                :dataTestLabel="dataTestLabel + '-AdvancedCoreSelectorGapping'"
                :core="localCore"
                :inputs="masStore.mas.inputs"
                :enableSimulation="true"
            />
            <AdvancedCoreSelectorMaterial
                v-if="$stateStore.magneticBuilder.submode.core == $stateStore.MagneticBuilderCoreSubmodes.Material"
                :dataTestLabel="dataTestLabel + '-AdvancedCoreSelectorMaterial'"
                :core="localCore"
                :enableSimulation="true"
            />
            <label class="text-danger col-12 pt-1 advcore-error">{{errorMessage}}</label>
        </div>
    </div>
</template>

<style scoped>
.advcore-panel {
    background: linear-gradient(180deg,
        rgba(var(--p-dark-rgb), 0.75) 0%,
        rgba(var(--p-dark-rgb), 0.55) 100%);
    border: 1px solid rgba(var(--p-white-rgb), 0.08);
    border-left: 3px solid rgba(var(--p-primary-rgb), 0.8);
    border-radius: 14px;
    margin: 0.5rem 0 1rem 0;
    box-shadow: 0 6px 24px rgba(var(--p-black-rgb), 0.45), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    overflow: hidden;
}

.advcore-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.9rem;
    background: rgba(var(--p-white-rgb), 0.04);
    border-bottom: 1px solid rgba(var(--p-white-rgb), 0.08);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.advcore-header i {
    filter: drop-shadow(0 0 4px rgba(var(--p-primary-rgb), 0.45));
}

.advcore-body {
    padding: 0.8rem 0.75rem;
}

.advcore-loading {
    max-width: 60%;
    height: auto;
}

.advcore-error {
    font-size: 0.85em;
    margin-top: 0.5rem;
}
</style>
