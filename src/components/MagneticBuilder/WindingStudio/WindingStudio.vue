<script setup>
// Winding Studio — interactive cross-section rendered in Vue SVG straight from
// the MAS descriptions the WASM winder computed (sections/layers/turns carry
// coordinates + dimensions). Unlike Magnetic2DVisualizer (which embeds the C++
// Painter's finished SVG), every element here is a live DOM node with identity,
// so it can be hovered, selected and — in later phases — dragged.
//
// P0 scope: read-only parity view + hover/selection + color-by-winding.
// Gated by magneticBuilderSettings.enableWindingStudio.
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { buildStudioModel, buildConnectionViews, windingColor, annularSectorPath, woundDistanceToAngleDeg, wiresEqual } from './geometry.js';
import { waitForMkf } from '/WebSharedComponents/assets/js/mkfRuntime';

const props = defineProps({
    dataTestLabel: {
        type: String,
        default: '',
    },
    masStore: {
        type: Object,
        required: true,
    },
    // P1: winding chips become drag sources and the core legs drop targets;
    // dropping emits placeWinding({winding, columnIndex}) for the host to
    // execute through the WASM winder. Off = P0 read-only view.
    editable: {
        type: Boolean,
        default: false,
    },
    busy: {
        type: Boolean,
        default: false,
    },
    // Number of pinned (hand-drawn) section rectangles the host keeps; shows
    // the "custom layout (N) ✕" chip whose click emits clearCustomRects.
    customCount: {
        type: Number,
        default: 0,
    },
    // Compact pass on/off (emits update:compact). Toggle hidden unless the
    // host opts in — drawn sections are immune to compaction either way.
    showCompactToggle: {
        type: Boolean,
        default: false,
    },
    compact: {
        type: Boolean,
        default: true,
    },
    ferriteColor: {
        type: String,
        default: '#7b7c7d',
    },
    bobbinColor: {
        type: String,
        // The painter's default (Settings::_painterColorBobbin) — the previous
        // near-black default was invisible against the dark window.
        default: '#539796',
    },
    copperColor: {
        type: String,
        default: '#b87333',
    },
    insulationColor: {
        type: String,
        default: '#fff05b',
    },
    marginColor: {
        type: String,
        default: '#fff05b',
    },
    backgroundColor: {
        type: String,
        default: 'transparent',
    },
    textColor: {
        type: String,
        default: '#ffffff',
    },
    // Painter plot_magnetic_field SVG (whole document) computed by the host on
    // 'requestFieldOverlay'; null while unavailable/computing. Rendered as a
    // pointer-events:none background layer aligned via the painter's px scale.
    fieldOverlay: {
        type: String,
        default: null,
    },
    // Active winding-style overrides (winding name → windByConsecutive*),
    // kept by the host; shown as the current choice in the section menu.
    windingStyleOverrides: {
        type: Object,
        default: () => ({}),
    },
});

const emit = defineEmits(['sectionSelected', 'turnSelected', 'placeWinding', 'resizeProportions', 'resizeMargins', 'resizeSectionRect', 'clearCustomRects', 'update:compact', 'interleaveWinding', 'requestFieldOverlay', 'setWindowLayout', 'setSectionLayout', 'autoFit', 'setWindingGroups']);

function cssColor(color) {
    // Style-store colors arrive as '0xRRGGBB'; SVG wants '#RRGGBB'.
    if (typeof color === 'string' && color.startsWith('0x')) {
        return '#' + color.slice(2);
    }
    return color;
}

const model = computed(() => buildStudioModel(props.masStore.mas?.magnetic));

// ABT #849 (Alf, 2026-08-22): CONNECTIONS — terminals and the links between layers/sections.
// Unlike everything else in this component, they are NOT in the MAS: MKF derives them from the
// wound coil (Coil::get_connection_reserved_spaces), and putting them in the MAS would only let
// them go stale. So they arrive through one WASM call, get_connection_layout, and are rendered
// from that. The call also reports whether MKF actually APPLIED the connection blocking; when it
// did not, the markers are drawn dashed exactly as the C++ painter does, because an undisplaced
// layout must never look like a real one.
const showConnections = ref(true);
const connectionLayout = ref(null);
const connectionsPending = ref(false);
let connectionRequestId = 0;

async function fetchConnectionLayout() {
    const magnetic = props.masStore.mas?.magnetic;
    if (magnetic == null || !showConnections.value) {
        connectionLayout.value = null;
        return;
    }
    // Last request wins: the MAS changes on every edit and these calls are not instant.
    const requestId = ++connectionRequestId;
    connectionsPending.value = true;
    try {
        const mkf = await waitForMkf();
        const raw = await mkf.get_connection_layout(JSON.stringify(magnetic));
        if (requestId !== connectionRequestId) return;   // superseded
        connectionLayout.value = JSON.parse(raw);
    }
    catch (error) {
        if (requestId !== connectionRequestId) return;
        // Surfaced, not swallowed: no connections is a legitimate state (ideal winding), a failed
        // call is not, and silently drawing nothing would look identical to both.
        console.error('WindingStudio: get_connection_layout failed', error);
        connectionLayout.value = { error: String(error) };
    }
    finally {
        if (requestId === connectionRequestId) connectionsPending.value = false;
    }
}

const connections = computed(() => buildConnectionViews(connectionLayout.value));

watch(
    () => [props.masStore.mas?.magnetic, showConnections.value],
    () => { fetchConnectionLayout(); },
    { deep: true, immediate: true },
);

// The painter's own two colours (PainterImpl paint_coil_connections): blue for a transition
// between layers/sections, magenta for a terminal lead.
function connectionFill(marker) {
    return marker.isTerminal ? '#FF00FF' : '#1E88E5';
}
function connectionTitle(marker) {
    const ends = marker.toTurn ? `${marker.fromTurn} \u2192 ${marker.toTurn}` : marker.fromTurn;
    const length = marker.routedLength != null ? ` — ${(marker.routedLength * 1000).toFixed(2)} mm` : '';
    return `${marker.winding} parallel ${marker.parallel} · ${marker.kind}\n${ends}${length}`;
}

