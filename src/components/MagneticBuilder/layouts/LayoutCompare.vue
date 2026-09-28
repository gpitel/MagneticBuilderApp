<script setup>
import PanelFrame from '/WebSharedComponents/Common/PanelFrame.vue'
import BasicCoreSelector from '../Core/BasicCoreSelector.vue'
import BasicWireBuilder from '../Wire/BasicWireBuilder.vue'
import BasicCoilBuilder from '../Coil/BasicCoilBuilder.vue'
import CoreInfo from '../Core/CoreInfo.vue'
import AlternativesPanel from '../Common/AlternativesPanel.vue'
import VisualizerSwitch from '../Common/VisualizerSwitch.vue'
</script>

<script>
import { BUILDER_LAYOUT_PROPS, BUILDER_LAYOUT_EMITS } from './layoutProps.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'

/**
 * Compare — the design pinned as the reference, everything else ranked against
 * it (ABT #1121).
 *
 * The question is "what else could I build this with?", but this is still the
 * magnetic builder, not a core browser: the whole design stays editable in the
 * rail — core, wire and coil — while the screen belongs to the comparison.
 * Picking an alternative adopts it and the map re-centres on the new design.
 */
export default {
    emits: BUILDER_LAYOUT_EMITS,
    props: { ...BUILDER_LAYOUT_PROPS },
    data() {
        return {
            taskQueueStore: useTaskQueueStore(),
            geometryView: '2D',
            redraw: 0,
            adopted: null,
            adoptedTimer: null,
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
        if (this.adoptedTimer) clearTimeout(this.adoptedTimer);
        this.subscriptions.forEach((unsubscribe) => unsubscribe());
    },
    methods: {
        coreAdopted(candidate) {
            const core = candidate?.mas?.magnetic?.core?.functionalDescription;
            const shape = typeof core?.shape === 'string' ? core.shape : core?.shape?.name;
            this.adopted = shape ?? null;
            this.redraw += 1;
            if (this.adoptedTimer) clearTimeout(this.adoptedTimer);
            this.adoptedTimer = setTimeout(() => { this.adopted = null; }, 8000);
        },
    },
}
</script>

<template>
    <div class="layout-compare" :data-cy="dataTestLabel + '-LayoutCompare'">

        <!-- The design, all of it, still editable. -->
        <div class="compare-rail">
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
            />
        </div>

        <!-- What it is now, and what else it could be. -->
        <div class="compare-main">
            <div class="compare-reference">
                <PanelFrame
                    title="Reference design"
                    icon="pi-bookmark-fill"
                    :dataTestLabel="dataTestLabel + '-Compare-Reference'"
                >
                    <p v-if="!useVisualizers" class="compare-note">Visualizers are off in this builder.</p>
                    <VisualizerSwitch
                        v-else
                        :dataTestLabel="dataTestLabel + '-Compare'"
                        :masStore="masStore"
                        :operatingPointIndex="operatingPointIndex"
                        v-model:view="geometryView"
                        :enableSimulation="enableSimulation"
                        :enableTemperaturePlot="enableTemperaturePlot"
                        :forceUpdate="redraw"
                    />
                </PanelFrame>

                <CoreInfo
                    v-if="enableSimulation"
                    :dataTestLabel="dataTestLabel + '-CoreInfo'"
                    :advancedMode="$settingsStore.magneticBuilderSettings.advancedMode"
                    :masStore="masStore"
                    :operatingPointIndex="operatingPointIndex"
                    :enableAutoSimulation="enableAutoSimulation"
                />
            </div>

            <div class="compare-alternatives">
                <PanelFrame
                    title="Alternatives to this core"
                    icon="pi-sitemap"
                    accent="var(--p-info)"
                    :dataTestLabel="dataTestLabel + '-Compare-Alternatives'"
                >
                    <p
                        v-if="adopted"
                        :data-cy="dataTestLabel + '-Compare-adopted'"
                        class="compare-adopted"
                    >Now building on {{ adopted }} — the comparison re-centred on it.</p>
                    <AlternativesPanel
                        v-if="enableAdvise"
                        :dataTestLabel="dataTestLabel + '-Compare'"
                        :masStore="masStore"
                        :operatingPointIndex="operatingPointIndex"
                        :readOnly="readOnly"
                        @coreAdopted="coreAdopted"
                    />
                    <p v-else class="compare-note">Alternatives come from the core adviser, which is off in this builder.</p>
                </PanelFrame>
            </div>
        </div>
    </div>
</template>

<style scoped>
.layout-compare {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    width: 100%;
}

.compare-rail {
    flex: 0 0 27%;
    /* A dimension row needs this much before its selects start truncating. */
    min-width: 27rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.compare-main {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
}

.compare-reference {
    flex: 0 0 38%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    /* A thumbnail beside the map, not a full canvas. */
    --visualizer-switch-height: 16rem;
}

.compare-alternatives {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.compare-note {
    color: var(--p-gray-400);
    font-size: 0.8rem;
    margin: 0;
    padding: 1rem 0.25rem;
    text-align: center;
}

.compare-adopted {
    color: var(--p-primary);
    font-size: 0.8rem;
    margin: 0 0 0.4rem 0;
    text-align: center;
}

@media (max-width: 1300px) {
    .layout-compare,
    .compare-main {
        flex-direction: column;
    }
    .compare-main,
    .compare-rail,
    .compare-reference,
    .compare-alternatives {
        flex: 1 1 auto;
        width: 100%;
    }
    .compare-reference {
        --visualizer-switch-height: 22rem;
    }
}
</style>
