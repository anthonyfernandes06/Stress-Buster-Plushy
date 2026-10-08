/** Tiny damped spring used for squash, wobble and UI-ish 3D motion. */
export class Spring {
  x = 0;
  v = 0;
  constructor(
    public k = 300,
    public c = 14,
  ) {}
  kick(v: number) {
    this.v += v;
  }
  step(dt: number, target = 0) {
    // semi-implicit Euler, sub-stepped for stability with large k
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.x - target) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  reset() {
    this.x = 0;
    this.v = 0;
  }
}
