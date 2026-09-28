<script setup>
import Dialog from 'primevue/dialog'
import FilterableDataTable from '/WebSharedComponents/Common/FilterableDataTable.vue'
import { unitSystem } from '/WebSharedComponents/assets/js/units.js'
</script>

<script>
/**
 * Wire picker table (ABT #1110): every catalogue wire with the identity and the
 * dimensions a designer filters on. Rows come from the engine's
 * get_wires_summary (taskQueue.getWiresSummary), lengths in metres; the table
 * shows them in mm (SI) or in (imperial) so ordering and range filters work in
 * the displayed unit. A null is a dimension the wire does not have (a round wire
 * has no width), shown as "—", never substituted.
 */

const TYPE_LABELS = { round: 'Round', litz: 'Litz', rectangular: 'Rectangular', foil: 'Foil', planar: 'Planar' };
const COATING_LABELS = { bare: 'Bare', enamelled: 'Enamelled', extruded: 'Extruded', insulated: 'Insulated', served: 'Served', taped: 'Taped' };

const INCH = 0.0254;
const UNIT = {
    si: { label: 'mm', factor: 1e3, decimals: 3 },
    imperial: { label: 'in', factor: 1 / INCH, decimals: 4 },
};

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderNumber(decimals) {
    return (data, type) => {
        if (type === 'display') {
            if (data === null || data === undefined) return '<span class="wire-missing">—</span>';
            return Number(data.toFixed(decimals)).toString();
        }
        return data;
    };
}

function renderText(data, type) {
    if (type === 'display') {
        if (data === null || data === undefined || data === '') return '<span class="wire-missing">—</span>';
        return escapeHtml(data);
    }
    return data ?? '';
}

/** Engine summary row (SI) → table row (SI, labels resolved). */
export function buildWireRow(summary) {
    const coating = summary.coatingType == null
        ? null
        : [COATING_LABELS[summary.coatingType] ?? summary.coatingType,
           summary.coatingGrade != null ? `grade ${summary.coatingGrade}` : null,
           summary.coatingLayers != null ? `${summary.coatingLayers} layer${summary.coatingLayers === 1 ? '' : 's'}` : null,
          ].filter((part) => part != null).join(', ');
    return {
        name: summary.name,
        type: summary.type,
        typeLabel: TYPE_LABELS[summary.type] ?? summary.type,
        standard: summary.standard,
        standardName: summary.standardName,
        manufacturer: summary.manufacturer,
        material: summary.material,
        numberConductors: summary.numberConductors,
        conductingDiameter: summary.conductingDiameter,
        outerDiameter: summary.outerDiameter,
        conductingWidth: summary.conductingWidth,
        conductingHeight: summary.conductingHeight,
        outerWidth: summary.outerWidth,
        outerHeight: summary.outerHeight,
        strandStandardName: summary.strandStandardName,
        strandConductingDiameter: summary.strandConductingDiameter,
        coating,
    };
}

const LENGTH_KEYS = ['conductingDiameter', 'outerDiameter', 'conductingWidth', 'conductingHeight', 'outerWidth', 'outerHeight', 'strandConductingDiameter'];

