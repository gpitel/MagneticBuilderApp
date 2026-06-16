<script setup>
import { combinedStyle, combinedClass } from '/WebSharedComponents/assets/js/utils.js'
import { ConnectionType } from '/WebSharedComponents/assets/ts/MAS.ts'
</script>

<script>

// Edits the identity metadata of a single winding inside the Wire Configuration
// panel: its label (functionalDescription[windingIndex].name) and the list of
// pins/terminals it connects to (functionalDescription[windingIndex].connections).
// These are pure metadata in MAS, so — unlike turns/wire — changing them must NOT
// invalidate the wound geometry, hence no cleanCoil() here.
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
        readOnly: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            // 'Blind' is our local winding-to-winding marker; it is not (yet) in
            // the generated MAS.ts ConnectionType enum, and round-trips to MAS as
            // the verbatim string. Two windings sharing a blind pinName are joined.
            blindType: 'Blind',
            // ConnectionType is a string enum ("Pin", "Screw", "SMT", "Flying Lead");
            // store the value verbatim so it round-trips to MAS unchanged.
            connectionTypeOptions: [...Object.values(ConnectionType), 'Blind'],
        }
    },
    computed: {
        winding() {
            return this.masStore.mas.magnetic.coil.functionalDescription[this.windingIndex];
        },
        connections() {
            const winding = this.winding;
            return (winding && Array.isArray(winding.connections)) ? winding.connections : [];
        },
        numberParallels() {
            const winding = this.winding;
            const n = winding ? Number(winding.numberParallels) : 1;
            return (Number.isFinite(n) && n >= 1) ? n : 1;
        },
        maxConnections() {
            // Each parallel conductor has two ends, so a winding terminates on at
            // most 2 x numberParallels pins (and at least the MAS minimum of 2).
            return Math.max(2, 2 * this.numberParallels);
        },
        // The bobbin's declared pin count, if it has one (pinout.numberPins, or the
        // number of geometric pins). 0 when the bobbin defines no pins — the norm
        // today, since nothing populates a bobbin pinout.
        bobbinPinCount() {
            const coil = this.masStore.mas.magnetic.coil;
            const bobbin = coil ? coil.bobbin : null;
            const fromPinout = (bobbin && bobbin.functionalDescription && bobbin.functionalDescription.pinout)
                ? Number(bobbin.functionalDescription.pinout.numberPins) : NaN;
            if (Number.isFinite(fromPinout) && fromPinout > 0) {
                return fromPinout;
            }
            const fromPins = (bobbin && bobbin.processedDescription && Array.isArray(bobbin.processedDescription.pins))
                ? bobbin.processedDescription.pins.length : 0;
            return (Number.isFinite(fromPins) && fromPins > 0) ? fromPins : 0;
        },
        hasBobbinPins() {
            return this.bobbinPinCount > 0;
        },
        pinOptions() {
            // 1..bobbinPinCount, widened to keep any already-assigned pin selectable.
            const usedMax = this.connections.reduce((m, c) => {
                const v = parseInt(c.pinName, 10);
                return Number.isFinite(v) ? Math.max(m, v) : m;
            }, 0);
            const n = Math.max(this.bobbinPinCount, usedMax);
            const opts = [];
            for (let i = 1; i <= n; i++) {
                opts.push(String(i));
            }
            return opts;
        },
        // Distinct blind-node ids already used on ANY winding, offered as combobox
        // suggestions so picking one joins this winding to that internal node.
        blindNodeOptions() {
            const coil = this.masStore.mas.magnetic.coil;
            const windings = (coil && Array.isArray(coil.functionalDescription))
                ? coil.functionalDescription : [];
            const ids = new Set();
            windings.forEach((w) => {
                (w.connections || []).forEach((c) => {
                    if (c && c.type === this.blindType
                        && c.pinName != null && String(c.pinName).trim() !== '') {
                        ids.add(String(c.pinName));
                    }
                });
            });
            return Array.from(ids).sort();
        },
        // Per-winding id so multiple mounted selectors never share a <datalist>.
        datalistId() {
            return 'blind-nodes-' + this.windingIndex;
        },
        // Match the themed look of the other Wire Configuration inputs.
        fieldStyle() {
            return combinedStyle([
                this.$styleStore.magneticBuilder.inputValueBgColor,
                this.$styleStore.magneticBuilder.inputTextColor,
                this.$styleStore.magneticBuilder.inputFontSize,
            ]);
        },
        fieldClass() {
            return combinedClass([
                this.$styleStore.magneticBuilder.inputValueBgColor,
                this.$styleStore.magneticBuilder.inputTextColor,
                this.$styleStore.magneticBuilder.inputFontSize,
            ]);
        },
    },
    watch: {
        windingIndex() {
            this.ensureConnections();
            this.clampConnections();
        },
        numberParallels() {
            this.clampConnections();
        },
    },
    mounted() {
        this.ensureConnections();
        this.clampConnections();
    },
    methods: {
        // MAS requires at least two connections per winding (an input and an
        // output). Pad to two defaults if the loaded design has none or fewer.
        ensureConnections() {
            const winding = this.winding;
            if (winding == null) {
                return;
            }
            const defaults = [
                { pinName: '1', type: ConnectionType.Pin },
                { pinName: '2', type: ConnectionType.Pin },
            ];
            if (!Array.isArray(winding.connections) || winding.connections.length < 2) {
                const merged = Array.isArray(winding.connections) ? winding.connections.slice() : [];
                for (let i = merged.length; i < 2; i++) {
                    merged.push(defaults[i]);
                }
                winding.connections = merged;
            }
        },
        updateName(event) {
            if (this.readOnly) {
                return;
            }
            const winding = this.winding;
            if (winding == null) {
                return;
            }
            const oldName = winding.name;
            const newName = event.target.value;
            if (oldName === newName) {
                return;
            }
            winding.name = newName;
            // The construction references a winding by name (partialWinding.winding,
            // turn.winding, bobbin connections), so a rename of functionalDescription
            // alone leaves those stale — breaking name-matched derived views like the
            // Summary's Winding Construction Steps. Propagate the rename so they follow.
            this.renameWindingReferences(oldName, newName);
        },
        renameWindingReferences(oldName, newName) {
            if (newName == null) {
                return;
            }
            const coil = this.masStore.mas.magnetic.coil;
            if (coil == null) {
                return;
            }
            // For a single-winding coil every construction reference belongs to that
            // winding, so resync them all to the new name — this also repairs a coil
            // whose construction was desynced by a rename made before this fix. For a
            // multi-winding coil, match the old name so other windings are untouched.
            const single = Array.isArray(coil.functionalDescription) && coil.functionalDescription.length === 1;
            const shouldRename = (refName) => single || (oldName != null && oldName !== '' && refName === oldName);
            ['groupsDescription', 'sectionsDescription', 'layersDescription'].forEach((key) => {
                if (Array.isArray(coil[key])) {
                    coil[key].forEach((container) => {
                        (container.partialWindings || []).forEach((pw) => {
                            if (shouldRename(pw.winding)) {
                                pw.winding = newName;
                            }
                        });
                    });
                }
            });
            if (Array.isArray(coil.turnsDescription)) {
                coil.turnsDescription.forEach((turn) => {
                    if (shouldRename(turn.winding)) {
                        turn.winding = newName;
                    }
                });
            }
            const bobbin = coil.bobbin;
            if (bobbin && bobbin.functionalDescription && Array.isArray(bobbin.functionalDescription.connections)) {
                bobbin.functionalDescription.connections.forEach((c) => {
                    if (shouldRename(c.winding)) {
                        c.winding = newName;
                    }
                });
            }
        },
        updateConnection(index, key, value) {
            if (this.readOnly) {
                return;
            }
            const winding = this.winding;
            if (winding == null || !Array.isArray(winding.connections) || winding.connections[index] == null) {
                return;
            }
            winding.connections[index][key] = value;
            // A blind (internal) joint has no lead-to-terminal length; drop any
            // stale value so the editor and the MAS export agree.
            if (key === 'type' && value === this.blindType) {
                delete winding.connections[index].length;
            }
        },
        // length is stored in metres (MAS); the field edits millimetres. Round to
        // kill the float noise from the m<->mm scaling (e.g. 0.0123 m -> 12.3 mm).
        leadLengthMm(connection) {
            if (connection == null || connection.length == null) {
                return '';
            }
            return Math.round(connection.length * 1000 * 1e6) / 1e6;
        },
        updateLength(index, rawMm) {
            if (this.readOnly) {
                return;
            }
            const winding = this.winding;
            if (winding == null || !Array.isArray(winding.connections) || winding.connections[index] == null) {
                return;
            }
            const mm = parseFloat(rawMm);
            // Blank (or non-numeric) clears the optional key rather than storing 0/NaN.
            if (rawMm === '' || !Number.isFinite(mm)) {
                delete winding.connections[index].length;
                return;
            }
            winding.connections[index].length = mm / 1000;
        },
        addConnection() {
            if (this.readOnly) {
                return;
            }
            const winding = this.winding;
            if (winding == null) {
                return;
            }
            if (!Array.isArray(winding.connections)) {
                winding.connections = [];
            }
            // Cap at 2 x numberParallels — the number of physical wire ends.
            if (winding.connections.length >= this.maxConnections) {
                return;
            }
            const nextPin = String(winding.connections.length + 1);
            winding.connections.push({ pinName: nextPin, type: ConnectionType.Pin });
        },
        removeConnection(index) {
            if (this.readOnly) {
                return;
            }
            const winding = this.winding;
            if (winding == null || !Array.isArray(winding.connections)) {
                return;
            }
            // Never drop below the MAS minimum of two connections.
            if (winding.connections.length <= 2) {
                return;
            }
            winding.connections.splice(index, 1);
        },
        clampConnections() {
            const winding = this.winding;
            if (winding == null || !Array.isArray(winding.connections)) {
                return;
            }
            // Trim pins beyond 2 x parallels (e.g. after parallels is lowered),
            // keeping the MAS minimum of two.
            if (winding.connections.length > this.maxConnections) {
                winding.connections.splice(this.maxConnections);
            }
        },
    },
}
</script>

