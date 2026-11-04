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
  // Rigged hand and soldier models load first (a fraction of a second), then the game boots.
  Promise.all([
    import('./weapons/Hands.js').then((m) => m.preloadHands()),
    import('./ai/SoldierSkin.js').then((m) => m.preloadSoldier()),
  ])
    .catch(() => {})
    .finally(() => {
      const app = new App();
      app.boot();
    });
}
