/**
 * Render layer for pure effects (particles, rings, light shafts, trails).
 * The main camera renders it; the contact-shadow depth pass does not, so
 * effects never leave dark blots on the floor.
 */
export const FX_LAYER = 1;
