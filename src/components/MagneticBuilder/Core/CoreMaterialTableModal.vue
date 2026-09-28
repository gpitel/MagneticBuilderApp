<script setup>
import Dialog from 'primevue/dialog'
import FilterableDataTable from '/WebSharedComponents/Common/FilterableDataTable.vue'
import { removeTrailingZeroes } from '/WebSharedComponents/assets/js/utils.js'
import { unitSystem } from '/WebSharedComponents/assets/js/units.js'
</script>

<script>
/**
 * Core material picker table (ABT #1072).
 *
 * Rows come from the engine's get_core_materials_summary (see
 * taskQueue.getCoreMaterialsSummary): every property is resolved by MKF's own
 * models at the temperatures/reference point named in the column titles.
 * Numeric cells hold plain NUMBERS in the header's unit so the table orders
 * and range-filters them numerically; a null is a property the material's
 * record does not carry (shown as "—", never substituted).
 */

const MATERIAL_TYPE_LABELS = {
    ferrite: 'Ferrite',
    powder: 'Powder',
    nanocrystalline: 'Nanocrystalline',
    amorphous: 'Amorphous',
    electricalSteel: 'Electrical steel',
};

const COMPOSITION_LABELS = {
    MnZn: 'MnZn',
    NiZn: 'NiZn',
    MgZn: 'MgZn',
    FeSiAl: 'FeSiAl',
    FeSi: 'FeSi',
    FeNi: 'FeNi',
    FeNiMo: 'FeNiMo',
    FeMo: 'FeMo',
    FeSiCr: 'FeSiCr',
    iron: 'Iron',
    carbonylIron: 'Carbonyl iron',
    proprietary: 'Proprietary',
};

const APPLICATION_LABELS = {
    power: 'Power',
    interferenceSuppression: 'Interference suppression',
    signalProcessing: 'Signal processing',
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
            if (data === null || data === undefined) return '<span class="material-missing">—</span>';
            return removeTrailingZeroes(data, decimals);
        }
        return data;
    };
}

/** Engine summary row (SI) → table row (display units, see column titles). */
export function buildMaterialRow(summary) {
    const scale = (value, factor) => (value === null || value === undefined ? null : value * factor);
    return {
        name: summary.name,
        manufacturer: summary.manufacturer,
        materialType: summary.materialType,
        materialTypeLabel: MATERIAL_TYPE_LABELS[summary.materialType] ?? summary.materialType,
        composition: summary.composition === null ? '' : (COMPOSITION_LABELS[summary.composition] ?? summary.composition),
        family: summary.family === null ? '' : summary.family,
        applications: summary.applications.map((a) => APPLICATION_LABELS[a] ?? a).join(', '),
        initialPermeabilityA: summary.initialPermeabilityA,
        initialPermeabilityB: summary.initialPermeabilityB,
        saturationA: scale(summary.saturationA, 1e3),        // T → mT
        saturationB: scale(summary.saturationB, 1e3),
        curieTemperature: summary.curieTemperature,
        resistivityA: summary.resistivityA,                   // Ω·m
        volumetricLossesReference: scale(summary.volumetricLossesReference, 1e-3), // W/m³ → kW/m³
        missing: summary.missing,
    };
}

