<script setup>
import { useMasStore } from '../stores/mas'
import { useHistoryStore } from '../stores/history'
import { download, pruneNulls, deepCopy } from '/WebSharedComponents/assets/js/utils.js'
import Settings from './MagneticBuilder/Settings.vue'
import { useTaskQueueStore } from '../stores/taskQueue'
</script>


<script>

export default {
    emits: ["toolSelected"],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        showConfigurationButton: {
            type: Boolean,
            default: true,
        },
        showResetButton: {
            type: Boolean,
            default: false,
        }
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const masStore = useMasStore();
        const historyStore = useHistoryStore();
        const masExported = false;
        const loading = false;
        const undoRedoBlocked = false;
        return {
            taskQueueStore,
            masStore,
            historyStore,
            masExported,
            loading,
            undoRedoBlocked,
            settingsVisible: false,
        }
    },
    methods: {
        async reset() {
            this.masStore.resetMas('power')
            await this.$nextTick();
            await this.$router.push('/engine_loader');
        },
        undo() {
            if (this.undoRedoBlocked) return;
            this.undoRedoBlocked = true;
            setTimeout(() => { this.undoRedoBlocked = false; }, 300);
            const newMas = this.historyStore.back();
            this.masStore.mas = newMas;
            this.historyStore.historyPointerUpdated();
            this.historyStore.blockAdditions(2000);
        },
        redo() {
            if (this.undoRedoBlocked) return;
            this.undoRedoBlocked = true;
            setTimeout(() => { this.undoRedoBlocked = false; }, 300);
            const newMas = this.historyStore.forward();
            this.masStore.mas = newMas;
            this.historyStore.historyPointerUpdated();
            this.historyStore.blockAdditions(2000);
        },
        load() {
            this.loading = true;
            this.$refs.masFileReader.click()
            setTimeout(() => {this.loading = false;}, 2000);
        },
        exportMAS() {
            const prunedMas = deepCopy(this.masStore.mas)
            pruneNulls(prunedMas)
            download(JSON.stringify(prunedMas, null, 4), "custom_magnetic.json", "text/plain");
            this.masExported = true
            setTimeout(() => this.masExported = false, 2000);
        },
        openSettings() {
            this.settingsVisible = true;
        },
        onSettingsUpdated() {
            // setTimeout(() => {this.$router.push('/engine_loader');}, 100);
        },
        readMASFile(event) {
            const fr = new FileReader();

            fr.onload = async (e) => {
                const newMas = JSON.parse(e.target.result);
                if (newMas.magnetic == null) {
                    return;
                }
                try {
                    // Pass `newMas` (the file just read), not `this.masStore.mas`
                    const response = await this.taskQueueStore.checkAndFixMas(newMas);

                    // Save coil processed data that masAutocomplete may strip
                    const savedCoilData = {
                        layersDescription: response.magnetic?.coil?.layersDescription,
                        turnsDescription: response.magnetic?.coil?.turnsDescription,
                        sectionsDescription: response.magnetic?.coil?.sectionsDescription,
                    };

                    // Always autocomplete the MAS to resolve wire/strand string names to
                    // full objects and populate core processedDescription, bobbin, etc.
                    let autocompletedMas = response;
                    try {
                        autocompletedMas = await this.taskQueueStore.masAutocomplete(response, false, {});
                    } catch (autocompleteError) {
                        console.warn('masAutocomplete failed, using checkAndFixMas result:', autocompleteError);
                    }

                    // Restore coil processed data if masAutocomplete stripped it
                    if (autocompletedMas.magnetic?.coil) {
                        if (!autocompletedMas.magnetic.coil.layersDescription && savedCoilData.layersDescription) {
                            autocompletedMas.magnetic.coil.layersDescription = savedCoilData.layersDescription;
                        }
                        if (!autocompletedMas.magnetic.coil.turnsDescription && savedCoilData.turnsDescription) {
                            autocompletedMas.magnetic.coil.turnsDescription = savedCoilData.turnsDescription;
                        }
                        if (!autocompletedMas.magnetic.coil.sectionsDescription && savedCoilData.sectionsDescription) {
                            autocompletedMas.magnetic.coil.sectionsDescription = savedCoilData.sectionsDescription;
                        }
                    }

                    // Block history BEFORE setting the MAS — all intermediate states
                    // (processCore, bobbin regen, winding) are suppressed.
                    // The wind() completion in BasicCoilSelector will unblock and
                    // addToHistory with the final fully-wound state.
                    this.historyStore.blockAdditions();

                    this.masStore.mas = autocompletedMas;
                    this.masStore.importedMas();
                    this.$stateStore.toolboxStates[this.$stateStore.selectedWorkflow].magneticBuilder.subsection = "magneticBuilder";

                    // Reset coil view to Basic mode when loading a new MAS file
                    if (typeof this.$stateStore.closeCoilAdvancedInfo === 'function') {
                        this.$stateStore.closeCoilAdvancedInfo();
                    }

                    this.$stateStore.operatingPoints.modePerPoint = [];
                    for (let i = 0; i < this.masStore.mas.inputs.operatingPoints.length; i++) {
                        const excitation = this.masStore.mas.inputs.operatingPoints[i].excitationsPerWinding[0];
                        // Determine mode: HarmonicsList if any harmonic content beyond DC, else Manual
                        const hasMultipleHarmonics = excitation?.current?.harmonics?.amplitudes?.length > 1;
                        if (hasMultipleHarmonics) {
                            this.$stateStore.operatingPoints.modePerPoint.push(this.$stateStore.OperatingPointsMode.HarmonicsList);
                        }
                        else {
                            this.$stateStore.operatingPoints.modePerPoint.push(this.$stateStore.OperatingPointsMode.Manual);
                        }
                    }

                    this.$emit('toolSelected', "magneticBuilder");
                }
                catch (error) {
                    console.error(error);
                }
            };
            fr.readAsText(this.$refs['masFileReader'].files.item(0), "ISO-8859-1");
        },
    }
}
</script>

