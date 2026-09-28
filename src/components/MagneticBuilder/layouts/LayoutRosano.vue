<script setup>
import PanelFrame from '/WebSharedComponents/Common/PanelFrame.vue'
import BasicCoreSelector from '../Core/BasicCoreSelector.vue'
import BasicWireBuilder from '../Wire/BasicWireBuilder.vue'
import BasicCoilBuilder from '../Coil/BasicCoilBuilder.vue'
import CoreInfo from '../Core/CoreInfo.vue'
import WireInfo from '../Wire/WireInfo.vue'
import AlternativesPanel from '../Common/AlternativesPanel.vue'
import VisualizerSwitch from '../Common/VisualizerSwitch.vue'
import GraphPanel from '../GraphPanel.vue'
</script>

<script>
import { BUILDER_LAYOUT_PROPS, BUILDER_LAYOUT_EMITS } from './layoutProps.js'
import { firstGraphOfDomains } from '../Graphs/graphRegistry.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'

/**
 * Rosano — a row per part of the design (ABT #1121).
 *
 * Each row reads left to right: what you set, what it gives you, and how it
 * compares. The third cell is the one the columns layout has nowhere to put —
 * the alternatives to the core you chose, and the frequency response of the
 * wire you chose — so the advisers and the graphs sit inside the design loop
 * instead of below it or in another tool.
 *
 * The coil keeps its inputs and its results together, because its results
 * (filling factors, section orientation) are edited in the same panel.
 */
