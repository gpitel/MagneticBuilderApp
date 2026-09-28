<script setup>
import PanelFrame from '/WebSharedComponents/Common/PanelFrame.vue'
import BasicCoreSelector from '../Core/BasicCoreSelector.vue'
import BasicWireBuilder from '../Wire/BasicWireBuilder.vue'
import BasicCoilBuilder from '../Coil/BasicCoilBuilder.vue'
import CoreInfo from '../Core/CoreInfo.vue'
import StackupPanel from '../Common/StackupPanel.vue'
import VisualizerSwitch from '../Common/VisualizerSwitch.vue'
import GraphPanel from '../GraphPanel.vue'
</script>

<script>
import { BUILDER_LAYOUT_PROPS, BUILDER_LAYOUT_EMITS } from './layoutProps.js'
import { firstGraphOfDomains } from '../Graphs/graphRegistry.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'

/**
 * Planar — the layer stack in the middle (ABT #1121).
 *
 * A printed winding has no turn table and no round-wire diameter: it is copper
 * on layers, and what a designer checks is the stack, whether it fits the
 * window, and what the layers do with frequency. The wire and coil panels are
 * the planar ones the builder already routes to when the design requirement
 * says the wiring technology is printed — this only puts them in the order
 * that suits the work.
 */
export default {
    emits: BUILDER_LAYOUT_EMITS,
    props: { ...BUILDER_LAYOUT_PROPS },
    data() {
        return {
            taskQueueStore: useTaskQueueStore(),
            layerGraph: firstGraphOfDomains(['winding']),
            geometryView: '2D',
            redraw: 0,
            subscriptions: [],
        }
    },
    computed: {
        /**
         * A frequency sweep needs the wound coil: a shape or material change
         * wipes turnsDescription while the design is otherwise complete, and the
         * engine then refuses with COIL_NOT_PROCESSED (ABT #1121).
         */
        coilIsWound() {
            return this.magneticBuilt && this.masStore.mas?.magnetic?.coil?.turnsDescription != null;
        },
        /** What the design says it is, so the layout can say when it disagrees. */
        wiringTechnology() {
            return this.masStore.mas?.inputs?.designRequirements?.wiringTechnology ?? null;
        },
        isPrinted() {
            return (this.wiringTechnology ?? '').toLowerCase() === 'printed';
        },
    },
    mounted() {
        this.subscriptions.push(this.taskQueueStore.$onAction(({ name, after }) => {
            after(() => {
                if (name === 'coreProcessed' || name === 'magneticBuilderReady') {
                    this.redraw += 1;
                }
            });
        }));
    },
    beforeUnmount() {
        this.subscriptions.forEach((unsubscribe) => unsubscribe());
    },
}
</script>

