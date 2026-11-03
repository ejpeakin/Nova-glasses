// Entry point.
import { App } from './ui/App.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglAvailable()) {
  document.body.innerHTML = '<p class="noscript">Field of Honor: US Army Special Forces needs a browser with WebGL enabled.</p>';
} else {
  // Rigged hand models load first (a few milliseconds), then the game boots.
  import('./weapons/Hands.js')
    .then((m) => m.preloadHands())
    .catch(() => {})
    .finally(() => {
      const app = new App();
      app.boot();
    });
}
