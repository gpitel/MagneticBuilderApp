/**
 * The prop set every builder layout takes (ABT #1121).
 *
 * A layout owns arrangement and nothing else: it receives the same design, the
 * same stores and the same feature flags whichever one is on screen, so the
 * layouts are interchangeable and one battery of tests can be run against all
 * of them. Spread it into a layout's `props`:
 *
 *     import { BUILDER_LAYOUT_PROPS } from './layoutProps.js'
 *     export default { props: { ...BUILDER_LAYOUT_PROPS } }
 *
 * and bind it from the host with `v-bind="layoutBindings"` (see
 * MagneticBuilder.vue), which keeps the caller and the contract in step — a
 * prop added here reaches every layout without touching any of them.
 */
export const BUILDER_LAYOUT_PROPS = {
    dataTestLabel: {
        type: String,
        default: '',
    },
    masStore: {
        type: Object,
        required: true,
    },
    readOnly: {
        type: Boolean,
        default: false,
    },
    isIsolatedApp: {
        type: Boolean,
        default: false,
    },
    operatingPointIndex: {
        type: Number,
        default: 0,
    },
    /** The design is complete enough to simulate and to draw. */
    magneticBuilt: {
        type: Boolean,
        default: false,
    },
    useVisualizers: {
        type: Boolean,
        default: true,
    },
    enableSimulation: {
        type: Boolean,
        default: true,
    },
    enableAutoSimulation: {
        type: Boolean,
        default: true,
    },
    enableSubmenu: {
        type: Boolean,
        default: true,
    },
    enableCustomize: {
        type: Boolean,
        default: true,
    },
    enableAdvise: {
        type: Boolean,
        default: true,
    },
    enableCoil: {
        type: Boolean,
        default: true,
    },
    enableCoilOptions: {
        type: Boolean,
        default: true,
    },
    enableGraphs: {
        type: Boolean,
        default: true,
    },
    showInterleavingOrder: {
        type: Boolean,
        default: true,
    },
    enableTemperaturePlot: {
        type: Boolean,
        default: true,
    },
};

/** Events every layout may raise. `customizeCore` opens the advanced core editor. */
export const BUILDER_LAYOUT_EMITS = ['customizeCore'];