<template>
    <div class="labelpin-wrapper">
        <div class="labelpin-name-row">
            <label class="labelpin-name-label">Label</label>
            <input
                type="text"
                class="labelpin-field labelpin-name-input"
                :style="fieldStyle"
                :class="fieldClass"
                :disabled="readOnly"
                :value="winding ? (winding.name || '') : ''"
                :data-cy="dataTestLabel + '-WindingName'"
                v-tooltip="'Name for this winding (stored as functionalDescription.name in MAS). Used as the winding label in exports and capacitance/inductance matrices.'"
                @input="updateName($event)"
            >
        </div>

        <div class="labelpin-pins">
            <div class="labelpin-pins-header">
                <span>Pins / Connections <span class="labelpin-count">{{ connections.length }} / {{ maxConnections }}</span></span>
                <button
                    v-if="!readOnly"
                    type="button"
                    class="labelpin-add"
                    :disabled="connections.length >= maxConnections"
                    :data-cy="dataTestLabel + '-AddConnection'"
                    v-tooltip="connections.length >= maxConnections ? ('At most 2 x parallels = ' + maxConnections + ' pins for this winding') : 'Add another pin (e.g. a center tap)'"
                    @click="addConnection"
                >
                    <i class="fa-solid fa-plus"></i><span>Add pin</span>
                </button>
            </div>

            <div class="labelpin-table">
                <div class="labelpin-row labelpin-row-head">
                    <span>Name</span>
                    <span>Type</span>
                    <span>Length</span>
                    <span class="labelpin-col-action"></span>
                </div>

                <datalist :id="datalistId">
                    <option v-for="node in blindNodeOptions" :key="node" :value="node"></option>
                </datalist>

                <div
                    v-for="(connection, index) in connections"
                    :key="index"
                    class="labelpin-row"
                    :data-cy="dataTestLabel + '-Connection-' + index"
                >
                    <input
                        v-if="connection.type === blindType"
                        type="text"
                        class="labelpin-field"
                        :style="fieldStyle"
                        :class="fieldClass"
                        :disabled="readOnly"
                        :value="connection.pinName"
                        :list="datalistId"
                        :data-cy="dataTestLabel + '-Connection-' + index + '-Pin'"
                        v-tooltip="'Blind (winding-to-winding) node id. Type a new id, or pick one already used on another winding to join them.'"
                        @input="updateConnection(index, 'pinName', $event.target.value)"
                    >
                    <select
                        v-else-if="hasBobbinPins"
                        class="labelpin-field"
                        :style="fieldStyle"
                        :class="fieldClass"
                        :disabled="readOnly"
                        :value="connection.pinName"
                        :data-cy="dataTestLabel + '-Connection-' + index + '-Pin'"
                        v-tooltip="'Pin this end of the winding connects to (from the bobbin pin list)'"
                        @change="updateConnection(index, 'pinName', $event.target.value)"
                    >
                        <option v-for="opt in pinOptions" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                    <input
                        v-else
                        type="text"
                        class="labelpin-field"
                        :style="fieldStyle"
                        :class="fieldClass"
                        :disabled="readOnly"
                        :value="connection.pinName"
                        :data-cy="dataTestLabel + '-Connection-' + index + '-Pin'"
                        v-tooltip="'Pin this end of the winding connects to (the bobbin defines no pin list)'"
                        @input="updateConnection(index, 'pinName', $event.target.value)"
                    >
                    <select
                        class="labelpin-field"
                        :style="fieldStyle"
                        :class="fieldClass"
                        :disabled="readOnly"
                        :value="connection.type"
                        :data-cy="dataTestLabel + '-Connection-' + index + '-Type'"
                        v-tooltip="'Terminal type'"
                        @change="updateConnection(index, 'type', $event.target.value)"
                    >
                        <option v-for="opt in connectionTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        class="labelpin-field"
                        :style="fieldStyle"
                        :class="fieldClass"
                        :disabled="readOnly || connection.type === blindType"
                        :value="connection.type === blindType ? '' : leadLengthMm(connection)"
                        :data-cy="dataTestLabel + '-Connection-' + index + '-Length'"
                        v-tooltip="connection.type === blindType ? 'A blind winding-to-winding joint has no lead-to-terminal length' : 'Lead length from the last turn to the terminal, in mm (stored in metres on connection.length). Leave blank to omit.'"
                        @change="updateLength(index, $event.target.value)"
                    >
                    <button
                        v-if="!readOnly"
                        type="button"
                        class="labelpin-remove labelpin-col-action"
                        :disabled="connections.length <= 2"
                        :data-cy="dataTestLabel + '-Connection-' + index + '-Remove'"
                        v-tooltip="connections.length <= 2 ? 'A winding needs at least two pins' : 'Remove this pin'"
                        @click="removeConnection(index)"
                    >&times;</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.labelpin-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.labelpin-name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.1rem;
}

