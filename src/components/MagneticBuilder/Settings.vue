<script setup>
import Dialog from 'primevue/dialog'
import { useMagneticBuilderSettingsStore } from '../../stores/magneticBuilderSettings'
import { useModelSettingsStore } from '../../stores/modelSettings'
import { useStateStore } from '../../stores/state'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
</script>

<script>

export default {
    components: { Dialog },
    emits: ["onSettingsUpdated", "update:visible"],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        modalName: {
            type: String,
            default: 'SettingsModal',
        },
        modelValue: {
            type: Object,
            default: null,
        },
        visible: { type: Boolean, default: false },
    },
    data() {
        const magneticBuilderSettingsStore = useMagneticBuilderSettingsStore();
        const modelSettingsStore = useModelSettingsStore();
        const stateStore = useStateStore();
        const localData = {
            enableVisualizers: magneticBuilderSettingsStore.enableVisualizers,
            enableSimulation: magneticBuilderSettingsStore.enableSimulation,
            enableSubmenu: magneticBuilderSettingsStore.enableSubmenu,
            enableGraphs: magneticBuilderSettingsStore.enableGraphs,
        }

        const settingsChanged = false;
        return {
            localData,
            settingsChanged,
            magneticBuilderSettingsStore,
            modelSettingsStore,
            stateStore,
        }
    },
    methods: {
        onSettingChanged(setting) {
            this.localData[setting] = !this.localData[setting];
            this.magneticBuilderSettingsStore[setting] = this.localData[setting];
            this.settingsChanged = true;
        },
        onModelChanged(modelType, value) {
            console.log(`[Settings] onModelChanged called: ${modelType} = ${value}`);
            console.log('[Settings] stateStore:', this.stateStore);
            console.log('[Settings] stateStore.resimulate:', this.stateStore?.resimulate);
            
            // Handle automatic mode for winding losses
            if (value === 'Automatic') {
                console.log('[Settings] Ignoring "Automatic" value for winding losses');
                return;
            }
            // Handle boolean toggle
            if (modelType === 'coilEnableUserWindingLossesModels') {
                console.log('[Settings] Setting boolean toggle:', modelType, '=', value);
                this.modelSettingsStore[modelType] = value;
            } else {
                // All model values are display name strings
                console.log('[Settings] Setting model:', modelType, '=', value);
                this.modelSettingsStore[modelType] = value;
            }
            this.settingsChanged = true;
            
            // Note: Resimulation will be triggered by modelSettings store watcher after WASM sync
            console.log('[Settings] Model changed, waiting for watcher to trigger resimulation...');
        },
        onSettingsUpdated(event) {
            this.$emit('update:visible', false);
            this.$emit('onSettingsUpdated');
        },
        handleModelChange(chosen, name) {
            console.log('[Settings] =========================================');
            console.log('[Settings] handleModelChange CALLED!');
            console.log('[Settings] Arguments:', { chosen, name });
            console.log('[Settings] this:', this);
            console.log(`[Settings] handleModelChange called: ${name} = ${chosen}`);

            // Handle automatic mode for winding losses
            if (chosen === 'Automatic') {
                console.log('[Settings] Ignoring "Automatic" value for winding losses');
                return;
            }

            // Handle boolean toggle
            if (name === 'coilEnableUserWindingLossesModels') {
                console.log('[Settings] Setting boolean toggle:', name, '=', chosen);
                this.modelSettingsStore[name] = chosen;
            } else {
                // All model values are display name strings
                console.log('[Settings] Setting model:', name, '=', chosen);
                this.modelSettingsStore[name] = chosen;
            }
            this.settingsChanged = true;

            // Note: Resimulation will be triggered by modelSettings store watcher after WASM sync
            console.log('[Settings] Model changed, waiting for watcher to trigger resimulation...');
        },
        async resetToDefaults() {
            console.log('[Settings] Resetting all models to MKF defaults...');
            await this.modelSettingsStore.reset();
            this.settingsChanged = true;
            console.log('[Settings] Models reset to defaults, winding losses set to automatic');
        },
        async initializeModels() {
            // Always load from WASM to get fresh defaults and available models
            await this.modelSettingsStore.loadFromWASM();
            
            // Fetch available core losses methods
            if (this.modelValue?.magnetic) {
                await this.modelSettingsStore.fetchAvailableCoreLossesMethods(this.modelValue.magnetic);
            }
        }
    },
    computed: {
        // Helper to add "Automatic" option for winding losses when manual mode is off
        skinEffectOptions() {
            if (!this.modelSettingsStore.coilEnableUserWindingLossesModels) {
                return { 'Automatic': 'Automatic' };
            }
            return this.modelSettingsStore.availableWindingSkinEffectModels;
        },
        proximityEffectOptions() {
            if (!this.modelSettingsStore.coilEnableUserWindingLossesModels) {
                return { 'Automatic': 'Automatic' };
            }
            return this.modelSettingsStore.availableWindingProximityEffectModels;
        },
        // Core losses options with loading/error states
        coreLossesOptions() {
            if (this.modelSettingsStore.availableCoreLossesMethodsLoading) {
                return { 'Loading...': 'Loading...' };
            }
            if (this.modelSettingsStore.availableCoreLossesMethodsError || this.modelSettingsStore.availableCoreLossesMethods.length === 0) {
                return { 'No material selected': 'No material selected' };
            }
            const options = {};
            this.modelSettingsStore.availableCoreLossesMethods.forEach(m => {
                options[m.displayName] = m.displayName;
            });
            return options;
        },
        isCoreLossesDisabled() {
            return this.modelSettingsStore.availableCoreLossesMethodsLoading || 
                   this.modelSettingsStore.availableCoreLossesMethods.length === 0 ||
                   !this.modelValue?.magnetic?.core;
        }
    },
    watch: {
        'modelValue.magnetic.core': {
            immediate: true,
            handler(newCore, oldCore) {
                if (newCore !== oldCore && this.modelSettingsStore.isInitialized) {
                    this.modelSettingsStore.fetchAvailableCoreLossesMethods(this.modelValue?.magnetic);
                }
            }
        }
    },
    mounted() {
        // Initialize models when component mounts
        this.initializeModels();
    }
}
</script>


