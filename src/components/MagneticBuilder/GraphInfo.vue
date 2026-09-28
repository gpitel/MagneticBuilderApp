<script setup>
import GraphPanel from './GraphPanel.vue'
</script>

<script>
/**
 * The builder's graph strip: one chart at a time over the whole magnetic, with
 * the chooser and the ranges shared through the state store so the choice
 * survives a layout switch and a reload.
 *
 * Everything it used to do by hand — a ten-branch v-if over the graph
 * components and its own panel chrome — now lives in GraphPanel and the graph
 * registry, which the layouts reuse (ABT #1121).
 */
export default {
    components: { GraphPanel },
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
    },
}
</script>

<template>
    <GraphPanel
        :dataTestLabel="dataTestLabel"
        :masStore="masStore"
        :operatingPointIndex="operatingPointIndex"
        :graph="$stateStore.graphParameters.graph"
        @update:graph="$stateStore.graphParameters.graph = $event"
        :domains="null"
        title="Graphs"
        :showSelector="false"
    />
</template>
