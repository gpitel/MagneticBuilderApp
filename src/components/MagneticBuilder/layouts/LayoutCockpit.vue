<script setup>
import PanelFrame from '/WebSharedComponents/Common/PanelFrame.vue'
import BasicCoreSelector from '../Core/BasicCoreSelector.vue'
import BasicWireBuilder from '../Wire/BasicWireBuilder.vue'
import BasicCoilBuilder from '../Coil/BasicCoilBuilder.vue'
import CoreInfo from '../Core/CoreInfo.vue'
import WireInfo from '../Wire/WireInfo.vue'
import CoilInfo from '../Coil/CoilInfo.vue'
import AlternativesPanel from '../Common/AlternativesPanel.vue'
import VisualizerSwitch from '../Common/VisualizerSwitch.vue'
import GraphPanel from '../GraphPanel.vue'
</script>

<script>
import { BUILDER_LAYOUT_PROPS, BUILDER_LAYOUT_EMITS } from './layoutProps.js'
import { firstGraphOfDomains } from '../Graphs/graphRegistry.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'

/**
 * Cockpit — every input in a rail, one large canvas, results always on screen
 * (ABT #1121).
 *
 * For the part of the work that is looking rather than typing: a field plot, a
 * loss curve, the solid turned around. The inputs stay reachable in the rail
 * rather than being hidden behind the view, and the numbers that tell you
 * whether the design is any good never leave the screen.
 */
const TABS = {
    geometry: { label: 'Geometry', icon: 'pi-eye' },
    graphs: { label: 'Graphs', icon: 'pi-chart-line' },
    alternatives: { label: 'Alternatives', icon: 'pi-sitemap' },
};

