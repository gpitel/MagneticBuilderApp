<script setup>
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import { toTitleCase, checkAndFixMas, deepCopy, range } from '/WebSharedComponents/assets/js/utils.js'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
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
        data: {
            type: Object,
            default: 0,
        },
    },
    data() {
        return {
        }
    },
    computed: {
        contiguousLabel() {
            try {
                if (this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].shape == "rectangular") {
                    return "height";
                }
                else {
                    return "angle";
                }

            }
            catch (e) {
                return "height"
            }
        },
        overlappingLabel() {
            try {
                if (this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].shape == "rectangular") {
                    return "width";
                }
                else {
                    return "radial";
                }

            }
            catch (e) {
                return "width"
            }
        }
    }
}
</script>

<template>
    <div class="filling-panel">
        <div class="filling-header">
            <div class="filling-header-left">
                <i class="pi pi-gauge"></i>
                <span>Filling Factors</span>
            </div>
        </div>
        <div class="filling-body">
            <div class="filling-grid">
                <div class="filling-cell">
                    <DimensionReadOnly 
                        v-tooltip="tooltipsMagneticBuilder.areaFillingFactor"
                        class="text-left"
                        :name="'Fill. F'"
                        :subscriptName="'area'"
                        :unit="'%'"
                        :power="1"
                        :visualScale="100"
                        :dataTestLabel="dataTestLabel + '-FillingFactor'"
                        :numberDecimals="2"
                        :value="data.fillingFactors.areaFillingFactor"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-4'"
                        :valueWidthProportionClass="'col-8'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="data.fillingFactors.areaFillingFactor < 0.8? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                    />
                </div>
                <div v-if="data.sectionsOrientation == 'contiguous'" class="filling-cell">
                    <DimensionReadOnly 
                        v-tooltip="tooltipsMagneticBuilder.contiguousFillingFactor"
                        class="text-left"
                        :name="'Fill. F'"
                        :subscriptName="contiguousLabel"
                        :unit="'%'"
                        :power="1"
                        :visualScale="100"
                        :dataTestLabel="dataTestLabel + '-FillingFactor'"
                        :numberDecimals="2"
                        :value="data.fillingFactors.contiguousFillingFactor"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-4'"
                        :valueWidthProportionClass="'col-8'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="data.fillingFactors.contiguousFillingFactor < 0.8? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                    />
                </div>
                <div v-if="data.sectionsOrientation == 'overlapping'" class="filling-cell">
                    <DimensionReadOnly 
                        v-tooltip="tooltipsMagneticBuilder.overlappingFillingFactor"
                        class="text-left"
                        :name="'Fill. F'"
                        :subscriptName="overlappingLabel"
                        :unit="'%'"
                        :power="1"
                        :visualScale="100"
                        :dataTestLabel="dataTestLabel + '-FillingFactor'"
                        :numberDecimals="2"
                        :value="data.fillingFactors.overlappingFillingFactor"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-4'"
                        :valueWidthProportionClass="'col-8'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="data.fillingFactors.overlappingFillingFactor < 0.8? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.filling-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.06) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 14px;
    padding: 0;
    margin: 0.5rem 0 1rem 0;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.12), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    overflow: hidden;
}

.filling-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(120, 120, 120, 0.1);
    border-bottom: 1px solid rgba(120, 120, 120, 0.15);
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.filling-header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}

.filling-header-left i {
    font-size: 1rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.filling-body {
    padding: 0.75rem;
}

.filling-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
}

@media (max-width: 576px) {
    .filling-grid {
        grid-template-columns: 1fr;
    }
}

.filling-cell {
    background: rgba(var(--p-black-rgb), 0.18);
    border: 1px solid rgba(var(--p-white-rgb), 0.04);
    border-radius: 10px;
    padding: 0.5rem 0.6rem;
}
</style>
