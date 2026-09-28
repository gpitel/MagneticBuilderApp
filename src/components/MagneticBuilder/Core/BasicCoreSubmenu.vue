<script>
export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        masStore: {
            type: Object,
        },
        enableAdvise: {
            type: Boolean,
            default: true,
        },
        enableCustomize: {
            type: Boolean,
            default: true,
        },
        enableLoad: {
            type: Boolean,
            default: false,
        },
        allowAdvise: {
            type: Boolean,
            default: true,
        },
        /** Parent decides (core gappable, turns known, target inductance present). */
        allowGapAdjust: {
            type: Boolean,
            default: false,
        },
        allowTurnsAdjust: {
            type: Boolean,
            default: false,
        },
        busy: {
            type: Boolean,
            default: false,
        },
    },
    emits: ['customizeCore', 'loadCore', 'adjustGapToInductance', 'adjustTurnsToInductance'],
    data() {
        return {
        }
    },
    computed: {
        customizationDisabled() {
            if (!this.enableCustomize) {
                return true;
            }
            if (this.masStore.mas.magnetic.core == null) {
                return true;
            }
            else if (this.masStore.mas.magnetic.core.functionalDescription.shape == '') {
                return true;
            }
            else if (this.masStore.mas.magnetic.core.functionalDescription.material == '') {
                return true;
            }

            return false;
        }
    },
    watch: { 
    },
    mounted () {
    },
    methods: {

    }
}
</script>

<template>
    <div class="mb-submenu">
        <button
            :disabled="customizationDisabled"
            :data-cy="dataTestLabel + '-Core-Customize-button'"
            class="mb-btn mb-btn-outline"
            @click="$emit('customizeCore')"
        >
            <i class="pi pi-sliders-h mr-2"></i>Customize
        </button>
        <button
            :disabled="!allowGapAdjust || busy"
            :data-cy="dataTestLabel + '-Core-GapToInductance-button'"
            class="mb-btn mb-btn-outline"
            v-tooltip="allowGapAdjust
                ? 'Set the gap so this core reaches the required magnetizing inductance with the turns you have'
                : 'Needs a gappable core (two-piece set), a primary with turns and a magnetizing inductance requirement'"
            @click="$emit('adjustGapToInductance')"
        >
            <i class="pi pi-arrows-v mr-2"></i>Gap for inductance
        </button>
        <button
            :disabled="!allowTurnsAdjust || busy"
            :data-cy="dataTestLabel + '-Core-TurnsToInductance-button'"
            class="mb-btn mb-btn-outline"
            v-tooltip="allowTurnsAdjust
                ? 'Set the number of turns so this core, with its current gap, reaches the required magnetizing inductance'
                : 'Needs a complete core and a magnetizing inductance requirement'"
            @click="$emit('adjustTurnsToInductance')"
        >
            <i class="pi pi-replay mr-2"></i>Turns for inductance
        </button>
    </div>
</template>

<style scoped>
.mb-submenu {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 2px 4px;
    margin-bottom: 0 !important;
}

.mb-btn {
    flex: 1 1 auto;
    min-width: fit-content;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    border: 1px solid transparent;
    transition: filter 0.15s, box-shadow 0.2s, transform 0.1s, background 0.15s, color 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mb-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.mb-btn:not(:disabled):hover {
    filter: brightness(1.12);
    transform: translateY(-1px);
}

/* PRIMARY — advise: bold, glowing, unmistakable */
.mb-btn-primary {
    background: linear-gradient(135deg,
        color-mix(in srgb, var(--p-primary) 115%, transparent 0%) 0%,
        var(--p-primary) 55%,
        rgba(var(--p-primary-rgb), 0.85) 100%);
    color: var(--p-white);
    border: 2px solid color-mix(in srgb, var(--p-primary) 70%, var(--p-white) 30%);
    box-shadow:
        0 0 0 2px rgba(var(--p-primary-rgb), 0.35),
        0 4px 14px rgba(var(--p-primary-rgb), 0.5),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
    text-shadow: 0 1px 2px rgba(var(--p-black-rgb), 0.25);
}

.mb-btn-primary:not(:disabled):hover {
    box-shadow:
        0 0 0 2px rgba(var(--p-primary-rgb), 0.35),
        0 6px 20px rgba(var(--p-primary-rgb), 0.6),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
}

/* OUTLINE — strong tinted bg, clear border */
.mb-btn-outline {
    background: rgba(var(--p-primary-rgb), 0.2);
    border: 1px solid rgba(var(--p-primary-rgb), 0.55);
    color: var(--p-primary);
    box-shadow: 0 2px 6px rgba(var(--p-black-rgb), 0.2);
}

.mb-btn-outline:not(:disabled):hover {
    background: rgba(var(--p-primary-rgb), 0.3);
    border-color: rgba(var(--p-primary-rgb), 0.75);
    box-shadow: 0 3px 10px rgba(var(--p-primary-rgb), 0.25);
}

/* GHOST — still visible, lighter weight */
.mb-btn-ghost {
    background: rgba(var(--p-white-rgb), 0.08);
    border: 1px solid rgba(var(--p-white-rgb), 0.28);
    color: var(--p-white);
    box-shadow: 0 2px 6px rgba(var(--p-black-rgb), 0.2);
}

.mb-btn-ghost:not(:disabled):hover {
    background: rgba(var(--p-white-rgb), 0.14);
    border-color: rgba(var(--p-white-rgb), 0.4);
}
</style>
