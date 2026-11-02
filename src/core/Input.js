// Keyboard + mouse input with pointer lock. Game code polls state each frame:
// isDown() for held keys, pressed() for edges that happened since the last frame.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'KeyC', 'KeyZ', 'KeyE', 'KeyR', 'KeyG', 'KeyQ', 'KeyF', 'KeyV', 'KeyN', 'KeyB', 'Tab', 'Digit1', 'Digit2',
  'Digit3', 'Digit4', 'KeyX',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.edges = new Set();
    this.releases = new Set();
    this.mouseDown = [false, false, false];
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.enabled = false; // only capture game keys while in a match
    this.onPointerLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (this.enabled && (GAME_KEYS.has(e.code) || e.ctrlKey)) e.preventDefault();
      if (!this.down.has(e.code)) this.edges.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releases.add(e.code);
      if (this.enabled && GAME_KEYS.has(e.code)) e.preventDefault();
    });
    window.addEventListener('blur', () => this.reset());

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (this.mouseDown[e.button]) this.mouseReleased[e.button] = true;
      this.mouseDown[e.button] = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Guard against the occasional huge spike some browsers emit on lock.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) this.reset();
      this.onPointerLockChange?.(this.locked);
    });
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      // Some platforms reject unadjustedMovement; retry without it.
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* ignored */ } });
    } catch {
      try { this.canvas.requestPointerLock(); } catch { /* ignored */ }
    }
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  isDown(code) { return this.down.has(code); }
  pressed(code) { return this.edges.has(code); }
  released(code) { return this.releases.has(code); }
  anyDown(...codes) { return codes.some((c) => this.down.has(c)); }
  anyPressed(...codes) { return codes.some((c) => this.edges.has(c)); }

  consumeMouse() {
    const d = { x: this.dx, y: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.edges.clear();
    this.releases.clear();
    this.mousePressed[0] = this.mousePressed[1] = this.mousePressed[2] = false;
    this.mouseReleased[0] = this.mouseReleased[1] = this.mouseReleased[2] = false;
    this.wheel = 0;
  }

  reset() {
    this.down.clear();
    this.edges.clear();
    this.releases.clear();
    this.mouseDown = [false, false, false];
    this.dx = this.dy = 0;
  }
}
