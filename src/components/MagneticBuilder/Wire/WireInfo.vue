<script setup>
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import { wireMaterialDefault } from '/WebSharedComponents/assets/js/defaults.js'
import { tooltipsMagneticBuilder } from '/WebSharedComponents/assets/js/texts.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'
</script>

<script>

export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        windingIndex: {
            type: Number,
            default: 0,
        },
        masStore: {
            type: Object,
            required: true,
        },
        operatingPointIndex: {
            type: Number,
            default: 0,
        },
        advancedMode: {
            type: Boolean,
            default: true,
        },
        enableAutoSimulation: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const dcResistancePerMeter = 0;
        const skinAcResistancePerMeter = 0;
        const skinAcFactor = 0;
        const dcLossesPerMeter = 0;
        const skinAcLossesPerMeter = 0;
        const outerDimensions = 0;
        const effectiveCurrentDensity = 0;
        const effectiveSkinDepth = 0;
        const turnsRatio = 1;
        const compliesWithTurnsRatio = true;
        const recentChange = false;
        const tryingToSend = false;
        const dataUptoDate = false;
        const subscriptions = [];

        return {
            taskQueueStore,
            dcResistancePerMeter,
            skinAcResistancePerMeter,
            skinAcFactor,
            dcLossesPerMeter,
            skinAcLossesPerMeter,
            outerDimensions,
            effectiveCurrentDensity,
            effectiveSkinDepth,
            turnsRatio,
            compliesWithTurnsRatio,
            recentChange,
            tryingToSend,
            dataUptoDate,
            subscriptions,
            _simTimer: null,
        }
    },
    computed: {
        tooMuchCurrentDensity() {
            return this.effectiveCurrentDensity > 12;
        },
        tooMuchSkinAcFactor() {
            return this.skinAcFactor > 2;
        },
        fitsOuterDimensionsWidth() {
            if (this.masStore.mas.magnetic.coil.bobbin != "Dummy") {
                if (this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].width != null) {
                    if (this.outerDimensions[0] < this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].width) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }
                if (this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].radialHeight != null) {
                    if (this.outerDimensions[0] < this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].radialHeight / 2) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }
            }
            return true;
        },
        fitsOuterDimensionsHeight() {
            if (this.masStore.mas.magnetic.coil.bobbin != "Dummy") {
                if (this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].height != null) {
                    if (this.outerDimensions[1] < this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].height) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }
                if (this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].radialHeight != null) {
                    if (this.outerDimensions[0] < this.masStore.mas.magnetic.coil.bobbin.processedDescription.windingWindows[0].radialHeight / 2) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }
            }
            return true;
        },
        hasCalculableData() {
            const wire = this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex]?.wire;
            return wire != null && wire !== 'Dummy' && wire !== '' && wire.type != null;
        },
    },
    watch: {
        'operatingPointIndex': {
            handler(newValue, oldValue) {
                this.calculateWireData();
            },
          deep: true
        },
        'enableAutoSimulation': {
            handler(newValue, oldValue) {
                // When auto-simulation is turned off, mark data as outdated
                // so the user knows they need to manually resimulate
                if (!newValue) {
                    this.dataUptoDate = false;
                }
            },
        },
    },
    mounted () {
        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "masCheckedAndFixed") {
                    if (args[0]) {
                        this.masStore.mas = args[1];
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "windingIndexChanged") {
                    if (args[0]) {
                        this.computeIfCompliesWithTurnsRatio();
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "wireDataCalculated") {
                    if (args[0]) {
                        const data = args[1];

                        this.turnsRatio = data.turnsRatio;
                        this.dcResistancePerMeter = data.dcResistancePerMeter;
                        this.skinAcResistancePerMeter = data.skinAcResistancePerMeter;
                        this.skinAcFactor = data.skinAcFactor;
                        this.dcLossesPerMeter = data.dcLossesPerMeter;
                        this.skinAcLossesPerMeter = data.skinAcLossesPerMeter;
                        this.outerDimensions = data.outerDimensions;
                        this.effectiveCurrentDensity = data.effectiveCurrentDensity;
                        this.effectiveSkinDepth = data.effectiveSkinDepth;

                        this.computeIfCompliesWithTurnsRatio();
                        this.dataUptoDate = true;
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "newWireCreated") {
                    if (args[0]) {
                        this.dataUptoDate = false;
                        if (this.enableAutoSimulation) {
                            this.calculateWireData();
                        }
                    }
                    else {
                        console.error(args[1])
                    }
                }
                // Recalculate wire data when number of parallels changes
                if (name == "numberTurnsUpdated") {
                    if (args[0]) {
                        this.dataUptoDate = false;
                        if (this.enableAutoSimulation) {
                            this.calculateWireData();
                        }
                    }
                }
            });
        }))

        // Listen for global resimulate action from stateStore
        this.subscriptions.push(this.$stateStore.$onAction(({name, after}) => {
            after(() => {
                if (name == "resimulate") {
                    this.calculateWireData();
                }
            });
        }))

        if (this.enableAutoSimulation) {
            this.calculateWireData();
        }
        this.taskQueueStore.checkAndFixMas(this.masStore.mas);
    },
    beforeUnmount () {
        if (this._simTimer) clearTimeout(this._simTimer);
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        tryToSimulate() {
            if (!this.tryingToSend) {
                this.recentChange = false;
                this.dataUptoDate = false;
                this.tryingToSend = true;
                if (this._simTimer) clearTimeout(this._simTimer);
                this._simTimer = setTimeout(() => {
                    this._simTimer = null;
                    if (this.recentChange) {
                        this.tryingToSend = false;
                        this.tryToSimulate();
                    }
                    else {
                        this.calculateWireData();
                        this.tryingToSend = false;
                    }
                    this.dataUptoDate = true;
                }
                , this.$settingsStore.waitingTimeAfterChange);
            }
        },
        computeIfCompliesWithTurnsRatio() {
            if (this.windingIndex > 0) {
                this.taskQueueStore.checkRequirement(this.masStore.mas.inputs.designRequirements.turnsRatios[this.windingIndex - 1], this.turnsRatio).then((check) => {
                    this.compliesWithTurnsRatio = check;
                })
            }
            else {
                this.compliesWithTurnsRatio = true;
            }
        },
        calculateWireData() {
            if (this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != "" &&
                this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != "Dummy" &&
                this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex].wire != null) {

                this.taskQueueStore.calculateWireData(this.masStore.mas.magnetic.coil, this.masStore.mas.inputs.operatingPoints[this.operatingPointIndex], this.windingIndex)
            }
        },
    }
}
</script>