<template>
    <Settings
        :modalName="'MagneticBuilderConfigurationModal'"
        v-model:visible="settingsVisible"
        @onSettingsUpdated="onSettingsUpdated"
    />
    <div class="scp-panel">
        <div class="scp-group scp-group-left">
            <button
                :disabled="!historyStore.isBackPossible()"
                class="scp-btn scp-btn-icon"
                @click="undo"
                aria-label="Undo"
                title="Undo"
            >
                <i class="pi pi-history"></i>
            </button>
            <button
                :disabled="!historyStore.isForwardPossible()"
                class="scp-btn scp-btn-icon"
                @click="redo"
                aria-label="Redo"
                title="Redo"
            >
                <i class="pi pi-refresh"></i>
            </button>
        </div>

        <input data-cy="CoreImport-MAS-file-button" type="file" ref="masFileReader" @change="readMASFile()" hidden />

        <div class="scp-group scp-group-main">
            <button
                class="scp-btn scp-btn-primary"
                @click="load"
            >
                <i class="pi pi-folder-open"></i>
                <span>{{loading ? 'Loading…' : 'Load MAS'}}</span>
            </button>
            <button
                class="scp-btn scp-btn-primary"
                @click="exportMAS"
            >
                <i class="pi pi-file-export"></i>
                <span>Export MAS</span>
            </button>
        </div>

        <div class="scp-group scp-group-right">
            <button
                v-if="showConfigurationButton"
                class="scp-btn scp-btn-icon"
                @click="openSettings"
                aria-label="Settings"
                title="Settings"
                >
                <i class="pi pi-cog"></i>
            </button>
            <button
                v-if="showResetButton"
                class="scp-btn scp-btn-danger"
                @click="reset"
                aria-label="Reset"
                title="Reset"
                >
                <i class="pi pi-power-off"></i>
            </button>
        </div>
    </div>
</template>

<style scoped>
.scp-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    margin: 0.15rem 0 0.5rem 0;
    background: linear-gradient(180deg,
        rgba(var(--p-dark-rgb), 0.75) 0%,
        rgba(var(--p-dark-rgb), 0.55) 100%);
    border: 1px solid rgba(var(--p-white-rgb), 0.08);
    border-top: 3px solid rgba(var(--p-primary-rgb), 0.8);
    border-radius: 14px;
    box-shadow: 0 6px 24px rgba(var(--p-black-rgb), 0.45), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    flex-wrap: wrap;
}

.scp-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
}

.scp-group-main {
    flex: 1;
    justify-content: center;
}

.scp-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.4rem 0.85rem;
    border-radius: 10px;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    border: 1px solid transparent;
    transition: filter 0.15s, box-shadow 0.2s, transform 0.1s, background 0.15s, color 0.15s;
    white-space: nowrap;
    min-height: 2.1rem;
}

.scp-btn:hover:not(:disabled) {
    filter: brightness(1.12);
    transform: translateY(-1px);
}

.scp-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.scp-btn-primary {
    background: linear-gradient(135deg,
        color-mix(in srgb, var(--p-primary) 115%, transparent 0%) 0%,
        var(--p-primary) 55%,
        rgb(var(--p-primary-rgb) / 0.85) 100%);
    color: var(--p-white);
    border: 1px solid color-mix(in srgb, var(--p-primary) 70%, var(--p-white) 30%);
    box-shadow:
        0 0 0 1px rgb(var(--p-primary-rgb) / 0.35),
        0 2px 8px rgb(var(--p-primary-rgb) / 0.4),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
    text-shadow: 0 1px 1px rgba(var(--p-black-rgb), 0.25);
}

.scp-btn-icon {
    background: rgba(var(--p-white-rgb), 0.08);
    border: 1px solid rgba(var(--p-white-rgb), 0.22);
    color: rgba(var(--p-white-rgb), 0.9);
    box-shadow: 0 1px 4px rgba(var(--p-black-rgb), 0.2);
    min-width: 2.1rem;
    padding: 0.4rem 0.55rem;
}

.scp-btn-icon:hover:not(:disabled) {
    background: rgba(var(--p-primary-rgb), 0.2);
    border-color: rgba(var(--p-primary-rgb), 0.55);
    color: var(--p-white);
}

.scp-btn-danger {
    background: rgb(var(--p-danger-rgb) / 0.2);
    border: 1px solid rgb(var(--p-danger-rgb) / 0.55);
    color: var(--p-danger);
    box-shadow: 0 1px 4px rgba(var(--p-black-rgb), 0.25);
    min-width: 2.1rem;
    padding: 0.4rem 0.55rem;
}

.scp-btn-danger:hover:not(:disabled) {
    background: rgb(var(--p-danger-rgb) / 0.3);
    border-color: rgb(var(--p-danger-rgb) / 0.75);
}
</style>
