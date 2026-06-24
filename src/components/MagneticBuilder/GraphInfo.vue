<script setup>
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import { removeTrailingZeroes, deepCopy, isMobile, toCamelCase } from '/WebSharedComponents/assets/js/utils.js'
import ImpedanceOverFrequency from './Graphs/ImpedanceOverFrequency.vue'
import QFactorOverFrequency from './Graphs/QFactorOverFrequency.vue'
import ResistancesOverFrequency from './Graphs/ResistancesOverFrequency.vue'
import WindingResistancesOverFrequency from './Graphs/WindingResistancesOverFrequency.vue'
import WindingLossesOverFrequency from './Graphs/WindingLossesOverFrequency.vue'
import LossesOverFrequency from './Graphs/LossesOverFrequency.vue'
import CoreLossesOverFrequency from './Graphs/CoreLossesOverFrequency.vue'
import GraphCommonParameters from './Graphs/GraphCommonParameters.vue'
import MagnetizingInductanceOverFrequency from './Graphs/MagnetizingInductanceOverFrequency.vue'
import MagnetizingInductanceOverTemperature from './Graphs/MagnetizingInductanceOverTemperature.vue'
import MagnetizingInductanceOverDcBias from './Graphs/MagnetizingInductanceOverDcBias.vue'
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
        operatingPointIndex: {
            type: Number,
            default: 0,
        },
    },
    data() {
        const errorMessage = "";

        return {
            errorMessage,
        }
    }
}
</script>

<template>
    <div class="graph-panel">
        <div class="graph-header">
            <i class="pi pi-chart-line"></i>
            <span>Graphs</span>
        </div>
        <div class="graph-body">
            <ImpedanceOverFrequency 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'impedanceOverFrequency'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                />
            </ImpedanceOverFrequency>
            <QFactorOverFrequency 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'qFactorOverFrequency'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                />
            </QFactorOverFrequency> 
            <MagnetizingInductanceOverFrequency 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'magnetizingInductanceOverFrequency'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                />

            </MagnetizingInductanceOverFrequency> 
            <MagnetizingInductanceOverTemperature 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'magnetizingInductanceOverTemperature'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                    :frequencyDependent="false"
                    :temperatureDependent="true"
                />

            </MagnetizingInductanceOverTemperature> 

            <MagnetizingInductanceOverDcBias 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'magnetizingInductanceOverDcBias'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                    :frequencyDependent="false"
                    :dcBiasDependent="true"
                />

            </MagnetizingInductanceOverDcBias> 

            <ResistancesOverFrequency 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'resistancesOverFrequency'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                />

            </ResistancesOverFrequency> 
            <WindingResistancesOverFrequency 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'windingResistancesOverFrequency'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                />

            </WindingResistancesOverFrequency> 
            <WindingLossesOverFrequency 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'windingLossesOverFrequency'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                />

            </WindingLossesOverFrequency>
            <CoreLossesOverFrequency 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'coreLossesOverFrequency'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                />

            </CoreLossesOverFrequency> 
            <LossesOverFrequency 
                v-if="errorMessage == '' && $stateStore.graphParameters.graph == 'lossesOverFrequency'" 
                :dataTestLabel="dataTestLabel"
                :masStore="masStore"
            >
                <GraphCommonParameters
                    :dataTestLabel="dataTestLabel + '-GraphCommonParameters'"
                />

            </LossesOverFrequency> 
            <label v-else :data-cy="dataTestLabel + '-ErrorMEssage'" class="text-danger m-0 col-12 " style="font-size: 0.9em"> {{errorMessage}}</label>


        </div>
    </div>
</template>

<style scoped>
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
}

.graph-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.9rem;
    background: rgba(var(--p-white-rgb), 0.04);
    border-bottom: 1px solid rgba(var(--p-white-rgb), 0.08);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.graph-header i {
    filter: drop-shadow(0 0 4px rgba(var(--p-primary-rgb), 0.45));
}

.graph-body {
    padding: 0.8rem 0.75rem 1rem 0.75rem;
}
</style>