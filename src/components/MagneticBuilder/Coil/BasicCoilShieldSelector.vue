<script setup>
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import { ConnectionType } from '/WebSharedComponents/assets/ts/MAS.ts'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
</script>

<script>

export default {
    emits: ['marginUpdated', 'closeShields'],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        showShieldOptions: {
            type: Boolean,
            default: false,
        },
        masStore: {
            type: Object,
            required: true,
        },
        readOnly: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        const forceUpdate = 0;
        const blockingRebounds = false;
        // Same display names the winding pin editor uses; the stored value stays the
        // verbatim lowercase enum value so it round-trips to MAS unchanged
        const connectionTypeLabels = {
            blind: 'Blind', chassis: 'Chassis', flyingLead: 'Flying Lead', pcbPad: 'PCB Pad',
            pin: 'Pin', smt: 'SMT', screw: 'Screw', tht: 'THT',
        };
        const connectionTypeOptions = Object.values(ConnectionType).map((value) => ({
            value,
            label: connectionTypeLabels[value] || value,
        }));
        const shieldingTypeOptions = [
            { value: 'foil', label: 'Copper foil' },
            { value: 'wound', label: 'Wound screen' },
        ];

        return {
            forceUpdate,
            blockingRebounds,
            connectionTypeOptions,
            shieldingTypeOptions,
        }
    },
    computed: {
        // One entry per insulation section of the wound coil, in winding order — this mirrors
        // exactly how the engine numbers shield interfaces (wrap-around interface last).
        // Sides are labelled positionally ("Winding 1"), matching the winding pills, with a
        // pass number appended only when interleaving splits a winding into several sections
        sectionInterfaces() {
            const sections = this.masStore.mas.magnetic.coil.sectionsDescription || [];
            const functionalDescription = this.masStore.mas.magnetic.coil.functionalDescription || [];

            const conductionCountPerWinding = {};
            const passPerSectionName = {};
            sections.forEach((section) => {
                if (section.type != 'conduction') {
                    return;
                }
                const windingName = section.partialWindings[0].winding;
                conductionCountPerWinding[windingName] = (conductionCountPerWinding[windingName] || 0) + 1;
                passPerSectionName[section.name] = conductionCountPerWinding[windingName];
            });

            const sideLabel = (section) => {
                const windingName = section.partialWindings[0].winding;
                const windingIndex = functionalDescription.findIndex((winding) => winding.name == windingName);
                let label = windingIndex >= 0 ? 'Winding ' + (windingIndex + 1) : windingName;
                if (conductionCountPerWinding[windingName] > 1) {
                    label += ' (' + passPerSectionName[section.name] + ')';
                }
                return label;
            };

            const windingIndexOf = (section) =>
                functionalDescription.findIndex((winding) => winding.name == section.partialWindings[0].winding);

            const interfaces = [];
            for (let i = 0; i < sections.length; i++) {
                if (sections[i].type == 'conduction') {
                    continue;
                }
                const previousSection = sections[i - 1];
                const nextSection = i + 1 < sections.length ? sections[i + 1] : sections[0];
                if (!previousSection || previousSection.type != 'conduction' || nextSection.type != 'conduction') {
                    continue;
                }
                interfaces.push({
                    index: interfaces.length,
                    // winding indexes (0-based, functionalDescription order) so renames cannot break shields
                    left: windingIndexOf(previousSection),
                    right: windingIndexOf(nextSection),
                    label: sideLabel(previousSection) + ' ↔ ' + sideLabel(nextSection)
                           + (i == sections.length - 1 ? ' (outer wrap)' : ''),
                });
            }
            return interfaces;
        },
        shieldRequirements() {
            return this.masStore.mas.inputs?.designRequirements?.shielding || [];
        },
    },
    methods: {
        // The interface a shield tile points at: its first listed ordinal, or the first
        // interface matching its winding pair when no interfaces restriction is set
        shieldInterfaceIndex(requirement) {
            if (requirement.interfaces != null && requirement.interfaces.length > 0) {
                return requirement.interfaces[0];
            }
            const match = this.sectionInterfaces.find((sectionInterface) =>
                requirement.betweenWindings.length == 2 &&
                ((requirement.betweenWindings[0] == sectionInterface.left && requirement.betweenWindings[1] == sectionInterface.right) ||
                 (requirement.betweenWindings[0] == sectionInterface.right && requirement.betweenWindings[1] == sectionInterface.left)));
            return match ? match.index : 0;
        },
        addShield() {
            const designRequirements = this.masStore.mas.inputs.designRequirements;
            if (designRequirements.shielding == null) {
                designRequirements.shielding = [];
            }
            const usedIndexes = designRequirements.shielding.map((requirement) => this.shieldInterfaceIndex(requirement));
            const firstFree = this.sectionInterfaces.find((sectionInterface) => !usedIndexes.includes(sectionInterface.index)) || this.sectionInterfaces[0];
            if (firstFree == null) {
                return;
            }
            designRequirements.shielding.push({
                name: 'Shield ' + (designRequirements.shielding.length + 1),
                betweenWindings: [firstFree.left, firstFree.right],
                thickness: 0.0001,
                interfaces: [firstFree.index],
            });
            this.$emit('marginUpdated');
        },
        removeShield(requirement) {
            const designRequirements = this.masStore.mas.inputs.designRequirements;
            designRequirements.shielding = (designRequirements.shielding || []).filter((existing) => existing !== requirement);
            this.$emit('marginUpdated');
        },
        shieldNameChanged(requirement, value) {
            if (value != '') {
                requirement.name = value;
            }
        },
        shieldInterfaceChanged(requirement, index) {
            const sectionInterface = this.sectionInterfaces.find((candidate) => candidate.index == index);
            if (sectionInterface == null) {
                return;
            }
            requirement.betweenWindings = [sectionInterface.left, sectionInterface.right];
            requirement.interfaces = [index];
            this.$emit('marginUpdated');
        },
        shieldConnectionTypeChanged(requirement, type) {
            // A shield terminates at one point only (the other end is buried to avoid a
            // shorted turn), so it carries a single connection instead of a start-finish pair
            if (type == null) {
                delete requirement.connection;
            }
            else {
                requirement.connection = { ...(requirement.connection || {}), type };
            }
        },
        shieldConnectionNameChanged(requirement, value) {
            const connection = { ...(requirement.connection || {}) };
            if (value == '') {
                delete connection.pinName;
            }
            else {
                connection.pinName = value;
            }
            requirement.connection = connection;
        },
        shieldTypeChanged(requirement, type) {
            requirement.type = type;
            if (type != 'wound') {
                delete requirement.wire;
            }
            this.$emit('marginUpdated');
        },
        shieldWireChanged(requirement, value) {
            if (value == '') {
                delete requirement.wire;
            }
            else {
                requirement.wire = value;
            }
            this.$emit('marginUpdated');
        },
        shieldThicknessUpdated(value) {
            if (!this.blockingRebounds) {
                this.$emit('marginUpdated');
            }
        },
    }
}
</script>

