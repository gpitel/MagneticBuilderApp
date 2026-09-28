<script setup>
import Dialog from 'primevue/dialog'
import FilterableDataTable from '/WebSharedComponents/Common/FilterableDataTable.vue'
import { removeTrailingZeroes } from '/WebSharedComponents/assets/js/utils.js'
import { unitSystem } from '/WebSharedComponents/assets/js/units.js'
</script>

<script>
/**
 * Core shape picker table.
 *
 * Rows come from CoreShapeSelector (one per shape in the engine database,
 * see `buildShapeRow` there). Every numeric column holds a plain NUMBER in
 * the unit named in its header (mm, mm², mm³, mm⁴) so that:
 *   - ordering is numeric, not lexicographic ("9 mm" < "10 mm"),
 *   - the per-column min/max filters compare against the value on screen.
 * The unit is in the column title, not the cell, to keep cells short.
 * Rows arrive in mm / mm² / mm³ / mm⁴; under the imperial unit system
 * (ABT #1099) they are shown in in / in² / in³ / in⁴ — converted per row so
 * ordering and the range filters work in the unit on screen.
 */
const MM_PER_INCH = 25.4;
const LENGTH_COLUMNS = {
    width: 1, height: 1, depth: 1, effectiveLength: 1,
    effectiveArea: 2, minimumArea: 2, windowArea: 2,
    effectiveVolume: 3,
    areaProduct: 4,
};
const UNIT_LABELS = { si: ['mm', 'mm²', 'mm³', 'mm⁴'], imperial: ['in', 'in²', 'in³', 'in⁴'] };

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
            return removeTrailingZeroes(data, decimals);
        }
        return data;
    };
}

