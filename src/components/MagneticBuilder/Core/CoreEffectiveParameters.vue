<script setup>
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'
</script>

<script>
// Read-only effective parameters of the selected core (Leff, Aeff, Veff, Amin) as the engine computed them, and for a
// tape-wound core the fill factor kf already applied to Aeff, Amin and Veff, with its source. Shown without running a
// simulation, so a host that only defines the magnetic (CoreDataX) lets its user check the Aeff their flux density is
// based on. Laid out exactly like CoreInfo's advanced grid (same component, labels, decimals and cell styles), so the
// two read the same wherever both appear. Off unless the host sets showEffectiveParameters.
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
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        return {
            taskQueueStore,
            fillFactor: null,
            fillFactorError: null,
            fillFactorRequest: 0,
            fillFactorLoaded: false,
        }
    },
    computed: {
        core() {
            return this.masStore.mas.magnetic.core;
        },
        effectiveParameters() {
            return this.core?.processedDescription?.effectiveParameters ?? null;
        },
        // kf shown for every core: the engine's value for a tape-wound core; 1 for every other core (ferrite and powder
        // are solid, and MKF applies no stacking factor to anything else), as Alf asked (2026-11-07).
        // Only shown once the engine has answered, so a failed lookup is never displayed as 1.
        fillFactorValue() {
            if (!this.fillFactorLoaded || this.fillFactorError != null) {
                return null;
            }
            return this.fillFactor == null ? 1 : this.fillFactor.fillFactor;
        },
        fillFactorTooltip() {
            if (this.fillFactor == null) {
                return 'Fill factor: 1. No stacking or lamination factor applies to this core (solid ferrite or powder, or a core MKF does not treat as tape-wound), so Aeff is its full cross-section.';
            }
            return 'Fill factor of the tape-wound core: Aeff, Amin and Veff already include it. Source: ' + this.fillFactor.source;
        },
        // Changes when the material or the shape changes: the only inputs of the fill factor.
        fillFactorKey() {
            const description = this.core?.functionalDescription;
            // A builder with no material or shape picked yet holds "" there: nothing to look up.
            if (description == null || !description.material || !description.shape) {
                return null;
            }
            return JSON.stringify([description.material, description.shape]);
        },
    },
    watch: {
        fillFactorKey: {
            handler() {
                this.updateFillFactor();
            },
            immediate: true,
        },
    },
    methods: {
        async updateFillFactor() {
            const request = ++this.fillFactorRequest;
            this.fillFactor = null;
            this.fillFactorError = null;
            this.fillFactorLoaded = false;
            if (this.fillFactorKey == null) {
                return;
            }
            try {
                const fillFactor = await this.taskQueueStore.getTapeWoundFillFactor(this.core);
                if (request === this.fillFactorRequest) {
                    this.fillFactor = fillFactor;
                    this.fillFactorLoaded = true;
                }
            }
            catch (error) {
                if (request === this.fillFactorRequest) {
                    this.fillFactorError = String(error.message ?? error).replace(/^Exception:\s*/, '');
                    console.error(error);
                }
            }
        },
    },
}
</script>

<template>
    <div class="coreinfo-grid" :data-cy="dataTestLabel + '-container'" v-if="effectiveParameters != null">
        <div class="coreinfo-cell">
            <DimensionReadOnly
                v-tooltip="tooltipsMagneticBuilder.effectiveLength"
                class="text-left"
                :name="'L'"
                :subscriptName="'eff'"
                :unit="'m'"
                :power="1"
                :dataTestLabel="dataTestLabel + '-EffectiveLength'"
                :numberDecimals="2"
                :value="effectiveParameters.effectiveLength"
                :disableShortenLabels="true"
                :labelWidthProportionClass="'col-3'"
                :valueWidthProportionClass="'col-9'"
                :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
            />
        </div>
        <div class="coreinfo-cell">
            <DimensionReadOnly
                v-tooltip="tooltipsMagneticBuilder.effectiveArea"
                class="text-left"
                :name="'A'"
                :subscriptName="'eff'"
                :unit="'m²'"
                :power="2"
                :dataTestLabel="dataTestLabel + '-EffectiveArea'"
                :numberDecimals="1"
                :value="effectiveParameters.effectiveArea"
                :disableShortenLabels="true"
                :labelWidthProportionClass="'col-3'"
                :valueWidthProportionClass="'col-9'"
                :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
            />
        </div>
        <div class="coreinfo-cell">
            <DimensionReadOnly
                v-tooltip="tooltipsMagneticBuilder.effectiveVolume"
                class="text-left"
                :name="'V'"
                :subscriptName="'eff'"
                :unit="'m³'"
                :power="3"
                :dataTestLabel="dataTestLabel + '-EffectiveVolume'"
                :numberDecimals="1"
                :value="effectiveParameters.effectiveVolume"
                :disableShortenLabels="true"
                :labelWidthProportionClass="'col-3'"
                :valueWidthProportionClass="'col-9'"
                :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
            />
        </div>
        <div class="coreinfo-cell">
            <DimensionReadOnly
                v-tooltip="tooltipsMagneticBuilder.minimumArea"
                class="text-left"
                :name="'A'"
                :subscriptName="'min'"
                :unit="'m²'"
                :power="2"
                :dataTestLabel="dataTestLabel + '-MinimumArea'"
                :numberDecimals="1"
                :value="effectiveParameters.minimumArea"
                :disableShortenLabels="true"
                :labelWidthProportionClass="'col-3'"
                :valueWidthProportionClass="'col-9'"
                :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
            />
        </div>
        <div class="coreinfo-cell" v-if="fillFactorValue != null">
            <DimensionReadOnly
                v-tooltip="fillFactorTooltip"
                class="text-left"
                :name="'k'"
                :subscriptName="'f'"
                :unit="null"
                :power="1"
                :dataTestLabel="dataTestLabel + '-FillFactor'"
                :numberDecimals="3"
                :value="fillFactorValue"
                :useTitleCase="false"
                :disableShortenLabels="true"
                :labelWidthProportionClass="'col-3'"
                :valueWidthProportionClass="'col-9'"
                :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
            />
        </div>
        <div
            v-if="fillFactorError != null"
            class="coreinfo-note text-danger"
            :data-cy="dataTestLabel + '-FillFactorError'"
        >Fill factor: {{ fillFactorError }}</div>
    </div>