<template>
    <Dialog
        :visible="visible"
        @update:visible="(v) => $emit('update:visible', v)"
        :modal="true"
        :draggable="false"
        :data-cy="modalName"
        :style="{ width: 'min(90vw, 720px)' }"
        :pt="{ root: { class: 'settings' } }">
        <template #header>
            <div class="d-flex align-items-center">
                <i class="pi pi-cog text-primary mr-2 text-xl"></i>
                <h5 :data-cy="dataTestLabel + '-settingsModal-notification-text'" class="modal-title text-white mb-0">Settings</h5>
            </div>
        </template>
        <div class="px-2 py-2">
                    <!-- Visualization Setting -->
                    <div class="setting-item d-flex justify-content-between align-items-center py-3 border-bottom border-secondary">
                        <div>
                            <h6 class="text-white mb-1">3D Visualization</h6>
                            <small class="text-secondary">Show 3D preview of magnetic components</small>
                        </div>
                        <div class="form-check form-switch">
                            <input 
                                :data-cy="dataTestLabel + '-Settings-Modal-enable-visualization-button'" 
                                class="form-check-input custom-switch" 
                                type="checkbox" 
                                role="switch"
                                :checked="localData.enableVisualizers"
                                @change="onSettingChanged('enableVisualizers')"
                            >
                        </div>
                    </div>

                    <!-- Simulation Setting -->
                    <div class="setting-item d-flex justify-content-between align-items-center py-3 border-bottom border-secondary">
                        <div>
                            <h6 class="text-white mb-1">Auto Simulation</h6>
                            <small class="text-secondary">Automatically run simulations on changes</small>
                        </div>
                        <div class="form-check form-switch">
                            <input 
                                :data-cy="dataTestLabel + '-Settings-Modal-enable-simulation-button'" 
                                class="form-check-input custom-switch" 
                                type="checkbox" 
                                role="switch"
                                :checked="localData.enableSimulation"
                                @change="onSettingChanged('enableSimulation')"
                            >
                        </div>
                    </div>

                    <!-- Submenu Setting -->
                    <div class="setting-item d-flex justify-content-between align-items-center py-3 border-bottom border-secondary">
                        <div>
                            <h6 class="text-white mb-1">Sidebar Menu</h6>
                            <small class="text-secondary">Show navigation submenu in sidebar</small>
                        </div>
                        <div class="form-check form-switch">
                            <input 
                                :data-cy="dataTestLabel + '-Settings-Modal-enable-submenu-button'" 
                                class="form-check-input custom-switch" 
                                type="checkbox" 
                                role="switch"
                                :checked="localData.enableSubmenu"
                                @change="onSettingChanged('enableSubmenu')"
                            >
                        </div>
                    </div>

                    <!-- Graphs Setting -->
                    <div class="setting-item d-flex justify-content-between align-items-center py-3 border-bottom border-secondary">
                        <div>
                            <h6 class="text-white mb-1">Interactive Graphs</h6>
                            <small class="text-secondary">Display interactive charts and graphs</small>
                        </div>
                        <div class="form-check form-switch">
                            <input 
                                :data-cy="dataTestLabel + '-Settings-Modal-enable-graphs-button'" 
                                class="form-check-input custom-switch" 
                                type="checkbox" 
                                role="switch"
                                :checked="localData.enableGraphs"
                                @change="onSettingChanged('enableGraphs')"
                            >
                        </div>
                    </div>

                    <!-- Simulation Models Section -->
                    <div class="mt-4">
                        <h6 class="text-white mb-3 border-bottom border-secondary pb-2">
                            <i class="pi pi-calculator text-primary mr-2"></i>
                            Simulation Models
                        </h6>
                        <small class="text-secondary d-block mb-3">Select the calculation models used in simulations (loaded from MKF)</small>
                        
                        <div v-if="modelSettingsStore.isLoading || !modelSettingsStore.isInitialized" class="text-center py-3">
                            <div class="spinner-border spinner-border-sm text-primary" role="status">
                                <span class="visually-hidden">Loading models...</span>
                            </div>
                            <small class="text-secondary d-block mt-2">Loading model defaults from MKF...</small>
                        </div>

                        <div v-else>
                            <!-- Manual Winding Losses Model Selection Toggle -->
                            <div class="model-setting mb-3 pb-3 border-bottom border-secondary">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <label class="text-white mb-1 d-block">Manual Wire Losses Models</label>
                                        <small class="text-color-secondary">Override automatic model selection for windings</small>
                                    </div>
                                    <div class="form-check form-switch">
                                        <input 
                                            class="form-check-input custom-switch" 
                                            type="checkbox" 
                                            role="switch"
                                            :checked="modelSettingsStore.coilEnableUserWindingLossesModels"
                                            @change="onModelChanged('coilEnableUserWindingLossesModels', $event.target.checked)"
                                        >
                                    </div>
                                </div>
                            </div>

                            <!-- Magnetic Field Strength Model -->
                            <div class="model-setting mb-3">
                                <label class="text-white mb-1 d-block">Magnetic Field Strength Model</label>
                                <ElementFromList
                                    :name="'magneticFieldStrengthModel'"
                                    :replaceTitle="''"
                                    :options="modelSettingsStore.availableMagneticFieldStrengthModels"
                                    :titleSameRow="false"
                                    v-model="modelSettingsStore"
                                    :labelWidthProportionClass="'col-0'"
                                    :valueWidthProportionClass="'col-12'"
                                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                                    :textColor="'var(--p-white)'"
                                     @update="handleModelChange"
                                />
                                <small class="text-color-secondary">Used for magnetic field visualization and calculations</small>
                            </div>

                            <!-- Fringing Effect Model -->
                            <div class="model-setting mb-3">
                                <label class="text-white mb-1 d-block">Fringing Effect Model</label>
                                <ElementFromList
                                    :name="'magneticFieldStrengthFringingEffectModel'"
                                    :replaceTitle="''"
                                    :options="modelSettingsStore.availableFringingEffectModels"
                                    :titleSameRow="false"
                                    v-model="modelSettingsStore"
                                    :labelWidthProportionClass="'col-0'"
                                    :valueWidthProportionClass="'col-12'"
                                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                                    :textColor="'var(--p-white)'"
                                     @update="handleModelChange"
                                />
                                <small class="text-color-secondary">Used for gap fringing field calculations</small>
                            </div>

                            <!-- Reluctance Model -->
                            <div class="model-setting mb-3">
                                <label class="text-white mb-1 d-block">Reluctance Model</label>
                                <ElementFromList
                                    :name="'reluctanceModel'"
                                    :replaceTitle="''"
                                    :options="modelSettingsStore.availableReluctanceModels"
                                    :titleSameRow="false"
                                    v-model="modelSettingsStore"
                                    :labelWidthProportionClass="'col-0'"
                                    :valueWidthProportionClass="'col-12'"
                                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                                    :textColor="'var(--p-white)'"
                                     @update="handleModelChange"
                                />
                                <small class="text-color-secondary">Used for magnetic circuit reluctance calculations</small>
                            </div>

                            <!-- Core Losses Model -->
                            <div class="model-setting mb-3">
                                <label class="text-white mb-1 d-block">Core Losses Model</label>
                                <ElementFromList
                                    :name="'coreLossesModel'"
                                    :replaceTitle="''"
                                    :options="coreLossesOptions"
                                    :titleSameRow="false"
                                    v-model="modelSettingsStore"
                                    :labelWidthProportionClass="'col-0'"
                                    :valueWidthProportionClass="'col-12'"
                                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                                    :textColor="isCoreLossesDisabled ? 'var(--p-secondary)' : 'var(--p-white)'"
                                    :disabled="isCoreLossesDisabled"
                                     @update="handleModelChange"
                                />
                                <small class="text-color-secondary" v-if="modelSettingsStore.availableCoreLossesMethodsError">
                                    {{ modelSettingsStore.availableCoreLossesMethodsError }}
                                </small>
                                <small class="text-color-secondary" v-else>
                                    Used for core loss calculations
                                </small>
                            </div>

                            <!-- Winding Skin Effect Losses Model -->
                            <div class="model-setting mb-3">
                                <label class="text-white mb-1 d-block">Skin Effect Losses Model</label>
                                <ElementFromList
                                    :name="'windingSkinEffectLossesModel'"
                                    :replaceTitle="''"
                                    :options="skinEffectOptions"
                                    :titleSameRow="false"
                                    v-model="modelSettingsStore"
                                    :labelWidthProportionClass="'col-0'"
                                    :valueWidthProportionClass="'col-12'"
                                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                                    :textColor="modelSettingsStore.coilEnableUserWindingLossesModels ? 'var(--p-white)' : 'var(--p-secondary)'"
                                    :disabled="!modelSettingsStore.coilEnableUserWindingLossesModels"
                                     @update="handleModelChange"
                                />
                                <small class="text-color-secondary">Used for skin effect loss calculations</small>
                            </div>

                            <!-- Winding Proximity Effect Losses Model -->
                            <div class="model-setting mb-3">
                                <label class="text-white mb-1 d-block">Proximity Effect Losses Model</label>
                                <ElementFromList
                                    :name="'windingProximityEffectLossesModel'"
                                    :replaceTitle="''"
                                    :options="proximityEffectOptions"
                                    :titleSameRow="false"
                                    v-model="modelSettingsStore"
                                    :labelWidthProportionClass="'col-0'"
                                    :valueWidthProportionClass="'col-12'"
                                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                                    :textColor="modelSettingsStore.coilEnableUserWindingLossesModels ? 'var(--p-white)' : 'var(--p-secondary)'"
                                    :disabled="!modelSettingsStore.coilEnableUserWindingLossesModels"
                                     @update="handleModelChange"
                                />
                                <small class="text-color-secondary">Used for proximity effect loss calculations</small>
                            </div>

                            <!-- Stray Capacitance Model -->
                            <div class="model-setting mb-3">
                                <label class="text-white mb-1 d-block">Stray Capacitance Model</label>
                                <ElementFromList
                                    :name="'strayCapacitanceModel'"
                                    :replaceTitle="''"
                                    :options="modelSettingsStore.availableStrayCapacitanceModels"
                                    :titleSameRow="false"
                                    v-model="modelSettingsStore"
                                    :labelWidthProportionClass="'col-0'"
                                    :valueWidthProportionClass="'col-12'"
                                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                                    :textColor="'var(--p-white)'"
                                     @update="handleModelChange"
                                />
                                <small class="text-color-secondary">Used for stray capacitance calculations</small>
                            </div>
                        </div><!-- End v-else -->
                    </div>

                    <!-- Field Plot Resolution Section -->
                    <div class="mt-4">
                        <h6 class="text-white mb-3 border-bottom border-secondary pb-2">
                            <i class="pi pi-chart-line text-primary mr-2"></i>
                            Field Plot Resolution
                        </h6>
                        <small class="text-secondary d-block mb-3">Control the grid resolution for magnetic and electric field visualizations</small>

                        <div v-if="modelSettingsStore.isLoading || !modelSettingsStore.isInitialized" class="text-center py-3">
                            <div class="spinner-border spinner-border-sm text-primary" role="status">
                                <span class="visually-hidden">Loading settings...</span>
                            </div>
                            <small class="text-secondary d-block mt-2">Loading settings from MKF...</small>
                        </div>

                        <div v-else>
                            <!-- Number of Points X -->
                            <div class="model-setting mb-3">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <label class="text-white mb-0">Horizontal Resolution (X)</label>
                                    <span class="text-primary font-bold">{{ modelSettingsStore.painterNumberPointsX }}</span>
                                </div>
                                <input
                                    type="range"
                                    class="form-range"
                                    min="10"
                                    max="200"
                                    step="5"
                                    v-model.number="modelSettingsStore.painterNumberPointsX"
                                >
                                <small class="text-color-secondary">Number of grid points in the horizontal direction (10-200)</small>
                            </div>

                            <!-- Number of Points Y -->
                            <div class="model-setting mb-3">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <label class="text-white mb-0">Vertical Resolution (Y)</label>
                                    <span class="text-primary font-bold">{{ modelSettingsStore.painterNumberPointsY }}</span>
                                </div>
                                <input
                                    type="range"
                                    class="form-range"
                                    min="10"
                                    max="200"
                                    step="5"
                                    v-model.number="modelSettingsStore.painterNumberPointsY"
                                >
                                <small class="text-color-secondary">Number of grid points in the vertical direction (10-200)</small>
                            </div>

                            <div class="alert alert-dark border-secondary mt-3" role="alert">
                                <small class="text-color-secondary">
                                    <i class="pi pi-info-circle mr-1"></i>
                                    Higher values produce finer visualizations but may slow down rendering. Default: 25×50
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
        <template #footer>
            <button
                :data-cy="dataTestLabel + '-Settings-Modal-reset-defaults-button'"
                class="p-button p-button-outlined p-button-secondary px-4 mr-2"
                @click="resetToDefaults">
                Reset to Defaults
            </button>
            <button
                :data-cy="dataTestLabel + '-Settings-Modal-update-settings-button'"
                class="p-button p-button-primary px-4"
                @click="onSettingsUpdated">
                Done
            </button>
        </template>
    </Dialog>
</template>


<style scoped>
.settings {
    z-index: 9999;
}

.custom-switch {
    width: 3em;
    height: 1.5em;
    cursor: pointer;
}

.custom-switch:checked {
    background-color: var(--p-primary);
    border-color: var(--p-primary);
}

.custom-switch:focus {
    box-shadow: 0 0 0 0.25rem rgba(var(--p-primary-rgb), 0.25);
}

.setting-item:hover {
    background-color: rgba(var(--p-white-rgb), 0.03);
    margin-left: -1rem;
    margin-right: -1rem;
    padding-left: 1rem;
    padding-right: 1rem;
    border-radius: 0.5rem;
}

.model-setting:hover {
    background-color: rgba(var(--p-white-rgb), 0.03);
    margin-left: -0.5rem;
    margin-right: -0.5rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    border-radius: 0.25rem;
}
</style>