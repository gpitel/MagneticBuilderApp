<script>
export default {
    emits: ['customizeCore'],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        enableCustomize: {
            type: Boolean,
            default: true,
        },
    },
}
</script>

<template>
    <div v-if="enableCustomize" class="mb-submenu">
        <button
            :data-cy="dataTestLabel + 'wire-Customize-button'"
            class="mb-btn mb-btn-outline"
            @click="$emit('customizeCore')"
        >
            <i class="pi pi-sliders-h mr-2"></i>Customize
        </button>
    </div>
</template>

<style scoped>
.mb-submenu {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 4px 6px;
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

.mb-btn-primary {
    background: linear-gradient(135deg,
        color-mix(in srgb, var(--p-primary) 115%, transparent 0%) 0%,
        var(--p-primary) 55%,
        rgb(var(--p-primary-rgb) / 0.85) 100%);
    color: var(--p-white);
    border: 2px solid color-mix(in srgb, var(--p-primary) 70%, var(--p-white) 30%);
    box-shadow:
        0 0 0 2px rgb(var(--p-primary-rgb) / 0.35),
        0 4px 14px rgb(var(--p-primary-rgb) / 0.5),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
    text-shadow: 0 1px 2px rgba(var(--p-black-rgb), 0.25);
}

.mb-btn-primary:not(:disabled):hover {
    box-shadow:
        0 0 0 2px rgb(var(--p-primary-rgb) / 0.35),
        0 6px 20px rgb(var(--p-primary-rgb) / 0.6),
        inset 0 1px 0 rgba(var(--p-white-rgb), 0.3);
}

.mb-btn-outline {
    background: rgb(var(--p-primary-rgb) / 0.2);
    border: 1px solid rgb(var(--p-primary-rgb) / 0.55);
    color: var(--p-primary);
    box-shadow: 0 2px 6px rgba(var(--p-black-rgb), 0.2);
}

.mb-btn-outline:not(:disabled):hover {
    background: rgb(var(--p-primary-rgb) / 0.3);
    border-color: rgb(var(--p-primary-rgb) / 0.75);
    box-shadow: 0 3px 10px rgb(var(--p-primary-rgb) / 0.25);
}

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
