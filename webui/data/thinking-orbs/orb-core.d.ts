/** One state per thing an agent does, and the looks each comes in, `default` first. */
export declare const VARIANTS: {
    readonly base: readonly ["default"];
    readonly working: readonly ["default", "gyro"];
    readonly reasoning: readonly ["default", "twins"];
    readonly searching: readonly ["default", "lighthouse"];
    readonly background: readonly ["default", "spiral"];
    readonly retrying: readonly ["default", "surge"];
    readonly compacting: readonly ["default", "squeeze", "fuse"];
    readonly waiting: readonly ["default"];
};
export type OrbState = keyof typeof VARIANTS;
export type OrbVariant<S extends OrbState = OrbState> = (typeof VARIANTS)[S][number];
/** A state and one of its own variants, `default` if left out. With no state it's `base`. */
export type OrbLook = {
    state?: undefined;
    variant?: undefined;
} | {
    [S in OrbState]: {
        state: S;
        variant?: OrbVariant<S>;
    };
}[OrbState];
/**
 * The k points nearest pts[i], nearest first: one pass keeping a short sorted list, not a sort of them all.
 * Plain loops, as it runs once per dot at mount. @internal Shared with `renders.ts`, not part of the API.
 */
export declare const nearest: (pts: number[][], i: number, k: number) => number[];
/**
 * A form for the dots, from `@yogesharc/thinking-orbs/shapes` or your own. `points` returns [x, y, z] points inside
 * the unit sphere, which fills the orb: it's given the number of dots to aim for and the look, like
 * "working" or "background-spiral", so a look can lay its points out its own way.
 */
export type OrbShape = {
    points: (count: number, look: string) => number[][];
    /** Draws it this many times larger. A solid touches the unit sphere only at its corners, so looks small at 1. */
    scale?: number;
    /** Degrees it's seen from further above, on top of `tilt`. */
    tip?: number;
};
/**
 * How the dots are drawn, from `@yogesharc/thinking-orbs/renders` or your own. `mount` makes its elements with
 * `make`, which appends them to the orb's svg, where they fill in `currentColor`. It returns `dot`,
 * called each frame for every point with where it lands in px, its radius and opacity, and which way
 * the spin carries it on screen; then `frame`, once they're all placed. `radius` is a dot's at rest.
 */
export type OrbRender = {
    mount: (orb: {
        make: (tag: string) => SVGElement;
        pts: number[][];
        size: number;
        radius: number;
    }) => {
        dot: (i: number, x: number, y: number, r: number, a: number, dx: number, dy: number) => void;
        frame?: () => void;
    };
    /** Draws a flat picture over the orb rather than dots in space: no tilt, and Working's ring runs straight down. */
    flat?: boolean;
};
export type OrbOptions = OrbLook & {
    /** Width and height in px. Every orb is tuned to read at 20. */
    size?: number;
    /** How fast it runs: 1 is as designed, 0.5 half speed, 2 double. Every motion in the orb scales together. */
    speed?: number;
    /** What screen readers announce, like "Thinking". Without one the orb is hidden from them. */
    label?: string;
    /**
     * The form the dots sit on, a sphere without one: a shape from `@yogesharc/thinking-orbs/shapes`, or your own, as
     * an `OrbShape` or just its `points` function. Define it outside your component, or the orb redraws every render.
     */
    shape?: OrbShape | OrbShape["points"];
    /** How the dots are drawn, circles without one: a render from `@yogesharc/thinking-orbs/renders`, or your own. */
    render?: OrbRender;
    /** How many dots, as a multiple of the tuned count. */
    density?: number;
    /** How big each dot is, as a multiple of the tuned size. */
    dotSize?: number;
    /** How far it's seen from above, in degrees: 0 side on, 90 straight down. Tuned to 20. */
    tilt?: number;
};
/**
 * Draws an orb into `svg` and keeps it moving until `destroy()`; `pause()` holds it on its frame
 * and `play()` carries on. The orb draws in `currentColor`, so the svg's CSS `color` tints it.
 * With reduced motion it holds still. Needs a browser: call it once the svg is on the page.
 */
export declare function mountOrb(svg: SVGSVGElement, { state: asked, variant, size, speed, label, shape, render, density, dotSize, tilt }?: OrbOptions): {
    pause: () => void;
    play: () => void;
    destroy(): void;
};
