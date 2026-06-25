<script setup>
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import { toTitleCase, checkAndFixMas, deepCopy, range } from '/WebSharedComponents/assets/js/utils.js'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'
</script>

<script>

export default {
    emits: ['update', 'closeInsulation'],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        loading: {
            type: Boolean,
            default: false,
        },
        readOnly: {
            type: Boolean,
            default: false,
        },
        data: {
            type: Object,
            required: true,
        }
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const forceUpdate = 0;
        const subscriptions = [];
        return {
            taskQueueStore,
            forceUpdate,
            subscriptions
        }
    },
    computed: {
    },
    mounted() {
        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "newWireCreated") {
                    if (args[0]) {
                        this.forceUpdate += 1;
                    }
                }
            });
        }));
    },
    beforeUnmount() {
        this.subscriptions.forEach((subscription) => {subscription();});
    }
}
</script>

<template>
    <div class="planar-insulation-panel">
        <div class="planar-insulation-header">
            <div class="planar-insulation-header-left">
                <i class="pi pi-shield"></i>
                <span>Insulation Settings</span>
            </div>
            <button
                type="button"
                class="planar-insulation-close"
                @click="$emit('closeInsulation')"
                aria-label="Close"
            >
                <i class="pi pi-times"></i>
            </button>
        </div>
        <div class="planar-insulation-body">
            <div class="planar-insulation-row">
                <Dimension class="col-12 text-left mb-2"
                    v-tooltip="tooltipsMagneticBuilder.coreToLayerDistance"
                    v-if="!loading"
                    :disabled="readOnly"
                    :name="'coreToLayerDistance'"
                    :unit="'m'"
                    :defaultZeroUnit="0.001"
                    :dataTestLabel="dataTestLabel + '-CoreToLayerDistance'"
                    :numberDecimals="6"
                    :min="1e-6"
                    :max="1"
                    :allowNegative="false"
                    :allowZero="true"
                    :modelValue="data"
                    :forceUpdate="forceUpdate"
                    :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                    :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                    :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                    :textColor="$styleStore.magneticBuilder.inputTextColor"
                    @update="$emit('update')"
                />
                <Dimension class="col-12 text-left mb-3"
                    v-tooltip="tooltipsMagneticBuilder.borderToWireDistance"
                    v-if="!loading"
                    :disabled="readOnly"
                    :name="'borderToWireDistance'"
                    :unit="'m'"
                    :defaultZeroUnit="0.001"
                    :dataTestLabel="dataTestLabel + '-BorderToWireDistance'"
                    :numberDecimals="6"
                    :min="1e-6"
                    :max="1"
                    :allowNegative="false"
                    :allowZero="true"
                    :modelValue="data"
                    :forceUpdate="forceUpdate"
                    :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                    :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                    :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                    :textColor="$styleStore.magneticBuilder.inputTextColor"
                    @update="$emit('update')"
                />
            </div>

            <div class="planar-insulation-section">
                <div class="planar-insulation-section-title">Insulation layer thickness</div>
                <div class="planar-insulation-grid">
                    <div v-for="(value, key) in data.insulationThicknessPerLayer" :key="key" class="planar-insulation-cell">
                        <Dimension
                            :name="key"
                            :replaceTitle="`Ins. ${key}`"
                            :unit="'m'"
                            :defaultZeroUnit="0.001"
                            :dataTestLabel="dataTestLabel + `-InsulationBetweenLayers-${key}`"
                            :numberDecimals="6"
                            :min="1e-6"
                            :max="1"
                            :allowNegative="false"
                            :allowZero="true"
                            :forceUpdate="forceUpdate"
                            :modelValue="data.insulationThicknessPerLayer"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="$emit('update')"
                        />
                    </div>
                </div>
            </div>

            <div class="planar-insulation-section">
                <div class="planar-insulation-section-title">Turn clearance per winding</div>
                <div class="planar-insulation-grid">
                    <div v-for="(value, key) in data.clearancePerWinding" :key="key" class="planar-insulation-cell">
                        <Dimension
                            :name="key"
                            :replaceTitle="`Winding ${Number(key) + 1}`"
                            :unit="'m'"
                            :defaultZeroUnit="0.001"
                            :dataTestLabel="dataTestLabel + `-ClearancePerWinding-${key}`"
                            :numberDecimals="6"
                            :min="1e-6"
                            :max="1"
                            :allowNegative="false"
                            :allowZero="true"
                            :forceUpdate="forceUpdate"
                            :modelValue="data.clearancePerWinding"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                            @update="$emit('update')"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.planar-insulation-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.08) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 14px;
    padding: 0;
    margin: 0.5rem 0 1rem 0;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.15), inset 0 1px 0 rgba(var(--p-white-rgb), 0.05);
    overflow: hidden;
    animation: slideDown 0.25s ease-out;
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.planar-insulation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(120, 120, 120, 0.12);
    border-bottom: 1px solid rgba(120, 120, 120, 0.15);
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.planar-insulation-header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}

.planar-insulation-header-left i {
    font-size: 1rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.planar-insulation-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border-radius: 999px;
    background: rgba(var(--p-black-rgb), 0.25);
    border: 1px solid rgba(var(--p-white-rgb), 0.12);
    color: var(--p-primary);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, transform 0.1s;
}

.planar-insulation-close:hover {
    background: rgba(var(--p-danger-rgb), 0.2);
    color: var(--p-danger);
    transform: translateY(-1px);
}

.planar-insulation-body {
    padding: 1rem 0.75rem;
}

.planar-insulation-row {
    margin-bottom: 0.5rem;
}

.planar-insulation-section {
    margin-top: 0.75rem;
}

.planar-insulation-section-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(var(--p-white-rgb), 0.8);
    margin-bottom: 0.5rem;
    padding-left: 0.25rem;
}

.planar-insulation-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
}

@media (max-width: 576px) {
    .planar-insulation-grid {
        grid-template-columns: 1fr;
    }
}

.planar-insulation-cell {
    background: rgba(var(--p-black-rgb), 0.18);
    border: 1px solid rgba(var(--p-white-rgb), 0.04);
    border-radius: 10px;
    padding: 0.5rem 0.6rem;
}
</style>
