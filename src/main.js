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
  document.body.innerHTML = '<p class="noscript">Field of Honor needs a browser with WebGL enabled.</p>';
} else {
  const app = new App();
  app.boot();
}
