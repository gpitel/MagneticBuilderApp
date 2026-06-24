<script setup>
import { combinedStyle } from '/WebSharedComponents/assets/js/utils.js'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'
</script>

<script>
export default {
    emits: ["windingIndexChanged"],
    props: {
        coil: {
            type: Object,
            required: true,
        },
        masStore: {
            type: Object,
            required: true,
        },
        selectedWindingIndex: {
            type: Number,
            default: 0,
        },
        dataTestLabel: {
            type: String,
            default: '',
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const subscriptions = [];
        return {
            taskQueueStore,
            subscriptions,
        }
    },
    computed: {
    },
    watch: { 
    },
    mounted () {
        this.subscriptions.push(this.masStore.$onAction((action) => {
            if (action.name == "updatedTurnsRatios") {
                const newIndex = Math.min(this.selectedWindingIndex, this.masStore.mas.inputs.designRequirements.turnsRatios.length);
                this.$emit("windingIndexChanged", newIndex);
                this.taskQueueStore.windingIndexChanged(true);
            }
        }));
    },
    beforeUnmount() {
        this.subscriptions.forEach((unsubscribe) => unsubscribe());
    },
    methods: {
        getWindingLabel(key) {
            return 'Winding ' + key;
        },
        windingIndexChanged(windingIndex) {
            this.$emit("windingIndexChanged", windingIndex);
        },
        isWireMissing(windingIndex) {
            let isMissingWires = false;
            if (this.coil.functionalDescription[windingIndex].wire == "Dummy" || this.coil.functionalDescription[windingIndex].wire == "" || this.coil.functionalDescription[windingIndex].wire == null) {
                isMissingWires = true;
            }
            else {
                if (this.coil.functionalDescription[windingIndex].wire.type == null) {
                    isMissingWires = true;
                }
            }
            return isMissingWires;
        },
    }
}
</script>

<template>
    <div v-if="coil.functionalDescription.length > 1" class="winding-selector" v-tooltip="tooltipsMagneticBuilder.windingSelector">
        <div class="winding-pills">
            <button
                v-for="value, key in coil.functionalDescription"
                :key="key"
                :class="['winding-pill', {
                    active: selectedWindingIndex === key,
                    missing: isWireMissing(key) && selectedWindingIndex !== key
                }]"
                :ref="'select-winding-' + (key + 1)"
                @click="windingIndexChanged(key)">
                {{ getWindingLabel(key + 1) }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.winding-selector {
    padding: 0;
}

.winding-pills {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: flex-start;
    background: rgba(var(--p-black-rgb), 0.25);
    padding: 0.25rem;
    border-radius: 999px;
    border: 1px solid rgba(var(--p-white-rgb), 0.06);
}

.winding-pill {
    appearance: none;
    border: none;
    background: transparent;
    color: rgba(var(--p-white-rgb), 0.65);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.winding-pill:hover {
    color: rgba(var(--p-white-rgb), 0.9);
    background: rgba(var(--p-white-rgb), 0.06);
}

.winding-pill.active {
    background: linear-gradient(135deg, rgba(var(--p-primary-rgb), 0.9) 0%, rgba(var(--p-primary-rgb), 0.7) 100%);
    color: var(--p-white);
    box-shadow: 0 2px 8px rgba(var(--p-primary-rgb), 0.35);
}

.winding-pill.missing {
    color: var(--p-danger);
}
</style>