export default {
    emits: BUILDER_LAYOUT_EMITS,
    props: { ...BUILDER_LAYOUT_PROPS },
    computed: {
        /**
         * A frequency sweep needs the wound coil: a shape or material change
         * wipes turnsDescription while the design is otherwise complete, and the
         * engine then refuses with COIL_NOT_PROCESSED (ABT #1121).
         */
        coilIsWound() {
            return this.magneticBuilt && this.masStore.mas?.magnetic?.coil?.turnsDescription != null;
        },
    },
    data() {
        return {
            taskQueueStore: useTaskQueueStore(),
            wireGraph: firstGraphOfDomains(['winding']),
            geometryView: '2D',
            coreRedraw: 0,
            // The wire panel owns which winding is on screen; the info cell
            // follows it (BasicWireBuilder raises this, ABT #1121).
            windingIndex: 0,
            subscriptions: [],
        }
    },
    mounted() {
        this.subscriptions.push(this.taskQueueStore.$onAction(({ name, after }) => {
            after(() => {
                if (name === 'coreProcessed' || name === 'magneticBuilderReady') {
                    this.coreRedraw += 1;
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
    <div class="layout-rosano" :data-cy="dataTestLabel + '-LayoutRosano'">

        <!-- ── Core ─────────────────────────────────────────────── -->
        <div class="band" :data-cy="dataTestLabel + '-Band-Core'">
            <div class="band-cell band-cell-inputs">
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
                    :forceUpdateVisualizer="coreRedraw"
                    :imageUpToDate="true"
                    @customizeCore="$emit('customizeCore')"
                />
            </div>

            <div class="band-cell band-cell-info" :data-cy="dataTestLabel + '-Band-CoreInfo'">
                <CoreInfo
                    v-if="enableSimulation"
                    :dataTestLabel="dataTestLabel + '-CoreInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                />
                <PanelFrame v-else title="Core info" icon="pi-info-circle">
                    <p class="band-note">Simulation is off — turn it on in Settings to see the core's numbers.</p>
                </PanelFrame>
            </div>

            <div class="band-cell band-cell-extra">
                <PanelFrame
                    title="Alternative cores"
                    icon="pi-sitemap"
                    accent="var(--p-info)"
                    :dataTestLabel="dataTestLabel + '-Band-Alternatives'"
                >
                    <AlternativesPanel
                        v-if="enableAdvise"
                        :dataTestLabel="dataTestLabel + '-Band'"
                        :masStore="masStore"
                        :operatingPointIndex="operatingPointIndex"
                        :readOnly="readOnly"
                        @coreAdopted="coreRedraw += 1"
                    />
                    <p v-else class="band-note">Alternatives come from the core adviser, which is off in this builder.</p>
                </PanelFrame>
            </div>
        </div>

        <!-- ── Wire ─────────────────────────────────────────────── -->
        <div class="band" :data-cy="dataTestLabel + '-Band-Wire'">
            <div class="band-cell band-cell-inputs">
                <BasicWireBuilder
                    :dataTestLabel="dataTestLabel"
                    :masStore="masStore"
                    :readOnly="readOnly"
                    :useVisualizers="false"
                    :showInfoPanel="false"
                    :enableSimulation="enableSimulation"
                    :enableAutoSimulation="enableAutoSimulation"
                    :enableSubmenu="enableSubmenu"
                    :enableAdvise="enableAdvise"
                    :isIsolatedApp="isIsolatedApp"
                    :operatingPointIndex="operatingPointIndex"
                    @windingIndexChanged="windingIndex = $event"
                />
            </div>

            <div class="band-cell band-cell-info" :data-cy="dataTestLabel + '-Band-WireInfo'">
                <WireInfo
                    v-if="enableSimulation"
                    :dataTestLabel="dataTestLabel + '-WireInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :windingIndex="windingIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                />
                <PanelFrame v-else title="Wire info" icon="pi-info-circle" accent="var(--p-danger)">
                    <p class="band-note">Simulation is off — turn it on in Settings to see the wire's numbers.</p>
                </PanelFrame>
            </div>

            <div class="band-cell band-cell-extra">
                <PanelFrame v-if="!enableGraphs" title="Wire response" icon="pi-chart-line" accent="var(--p-danger)">
                    <p class="band-note">Graphs are off in this builder.</p>
                </PanelFrame>
                <GraphPanel
                    v-else-if="coilIsWound"
                    :dataTestLabel="dataTestLabel + '-Band-WireGraph'"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    v-model:graph="wireGraph"
                    :domains="['winding']"
                    title="Wire response"
                    :showParameters="false"
                    :compact="true"
                />
                <PanelFrame v-else title="Wire response" icon="pi-chart-line" accent="var(--p-danger)">
                    <p class="band-note">Finish the magnetic to see how the winding responds with frequency.</p>
                </PanelFrame>
            </div>
        </div>

        <!-- ── Coil ─────────────────────────────────────────────── -->
        <div v-if="enableCoil" class="band" :data-cy="dataTestLabel + '-Band-Coil'">
            <div class="band-cell band-cell-coil">
                <BasicCoilBuilder
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

            <div class="band-cell band-cell-geometry">
                <PanelFrame
                    title="Geometry"
                    icon="pi-eye"
                    accent="var(--p-success)"
                    :dataTestLabel="dataTestLabel + '-Band-Geometry'"
                >
                    <p v-if="!useVisualizers" class="band-note">Visualizers are off in this builder.</p>
                    <VisualizerSwitch
                        v-else
                        :dataTestLabel="dataTestLabel + '-Band'"
                        :masStore="masStore"
                        :operatingPointIndex="operatingPointIndex"
                        v-model:view="geometryView"
                        :enableSimulation="enableSimulation"
                        :enableTemperaturePlot="enableTemperaturePlot"
                        :forceUpdate="coreRedraw"
                    />
                </PanelFrame>
            </div>
        </div>
    </div>
</template>

<style scoped>
.layout-rosano {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
}

.band {
    display: flex;
    gap: 0.5rem;
    /* Cards take the height of their own content: stretching a cell does not
     * stretch the card inside it, so it only padded the row out. */
    align-items: flex-start;
    width: 100%;
}

.band-cell {
    min-width: 0;
    display: flex;
    flex-direction: column;
}

/* The cards carry their own top margins, which differ between the panel kinds
 * and would leave neighbours in a band a few pixels out of line. */
.band-cell > :deep(*),
.band-cell :deep(.panel-frame:first-child),
.band-cell :deep(.core-config-panel),
.band-cell :deep(.wire-config-panel),
.band-cell :deep(.coil-config-panel),
.band-cell :deep(.coreinfo-panel),
.band-cell :deep(.wireinfo-panel),
.band-cell :deep(.coilinfo-panel) {
    margin-top: 0;
}

.band-cell-inputs {
    flex: 0 0 27%;
    /* A dimension row is a label, a field and a unit select: under this the
     * selects start truncating their value (ABT #1121). */
    min-width: 27rem;
}

.band-cell-info {
    flex: 0 0 30%;
}

.band-cell-extra {
    flex: 1 1 0;
}

.band-cell-coil {
    flex: 0 0 57%;
}

.band-cell-geometry {
    flex: 1 1 0;
    --visualizer-switch-height: 20rem;
}

.band-note {
    color: var(--p-gray-400);
    font-size: 0.8rem;
    margin: 0;
    padding: 1rem 0.25rem;
    text-align: center;
}

/* One band per row is unreadable on a narrow screen: stack the cells. */
@media (max-width: 1100px) {
    .band {
        flex-direction: column;
    }
    .band-cell-inputs,
    .band-cell-info,
    .band-cell-extra,
    .band-cell-coil,
    .band-cell-geometry {
        flex: 1 1 auto;
    }
}
</style>
