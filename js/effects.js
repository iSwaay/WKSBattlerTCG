'use strict';
/* Sons et effets 3D */

window.audioCtx = null;
function sfx(type) {
    try {
        if (!window.audioCtx) window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
        var osc = window.audioCtx.createOscillator();
        var gain = window.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(window.audioCtx.destination);
        var t = window.audioCtx.currentTime;
        if (type === 'tear') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(50, t + 0.4);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
            osc.start(t); osc.stop(t + 0.4);
        } else if (type === 'burst') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(100, t);
            osc.frequency.exponentialRampToValueAtTime(20, t + 0.3);
            gain.gain.setValueAtTime(0.4, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc.start(t); osc.stop(t + 0.3);
        } else if (type === 'flip') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, t);
            osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(t); osc.stop(t + 0.1);
        } else if (type === 'epic') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(554.37, t + 0.1);
            osc.frequency.setValueAtTime(659.25, t + 0.2);
            osc.frequency.setValueAtTime(880, t + 0.4);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.4, t + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
            osc.start(t); osc.stop(t + 1.5);
        }
    } catch(e) {}
}

function handleMove(e) {
  var cb = e.target.closest('.cb.is-3d');
  if (!cb) return;
  var touch = e.touches ? e.touches[0] : e;
  var rect = cb.getBoundingClientRect();
  var x = touch.clientX - rect.left;
  var y = touch.clientY - rect.top;
  var cx = rect.width / 2;
  var cy = rect.height / 2;
  var rx = -(y - cy) / cy * 15;
  var ry = (x - cx) / cx * 15;
  var px = Math.max(0, Math.min(100, (x / rect.width) * 100));
  var py = Math.max(0, Math.min(100, (y / rect.height) * 100));

  cb.style.setProperty('--rx', rx + 'deg');
  cb.style.setProperty('--ry', ry + 'deg');
  cb.style.setProperty('--px', px + '%');
  cb.style.setProperty('--py', py + '%');
  cb.classList.add('interacting');
}

function handleOut(e) {
  var cb = e.target.closest('.cb.is-3d');
  if (!cb) return;
  cb.classList.remove('interacting');
  cb.style.setProperty('--rx', '0deg');
  cb.style.setProperty('--ry', '0deg');
  cb.style.setProperty('--px', '50%');
  cb.style.setProperty('--py', '50%');
}

document.addEventListener('mousemove', handleMove);
document.addEventListener('touchmove', handleMove, {passive: true});
document.addEventListener('mouseout', handleOut);
document.addEventListener('touchend', handleOut);
document.addEventListener('touchcancel', handleOut);
