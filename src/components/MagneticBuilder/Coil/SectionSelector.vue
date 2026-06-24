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
        numberSections() {
            if (this.masStore.mas.magnetic.coil.sectionsDescription != null) {
                return this.conductiveSections.length;
            }
            else {
                return this.masStore.mas.magnetic.coil.functionalDescription.length;
            }
        },
        shortenedNames() {
            const shortenedNames = {}

            let width = 0;
            if (this.$refs.coilSelectorContainer != null) {
                width = this.$refs.coilSelectorContainer.clientWidth / this.numberSections;
            }

            this.conductiveSections.forEach((section, key) => {
                let label = toTitleCase(section.name.toLowerCase());
                label = label.replace("section", "stn");
                if (width > 0) {
                    let slice = section.name.length
                    if (width < 200)
                        slice = 4;
                    if (width < 150)
                        slice = 3;
                    if (width < 100)
                        slice = 2;
                    label = label.split(' ')
                        .map(item => item.length <= slice? item + ' ' : item.slice(0, slice) + '. ')
                        .join('');
                }
                shortenedNames[key] = label;
            })

            return shortenedNames
        }
    }
}
</script>

<template>
    <div class="section-selector" ref="coilSelectorContainer">
        <div v-if="numberSections > 1" class="section-selector-row">
            <img :data-cy="dataTestLabel + '-BasicCoilBuilder-loading'" v-if="masStore.mas.magnetic.coil.sectionsDescription == null" class="mx-auto d-block" alt="loading" style="width: 60%; height: auto;" :src="$settingsStore.loadingGif">
            <div v-else class="section-pills">
                <button
                    v-for="key in range(0, numberSections)"
                    :key="key"
                    :class="['section-pill', { active: sectionIndex === key }]"
                    @click="$emit('sectionIndexChanged', key)">
                    {{ shortenedNames[key] }}
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
    justify-content: center;
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