<template>
    <div class="wireinfo-panel">
        <div class="wireinfo-header">
            <div class="wireinfo-header-left">
                <i class="pi pi-bolt"></i>
                <span>Wire Info</span>
            </div>
            <div v-if="!dataUptoDate && hasCalculableData" class="wireinfo-outdated-badge">Outdated</div>
        </div>
        <div class="wireinfo-body">
            <template v-if="advancedMode">
                <div class="wireinfo-grid" :class="{ 'wireinfo-dimmed': !dataUptoDate }">
                    <div class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.dcResistancePerMeter"
                            class="text-left"
                            :name="'R'"
                            :subscriptName="'DC'"
                            :unit="'Ω/m'"
                            :dataTestLabel="dataTestLabel + '-Rdc'"
                            :numberDecimals="2"
                            :value="dcResistancePerMeter"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.skinResistancePerMeter"
                            class="text-left"
                            :name="'R'"
                            :subscriptName="'sk.AC'"
                            :unit="'Ω/m'"
                            :dataTestLabel="dataTestLabel + '-Rac'"
                            :numberDecimals="2"
                            :value="skinAcResistancePerMeter"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.ohmicLossesPerMeter"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'DC'"
                            :unit="'W/m'"
                            :dataTestLabel="dataTestLabel + '-Pdc'"
                            :numberDecimals="2"
                            :value="dcLossesPerMeter"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.skinLossesPermeter"
                            class="text-left"
                            :name="'P'"
                            :subscriptName="'sk.AC'"
                            :unit="'W/m'"
                            :dataTestLabel="dataTestLabel + '-Pac'"
                            :numberDecimals="2"
                            :value="skinAcLossesPerMeter"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.effectiveCurrentDensity"
                            class="text-left"
                            :name="'J'"
                            :subscriptName="'eff'"
                            :unit="'A/mm²'"
                            :dataTestLabel="dataTestLabel + '-Jeff'"
                            :numberDecimals="2"
                            :value="effectiveCurrentDensity"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="tooMuchCurrentDensity? $styleStore.magneticBuilder.inputLabelDangerBgColor : $styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.effectiveSkinDepth"
                            class="text-left"
                            :name="'δ'"
                            :subscriptName="'eff'"
                            :unit="'m'"
                            :dataTestLabel="dataTestLabel + '-EffectiveSkinDepth'"
                            :numberDecimals="2"
                            :value="effectiveSkinDepth"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.wireWidth"
                            class="text-left"
                            :name="'Width'"
                            :unit="'m'"
                            :dataTestLabel="dataTestLabel + '-OuterWidth'"
                            :numberDecimals="2"
                            :value="outerDimensions[0]"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="fitsOuterDimensionsWidth? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                        />
                    </div>
                    <div class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.skinFactor"
                            class="text-left"
                            :name="'F'"
                            :subscriptName="'skin'"
                            :unit="null"
                            :dataTestLabel="dataTestLabel + '-EffectiveSkinAcFactor'"
                            :numberDecimals="2"
                            :value="skinAcFactor"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="tooMuchSkinAcFactor? $styleStore.magneticBuilder.inputLabelDangerBgColor : $styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                    <div class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.wireHeight"
                            class="text-left"
                            :name="'Height'"
                            :unit="'m'"
                            :dataTestLabel="dataTestLabel + '-OuterHeight'"
                            :numberDecimals="2"
                            :value="outerDimensions[1]"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="fitsOuterDimensionsHeight? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                        />
                    </div>
                    <div v-if="windingIndex > 0" class="wireinfo-cell">
                        <DimensionReadOnly
                            v-tooltip="tooltipsMagneticBuilder.turnsRatio"
                            class="text-left"
                            :name="'T'"
                            :subscriptName="'ratio'"
                            :unit="null"
                            :dataTestLabel="dataTestLabel + '-TurnsRatio'"
                            :numberDecimals="2"
                            :value="turnsRatio"
                            :useTitleCase="false"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.infoValueFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="compliesWithTurnsRatio? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                        />
                    </div>
                </div>
            </template>
            <template v-else>
                <div class="wireinfo-simple" :class="{ 'wireinfo-dimmed': !dataUptoDate }">
                    <DimensionReadOnly
                        v-tooltip="tooltipsMagneticBuilder.effectiveCurrentDensity"
                        class="text-left pl-4 pr-4"
                        :name="'Eff. Current Density'"
                        :unit="'A/mm²'"
                        :dataTestLabel="dataTestLabel + '-Jeff'"
                        :numberDecimals="2"
                        :value="effectiveCurrentDensity"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="tooMuchCurrentDensity? $styleStore.magneticBuilder.inputLabelDangerBgColor : $styleStore.magneticBuilder.inputTextColor"
                    />
                    <DimensionReadOnly
                        v-tooltip="tooltipsMagneticBuilder.effectiveSkinDepth"
                        class="text-left pl-4 pr-4"
                        :name="'Eff. Skin Depth'"
                        :unit="'m'"
                        :dataTestLabel="dataTestLabel + '-EffectiveSkinDepth'"
                        :numberDecimals="2"
                        :value="effectiveSkinDepth"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                    />
                    <DimensionReadOnly
                        v-tooltip="tooltipsMagneticBuilder.wireWidth"
                        class="text-left pl-4 pr-4"
                        :name="'Outer Width'"
                        :unit="'m'"
                        :dataTestLabel="dataTestLabel + '-OuterWidth'"
                        :numberDecimals="2"
                        :value="outerDimensions[0]"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="fitsOuterDimensionsWidth? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                    />
                    <DimensionReadOnly
                        v-tooltip="tooltipsMagneticBuilder.wireHeight"
                        class="text-left pl-4 pr-4"
                        :name="'Outer Height'"
                        :unit="'m'"
                        :dataTestLabel="dataTestLabel + '-OuterHeight'"
                        :numberDecimals="2"
                        :value="outerDimensions[1]"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="fitsOuterDimensionsHeight? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                    />
                    <DimensionReadOnly
                        v-tooltip="tooltipsMagneticBuilder.turnsRatio"
                        class="text-left pl-4 pr-4"
                        v-if="windingIndex > 0"
                        :name="'Turns Ratio'"
                        :unit="null"
                        :dataTestLabel="dataTestLabel + '-TurnsRatio'"
                        :numberDecimals="2"
                        :value="turnsRatio"
                        :useTitleCase="false"
                        :disableShortenLabels="true"
                        :labelWidthProportionClass="'col-7'"
                        :valueWidthProportionClass="'col-5'"
                        :valueFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.infoLabelFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="compliesWithTurnsRatio? $styleStore.magneticBuilder.inputTextColor : $styleStore.magneticBuilder.inputLabelDangerBgColor"
                    />
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.wireinfo-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.06) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 14px;
    padding: 0;
    margin: 0.05rem 0 0.5rem 0;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.12), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
    overflow: hidden;
}

