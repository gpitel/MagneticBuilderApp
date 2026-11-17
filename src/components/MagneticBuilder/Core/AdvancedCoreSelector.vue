<script setup>
import AdvancedCoreSelectorShape from './AdvancedCoreSelector/AdvancedCoreSelectorShape.vue'
import AdvancedCoreSelectorGapping from './AdvancedCoreSelector/AdvancedCoreSelectorGapping.vue'
import AdvancedCoreSelectorMaterial from './AdvancedCoreSelector/AdvancedCoreSelectorMaterial.vue'
import { useHistoryStore } from '../../../stores/history'
import { deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'
import { newShellMaterial, shellMaterialIncompleteMessage } from './shellMaterial.js'

</script>

<script>
// Warnings and errors go to the host's log when it has one (notices.js).
import { reportNotice, noticesShownInline } from '/WebSharedComponents/assets/js/notices.js'

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
        enableSimulation: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const historyStore = useHistoryStore();
        const localData = {};
        const errorMessage = "";
        const loading = false;
        const forceUpdate = 0;
        const localCore = deepCopy(this.masStore.mas.magnetic.core);
        const subscriptions = [];
        // The material editor edits one material. A core with a material list ([drum, magnetic-epoxy
        // shell] on a semi-shielded drum, ABT #2410) gives it the entry being edited, held apart and
        // written back into the list on Apply.
        const materialEditTarget = taskQueueStore.coreMaterialEditTarget;
        const materialList = localCore.functionalDescription.material;
        let materialHolder = null;
        if (materialEditTarget == 'shell') {
            // A shell not defined yet starts with NO magnetic data (shellMaterial.js): the user enters its
            // name, type (magnetic epoxy) and permeability. Nothing is copied from the drum.
            const shellMaterial = Array.isArray(materialList) && materialList.length > 1 ? materialList[1] : newShellMaterial();
            materialHolder = { functionalDescription: { material: deepCopy(shellMaterial) } };
        }
        else if (Array.isArray(materialList)) {
            materialHolder = { functionalDescription: { material: deepCopy(materialList[0]) } };
        }

        return {
            taskQueueStore,
            historyStore,
            localData,
            errorMessage,
            loading,
            forceUpdate,
            localCore,
            subscriptions,
            materialEditTarget,
            materialHolder,
            shellIncompleteMessage: null,
        }
    },
    computed: {
    },
    watch: { 
    },
    created () {
    },
    mounted () {
        this.subscriptions.push(this.$stateStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "applyChanges") {
                    this.applyChanges();
                }
                if (name == "cancelChanges") {
                    this.cancelChanges();
                }
            });
        }))

        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "bobbinFromCoreShapeGenerated") {
                    if (args[0]) {
                        const bobbin = args[1];
                        const currentBobbin = this.masStore.mas.magnetic.coil.bobbin;
                        // Only clear turns if bobbin actually changed
                        if (JSON.stringify(currentBobbin) !== JSON.stringify(bobbin)) {
                            this.masStore.mas.magnetic.coil.turnsDescription = null;
                            this.masStore.mas.magnetic.coil.layersDescription = null;
                            this.masStore.mas.magnetic.coil.sectionsDescription = null;
                        }
                        this.masStore.mas.magnetic.coil.bobbin = bobbin;
                        this.historyStore.addToHistory(this.masStore.mas);
                    }
                    else {
                        console.error(args[1])
                    }
                }

            });
        }))
    },
    beforeUnmount () {
        this.subscriptions.forEach((subscription) => {subscription();})
        this.taskQueueStore.coreMaterialEditTarget = 'core';
    },
    watch: {
        errorMessage(message) {
            reportNotice('ERROR', 'Core', message);
        },
    },
    methods: {
        inlineNotices() {
            return noticesShownInline();
        },
        customizedCore(customCore) {
            this.masStore.mas.magnetic.core = customCore;
        },
        /** Puts the edited entry of a material list back into it (ABT #2410). */
        writeBackMaterialEntry() {
            if (this.materialHolder == null) return;
            const edited = deepCopy(this.materialHolder.functionalDescription.material);
            const functionalDescription = this.localCore.functionalDescription;
            const list = Array.isArray(functionalDescription.material) ? functionalDescription.material : [functionalDescription.material];
            if (this.materialEditTarget == 'shell') {
                functionalDescription.material = [list[0], edited];
                // The shell is material[1]; the deprecated magneticEpoxy coating form is not written, and
                // one left from an older design would contradict it.
                const coating = functionalDescription.coating;
                if (coating != null && (coating == 'magneticEpoxy' || coating.type == 'magneticEpoxy')) {
                    functionalDescription.coating = null;
                }
            }
            else {
                functionalDescription.material = [edited, ...list.slice(1)];
            }
        },
        applyChanges() {
            if (this.materialEditTarget == 'shell') {
                // A shell without its permeability is not applied: the core would have nothing to compute
                // the shell's reluctance from. The core keeps its previous state and the editor says what
                // is missing (ABT #2410).
                this.shellIncompleteMessage = shellMaterialIncompleteMessage(this.materialHolder.functionalDescription.material);
                if (this.shellIncompleteMessage != null) {
                    return;
                }
            }
            this.writeBackMaterialEntry();
            const original = this.masStore.mas.magnetic.core.functionalDescription;
            const geometryUnchanged = ['shape', 'gapping', 'numberStacks'].every((key) =>
                JSON.stringify(original[key]) == JSON.stringify(this.localCore.functionalDescription[key]));
            if (this.materialEditTarget == 'shell' && geometryUnchanged) {
                // Only the shell material changed: the core keeps its shape, bobbin and coil. It is
                // processed again so every panel recalculates with the shell.
                // Applied whole or not at all, like a core change in the core panel: a core the engine
                // refuses puts the previous one back and says why (Core Info and the Engine log).
                const previousCore = deepCopy(this.masStore.mas.magnetic.core);
                const taskQueueStore = this.taskQueueStore;
                const masStore = this.masStore;
                const historyStore = this.historyStore;
                taskQueueStore.coreMaterialEditTarget = 'core';
                masStore.mas.magnetic.core = deepCopy(this.localCore);
                this.$stateStore.magneticBuilder.mode.core = this.$stateStore.MagneticBuilderModes.Basic;
                taskQueueStore.processCore(masStore.mas.magnetic.core).then(() => {
                    if (taskQueueStore.coreChangeRefusal !== '') {
                        taskQueueStore.coreChangeAccepted();
                    }
                    historyStore.addToHistory(masStore.mas);
                })
                .catch((error) => {
                    const reason = String(error?.message ?? error).replace(/^(Error: )?Exception: /, '');
                    masStore.mas.magnetic.core = previousCore;
                    taskQueueStore.coreChangeRefused(reason);
                    reportNotice('ERROR', 'Core', `The shell material was not changed, the design keeps its previous core: ${reason}`);
                });
                return;
            }
            this.taskQueueStore.coreMaterialEditTarget = 'core';
            this.localCore.functionalDescription.shape.type = "custom";
            this.localCore.name = "Custom";
            this.masStore.mas.magnetic.manufacturerInfo = null;

            this.masStore.mas.magnetic.core = deepCopy(this.localCore);
            this.$stateStore.magneticBuilder.mode.core = this.$stateStore.MagneticBuilderModes.Basic;
            this.taskQueueStore.generateBobbinFromCoreShape(this.localCore, this.masStore.mas.inputs.designRequirements.wiringTechnology).then((bobbin) => {
                this.masStore.mas.magnetic.coil.bobbin = bobbin;
            });
        },
        cancelChanges() {
            this.taskQueueStore.coreMaterialEditTarget = 'core';
            this.$stateStore.magneticBuilder.mode.core = this.$stateStore.MagneticBuilderModes.Basic;
        },
        errorInDimensions() {
            this.errorMessage = "The core cannot be drawn with these dimensions: one of them is not valid (zero, negative, or too large for the rest of the shape). Review the dimensions.";
        },
        clearError() {
            this.errorMessage = "";
        },
    }
}
</script>

