/**
 * Layout constants with no component imports (ABT #1121).
 *
 * The settings store needs the default layout key, and the registry needs it
 * too; the registry imports every layout component, so importing it from the
 * store would make a cycle (store → registry → layout → store). This leaf
 * module is what both import instead.
 */
export const DEFAULT_BUILDER_LAYOUT = 'columns';