const colorByWinding = ref(true);
// Maximized mode: the SAME component instance teleports to <body> as a
// full-screen modal (no remount — selection/drag state survives).
const maximized = ref(false);
function onKeydown(event) {
    if (event.key === 'Escape' && maximized.value) {
        maximized.value = false;
    }
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
const hoveredWinding = ref(null);
const hoveredTurn = ref(null);
const selectedSection = ref(null);
const tooltip = ref(null); // {x, y, lines}

const viewBox = computed(() => {
    const bounds = model.value.bounds;
    return `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;
});

// Core silhouette as one even-odd path: outer rectangle minus window cavities
// for concentric cores; the ring (top view) for toroids.
const corePath = computed(() => {
    const core = model.value.core;
    if (model.value.kind === 'toroidal') {
        return annularSectorPath(core.ring.innerRadius, core.ring.outerRadius, 0, 360);
    }
    const rectPath = (r) => `M ${r.x} ${r.y} h ${r.width} v ${r.height} h ${-r.width} Z`;
    return [rectPath(core.outer), ...core.cavities.map(rectPath)].join(' ');
});

function turnFill(turn) {
    if (!colorByWinding.value) {
        return cssColor(props.copperColor);
    }
    return windingColor(model.value.windingNames, turn.winding);
}

function turnOpacity(turn) {
    if (hoveredWinding.value != null && turn.winding !== hoveredWinding.value) {
        return 0.25;
    }
    if (fieldImage.value != null && hoveredWinding.value == null) {
        // Field overlay active: the painter image carries the visible turns;
        // the studio glyphs stay as near-invisible interaction targets.
        return turn.isReturn ? 0.08 : 0.12;
    }
    // Return crossings keep near-full opacity but render through the shadow
    // filter (darker) — the passive far side of the winding.
    return turn.isReturn ? 0.85 : 1.0;
}

function marginRects(section) {
    // Painter-exact (paint_two_piece_set_margin): the WINDOW-level
    // sectionsOrientation decides the margin axis — overlapping sections
    // (radially stacked) carry top/bottom margins, contiguous sections
    // left/right — and the tape is anchored AT the window wall with its true
    // margin length. margin = [topOrLeft, bottomOrRight] in meters.
    if (section.margin == null || section.type !== 'conduction' || model.value.kind === 'toroidal') {
        // Toroidal margins are angular spacer wedges — not drawn yet.
        return [];
    }
    const window = model.value.windows.find((w) => w.index === section.windingWindow) ?? model.value.windows[0];
    if (window == null) {
        return [];
    }
    const rects = [];
    const [before, after] = section.margin;
    const overlapping = (window.sectionsOrientation ?? 'overlapping') !== 'contiguous';
    if (before > 0) {
        rects.push(overlapping
            ? { x: section.rect.x, y: window.rect.y, width: section.rect.width, height: before * MARGIN_MM }
            : { x: window.rect.x, y: section.rect.y, width: before * MARGIN_MM, height: section.rect.height });
    }
    if (after > 0) {
        rects.push(overlapping
            ? { x: section.rect.x, y: window.rect.y + window.rect.height - after * MARGIN_MM, width: section.rect.width, height: after * MARGIN_MM }
            : { x: window.rect.x + window.rect.width - after * MARGIN_MM, y: section.rect.y, width: after * MARGIN_MM, height: section.rect.height });
    }
    // Clamp to the window so pathological margins never spill onto the core.
    return rects
        .map((rect) => {
            const x0 = Math.max(rect.x, window.rect.x);
            const y0 = Math.max(rect.y, window.rect.y);
            const x1 = Math.min(rect.x + rect.width, window.rect.x + window.rect.width);
            const y1 = Math.min(rect.y + rect.height, window.rect.y + window.rect.height);
            return x1 - x0 > 1e-6 && y1 - y0 > 1e-6
                ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
                : null;
        })
        .filter(Boolean);
}

// Litz bundle icon: a center strand plus a ring of six, scaled to the glyph.
function litzStrands(turn) {
    const radius = turn.rect.width / 2;
    const cx = turn.rect.x + radius;
    const cy = turn.rect.y + turn.rect.height / 2;
    const strands = [{ cx, cy, r: radius * 0.2 }];
    for (let k = 0; k < 6; k++) {
        const angle = (k * Math.PI) / 3;
        strands.push({
            cx: cx + Math.cos(angle) * radius * 0.52,
            cy: cy + Math.sin(angle) * radius * 0.52,
            r: radius * 0.2,
        });
    }
    return strands;
}

function onTurnEnter(turn, event) {
    hoveredTurn.value = turn.name;
    hoveredWinding.value = turn.winding;
    const lines = [turn.name + (turn.isReturn ? ' (return crossing)' : '')];
    if (turn.layer != null) {
        lines.push(turn.layer);
    }
    moveTooltip(event, lines);
}

function onTurnLeave() {
    hoveredTurn.value = null;
    hoveredWinding.value = null;
    tooltip.value = null;
}

function onSectionClick(section) {
    selectedSection.value = selectedSection.value === section.name ? null : section.name;
    emit('sectionSelected', selectedSection.value);
}

function onTurnClick(turn) {
    emit('turnSelected', turn.name);
    // Clicking a turn also toggles its section's selection — turns are the
    // topmost hit layer, so this is what makes "click a section" work anywhere.
    const section = model.value.sections.find((candidate) => candidate.name === turn.section);
    if (section != null) {
        onSectionClick(section);
    }
}

function onSectionEnter(section, event) {
    if (hoveredTurn.value != null) {
        return;
    }
    const lines = [section.name];
    if (section.fillingFactor != null) {
        lines.push(`filling factor ${(section.fillingFactor * 100).toFixed(1)} %`);
    }
    if (section.windingWindow != null) {
        lines.push(`winding window ${section.windingWindow}`);
    }
    moveTooltip(event, lines);
}

function moveTooltip(event, lines) {
    const container = event.currentTarget.closest('.winding-studio-plot');
    const containerBounds = container.getBoundingClientRect();
    tooltip.value = {
        x: event.clientX - containerBounds.left + 12,
        y: event.clientY - containerBounds.top + 12,
        lines,
    };
}

function legendHover(windingName) {
    hoveredWinding.value = windingName;
}

function legendLeave() {
    hoveredWinding.value = null;
}

// P1 fit indicator — pure DISPLAY geometry on the winder's output (section /
// turn containment in their windows + the winder's own fillingFactor). No
// physics is recomputed here; the winder remains the authority and throws on
// truly unwindable inputs.
const fitStatus = computed(() => {
    const m = model.value;
    if (!m.valid || m.sections.length === 0) {
        return null;
    }
    if (m.kind === 'toroidal') {
        // Own turn crossings must stay inside the window hole; returns
        // legitimately ride outside the ring.
        let worstFill = 0;
        let overflow = false;
        for (const section of m.sections) {
            if (section.type === 'conduction' && section.fillingFactor != null) {
                worstFill = Math.max(worstFill, section.fillingFactor);
            }
        }
        for (const turn of m.turns) {
            if (turn.isReturn) {
                continue;
            }
            const cx = turn.rect.x + turn.rect.width / 2;
            const cy = turn.rect.y + turn.rect.height / 2;
            if (Math.hypot(cx, cy) + turn.rect.width / 2 > m.windowRadius + 1e-3) {
                overflow = true;
            }
        }
        if (worstFill > 1) {
            overflow = true;
        }
        return { overflow, worstFill };
    }
    if (m.windows.length === 0) {
        return null;
    }
    const eps = 1e-3; // mm
    const within = (r, w) =>
        r.x >= w.x - eps && r.y >= w.y - eps
        && r.x + r.width <= w.x + w.width + eps
        && r.y + r.height <= w.y + w.height + eps;
    const windowFor = (index) => m.windows.find((w) => w.index === index) ?? m.windows[0];
    let worstFill = 0;
    let overflow = false;
    for (const section of m.sections) {
        if (section.type !== 'conduction') {
            continue;
        }
        if (section.fillingFactor != null) {
            worstFill = Math.max(worstFill, section.fillingFactor);
        }
        if (!within(section.rect, windowFor(section.windingWindow).rect)) {
            overflow = true;
        }
    }
    for (const turn of m.turns) {
        // Return crossings legitimately sit outside the windows (even outside
        // the core for lateral-leg loops); only own crossings must fit.
        if (!turn.isReturn && !m.windows.some((w) => within(turn.rect, w.rect))) {
            overflow = true;
        }
    }
    if (worstFill > 1) {
        overflow = true;
    }
    return { overflow, worstFill };
});

// ---------------------------------------------------------------------------
// P1: drag a winding chip onto a core leg
// ---------------------------------------------------------------------------

const drag = ref(null); // {winding, color, x, y} in client coords
const dropColumn = ref(null); // column index under the pointer
const dropWinding = ref(null); // OTHER winding under the pointer (interleave target)
const plotEl = ref(null);
// {source, target, x, y} — the {interleave, swap, clear} menu after a
// chip-on-winding drop (PI Expert's gesture). Plot-relative coords.
const interleaveMenu = ref(null);

function startChipDrag(windingName, event) {
    if (!props.editable || props.busy) {
        return;
    }
    // No preventDefault: the chips set touch-action: none, and preventing here
    // trips Chrome's passive-listener warning.
    event.currentTarget.setPointerCapture(event.pointerId);
    interleaveMenu.value = null;
    drag.value = {
        winding: windingName,
        color: windingColor(model.value.windingNames, windingName),
        x: event.clientX,
        y: event.clientY,
    };
    dropColumn.value = null;
    dropWinding.value = null;
}

function moveChipDrag(event) {
    if (drag.value == null) {
        return;
    }
    drag.value.x = event.clientX;
    drag.value.y = event.clientY;
    // The chip holds pointer capture, so hit-test geometrically. Leg slots
    // (only rendered mid-drag) take priority; otherwise a turn/section of a
    // DIFFERENT winding is an interleave target.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const slot = under?.closest?.('[data-studio-column]');
    dropColumn.value = slot != null ? Number(slot.getAttribute('data-studio-column')) : null;
    if (dropColumn.value != null) {
        dropWinding.value = null;
        return;
    }
    const windingTarget = under?.closest?.('[data-studio-winding]')?.getAttribute('data-studio-winding') ?? null;
    dropWinding.value = windingTarget != null && windingTarget !== drag.value.winding ? windingTarget : null;
}

function endChipDrag() {
    if (drag.value == null) {
        return;
    }
    const placement = dropColumn.value;
    const target = dropWinding.value;
    const windingName = drag.value.winding;
    const dropX = drag.value.x;
    const dropY = drag.value.y;
    drag.value = null;
    dropColumn.value = null;
    dropWinding.value = null;
    if (placement != null) {
        emit('placeWinding', { winding: windingName, columnIndex: placement });
        return;
    }
    if (target != null) {
        const plotBounds = plotEl.value?.getBoundingClientRect();
        interleaveMenu.value = {
            source: windingName,
            target,
            x: plotBounds != null ? Math.max(0, Math.min(dropX - plotBounds.left, plotBounds.width - 180)) : 0,
            y: plotBounds != null ? Math.max(0, dropY - plotBounds.top) : 0,
        };
    }
}

function pickInterleaveAction(mode) {
    const menu = interleaveMenu.value;
    interleaveMenu.value = null;
    if (menu == null) {
        return;
    }
    emit('interleaveWinding', { source: menu.source, target: menu.target, mode });
}

// N-filar grouping state for the interleave menu: are the two windings
// already marked as wound together (bifilar)?
function windingsAreGrouped(sourceName, targetName) {
    const meta = model.value.windings?.find((winding) => winding.name === sourceName);
    return meta != null && meta.woundWith.includes(targetName);
}

// The engine's grouping constraints (it throws loudly on violation): windings
// wound together must share parallels and wire. Pre-checked here so the menu
// can explain WHY instead of failing the wind. Isolation side is NOT a
// blocker: winding two windings together means there is no barrier between
// them, so grouping JOINS their isolation sides (the host unifies them).
function groupingBlockReason(sourceName, targetName) {
    const source = model.value.windings?.find((winding) => winding.name === sourceName);
    const target = model.value.windings?.find((winding) => winding.name === targetName);
    if (source == null || target == null) {
        return 'winding not found';
    }
    if (source.numberParallels !== target.numberParallels) {
        return 'needs the same number of parallels on both windings';
    }
    if (!wiresEqual(source.wire, target.wire)) {
        return 'needs the same wire on both windings';
    }
    return null;
}

// ---------------------------------------------------------------------------
// P3: field-map overlay — the painter's plot_magnetic_field SVG as an aligned,
// pointer-events:none background layer. The painter draws at a fixed px scale
// (Constants coilPainterScale = 30000 px/m = 30 px/mm) with the same center
// and y convention as the studio, so its viewBox maps to studio mm by /30.
// ---------------------------------------------------------------------------

const PAINTER_PX_PER_MM = 30;
const showField = ref(false);
let fieldTimer = null;

const fieldImage = computed(() => {
    if (!showField.value || props.fieldOverlay == null) {
        return null;
    }
    const match = props.fieldOverlay.match(/viewBox="([^"]+)"/);
    if (match == null) {
        return null;
    }
    const [x, y, width, height] = match[1].trim().split(/\s+/).map(Number);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        return null;
    }
    return {
        href: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(props.fieldOverlay))),
        x: x / PAINTER_PX_PER_MM,
        y: y / PAINTER_PX_PER_MM,
        width: width / PAINTER_PX_PER_MM,
        height: height / PAINTER_PX_PER_MM,
    };
});

// Request (and re-request after every re-wind) while the overlay is visible.
watch(() => (showField.value ? model.value : null), (current) => {
    if (current == null) {
        return;
    }
    if (fieldTimer) {
        clearTimeout(fieldTimer);
    }
    fieldTimer = setTimeout(() => emit('requestFieldOverlay'), 400);
});
onBeforeUnmount(() => {
    if (fieldTimer) {
        clearTimeout(fieldTimer);
    }
});

// ---------------------------------------------------------------------------
// P3: toroidal margin wedges — the angular spacers (contiguous layouts) or
// radial bands (overlapping) the margins occupy, mirrored from the painter's
// paint_toroidal_margin geometry (margin = wound distance, chord convention).
// ---------------------------------------------------------------------------

function toroidalMarginWedges(section) {
    if (model.value.kind !== 'toroidal' || section.type !== 'conduction'
        || section.margin == null || section.polar == null) {
        return [];
    }
    const [before, after] = section.margin;
    const polar = section.polar;
    const rIn = Math.max(0, polar.rCenter - polar.rBand / 2);
    const rOut = polar.rCenter + polar.rBand / 2;
    const a0 = polar.thetaCenter - polar.thetaSpan / 2;
    const a1 = polar.thetaCenter + polar.thetaSpan / 2;
    const wedges = [];
    if ((model.value.sectionsOrientation ?? 'contiguous') === 'overlapping') {
        if (before > 0) {
            wedges.push(annularSectorPath(rOut, rOut + before * MARGIN_MM, a0, a1));
        }
        if (after > 0) {
            wedges.push(annularSectorPath(Math.max(0, rIn - after * MARGIN_MM), rIn, a0, a1));
        }
    }
    else {
        const beforeAngle = before > 0 ? woundDistanceToAngleDeg(before * MARGIN_MM, polar.rCenter) : null;
        const afterAngle = after > 0 ? woundDistanceToAngleDeg(after * MARGIN_MM, polar.rCenter) : null;
        if (beforeAngle != null && beforeAngle > 0.01) {
            wedges.push(annularSectorPath(rIn, rOut, a0 - beforeAngle, a0));
        }
        if (afterAngle != null && afterAngle > 0.01) {
            wedges.push(annularSectorPath(rIn, rOut, a1, a1 + afterAngle));
        }
    }
    return wedges;
}

// ---------------------------------------------------------------------------
// P3: drag the angular boundary between two adjacent toroidal sectors to
// re-distribute the per-winding proportions (the concentric boundary drag's
// polar sibling).
// ---------------------------------------------------------------------------

const sectorBoundaries = computed(() => {
    if (!props.editable || !model.value.valid || model.value.kind !== 'toroidal') {
        return [];
    }
    const conduction = model.value.sections
        .filter((section) => section.type === 'conduction' && section.polar != null)
        .sort((a, b) => (a.polar.thetaCenter - a.polar.thetaSpan / 2) - (b.polar.thetaCenter - b.polar.thetaSpan / 2));
    const boundaries = [];
    for (let i = 0; i + 1 < conduction.length; i++) {
        const left = conduction[i];
        const right = conduction[i + 1];
        if (left.windings.join() === right.windings.join()) {
            continue;
        }
        const leftEnd = left.polar.thetaCenter + left.polar.thetaSpan / 2;
        const rightStart = right.polar.thetaCenter - right.polar.thetaSpan / 2;
        const rIn = Math.max(
            left.polar.rCenter - left.polar.rBand / 2,
            right.polar.rCenter - right.polar.rBand / 2,
            0);
        const rOut = Math.min(
            left.polar.rCenter + left.polar.rBand / 2,
            right.polar.rCenter + right.polar.rBand / 2);
        if (rOut <= rIn) {
            continue;
        }
        const smallerSpan = Math.min(left.polar.thetaSpan, right.polar.thetaSpan);
        const hitSpan = Math.max(rightStart - leftEnd, Math.min(Math.max(1.5, smallerSpan * 0.15), smallerSpan * 0.25));
        boundaries.push({
            id: `${left.name}|${right.name}`,
            left,
            right,
            theta: (leftEnd + rightStart) / 2,
            rIn,
            rOut,
            hitSpan,
        });
    }
    return boundaries;
});

const sectorBoundaryDrag = ref(null); // {boundary, ctm, startTheta, dTheta}

function startSectorBoundaryDrag(boundary, event) {
    if (!props.editable || props.busy) {
        return;
    }
    const svg = event.currentTarget.ownerSVGElement;
    const ctm = svg.getScreenCTM();
    event.currentTarget.setPointerCapture(event.pointerId);
    const drag_ = {
        boundary,
        ctm: { a: ctm.a, d: ctm.d, e: ctm.e, f: ctm.f },
        dTheta: 0,
    };
    drag_.startTheta = pointerPolar(drag_, event).theta;
    sectorBoundaryDrag.value = drag_;
}

function moveSectorBoundaryDrag(event) {
    const drag_ = sectorBoundaryDrag.value;
    if (drag_ == null) {
        return;
    }
    const theta = unwrapAngle(pointerPolar(drag_, event).theta, drag_.startTheta);
    const raw = theta - drag_.startTheta;
    // Neither sector may shrink below 20% of its span (the winder enforces the
    // true limits on the re-wind).
    const maxGrow = drag_.boundary.right.polar.thetaSpan * 0.8;
    const maxShrink = drag_.boundary.left.polar.thetaSpan * 0.8;
    drag_.dTheta = Math.max(-maxShrink, Math.min(maxGrow, raw));
}

function endSectorBoundaryDrag() {
    const drag_ = sectorBoundaryDrag.value;
    sectorBoundaryDrag.value = null;
    if (drag_ == null || Math.abs(drag_.dTheta) < 0.4) {
        return;
    }
    // Same measure as the concentric boundary drag, in angular spans.
    const spans = new Map();
    for (const section of model.value.sections) {
        if (section.type !== 'conduction' || section.polar == null) {
            continue;
        }
        let span = section.polar.thetaSpan;
        if (section.name === drag_.boundary.left.name) {
            span += drag_.dTheta;
        }
        else if (section.name === drag_.boundary.right.name) {
            span -= drag_.dTheta;
        }
        for (const windingName of section.windings) {
            spans.set(windingName, (spans.get(windingName) ?? 0) + span / section.windings.length);
        }
    }
    const total = [...spans.values()].reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
        return;
    }
    emit('resizeProportions', model.value.windingNames.map((name) => (spans.get(name) ?? 0) / total));
}

// ---------------------------------------------------------------------------
// P3: per-window sections layout (orientation + alignment) — a gear on each
// winding window opens a small panel; applying emits setWindowLayout for the
// host to write into that window's bobbin entry and re-wind.
// ---------------------------------------------------------------------------

// Cosmetic alignment labels: the MAS enum values ('innerOrTop' /
// 'outerOrBottom') are written so the C++ covers every case, but users think
// in the concrete direction — and the SECTIONS alignment runs on the OPPOSITE
// axis to the TURNS alignment. Overlapping sections stack radially, so their
// alignment is inner/outer while the turns inside the (vertical) layers align
// top/bottom; both swap for contiguous. The enum VALUES are never changed;
// only the option text shown to the user.
// invertRadial: windows wound around a LATERAL leg are reflected so the
// winding hugs its leg — what the enum calls 'inner' physically lands on the
// leg (outer) side there, so the radial labels swap.
function alignmentLabel(value, orientation, axis, invertRadial = false) {
    const overlapping = (orientation ?? 'overlapping') === 'overlapping';
    const vertical = axis === 'turns' ? overlapping : !overlapping;
    if (value === 'innerOrTop') {
        return vertical ? 'top' : (invertRadial ? 'outer' : 'inner');
    }
    if (value === 'outerOrBottom') {
        return vertical ? 'bottom' : (invertRadial ? 'inner' : 'outer');
    }
    return value;
}

// Does this winding window wrap a lateral leg (placements reflected)?
function windowWrapsLateralLeg(windowIndex) {
    const window = model.value.windows.find((candidate) => candidate.index === windowIndex);
    const column = model.value.core.columns?.[window?.column ?? 0];
    return column?.type === 'lateral';
}

const windowMenu = ref(null); // {windowIndex, sectionsOrientation, sectionsAlignment, windingOrder, x, y}

function openWindowMenu(window, event) {
    if (!props.editable || props.busy) {
        return;
    }
    interleaveMenu.value = null;
    const plotBounds = plotEl.value?.getBoundingClientRect();
    windowMenu.value = {
        windowIndex: window.index,
        label: windowLabel(window),
        lateralWound: windowWrapsLateralLeg(window.index),
        sectionsOrientation: window.sectionsOrientation ?? 'overlapping',
        sectionsAlignment: window.sectionsAlignment ?? 'innerOrTop',
        // Unset reads as Z in the engine, so show Z rather than an empty picker.
        windingOrder: window.windingOrder ?? 'Z',
        x: plotBounds != null ? Math.max(0, Math.min(event.clientX - plotBounds.left, plotBounds.width - 220)) : 0,
        y: plotBounds != null ? Math.max(0, event.clientY - plotBounds.top) : 0,
    };
}

function applyWindowMenu() {
    const menu = windowMenu.value;
    windowMenu.value = null;
    if (menu == null) {
        return;
    }
    emit('setWindowLayout', {
        windowIndex: menu.windowIndex,
        sectionsOrientation: menu.sectionsOrientation,
        sectionsAlignment: menu.sectionsAlignment,
        windingOrder: menu.windingOrder,
    });
}

// ---------------------------------------------------------------------------
// P3: per-SECTION layout gear — turns alignment + layers orientation of the
// selected section only (the dataPerSection knobs). Shown only while a
// section is selected.
// ---------------------------------------------------------------------------

const sectionMenu = ref(null); // {sectionName, turnsAlignment, layersOrientation, x, y}

function openSectionMenu(event) {
    const target = transformTarget.value;
    if (target == null || props.busy) {
        return;
    }
    windowMenu.value = null;
    interleaveMenu.value = null;
    const firstConductionLayer = model.value.layers.find(
        (layer) => layer.type === 'conduction' && layer.section === target.name);
    const windingMeta = model.value.windings?.find((winding) => winding.name === target.windings[0]) ?? null;
    const plotBounds = plotEl.value?.getBoundingClientRect();
    sectionMenu.value = {
        sectionName: target.name,
        turnsAlignment: firstConductionLayer?.turnsAlignment ?? 'centered',
        layersOrientation: target.layersOrientation ?? 'overlapping',
        // Parallels style: only meaningful with more than one parallel. The
        // select shows the active OVERRIDE ('' = the engine heuristic decides;
        // the section's current style is displayed alongside).
        windingName: windingMeta?.name ?? null,
        numberParallels: windingMeta?.numberParallels ?? 1,
        lateralWound: windowWrapsLateralLeg(target.windingWindow ?? 0),
        currentWindingStyle: target.windingStyle ?? null,
        windingStyle: (windingMeta != null && props.windingStyleOverrides[windingMeta.name]) || '',
        x: plotBounds != null ? Math.max(0, Math.min(event.clientX - plotBounds.left, plotBounds.width - 220)) : 0,
        y: plotBounds != null ? Math.max(0, event.clientY - plotBounds.top) : 0,
    };
}

function applySectionMenu() {
    const menu = sectionMenu.value;
    sectionMenu.value = null;
    if (menu == null) {
        return;
    }
    emit('setSectionLayout', {
        sectionName: menu.sectionName,
        turnsAlignment: menu.turnsAlignment,
        layersOrientation: menu.layersOrientation,
        windingName: menu.windingName,
        windingStyle: menu.windingStyle === '' ? null : menu.windingStyle,
    });
}

// ---------------------------------------------------------------------------
// P3: winding GROUPS editor — the partition of windings into wound-together
// (bifilar/multifilar) groups, e.g. center-tapped halves. One winding belongs
// to at most one group, which is exactly what the mutual woundWith lists
// express. The chip-drop gesture stays the quick pairwise path; this panel is
// where the whole partition is seen and managed.
// ---------------------------------------------------------------------------

const GROUP_LINK_COLORS = ['#ffd166', '#06d6a0', '#4fd2ff', '#ef476f'];

const groupsMenu = ref(null); // {rows: [[names...], ...], x, y}

// Current partition from the mutual woundWith lists (union of links).
const windingGroups = computed(() => {
    const windings = model.value.windings ?? [];
    const assigned = new Set();
    const groups = [];
    for (const winding of windings) {
        if (assigned.has(winding.name) || winding.woundWith.length === 0) {
            continue;
        }
        const members = [winding.name];
        assigned.add(winding.name);
        const queue = [...winding.woundWith];
        while (queue.length > 0) {
            const name = queue.pop();
            if (assigned.has(name)) {
                continue;
            }
            const meta = windings.find((candidate) => candidate.name === name);
            if (meta == null) {
                continue;
            }
            members.push(name);
            assigned.add(name);
            queue.push(...meta.woundWith);
        }
        if (members.length > 1) {
            groups.push(members);
        }
    }
    return groups;
});

function windingGroupIndex(windingName) {
    return windingGroups.value.findIndex((group) => group.includes(windingName));
}

// Engine constraints for wound-together windings: same wire, same number of
// parallels, same isolation side. Returns the blocking reason or null.
function groupEligibilityReason(windingName, memberNames) {
    const others = memberNames.filter((name) => name !== windingName);
    if (others.length === 0) {
        return null;
    }
    return groupingBlockReason(windingName, others[0]);
}

function openGroupsMenu(event) {
    if (!props.editable || props.busy) {
        return;
    }
    windowMenu.value = null;
    sectionMenu.value = null;
    interleaveMenu.value = null;
    const plotBounds = plotEl.value?.getBoundingClientRect();
    groupsMenu.value = {
        rows: windingGroups.value.map((group) => [...group]),
        x: plotBounds != null ? Math.max(0, Math.min(event.clientX - plotBounds.left, plotBounds.width - 260)) : 0,
        y: plotBounds != null ? Math.max(0, event.clientY - plotBounds.top) : 0,
    };
}

// Rows shown in the editor: the working groups plus one trailing empty row to
// start a new group in.
const groupsMenuRows = computed(() => (groupsMenu.value == null ? [] : [...groupsMenu.value.rows, []]));

function toggleGroupMembership(rowIndex, windingName) {
    const menu = groupsMenu.value;
    if (menu == null) {
        return;
    }
    const rows = menu.rows.map((row) => row.filter((name) => name !== windingName));
    if (!(menu.rows[rowIndex] ?? []).includes(windingName)) {
        while (rows.length <= rowIndex) {
            rows.push([]);
        }
        rows[rowIndex].push(windingName);
    }
    menu.rows = rows.filter((row) => row.length > 0);
}

function groupRowTurnsWarning(row) {
    const turns = row
        .map((name) => model.value.windings?.find((winding) => winding.name === name)?.numberTurns)
        .filter((value) => value != null);
    return turns.length > 1 && new Set(turns).size > 1
        ? 'different turn counts — center-tap halves are usually symmetric'
        : null;
}

// Cross-side grouping joins the members onto ONE isolation side (no barrier
// between wound-together windings) — announced, not blocked.
function groupRowSideJoinNotice(row) {
    const sides = row
        .map((name) => model.value.windings?.find((winding) => winding.name === name)?.isolationSide)
        .filter((value) => value != null);
    if (sides.length > 1 && new Set(sides).size > 1) {
        return `isolation sides join: all become '${sides[0]}'`;
    }
    return null;
}

// Disabled toggles cannot show tooltips in most browsers — surface the
// blocking reasons as visible row text instead.
function groupRowBlockReasons(row) {
    if (row.length === 0) {
        return [];
    }
    return (model.value.windingNames ?? [])
        .filter((name) => !row.includes(name))
        .map((name) => ({ name, reason: groupEligibilityReason(name, row) }))
        .filter((entry) => entry.reason != null)
        .map((entry) => `${entry.name}: ${entry.reason}`);
}

function applyGroupsMenu() {
    const menu = groupsMenu.value;
    groupsMenu.value = null;
    if (menu == null) {
        return;
    }
    emit('setWindingGroups', menu.rows.filter((row) => row.length > 1));
}

// Click-outside: gear menus APPLY their pending changes (the user's explicit
// request); the interleave menu — a choice, not a form — just closes.
function onDocumentPointerDown(event) {
    if (event.target?.closest?.('.winding-studio-menu')) {
        return;
    }
    if (windowMenu.value != null) {
        applyWindowMenu();
    }
    if (sectionMenu.value != null) {
        applySectionMenu();
    }
    if (groupsMenu.value != null) {
        applyGroupsMenu();
    }
    if (interleaveMenu.value != null) {
        interleaveMenu.value = null;
    }
}
onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true));

function columnLabel(column) {
    const laterals = (model.value.core.columns ?? []).filter((candidate) => candidate.type === 'lateral');
    if (column.type === 'central') {
        // U-style cores have ONE lateral: their 'central' column is simply the
        // other leg — name both by side. (Toroids never reach the leg UI.)
        if (laterals.length === 1) {
            const lateralCenterX = laterals[0].rect.x + laterals[0].rect.width / 2;
            return column.rect.x + column.rect.width / 2 <= lateralCenterX ? 'Left leg' : 'Right leg';
        }
        return 'Center leg';
    }
    return column.rect.x + column.rect.width / 2 < 0 ? 'Left leg' : 'Right leg';
}

// Windows are an implementation detail; users think in COLUMNS. Label each
// window gear by the leg its window wraps (schema default: no column edge →
// the main column).
function windowLabel(window) {
    const column = model.value.core.columns?.[window.column ?? 0] ?? model.value.core.columns?.[0];
    if (column == null) {
        return 'Window ' + window.index;
    }
    return columnLabel(column);
}

// ---------------------------------------------------------------------------
// P2: drag the boundary between two adjacent sections to resize proportions
// ---------------------------------------------------------------------------

// Boundaries between adjacent conduction sections of DIFFERENT windings in the
// same winding window, stacking along x (the concentric overlapping layout).
// Dragging one re-distributes the per-winding proportions; the winder recomputes
// the real geometry on the emitted re-wind.
const sectionBoundaries = computed(() => {
    if (!props.editable || !model.value.valid || model.value.kind === 'toroidal') {
        return [];
    }
    const conduction = model.value.sections
        .filter((section) => section.type === 'conduction')
        .sort((a, b) => a.rect.x - b.rect.x);
    const boundaries = [];
    for (let i = 0; i + 1 < conduction.length; i++) {
        const left = conduction[i];
        const right = conduction[i + 1];
        if (left.windingWindow !== right.windingWindow) {
            continue;
        }
        if (left.windings.join() === right.windings.join()) {
            continue;
        }
        const y0 = Math.max(left.rect.y, right.rect.y);
        const y1 = Math.min(left.rect.y + left.rect.height, right.rect.y + right.rect.height);
        if (y1 <= y0) {
            continue;
        }
        // Slim hit zone (grabbable but not click-stealing): the gap itself, or
        // 15% of the thinner neighbour — floored at 0.6 mm for grabbability but
        // NEVER more than half the thinner neighbour (a handle wider than the
        // sections it sits between steals their clicks and hovers).
        const thinner = Math.min(left.rect.width, right.rect.width);
        boundaries.push({
            id: `${left.name}|${right.name}`,
            left,
            right,
            x: (left.rect.x + left.rect.width + right.rect.x) / 2,
            y: y0,
            height: y1 - y0,
            hitWidth: Math.max(
                right.rect.x - left.rect.x - left.rect.width,
                Math.min(Math.max(0.6, thinner * 0.15), thinner * 0.5)),
        });
    }
    return boundaries;
});

const boundaryDrag = ref(null); // {boundary, startClientX, dx (mm), scale}

function startBoundaryDrag(boundary, event) {
    if (!props.editable || props.busy) {
        return;
    }
    const svg = event.currentTarget.ownerSVGElement;
    const ctm = svg.getScreenCTM();
    event.currentTarget.setPointerCapture(event.pointerId);
    // ctm kept so a no-movement release can resolve which section was clicked.
    boundaryDrag.value = { boundary, startClientX: event.clientX, dx: 0, scale: 1 / ctm.a, ctmA: ctm.a, ctmE: ctm.e };
}

function moveBoundaryDrag(event) {
    const drag_ = boundaryDrag.value;
    if (drag_ == null) {
        return;
    }
    const raw = (event.clientX - drag_.startClientX) * drag_.scale;
    // Clamp: neither section may shrink below ~15% of its width (the winder is
    // the authority on true limits; this just keeps the gesture sane).
    const minKeep = 0.15;
    const maxGrow = drag_.boundary.right.rect.width * (1 - minKeep);
    const maxShrink = drag_.boundary.left.rect.width * (1 - minKeep);
    drag_.dx = Math.max(-maxShrink, Math.min(maxGrow, raw));
}

function endBoundaryDrag(event) {
    const drag_ = boundaryDrag.value;
    boundaryDrag.value = null;
    if (drag_ == null) {
        return;
    }
    if (Math.abs(drag_.dx) < 0.15) {
        // Click-through: a press-and-release without movement SELECTS the
        // nearer of the two sections instead of being swallowed by the handle.
        const boundaryClientX = drag_.boundary.x * drag_.ctmA + drag_.ctmE;
        onSectionClick(event != null && event.clientX < boundaryClientX ? drag_.boundary.left : drag_.boundary.right);
        return;
    }
    // Re-derive per-winding proportions from the CURRENT conduction sections,
    // with the dragged boundary shifting width between its two neighbours.
    // (Same measure the builder itself uses: sum of section widths per winding.)
    const dims = new Map();
    for (const section of model.value.sections) {
        if (section.type !== 'conduction') {
            continue;
        }
        let width = section.rect.width;
        if (section.name === drag_.boundary.left.name) {
            width += drag_.dx;
        }
        else if (section.name === drag_.boundary.right.name) {
            width -= drag_.dx;
        }
        for (const windingName of section.windings) {
            dims.set(windingName, (dims.get(windingName) ?? 0) + width / section.windings.length);
        }
    }
    const total = [...dims.values()].reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
        return;
    }
    const proportions = model.value.windingNames.map((name) => (dims.get(name) ?? 0) / total);
    emit('resizeProportions', proportions);
}

// ---------------------------------------------------------------------------
// P2: drag a section's top/bottom edge against the window wall to set margins
// ---------------------------------------------------------------------------

// Resizing a section along its turns axis IS margin tape in MAS terms: the
// distance from the winding-window wall to the section edge. Dragging an edge
// emits the margin; the winder re-spreads/re-packs the turns accordingly.
const MARGIN_MM = 1000;
const sectionEdgeHandles = computed(() => {
    if (!props.editable || !model.value.valid || model.value.kind === 'toroidal' || model.value.windows.length === 0) {
        return [];
    }
    const handles = [];
    for (const section of model.value.sections) {
        if (section.type !== 'conduction') {
            continue;
        }
        if (section.name === selectedSection.value) {
            // The selected section is in free-transform mode; its edges belong
            // to the transform handles, not the margin handles.
            continue;
        }
        const window = model.value.windows.find((w) => w.index === section.windingWindow) ?? model.value.windows[0];
        if (window == null || (window.sectionsOrientation ?? 'overlapping') === 'contiguous') {
            // Contiguous-sections windows carry left/right margins (painter
            // rule); horizontal margin drags are not implemented yet.
            continue;
        }
        // Slim strip: floored at 0.6 mm for grabbability, but NEVER more than
        // 30% of the section height — a handle taller than its section blankets
        // the turns and steals the clicks meant to SELECT the section.
        const hitHeight = Math.min(section.rect.height * 0.3, Math.max(0.6, window.rect.height * 0.03));
        for (const side of ['top', 'bottom']) {
            const edgeY = side === 'top' ? section.rect.y : section.rect.y + section.rect.height;
            handles.push({
                id: `${section.name}|${side}`,
                section,
                side,
                window,
                x: section.rect.x,
                width: section.rect.width,
                y: edgeY - hitHeight / 2,
                hitHeight,
                edgeY,
            });
        }
    }
    return handles;
});

const edgeDrag = ref(null); // {handle, startClientY, dy (mm), scale}

function startEdgeDrag(handle, event) {
    if (!props.editable || props.busy) {
        return;
    }
    const svg = event.currentTarget.ownerSVGElement;
    const ctm = svg.getScreenCTM();
    event.currentTarget.setPointerCapture(event.pointerId);
    edgeDrag.value = { handle, startClientY: event.clientY, dy: 0, scale: 1 / ctm.d };
}

function moveEdgeDrag(event) {
    const drag_ = edgeDrag.value;
    if (drag_ == null) {
        return;
    }
    const raw = (event.clientY - drag_.startClientY) * drag_.scale;
    // Clamp: the edge stays between the window wall and 20% of the section's
    // height from its opposite edge (the winder is the authority on real fit).
    const { handle } = drag_;
    const minKeep = handle.section.rect.height * 0.2;
    let low;
    let high;
    if (handle.side === 'top') {
        low = handle.window.rect.y - handle.edgeY;
        high = handle.section.rect.y + handle.section.rect.height - minKeep - handle.edgeY;
    }
    else {
        low = handle.section.rect.y + minKeep - handle.edgeY;
        high = handle.window.rect.y + handle.window.rect.height - handle.edgeY;
    }
    drag_.dy = Math.max(low, Math.min(high, raw));
}

function endEdgeDrag() {
    const drag_ = edgeDrag.value;
    edgeDrag.value = null;
    if (drag_ == null) {
        return;
    }
    if (Math.abs(drag_.dy) < 0.15) {
        // Click-through: select the handle's own section instead of eating the click.
        onSectionClick(drag_.handle.section);
        return;
    }
    const { handle } = drag_;
    const newEdgeY = handle.edgeY + drag_.dy;
    // Margin = distance from the window wall to the section edge, in meters.
    // SVG y is flipped, so the smaller-y wall is the physical TOP (topOrLeft).
    let side;
    let marginMm;
    if (handle.side === 'top') {
        side = 'topOrLeft';
        marginMm = newEdgeY - handle.window.rect.y;
    }
    else {
        side = 'bottomOrRight';
        marginMm = handle.window.rect.y + handle.window.rect.height - newEdgeY;
    }
    // Snap back to "no margin" when released within a hair of the wall.
    if (marginMm < 0.05) {
        marginMm = 0;
    }
    emit('resizeMargins', {
        sectionName: handle.section.name,
        side,
        value: marginMm / MARGIN_MM,
    });
}

// ---------------------------------------------------------------------------
// P2.5: free transform of a SELECTED section — a totally custom rectangle.
// Dragging any of the four edges resizes it (including the laterals); dragging
// the body moves it. On release the host writes the new rect into the section
// and the winder re-flows layers+turns INSIDE it (rewind_layers_and_turns —
// sections are not recomputed and nothing re-compacts the custom placement).
// ---------------------------------------------------------------------------

const transformTarget = computed(() => {
    if (!props.editable || selectedSection.value == null || !model.value.valid) {
        return null;
    }
    const section = model.value.sections.find(
        (candidate) => candidate.name === selectedSection.value && candidate.type === 'conduction');
    return section ?? null;
});

const transformDrag = ref(null); // {mode, section, startX, startY, sx, sy, rect}

const transformRect = computed(() => transformDrag.value?.rect ?? transformTarget.value?.rect ?? null);

function transformThickness() {
    const rect = transformRect.value;
    // Slim edges: half of this extends OUTSIDE the rect and must not blanket
    // the neighbouring sections; never more than 40% of the smaller dimension.
    const smaller = Math.min(rect.width, rect.height);
    return Math.min(Math.max(0.5, smaller * 0.15), smaller * 0.4, 1.2);
}

// Snap targets for the free transform: the section's window walls and every
// other conduction section's edges — dragging near one of them sticks to it.
function snapCandidates(section) {
    const xs = [];
    const ys = [];
    const window = model.value.windows.find((w) => w.index === section.windingWindow) ?? model.value.windows[0];
    if (window != null) {
        xs.push(window.rect.x, window.rect.x + window.rect.width);
        ys.push(window.rect.y, window.rect.y + window.rect.height);
    }
    for (const other of model.value.sections) {
        if (other.type !== 'conduction' || other.name === section.name) {
            continue;
        }
        xs.push(other.rect.x, other.rect.x + other.rect.width);
        ys.push(other.rect.y, other.rect.y + other.rect.height);
    }
    return { xs, ys };
}

function snapTo(value, candidates, tolerance) {
    let best = null;
    let bestDistance = tolerance;
    for (const candidate of candidates) {
        const distance = Math.abs(candidate - value);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
        }
    }
    return best;
}

function startTransformDrag(mode, event) {
    const section = transformTarget.value;
    if (section == null || props.busy) {
        return;
    }
    const svg = event.currentTarget.ownerSVGElement;
    const ctm = svg.getScreenCTM();
    event.currentTarget.setPointerCapture(event.pointerId);
    transformDrag.value = {
        mode,
        section,
        startX: event.clientX,
        startY: event.clientY,
        sx: 1 / ctm.a,
        sy: 1 / ctm.d,
        rect: { ...section.rect },
        candidates: snapCandidates(section),
        guides: { x: null, y: null },
    };
}

function moveTransformDrag(event) {
    const drag_ = transformDrag.value;
    if (drag_ == null) {
        return;
    }
    const dx = (event.clientX - drag_.startX) * drag_.sx;
    const dy = (event.clientY - drag_.startY) * drag_.sy;
    const original = drag_.section.rect;
    const minWidth = original.width * 0.2;
    const minHeight = original.height * 0.2;
    // Stickiness: ~7 screen px around window walls and other sections' edges.
    const tolX = 7 * drag_.sx;
    const tolY = 7 * drag_.sy;
    const { xs, ys } = drag_.candidates;
    const guides = { x: null, y: null };
    const rect = { ...original };
    switch (drag_.mode) {
        case 'move': {
            rect.x = original.x + dx;
            rect.y = original.y + dy;
            const left = snapTo(rect.x, xs, tolX);
            const right = snapTo(rect.x + rect.width, xs, tolX);
            if (left != null && (right == null || Math.abs(left - rect.x) <= Math.abs(right - (rect.x + rect.width)))) {
                guides.x = left;
                rect.x = left;
            }
            else if (right != null) {
                guides.x = right;
                rect.x = right - rect.width;
            }
            const top = snapTo(rect.y, ys, tolY);
            const bottom = snapTo(rect.y + rect.height, ys, tolY);
            if (top != null && (bottom == null || Math.abs(top - rect.y) <= Math.abs(bottom - (rect.y + rect.height)))) {
                guides.y = top;
                rect.y = top;
            }
            else if (bottom != null) {
                guides.y = bottom;
                rect.y = bottom - rect.height;
            }
            break;
        }
        case 'w': {
            let newX = Math.min(original.x + dx, original.x + original.width - minWidth);
            const snapped = snapTo(newX, xs, tolX);
            if (snapped != null && snapped <= original.x + original.width - minWidth) {
                guides.x = snapped;
                newX = snapped;
            }
            rect.width = original.width + (original.x - newX);
            rect.x = newX;
            break;
        }
        case 'e': {
            let newRight = Math.max(original.x + minWidth, original.x + original.width + dx);
            const snapped = snapTo(newRight, xs, tolX);
            if (snapped != null && snapped >= original.x + minWidth) {
                guides.x = snapped;
                newRight = snapped;
            }
            rect.width = newRight - original.x;
            break;
        }
        case 'n': {
            let newY = Math.min(original.y + dy, original.y + original.height - minHeight);
            const snapped = snapTo(newY, ys, tolY);
            if (snapped != null && snapped <= original.y + original.height - minHeight) {
                guides.y = snapped;
                newY = snapped;
            }
            rect.height = original.height + (original.y - newY);
            rect.y = newY;
            break;
        }
        case 's': {
            let newBottom = Math.max(original.y + minHeight, original.y + original.height + dy);
            const snapped = snapTo(newBottom, ys, tolY);
            if (snapped != null && snapped >= original.y + minHeight) {
                guides.y = snapped;
                newBottom = snapped;
            }
            rect.height = newBottom - original.y;
            break;
        }
    }
    drag_.guides = guides;
    drag_.rect = rect;
}

// ---------------------------------------------------------------------------
// Toroidal free transform: reshape the selected annular sector — rotate/shift
// with the body, drag the two angular edges or the two radial edges. Emits the
// same resizeSectionRect payload with POLAR coordinates/dimensions (the MAS
// toroidal convention), which the winder re-flows natively.
// ---------------------------------------------------------------------------

const sectorTarget = computed(() => (model.value.kind === 'toroidal' ? transformTarget.value : null));

const sectorDrag = ref(null); // {mode, ctm, startR, startTheta, orig, live, guides}

const sectorLive = computed(() => {
    const target = sectorTarget.value;
    if (target == null) {
        return null;
    }
    if (sectorDrag.value != null) {
        return sectorDrag.value.live;
    }
    const polar = target.polar;
    return {
        rIn: Math.max(0, polar.rCenter - polar.rBand / 2),
        rOut: polar.rCenter + polar.rBand / 2,
        a0: polar.thetaCenter - polar.thetaSpan / 2,
        a1: polar.thetaCenter + polar.thetaSpan / 2,
    };
});

function sectorHandleSizes() {
    // Edge hit zones capped at 25% of the band/span (a floor larger than the
    // sector itself would leave no body to rotate — the thin-section lesson).
    const live = sectorLive.value;
    const band = live.rOut - live.rIn;
    const span = live.a1 - live.a0;
    const radial = Math.min(1.2, Math.max(0.15, band * 0.25));
    const angular = Math.min(((1.2 / Math.max(live.rOut, 1)) * 180) / Math.PI, Math.max(1, span * 0.25));
    return { radial, angular };
}

function unwrapAngle(theta, reference) {
    let value = theta;
    while (value < reference - 180) value += 360;
    while (value > reference + 180) value -= 360;
    return value;
}

function pointerPolar(drag_, event) {
    const x = (event.clientX - drag_.ctm.e) / drag_.ctm.a;
    const y = (event.clientY - drag_.ctm.f) / drag_.ctm.d;
    // Toroidal view maps data y DOWN the screen (painter-matched mirror, see
    // geometry.js), so the data angle comes straight from screen coordinates.
    return { r: Math.hypot(x, y), theta: (Math.atan2(y, x) * 180) / Math.PI };
}

function sectorSnapCandidates(section) {
    const angles = [0, 90, 180, 270];
    const radii = [model.value.windowRadius];
    for (const other of model.value.sections) {
        if (other.type !== 'conduction' || other.name === section.name || other.polar == null) {
            continue;
        }
        angles.push(other.polar.thetaCenter - other.polar.thetaSpan / 2, other.polar.thetaCenter + other.polar.thetaSpan / 2);
        radii.push(other.polar.rCenter - other.polar.rBand / 2, other.polar.rCenter + other.polar.rBand / 2);
    }
    return { angles, radii };
}

function startSectorDrag(mode, event) {
    const section = sectorTarget.value;
    if (section == null || props.busy) {
        return;
    }
    const svg = event.currentTarget.ownerSVGElement;
    const ctm = svg.getScreenCTM();
    event.currentTarget.setPointerCapture(event.pointerId);
    const drag_ = {
        mode,
        section,
        ctm: { a: ctm.a, d: ctm.d, e: ctm.e, f: ctm.f },
        orig: { ...sectorLive.value },
        live: { ...sectorLive.value },
        candidates: sectorSnapCandidates(section),
        guides: { theta: null, r: null },
        moved: false,
    };
    const start = pointerPolar(drag_, event);
    drag_.startR = start.r;
    drag_.startTheta = start.theta;
    sectorDrag.value = drag_;
}

function snapAngleTo(value, candidates, tolerance) {
    let best = null;
    let bestDistance = tolerance;
    for (const candidate of candidates) {
        const distance = Math.abs(unwrapAngle(candidate, value) - value);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = unwrapAngle(candidate, value);
        }
    }
    return best;
}

function moveSectorDrag(event) {
    const drag_ = sectorDrag.value;
    if (drag_ == null) {
        return;
    }
    const pointer = pointerPolar(drag_, event);
    const theta = unwrapAngle(pointer.theta, drag_.startTheta);
    const dTheta = theta - drag_.startTheta;
    const dR = pointer.r - drag_.startR;
    if (Math.abs(dTheta) > 0.2 || Math.abs(dR) > 0.05) {
        drag_.moved = true;
    }
    const orig = drag_.orig;
    const minSpan = Math.max(2, (orig.a1 - orig.a0) * 0.2);
    const minBand = Math.max(0.1, (orig.rOut - orig.rIn) * 0.2);
    const maxR = model.value.windowRadius;
    const tolTheta = 2.5;
    const tolR = 0.5;
    const live = { ...orig };
    const guides = { theta: null, r: null };
    switch (drag_.mode) {
        case 'rotate': {
            live.a0 = orig.a0 + dTheta;
            live.a1 = orig.a1 + dTheta;
            const snap0 = snapAngleTo(live.a0, drag_.candidates.angles, tolTheta);
            const snap1 = snapAngleTo(live.a1, drag_.candidates.angles, tolTheta);
            if (snap0 != null && (snap1 == null || Math.abs(snap0 - live.a0) <= Math.abs(snap1 - live.a1))) {
                const shift = snap0 - live.a0;
                live.a0 += shift;
                live.a1 += shift;
                guides.theta = live.a0;
            }
            else if (snap1 != null) {
                const shift = snap1 - live.a1;
                live.a0 += shift;
                live.a1 += shift;
                guides.theta = live.a1;
            }
            let rIn = orig.rIn + dR;
            let rOut = orig.rOut + dR;
            const shiftLow = Math.max(0, 0.05 - rIn);
            rIn += shiftLow;
            rOut += shiftLow;
            const shiftHigh = Math.max(0, rOut - maxR);
            rIn -= shiftHigh;
            rOut -= shiftHigh;
            const snapOut = snapTo(rOut, drag_.candidates.radii, tolR);
            if (snapOut != null) {
                rIn += snapOut - rOut;
                rOut = snapOut;
                guides.r = snapOut;
            }
            live.rIn = rIn;
            live.rOut = rOut;
            break;
        }
        case 'a0': {
            let a0 = unwrapAngle(pointer.theta, orig.a0);
            const snapped = snapAngleTo(a0, drag_.candidates.angles, tolTheta);
            if (snapped != null) {
                a0 = snapped;
                guides.theta = snapped;
            }
            live.a0 = Math.min(a0, orig.a1 - minSpan);
            break;
        }
        case 'a1': {
            let a1 = unwrapAngle(pointer.theta, orig.a1);
            const snapped = snapAngleTo(a1, drag_.candidates.angles, tolTheta);
            if (snapped != null) {
                a1 = snapped;
                guides.theta = snapped;
            }
            live.a1 = Math.max(a1, orig.a0 + minSpan);
            break;
        }
        case 'rIn': {
            let rIn = pointer.r;
            const snapped = snapTo(rIn, drag_.candidates.radii, tolR);
            if (snapped != null) {
                rIn = snapped;
                guides.r = snapped;
            }
            live.rIn = Math.max(0.05, Math.min(rIn, orig.rOut - minBand));
            break;
        }
        case 'rOut': {
            let rOut = pointer.r;
            const snapped = snapTo(rOut, drag_.candidates.radii, tolR);
            if (snapped != null) {
                rOut = snapped;
                guides.r = snapped;
            }
            live.rOut = Math.max(orig.rIn + minBand, Math.min(rOut, maxR));
            break;
        }
    }
    drag_.guides = guides;
    drag_.live = live;
}

function endSectorDrag() {
    const drag_ = sectorDrag.value;
    sectorDrag.value = null;
    if (drag_ == null) {
        return;
    }
    if (!drag_.moved) {
        if (drag_.mode === 'rotate') {
            selectedSection.value = null;
            emit('sectionSelected', null);
        }
        return;
    }
    const live = drag_.live;
    const span = Math.min(360, live.a1 - live.a0);
    let thetaCenter = (live.a0 + live.a1) / 2;
    thetaCenter = ((thetaCenter % 360) + 360) % 360;
    const rCenter = (live.rIn + live.rOut) / 2;
    emit('resizeSectionRect', {
        sectionName: drag_.section.name,
        coordinates: [(model.value.windowRadius - rCenter) / MARGIN_MM, thetaCenter],
        dimensions: [(live.rOut - live.rIn) / MARGIN_MM, span],
        margin: null,
    });
}

function endTransformDrag() {
    const drag_ = transformDrag.value;
    transformDrag.value = null;
    if (drag_ == null) {
        return;
    }
    const original = drag_.section.rect;
    const rect = drag_.rect;
    const unchanged = ['x', 'y', 'width', 'height']
        .every((key) => Math.abs(rect[key] - original[key]) < 1e-3);
    if (unchanged) {
        if (drag_.mode === 'move') {
            // A plain click on the transform body deselects the section.
            selectedSection.value = null;
            emit('sectionSelected', null);
        }
        return;
    }
    // The gaps the custom rectangle leaves to the window walls along the
    // sections axis BECOME the section's margins (tape): the drawn layout and
    // the MAS margin data stay consistent (painter, insulation panel, fill).
    const window = model.value.windows.find((w) => w.index === drag_.section.windingWindow) ?? model.value.windows[0];
    let margin = null;
    if (window != null && (window.sectionsOrientation ?? 'overlapping') !== 'contiguous') {
        const topGap = Math.max(0, rect.y - window.rect.y);
        const bottomGap = Math.max(0, window.rect.y + window.rect.height - (rect.y + rect.height));
        margin = [
            topGap < 0.05 ? 0 : topGap / MARGIN_MM,
            bottomGap < 0.05 ? 0 : bottomGap / MARGIN_MM,
        ];
    }
    // SVG mm (y flipped) -> physical meters, center-based like MAS sections.
    emit('resizeSectionRect', {
        sectionName: drag_.section.name,
        coordinates: [(rect.x + rect.width / 2) / MARGIN_MM, -(rect.y + rect.height / 2) / MARGIN_MM],
        dimensions: [rect.width / MARGIN_MM, rect.height / MARGIN_MM],
        margin,
    });
}
</script>

<template>
    <Teleport to="body" :disabled="!maximized">
    <div v-if="maximized" class="winding-studio-backdrop" @click="maximized = false"></div>
    <div
        class="winding-studio"
        :class="{ 'winding-studio-maximized': maximized }"
        :data-cy="dataTestLabel + '-WindingStudio'"
        :style="{ 'background-color': maximized ? undefined : backgroundColor, color: textColor }"
    >
        <div v-if="!model.valid" class="winding-studio-empty">
            {{ model.reason }}
        </div>
        <template v-else>
            <div class="winding-studio-toolbar">
                <span class="winding-studio-title">Winding Studio</span>
                <button
                    type="button"
                    class="winding-studio-maximize"
                    :data-cy="dataTestLabel + '-WindingStudio-maximize'"
                    :title="maximized ? 'Restore (Esc)' : 'Maximize'"
                    @click="maximized = !maximized"
                >{{ maximized ? '🗗' : '🗖' }}</button>
                <div class="winding-studio-legend">
                    <button
                        v-for="windingName in model.windingNames"
                        :key="windingName"
                        type="button"
                        class="winding-studio-chip"
                        :class="{ 'winding-studio-chip-draggable': editable && !busy }"
                        :style="{
                            '--chip-color': windingColor(model.windingNames, windingName),
                            borderBottom: windingGroupIndex(windingName) >= 0
                                ? '2px solid ' + GROUP_LINK_COLORS[windingGroupIndex(windingName) % GROUP_LINK_COLORS.length]
                                : undefined,
                        }"
                        :data-cy="dataTestLabel + '-WindingStudio-chip-' + windingName"
                        :title="windingGroupIndex(windingName) >= 0 ? 'Wound together with ' + windingGroups[windingGroupIndex(windingName)].filter((name) => name !== windingName).join(', ') : null"
                        @mouseenter="legendHover(windingName)"
                        @mouseleave="legendLeave()"
                        @pointerdown="startChipDrag(windingName, $event)"
                        @pointermove="moveChipDrag($event)"
                        @pointerup="endChipDrag()"
                        @pointercancel="endChipDrag()"
                    >
                        <span class="winding-studio-chip-dot"></span>{{ windingName }}<span
                            v-if="windingGroupIndex(windingName) >= 0"
                            class="winding-studio-chip-link"
                        >⛓</span>
                    </button>
                    <span v-if="editable && !busy" class="winding-studio-hint">{{
                        transformTarget != null
                            ? (model.kind === 'toroidal'
                                ? 'custom sector — drag edges to reshape, body to rotate, click to deselect'
                                : 'custom rectangle — drag edges to reshape, centre to move, click to deselect')
                            : (model.kind === 'toroidal'
                                ? 'click a section to reshape it'
                                : 'drag a winding onto a leg · click a section to reshape it')
                    }}</span>
                    <span v-if="busy" class="winding-studio-hint">winding…</span>
                </div>
                <span
                    v-if="fitStatus != null"
                    class="winding-studio-fit"
                    :class="fitStatus.overflow ? 'winding-studio-fit-bad' : 'winding-studio-fit-good'"
                    :data-cy="dataTestLabel + '-WindingStudio-fit'"
                >
                    {{ fitStatus.overflow ? '⚠ does not fit' : '✓ fits' }}<template
                        v-if="fitStatus.worstFill > 0"> · fill {{ (fitStatus.worstFill * 100).toFixed(0) }}%</template>
                </span>
                <button
                    v-if="editable && model.windingNames.length > 1"
                    type="button"
                    class="winding-studio-chip winding-studio-custom-chip"
                    :disabled="busy"
                    :data-cy="dataTestLabel + '-WindingStudio-groups'"
                    title="Windings wound together (bifilar/multifilar, e.g. center-tapped halves) share sections and layers"
                    @click="openGroupsMenu($event)"
                >⛓ Groups</button>
                <button
                    v-if="editable"
                    type="button"
                    class="winding-studio-chip winding-studio-custom-chip"
                    :disabled="busy"
                    :data-cy="dataTestLabel + '-WindingStudio-autofit'"
                    title="Re-wind automatically with the selected sections distribution: drops the drawn rectangles and re-derives the per-winding proportions from the wires"
                    @click="emit('autoFit')"
                >Auto fit</button>
                <!-- Layout gears live in the toolbar (never inside the SVG — an
                     in-plot gear intercepted the rotate/edge drags twice): one
                     chip per winding window, plus the selected section's. -->
                <button
                    v-for="window in (editable && model.kind !== 'toroidal' ? model.windows : [])"
                    :key="'window-gear' + window.index"
                    type="button"
                    class="winding-studio-chip winding-studio-custom-chip"
                    :data-cy="dataTestLabel + '-WindingStudio-window-gear-' + window.index"
                    :title="'Sections layout and winding order (U/Z) of the ' + windowLabel(window).toLowerCase() + ' winding window'"
                    @click="openWindowMenu(window, $event)"
                >⚙ {{ windowLabel(window) }}</button>
                <button
                    v-if="editable && transformTarget != null"
                    type="button"
                    class="winding-studio-chip winding-studio-custom-chip"
                    :data-cy="dataTestLabel + '-WindingStudio-section-gear'"
                    :title="'Layout of ' + transformTarget.name"
                    @click="openSectionMenu($event)"
                >⚙ {{ transformTarget.name }}</button>
                <button
                    v-if="customCount > 0 && editable"
                    type="button"
                    class="winding-studio-chip winding-studio-custom-chip"
                    :data-cy="dataTestLabel + '-WindingStudio-clear-custom'"
                    title="Sections you drew are pinned and survive re-winds; click to clear them and return to the automatic layout"
                    @click="emit('clearCustomRects')"
                >
                    custom layout ({{ customCount }}) ✕
                </button>
                <label v-if="showCompactToggle && editable" class="winding-studio-toggle" title="Compaction pass on re-winds (drawn sections are never compacted)">
                    <input
                        type="checkbox"
                        :checked="compact"
                        :data-cy="dataTestLabel + '-WindingStudio-compact'"
                        @change="emit('update:compact', $event.target.checked)"
                    />
                    Compact
                </label>
                <label class="winding-studio-toggle" title="Magnetic field map (painter) behind the cross-section">
                    <input
                        v-model="showField"
                        type="checkbox"
                        :data-cy="dataTestLabel + '-WindingStudio-field'"
                    />
                    Field
                </label>
                <span v-if="showField && fieldImage == null" class="winding-studio-hint">computing field…</span>
                <label class="winding-studio-toggle">
                    <input v-model="colorByWinding" type="checkbox" />
                    Color by winding
                </label>
                <label class="winding-studio-toggle">
                    <input
                        v-model="showConnections"
                        type="checkbox"
                        :data-cy="dataTestLabel + '-WindingStudio-connections'"
                    />
                    Connections
                </label>
                <span v-if="showConnections && connectionsPending" class="winding-studio-hint">computing connections…</span>
                <span
                    v-else-if="showConnections && connections.markers.length > 0 && connections.declined"
                    class="winding-studio-hint"
                >MKF declined the connection blocking — turns are NOT displaced around these routes</span>
            </div>
            <div ref="plotEl" class="winding-studio-plot">
                <svg
                    :viewBox="viewBox"
                    preserveAspectRatio="xMidYMid meet"
                    class="winding-studio-svg"
                >
                    <!-- Core -->
                    <path :d="corePath" :fill="cssColor(ferriteColor)" fill-rule="evenodd" />
                    <!-- Gaps: breaks in the columns -->
                    <rect
                        v-for="(gap, index) in model.core.gaps"
                        :key="'gap' + index"
                        v-bind="gap"
                        :fill="backgroundColor === 'transparent' ? '#000000' : backgroundColor"
                    />
                    <!-- Bobbin (mirror parts are the annulus' passive far side) -->
                    <rect
                        v-for="(part, index) in model.bobbin"
                        :key="'bobbin' + index"
                        :x="part.x"
                        :y="part.y"
                        :width="part.width"
                        :height="part.height"
                        :fill="cssColor(bobbinColor)"
                        :class="part.mirror ? 'winding-studio-shadow' : null"
                        :pointer-events="part.mirror ? 'none' : null"
                    />
                    <!-- Field-map overlay: the painter image replaces the passive
                         decoration (margins/insulation) and carries the visible
                         turns; the studio glyphs above stay as interaction targets. -->
                    <image
                        v-if="fieldImage != null"
                        :href="fieldImage.href"
                        :x="fieldImage.x"
                        :y="fieldImage.y"
                        :width="fieldImage.width"
                        :height="fieldImage.height"
                        preserveAspectRatio="none"
                        pointer-events="none"
                        :data-cy="dataTestLabel + '-WindingStudio-field-overlay'"
                    />
                    <!-- Margins -->
                    <template v-if="fieldImage == null">
                        <template v-for="section in model.sections">
                            <rect
                                v-for="(marginRect, index) in marginRects(section)"
                                :key="section.name + 'margin' + index"
                                v-bind="marginRect"
                                :fill="cssColor(marginColor)"
                                opacity="0.8"
                            />
                            <path
                                v-for="(wedgePath, index) in toroidalMarginWedges(section)"
                                :key="section.name + 'wedge' + index"
                                :d="wedgePath"
                                :fill="cssColor(marginColor)"
                                opacity="0.8"
                                pointer-events="none"
                            />
                        </template>
                    </template>
                    <!-- Insulation layers -->
                    <template v-if="fieldImage == null">
                        <template v-for="layer in model.layers">
                            <rect
                                v-if="layer.type === 'insulation'"
                                :key="layer.name"
                                v-bind="layer.rect"
                                :fill="cssColor(insulationColor)"
                                opacity="0.9"
                            />
                        </template>
                    </template>
                    <!-- Section outlines (hover/selection targets). Deliberately UNDER
                         the handles and turns: hit priority is turns > handles > outline,
                         so tooltips and drags never steal each other's zones.
                         Concentric sections are rectangles; toroidal ones annular sectors. -->
                    <template v-for="section in model.sections" :key="'section' + section.name">
                        <path
                            v-if="model.kind === 'toroidal'"
                            :d="section.path"
                            fill="transparent"
                            :stroke="selectedSection === section.name ? '#ffffff' : (section.type === 'conduction' ? '#ffffff55' : 'transparent')"
                            :stroke-dasharray="selectedSection === section.name ? 'none' : '4 3'"
                            stroke-width="1"
                            vector-effect="non-scaling-stroke"
                            class="winding-studio-section"
                            :data-cy="dataTestLabel + '-WindingStudio-section-' + section.name"
                            :data-studio-winding="section.type === 'conduction' && section.windings.length > 0 ? section.windings[0] : null"
                            @mouseenter="onSectionEnter(section, $event)"
                            @mouseleave="tooltip = null"
                            @click="onSectionClick(section)"
                        />
                        <rect
                            v-else
                            v-bind="section.rect"
                            fill="transparent"
                            :stroke="selectedSection === section.name ? '#ffffff' : (section.type === 'conduction' ? '#ffffff55' : 'transparent')"
                            :stroke-dasharray="selectedSection === section.name ? 'none' : '4 3'"
                            stroke-width="1"
                            vector-effect="non-scaling-stroke"
                            class="winding-studio-section"
                            :data-cy="dataTestLabel + '-WindingStudio-section-' + section.name"
                            :data-studio-winding="section.type === 'conduction' && section.windings.length > 0 ? section.windings[0] : null"
                            @mouseenter="onSectionEnter(section, $event)"
                            @mouseleave="tooltip = null"
                            @click="onSectionClick(section)"
                        />
                    </template>
                    <!-- Section boundary handles: drag to re-distribute proportions -->
                    <g v-for="boundary in sectionBoundaries" :key="'boundary' + boundary.id">
                        <rect
                            :x="boundary.x - boundary.hitWidth / 2"
                            :y="boundary.y"
                            :width="boundary.hitWidth"
                            :height="boundary.height"
                            fill="transparent"
                            class="winding-studio-boundary"
                            :data-cy="dataTestLabel + '-WindingStudio-boundary'"
                            @pointerdown="startBoundaryDrag(boundary, $event)"
                            @pointermove="moveBoundaryDrag($event)"
                            @pointerup="endBoundaryDrag($event)"
                            @pointercancel="endBoundaryDrag($event)"
                        />
                        <line
                            v-if="boundaryDrag != null && boundaryDrag.boundary.id === boundary.id"
                            :x1="boundary.x + boundaryDrag.dx"
                            :x2="boundary.x + boundaryDrag.dx"
                            :y1="boundary.y"
                            :y2="boundary.y + boundary.height"
                            stroke="#ffffff"
                            stroke-width="2"
                            stroke-dasharray="5 3"
                            vector-effect="non-scaling-stroke"
                            pointer-events="none"
                        />
                    </g>
                    <!-- Toroidal sector boundaries: drag the angular gap between two
                         adjacent sectors to re-distribute the proportions -->
                    <g v-for="boundary in sectorBoundaries" :key="'sectorboundary' + boundary.id">
                        <path
                            :d="annularSectorPath(boundary.rIn, boundary.rOut, boundary.theta - boundary.hitSpan / 2, boundary.theta + boundary.hitSpan / 2)"
                            fill="transparent"
                            class="winding-studio-boundary"
                            :data-cy="dataTestLabel + '-WindingStudio-sector-boundary'"
                            :data-theta="boundary.theta"
                            :data-r-mid="(boundary.rIn + boundary.rOut) / 2"
                            @pointerdown="startSectorBoundaryDrag(boundary, $event)"
                            @pointermove="moveSectorBoundaryDrag($event)"
                            @pointerup="endSectorBoundaryDrag()"
                            @pointercancel="endSectorBoundaryDrag()"
                        />
                        <path
                            v-if="sectorBoundaryDrag != null && sectorBoundaryDrag.boundary.id === boundary.id"
                            :d="annularSectorPath(boundary.rIn, boundary.rOut, boundary.theta + sectorBoundaryDrag.dTheta - 0.2, boundary.theta + sectorBoundaryDrag.dTheta + 0.2)"
                            fill="#ffffff"
                            opacity="0.9"
                            pointer-events="none"
                        />
                    </g>
                    <!-- Section edge handles: drag against the window wall to set margins -->
                    <g v-for="handle in sectionEdgeHandles" :key="'edge' + handle.id">
                        <rect
                            :x="handle.x"
                            :y="handle.y"
                            :width="handle.width"
                            :height="handle.hitHeight"
                            fill="transparent"
                            class="winding-studio-edge"
                            :data-cy="dataTestLabel + '-WindingStudio-edge-' + handle.side"
                            @pointerdown="startEdgeDrag(handle, $event)"
                            @pointermove="moveEdgeDrag($event)"
                            @pointerup="endEdgeDrag()"
                            @pointercancel="endEdgeDrag()"
                        />
                        <line
                            v-if="edgeDrag != null && edgeDrag.handle.id === handle.id"
                            :x1="handle.x"
                            :x2="handle.x + handle.width"
                            :y1="handle.edgeY + edgeDrag.dy"
                            :y2="handle.edgeY + edgeDrag.dy"
                            stroke="#ffffff"
                            stroke-width="2"
                            stroke-dasharray="5 3"
                            vector-effect="non-scaling-stroke"
                            pointer-events="none"
                        />
                    </g>
                    <!-- Connections (ABT #849): terminal leads and the links between layers and
                         sections, straight from MKF's own routing (get_connection_layout). Drawn
                         BELOW the turns so the turn layer keeps its hover/click primacy, and with
                         the C++ painter's colours so the Studio and the 2D visualizer read the
                         same. Dashed red when MKF declined the blocking — an undisplaced layout
                         must never look like a real one. -->
                    <g v-if="showConnections && connections.markers.length > 0" class="winding-studio-connections">
                        <polyline
                            v-for="route in connections.routes"
                            :key="'route-' + route.key"
                            :points="route.points"
                            fill="none"
                            stroke="#ffffff"
                            stroke-width="0.6"
                            stroke-opacity="0.35"
                            vector-effect="non-scaling-stroke"
                            pointer-events="none"
                        />
                        <rect
                            v-for="marker in connections.markers"
                            :key="'conn-' + marker.key"
                            v-bind="marker.rect"
                            :transform="marker.rotation ? `rotate(${marker.rotation} ${marker.pivotX} ${marker.pivotY})` : null"
                            :fill="connections.declined ? 'none' : connectionFill(marker)"
                            :opacity="connections.declined ? 0.85 : 0.5"
                            :stroke="connections.declined ? '#FF0000' : 'none'"
                            :stroke-dasharray="connections.declined ? '6 4' : null"
                            stroke-width="1"
                            vector-effect="non-scaling-stroke"
                            :data-studio-winding="marker.winding"
                            pointer-events="none"
                        >
                            <title>{{ connectionTitle(marker) }}</title>
                        </rect>
                    </g>
                    <!-- Turns: the TOPMOST hover layer — tooltips are always reachable,
                         and clicking a turn also selects its section. Handles stay
                         grabbable in the turn-free zones (outside the section edges and
                         in the gaps between sections). -->
                    <g v-for="turn in model.turns" :key="turn.name + (turn.isReturn ? '-r' : '')">
                        <circle
                            v-if="turn.round"
                            :cx="turn.rect.x + turn.rect.width / 2"
                            :cy="turn.rect.y + turn.rect.height / 2"
                            :r="turn.rect.width / 2"
                            :fill="turnFill(turn)"
                            :opacity="turnOpacity(turn)"
                            :stroke="hoveredTurn === turn.name ? '#ffffff' : 'none'"
                            stroke-width="1"
                            vector-effect="non-scaling-stroke"
                            :class="['winding-studio-turn', turn.isReturn ? 'winding-studio-shadow' : null]"
                            :data-studio-winding="turn.winding"
                            @mouseenter="onTurnEnter(turn, $event)"
                            @mouseleave="onTurnLeave()"
                            @click="onTurnClick(turn)"
                        />
                        <rect
                            v-else
                            v-bind="turn.rect"
                            :fill="turnFill(turn)"
                            :opacity="turnOpacity(turn)"
                            :stroke="hoveredTurn === turn.name ? '#ffffff' : 'none'"
                            stroke-width="1"
                            vector-effect="non-scaling-stroke"
                            :class="['winding-studio-turn', turn.isReturn ? 'winding-studio-shadow' : null]"
                            :data-studio-winding="turn.winding"
                            @mouseenter="onTurnEnter(turn, $event)"
                            @mouseleave="onTurnLeave()"
                            @click="onTurnClick(turn)"
                        />
                        <!-- Litz cross-section: a strand bundle on top of the disc -->
                        <g
                            v-if="turn.litz && turn.round"
                            :opacity="turnOpacity(turn) * 0.45"
                            pointer-events="none"
                        >
                            <circle
                                v-for="(strand, strandIndex) in litzStrands(turn)"
                                :key="'strand' + strandIndex"
                                class="winding-studio-litz-strand"
                                :cx="strand.cx"
                                :cy="strand.cy"
                                :r="strand.r"
                                fill="#000000"
                            />
                        </g>
                        <!-- PI-Expert visual language: filled center marks the winding start -->
                        <circle
                            v-if="turn.isStart"
                            :cx="turn.rect.x + turn.rect.width / 2"
                            :cy="turn.rect.y + turn.rect.height / 2"
                            :r="turn.rect.width / 6"
                            fill="#000000"
                            opacity="0.6"
                            pointer-events="none"
                        />
                    </g>
                    <!-- Toroidal free transform: reshape the selected annular sector -->
                    <g v-if="sectorTarget != null && drag == null">
                        <line
                            v-if="sectorDrag?.guides?.theta != null"
                            x1="0"
                            y1="0"
                            :x2="model.bounds.width * Math.cos(sectorDrag.guides.theta * Math.PI / 180)"
                            :y2="model.bounds.width * Math.sin(sectorDrag.guides.theta * Math.PI / 180)"
                            stroke="#4fd2ff"
                            stroke-width="1.5"
                            stroke-dasharray="6 4"
                            vector-effect="non-scaling-stroke"
                            pointer-events="none"
                        />
                        <circle
                            v-if="sectorDrag?.guides?.r != null"
                            cx="0"
                            cy="0"
                            :r="sectorDrag.guides.r"
                            fill="none"
                            stroke="#4fd2ff"
                            stroke-width="1.5"
                            stroke-dasharray="6 4"
                            vector-effect="non-scaling-stroke"
                            pointer-events="none"
                        />
                        <path
                            :d="annularSectorPath(sectorLive.rIn, sectorLive.rOut, sectorLive.a0, sectorLive.a1)"
                            fill="#ffffff10"
                            stroke="#ffffff"
                            stroke-width="1.5"
                            :stroke-dasharray="sectorDrag != null ? '6 3' : 'none'"
                            vector-effect="non-scaling-stroke"
                            pointer-events="none"
                        />
                        <path
                            :d="annularSectorPath(sectorLive.rIn + sectorHandleSizes().radial, Math.max(sectorLive.rIn + sectorHandleSizes().radial + 0.05, sectorLive.rOut - sectorHandleSizes().radial), sectorLive.a0 + sectorHandleSizes().angular, Math.max(sectorLive.a0 + sectorHandleSizes().angular + 0.5, sectorLive.a1 - sectorHandleSizes().angular))"
                            fill="transparent"
                            class="winding-studio-transform-move"
                            :data-cy="dataTestLabel + '-WindingStudio-sector-rotate'"
                            @pointerdown="startSectorDrag('rotate', $event)"
                            @pointermove="moveSectorDrag($event)"
                            @pointerup="endSectorDrag()"
                            @pointercancel="endSectorDrag()"
                        />
                        <path
                            v-for="edge in ['a0', 'a1']"
                            :key="'sector' + edge"
                            :d="annularSectorPath(sectorLive.rIn, sectorLive.rOut, (edge === 'a0' ? sectorLive.a0 : sectorLive.a1) - sectorHandleSizes().angular, (edge === 'a0' ? sectorLive.a0 : sectorLive.a1) + sectorHandleSizes().angular)"
                            fill="transparent"
                            class="winding-studio-transform-ew"
                            :data-cy="dataTestLabel + '-WindingStudio-sector-' + edge"
                            @pointerdown="startSectorDrag(edge, $event)"
                            @pointermove="moveSectorDrag($event)"
                            @pointerup="endSectorDrag()"
                            @pointercancel="endSectorDrag()"
                        />
                        <path
                            v-for="edge in ['rIn', 'rOut']"
                            :key="'sector' + edge"
                            :d="annularSectorPath(Math.max(0.02, (edge === 'rIn' ? sectorLive.rIn : sectorLive.rOut) - sectorHandleSizes().radial), (edge === 'rIn' ? sectorLive.rIn : sectorLive.rOut) + sectorHandleSizes().radial, sectorLive.a0, sectorLive.a1)"
                            fill="transparent"
                            class="winding-studio-transform-ns"
                            :data-cy="dataTestLabel + '-WindingStudio-sector-' + edge"
                            @pointerdown="startSectorDrag(edge, $event)"
                            @pointermove="moveSectorDrag($event)"
                            @pointerup="endSectorDrag()"
                            @pointercancel="endSectorDrag()"
                        />
                    </g>
                    <!-- Free transform of the selected section: custom rectangle -->
                    <g v-if="transformTarget != null && model.kind !== 'toroidal' && drag == null">
                        <!-- Snap guides: the edge being dragged stuck to a wall or a
                             neighbouring section's edge -->
                        <line
                            v-if="transformDrag?.guides?.x != null"
                            :x1="transformDrag.guides.x"
                            :x2="transformDrag.guides.x"
                            :y1="model.bounds.y"
                            :y2="model.bounds.y + model.bounds.height"
                            stroke="#4fd2ff"
                            stroke-width="1.5"
                            stroke-dasharray="6 4"
                            vector-effect="non-scaling-stroke"
                            pointer-events="none"
                        />
                        <line
                            v-if="transformDrag?.guides?.y != null"
                            :x1="model.bounds.x"
                            :x2="model.bounds.x + model.bounds.width"
                            :y1="transformDrag.guides.y"
                            :y2="transformDrag.guides.y"
                            stroke="#4fd2ff"
                            stroke-width="1.5"
                            stroke-dasharray="6 4"
                            vector-effect="non-scaling-stroke"
                            pointer-events="none"
                        />
                        <rect
                            :x="transformRect.x"
                            :y="transformRect.y"
                            :width="transformRect.width"
                            :height="transformRect.height"
                            fill="#ffffff10"
                            stroke="#ffffff"
                            stroke-width="1.5"
                            :stroke-dasharray="transformDrag != null ? '6 3' : 'none'"
                            vector-effect="non-scaling-stroke"
                            class="winding-studio-transform-move"
                            :data-cy="dataTestLabel + '-WindingStudio-transform-move'"
                            @pointerdown="startTransformDrag('move', $event)"
                            @pointermove="moveTransformDrag($event)"
                            @pointerup="endTransformDrag()"
                            @pointercancel="endTransformDrag()"
                        />
                        <rect
                            v-for="side in ['n', 's', 'w', 'e']"
                            :key="'transform' + side"
                            :x="side === 'e' ? transformRect.x + transformRect.width - transformThickness() / 2
                                : side === 'w' ? transformRect.x - transformThickness() / 2 : transformRect.x"
                            :y="side === 's' ? transformRect.y + transformRect.height - transformThickness() / 2
                                : side === 'n' ? transformRect.y - transformThickness() / 2 : transformRect.y"
                            :width="side === 'n' || side === 's' ? transformRect.width : transformThickness()"
                            :height="side === 'w' || side === 'e' ? transformRect.height : transformThickness()"
                            fill="transparent"
                            :class="side === 'n' || side === 's' ? 'winding-studio-transform-ns' : 'winding-studio-transform-ew'"
                            :data-cy="dataTestLabel + '-WindingStudio-transform-' + side"
                            @pointerdown="startTransformDrag(side, $event)"
                            @pointermove="moveTransformDrag($event)"
                            @pointerup="endTransformDrag()"
                            @pointercancel="endTransformDrag()"
                        />
                    </g>
                    <!-- Drop slots: the core legs light up while a chip is dragged -->
                    <g v-if="drag != null">
                        <g v-for="column in model.core.columns" :key="'slot' + column.index">
                            <rect
                                v-bind="column.rect"
                                :data-studio-column="column.index"
                                :fill="dropColumn === column.index ? drag.color : '#ffffff'"
                                :opacity="dropColumn === column.index ? 0.55 : 0.18"
                                :stroke="drag.color"
                                stroke-width="2"
                                vector-effect="non-scaling-stroke"
                                class="winding-studio-slot"
                            />
                            <text
                                :x="column.rect.x + column.rect.width / 2"
                                :y="column.rect.y + column.rect.height / 2"
                                text-anchor="middle"
                                dominant-baseline="middle"
                                class="winding-studio-slot-label"
                                :style="{ fontSize: Math.min(column.rect.width * 0.28, model.bounds.height * 0.05) + 'px' }"
                            >{{ columnLabel(column) }}</text>
                        </g>
                    </g>
                </svg>
                <div
                    v-if="tooltip != null"
                    class="winding-studio-tooltip"
                    :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
                >
                    <div v-for="line in tooltip.lines" :key="line">{{ line }}</div>
                </div>
                <!-- Interleave menu: chip dropped on another winding -->
                <div
                    v-if="interleaveMenu != null"
                    class="winding-studio-menu"
                    :style="{ left: interleaveMenu.x + 'px', top: interleaveMenu.y + 'px' }"
                    :data-cy="dataTestLabel + '-WindingStudio-interleave-menu'"
                >
                    <div class="winding-studio-menu-title">{{ interleaveMenu.source }} ⇄ {{ interleaveMenu.target }}</div>
                    <button
                        type="button"
                        :data-cy="dataTestLabel + '-WindingStudio-interleave-interleave'"
                        @click="pickInterleaveAction('interleave')"
                    >Interleave</button>
                    <button
                        type="button"
                        :data-cy="dataTestLabel + '-WindingStudio-interleave-swap'"
                        @click="pickInterleaveAction('swap')"
                    >Swap order</button>
                    <button
                        type="button"
                        :data-cy="dataTestLabel + '-WindingStudio-interleave-clear'"
                        @click="pickInterleaveAction('clear')"
                    >Clear interleaving</button>
                    <button
                        v-if="!windingsAreGrouped(interleaveMenu.source, interleaveMenu.target)"
                        type="button"
                        :data-cy="dataTestLabel + '-WindingStudio-interleave-group'"
                        :disabled="groupingBlockReason(interleaveMenu.source, interleaveMenu.target) != null"
                        title="Wind both windings simultaneously, sharing sections and layers (bifilar/multifilar); different isolation sides JOIN"
                        @click="pickInterleaveAction('group')"
                    >Wind together (bifilar)</button>
                    <div
                        v-if="!windingsAreGrouped(interleaveMenu.source, interleaveMenu.target)
                            && groupingBlockReason(interleaveMenu.source, interleaveMenu.target) != null"
                        class="winding-studio-group-warning winding-studio-group-blocked"
                    >🚫 {{ groupingBlockReason(interleaveMenu.source, interleaveMenu.target) }}</div>
                    <button
                        v-else
                        type="button"
                        :data-cy="dataTestLabel + '-WindingStudio-interleave-ungroup'"
                        @click="pickInterleaveAction('ungroup')"
                    >Stop winding together</button>
                    <button type="button" class="winding-studio-menu-cancel" @click="interleaveMenu = null">Cancel</button>
                </div>
                <!-- Winding groups editor: the wound-together partition -->
                <div
                    v-if="groupsMenu != null"
                    class="winding-studio-menu"
                    :style="{ left: groupsMenu.x + 'px', top: groupsMenu.y + 'px' }"
                    :data-cy="dataTestLabel + '-WindingStudio-groups-menu'"
                >
                    <div class="winding-studio-menu-title">Wound together (bifilar groups)</div>
                    <div
                        v-for="(row, rowIndex) in groupsMenuRows"
                        :key="'group-row' + rowIndex"
                        class="winding-studio-group-row"
                    >
                        <span class="winding-studio-group-label">{{ rowIndex < groupsMenu.rows.length ? 'Group ' + (rowIndex + 1) : 'New group' }}</span>
                        <button
                            v-for="windingName in model.windingNames"
                            :key="'group' + rowIndex + windingName"
                            type="button"
                            class="winding-studio-group-toggle"
                            :class="{ 'winding-studio-group-toggle-on': row.includes(windingName) }"
                            :disabled="!row.includes(windingName) && groupEligibilityReason(windingName, row) != null"
                            :title="groupEligibilityReason(windingName, row) ?? null"
                            :data-cy="dataTestLabel + '-WindingStudio-group-' + rowIndex + '-' + windingName"
                            @click="toggleGroupMembership(rowIndex, windingName)"
                        >{{ windingName }}</button>
                        <div v-if="groupRowTurnsWarning(row) != null" class="winding-studio-group-warning">⚠ {{ groupRowTurnsWarning(row) }}</div>
                        <div v-if="groupRowSideJoinNotice(row) != null" class="winding-studio-group-warning">⚠ {{ groupRowSideJoinNotice(row) }}</div>
                        <div
                            v-for="reasonLine in groupRowBlockReasons(row)"
                            :key="'blocked' + reasonLine"
                            class="winding-studio-group-warning winding-studio-group-blocked"
                        >🚫 {{ reasonLine }}</div>
                    </div>
                    <button
                        type="button"
                        :data-cy="dataTestLabel + '-WindingStudio-groups-apply'"
                        @click="applyGroupsMenu()"
                    >Apply</button>
                    <button type="button" class="winding-studio-menu-cancel" @click="groupsMenu = null">Cancel</button>
                </div>
                <!-- Per-window layout panel -->
                <div
                    v-if="windowMenu != null"
                    class="winding-studio-menu"
                    :style="{ left: windowMenu.x + 'px', top: windowMenu.y + 'px' }"
                    :data-cy="dataTestLabel + '-WindingStudio-window-menu'"
                >
                    <div class="winding-studio-menu-title">{{ windowMenu.label }} layout</div>
                    <label class="winding-studio-menu-field">
                        Sections
                        <select
                            v-model="windowMenu.sectionsOrientation"
                            :data-cy="dataTestLabel + '-WindingStudio-window-orientation'"
                        >
                            <option value="overlapping">overlapping</option>
                            <option value="contiguous">contiguous</option>
                        </select>
                    </label>
                    <label class="winding-studio-menu-field">
                        Alignment
                        <select
                            v-model="windowMenu.sectionsAlignment"
                            :data-cy="dataTestLabel + '-WindingStudio-window-alignment'"
                        >
                            <option value="innerOrTop">{{ alignmentLabel('innerOrTop', windowMenu.sectionsOrientation, 'sections', windowMenu.lateralWound) }}</option>
                            <option value="centered">centered</option>
                            <option value="outerOrBottom">{{ alignmentLabel('outerOrBottom', windowMenu.sectionsOrientation, 'sections', windowMenu.lateralWound) }}</option>
                            <option value="spread">spread</option>
                        </select>
                    </label>
                    <label class="winding-studio-menu-field">
                        Winding order
                        <select
                            v-model="windowMenu.windingOrder"
                            :data-cy="dataTestLabel + '-WindingStudio-window-winding-order'"
                            title="Z winds every layer in the same direction with a return wire; U alternates direction every layer (back-and-forth)"
                        >
                            <option value="Z">Z — same direction, return wire</option>
                            <option value="U">U — alternating (back-and-forth)</option>
                        </select>
                    </label>
                    <button
                        type="button"
                        :data-cy="dataTestLabel + '-WindingStudio-window-apply'"
                        @click="applyWindowMenu()"
                    >Apply</button>
                    <button type="button" class="winding-studio-menu-cancel" @click="windowMenu = null">Cancel</button>
                </div>
                <!-- Per-section layout panel (selected section only) -->
                <div
                    v-if="sectionMenu != null"
                    class="winding-studio-menu"
                    :style="{ left: sectionMenu.x + 'px', top: sectionMenu.y + 'px' }"
                    :data-cy="dataTestLabel + '-WindingStudio-section-menu'"
                >
                    <div class="winding-studio-menu-title">{{ sectionMenu.sectionName }}</div>
                    <label class="winding-studio-menu-field">
                        Layers
                        <select
                            v-model="sectionMenu.layersOrientation"
                            :data-cy="dataTestLabel + '-WindingStudio-section-layers-orientation'"
                        >
                            <option value="overlapping">overlapping</option>
                            <option value="contiguous">contiguous</option>
                        </select>
                    </label>
                    <label class="winding-studio-menu-field">
                        Turns
                        <select
                            v-model="sectionMenu.turnsAlignment"
                            :data-cy="dataTestLabel + '-WindingStudio-section-turns-alignment'"
                        >
                            <option value="innerOrTop">{{ alignmentLabel('innerOrTop', sectionMenu.layersOrientation, 'turns', sectionMenu.lateralWound) }}</option>
                            <option value="centered">centered</option>
                            <option value="outerOrBottom">{{ alignmentLabel('outerOrBottom', sectionMenu.layersOrientation, 'turns', sectionMenu.lateralWound) }}</option>
                            <option value="spread">spread</option>
                        </select>
                    </label>
                    <label
                        v-if="sectionMenu.windingName != null && sectionMenu.numberParallels > 1"
                        class="winding-studio-menu-field"
                        :title="'How the ' + sectionMenu.numberParallels + ' parallels of ' + sectionMenu.windingName + ' are laid'"
                    >
                        Parallels
                        <select
                            v-model="sectionMenu.windingStyle"
                            :data-cy="dataTestLabel + '-WindingStudio-section-winding-style'"
                        >
                            <option value="">auto{{ sectionMenu.currentWindingStyle != null ? (' (' + (sectionMenu.currentWindingStyle === 'windByConsecutiveParallels' ? 'multifilar' : 'turn by turn') + ')') : '' }}</option>
                            <option value="windByConsecutiveParallels">multifilar — together</option>
                            <option value="windByConsecutiveTurns">turn by turn — split</option>
                        </select>
                    </label>
                    <button
                        type="button"
                        :data-cy="dataTestLabel + '-WindingStudio-section-apply'"
                        @click="applySectionMenu()"
                    >Apply</button>
                    <button type="button" class="winding-studio-menu-cancel" @click="sectionMenu = null">Cancel</button>
                </div>
                <div v-if="busy" class="winding-studio-busy">winding…</div>
            </div>
            <Teleport to="body">
                <div
                    v-if="drag != null"
                    class="winding-studio-ghost"
                    :style="{ left: drag.x + 'px', top: drag.y + 'px', '--chip-color': drag.color }"
                >
                    <span class="winding-studio-chip-dot"></span>{{ drag.winding }}
                </div>
            </Teleport>
        </template>
    </div>
    </Teleport>
</template>

<style scoped>
.winding-studio {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    box-sizing: border-box;
    overflow: hidden;
}
.winding-studio-empty {
    padding: 1rem;
    opacity: 0.7;
    font-style: italic;
    text-align: center;
}
.winding-studio-toolbar {
    display: flex;
    align-items: center;
    gap: 0.15rem 0.5rem;
    flex-wrap: wrap;
    font-size: 0.78rem;
    line-height: 1.3;
}
.winding-studio-title {
    font-weight: 600;
    opacity: 0.9;
    font-size: 0.8rem;
}
.winding-studio-maximize {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.15rem 0.35rem;
}
.winding-studio-maximize:hover {
    border-color: rgba(255, 255, 255, 0.6);
}
.winding-studio-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1999;
}
.winding-studio-maximized {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    bottom: 1.5rem;
    left: 1.5rem;
    width: auto;
    z-index: 2000;
    background: #1d1d1f;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 1rem;
    overflow: hidden;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
}
.winding-studio-maximized .winding-studio-plot {
    flex: 1;
    min-height: 0;
}
.winding-studio-maximized .winding-studio-svg {
    width: 100%;
    height: 100%;
    max-height: none;
}
.winding-studio-legend {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
}
.winding-studio-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid var(--chip-color);
    border-radius: 1rem;
    background: transparent;
    color: inherit;
    padding: 0 0.45rem;
    font-size: 0.75rem;
    cursor: default;
}
.winding-studio-chip-dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--chip-color);
    display: inline-block;
}
.winding-studio-custom-chip {
    --chip-color: #ffffff88;
    cursor: pointer;
}
.winding-studio-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    opacity: 0.85;
}
.winding-studio-plot {
    position: relative;
    width: 100%;
}
.winding-studio-svg {
    width: 100%;
    max-height: 45vh;
    display: block;
}
.winding-studio-turn {
    cursor: pointer;
}
/* The passive far side of a winding (return crossings, mirrored bobbin
   half): darker/shadowed so the interactive side reads as primary. */
.winding-studio-shadow {
    filter: brightness(0.55);
}
.winding-studio-section {
    cursor: pointer;
}
.winding-studio-tooltip {
    position: absolute;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.85);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    white-space: nowrap;
    z-index: 10;
}
.winding-studio-chip-draggable {
    cursor: grab;
    touch-action: none;
}
.winding-studio-hint {
    font-size: 0.7rem;
    opacity: 0.6;
    font-style: italic;
}
.winding-studio-fit {
    font-size: 0.75rem;
    padding: 0 0.45rem;
    border-radius: 1rem;
    border: 1px solid transparent;
}
.winding-studio-fit-good {
    color: #7fd48a;
    border-color: #7fd48a55;
}
.winding-studio-fit-bad {
    color: #ff8b8b;
    border-color: #ff8b8b88;
}
.winding-studio-slot {
    cursor: copy;
}
.winding-studio-boundary {
    cursor: col-resize;
    touch-action: none;
}
.winding-studio-edge {
    cursor: row-resize;
    touch-action: none;
}
.winding-studio-transform-move {
    cursor: move;
    touch-action: none;
}
.winding-studio-transform-ns {
    cursor: ns-resize;
    touch-action: none;
}
.winding-studio-transform-ew {
    cursor: ew-resize;
    touch-action: none;
}
.winding-studio-slot-label {
    fill: #ffffff;
    pointer-events: none;
    font-weight: 600;
}
.winding-studio-menu {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: rgba(0, 0, 0, 0.92);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    padding: 0.4rem 0.5rem;
    font-size: 0.8rem;
    z-index: 20;
    min-width: 10rem;
}
.winding-studio-menu-title {
    font-weight: 600;
    opacity: 0.85;
    margin-bottom: 0.15rem;
    white-space: nowrap;
}
.winding-studio-menu button {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    text-align: left;
    padding: 0.2rem 0.4rem;
}
.winding-studio-menu button:hover {
    border-color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.08);
}
.winding-studio-menu-cancel {
    opacity: 0.6;
}
.winding-studio-menu-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}
.winding-studio-menu-field select {
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
    padding: 0.1rem 0.2rem;
}
.winding-studio-menu-field select option {
    color: #000000;
}
.winding-studio-chip-link {
    margin-left: 0.2rem;
    font-size: 0.65rem;
    opacity: 0.8;
}
.winding-studio-group-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
    padding: 0.1rem 0;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.winding-studio-group-label {
    opacity: 0.65;
    min-width: 4.5rem;
    font-size: 0.72rem;
}
.winding-studio-group-toggle {
    border-radius: 1rem !important;
    padding: 0 0.45rem !important;
    opacity: 0.7;
}
.winding-studio-group-toggle-on {
    border-color: #ffd166 !important;
    background: rgba(255, 209, 102, 0.15) !important;
    opacity: 1;
}
.winding-studio-group-toggle:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}
.winding-studio-group-warning {
    flex-basis: 100%;
    font-size: 0.68rem;
    color: #ffd166;
    opacity: 0.9;
}
.winding-studio-group-blocked {
    color: #ff8b8b;
}
.winding-studio-busy {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    color: #ffffff;
    font-weight: 600;
    z-index: 5;
}
.winding-studio-ghost {
    position: fixed;
    transform: translate(12px, 12px);
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: 1px solid var(--chip-color);
    border-radius: 1rem;
    background: rgba(0, 0, 0, 0.8);
    color: #ffffff;
    padding: 0.05rem 0.5rem;
    font-size: 0.8rem;
    pointer-events: none;
    /* Above the maximized modal (z 2000) so chip drags — including the
       interleave gesture — stay visible in full-screen mode too. */
    z-index: 3000;
}
</style>
