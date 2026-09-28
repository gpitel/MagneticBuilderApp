// Pure view-model builders for the Winding Studio SVG cross-section.
//
// Inputs are plain MAS JSON (magnetic.core / magnetic.coil). Outputs are plain
// objects in SVG coordinates: MILLIMETERS, y already flipped (SVG y grows down,
// physical y grows up). No physics here: the C++ winder (via WASM) computed
// every coordinate and dimension; this module only arranges them for display.
// If the studio and the WASM painter ever disagree visually, the painter is
// the reference and this module is the bug.

import { effectiveBobbin } from '/WebSharedComponents/assets/js/utils.js';

const MM = 1000;

function rectFromCenter(cx, cy, width, height) {
    // Physical center (m) + dimensions (m) -> SVG rect (mm, y flipped).
    return {
        x: cx * MM - (width * MM) / 2,
        y: -cy * MM - (height * MM) / 2,
        width: width * MM,
        height: height * MM,
    };
}

function rectKey(r) {
    // Key for dedup: winding windows repeat the same region once per wound-column edge.
    return [r.x, r.y, r.width, r.height].map((v) => v.toFixed(6)).join('|');
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

// The cross-section of every concentric (two-piece set) core reduces to the
// outer silhouette rectangle minus the winding-window cavities. Whether a
// mirrored cavity exists on the other side of the main column is data-driven:
// it does iff the core has a lateral column on that side (E-family yes, U no).
export function buildCoreView(core) {
    const processed = core.processedDescription;
    if (processed == null) {
        return null;
    }
    const columns = processed.columns ?? [];
    const windows = processed.windingWindows ?? [];
    if (columns.length === 0 || windows.length === 0) {
        return null;
    }

    const outer = rectFromCenter(0, 0, processed.width, processed.height);

    // Cavities are derived from the COLUMNS (central column edge -> each
    // lateral column's inner edge), not from the windingWindows entries:
    // wound-MAS files in the wild carry two different conventions for a core
    // window's `coordinates` (region center vs inner edge), while the column
    // geometry is unambiguous and matches both.
    const cavities = [];
    const central = columns.find((column) => column.type === 'central') ?? columns[0];
    const laterals = columns.filter((column) => column.type === 'lateral');
    if (laterals.length > 0) {
        const xInner = Math.abs(central.coordinates[0]) + central.width / 2;
        for (const lateral of laterals) {
            const side = lateral.coordinates[0] < 0 ? -1 : 1;
            const xOuter = Math.abs(lateral.coordinates[0]) - lateral.width / 2;
            if (xOuter <= xInner) {
                continue;
            }
            const height = lateral.height ?? central.height ?? processed.height;
            cavities.push({
                x: (side < 0 ? -xOuter : xInner) * MM,
                y: -(lateral.coordinates[1] ?? 0) * MM - (height * MM) / 2,
                width: (xOuter - xInner) * MM,
                height: height * MM,
            });
        }
    }
    else {
        // No lateral columns (e.g. exotic shapes): fall back to the window
        // entries, mirroring like the two-piece painter does.
        const seen = new Set();
        for (const window of windows) {
            if (window.coordinates == null || window.width == null || window.height == null) {
                continue;
            }
            const rect = rectFromCenter(window.coordinates[0], window.coordinates[1] ?? 0, window.width, window.height);
            for (const candidate of [rect, { ...rect, x: -rect.x - rect.width }]) {
                const key = rectKey(candidate);
                if (!seen.has(key)) {
                    seen.add(key);
                    cavities.push(candidate);
                }
            }
        }
    }

    // Gaps: drawn as breaks in the column (painter draws them background-colored).
    const gaps = [];
    for (const gap of core.functionalDescription?.gapping ?? []) {
        if (gap.coordinates == null || gap.length == null) {
            continue;
        }
        const column = findColumnAt(columns, gap.coordinates[0]);
        if (column == null) {
            continue;
        }
        gaps.push({
            ...rectFromCenter(gap.coordinates[0], gap.coordinates[1] ?? 0, column.width, gap.length),
            type: gap.type,
        });
    }

    const columnViews = columns.map((column, index) => ({
        index,
        type: column.type,
        shape: column.shape,
        rect: rectFromCenter(column.coordinates[0], column.coordinates[1] ?? 0, column.width, column.height ?? processed.height),
    }));

    return { outer, cavities, gaps, columns: columnViews };
}

function findColumnAt(columns, x) {
    let best = null;
    let bestDistance = Infinity;
    for (const column of columns) {
        const distance = Math.abs(column.coordinates[0] - x);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = column;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// Bobbin
// ---------------------------------------------------------------------------

// One U-duct per distinct winding-window region: a column wall on the side of
// the wound column plus top/bottom walls. Faithful enough for the studio; the
// painter remains the reference for print-quality drawings.
export function buildBobbinView(coil, coreView) {
    const bobbin = effectiveBobbin(coil?.bobbin);
    const processed = typeof bobbin === 'object' ? bobbin?.processedDescription : null;
    if (processed == null || coreView == null) {
        return [];
    }
    const columnThickness = processed.columnThickness ?? 0;
    const wallThickness = processed.wallThickness ?? 0;
    if (columnThickness <= 0 && wallThickness <= 0) {
        return [];
    }

    const windows = processed.windingWindows ?? [];
    // Prefer the WOUND GROUP regions: when a lateral winding shares a window
    // region with the main winding's annulus, the engine splits the region
    // between them (split_shared_window_groups) — each duct then spans its
    // group's half instead of the full window. Coils without groups (or with
    // polar ones) fall back to the windows.
    const groupRegions = (coil?.groupsDescription ?? [])
        .filter((group) => group.coordinateSystem !== 'polar'
            && group.coordinates != null && group.dimensions != null
            && (group.partialWindings?.length ?? 0) > 0)
        .map((group) => ({
            coordinates: group.coordinates,
            width: group.dimensions[0],
            height: group.dimensions[1],
            column: windows[group.windingWindow ?? 0]?.column ?? 0,
        }));
    const regions = groupRegions.length > 0
        ? groupRegions
        : windows.map((window) => ({
            coordinates: window.coordinates,
            width: window.width,
            height: window.height,
            column: window.column ?? 0,
        }));

    const parts = [];
    const seen = new Set();
    for (const window of regions) {
        if (window.coordinates == null || window.width == null || window.height == null) {
            continue;
        }
        const rect = rectFromCenter(window.coordinates[0], window.coordinates[1] ?? 0, window.width, window.height);
        const key = rectKey(rect);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);

        // The wall sits between the window and the column it wraps: the wound
        // column is the nearest one on the window's own side (main column for
        // window 0, the lateral leg for lateral windows).
        const columnIndex = window.column;
        const column = coreView.columns[columnIndex] ?? coreView.columns[0];
        const columnCenterX = column.rect.x + column.rect.width / 2;
        const windowCenterX = rect.x + rect.width / 2;
        const wallOnLeft = columnCenterX < windowCenterX;

        const regionParts = [];
        if (columnThickness > 0) {
            regionParts.push({
                x: wallOnLeft ? rect.x - columnThickness * MM : rect.x + rect.width,
                y: rect.y - wallThickness * MM,
                width: columnThickness * MM,
                height: rect.height + 2 * wallThickness * MM,
            });
        }
        if (wallThickness > 0) {
            for (const side of [-1, 1]) {
                regionParts.push({
                    x: rect.x,
                    y: side < 0 ? rect.y - wallThickness * MM : rect.y + rect.height,
                    width: rect.width,
                    height: wallThickness * MM,
                });
            }
        }
        parts.push(...regionParts);
        // A CENTRAL-column winding is an annulus: its bobbin physically crosses
        // the section plane on the far side of the center leg too. Draw that
        // half mirrored, marked as the passive (shadowed, non-interactive) side
        // — same convention as the turns' return crossings.
        if (column?.type === 'central') {
            for (const part of regionParts) {
                parts.push({ ...part, x: -(part.x + part.width), mirror: true });
            }
        }
    }
    return parts;
}

// ---------------------------------------------------------------------------
// Windows / sections / layers / turns
// ---------------------------------------------------------------------------

export function buildWindowViews(coil, core) {
    // Prefer the bobbin windows (that is where sections actually live); fall
    // back to the core ones so the studio still draws around a "Dummy" bobbin.
    const mergedBobbin = effectiveBobbin(coil?.bobbin);
    const bobbinProcessed = typeof mergedBobbin === 'object' ? mergedBobbin?.processedDescription : null;
    const windows = bobbinProcessed?.windingWindows ?? core?.processedDescription?.windingWindows ?? [];
    return windows
        .map((window, index) => {
            if (window.coordinates == null || window.width == null || window.height == null) {
                return null;
            }
            return {
                index,
                column: window.column ?? null,
                sectionsOrientation: window.sectionsOrientation ?? null,
                sectionsAlignment: window.sectionsAlignment ?? null,
                // U/Z: how consecutive layers are wound in this window. Null means
                // unset, which the engine reads as Z.
                windingOrder: window.windingOrder ?? null,
                rect: rectFromCenter(window.coordinates[0], window.coordinates[1] ?? 0, window.width, window.height),
            };
        })
        .filter(Boolean);
}

// MAS section margin comes in two schema shapes: the engine emits the
// 2-number array, the Insulation panel writes the marginInfo object
// ({topOrLeftWidth, bottomOrRightWidth}). The view model normalizes to
// [topOrLeft, bottomOrRight] so the studio ALWAYS draws margin tape
// regardless of who set it.
function resolveMarginPair(margin) {
    if (margin == null) {
        return null;
    }
    if (Array.isArray(margin)) {
        return [margin[0] ?? 0, margin[1] ?? 0];
    }
    return [margin.topOrLeftWidth ?? 0, margin.bottomOrRightWidth ?? 0];
}

export function buildSectionViews(coil) {
    const sections = coil?.sectionsDescription ?? [];
    return sections
        .map((section) => {
            if (section.coordinates == null || section.dimensions == null) {
                return null;
            }
            return {
                name: section.name,
                type: section.type,
                windingWindow: section.windingWindow ?? 0,
                windings: (section.partialWindings ?? []).map((partial) => partial.winding),
                fillingFactor: section.fillingFactor ?? null,
                margin: resolveMarginPair(section.margin),
                layersOrientation: section.layersOrientation ?? null,
                windingStyle: section.windingStyle ?? null,
                rect: rectFromCenter(section.coordinates[0], section.coordinates[1], section.dimensions[0], section.dimensions[1]),
            };
        })
        .filter(Boolean);
}

export function buildLayerViews(coil) {
    const layers = coil?.layersDescription ?? [];
    return layers
        .map((layer) => {
            if (layer.coordinates == null || layer.dimensions == null) {
                return null;
            }
            return {
                name: layer.name,
                type: layer.type,
                section: layer.section ?? null,
                turnsAlignment: layer.turnsAlignment ?? null,
                rect: rectFromCenter(layer.coordinates[0], layer.coordinates[1], layer.dimensions[0], layer.dimensions[1]),
            };
        })
        .filter(Boolean);
}

// Litz wire cross-sections render as a strand bundle instead of a plain disc.
// Wire objects carry type; by-name wires are recognized by the DB's 'Litz '
// naming convention (display-only heuristic — no physics rides on it).
function litzWindingNames(coil) {
    const names = new Set();
    for (const winding of coil?.functionalDescription ?? []) {
        const wire = winding.wire;
        const isLitz = (typeof wire === 'object' && wire?.type === 'litz')
            || (typeof wire === 'string' && wire.toLowerCase().startsWith('litz'));
        if (isLitz) {
            names.add(winding.name);
        }
    }
    return names;
}

export function buildTurnViews(coil) {
    const turns = coil?.turnsDescription ?? [];
    const views = [];
    const firstTurnSeen = new Set();
    const litzWindings = litzWindingNames(coil);
    for (const turn of turns) {
        if (turn.coordinates == null || turn.dimensions == null) {
            continue;
        }
        const round = turn.crossSectionalShape !== 'rectangular';
        const key = `${turn.winding}|${turn.parallel}`;
        const isStart = !firstTurnSeen.has(key);
        firstTurnSeen.add(key);

        const base = {
            name: turn.name,
            winding: turn.winding,
            parallel: turn.parallel ?? 0,
            section: turn.section ?? null,
            layer: turn.layer ?? null,
            round,
            isStart,
            litz: litzWindings.has(turn.winding),
        };
        views.push({
            ...base,
            isReturn: false,
            rect: rectFromCenter(turn.coordinates[0], turn.coordinates[1], turn.dimensions[0], turn.dimensions[1]),
        });
        // The winder emits the extra window crossings of off-axis loops (e.g. a
        // lateral-leg turn crossing the main window on its way back).
        for (const coordinates of turn.additionalCoordinates ?? []) {
            views.push({
                ...base,
                isStart: false,
                isReturn: true,
                rect: rectFromCenter(coordinates[0], coordinates[1], turn.dimensions[0], turn.dimensions[1]),
            });
        }
    }
    return views;
}

// ---------------------------------------------------------------------------
// Toroidal
// ---------------------------------------------------------------------------

// Top view, mm, centered at the origin. MAS toroidal conventions (verified
// against the winder + painter): the winding window is the inner hole (radius
// = windingWindows[0].radialHeight); a section is an annular sector with polar
// coordinates [radial inset from the ring's inner wall toward the center,
// center angle in degrees] and dimensions [radial band, angular span in
// degrees]. Turns come as cartesian top-view coordinates (their outer return
// crossings sit outside the ring).
//
// ORIENTATION: unlike the two-piece cross-section (y flipped, physical y up),
// the toroidal view maps data y DOWN the screen — because the painter does:
// MKF's export_svg wraps toroidal SVGs in an extra scale(1,-1) group, so its
// displayed toroid is the vertical mirror of the raw coordinates. The painter
// is the display reference, so the studio mirrors the same way; a section at
// data angle +90deg renders at the bottom in BOTH.

function polarPoint(radius, angleDegrees) {
    const angle = (angleDegrees * Math.PI) / 180;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

// Chord-based wound-distance → angle, mirroring MKF's wound_distance_to_angle
// (2·asin(d/2r) in degrees). Returns null when the distance cannot fit.
export function woundDistanceToAngleDeg(distanceMm, radiusMm) {
    if (radiusMm <= 0) {
        return null;
    }
    const ratio = distanceMm / 2 / radiusMm;
    if (ratio > 1) {
        return null;
    }
    return (2 * Math.asin(ratio) * 180) / Math.PI;
}

export function annularSectorPath(innerRadius, outerRadius, startAngle, endAngle) {
    const span = endAngle - startAngle;
    if (span >= 360 - 1e-9) {
        // Full ring: two circles, even-odd.
        const circle = (r) => `M ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 Z`;
        return `${circle(outerRadius)} ${circle(innerRadius)}`;
    }
    const largeArc = span > 180 ? 1 : 0;
    const [ox0, oy0] = polarPoint(outerRadius, startAngle);
    const [ox1, oy1] = polarPoint(outerRadius, endAngle);
    const [ix0, iy0] = polarPoint(innerRadius, startAngle);
    const [ix1, iy1] = polarPoint(innerRadius, endAngle);
    // Data y maps down the screen (painter-matched mirror), so increasing data
    // angle follows SVG's positive-angle direction: sweep-flag 1 on the way out.
    return `M ${ox0} ${oy0} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${ox1} ${oy1} `
        + `L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix0} ${iy0} Z`;
}

function buildToroidalSectionViews(coil, windowRadiusMm) {
    const sections = coil?.sectionsDescription ?? [];
    return sections
        .map((section) => {
            if (section.coordinates == null || section.dimensions == null) {
                return null;
            }
            const rCenter = windowRadiusMm - section.coordinates[0] * MM;
            const rBand = section.dimensions[0] * MM;
            const thetaCenter = section.coordinates[1];
            const thetaSpan = section.dimensions[1];
            const rIn = Math.max(0, rCenter - rBand / 2);
            const rOut = rCenter + rBand / 2;
            const outerPoint = polarPoint(rOut, thetaCenter);
            return {
                name: section.name,
                type: section.type,
                windingWindow: section.windingWindow ?? 0,
                windings: (section.partialWindings ?? []).map((partial) => partial.winding),
                fillingFactor: section.fillingFactor ?? null,
                margin: resolveMarginPair(section.margin),
                layersOrientation: section.layersOrientation ?? null,
                windingStyle: section.windingStyle ?? null,
                polar: { rCenter, rBand, thetaCenter, thetaSpan },
                path: annularSectorPath(rIn, rOut, thetaCenter - thetaSpan / 2, thetaCenter + thetaSpan / 2),
                // Bounding rect kept for the shared bounds/tooltip machinery.
                rect: {
                    x: Math.min(outerPoint[0], -rOut),
                    y: Math.min(outerPoint[1], -rOut),
                    width: rOut * 2,
                    height: rOut * 2,
                },
            };
        })
        .filter(Boolean);
}

function buildToroidalStudioModel(magnetic) {
    const core = magnetic.core;
    const coil = magnetic.coil;
    const processed = core.processedDescription;
    if (processed == null || (processed.columns ?? []).length === 0) {
        return { valid: false, reason: 'Core has no processed description yet' };
    }
    const outerRadius = (processed.width * MM) / 2;
    const column = processed.columns[0];
    const innerRadius = outerRadius - column.width * MM;
    const windows = processed.windingWindows ?? [];
    const windowRadius = windows.length > 0 && windows[0].radialHeight != null
        ? windows[0].radialHeight * MM
        : innerRadius;

    const sections = buildToroidalSectionViews(coil, windowRadius);
    // buildTurnViews flips y for the two-piece convention (physical y up); the
    // toroidal view is painter-matched with data y DOWN, so mirror the glyphs
    // back around y=0 (see the orientation note above).
    const turns = buildTurnViews(coil).map((turn) => ({
        ...turn,
        rect: { ...turn.rect, y: -(turn.rect.y + turn.rect.height) },
    }));

    let extent = outerRadius;
    for (const turn of turns) {
        extent = Math.max(extent,
            Math.abs(turn.rect.x), Math.abs(turn.rect.y),
            Math.abs(turn.rect.x + turn.rect.width), Math.abs(turn.rect.y + turn.rect.height));
    }
    const margin = extent * 0.04;
    const bounds = { x: -extent - margin, y: -extent - margin, width: 2 * (extent + margin), height: 2 * (extent + margin) };

    // Margin wedges need the window-level orientation (contiguous → angular
    // spacers at the sector edges; overlapping → radial bands).
    const bobbinWindow = effectiveBobbin(coil?.bobbin)?.processedDescription?.windingWindows?.[0] ?? null;

    return {
        valid: true,
        kind: 'toroidal',
        bounds,
        core: { ring: { outerRadius, innerRadius }, columns: [], cavities: [], gaps: [], outer: { x: -outerRadius, y: -outerRadius, width: 2 * outerRadius, height: 2 * outerRadius } },
        bobbin: [],
        windows: [],
        windowRadius,
        sectionsOrientation: bobbinWindow?.sectionsOrientation ?? null,
        sections,
        layers: [],
        turns,
        windingNames: (coil.functionalDescription ?? []).map((winding) => winding.name),
        windings: buildWindingMeta(coil),
    };
}

// ---------------------------------------------------------------------------
// Whole model
// ---------------------------------------------------------------------------

// ABT #849 (Alf, 2026-08-22): the CONNECTIONS layer — terminals, inter-layer links and
// inter-section runs — as Studio views. The data comes from MKF (libMKF's
// get_connection_layout), never from geometry recomputed here: the routing rules live in
// Coil::get_connection_reserved_spaces and duplicating them in JS is exactly how the 2D and
// 3D views used to disagree. This function only maps the engine's frame onto the Studio's.
//
// What is skipped, matching the C++ painter one-for-one:
//   * markers naming a LAYER — those are LAYER_SQUEEZE book-keeping (the slot a crossed layer
//     gives up); they carry no copper and the painter does not draw them either;
//   * FRONT_YZ markers — the out-of-plane part of a return, which this XY view cannot show.
export function buildConnectionViews(layout) {
    if (layout == null || layout.error != null) {
        return { markers: [], routes: [], blockingApplied: true, realWinding: false };
    }
    const markers = [];
    for (const space of layout.markers ?? []) {
        if (space.layer != null && space.layer !== '') continue;   // squeeze: no copper
        if (space.plane === 'FRONT_YZ') continue;                  // out of this projection
        const coordinates = space.coordinates ?? [];
        const dimensions = space.dimensions ?? [];
        if (coordinates.length < 2 || dimensions.length < 2) continue;
        const rect = rectFromCenter(coordinates[0], coordinates[1], dimensions[0], dimensions[1]);
        markers.push({
            key: `${space.winding}|${space.parallel}|${space.kind}|${space.fromTurn}|${space.toTurn}|${rect.x.toFixed(6)}|${rect.y.toFixed(6)}`,
            winding: space.winding,
            parallel: space.parallel ?? 0,
            section: space.section ?? null,
            kind: space.kind,
            isTerminal: !!space.isTerminal,
            fromTurn: space.fromTurn ?? '',
            toTurn: space.toTurn ?? '',
            routedLength: space.routedLength ?? null,
            rect,
            // The painter rotates about the rectangle's centre and negates the angle because the
            // y axis is flipped in SVG; the same holds here (rectFromCenter flips y).
            rotation: -(space.rotation ?? 0),
            pivotX: coordinates[0] * MM,
            pivotY: -coordinates[1] * MM,
        });
    }
    const routes = [];
    for (const route of layout.routes ?? []) {
        const waypoints = (route.waypoints ?? []).filter((p) => Array.isArray(p) && p.length >= 2);
        if (waypoints.length < 2) continue;
        routes.push({
            key: `${route.winding}|${route.parallel}|${route.fromTurn}|${route.toTurn}|${route.kind}`,
            winding: route.winding,
            parallel: route.parallel ?? 0,
            kind: route.kind,
            fromTurn: route.fromTurn ?? '',
            toTurn: route.toTurn ?? '',
            routedLength: route.routedLength ?? null,
            points: waypoints.map((p) => `${p[0] * MM},${-p[1] * MM}`).join(' '),
        });
    }
    const realWinding = !!layout.realWinding;
    return {
        markers,
        routes,
        realWinding,
        // DECLINED means real winding was asked for and MKF did NOT apply the connection
        // blocking: the markers exist but the turns were never displaced around them, so this is
        // not a layout the winder could make. Exactly the C++ painter's test (PainterImpl
        // paint_coil_connections): with real winding OFF the markers are the ordinary blocking
        // model and nothing is declined, so the condition must include the flag -- reading
        // blockingApplied alone dashed every ideal-winding view in red.
        declined: realWinding && layout.blockingApplied === false,
    };
}

export function buildStudioModel(magnetic) {
    const core = magnetic?.core;
    const coil = magnetic?.coil;
    if (core == null || coil == null) {
        return { valid: false, reason: 'No magnetic loaded' };
    }
    const family = core.functionalDescription?.shape?.family ?? core.functionalDescription?.shape?.split?.(' ')?.[0]?.toLowerCase();
    if (family === 't') {
        return buildToroidalStudioModel(magnetic);
    }
    const coreView = buildCoreView(core);
    if (coreView == null) {
        return { valid: false, reason: 'Core has no processed description yet' };
    }

    const windows = buildWindowViews(coil, core);
    const sections = buildSectionViews(coil);
    const layers = buildLayerViews(coil);
    const turns = buildTurnViews(coil);
    const bobbin = buildBobbinView(coil, coreView);

    // Single-window coils carry NO far-side crossings in the MAS — several
    // physics models interpret additionalCoordinates as real conductor
    // positions, so the engine deliberately does not emit the center-leg
    // mirror there. The mirror is pure DISPLAY geometry: synthesize the
    // shadowed far-side glyphs here (multi-window coils get theirs from the
    // engine, whose consumers are gated for that data).
    const bobbinWindows = effectiveBobbin(coil?.bobbin)?.processedDescription?.windingWindows ?? [];
    if (bobbinWindows.length <= 1) {
        const mirrors = [];
        for (const turn of turns) {
            if (turn.isReturn) {
                continue;
            }
            mirrors.push({
                ...turn,
                isStart: false,
                isReturn: true,
                rect: { ...turn.rect, x: -(turn.rect.x + turn.rect.width) },
            });
        }
        turns.push(...mirrors);
    }

    // View bounds: the core silhouette UNION all drawn content. Lateral-leg
    // loops cross the section plane outside the core (their outer crossing),
    // so turns can legitimately sit beyond the silhouette.
    let x0 = coreView.outer.x;
    let y0 = coreView.outer.y;
    let x1 = coreView.outer.x + coreView.outer.width;
    let y1 = coreView.outer.y + coreView.outer.height;
    for (const rect of [...sections.map((s) => s.rect), ...turns.map((t) => t.rect)]) {
        x0 = Math.min(x0, rect.x);
        y0 = Math.min(y0, rect.y);
        x1 = Math.max(x1, rect.x + rect.width);
        y1 = Math.max(y1, rect.y + rect.height);
    }
    const margin = Math.max(x1 - x0, y1 - y0) * 0.03;
    const bounds = {
        x: x0 - margin,
        y: y0 - margin,
        width: x1 - x0 + 2 * margin,
        height: y1 - y0 + 2 * margin,
    };

    const windingNames = (coil.functionalDescription ?? []).map((winding) => winding.name);

    return {
        valid: true,
        kind: 'concentric',
        bounds,
        core: coreView,
        bobbin,
        windows,
        sections,
        layers,
        turns,
        windingNames,
        windings: buildWindingMeta(coil),
    };
}

// Wire identity for the grouping constraints: a wire given by NAME and the
// same wire as a full object are the SAME wire (the engine resolves names
// before comparing), and object key order must not matter.
function normalizeForComparison(value) {
    if (Array.isArray(value)) {
        return value.map(normalizeForComparison);
    }
    if (value != null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeForComparison(value[key])]));
    }
    return value;
}