<template>
    <div class="layout-planar" :data-cy="dataTestLabel + '-LayoutPlanar'">
        <p
            v-if="!isPrinted"
            :data-cy="dataTestLabel + '-Planar-notPrinted'"
            class="planar-warning"
        >
            This design's wiring technology is
            <b>{{ wiringTechnology ?? 'not set' }}</b>, so it is wound with wire, not printed.
            The stack below stays empty until the design requirements ask for a printed winding.
        </p>

        <div class="planar-row">
            <div class="planar-cell planar-cell-core">
                <BasicCoreSelector
                    :dataTestLabel="dataTestLabel"
                    :masStore="masStore"
                    :readOnly="readOnly"
                    :operatingPointIndex="operatingPointIndex"
                    :enableSimulation="enableSimulation"
                    :enableAutoSimulation="enableAutoSimulation"
                    :enableSubmenu="enableSubmenu"
                    :enableCustomize="enableCustomize"
                    :enableAdvise="enableAdvise"
                    :useVisualizers="false"
                    :showInfoPanel="false"
                    :forceUpdateVisualizer="redraw"
                    :imageUpToDate="true"
                    @customizeCore="$emit('customizeCore')"
                />
                <CoreInfo
                    v-if="enableSimulation"
                    :dataTestLabel="dataTestLabel + '-CoreInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                />
            </div>

            <div class="planar-cell planar-cell-stack">
                <PanelFrame
                    title="Stackup"
                    icon="pi-bars"
                    accent="var(--p-danger)"
                    :dataTestLabel="dataTestLabel + '-Planar-Stackup'"
                >
                    <StackupPanel
                        :dataTestLabel="dataTestLabel + '-Planar'"
                        :masStore="masStore"
                    />
                </PanelFrame>

                <BasicWireBuilder
                    :dataTestLabel="dataTestLabel"
                    :masStore="masStore"
                    :readOnly="readOnly"
                    :useVisualizers="false"
                    :enableSimulation="enableSimulation"
                    :enableAutoSimulation="enableAutoSimulation"
                    :enableSubmenu="enableSubmenu"
                    :enableAdvise="enableAdvise"
                    :isIsolatedApp="isIsolatedApp"
                    :operatingPointIndex="operatingPointIndex"
                />

                <BasicCoilBuilder
                    v-if="enableCoil"
                    :dataTestLabel="dataTestLabel"
                    :masStore="masStore"
                    :readOnly="readOnly"
                    :useVisualizers="false"
                    :enableSimulation="enableSimulation"
                    :enableAutoSimulation="enableAutoSimulation"
                    :enableOptions="enableCoilOptions"
                    :enableSubmenu="enableSubmenu"
                    :enableAdvise="enableAdvise"
                    :operatingPointIndex="operatingPointIndex"
                    :showInterleavingOrder="showInterleavingOrder"
                    :enableTemperaturePlot="enableTemperaturePlot"
                />
            </div>

            <div class="planar-cell planar-cell-view">
                <PanelFrame
                    title="Cross-section"
                    icon="pi-eye"
                    accent="var(--p-success)"
                    :dataTestLabel="dataTestLabel + '-Planar-Geometry'"
                >
                    <p v-if="!useVisualizers" class="planar-note">Visualizers are off in this builder.</p>
                    <VisualizerSwitch
                        v-else
                        :dataTestLabel="dataTestLabel + '-Planar'"
                        :masStore="masStore"
                        :operatingPointIndex="operatingPointIndex"
                        v-model:view="geometryView"
                        :enableSimulation="enableSimulation"
                        :enableTemperaturePlot="enableTemperaturePlot"
                        :forceUpdate="redraw"
                    />
                </PanelFrame>

                <PanelFrame v-if="!enableGraphs" title="Layer response" icon="pi-chart-line" accent="var(--p-success)">
                    <p class="planar-note">Graphs are off in this builder.</p>
                </PanelFrame>
                <GraphPanel
                    v-else-if="coilIsWound"
                    :dataTestLabel="dataTestLabel + '-Planar-Graph'"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    v-model:graph="layerGraph"
                    :domains="['winding']"
                    title="Layer response"
                    :showParameters="false"
                    :compact="true"
                />
                <PanelFrame v-else title="Layer response" icon="pi-chart-line" accent="var(--p-success)">
                    <p class="planar-note">Finish the magnetic to see what the layers do with frequency.</p>
                </PanelFrame>
            </div>
        </div>
    </div>
</template>

<style scoped>
.layout-planar {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: 100%;
}

.planar-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    width: 100%;
}

.planar-cell {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

/* The cards carry their own top margins, which differ between the panel kinds
 * and would leave neighbours in a band a few pixels out of line. */
.planar-cell > :deep(*),
.planar-cell :deep(.panel-frame:first-child),
.planar-cell :deep(.core-config-panel),
.planar-cell :deep(.wire-config-panel),
.planar-cell :deep(.coil-config-panel),
.planar-cell :deep(.coreinfo-panel),
.planar-cell :deep(.wireinfo-panel),
.planar-cell :deep(.coilinfo-panel) {
    margin-top: 0;
}

.planar-cell-core {
    flex: 0 0 26%;
    /* Same floor as the other layouts: below this the selects truncate. */
    min-width: 27rem;
}

.planar-cell-stack {
    flex: 0 0 34%;
}

.planar-cell-view {
    flex: 1 1 0;
    /* Cross-section above, response below: each gets half the column. */
    --visualizer-switch-height: 20rem;
}

.planar-warning {
    color: var(--p-warning);
    font-size: 0.8rem;
    margin: 0;
    padding: 0.4rem 0.6rem;
    border: 1px solid rgba(var(--p-warning-rgb), 0.4);
    border-radius: 8px;
    background: rgba(var(--p-warning-rgb), 0.08);
}

.planar-note {
    color: var(--p-gray-400);
    font-size: 0.8rem;
    margin: 0;
    padding: 1rem 0.25rem;
    text-align: center;
}

@media (max-width: 1200px) {
    .planar-row {
        flex-direction: column;
    }
    .planar-cell-core,
    .planar-cell-stack,
    .planar-cell-view {
        flex: 1 1 auto;
    }
}
</style>