<template>
    <div v-show="showShieldOptions && masStore.mas.magnetic.coil.sectionsDescription != null" class="shield-panel">
        <div class="shield-panel-header">
            <div class="shield-panel-header-left">
                <i class="pi pi-shield"></i>
                <span>Shields</span>
            </div>
            <button
                type="button"
                class="shield-panel-close-btn"
                aria-label="Close shields"
                @click="$emit('closeShields')"
            >
                <i class="pi pi-times"></i>
            </button>
        </div>

        <div class="shield-panel-body">
            <div class="shield-add-row">
                <Button
                    class="shield-add-btn"
                    severity="secondary"
                    outlined
                    :data-cy="dataTestLabel + '-AddShield'"
                    :disabled="readOnly || sectionInterfaces.length == 0"
                    @click="addShield"
                >
                    <i class="pi pi-plus"></i>
                    <span>Add shield</span>
                </Button>
            </div>
            <label v-if="shieldRequirements.length == 0" class="shield-empty-hint">
                No shields. Add one to place a conductive screen between two windings.
            </label>
            <div v-for="(requirement, requirementIndex) in shieldRequirements" :key="requirementIndex" class="shield-tile">
                <div class="shield-tile-row">
                    <InputText
                        class="shield-name-input"
                        :data-cy="dataTestLabel + '-ShieldName-' + requirementIndex"
                        :disabled="readOnly"
                        :model-value="requirement.name || 'Shield ' + (requirementIndex + 1)"
                        @change="shieldNameChanged(requirement, $event.target.value)"
                    />
                    <Button
                        class="shield-remove-btn"
                        severity="secondary"
                        text
                        rounded
                        :data-cy="dataTestLabel + '-RemoveShield-' + requirementIndex"
                        :disabled="readOnly"
                        aria-label="Remove shield"
                        @click="removeShield(requirement)"
                    >
                        <i class="pi pi-times"></i>
                    </Button>
                </div>
                <Select
                    class="shield-interface-select"
                    :data-cy="dataTestLabel + '-ShieldInterface-' + requirementIndex"
                    :disabled="readOnly"
                    :options="sectionInterfaces"
                    optionLabel="label"
                    optionValue="index"
                    :model-value="shieldInterfaceIndex(requirement)"
                    @update:model-value="shieldInterfaceChanged(requirement, $event)"
                />
                <div class="shield-connection-row">
                    <label class="shield-connection-label">Construction</label>
                    <Select
                        class="shield-connection-select"
                        :data-cy="dataTestLabel + '-ShieldType-' + requirementIndex"
                        :disabled="readOnly"
                        :options="shieldingTypeOptions"
                        optionLabel="label"
                        optionValue="value"
                        :model-value="requirement.type ?? 'foil'"
                        @update:model-value="shieldTypeChanged(requirement, $event)"
                    />
                </div>
                <div v-if="requirement.type == 'wound'" class="shield-connection-row">
                    <label class="shield-connection-label">Screen wire</label>
                    <InputText
                        class="shield-wire-input"
                        :data-cy="dataTestLabel + '-ShieldWire-' + requirementIndex"
                        :disabled="readOnly"
                        placeholder="e.g. Round 32.0 - Heavy Build"
                        :model-value="requirement.wire ?? ''"
                        @change="shieldWireChanged(requirement, $event.target.value)"
                    />
                </div>
                <div class="shield-connection-row">
                    <label class="shield-connection-label">Termination</label>
                    <InputText
                        class="shield-connection-name"
                        :data-cy="dataTestLabel + '-ShieldConnectionName-' + requirementIndex"
                        :disabled="readOnly"
                        placeholder="Name"
                        :model-value="requirement.connection?.pinName ?? ''"
                        @change="shieldConnectionNameChanged(requirement, $event.target.value)"
                    />
                    <Select
                        class="shield-connection-select"
                        :data-cy="dataTestLabel + '-ShieldConnection-' + requirementIndex"
                        :disabled="readOnly"
                        :options="connectionTypeOptions"
                        optionLabel="label"
                        optionValue="value"
                        placeholder="Type"
                        showClear
                        :model-value="requirement.connection?.type ?? null"
                        @update:model-value="shieldConnectionTypeChanged(requirement, $event)"
                    />
                </div>
                <Dimension
                    v-if="requirement.type != 'wound' || !requirement.wire"
                    :disabled="readOnly"
                    class="col-12 text-left"
                    :name="'thickness'"
                    :replaceTitle="'Thickness'"
                    :unit="'m'"
                    :defaultZeroUnit="0.001"
                    :dataTestLabel="dataTestLabel + '-ShieldThickness-' + requirementIndex"
                    :numberDecimals="6"
                    :min="1e-6"
                    :max="1"
                    :allowNegative="false"
                    :allowZero="false"
                    :modelValue="requirement"
                    :forceUpdate="forceUpdate"
                    :labelWidthProportionClass="'col-12 md:col-7'"
                    :valueWidthProportionClass="'col-12 md:col-5'"
                    :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                    :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                    :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                    :textColor="$styleStore.magneticBuilder.inputTextColor"
                    @update="shieldThicknessUpdated"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.shield-panel {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.08) 0%, rgba(120, 120, 120, 0.02) 100%);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 14px;
    padding: 0;
    margin: 0.15rem 0 0.5rem 0;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.15), inset 0 1px 0 rgba(var(--p-white-rgb), 0.05);
    overflow: hidden;
    animation: slideDown 0.25s ease-out;
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.shield-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(120, 120, 120, 0.12);
    border-bottom: 1px solid rgba(120, 120, 120, 0.15);
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.shield-panel-header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}