<template>
    <div class="advcore-panel">
        <div class="advcore-header">
            <i class="pi pi-wrench"></i>
            <span v-if="materialEditTarget == 'shell'" :data-cy="dataTestLabel + '-ShellMaterialTitle'">Shell material of the semi-shielded drum (magnetic epoxy)</span>
            <span v-else>Custom magnetic core</span>
        </div>
        <div class="advcore-body">
            <img :data-cy="dataTestLabel + '-BasicCoreSelector-loading'" v-if="loading" class="mx-auto d-block advcore-loading" alt="loading" :src="$settingsStore.loadingGif">
            <AdvancedCoreSelectorShape
                v-if="$stateStore.magneticBuilder.submode.core == $stateStore.MagneticBuilderCoreSubmodes.Shape"
                :dataTestLabel="dataTestLabel + '-AdvancedCoreSelectorShape'"
                :core="localCore"
                :enableSimulation="true"
                @errorInDimensions="errorInDimensions"
                @renderSuccess="clearError"
            />
            <AdvancedCoreSelectorGapping
                v-if="$stateStore.magneticBuilder.submode.core == $stateStore.MagneticBuilderCoreSubmodes.Gapping"
                :dataTestLabel="dataTestLabel + '-AdvancedCoreSelectorGapping'"
                :core="localCore"
                :inputs="masStore.mas.inputs"
                :enableSimulation="true"
            />
            <AdvancedCoreSelectorMaterial
                v-if="$stateStore.magneticBuilder.submode.core == $stateStore.MagneticBuilderCoreSubmodes.Material"
                :dataTestLabel="dataTestLabel + '-AdvancedCoreSelectorMaterial'"
                :core="materialHolder ?? localCore"
                :enableSimulation="true"
            />
            <label v-if="shellIncompleteMessage != null" :data-cy="dataTestLabel + '-ShellMaterialIncomplete'" class="text-danger col-12 pt-1 advcore-error">{{shellIncompleteMessage}}</label>
            <label v-if="inlineNotices()" class="text-danger col-12 pt-1 advcore-error">{{errorMessage}}</label>
        </div>
    </div>
</template>

<style scoped>
.advcore-panel {
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

.advcore-header {
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

.advcore-header i {
    filter: drop-shadow(0 0 4px rgba(var(--p-primary-rgb), 0.45));
}

.advcore-body {
    padding: 0.8rem 0.75rem;
}

.advcore-loading {
    max-width: 60%;
    height: auto;
}

.advcore-error {
    font-size: 0.85em;
    margin-top: 0.5rem;
}
</style>
