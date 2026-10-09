/**
 * Every tunable number in one place. Physics feel, impact thresholds,
 * tool strengths and fire timings all live here.
 */

/**
 * The room is a closed box seen through its open front, like a stage set.
 * x runs left-right, z runs from the back wall (negative) toward the viewer.
 */
export const ROOM = {
  halfWidth: 4.6, // side walls at x = -4.6 / +4.6
  back: -4.2, // inner face of the back wall
  /** How far floor, walls and ceiling extend toward the viewer (just out of frame). */
  front: 5.0,
  height: 3.8, // ceiling
  wallThickness: 0.2,
  restitution: { floor: 0.3, wall: 0.4 },
  friction: { floor: 0.8, wall: 0.5 },
} as const;

/** Usable floor, kept a little away from the walls. */
export const PLAY = {
  minX: -ROOM.halfWidth + 0.5,
  maxX: ROOM.halfWidth - 0.5,
  minZ: ROOM.back + 0.5,
  maxY: ROOM.height - 0.45,
};

export const CAMERA = {
  /** Eye just outside the open front of the room, looking in and slightly down. */
  position: [0.55, 3.25, 5.6] as [number, number, number],
  target: [-0.15, 0.72, -1.3] as [number, number, number],
  /** Horizontal field of view held roughly constant across window shapes. */
  hFov: 70,
  minVFov: 34,
  maxVFov: 64,
  parallax: 0.28,
  parallaxEase: 2.5,
  /** Screen band at the bottom (px) kept clear of the play area for the controls. */
  bottomInsetPx: 104,
  /** How far inside the visible edge the invisible "screen" walls sit (world units). */
  boundsInset: 0.35,
};

export const PHYSICS = {
  gravity: -14,
  timeStep: 1 / 60,
  solverIterations: 10,
};

export const PLUSHY = {
  spawn: [-0.1, 1.85, -0.85] as [number, number, number],
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
  /** While held, the head centre is kept at least this high (so it lifts off the floor). */
  minHeadHeight: 1.1,
  minSegmentHeight: 0.45,
  springK: 170,
  springDamping: 20,
  maxForce: 340,
  /** Spring "mass": how hard the hand pulls on the grabbed part. */
  effectiveMassHead: 3.2,
  effectiveMassSegment: 1.4,
  throwWindow: 0.08,
  throwScale: 1.05,
  /** Share of an upward flick's speed kept as height (the rest sends it into the room). */
  throwKeepUp: 0.45,
  /** Extra upward arc, as a fraction of throw speed. */
  throwLift: 0.2,
  /** How far past the release point (NDC units) to look for the surface being aimed at. */
  throwAimReach: 0.08,
  /** Aim at that surface only if it is within this angle (deg) of the flick direction. */
  throwAimMaxAngle: 50,
  /** Gravity compensation when aiming, so throws arc onto their target. */
  throwArc: 0.85,
  maxThrowSpeed: 17,
  punchMaxTime: 0.18,
  punchMaxPx: 6,
  punchImpulse: 3.2,
  punchUp: 0.45,
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

/** Toy foam-dart blaster. */
export const GUN = {
  /** Where the blaster is held, in camera space (right, up, forward). */
  hold: [0.46, -0.3, 1.25] as [number, number, number],
  /** Extra turn (rad) after aiming so you see the blaster's side, plus a slight roll. */
  yawBias: 0.38,
  cant: -0.12,
  /** Size of the held blaster. */
  scale: 0.85,
  /** Darts are drawn oversized so they read at room distance. */
  dartScale: 1.8,
  /** Seconds between shots while the button is held. */
  interval: 0.11,
  dartSpeed: 30,
  /** Push on the octopus per dart (N·s): head / tentacle. */
  impulseHead: 1.7,
  impulseSegment: 0.45,
  /** Upward pop per hit, relative to the push. */
  impulseLift: 0.45,
  /** Push on loose props (books, lamp, plant). */
  impulseProp: 0.5,
  /** How long darts stay stuck before popping off (seconds). */
  stickTime: 4,
  maxDarts: 40,
  /** Rapid hits within this window build a combo; enough of them make it dizzy. */
  comboWindow: 0.7,
  comboDizzy: 10,
  recoil: 0.07,
  recoilPitch: 0.16,
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
  shot: 0.006,
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