export default {
    components: { Dialog },
    emits: ['coreShapeSelected', 'update:visible'],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        /** Raw family (MAS enum value) of the currently selected shape. */
        shapeFamily: {
            type: String,
            default: '',
        },
        coreShapeData: {
            type: Array,
            required: true,
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
                order: [[0, 'asc']],
            },
        }
    },
    computed: {
        activeUnitSystem() {
            return unitSystem();
        },
        /** Rows in the unit system on screen (mm-based rows converted when imperial). */
        displayRows() {
            if (this.activeUnitSystem !== 'imperial') return this.coreShapeData;
            return this.coreShapeData.map((row) => {
                const converted = { ...row };
                for (const [key, power] of Object.entries(LENGTH_COLUMNS)) {
                    converted[key] = row[key] / Math.pow(MM_PER_INCH, power);
                }
                return converted;
            });
        },
        coreShapeColumns() {
        const u = UNIT_LABELS[this.activeUnitSystem] ?? UNIT_LABELS.si;
        const num = renderNumber(this.activeUnitSystem === 'imperial' ? 4 : 2);
        const coreShapeColumns = [
            {
                data: 'name',
                title: 'Name',
                type: 'string',
                render(data, type, row) {
                    if (type === 'filter') {
                        // Let "EFD 20" find "EFD 20/10/7" through its alias.
                        return [data, ...row.aliases].join(' ');
                    }
                    if (type === 'display') {
                        const title = row.aliases.length ? ` title="Also known as ${escapeHtml(row.aliases.join(', '))}"` : '';
                        return `<span class="shape-name"${title}>${escapeHtml(data)}</span>`;
                    }
                    return data;
                },
            },
            { data: 'familyLabel', title: 'Family', type: 'string' },
            { data: 'width', title: `Width (${u[0]})`, render: num },
            { data: 'height', title: `Height (${u[0]})`, render: num },
            { data: 'depth', title: `Depth (${u[0]})`, render: num },
            { data: 'effectiveLength', title: `Eff. Length (${u[0]})`, render: num },
            { data: 'effectiveArea', title: `Eff. Area Ae (${u[1]})`, render: num },
            { data: 'minimumArea', title: `Min. Area (${u[1]})`, render: num },
            { data: 'effectiveVolume', title: `Eff. Volume (${u[2]})`, render: num },
            { data: 'windowArea', title: `Window Area Aw (${u[1]})`, render: num },
            { data: 'areaProduct', title: `Area Product Ae·Aw (${u[3]})`, render: num },
            {
                data: null,
                title: '',
                orderable: false,
                searchable: false,
                filterable: false,
                exportable: false,
                className: 'shape-select-cell',
                defaultContent: '<span class="shape-select-btn" title="Use this shape"><i class="pi pi-arrow-right"></i></span>',
            },
        ];
        return coreShapeColumns;
        },
        /** Display label of the current family, as shown in the Family column. */
        currentFamilyLabel() {
            if (!this.shapeFamily) return null;
            const row = this.coreShapeData.find((r) => r.family === this.shapeFamily);
            return row ? row.familyLabel : null;
        },
    },
    methods: {
        /**
         * The table is created each time the dialog opens; start it filtered
         * to the family of the current shape (the user can clear the tag).
         */
        onTableMounted() {
            this.$nextTick(() => {
                const table = this.$refs.coreShapeTable;
                if (!table) return;
                table.setColumnFilter('familyLabel', this.currentFamilyLabel ? { values: [this.currentFamilyLabel] } : null);
            });
        },
        selectCoreShape(data) {
            this.$emit('update:visible', false);
            this.$emit('coreShapeSelected', data);
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
        :style="{ width: 'min(96vw, 1500px)' }"
        :pt="{ root: { class: 'shape-modal-content' } }">
        <template #header>
            <div class="d-flex align-items-center">
                <i class="pi pi-box shape-header-icon mr-3"></i>
                <h5 :data-cy="dataTestLabel + '-settingsModal-notification-text'" class="modal-title mb-0 shape-modal-title">Select Core Shape</h5>
            </div>
        </template>
        <div class="px-2 py-2 shape-table-wrapper" :data-cy="dataTestLabel + '-ShapeTable'">
            <FilterableDataTable
                ref="coreShapeTable"
                :key="activeUnitSystem"
                :data="displayRows"
                :columns="coreShapeColumns"
                :options="tableOptions"
                :columnFilters="true"
                :exportCsv="true"
                exportFileName="core_shapes"
                rowNoun="shapes"
                :dataTestLabel="dataTestLabel + '-ShapeTable'"
                @vue:mounted="onTableMounted"
                @row-click="selectCoreShape"
            />
        </div>
    </Dialog>
</template>

<style>
    .shape-table-modal {
        z-index: 9999;
    }

    .shape-modal-content {
        background-color: var(--p-dark);
        border: 1px solid var(--p-secondary);
        border-radius: 0.75rem;
        box-shadow: 0 25px 50px -12px rgba(var(--p-black-rgb), 0.5);
    }

    .shape-modal-header {
        border-bottom: 1px solid var(--p-gray-700);
        padding: 1rem 1.5rem;
    }

    .shape-modal-title {
        color: var(--p-gray-100);
        font-weight: 600;
        letter-spacing: 0.01em;
    }

    .shape-header-icon {
        color: var(--p-primary);
        font-size: 1.25rem;
    }

    /* Theme handed to the filter popovers (they live under <body>). */
    .shape-table-wrapper {
        color: var(--p-gray-100);
        --fdt-popover-bg: var(--p-dark);
        --fdt-popover-color: var(--p-gray-100);
        --fdt-popover-muted: var(--p-gray-500);
        --fdt-popover-border: var(--p-secondary);
        --fdt-popover-header-bg: var(--p-gray-800);
        --fdt-input-bg: var(--p-gray-800);
        --fdt-input-color: var(--p-gray-100);
        --fdt-input-border: var(--p-secondary);
        --fdt-accent: var(--p-primary);
        --fdt-accent-rgb: var(--p-primary-rgb);
    }

    .shape-table-wrapper .shape-select-cell {
        width: 2.5rem;
        text-align: center;
    }

    .shape-table-wrapper .shape-select-btn {
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

    .shape-table-wrapper tbody tr:hover .shape-select-btn {
        background-color: var(--p-primary);
        border-color: var(--p-primary);
        color: var(--p-white);
    }

    /* Table */
    .shape-table-wrapper table {
        color: var(--p-gray-100);
        border-collapse: separate;
        border-spacing: 0;
    }

    .shape-table-wrapper table thead th {
        color: var(--p-gray-300);
        background-color: var(--p-gray-800);
        border-bottom: 2px solid var(--p-primary);
        padding: 0.6rem 0.6rem;
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        /* Let "Eff. Volume (mm³)" wrap onto two lines instead of forcing a
         * horizontal scroll: twelve columns must fit a 1500 px dialog. */
        white-space: normal;
        vertical-align: bottom;
        line-height: 1.2;
    }

    .shape-table-wrapper table tbody td {
        color: var(--p-gray-100);
        background-color: var(--p-dark);
        border-bottom: 1px solid var(--p-gray-700);
        padding: 0.45rem 0.5rem;
        font-size: 0.85rem;
        white-space: nowrap;
        transition: background-color 0.15s;
    }

    .shape-table-wrapper table tbody tr:hover td {
        background-color: var(--p-gray-700);
    }

    /* Search input */
    .shape-table-wrapper .dt-search input {
        background-color: var(--p-gray-800) !important;
        color: var(--p-gray-100) !important;
        border: 1px solid var(--p-secondary) !important;
        border-radius: var(--p-border-radius) !important;
        padding: 0.35rem 0.75rem !important;
        font-size: 0.85rem !important;
        height: 1.75rem !important;
        outline: none !important;
        transition: border-color 0.2s, box-shadow 0.2s !important;
    }

    .shape-table-wrapper .dt-search input:focus {
        border-color: var(--p-primary) !important;
        box-shadow: 0 0 0 0.15rem rgba(var(--p-primary-rgb), 0.25) !important;
    }

    .shape-table-wrapper .dt-length select,
    .shape-table-wrapper .dt-search input {
        margin-left: 0.5rem;
        margin-right: 0.5rem;
    }

    /* Length select dropdown */
    .shape-table-wrapper .dt-length select {
        background-color: var(--p-gray-800) !important;
        color: var(--p-gray-100) !important;
        border: 1px solid var(--p-secondary) !important;
        border-radius: var(--p-border-radius) !important;
        padding: 0.25rem 0.5rem !important;
        font-size: 0.85rem !important;
        height: 1.75rem !important;
        outline: none !important;
        cursor: pointer;
        transition: border-color 0.2s, box-shadow 0.2s !important;
    }

    .shape-table-wrapper .dt-length select:focus {
        border-color: var(--p-primary) !important;
        box-shadow: 0 0 0 0.15rem rgba(var(--p-primary-rgb), 0.25) !important;
    }

    .shape-table-wrapper .dt-length select option {
        background-color: var(--p-gray-800);
        color: var(--p-gray-100);
    }

    /* Top controls - entries + search on same line */
    .shape-table-wrapper .dt-layout-row:has(.dt-length) {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        flex-wrap: nowrap !important;
        gap: 1rem;
        margin-bottom: 0.75rem;
    }

    .shape-table-wrapper .dt-layout-row:has(.dt-length) > div {
        float: none !important;
        display: flex !important;
        align-items: center !important;
        width: auto !important;
    }

    /* Labels */
    .shape-table-wrapper .dt-info,
    .shape-table-wrapper .dt-length label,
    .shape-table-wrapper .dt-search label {
        color: var(--p-gray-500) !important;
        font-size: 0.8rem;
        white-space: nowrap;
    }

    /* Pagination */
    .shape-table-wrapper .dt-paging button {
        background-color: var(--p-gray-800) !important;
        color: var(--p-gray-300) !important;
        border: 1px solid var(--p-secondary) !important;
        border-radius: var(--p-border-radius) !important;
        margin: 0 2px !important;
        padding: 0.3rem 0.65rem !important;
        font-size: 0.8rem !important;
        cursor: pointer;
        transition: all 0.15s !important;
    }

    .shape-table-wrapper .dt-paging button.current {
        background-color: var(--p-primary) !important;
        border-color: var(--p-primary) !important;
        color: var(--p-white) !important;
        font-weight: 600 !important;
    }

    .shape-table-wrapper .dt-paging button:hover {
        background-color: var(--p-gray-700) !important;
        border-color: var(--p-primary) !important;
        color: var(--p-gray-100) !important;
    }

    .shape-table-wrapper .dt-paging button.disabled {
        color: var(--p-secondary) !important;
        background-color: var(--p-dark) !important;
        border-color: var(--p-gray-700) !important;
        cursor: default !important;
        opacity: 0.5;
    }
</style>
