<script setup>
import { useHistoryStore } from '../stores/history'
import { useTaskQueueStore } from '../stores/taskQueue'
import AdvancedCoreSelector from './MagneticBuilder/Core/AdvancedCoreSelector.vue'
import AdvancedCoilInfo from './MagneticBuilder/Coil/AdvancedCoilInfo.vue'
import { recordDesign } from '/WebSharedComponents/assets/js/telemetry.js'
import { useMagneticBuilderSettingsStore } from '../stores/magneticBuilderSettings'

</script>

<script>
// Imported under a different name than the computed below: a module binding is
// exposed to the template as $setup, and $setup WINS over an Options API member
// of the same name — with both called `layoutComponent`, `:is` received the
// function instead of the component and rendered it as "[object Object]".
import { layoutComponent as resolveLayoutComponent } from './MagneticBuilder/layouts/index.js'

/**
 * taskQueue actions whose failure is already presented where it belongs, so the
 * builder-level "Calculation issue" banner must NOT repeat it. Every graph
 * component (ImpedanceOverFrequency, CoreLossesOverFrequency, ...) catches its
 * own sweep failure and renders it as a label under the chart; the advanced
 * material selector does the same for the complex permeability lookup. Those
 * failures are expected for most of the catalogue — 877 of 1073 core materials
 * carry no complex permeability data, so an impedance sweep on a power ferrite
 * such as TDG TP5 throws MATERIAL_DATA_MISSING by design — and they say nothing
 * about whether the DESIGN built. Left in the banner, the default impedance
 * graph turned every such design into a permanent red "Calculation issue".
 */
const LOCALLY_REPORTED_ACTIONS = new Set([
    'impedanceOverFrequencySwept',
    'qFactorOverFrequencySwept',
    'resistanceOverFrequencySwept',
    'windingResistanceOverFrequencySwept',
    'windingLossesOverFrequencySwept',
    'coreLossesOverFrequencySwept',
    'volumetricLossesSwept',
    'magnetizingInductanceOverFrequencySwept',
    'magnetizingInductanceOverTemperatureSwept',
    'magnetizingInductanceOverDcBiasSwept',
    'complexPermeabilityGotten',
]);