export default {
    components: { Dialog },
    emits: ['coreMaterialSelected', 'update:visible'],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        coreMaterialData: {
            type: Array,
            required: true,
        },
        loading: {
            type: Boolean,
            default: false,
        },
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
                order: [[1, 'asc'], [0, 'asc']],
            },
        }
    },
    computed: {
        activeUnitSystem() {
            return unitSystem();
        },
        /** Rows on screen: Curie temperature in °F under the imperial system (ABT #1099). */
        displayRows() {
            if (this.activeUnitSystem !== 'imperial') return this.coreMaterialData;
            return this.coreMaterialData.map((row) => ({
                ...row,
                curieTemperature: row.curieTemperature == null ? null : row.curieTemperature * 9 / 5 + 32,
            }));
        },
        coreMaterialColumns() {
        const temperatureUnit = this.activeUnitSystem === 'imperial' ? '°F' : '°C';
        const coreMaterialColumns = [
            {
                data: 'name',
                title: 'Name',
                type: 'string',
                render(data, type, row) {
                    if (type === 'display') {
                        const missing = Object.keys(row.missing);
                        const title = missing.length ? ` title="No data for: ${escapeHtml(missing.join(', '))}"` : '';
                        return `<span class="material-name"${title}>${escapeHtml(data)}</span>`;
                    }
                    return data;
                },
            },
            { data: 'manufacturer', title: 'Manufacturer', type: 'string' },
            { data: 'materialTypeLabel', title: 'Type', type: 'string' },
            { data: 'composition', title: 'Composition', type: 'string' },
            { data: 'family', title: 'Family', type: 'string' },
            // `applications` is kept on the row (CSV, search) but not shown: the
            // MAS field is filled for a handful of records only.
            // Short symbols so the thirteen columns fit a 1366 px screen without a
            // horizontal scroll; the conditions are spelled out under the title.
            { data: 'initialPermeabilityA', title: 'µi @25 °C', render: renderNumber(0) },
            { data: 'initialPermeabilityB', title: 'µi @100 °C', render: renderNumber(0) },
            { data: 'saturationA', title: 'Bsat @25 (mT)', render: renderNumber(0) },
            { data: 'saturationB', title: 'Bsat @100 (mT)', render: renderNumber(0) },
            { data: 'curieTemperature', title: `Tc (${temperatureUnit})`, render: renderNumber(0) },
            { data: 'resistivityA', title: 'ρ (Ω·m)', render: renderNumber(2) },
            { data: 'volumetricLossesReference', title: 'Pv (kW/m³)', render: renderNumber(1) },
            {
                data: null,
                title: '',
                orderable: false,
                searchable: false,
                filterable: false,
                exportable: false,
                className: 'material-select-cell',
                defaultContent: '<span class="material-select-btn" title="Use this material"><i class="pi pi-arrow-right"></i></span>',
            },
        ];
        return coreMaterialColumns;
        },
    },
    methods: {
        selectCoreMaterial(data) {
            this.$emit('update:visible', false);
            this.$emit('coreMaterialSelected', data);
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
                <h5 :data-cy="dataTestLabel + '-MaterialTable-title'" class="modal-title mb-0 shape-modal-title">Select Core Material</h5>
                <small class="material-table-legend ml-3">µi initial permeability · Bsat saturation flux density · Tc Curie temperature · ρ resistivity at 25 °C · Pv volumetric losses at 100 kHz, 100 mT, 100 °C · @25 and @100 are °C</small>
            </div>
        </template>
        <div class="px-2 py-2 shape-table-wrapper material-table-wrapper" :data-cy="dataTestLabel + '-MaterialTable'">
            <div v-if="loading" class="material-table-loading" :data-cy="dataTestLabel + '-MaterialTable-loading'">
                <i class="pi pi-spin pi-spinner"></i>
                <span>Resolving material properties with the engine…</span>
            </div>
            <FilterableDataTable
                v-else
                ref="coreMaterialTable"
                :key="activeUnitSystem"
                :data="displayRows"
                :columns="coreMaterialColumns"
                :options="tableOptions"
                :columnFilters="true"
                :compact="true"
                :exportCsv="true"
                exportFileName="core_materials"
                rowNoun="materials"
                :dataTestLabel="dataTestLabel + '-MaterialTable'"
                @row-click="selectCoreMaterial"
            />
        </div>
    </Dialog>
</template>

<style>
    /* Table chrome is shared with the shape table: .shape-table-wrapper rules
     * live in CoreShapeTableModal.vue (global style). */
    .shape-table-wrapper .material-select-cell {
        width: 2.5rem;
        text-align: center;
    }

    .shape-table-wrapper .material-select-btn {
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

    .shape-table-wrapper tbody tr:hover .material-select-btn {
        background-color: var(--p-primary);
        border-color: var(--p-primary);
        color: var(--p-white);
    }

    .shape-table-wrapper .material-missing {
        color: var(--p-gray-500);
    }

    .material-table-legend {
        color: var(--p-gray-400);
        font-size: 0.75rem;
        font-weight: 400;
    }


    .material-table-loading {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 2rem 1rem;
        color: var(--p-gray-300);
        font-size: 0.9rem;
    }
</style>
