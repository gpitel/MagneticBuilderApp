<script setup>
import ScatterChartComparator from '/WebSharedComponents/Common/ScatterChartComparator.vue'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
</script>

<script>
import { useTaskQueueStore } from '../../../stores/taskQueue'
import { useHistoryStore } from '../../../stores/history'
import { applyAdvisedCore } from '../Core/applyAdvisedCore.js'
import { formatUnit, toCamelCase } from '/WebSharedComponents/assets/js/utils.js'

/**
 * What else this design could be built on (ABT #1121).
 *
 * The candidates come from the core adviser — the same call the Advise button
 * makes, asked for several results instead of one — and are drawn against the
 * design in the shared scatter comparator. Clicking one adopts it through
 * applyAdvisedCore, so a core picked here lands exactly as an advised one does.
 *
 * A host with the cross-referencer engine (the site ships it, the embedded
 * builder does not) can pass its own candidates through the `candidates` prop
 * instead, and the panel draws those. That is why the rows are a prop and not
 * something this component insists on fetching.
 *
 * The axes are properties of the candidate's own core, resolved by the engine
 * when the candidate was built, so nothing here recomputes magnetics.
 */

/**
 * What a core can be compared on. Every value is one the ENGINE already produced
 * — the geometry it processed, and the losses and temperature it simulated for
 * this operating point when it built the candidate — so nothing here does
 * magnetics of its own.
 *
 * An axis whose value is missing on the design or on every candidate is not
 * offered at all, rather than drawing an empty map (cost and temperature are
 * absent for many catalogue cores).
 */
const AXES = {
    totalLosses: {
        label: 'Total losses',
        unit: 'W',
        of: ({ outputs }) => {
            const core = outputs?.coreLosses?.coreLosses;
            const winding = outputs?.windingLosses?.windingLosses;
            return core == null || winding == null ? null : core + winding;
        },
    },
    coreLosses: { label: 'Core losses', unit: 'W', of: ({ outputs }) => outputs?.coreLosses?.coreLosses },
    windingLosses: { label: 'Winding losses', unit: 'W', of: ({ outputs }) => outputs?.windingLosses?.windingLosses },
    temperature: { label: 'Temperature rise', unit: '°C', of: ({ outputs }) => outputs?.temperature?.maximumTemperature },
    volume: { label: 'Core volume', unit: 'm³', of: ({ core }) => core?.processedDescription?.effectiveParameters?.effectiveVolume },
    effectiveArea: { label: 'Effective area', unit: 'm²', of: ({ core }) => core?.processedDescription?.effectiveParameters?.effectiveArea },
    effectiveLength: { label: 'Effective length', unit: 'm', of: ({ core }) => core?.processedDescription?.effectiveParameters?.effectiveLength },
    windowArea: { label: 'Window area', unit: 'm²', of: ({ core }) => core?.processedDescription?.windingWindows?.[0]?.area },
    width: { label: 'Width', unit: 'm', of: ({ core }) => core?.processedDescription?.width },
    height: { label: 'Height', unit: 'm', of: ({ core }) => core?.processedDescription?.height },
};

const HOW_MANY = 12;