.labelpin-name-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--bs-primary);
    white-space: nowrap;
    margin: 0;
}

.labelpin-name-input {
    flex: 1 1 auto;
}

.labelpin-pins {
    border: 1px solid rgba(var(--bs-primary-rgb), 0.18);
    border-radius: 8px;
    padding: 0.45rem 0.55rem 0.55rem;
    background: rgba(0, 0, 0, 0.18);
}

.labelpin-pins-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--bs-primary);
    margin-bottom: 0.45rem;
}

.labelpin-count {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    margin-left: 0.25rem;
}

.labelpin-add {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid rgba(var(--bs-primary-rgb), 0.55);
    background: rgba(var(--bs-primary-rgb), 0.18);
    color: var(--bs-primary);
    transition: filter 0.15s, background 0.15s, opacity 0.15s;
}

.labelpin-add:not(:disabled):hover {
    filter: brightness(1.15);
}

.labelpin-add:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.labelpin-table {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

.labelpin-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 0.9fr) 1.6rem;
    gap: 0.4rem;
    align-items: center;
}

.labelpin-row-head {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: rgba(255, 255, 255, 0.45);
    padding: 0 0.1rem;
}

.labelpin-field {
    width: 100%;
    min-width: 0;
    border-radius: 6px;
    padding: 0.2rem 0.45rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    height: 1.85rem;
}

select.labelpin-field {
    cursor: pointer;
}

.labelpin-field:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.labelpin-col-action {
    justify-self: center;
}

.labelpin-remove {
    width: 1.6rem;
    height: 1.6rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: 1.05rem;
    line-height: 1;
    cursor: pointer;
    border: 1px solid rgba(var(--bs-danger-rgb), 0.5);
    background: rgba(var(--bs-danger-rgb), 0.15);
    color: var(--bs-danger);
    transition: filter 0.15s, opacity 0.15s;
}

.labelpin-remove:not(:disabled):hover {
    filter: brightness(1.15);
}

.labelpin-remove:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}
</style>
