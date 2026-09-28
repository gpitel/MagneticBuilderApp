<script>
import { formatDimension } from '/WebSharedComponents/assets/js/utils.js'

/**
 * The layer stack of a printed winding, top to bottom (ABT #1121).
 *
 * For a printed winding the design IS the stack, so the planar layout shows it
 * instead of a turn table. Every row is read from the coil's own
 * `layersDescription` — the layers MKF wound — and the turn count of a copper
 * layer is counted from `turnsDescription`, so nothing here is a second opinion
 * about the geometry: if the engine wound it differently, this says so.
 *
 * A WOUND coil also has layers, but they are turns stacked across the winding
 * window, not copper on a board: their thickness is a distance in the window and
 * reading it as a board thickness would be nonsense. So the panel presents a
 * stack only for a printed winding, and says why when it does not.
 */
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
    },
    computed: {
        isPrinted() {
            const technology = this.masStore.mas?.inputs?.designRequirements?.wiringTechnology;
            return (technology ?? '').toLowerCase() === 'printed';
        },
        layers() {
            if (!this.isPrinted) return null;
            return this.masStore.mas?.magnetic?.coil?.layersDescription ?? null;
        },
        turns() {
            return this.masStore.mas?.magnetic?.coil?.turnsDescription ?? [];
        },
        /** One row per layer: what it is, whose it is, how thick, how many turns. */
        rows() {
            if (this.layers == null) return null;
            return this.layers.map((layer) => {
                const isConduction = layer.type === 'conduction';
                const winding = layer.partialWindings?.[0]?.winding ?? null;
                const turns = isConduction
                    ? this.turns.filter((turn) => turn.layer === layer.name).length
                    : 0;
                // A planar layer's thickness is its second dimension; the first is
                // the width across the window.
                const thickness = Array.isArray(layer.dimensions) ? layer.dimensions[1] : null;
                return {
                    name: layer.name,
                    isConduction,
                    winding,
                    turns,
                    thickness,
                };
            });
        },
        totalThickness() {
            if (this.rows == null) return null;
            let total = 0;
            for (const row of this.rows) {
                if (row.thickness == null) return null;
                total += row.thickness;
            }
            return total;
        },
        copperLayerCount() {
            return (this.rows ?? []).filter((row) => row.isConduction).length;
        },
    },
    methods: {
        thicknessLabel(thickness) {
            if (thickness == null) return '—';
            const shown = formatDimension(thickness);
            return `${shown.label} ${shown.unit}`;
        },
    },
}
</script>

<template>
    <div class="stackup" :data-cy="dataTestLabel + '-Stackup'">
        <p
            v-if="!isPrinted"
            :data-cy="dataTestLabel + '-Stackup-notPrinted'"
            class="stackup-note"
        >This design is wound with wire. A layer stack describes a printed winding — set the
        wiring technology to printed in the design requirements to build one.</p>

        <p
            v-else-if="rows == null"
            :data-cy="dataTestLabel + '-Stackup-empty'"
            class="stackup-note"
        >The stack appears once the winding is laid out — set the turns and the layers first.</p>

        <template v-else>
            <div class="stackup-summary" :data-cy="dataTestLabel + '-Stackup-summary'">
                <span>{{ copperLayerCount }} copper {{ copperLayerCount === 1 ? 'layer' : 'layers' }}</span>
                <span v-if="totalThickness != null">board {{ thicknessLabel(totalThickness) }}</span>
            </div>

            <ol class="stackup-list">
                <li
                    v-for="(row, index) in rows"
                    :key="row.name"
                    class="stackup-layer"
                    :class="{ 'stackup-layer-copper': row.isConduction }"
                    :data-cy="dataTestLabel + '-Stackup-layer-' + index"
                >
                    <span class="stackup-layer-name">
                        {{ row.isConduction ? (row.winding ?? 'Conductor') : 'Insulation' }}
                    </span>
                    <span class="stackup-layer-detail">
                        <span v-if="row.isConduction">{{ row.turns }} {{ row.turns === 1 ? 'turn' : 'turns' }}</span>
                        <span>{{ thicknessLabel(row.thickness) }}</span>
                    </span>
                </li>
            </ol>
        </template>
    </div>
</template>

<style scoped>
.stackup {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-height: 0;
}

.stackup-summary {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--p-gray-400);
    border-bottom: 1px solid color-mix(in srgb, var(--p-gray-600) 25%, transparent);
    padding-bottom: 0.25rem;
}

.stackup-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    overflow-y: auto;
    min-height: 0;
}

.stackup-layer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.72rem;
    padding: 0.2rem 0.45rem;
    border-radius: 4px;
    border: 1px solid color-mix(in srgb, var(--p-gray-600) 25%, transparent);
    color: var(--p-gray-400);
    background: color-mix(in srgb, var(--p-gray-600) 6%, transparent);
}

.stackup-layer-copper {
    color: var(--p-white);
    border-color: rgba(var(--p-danger-rgb), 0.45);
    background: rgba(var(--p-danger-rgb), 0.12);
}

.stackup-layer-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.stackup-layer-detail {
    display: flex;
    gap: 0.6rem;
    white-space: nowrap;
    flex: 0 0 auto;
}

.stackup-note {
    color: var(--p-gray-400);
    font-size: 0.8rem;
    margin: 0;
    padding: 1rem 0.25rem;
    text-align: center;
}
</style>