export default {
    emits: ['coreAdopted', 'error'],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        masStore: {
            type: Object,
            required: true,
        },
        /** Which operating point the design's own results come from. */
        operatingPointIndex: {
            type: Number,
            default: 0,
        },
        /**
         * Candidates to draw, each `{mas, scoringPerFilter, weightedTotalScoring}`
         * as the core adviser returns them. Null asks the panel to fetch its own
         * from the adviser.
         */
        candidates: {
            type: Array,
            default: null,
        },
        /**
         * Keep the map current by itself: fetch once the design can be ranked and
         * refetch when the core changes. The Find button stays as a manual refresh.
         */
        autoLoad: {
            type: Boolean,
            default: true,
        },
        title: {
            type: String,
            default: 'Alternative cores',
        },
        /** A read-only builder shows the map but never replaces the design's core. */
        readOnly: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            taskQueueStore: useTaskQueueStore(),
            historyStore: useHistoryStore(),
            // Size against loss is the trade-off a designer is actually making.
            axes: { x: 'volume', y: 'totalLosses' },
            preferredAxes: { x: 'volume', y: 'totalLosses' },
            // Once the user picks an axis it is theirs; before that the panel is
            // free to move back to the preferred one as soon as the design has
            // been simulated and the losses become plottable.
            axisChosenByUser: { x: false, y: false },
            ownCandidates: null,
            loading: false,
            adopting: false,
            errorMessage: '',
            refetchTimer: null,
        }
    },
    computed: {
        /** The candidates on screen: the host's if given, else the ones we fetched. */
        shownCandidates() {
            return this.candidates ?? this.ownCandidates;
        },
        currentCore() {
            return this.masStore.mas?.magnetic?.core;
        },
        /** The design's own simulated results, for the reference point. */
        currentOutputs() {
            return this.masStore.mas?.outputs?.[this.operatingPointIndex] ?? null;
        },
        /**
         * Only the axes something can be plotted on: the design must have the
         * value, and so must at least one candidate. Keeps a dropdown from
         * offering an axis that would empty the map.
         */
        availableAxes() {
            const labels = {};
            for (const [key, axis] of Object.entries(AXES)) {
                if (this.axisValue({ core: this.currentCore, outputs: this.currentOutputs }, key) == null) continue;
                const candidates = this.shownCandidates;
                if (candidates != null && !candidates.some((candidate) => this.axisValue(this.subjectOf(candidate), key) != null)) continue;
                labels[key] = axis.label;
            }
            return labels;
        },
        /** What makes the map worth refetching: the core the user is comparing. */
        coreSignature() {
            const core = this.currentCore?.functionalDescription;
            const name = (value) => (typeof value === 'string' ? value : value?.name ?? null);
            return `${name(core?.shape)}|${name(core?.material)}`;
        },
        canRank() {
            return (this.masStore.mas?.inputs?.operatingPoints?.length ?? 0) > 0
                && this.currentCore?.processedDescription != null;
        },
        /** The design itself, drawn as the reference point. */
        referencePoint() {
            const core = this.currentCore;
            if (core?.processedDescription == null) return null;
            const subject = { core, outputs: this.currentOutputs };
            const x = this.axisValue(subject, this.axes.x);
            const y = this.axisValue(subject, this.axes.y);
            if (x == null || y == null) return null;
            return { name: this.coreName(core), x, y };
        },
        points() {
            if (this.shownCandidates == null) return null;
            const points = [];
            for (const candidate of this.shownCandidates) {
                const subject = this.subjectOf(candidate);
                const x = this.axisValue(subject, this.axes.x);
                const y = this.axisValue(subject, this.axes.y);
                if (x == null || y == null) continue;   // not comparable on these axes
                points.push({ name: this.coreName(subject.core), x, y, candidate });
            }
            return points;
        },
        /**
         * ScatterChartComparator reads each row as `row[toCamelCase(xLabel)]`, so
         * the keys come from the axis labels, and the reference is one such row.
         */
        xKey() {
            return toCamelCase(this.xLabel);
        },
        yKey() {
            return toCamelCase(this.yLabel);
        },
        chartData() {
            // `label` is what the comparator's tooltip shows for a point; without
            // it every hover read "undefined".
            return (this.points ?? []).map((point) => ({
                [this.xKey]: point.x,
                [this.yKey]: point.y,
                label: point.name,
                name: point.name,
            }));
        },
        chartReference() {
            const reference = this.referencePoint;
            if (reference == null) return null;
            return {
                [this.xKey]: reference.x,
                [this.yKey]: reference.y,
                label: reference.name,
                name: reference.name,
            };
        },
        /** Comparator limits are computed once at mount; a new key remounts it. */
        chartKey() {
            return `${this.axes.x}-${this.axes.y}-${(this.points ?? []).length}`;
        },
        xLabel() {
            return AXES[this.axes.x].label;
        },
        yLabel() {
            return AXES[this.axes.y].label;
        },
    },
    watch: {
        availableAxes: {
            immediate: true,
            handler(offered) {
                const keys = Object.keys(offered);
                if (keys.length === 0) return;
                for (const axis of ['x', 'y']) {
                    const preferred = this.preferredAxes[axis];
                    if (!this.axisChosenByUser[axis] && preferred in offered) {
                        this.axes[axis] = preferred;
                    }
                    else if (!(this.axes[axis] in offered)) {
                        // Fall back only while the preferred axis cannot be drawn.
                        this.axes[axis] = axis === 'x' ? keys[0] : keys[keys.length > 1 ? 1 : 0];
                    }
                }
            },
        },
        coreSignature: {
            immediate: true,
            handler() {
                if (!this.autoLoad || this.candidates != null) return;
                // Coalesce a burst of edits (shape, then material, then gap) into
                // one search, and stay out of the way while the design is still
                // being rebuilt — an adviser run started mid-edit competes with
                // the reprocess for the same engine.
                if (this.refetchTimer) clearTimeout(this.refetchTimer);
                this.refetchTimer = setTimeout(() => {
                    this.refetchTimer = null;
                    if (this.canRank) this.findAlternatives();
                }, 2500);
            },
        },
    },
    beforeUnmount() {
        if (this.refetchTimer) clearTimeout(this.refetchTimer);
    },
    methods: {
        coreName(core) {
            const shape = core?.functionalDescription?.shape;
            const shapeName = typeof shape === 'string' ? shape : shape?.name;
            const material = core?.functionalDescription?.material;
            const materialName = typeof material === 'string' ? material : material?.name;
            return `${shapeName ?? '—'} · ${materialName ?? '—'}`;
        },
        /** A candidate's core and the outputs the engine simulated for it. */
        subjectOf(candidate) {
            return {
                core: candidate?.mas?.magnetic?.core,
                // The same operating point the design's own point is drawn at.
                outputs: candidate?.mas?.outputs?.[this.operatingPointIndex] ?? null,
            };
        },
        axisValue(subject, key) {
            const value = AXES[key].of(subject);
            return value == null || Number.isNaN(value) ? null : value;
        },
        axisFormatter(value, label) {
            // The comparator formats both axes with this and says which one it is;
            // using the x unit for both mislabels the y axis. Round to three
            // significant digits: an axis tick read "2.1430000000000002 W".
            const axis = Object.values(AXES).find((entry) => entry.label === label);
            if (axis == null) {
                throw new Error(`The alternatives map has no axis labelled "${label}"`);
            }
            if (value === 0) return '0';
            const shown = formatUnit(value, axis.unit);
            const rounded = Number(shown.label);
            const label3 = Number.isFinite(rounded) ? Number(rounded.toPrecision(3)) : shown.label;
            return `${label3} ${shown.unit}`;
        },
        /**
         * The comparator asks for the axis captions and calls this without a
         * default, so it must always be passed; ours names the axis and its unit.
         */
        labelFormatter(label) {
            const axis = Object.values(AXES).find((entry) => entry.label === label);
            return axis == null ? label : `${label} (${axis.unit})`;
        },
        /** The adviser settings the Core panel uses, so both ask the same question. */
        adviserSettings() {
            return {
                ...this.$settingsStore.adviserSettings,
                allowToroidalCores: this.$settingsStore.magneticBuilderSettings.allowToroidalCores,
                allowDistributedGaps: this.$settingsStore.magneticBuilderSettings.allowDistributedGaps,
                allowStacks: this.$settingsStore.magneticBuilderSettings.allowStacks,
                useOnlyCoresInStock: this.$settingsStore.magneticBuilderSettings.useOnlyCoresInStock,
            };
        },
        async findAlternatives() {
            if (this.loading) return;
            if ((this.masStore.mas?.inputs?.operatingPoints?.length ?? 0) === 0) {
                this.errorMessage = 'Set an operating point first: the adviser ranks cores against it.';
                return;
            }
            this.loading = true;
            this.errorMessage = '';
            try {
                this.ownCandidates = await this.taskQueueStore.adviseCoreCandidates(
                    this.masStore.mas.inputs,
                    this.masStore.coreAdviserWeights,
                    this.adviserSettings(),
                    HOW_MANY,
                );
            }
            catch (error) {
                this.errorMessage = error.message;
                this.$emit('error', error);
            }
            finally {
                this.loading = false;
            }
        },
        async pointClicked(event) {
            // Series 1 is the reference — the design itself, nothing to adopt.
            if (event?.componentIndex === 1) return;
            if (this.readOnly || this.adopting) return;
            const point = (this.points ?? [])[event?.dataIndex];
            if (point == null) return;
            this.errorMessage = '';
            this.adopting = true;
            try {
                const magnetic = point.candidate.mas.magnetic;
                await applyAdvisedCore({
                    masStore: this.masStore,
                    taskQueueStore: this.taskQueueStore,
                    historyStore: this.historyStore,
                    magnetic,
                });
                // The same announcement the Advise button makes, so the core panel
                // reloads its dropdowns with the core the user just picked.
                this.taskQueueStore.coreAdvised(true, magnetic);
                this.$emit('coreAdopted', point.candidate);
            }
            catch (error) {
                this.errorMessage = error.message;
                this.$emit('error', error);
            }
            finally {
                this.adopting = false;
            }
        },
    },
}
</script>