export default {
    emits: BUILDER_LAYOUT_EMITS,
    props: { ...BUILDER_LAYOUT_PROPS },
    computed: {
        /**
         * A frequency sweep needs the wound coil: a shape or material change
         * wipes turnsDescription while the design is otherwise complete, and the
         * engine then refuses with COIL_NOT_PROCESSED (ABT #1121).
         */
        /** The canvas tabs this builder allows: embedding hosts can turn each feature off. */
        tabs() {
            const allowed = { geometry: this.useVisualizers, graphs: this.enableGraphs, alternatives: this.enableAdvise };
            return Object.fromEntries(Object.entries(TABS).filter(([key]) => allowed[key]));
        },
        /** The tab on screen: the chosen one while it is allowed, else the first allowed. */
        shownTab() {
            return this.tab in this.tabs ? this.tab : Object.keys(this.tabs)[0] ?? null;
        },
        coilIsWound() {
            return this.magneticBuilt && this.masStore.mas?.magnetic?.coil?.turnsDescription != null;
        },
    },
    data() {
        return {
            taskQueueStore: useTaskQueueStore(),
            tab: 'geometry',
            geometryView: '2D',
            graph: firstGraphOfDomains(['magnetic']),
            windingIndex: 0,
            fillingFactors: null,
            redraw: 0,
            subscriptions: [],
        }
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
    <div class="layout-cockpit" :data-cy="dataTestLabel + '-LayoutCockpit'">

        <!-- ── inputs ───────────────────────────────────────────── -->
        <div class="cockpit-rail cockpit-rail-inputs">
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
            <BasicCoilBuilder
                v-if="enableCoil"
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
                :readOnly="readOnly"
                :useVisualizers="false"
                :showInfoPanel="false"
                :enableSimulation="enableSimulation"
                :enableAutoSimulation="enableAutoSimulation"
                :enableOptions="enableCoilOptions"
                :enableSubmenu="enableSubmenu"
                :enableAdvise="enableAdvise"
                :operatingPointIndex="operatingPointIndex"
                :showInterleavingOrder="showInterleavingOrder"
                :enableTemperaturePlot="enableTemperaturePlot"
                @fillingFactorsChanged="fillingFactors = $event"
            />
        </div>

        <!-- ── canvas ───────────────────────────────────────────── -->
        <div class="cockpit-canvas">
            <PanelFrame
                v-if="shownTab != null"
                :title="tabs[shownTab].label"
                :icon="tabs[shownTab].icon"
                :dataTestLabel="dataTestLabel + '-Cockpit-Canvas'"
            >
                <template #actions>
                    <button
                        v-for="(entry, key) in tabs"
                        :key="key"
                        type="button"
                        :data-cy="dataTestLabel + '-Cockpit-tab-' + key"
                        class="cockpit-tab"
                        :class="{ 'cockpit-tab-on': shownTab === key }"
                        @click="tab = key"
                    >
                        <i class="pi" :class="entry.icon"></i>
                        <span>{{ entry.label }}</span>
                    </button>
                </template>

                <VisualizerSwitch
                    v-if="shownTab === 'geometry'"
                    :dataTestLabel="dataTestLabel + '-Cockpit'"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    v-model:view="geometryView"
                    :enableSimulation="enableSimulation"
                    :enableTemperaturePlot="enableTemperaturePlot"
                    :forceUpdate="redraw"
                />

                <GraphPanel
                    v-else-if="shownTab === 'graphs' && coilIsWound"
                    :dataTestLabel="dataTestLabel + '-Cockpit-Graph'"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    v-model:graph="graph"
                    :domains="null"
                    title="Graphs"
                />
                <p v-else-if="shownTab === 'graphs'" class="cockpit-note">
                    Finish the magnetic — core, wire and a wound coil — to plot it.
                </p>

                <AlternativesPanel
                    v-else
                    :dataTestLabel="dataTestLabel + '-Cockpit'"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :readOnly="readOnly"
                    @coreAdopted="redraw += 1"
                />
            </PanelFrame>
        </div>

        <!-- ── results ──────────────────────────────────────────── -->
        <div class="cockpit-rail cockpit-rail-results">
            <template v-if="enableSimulation">
                <CoreInfo
                    :dataTestLabel="dataTestLabel + '-CoreInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                />
                <WireInfo
                    :dataTestLabel="dataTestLabel + '-WireInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :windingIndex="windingIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                />
                <CoilInfo
                    v-if="enableCoil"
                    :dataTestLabel="dataTestLabel + '-BasicCoreInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                    :fillingFactors="fillingFactors"
                />
            </template>
            <PanelFrame v-else title="Results" icon="pi-info-circle">
                <p class="cockpit-note">Simulation is off — turn it on in Settings to see the numbers.</p>
            </PanelFrame>
        </div>
    </div>
</template>

<style scoped>
.layout-cockpit {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
    width: 100%;
    min-height: 0;
}

.cockpit-rail {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
    max-height: 82vh;
    overflow-y: auto;
}

.cockpit-rail-inputs {
    /* Wide enough for a dimension field and its unit beside a label: below this
     * the selects truncate and the unit box spills out (ABT #1121). */
    flex: 0 0 28%;
    min-width: 27rem;
}

.cockpit-rail-results {
    flex: 0 0 26%;
}

.cockpit-canvas {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    /* The canvas is the point of this layout, so the geometry gets the room. */
    --visualizer-switch-height: 34rem;
}

.cockpit-tab {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    background: transparent;
    color: var(--p-gray-400);
    border: 1px solid color-mix(in srgb, var(--p-gray-600) 35%, transparent);
}

.cockpit-tab-on {
    color: var(--p-primary);
    border-color: rgba(var(--p-primary-rgb), 0.55);
    background: rgba(var(--p-primary-rgb), 0.12);
}

.cockpit-note {
    color: var(--p-gray-400);
    font-size: 0.8rem;
    margin: 0;
    padding: 1.5rem 0.5rem;
    text-align: center;
}

/* Three rails do not fit a narrow screen: stack them, inputs first. */
@media (max-width: 1300px) {
    .layout-cockpit {
        flex-direction: column;
    }
    .cockpit-rail,
    .cockpit-canvas {
        flex: 1 1 auto;
        max-height: none;
    }
}
</style>
