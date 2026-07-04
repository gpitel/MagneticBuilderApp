<script setup>
import { combinedStyle, toTitleCase, checkAndFixMas, deepCopy, range } from '/WebSharedComponents/assets/js/utils.js'
</script>

<script>

export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        sectionIndex: {
            type: Number,
            default: 0,
        },
        masStore: {
            type: Object,
            required: true,
        },
        // Also list shields (from designRequirements.shielding) after the conduction
        // sections, so per-shield settings like margins can be edited too
        includeShields: {
            type: Boolean,
            default: false,
        },
        // Optional label shown before the pills, describing what selecting one does
        // (e.g. "Margins for" in the insulation panel)
        label: {
            type: String,
            default: '',
        },
    },
    data() {

        return {
        }
    },
    computed: {
        conductiveSections() {
            const sections = [];

            if (this.masStore.mas.magnetic.coil.sectionsDescription != null) {
                this.masStore.mas.magnetic.coil.sectionsDescription.forEach((section) => {
                    if (section.type == "conduction") {
                        sections.push(section);
                    }
                })
            }
            return sections;
        },
        shieldEntries() {
            if (!this.includeShields) {
                return [];
            }
            return this.masStore.mas.inputs?.designRequirements?.shielding || [];
        },
        numberSections() {
            if (this.masStore.mas.magnetic.coil.sectionsDescription != null) {
                return this.conductiveSections.length + this.shieldEntries.length;
            }
            else {
                return this.masStore.mas.magnetic.coil.functionalDescription.length;
            }
        },
        // Positional labels matching the winding pills ("Winding 1"), with a pass number
        // appended only when interleaving splits a winding into several sections
        sectionLabels() {
            const functionalDescription = this.masStore.mas.magnetic.coil.functionalDescription || [];
            const conductionCountPerWinding = {};
            this.conductiveSections.forEach((section) => {
                const windingName = section.partialWindings[0].winding;
                conductionCountPerWinding[windingName] = (conductionCountPerWinding[windingName] || 0) + 1;
            });

            const passSoFarPerWinding = {};
            const labels = {};
            this.conductiveSections.forEach((section, key) => {
                const windingName = section.partialWindings[0].winding;
                passSoFarPerWinding[windingName] = (passSoFarPerWinding[windingName] || 0) + 1;
                const windingIndex = functionalDescription.findIndex((winding) => winding.name == windingName);
                let label = windingIndex >= 0 ? 'Winding ' + (windingIndex + 1) : windingName;
                if (conductionCountPerWinding[windingName] > 1) {
                    label += ' (' + passSoFarPerWinding[windingName] + ')';
                }
                labels[key] = label;
            })

            return labels
        },
        // Pills in physical stack order: winding sections with any shields interleaved at
        // the interface they occupy. Each entry keeps the encoded index the parents expect:
        // plain conduction index for sections, conduction count + shield index for shields
        pillEntries() {
            const sections = this.masStore.mas.magnetic.coil.sectionsDescription || [];
            const entries = [];
            const placedShields = new Set();
            let conductionIndex = 0;
            let insulationInterfaceIndex = 0;

            const functionalDescriptionForShields = this.masStore.mas.magnetic.coil.functionalDescription || [];
            const windingIndexOf = (section) =>
                functionalDescriptionForShields.findIndex((winding) => winding.name == section.partialWindings[0].winding);

            const shieldsAtInterface = (interfaceIndex, leftWinding, rightWinding) => {
                const matches = [];
                this.shieldEntries.forEach((requirement, shieldIndex) => {
                    if (placedShields.has(shieldIndex)) {
                        return;
                    }
                    if (requirement.interfaces != null && requirement.interfaces.length > 0) {
                        if (requirement.interfaces.includes(interfaceIndex)) {
                            matches.push(shieldIndex);
                        }
                    }
                    else if (requirement.betweenWindings.length == 2 &&
                             ((requirement.betweenWindings[0] == leftWinding && requirement.betweenWindings[1] == rightWinding) ||
                              (requirement.betweenWindings[0] == rightWinding && requirement.betweenWindings[1] == leftWinding))) {
                        matches.push(shieldIndex);
                    }
                });
                return matches;
            };

            for (let i = 0; i < sections.length; i++) {
                if (sections[i].type == 'conduction') {
                    entries.push({
                        encoded: conductionIndex,
                        label: this.sectionLabels[conductionIndex],
                    });
                    conductionIndex++;
                }
                else {
                    const previousSection = sections[i - 1];
                    const nextSection = i + 1 < sections.length ? sections[i + 1] : sections[0];
                    if (previousSection && previousSection.type == 'conduction' && nextSection.type == 'conduction') {
                        shieldsAtInterface(insulationInterfaceIndex,
                                           windingIndexOf(previousSection),
                                           windingIndexOf(nextSection)).forEach((shieldIndex) => {
                            placedShields.add(shieldIndex);
                            entries.push({
                                encoded: this.conductiveSections.length + shieldIndex,
                                label: this.shieldEntries[shieldIndex].name || 'Shield ' + (shieldIndex + 1),
                            });
                        });
                    }
                    insulationInterfaceIndex++;
                }
            }
            return entries;
        }
    }
}
</script>

<template>
    <div class="section-selector" ref="coilSelectorContainer">
        <div v-if="numberSections > 1" class="section-selector-row">
            <span v-if="label" class="section-selector-label">{{label}}</span>
            <img :data-cy="dataTestLabel + '-BasicCoilBuilder-loading'" v-if="masStore.mas.magnetic.coil.sectionsDescription == null" class="mx-auto d-block" alt="loading" style="width: 60%; height: auto;" :src="$settingsStore.loadingGif">
            <div v-else class="section-pills">
                <button
                    v-for="entry in pillEntries"
                    :key="entry.encoded"
                    :class="['section-pill', { active: sectionIndex === entry.encoded }]"
                    @click="$emit('sectionIndexChanged', entry.encoded)">
                    {{ entry.label }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.section-selector {
    width: 100%;
    padding: 0;
    margin-bottom: 0.75rem;
}

.section-selector-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
}

.section-selector-label {
    flex: 0 0 auto;
    font-size: 0.9rem;
    font-weight: 600;
    opacity: 0.85;
}

.section-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: center;
    background: rgba(var(--p-black-rgb), 0.25);
    padding: 0.35rem;
    border-radius: 999px;
    border: 1px solid rgba(var(--p-white-rgb), 0.06);
}

.section-pill {
    appearance: none;
    border: none;
    background: transparent;
    color: rgba(var(--p-white-rgb), 0.65);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.section-pill:hover {
    color: rgba(var(--p-white-rgb), 0.9);
    background: rgba(var(--p-white-rgb), 0.06);
}

.section-pill.active {
    background: linear-gradient(135deg, rgba(var(--p-primary-rgb), 0.9) 0%, rgba(var(--p-primary-rgb), 0.7) 100%);
    color: var(--p-white);
    box-shadow: 0 2px 8px rgba(var(--p-primary-rgb), 0.35);
}
</style>