export function wiresEqual(a, b) {
    const identity = (wire) => {
        if (typeof wire === 'string') {
            return 'name:' + wire;
        }
        if (wire?.name != null) {
            return 'name:' + wire.name;
        }
        return JSON.stringify(normalizeForComparison(wire ?? null));
    };
    return identity(a) === identity(b);
}

// Winding-level metadata the gestures need: N-filar grouping + parallels +
// the fields the engine's grouping constraints compare.
function buildWindingMeta(coil) {
    return (coil.functionalDescription ?? []).map((winding) => ({
        name: winding.name,
        woundWith: winding.woundWith ?? [],
        numberParallels: winding.numberParallels ?? 1,
        numberTurns: winding.numberTurns ?? null,
        isolationSide: winding.isolationSide ?? null,
        wire: winding.wire ?? null,
    }));
}

// Distinguishable, color-blind-friendly winding palette (Okabe-Ito, minus black).
export const WINDING_PALETTE = [
    '#E69F00',
    '#56B4E9',
    '#009E73',
    '#F0E442',
    '#CC79A7',
    '#0072B2',
    '#D55E00',
    '#999999',
];

export function windingColor(windingNames, windingName) {
    const index = windingNames.indexOf(windingName);
    return WINDING_PALETTE[(index < 0 ? 0 : index) % WINDING_PALETTE.length];
}