export default {
    emits: ["canContinue"],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        masStore: {
            type: Object,
        },
        isIsolatedApp: {
            type: Boolean,
            default: false,
        },
        useVisualizers: {
            type: Boolean,
            default: true,
        },
        enableCoil: {
            type: Boolean,
            default: true,
        },
        enableSimulation: {
            type: Boolean,
            default: true,
        },
        enableAdvisers: {
            type: Boolean,
            default: true,
        },
        enableCoilOptions: {
            type: Boolean,
            default: true,
        },
        enableInsertIntermediateMas: {
            type: Boolean,
            default: true,
        },
        enableGraphs: {
            type: Boolean,
            default: true,
        },
        readOnly: {
            type: Boolean,
            default: false,
        },
        showInterleavingOrder: {
            type: Boolean,
            default: true,
        },
        operatingPointIndex: {
            type: Number,
            default: 0,
        },
        enableTemperaturePlot: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        const historyStore = useHistoryStore();
        // Settle recorder (ABT #1084): quiet time before a burst of design
        // changes counts as settled.
        const SETTLE_MS = 1500;
        const taskQueueStore = useTaskQueueStore();
        const magneticBuilderSettingsStore = useMagneticBuilderSettingsStore();
        const magneticBuilt = false;
        const subscriptions = [];
        this.$settingsStore.magneticBuilderSettings.autoRedraw = true;

        return {
            SETTLE_MS,
            settleTimer: null,
            burstStartedAt: null,
            stopSettleWatch: null,
            magneticBuilderSettingsStore,
            taskQueueStore,
            magneticBuilt,
            historyStore,
            subscriptions,
            // The last failed calculation reported by the task queue (e.g. a
            // wind()/simulate() call MKF rejected), kept for display only.
            // Deliberately NOT wired into `magneticBuilt`/canContinue: an
            // unusual or failed calculation on an otherwise fully-specified
            // design should not lock the user out of Continue (ABT #1347) —
            // it should just tell them plainly what happened.
            calculationWarning: null,
        }
    },
    computed: {
        /**
         * The layout on screen (ABT #1121): whichever the user picked in
         * Settings. Layouts arrange the same components with the same props —
         * see layouts/layoutProps.js — so switching one never touches the design.
         */
        layoutComponent() {
            return resolveLayoutComponent(this.magneticBuilderSettingsStore.layout);
        },
        /**
         * One binding for the whole layout contract, so a prop added to
         * layoutProps.js reaches every layout without editing five templates.
         */
        layoutBindings() {
            return {
                dataTestLabel: this.dataTestLabel,
                masStore: this.masStore,
                readOnly: this.readOnly,
                isIsolatedApp: this.isIsolatedApp,
                operatingPointIndex: this.operatingPointIndex,
                magneticBuilt: this.magneticBuilt,
                useVisualizers: this.useVisualizers && this.enableVisualizers,
                enableSimulation: this.enableSimulationComputed,
                enableAutoSimulation: this.enableAutoSimulationComputed,
                enableSubmenu: this.enableSubmenu,
                enableCustomize: this.magneticBuilderSettingsStore.enableCustomize,
                enableAdvise: this.enableAdvisers && !this.isIsolatedApp,
                enableCoil: this.enableCoil,
                enableCoilOptions: this.enableCoilOptions,
                enableGraphs: this.enableGraphs && this.magneticBuilderSettingsStore.enableGraphs,
                showInterleavingOrder: this.showInterleavingOrder,
                enableTemperaturePlot: this.enableTemperaturePlot,
            };
        },
        enableVisualizers() {
            if (this.isIsolatedApp) {
                return true;
            }
            else {
                return this.magneticBuilderSettingsStore.enableVisualizers;
            }
        },
        enableSimulationComputed() {
            if (this.isIsolatedApp) {
                return false;
            }
            else {
                return this.enableSimulation && this.magneticBuilderSettingsStore.enableSimulation;
            }
            
        },
        enableAutoSimulationComputed() {
            if (this.isIsolatedApp) {
                return true; // Isolated app always auto-simulates
            }
            else {
                return this.magneticBuilderSettingsStore.enableAutoSimulation;
            }
        },
        enableSubmenu() {
            // if (this.isIsolatedApp) {
            //     return false;
            // }
            // else {
                return this.magneticBuilderSettingsStore.enableSubmenu;
            // }
            
        },
    },
    watch: { 
    },
    mounted () {
        if (this.masStore.mas.magnetic.manufacturerInfo == null) {
            this.masStore.mas.magnetic.manufacturerInfo = {};
            this.masStore.mas.magnetic.manufacturerInfo.name = "OpenMagnetics";
            this.masStore.mas.magnetic.manufacturerInfo.reference = "My custom magnetic";
        }

        this.magneticBuilt = this.isMagneticBuilt();
        // Block history during initial mount — intermediate states (processCore,
        // bobbin regen, winding) won't create entries. The settle recorder below
        // (or the first wind() completion) lifts the block and saves the
        // fully-built state as the first history entry.
        this.historyStore.blockAdditions();
        this.subscriptions.push(this.historyStore.$onAction((action) => {
            if (action.name == "addToHistory") {
                this.magneticBuilt = this.isMagneticBuilt();
                this.$emit("canContinue", this.magneticBuilt, this.magneticBuilt ? [] : this.getIncompleteInputReasons());
            }
        }));

        // Every taskQueue action that reports a result follows the same
        // (success, dataOrMessage) convention (wind, numberTurnsCalculated,
        // coreLossesCalculated, ...). Surface the message from a real failure
        // as a plain, visible warning instead of the console.error-only
        // handling most callers do today — without blocking Continue for it.
        // Actions that already show their own failure (the graph sweeps, see
        // LOCALLY_REPORTED_ACTIONS) stay out of it.
        this.subscriptions.push(this.taskQueueStore.$onAction(({ name, args, after }) => {
            after(() => {
                if (LOCALLY_REPORTED_ACTIONS.has(name)) {
                    return;
                }
                if (args.length >= 2 && args[0] === false && typeof args[1] === 'string' && args[1].length > 0) {
                    this.calculationWarning = { action: name, message: args[1] };
                }
                else if (args.length >= 1 && args[0] === true && this.calculationWarning?.action === name) {
                    this.calculationWarning = null;
                }
            });
        }));

        // ABT #1084 — settle recorder. Edits used to reach the history only
        // through a wind() completion, so a design without a wound coil (core
        // shape / material / gap / stacks edits before a wire exists) was never
        // recorded and Undo stayed dark. Now every burst of changes to the
        // design is recorded once it has been quiet for SETTLE_MS: the entry
        // holds the SETTLED state (after autocomplete, bobbin, wind), and
        // replaces an entry the SAME burst already made (e.g. wind's own add)
        // so one gesture stays one undo step, and never touches an entry from
        // an earlier burst. Timed blocks (after undo/redo) are respected —
        // lifting them would truncate the redo stack.
        this.settleTimer = null;
        this.stopSettleWatch = this.$watch(
            () => this.masStore.mas,
            () => {
                if (this.settleTimer) {
                    clearTimeout(this.settleTimer);
                }
                else {
                    this.burstStartedAt = Date.now();
                }
                this.settleTimer = setTimeout(() => {
                    this.settleTimer = null;
                    if (this.historyStore.isBlockedTimed()) return;
                    if (this.historyStore.isBlockedIndefinitely()) {
                        this.historyStore.unblockAdditions();
                    }
                    this.historyStore.addToHistory(this.masStore.mas, null, { coalesceIfAddedAfter: this.burstStartedAt });
                }, this.SETTLE_MS);
            },
            { deep: true }
        );

        // Notify components that builder is ready with existing design
        // This triggers visualizers and simulations to refresh
        if (this.magneticBuilt) {
            setTimeout(() => {
                this.taskQueueStore.magneticBuilderReady(this.masStore.mas.magnetic);
            }, 100);
        }

    },
    beforeUnmount() {
        if (this.settleTimer) clearTimeout(this.settleTimer);
        if (this.stopSettleWatch) this.stopSettleWatch();
        // Capture the builder state once, as the user leaves the builder, rather
        // than on every edit. Tied to the session_id, this gives one clean
        // "final builder state" row that pairs with the later design_report.
        if (this.magneticBuilt && !this.isIsolatedApp && this.enableInsertIntermediateMas) {
            this.insertIntermediateMas();
        }
        this.subscriptions.forEach((unsubscribe) => unsubscribe());
    },
    methods: {
        insertIntermediateMas() {
            // Intermediate working state — the builder design as the user leaves it.
            recordDesign({ event_type: 'builder_snapshot', source: 'builder', mas: this.masStore.mas });
        },
        // Whether the user has filled in every INPUT the builder needs — not
        // whether the last calculation on those inputs came out clean. A
        // design can be fully specified and still produce an extreme or
        // failed calculation (e.g. a turns count that saturates the core);
        // that is surfaced separately via `calculationWarning`, and does not
        // belong here (ABT #1347 — this used to also gate on
        // coil.turnsDescription, which is a CALCULATION OUTPUT, so a design
        // that was otherwise complete could get silently stuck on the
        // generic "not complete yet" message with nothing to fix).
        isMagneticBuilt() {
            if (this.masStore.mas.magnetic.core.functionalDescription.material == null) {
                return false;
            }
            if (this.masStore.mas.magnetic.core.functionalDescription.shape == null) {
                return false;
            }
            if (this.masStore.mas.magnetic.core.functionalDescription.gapping == null) {
                return false;
            }
            if (this.masStore.mas.magnetic.coil.functionalDescription.length == 0) {
                return false;
            }
            if (this.masStore.mas.magnetic.coil.bobbin == null) {
                return false;
            }
            if (this.masStore.mas.magnetic.coil.bobbin == "") {
                return false;
            }
            if (this.masStore.mas.magnetic.coil.bobbin == "Dummy") {
                return false;
            }
            const hasIncompleteWinding = this.masStore.mas.magnetic.coil.functionalDescription.some((winding) => {
                return winding.wire == null || winding.wire == "" || winding.wire == "Dummy";
            });
            if (hasIncompleteWinding) {
                return false;
            }
            return true;
        },
        // Human-readable reasons isMagneticBuilt() returned false, for
        // StorylineErrors (ABT #1347) — mirrors isMagneticBuilt()'s checks.
        getIncompleteInputReasons() {
            const reasons = [];
            if (this.masStore.mas.magnetic.core.functionalDescription.material == null) {
                reasons.push("Select a core material.");
            }
            if (this.masStore.mas.magnetic.core.functionalDescription.shape == null) {
                reasons.push("Select a core shape.");
            }
            if (this.masStore.mas.magnetic.core.functionalDescription.gapping == null) {
                reasons.push("Select a gapping configuration.");
            }
            if (this.masStore.mas.magnetic.coil.functionalDescription.length == 0) {
                reasons.push("Add at least one winding.");
            }
            if ([null, "", "Dummy"].includes(this.masStore.mas.magnetic.coil.bobbin)) {
                reasons.push("Select a bobbin.");
            }
            this.masStore.mas.magnetic.coil.functionalDescription.forEach((winding, index) => {
                if ([null, "", "Dummy"].includes(winding.wire)) {
                    reasons.push(`Select a wire for winding ${index + 1}${winding.name ? ` (${winding.name})` : ''}.`);
                }
            });
            return reasons;
        },
        customizeCore() {
            this.$stateStore.magneticBuilder.mode.core = this.$stateStore.MagneticBuilderModes.Advanced;
        }
    }
}
</script>

