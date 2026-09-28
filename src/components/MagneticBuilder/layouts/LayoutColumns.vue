<script setup>
import CoreBuilder from '../Core/CoreBuilder.vue'
import BasicWireBuilder from '../Wire/BasicWireBuilder.vue'
import BasicCoilBuilder from '../Coil/BasicCoilBuilder.vue'
import GraphInfo from '../GraphInfo.vue'
import { isMobile } from '/WebSharedComponents/assets/js/utils.js'
</script>

<script>
import { BUILDER_LAYOUT_PROPS, BUILDER_LAYOUT_EMITS } from './layoutProps.js'
import { useMagneticBuilderSettingsStore } from '../../../stores/magneticBuilderSettings'

/**
 * Columns — core, wire and coil side by side with the graph strip underneath
 * (ABT #1121). The builder's arrangement since it was written, moved here
 * unchanged when layouts became switchable, so it stays the default and the
 * one that stacks cleanly on a narrow screen.
 */
export default {
    emits: BUILDER_LAYOUT_EMITS,
    props: { ...BUILDER_LAYOUT_PROPS },
    data() {
        return {
            magneticBuilderSettingsStore: useMagneticBuilderSettingsStore(),
        }
    },
    methods: { isMobile },
}
</script>

<template>
    <div class="layout-columns" :data-cy="dataTestLabel + '-LayoutColumns'">
        <div class="row gx-0">
            <div :class="isMobile($windowWidth) ? 'col-12' : enableCoil ? 'col-4' : 'col-offset-1 col-4'">
                <CoreBuilder
                    :masStore="masStore"
                    :readOnly="readOnly"
                    :useVisualizers="useVisualizers"
                    :enableSimulation="enableSimulation"
                    :enableAutoSimulation="enableAutoSimulation"
                    :enableSubmenu="enableSubmenu"
                    :enableCustomize="enableCustomize"
                    :enableAdvise="enableAdvise"
                    :operatingPointIndex="operatingPointIndex"
                    @customizeCore="$emit('customizeCore')"
                />
            </div>
            <div :class="isMobile($windowWidth) ? 'col-12' : enableCoil ? 'col-4' : 'col-offset-1 col-4'">
                <BasicWireBuilder
                    :masStore="masStore"
                    :readOnly="readOnly"
                    :useVisualizers="useVisualizers"
                    :enableSimulation="enableSimulation"
                    :enableAutoSimulation="enableAutoSimulation"
                    :enableSubmenu="enableSubmenu"
                    :enableAdvise="enableAdvise"
                    :isIsolatedApp="isIsolatedApp"
                    :operatingPointIndex="operatingPointIndex"
                />
            </div>
            <div v-if="enableCoil" :class="isMobile($windowWidth) ? 'col-12' : 'col-4'">
                <BasicCoilBuilder
                    :masStore="masStore"
                    :readOnly="readOnly"
                    :useVisualizers="useVisualizers"
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
            <div v-else class="col-2" />
        </div>
        <div v-if="enableGraphs && magneticBuilderSettingsStore.enableGraphs" class="row w-100">
            <h5 v-if="!magneticBuilt" class="text-danger my-2">Select the magnetic first</h5>
            <GraphInfo
                v-else
                :masStore="masStore"
                :operatingPointIndex="operatingPointIndex"
            />
        </div>
    </div>
</template>