.shield-panel-header-left i {
    font-size: 1rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.shield-panel-close-btn {
    appearance: none;
    background: transparent;
    border: none;
    color: var(--p-primary);
    font-size: 1rem;
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.shield-panel-close-btn:hover {
    background: rgba(120, 120, 120, 0.15);
    color: var(--p-white);
}

.shield-panel-body {
    padding: 0.6rem 0.6rem 0.5rem 0.6rem;
    background-color: var(--p-dark);
}

.shield-add-row {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.5rem;
}

.shield-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.7rem;
    font-size: 0.85rem;
}

.shield-add-btn i {
    font-size: 0.75rem;
}

.shield-empty-hint {
    display: block;
    font-size: 0.85rem;
    opacity: 0.7;
    padding: 0 0.35rem 0.5rem 0.35rem;
}

.shield-tile {
    background: rgba(120, 120, 120, 0.08);
    border: 1px solid rgba(120, 120, 120, 0.2);
    border-radius: 10px;
    padding: 0.5rem 0.5rem 0.25rem 0.5rem;
    margin-bottom: 0.5rem;
}

.shield-tile-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
}

/* Editable shield name, styled like the winding name inputs in the requirements editor:
   borderless with an underline */
.shield-name-input {
    flex: 1 1 auto;
    min-width: 0;
    background: transparent;
    border: 0;
    border-bottom: 1px solid rgba(var(--p-white-rgb), 0.15);
    border-radius: 0;
    box-shadow: none;
    color: inherit;
    font-size: 0.95rem;
    font-weight: 600;
    padding: 0.15rem 0.25rem;
}

.shield-name-input:focus {
    border-bottom-color: var(--p-primary);
    outline: none;
}

.shield-interface-select {
    width: 100%;
    margin-bottom: 0.4rem;
    font-size: 0.88rem;
}

.shield-connection-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
    padding-left: 0.35rem;
}

.shield-connection-label {
    flex: 0 0 auto;
    margin: 0;
    font-size: 0.95rem;
}

.shield-connection-name {
    flex: 1 1 35%;
    min-width: 0;
    font-size: 0.88rem;
    padding: 0.3rem 0.4rem;
}

.shield-wire-input {
    flex: 1 1 0;
    min-width: 0;
    font-size: 0.88rem;
    padding: 0.3rem 0.4rem;
}

.shield-connection-select {
    flex: 1 1 65%;
    min-width: 0;
    font-size: 0.88rem;
}

.shield-remove-btn {
    width: 1.8rem;
    height: 1.8rem;
    flex: 0 0 auto;
}

/* Let long Dimension labels wrap instead of clipping with an ellipsis */
.shield-panel-body :deep(.dim-label) {
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
    line-height: 1.2;
}
</style>
