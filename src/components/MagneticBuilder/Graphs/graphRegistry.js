import ImpedanceOverFrequency from './ImpedanceOverFrequency.vue'
import QFactorOverFrequency from './QFactorOverFrequency.vue'
import ResistancesOverFrequency from './ResistancesOverFrequency.vue'
import WindingResistancesOverFrequency from './WindingResistancesOverFrequency.vue'
import WindingLossesOverFrequency from './WindingLossesOverFrequency.vue'
import LossesOverFrequency from './LossesOverFrequency.vue'
import CoreLossesOverFrequency from './CoreLossesOverFrequency.vue'
import MagnetizingInductanceOverFrequency from './MagnetizingInductanceOverFrequency.vue'
import MagnetizingInductanceOverTemperature from './MagnetizingInductanceOverTemperature.vue'
import MagnetizingInductanceOverDcBias from './MagnetizingInductanceOverDcBias.vue'

/**
 * The one list of builder graphs (ABT #1121).
 *
 * Every consumer reads it: the Graphs panel renders `component`, the graph
 * chooser builds its dropdown from `label`, and a layout that only has room for
 * part of the design (the wire band, the core band) asks for one `domain`.
 * Adding a graph is one entry here plus its component — no v-if chain to extend
 * in three places, which is what this replaces.
 *
 * `domain` says which part of the design the curve is about:
 *   core      — the core alone (losses, magnetizing inductance)
 *   winding   — the conductors (resistances, winding losses)
 *   magnetic  — the assembled magnetic (impedance, Q, total losses)
 *
 * `parameters` says which range inputs the graph's parameter column shows; a
 * graph without it sweeps frequency. Over-temperature and over-DC-bias graphs
 * sweep their own variable instead, and the frequency range means nothing there.
 */
export const BUILDER_GRAPHS = {
    impedanceOverFrequency: {
        label: 'Impedance Over Frequency',
        component: ImpedanceOverFrequency,
        domain: 'magnetic',
    },
    qFactorOverFrequency: {
        label: 'Q Factor Over Frequency',
        component: QFactorOverFrequency,
        domain: 'magnetic',
    },
    resistancesOverFrequency: {
        label: 'Total Resistance Over Frequency',
        component: ResistancesOverFrequency,
        domain: 'winding',
    },
    windingResistancesOverFrequency: {
        label: 'Resistances Per Winding Over Frequency',
        component: WindingResistancesOverFrequency,
        domain: 'winding',
    },
    coreLossesOverFrequency: {
        label: 'Core Losses Over Frequency',
        component: CoreLossesOverFrequency,
        domain: 'core',
    },
    windingLossesOverFrequency: {
        label: 'Winding Losses Over Frequency',
        component: WindingLossesOverFrequency,
        domain: 'winding',
    },
    lossesOverFrequency: {
        label: 'Total Losses Over Frequency',
        component: LossesOverFrequency,
        domain: 'magnetic',
    },
    magnetizingInductanceOverFrequency: {
        label: 'Magnetizing Inductance Over Frequency',
        component: MagnetizingInductanceOverFrequency,
        domain: 'core',
    },
    magnetizingInductanceOverTemperature: {
        label: 'Magnetizing Inductance Over Temperature',
        component: MagnetizingInductanceOverTemperature,
        domain: 'core',
        parameters: { frequencyDependent: false, temperatureDependent: true },
    },
    magnetizingInductanceOverDcBias: {
        label: 'Magnetizing Inductance Over DC Bias',
        component: MagnetizingInductanceOverDcBias,
        domain: 'core',
        parameters: { frequencyDependent: false, dcBiasDependent: true },
    },
};

/** The range inputs `key`'s parameter column shows (see `parameters` above). */
export function graphParameters(key) {
    const graph = BUILDER_GRAPHS[key];
    if (graph == null) {
        throw new Error(`Unknown builder graph "${key}"`);
    }
    return graph.parameters ?? { frequencyDependent: true };
}

/** The component that draws `key`, or null when the key is unknown. */
export function graphComponent(key) {
    return BUILDER_GRAPHS[key]?.component ?? null;
}

/**
 * `{key: label}` for a chooser. With no domains, every graph; otherwise only
 * those of the domains asked for, in registry order.
 */
export function graphLabels(domains = null) {
    const labels = {};
    for (const [key, graph] of Object.entries(BUILDER_GRAPHS)) {
        if (domains == null || domains.includes(graph.domain)) {
            labels[key] = graph.label;
        }
    }
    return labels;
}

/** The first graph of these domains — what a panel opens on. */
export function firstGraphOfDomains(domains) {
    const keys = Object.keys(graphLabels(domains));
    if (keys.length === 0) {
        throw new Error(`No builder graph belongs to the domains ${JSON.stringify(domains)}`);
    }
    return keys[0];
}
