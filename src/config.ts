/**
 * Every tunable number in one place. Physics feel, impact thresholds,
 * tool strengths and fire timings all live here.
 */

export const ROOM = {
  half: 4, // floor is 8 x 8, centred on the origin
  wallHeight: 3.2,
  wallThickness: 0.18,
  floorThickness: 0.24,
  ceiling: 5,
  restitution: { floor: 0.3, wall: 0.4 },
  friction: { floor: 0.8, wall: 0.5 },
} as const;

export const CAMERA = {
  position: [6, 6.5, 8] as [number, number, number],
  target: [0, 0.6, 0] as [number, number, number],
  fov: 35,
  fovPortrait: 46,
  parallax: 0.3,
  parallaxEase: 2.5,
  orbitLimitDeg: 15,
  /** Fraction of the viewport the room may fill (leaves room for UI). */
  fitMargin: 0.86,
  fitMarginPortrait: 0.94,
};

export const PHYSICS = {
  gravity: -14,
  timeStep: 1 / 60,
  solverIterations: 10,
};

export const PLUSHY = {
  spawn: [0, 1.85, 0.25] as [number, number, number],
  resetDropHeight: 1.0,
  head: {
    radius: 0.55,
    heightScale: 1.12,
    colliderRadius: 0.5,
    colliderHalfHeight: 0.07,
    mass: 1.0,
  },
  tentacle: {
    count: 8,
    segments: 8,
    length: 1.4,
    rootRadius: 0.13,
    tipRadius: 0.045,
    rootRing: 0.37,
    rootY: -0.42,
    segmentMass: 0.08,
    /** Collider radius relative to the visual tube (slightly fatter so tubes never dip into the floor). */
    colliderScale: 1.04,
    rootColliderScale: 0.78,
    /** Pitch (radians, positive = downward) of each rest segment. */
    restPitch: [0.46, 0.2, 0.06, 0, 0, -0.08, -0.3, -0.62],
    /** Sideways heading change of each rest segment, gives the tip curl. */
    restCurl: [0, 0, 0.03, 0.06, 0.12, 0.42, 0.8, 1.2],
  },
  joints: {
    rootLimit: 0.5,
    limit: 0.62, // ~35 deg
    tipLimit: 0.75,
    rootStiffness: 40,
    stiffness: 9,
    tipStiffness: 14,
    damping: 1.4,
  },
  material: {
    friction: 0.9,
    restitution: 0.12,
    linearDamping: 0.2,
    angularDamping: 0.6,
    /** Segments get a little more spin damping so tentacles don't roll and twist. */
    segmentAngularDamping: 1.1,
  },
  /** Seconds for char to fade fully back to clean fabric. */
  charRecovery: 20,
  /** Gravity scale on every plushy body while held (keeps chains from over-stretching). */
  heldGravityScale: 0.32,
  selfRightStrength: 0.9,
  /** Max idle shuffle-turn speed when it turns to look at the cursor (rad/s). */
  idleTurnSpeed: 0.55,
};

export const IMPACT = {
  light: 2, // below this: light
  heavy: 6, // above this: heavy
  bodyDebounce: 0.14,
  reactionDebounce: 0.09,
  tentacleWeight: 0.75,
  hitStopHeavy: 0.05,
  hitStopBat: 0.07,
  hitStopScale: 0.06,
};

export const HAND = {
  /** Height the grabbed body's centre is carried at (head / tentacle grabs). */
  liftHead: 1.75,
  liftSegment: 1.3,
  springK: 170,
  springDamping: 20,
  maxForce: 340,
  /** Spring "mass": how hard the hand pulls on the grabbed part. */
  effectiveMassHead: 3.2,
  effectiveMassSegment: 1.4,
  throwWindow: 0.08,
  throwScale: 1.05,
  throwUpBias: 0.22,
  maxThrowSpeed: 17,
  punchMaxTime: 0.18,
  punchMaxPx: 6,
  punchImpulse: 3.2,
  punchUp: 0.45,
  bounds: 3.55,
};

/** Extra launch when the plushy lands on the pouf (m/s). */
export const POUF_BOUNCE = { base: 0.3, gain: 0.76, max: 10 };

export const BAT = {
  hoverY: 1.0,
  length: 1.5,
  barrelStart: 0.47,
  sweetSpot: 1.02,
  radius: 0.095,
  /** Swipes whose line passes this close to the plushy get centred on it. */
  aimAssist: 1.3,
  swipeTriggerPx: 26,
  sweepDeg: 210,
  minAngVel: 7,
  maxAngVel: 30,
  tapAngVel: 16,
  speedToAngVel: 1.6,
  hitScale: 0.62,
  hitUp: 0.38,
  maxHitSpeed: 19,
  cooldown: 0.25,
};

export const FIRE = {
  heatRadius: 0.25,
  heatRate: 1.6, // heat per second while flame is close
  heatDecay: 1.4,
  igniteTime: 0.8, // seconds of continuous heating
  spreadDelay: 0.22,
  burnDuration: 5,
  charRate: 0.35,
  heatCharRate: 0.5,
  extinguishSpeed: 5,
  flailInterval: 0.14,
  flailImpulse: 0.09,
};

export const METER = {
  impact: 0.018,
  heavy: 0.02,
  punch: 0.011,
  bat: 0.045,
  burn: 0.05,
  /** Minimum seconds between counted impact hits (one landing = one hit). */
  impactHitGap: 0.45,
  celebrateSeconds: 3.2,
};

export const IDLE = {
  after: 8,
  blinkMin: 3,
  blinkMax: 6,
};

export const PARTICLES = {
  fluff: 130,
  fire: 110,
  smoke: 50,
  spark: 30,
};