</template>

<style scoped>
/* Same rules as CoreInfo.vue's grid (scoped there), so this panel reads exactly like Core Info. */
.coreinfo-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 0.5rem;
}

@media (max-width: 576px) {
    .coreinfo-grid {
        grid-template-columns: 1fr;
    }
}

.coreinfo-cell {
    background: transparent;
    border: 0;
    border-radius: 10px;
    padding: 0.05rem 0.4rem;
    margin: 0;
    transition: opacity 0.3s ease;
    line-height: 1.25;
    font-size: 0.9rem;
}

/* Crush the inner Dimension component to just the natural text height. */
.coreinfo-cell :deep(.row),
.coreinfo-cell :deep(.grid),
.coreinfo-cell :deep(.dim-ro-row),
.coreinfo-cell :deep(.dim-ro-value-row),
.coreinfo-cell :deep(.dim-ro-container) {
    margin: 0 !important;
    padding: 0 !important;
    --p-gutter-x: 0;
    --p-gutter-y: 0;
    min-height: 0 !important;
    line-height: 1.25 !important;
}
.coreinfo-cell :deep(.row > *),
.coreinfo-cell :deep(.grid > *),
.coreinfo-cell :deep(.dim-ro-row > *) {
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    line-height: 1.25 !important;
}
.coreinfo-cell :deep(.form-label),
.coreinfo-cell :deep(label),
.coreinfo-cell :deep(.dim-ro-label) {
    padding: 0 0 0 0.35rem !important;
    margin: 0 !important;
    line-height: 1.25 !important;
    text-align: start !important;
}
.coreinfo-cell :deep(.p-inputnumber),
.coreinfo-cell :deep(.p-inputnumber > input),
.coreinfo-cell :deep(.p-select),
.coreinfo-cell :deep(.p-inputtext),
.coreinfo-cell :deep(.dim-ro-input),
.coreinfo-cell :deep(.dim-ro-value),
.coreinfo-cell :deep(.dim-ro-unit) {
    padding: 0 !important;
    margin: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    line-height: 1.25 !important;
}

/* Tooltips open from the cell's outer edge (left column to the right, right column to the left) and wrap at
   18rem, so a long one (kf's source) stays inside the card instead of being centred past its edge. The
   variables are those of CoreDataX's CSS tooltip; PrimeVue's tooltip (OpenMagnetics) ignores them. */
.coreinfo-grid > .coreinfo-cell:nth-child(odd) {
    --v-tooltip-left: 0%;
    --v-tooltip-translate: translate(0, -110%);
}
.coreinfo-grid > .coreinfo-cell:nth-child(even) {
    --v-tooltip-left: 100%;
    --v-tooltip-translate: translate(-100%, -110%);
}
.coreinfo-cell :deep(.data-v-tooltip::after) {
    max-width: min(18rem, calc(100vw - 2rem));
}

/* A full-width line under the cells: why the fill factor could not be found. */
.coreinfo-note {
    grid-column: 1 / -1;
    padding: 0.1rem 0.75rem;
    font-size: 0.75rem;
    line-height: 1.3;
    opacity: 0.75;
}
</style>
