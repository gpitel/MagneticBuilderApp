<script setup>
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import { toTitleCase, checkAndFixMas, deepCopy, range } from '/WebSharedComponents/assets/js/utils.js'
import ArrayProportions from '/WebSharedComponents/DataInput/ArrayProportions.vue'
import SectionSelector from './SectionSelector.vue'
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
        data: {
            type: Object,
            default: 0,
        },
        showAlignmentOptions: {
            type: Boolean,
            default: false,
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
        const windingOrientations = {};
        const coilAlignments = {};
        const blockingRebounds = false;
        const sectionsOrientations = {};
        const selectedSectionIndex = 0;

        return {
            taskQueueStore,
            windingOrientations,
            coilAlignments,
            blockingRebounds,
            sectionsOrientations,
            selectedSectionIndex,
        }
    },
    computed: {
        conductiveSections() {
            const sections = [];

            if (this.masStore.mas.magnetic.coil.sectionsDescription != null) {
                this.masStore.mas.magnetic.coil.sectionsDescription.forEach((section) => {
                    if (section.type == "conduction") {
                        sections.push(section);
                    }
                })
            }
            return sections;
        },
        numberSections() {
            if (this.masStore.mas.magnetic.coil.sectionsDescription != null) {
                return this.conductiveSections.length;
            }
            else {
                return this.masStore.mas.magnetic.coil.functionalDescription.length;
            }
        },
        shortenedNames() {
            const shortenedNames = {}

            let width = 0;
            if (this.$refs.coilSelectorContainer != null) {
                width = this.$refs.coilSelectorContainer.clientWidth / this.numberSections;
            }

            this.conductiveSections.forEach((section, key) => {
                let label = toTitleCase(section.name.toLowerCase());
                label = label.replace("section", "stn");
                if (width > 0) {
                    let slice = section.name.length
                    if (width < 200)
                        slice = 4;
                    if (width < 150)
                        slice = 3;
                    if (width < 100)
                        slice = 2;
                    label = label.split(' ')
                        .map(item => item.length <= slice? item + ' ' : item.slice(0, slice) + '. ')
                        .join('');
                }
                shortenedNames[key] = label;
            })

            return shortenedNames
        },
    },
    watch: {
        showAlignmentOptions(newValue, oldValue) {
            this.blockingRebounds = true;
            setTimeout(() => this.blockingRebounds = false, 10);
        },
    },
    mounted () {
        this.getSectionOrientations();
        this.getWindingOrientations();
        this.getCoilAlignments();
    },
    emits: ['coilUpdated', 'closeAlignment'],
    methods: {
        getSectionOrientations() {
            this.taskQueueStore.getAvailableWindingOrientations().then((windingOrientations) => {
                this.sectionsOrientations = windingOrientations;
            })
            .catch(error => {
                console.error(error);
            });
        },
        getWindingOrientations() {
            this.taskQueueStore.getAvailableWindingOrientations().then((windingOrientations) => {
                this.windingOrientations = windingOrientations;
            })
            .catch(error => {
                console.error(error);
            });
        },
        getCoilAlignments() {
            this.taskQueueStore.getAvailableCoilAlignments().then((coilAlignments) => {
                this.coilAlignments = coilAlignments;
            })
            .catch(error => {
                console.error(error);
            });
        },
        coilUpdated() {
            if (!this.blockingRebounds) {
                this.$emit('coilUpdated');
            }
        },
        sectionIndexChanged(sectionIndex) {
            this.selectedSectionIndex = sectionIndex;
            this.blockingRebounds = true;
            setTimeout(() => this.blockingRebounds = false, 10);
        },
    }
}
</script>