export default {
    components: { Dialog },
    emits: ['update:visible', 'wireSelected'],
    props: {
        dataTestLabel: { type: String, default: '' },
        wireData: { type: Array, required: true },
        loading: { type: Boolean, default: false },
        visible: { type: Boolean, default: false },
    },
    data() {
        return {
            tableOptions: {
                lengthChange: true,
                info: true,
                paginate: true,
                pageLength: 15,
                lengthMenu: [10, 15, 25, 50, 100],
                // Type descending opens on Round (then Rectangular, Planar, Litz,
                // Foil), the types most designs use, thinnest first.
                order: [[1, 'desc'], [5, 'asc']],
            },
        }
    },
    computed: {
        activeUnitSystem() {
            return unitSystem();
        },
        /** Rows on screen: every length in the unit system's unit (mm or in). */
        displayRows() {
            const unit = UNIT[this.activeUnitSystem] ?? UNIT.si;
            return this.wireData.map((row) => {
                const shown = { ...row };
                for (const key of LENGTH_KEYS) {
                    shown[key] = row[key] == null ? null : row[key] * unit.factor;
                }
                return shown;
            });
        },
        wireColumns() {
            const unit = UNIT[this.activeUnitSystem] ?? UNIT.si;
            const num = renderNumber(unit.decimals);
            return [
                {
                    data: 'name',
                    title: 'Name',
                    type: 'string',
                    render(data, type) {
                        if (type === 'display') return `<span class="wire-name">${escapeHtml(data)}</span>`;
                        return data;
                    },
                },
                { data: 'typeLabel', title: 'Type', type: 'string' },
                { data: 'standard', title: 'Standard', type: 'string', render: renderText },
                { data: 'standardName', title: 'Size', type: 'string', render: renderText },
                { data: 'manufacturer', title: 'Manufacturer', type: 'string', render: renderText },
                { data: 'conductingDiameter', title: `Cond. Ø (${unit.label})`, render: num },
                { data: 'outerDiameter', title: `Outer Ø (${unit.label})`, render: num },
                { data: 'conductingWidth', title: `Cond. width (${unit.label})`, render: num },
                { data: 'conductingHeight', title: `Cond. height (${unit.label})`, render: num },
                { data: 'numberConductors', title: 'Strands', render: renderNumber(0) },
                { data: 'strandConductingDiameter', title: `Strand Ø (${unit.label})`, render: num },
                { data: 'coating', title: 'Coating', type: 'string', render: renderText },
                {
                    data: null,
                    title: '',
                    orderable: false,
                    searchable: false,
                    filterable: false,
                    exportable: false,
                    className: 'wire-select-cell',
                    defaultContent: '<span class="wire-select-btn" title="Use this wire"><i class="pi pi-arrow-right"></i></span>',
                },
            ];
        },
    },
    methods: {
        selectWire(data) {
            this.$emit('update:visible', false);
            this.$emit('wireSelected', data);
        },
    }
}
</script>

<template>
    <Dialog
        :visible="visible"
        @update:visible="(v) => $emit('update:visible', v)"
        :modal="true"
        :draggable="false"
        :style="{ width: 'min(96vw, 1600px)' }"
        :pt="{ root: { class: 'shape-modal-content' } }">
        <template #header>
            <div class="d-flex align-items-center">
                <i class="pi pi-th-large shape-header-icon mr-3"></i>
                <h5 :data-cy="dataTestLabel + '-WireTable-title'" class="modal-title mb-0 shape-modal-title">Select Wire</h5>
            </div>
        </template>
        <div class="px-2 py-2 shape-table-wrapper wire-table-wrapper" :data-cy="dataTestLabel + '-WireTable'">
            <div v-if="loading" class="wire-table-loading" :data-cy="dataTestLabel + '-WireTable-loading'">
                <i class="pi pi-spin pi-spinner"></i>
                <span>Listing the wire catalogue…</span>
            </div>
            <FilterableDataTable
                v-else
                ref="wireTable"
                :key="activeUnitSystem"
                :data="displayRows"
                :columns="wireColumns"
                :options="tableOptions"
                :columnFilters="true"
                :compact="true"
                :exportCsv="true"
                exportFileName="wires"
                rowNoun="wires"
                :dataTestLabel="dataTestLabel + '-WireTable'"
                @row-click="selectWire"
            />
        </div>
    </Dialog>
</template>

<style>
    /* Table chrome is shared with the shape table: .shape-table-wrapper rules
     * live in CoreShapeTableModal.vue (global style). */
    .shape-table-wrapper .wire-select-cell {
        width: 2.5rem;
        text-align: center;
    }

    .shape-table-wrapper .wire-select-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background-color: var(--p-gray-700);
        color: var(--p-gray-100);
        border: 1px solid var(--p-secondary);
        border-radius: var(--p-border-radius);
        padding: 0.3rem 0.6rem;
        font-size: 0.8rem;
        height: 1.75rem;
        line-height: 1.25rem;
        transition: background-color 0.2s, border-color 0.2s;
    }

    .shape-table-wrapper tbody tr:hover .wire-select-btn {
        background-color: var(--p-primary);
        border-color: var(--p-primary);
        color: var(--p-white);
    }

    .shape-table-wrapper .wire-missing {
        color: var(--p-gray-500);
    }

    /* Litz names run long ("Litz 400x0.05 - Served - Grade 1"): let the name wrap
     * rather than stretch the table past the screen. */
    .shape-table-wrapper .wire-name {
        display: inline-block;
        max-width: 9rem;
        white-space: normal;
        overflow-wrap: anywhere;
    }

    .wire-table-loading {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 2rem 1rem;
        color: var(--p-gray-300);
        font-size: 0.9rem;
    }
</style>