.wireinfo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.9rem;
    background: rgba(120, 120, 120, 0.1);
    border-bottom: 1px solid rgba(120, 120, 120, 0.15);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.wireinfo-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.wireinfo-header-left i {
    font-size: 0.95rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.wireinfo-outdated-badge {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: rgba(var(--p-warning-rgb), 0.2);
    color: var(--p-warning);
    border: 1px solid rgba(var(--p-warning-rgb), 0.35);
}

.wireinfo-body {
    padding: 0.2rem 0.4rem;
}

.wireinfo-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 0.5rem;
}

@media (max-width: 576px) {
    .wireinfo-grid {
        grid-template-columns: 1fr;
    }
}

.wireinfo-cell {
    background: transparent;
    border: 0;
    border-radius: 10px;
    padding: 0.05rem 0.4rem;
    margin: 0;
    transition: opacity 0.3s ease;
    line-height: 1.25;
    font-size: 0.9rem;
}

.wireinfo-cell :deep(.row),
.wireinfo-cell :deep(.grid),
.wireinfo-cell :deep(.dim-ro-row),
.wireinfo-cell :deep(.dim-ro-value-row),
.wireinfo-cell :deep(.dim-ro-container) {
    margin: 0 !important;
    padding: 0 !important;
    --p-gutter-x: 0;
    --p-gutter-y: 0;
    min-height: 0 !important;
    line-height: 1.25 !important;
}
.wireinfo-cell :deep(.row > *),
.wireinfo-cell :deep(.grid > *),
.wireinfo-cell :deep(.dim-ro-row > *) {
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    line-height: 1.25 !important;
}
.wireinfo-cell :deep(.form-label),
.wireinfo-cell :deep(label),
.wireinfo-cell :deep(.dim-ro-label) {
    padding: 0 0 0 0.35rem !important;
    margin: 0 !important;
    line-height: 1.25 !important;
    text-align: start !important;
}
.wireinfo-cell :deep(.p-inputnumber),
.wireinfo-cell :deep(.p-inputnumber > input),
.wireinfo-cell :deep(.p-select),
.wireinfo-cell :deep(.p-inputtext),
.wireinfo-cell :deep(.dim-ro-input),
.wireinfo-cell :deep(.dim-ro-value),
.wireinfo-cell :deep(.dim-ro-unit) {
    padding: 0 !important;
    margin: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    line-height: 1.25 !important;
}

.wireinfo-simple {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

.wireinfo-dimmed {
    opacity: 0.35;
    transition: opacity 0.3s ease;
}
</style>