import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Winding Studio session state (feature branch; removable with the
// WindingStudio/ folder). Hand-drawn ("pinned") section rectangles ride every
// wind call and are re-imposed by the engine after compaction, so a drawn
// section survives subsequent re-winds. Deliberately NOT persisted: section
// names like "Primary section 0" repeat across designs, and a stale pin from
// another magnetic must never apply to this one.
export const useWindingStudioStore = defineStore("windingStudio", () => {
    // sectionName -> { coordinates, dimensions, windowShape }. Coordinates and
    // dimensions follow the winding window the rect was drawn on: cartesian
    // meters for rectangular windows, [radial m, angle deg] polar for round
    // (toroidal) ones. windowShape records which, so a pin drawn on one window
    // geometry is never re-imposed on another (meters reinterpreted as degrees
    // shrank a section to 0.005deg once — the E-to-T corruption).
    const customSectionRects = ref({});
    // Engine delimit/compact pass on wind. Drawn sections are immune either
    // way; this switches it for the rest of the coil.
    const compactEnabled = ref(true);

    const customSectionCount = computed(() => Object.keys(customSectionRects.value).length);

    // Winding-style overrides: winding name -> 'windByConsecutiveParallels'
    // (multifilar bundle) or 'windByConsecutiveTurns' (each parallel wound
    // separately). Rides the wind call as _windingStyle; absent = engine
    // heuristic decides. Not persisted, same reasoning as the pins.
    const windingStyleOverrides = ref({});

    function setWindingStyleOverride(windingName, style) {
        if (style == null) {
            const { [windingName]: dropped, ...kept } = windingStyleOverrides.value;
            windingStyleOverrides.value = kept;
        }
        else {
            windingStyleOverrides.value = { ...windingStyleOverrides.value, [windingName]: style };
        }
    }

    function setCustomSectionRect(sectionName, rect) {
        customSectionRects.value = { ...customSectionRects.value, [sectionName]: rect };
    }

    function clearCustomSectionRects() {
        customSectionRects.value = {};
    }

    // A winding moved to another leg invalidates its drawn rectangles
    // (section names are "<winding> section <n>").
    function clearCustomSectionRectsForWinding(windingName) {
        const kept = {};
        for (const [sectionName, rect] of Object.entries(customSectionRects.value)) {
            if (!sectionName.startsWith(windingName + " ")) {
                kept[sectionName] = rect;
            }
        }
        customSectionRects.value = kept;
    }

    return {
        customSectionRects,
        compactEnabled,
        customSectionCount,
        setCustomSectionRect,
        clearCustomSectionRects,
        clearCustomSectionRectsForWinding,
        windingStyleOverrides,
        setWindingStyleOverride,
    }
})