<template>
    <div class="container" :style="$styleStore.magneticBuilder.main">
        <!-- Non-blocking: a real calculation failure (e.g. wind() rejecting the current
             turns/wire/core combination) is shown here so the user knows what happened,
             but it does NOT gate Continue -- the design's inputs are still valid, only
             this specific derived result failed (ABT #1347). -->
        <div v-if="calculationWarning" class="alert alert-danger py-2 px-3 mb-2" :title="calculationWarning.message">
            <i class="pi pi-exclamation-triangle me-2"></i>
            <strong>Calculation issue:</strong> {{calculationWarning.message}}
        </div>
        <div
            class="row"
            v-if="$stateStore.magneticBuilder.mode.core == $stateStore.MagneticBuilderModes.Advanced"
        >
            <AdvancedCoreSelector
                :dataTestLabel="dataTestLabel + '-AdvancedCoreSelector'"
                :masStore="masStore"
                :enableSimulation="true"
            />
        </div>
        <div
            class="row gx-0"
            v-else-if="$stateStore.magneticBuilder.mode.coil == $stateStore.MagneticBuilderModes.Advanced"
        >
            <AdvancedCoilInfo
                :dataTestLabel="dataTestLabel + '-AdvancedCoilInfo'"
                :masStore="masStore"
                :operatingPointIndex="operatingPointIndex"
            />
        </div>
        <component
            v-else
            :is="layoutComponent"
            v-bind="layoutBindings"
            @customizeCore="customizeCore"
        />
    </div>
</template>
