<script setup>
import GraphCommonParameters from './Graphs/GraphCommonParameters.vue'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import { BUILDER_GRAPHS, graphComponent, graphLabels, graphParameters } from './Graphs/graphRegistry.js'
</script>

<script>
/**
 * One builder graph with its chooser (ABT #1121).
 *
 * The Graphs panel at the bottom of the columns layout is this with every
 * domain and the chooser bound to the shared graph parameters; a band inside a
 * layout is the same panel narrowed to one domain with its own choice, so
 * picking "winding losses" next to the wire does not move the main panel.
 *
 * The graph components themselves and their common parameters are untouched:
 * this only decides which one is on screen.
 */
export default {
    components: { GraphCommonParameters, ElementFromList },
    emits: ['update:graph'],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        masStore: {
            type: Object,
            required: true,
        },
        operatingPointIndex: {
            type: Number,
            default: 0,
        },
        /** Graph key on screen. Bound with v-model:graph. */
        graph: {
            type: String,
            required: true,
        },
        /** Domains offered in the chooser; null offers every graph. */
        domains: {
            type: Array,
            default: null,
        },
        title: {
            type: String,
            default: 'Graphs',
        },
        /** Hidden when the panel's own header already carries the chooser. */
        showSelector: {
            type: Boolean,
            default: true,
        },
        /** The chart's common parameters (axes, ranges) under the chart. */
        showParameters: {
            type: Boolean,
            default: true,
        },
        /**
         * Compact: the chart drops its own title and toolbox and uses a shorter
         * box, since this panel's header already names it (ABT #1121).
         */
        compact: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            // ElementFromList writes into this and then emits `update`; a computed
            // would be discarded and the choice would never stick.
            editable: { graph: this.graph },
        }
    },
    computed: {
        availableGraphs() {
            return graphLabels(this.domains);
        },
        currentGraph() {
            return graphComponent(this.graph);
        },
        /**
         * A layout can hand us a graph of another domain (the shared parameters
         * remember the last global choice). Fall back to this panel's first
         * graph rather than drawing nothing.
         */
        effectiveGraph() {
            if (this.graph in this.availableGraphs) {
                return this.graph;
            }
            return Object.keys(this.availableGraphs)[0];
        },
        effectiveComponent() {
            return graphComponent(this.effectiveGraph);
        },
        selectorModel() {
            return this.editable;
        },
    },
    watch: {
        graph(chosen) {
            if (chosen !== this.editable.graph) {
                this.editable.graph = chosen;
            }
        },
        effectiveGraph: {
            immediate: true,
            handler(chosen) {
                // Keep the chooser and the chart on the same graph, including the
                // first paint when the stored choice belongs to another domain.
                if (chosen !== this.editable.graph) {
                    this.editable.graph = chosen;
                }
                if (chosen !== this.graph) {
                    this.$emit('update:graph', chosen);
                }
            },
        },
    },
    methods: {
        graphChanged(chosen) {
            if (!(chosen in BUILDER_GRAPHS)) {
                throw new Error(`Unknown builder graph "${chosen}"`);
            }
            this.$emit('update:graph', chosen);
        },
    },
}
</script>

<template>
    <div class="graph-panel" :data-cy="dataTestLabel + '-GraphPanel'">
        <div class="graph-header">
            <span class="graph-header-title">
                <i class="pi pi-chart-line"></i>
                <span>{{ title }}</span>
            </span>
            <ElementFromList
                v-if="showSelector"
                class="graph-header-select"
                :dataTestLabel="dataTestLabel + '-GraphPanel-GraphSelector'"
                :name="'graph'"
                :titleSameRow="true"
                :justifyContent="true"
                v-model="selectorModel"
                @update="graphChanged"
                :options="availableGraphs"
                :labelWidthProportionClass="'col-0'"
                :selectStyleClass="'col-12'"
                :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                :textColor="$styleStore.magneticBuilder.inputTextColor"
            />
        </div>
        <div class="graph-body">
            <component
                :is="effectiveComponent"
                :key="effectiveGraph"
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
                :compact="compact"
            >
                <!--
                    The v-if goes on the TEMPLATE, not on the component: a slot
                    whose content is v-if'd away still counts as a slot, so the
                    graph kept rendering its parameters column as an empty box
                    beside the chart (ABT #1121).
                -->
                <template v-if="showParameters" #default>
                    <GraphCommonParameters
                        :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                        :showGraphSelector="!showSelector"
                        v-bind="graphParameters(effectiveGraph)"
                    />
                </template>
            </component>
        </div>
    </div>
</template>

<style scoped>
/* Chrome copied from nothing: these are the rules GraphInfo used to carry, now
 * in the component that draws the panel, so every layout gets the same panel. */
.graph-panel {
    background: linear-gradient(180deg,
        rgba(var(--p-dark-rgb), 0.75) 0%,
        rgba(var(--p-dark-rgb), 0.55) 100%);
    border: 1px solid rgba(var(--p-white-rgb), 0.08);
    border-left: 3px solid rgba(var(--p-primary-rgb), 0.8);
    border-radius: 14px;
    margin: 0.5rem 0 1rem 0;
    box-shadow: 0 6px 24px rgba(var(--p-black-rgb), 0.45), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.graph-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.9rem;
    background: rgba(var(--p-white-rgb), 0.04);
    border-bottom: 1px solid rgba(var(--p-white-rgb), 0.08);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.graph-header-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
}

.graph-header-select {
    flex: 0 1 20rem;
    min-width: 0;
}

.graph-header i {
    filter: drop-shadow(0 0 4px rgba(var(--p-primary-rgb), 0.45));
}

.graph-body {
    padding: 0.8rem 0.75rem 1rem 0.75rem;
    flex: 1;
    min-height: 0;
}
</style>