<template>
    <div v-show="showAlignmentOptions && masStore.mas.magnetic.coil.sectionsDescription != null" class="alignment-panel">
                <div class="alignment-header">
                    <div class="alignment-header-left">
                        <i class="pi pi-align-center"></i>
                        <span>Alignment Settings</span>
                    </div>
                    <button
                        type="button"
                        class="alignment-close-btn"
                        aria-label="Close alignment settings"
                        @click="$emit('closeAlignment')"
                    >
                        <i class="pi pi-times"></i>
                    </button>
                </div>

                <div class="alignment-body">
                    <ElementFromList
                        v-tooltip="tooltipsMagneticBuilder.windingsOrientation"
                        :disabled="readOnly"
                        class="col-12 mb-2 text-left"
                        :dataTestLabel="dataTestLabel + '-sectionsOrientation'"
                        :name="'sectionsOrientation'"
                        :replaceTitle="'Windings Orientation'"
                        :titleSameRow="true"
                        :justifyContent="true"
                        :modelValue="data"
                        :options="sectionsOrientations"
                        :labelWidthProportionClass="'col-7'"
                        :selectStyleClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                        @update="coilUpdated"
                        @update:modelValue="data = $event"
                    />

                    <ElementFromList
                        v-tooltip="tooltipsMagneticBuilder.sectionsAlignment"
                        :disabled="readOnly"
                        class="col-12 mb-2 text-left"
                        :dataTestLabel="dataTestLabel + '-SectionsAlignment'"
                        :name="'sectionsAlignment'"
                        :replaceTitle="'Section Alignment'"
                        :titleSameRow="true"
                        :justifyContent="true"
                        :modelValue="data"
                        :options="coilAlignments"
                        :labelWidthProportionClass="'col-7'"
                        :selectStyleClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                        @update="coilUpdated"
                        @update:modelValue="data = $event"
                    />

                    <SectionSelector
                        :sectionIndex="selectedSectionIndex"
                        :masStore="masStore"
                        @sectionIndexChanged="sectionIndexChanged"
                    />

                    <ElementFromList
                        v-tooltip="tooltipsMagneticBuilder.turnsAlignment"
                        :disabled="readOnly"
                        class="col-12 mb-2 text-left"
                        :dataTestLabel="dataTestLabel + '-TurnsAlignment'"
                        :name="'turnsAlignment'"
                        :titleSameRow="true"
                        :justifyContent="true"
                        v-model="data.dataPerSection[selectedSectionIndex]"
                        :options="coilAlignments"
                        :labelWidthProportionClass="'col-7'"
                        :selectStyleClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                        @update="coilUpdated"
                    />

                    <ArrayProportions
                        v-tooltip="tooltipsMagneticBuilder.proportions"
                        v-if="masStore.mas.magnetic.coil.functionalDescription.length > 1"
                        :disabled="readOnly"
                        class="col-12 mt-1 text-left"
                        :dataTestLabel="dataTestLabel + '-ProportionPerWinding'"
                        :modelValue="data.proportionPerWinding"
                        :name="'proportionPerWinding'"
                        :replaceTitle="'Proportions'"
                        :suffix="'W'"
                        :unit="'%'"
                        :max="100"
                        :min="1"
                        :disabledScaling="true"
                        :maximumNumberElements="12"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                        @update="coilUpdated"
                    />
                </div>
    </div>
</template>

<style scoped>
.alignment-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.08) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 14px;
    padding: 0;
    margin: 0.15rem 0 0.5rem 0;
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

.alignment-header {
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

.alignment-header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}

.alignment-header-left i {
    font-size: 1rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.alignment-close-btn {
    appearance: none;
    background: transparent;
    border: none;
    color: var(--p-primary);
    font-size: 1rem;
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.alignment-close-btn:hover {
    background: rgba(120, 120, 120, 0.15);
    color: var(--p-white);
}

.alignment-body {
    padding: 0.5rem 0.6rem 0.5rem 1.15rem;
    background-color: var(--p-dark);
}

.alignment-body :deep(.form-label),
.alignment-body :deep(label) {
    padding-left: 0.35rem !important;
}
</style>
