import { defineStore } from 'pinia'
import { ref  } from 'vue'
import { deepCopy  } from '/WebSharedComponents/assets/js/utils.js'

export const useHistoryStore = defineStore("history", () => {
    const masHistory = ref([]);
    const historyPointer = ref(-1);
    let blockingRebounds = false;
    let blockingAdditions = false;
    let reboundsTimer = null;
    let additionsTimer = null;
    // ABT #1084: two kinds of block. An INDEFINITE one (mount, import) only
    // says "the design is still being assembled"; the settle recorder in
    // MagneticBuilder.vue lifts it once the store has been quiet. A TIMED one
    // (after undo/redo, 2 s) protects the redo stack from the rebound of the
    // restored state being re-processed, and must never be lifted early.
    let blockedIndefinitely = false;
    let lastAddedAt = 0;

    function blockAdditions(durationMs) {
        blockingAdditions = true;
        if (additionsTimer) clearTimeout(additionsTimer);
        if (durationMs != null && durationMs > 0) {
            blockedIndefinitely = false;
            additionsTimer = setTimeout(() => {
                blockingAdditions = false;
                additionsTimer = null;
            }, durationMs);
        }
        else {
            blockedIndefinitely = true;
        }
    }

    function unblockAdditions() {
        blockingAdditions = false;
        blockedIndefinitely = false;
        if (additionsTimer) {
            clearTimeout(additionsTimer);
            additionsTimer = null;
        }
    }

    function isBlockedIndefinitely() {
        return blockingAdditions && blockedIndefinitely;
    }

    function isBlockedTimed() {
        return blockingAdditions && !blockedIndefinitely;
    }

    // History is a list of DESIGN states: outputs (simulation results written
    // back into the mas) never make a new entry on their own.
    function designSignature(mas) {
        return JSON.stringify({ inputs: mas.inputs, magnetic: mas.magnetic });
    }

    // Gesture coalescing: successive states from ONE user gesture (a winding-
    // studio drag re-winding several times, a placement flip-flop) collapse
    // into a single undo step. Callers pass a stable gestureKey; consecutive
    // adds with the same key within the window REPLACE the last entry, so
    // back() lands on the pre-gesture state in one step.
    const GESTURE_COALESCE_WINDOW_MS = 5000;
    let lastGestureKey = null;
    let lastGestureTime = 0;

    /**
     * @param mas            state to record (deep-copied)
     * @param gestureKey     consecutive adds with the same key within the
     *                       window replace the head entry (see above)
     * @param options.coalesceIfAddedAfter  replace the head entry if it was
     *                       added at/after this timestamp (ms), whatever its
     *                       key — the settle recorder passes the start of the
     *                       current burst so the fully settled state of one
     *                       burst (shape change → autocomplete → bobbin →
     *                       wind) is ONE undo step, not two, while an entry
     *                       from an earlier burst is never touched
     */
    function addToHistory(mas, gestureKey = null, options = {}) {
        if (blockingRebounds) {
            return
        }
        if (blockingAdditions) {
            return
        }
        // A state whose DESIGN is identical to the current entry is a rebound
        // echo (e.g. the mas watcher firing after back()/forward() restored
        // it) or a simulation writing its outputs, not an edit.
        if (this.historyPointer >= 0 &&
            designSignature(this.masHistory[this.historyPointer]) === designSignature(mas)) {
            return
        }
        const now = Date.now();
        const atHead = this.historyPointer === this.masHistory.length - 1;
        const coalesceByGesture = gestureKey != null
            && gestureKey === lastGestureKey
            && now - lastGestureTime < GESTURE_COALESCE_WINDOW_MS
            && this.historyPointer >= 1
            && atHead;
        const coalesceByTime = options.coalesceIfAddedAfter != null
            && this.historyPointer >= 0
            && atHead
            && lastAddedAt >= options.coalesceIfAddedAfter;
        const coalesce = coalesceByGesture || coalesceByTime;
        lastGestureKey = gestureKey;
        lastGestureTime = now;
        lastAddedAt = now;
        if (coalesce) {
            this.masHistory[this.historyPointer] = deepCopy(mas);
        }
        else {
            // Discard any redo entries beyond the current pointer
            if (this.historyPointer < this.masHistory.length - 1) {
                this.masHistory.length = this.historyPointer + 1;
            }
            this.masHistory.push(deepCopy(mas));
            this.historyPointer = this.masHistory.length - 1;
        }
        blockingRebounds = true;
        if (reboundsTimer) clearTimeout(reboundsTimer);
        reboundsTimer = setTimeout(() => {
            blockingRebounds = false;
            reboundsTimer = null;
        }, 100);
    }

    function reset() {
        this.historyPointer = -1;
        this.masHistory = [];
        blockingRebounds = false;
        blockingAdditions = false;
        blockedIndefinitely = false;
        lastAddedAt = 0;
        lastGestureKey = null;
        lastGestureTime = 0;
        if (reboundsTimer) clearTimeout(reboundsTimer);
        if (additionsTimer) clearTimeout(additionsTimer);
        reboundsTimer = null;
        additionsTimer = null;
    }

    function back() {
        // Navigating breaks any gesture chain: the next edit must be a NEW step.
        lastGestureKey = null;
        if (this.historyPointer > 0) {
            this.historyPointer -= 1;
        }
        blockingRebounds = true;
        if (reboundsTimer) clearTimeout(reboundsTimer);
        reboundsTimer = setTimeout(() => {
            blockingRebounds = false;
            reboundsTimer = null;
        }, 100);
        return deepCopy(this.masHistory[this.historyPointer]);
    }

    function forward() {
        lastGestureKey = null;
        if (this.historyPointer < this.masHistory.length - 1) {
            this.historyPointer += 1;
        }
        blockingRebounds = true;
        if (reboundsTimer) clearTimeout(reboundsTimer);
        reboundsTimer = setTimeout(() => {
            blockingRebounds = false;
            reboundsTimer = null;
        }, 100);
        return deepCopy(this.masHistory[this.historyPointer]);
    }

    function isBackPossible() {
        return this.historyPointer > 0;
    }

    function isForwardPossible() {
        return this.historyPointer < this.masHistory.length - 1;
    }

    function getCurrent() {
        if (this.masHistory.length == 0) {
            return null;
        }
        else {
            return deepCopy(this.masHistory[this.historyPointer]);
        }
    }

    function historyPointerUpdated() {
    }

    return {
        masHistory,
        historyPointer,
        addToHistory,
        reset,
        back,
        forward,
        isBackPossible,
        isForwardPossible,
        getCurrent,
        historyPointerUpdated,
        blockAdditions,
        unblockAdditions,
        isBlockedIndefinitely,
        isBlockedTimed,
    }
},
{
    persist: false,
})