<template>
    <div class="alternatives-panel" :data-cy="dataTestLabel + '-Alternatives'">
        <div class="alternatives-bar">
            <ElementFromList
                class="alternatives-axis"
                :dataTestLabel="dataTestLabel + '-Alternatives-XAxis'"
                :name="'x'"
                :replaceTitle="'x'"
                @update="axisChosenByUser.x = true"
                :titleSameRow="true"
                :justifyContent="true"
                v-model="axes"
                :options="availableAxes"
                :labelWidthProportionClass="'col-2'"
                :selectStyleClass="'col-10'"
                :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
            />
            <ElementFromList
                class="alternatives-axis"
                :dataTestLabel="dataTestLabel + '-Alternatives-YAxis'"
                :name="'y'"
                :replaceTitle="'y'"
                @update="axisChosenByUser.y = true"
                :titleSameRow="true"
                :justifyContent="true"
                v-model="axes"
                :options="availableAxes"
                :labelWidthProportionClass="'col-2'"
                :selectStyleClass="'col-10'"
                :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
            />
            <button
                v-if="candidates == null"
                type="button"
                :data-cy="dataTestLabel + '-Alternatives-find-button'"
                class="alternatives-btn"
                :disabled="loading"
                @click="findAlternatives"
            >
                <i class="pi" :class="loading ? 'pi-spin pi-spinner' : 'pi-sparkles'"></i>
                <span>{{ shownCandidates == null ? 'Find' : 'Refresh' }}</span>
            </button>
        </div>

        <p
            v-if="errorMessage"
            :data-cy="dataTestLabel + '-Alternatives-error'"
            class="alternatives-message alternatives-error"
        >{{ errorMessage }}</p>

        <p
            v-else-if="shownCandidates == null && !loading"
            :data-cy="dataTestLabel + '-Alternatives-empty'"
            class="alternatives-message"
        >{{ canRank
            ? 'Looking for the cores that also fit these requirements…'
            : 'Set an operating point and a processed core, and the cores that also fit these requirements appear here.' }}</p>

        <p v-else-if="loading" class="alternatives-message">
            <i class="pi pi-spin pi-spinner mr-2"></i>Ranking cores against your requirements…
        </p>

        <p
            v-else-if="points != null && points.length === 0"
            :data-cy="dataTestLabel + '-Alternatives-none'"
            class="alternatives-message"
        >The adviser returned no core it could process for this comparison.</p>

        <p
            v-else-if="chartReference == null"
            :data-cy="dataTestLabel + '-Alternatives-noreference'"
            class="alternatives-message"
        >The current core has to be processed before it can be compared — set a shape and a material first.</p>

        <ScatterChartComparator
            v-else
            :key="chartKey"
            :dataTestLabel="dataTestLabel + '-Alternatives'"
            :data="chartData"
            :reference="chartReference"
            :xLabel="xLabel"
            :yLabel="yLabel"
            :axisFormatter="axisFormatter"
            :labelFormatter="labelFormatter"
            :compact="true"
            height="20rem"
            @click="pointClicked"
        />
    </div>
</template>

<style scoped>
.alternatives-panel {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-height: 0;
    height: 100%;
}

.alternatives-bar {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
    font-size: 0.8rem;
}

.alternatives-axis {
    flex: 1 1 8rem;
    min-width: 0;
}

/* The chart is the point of the panel; the axis pickers stay on one slim line. */
.alternatives-bar :deep(.p-select) {
    font-size: 0.78rem;
}

.alternatives-bar :deep(.p-select-label) {
    padding-top: 0.15rem;
    padding-bottom: 0.15rem;
}

.alternatives-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    background: transparent;
    color: var(--p-primary);
    border: 1px solid rgba(var(--p-primary-rgb), 0.45);
}

.alternatives-btn:not(:disabled):hover {
    background: rgba(var(--p-primary-rgb), 0.12);
}

.alternatives-btn:disabled {
    opacity: 0.6;
    cursor: default;
}

.alternatives-message {
    color: var(--p-gray-400);
    font-size: 0.8rem;
    margin: 0;
    padding: 1rem 0.25rem;
    text-align: center;
}

.alternatives-error {
    color: var(--p-danger);
}
</style>
