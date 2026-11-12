/* Voice Timer — plain JavaScript, no dependencies. */
(function () {
  'use strict';

  var DURATIONS = [55, 60, 65, 70, 75, 80, 85, 90];
  var DEFAULT_DURATION = 60;
  var STORE_DURATION = 'voiceTimer.duration';
  var STORE_MUTED = 'voiceTimer.muted';
  // An announcement more than this late (e.g. after the app was in the background) is dropped, never queued.
  var MAX_LATE_MS = 400;

  // Every clip the app can speak: n1..n15, n20..n90, s55..s90 ("sixty five seconds"), done.
  var CLIP_NAMES = ['done'];
  var i;
  for (i = 1; i <= 15; i++) CLIP_NAMES.push('n' + i);
  for (i = 20; i <= 90; i += 10) CLIP_NAMES.push('n' + i);
  for (i = 0; i < DURATIONS.length; i++) CLIP_NAMES.push('s' + DURATIONS[i]);

  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } }
  function format(sec) { return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }

  /* ---------- elements ---------- */
  var appEl = $('app'), timeEl = $('time'), statusEl = $('status'), progEl = $('prog');
  var startBtn = $('start'), pauseBtn = $('pause'), resetBtn = $('reset'), muteBtn = $('mute');
  var presetBtns = Array.prototype.slice.call(document.querySelectorAll('.preset'));

  /* ---------- state ---------- */
  var state = 'idle';            // idle | running | paused | done
  var totalSec = DEFAULT_DURATION;
  var remainingMs = totalSec * 1000;
  var endAt = 0;                 // wall-clock time (ms) at which the countdown reaches zero
  var lastSec = null;            // last whole second handled; only ever decreases during a run
  var rafId = 0, intervalId = 0;
  var muted = load(STORE_MUTED) === '1';

  var saved = parseInt(load(STORE_DURATION), 10);
  if (DURATIONS.indexOf(saved) !== -1) totalSec = saved;
  remainingMs = totalSec * 1000;

  /* ---------- audio ---------- */
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null;
  var pcm = {};                  // clip name -> { rate, samples(Float32Array) }
  var buffers = {};              // clip name -> AudioBuffer
  var playing = [];              // every sound currently playing or scheduled

  // On iPhone this asks for the "playback" audio category, so sound follows the media volume.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }

  // Clips are plain 16-bit mono WAV files, read directly so no decoder is needed.
  function parseWav(arrayBuffer) {
    var view = new DataView(arrayBuffer);
    var pos = 12, rate = 22050, channels = 1;
    while (pos + 8 <= view.byteLength) {
      var id = String.fromCharCode(view.getUint8(pos), view.getUint8(pos + 1), view.getUint8(pos + 2), view.getUint8(pos + 3));
      var size = view.getUint32(pos + 4, true);
      if (id === 'fmt ') {
        channels = view.getUint16(pos + 10, true);
        rate = view.getUint32(pos + 12, true);
      } else if (id === 'data') {
        var count = Math.floor(Math.min(size, view.byteLength - pos - 8) / 2 / channels);
        var samples = new Float32Array(count);
        for (var k = 0; k < count; k++) samples[k] = view.getInt16(pos + 8 + k * 2 * channels, true) / 32768;
        return { rate: rate, samples: samples };
      }
      pos += 8 + size + (size % 2);
    }
    return null;
  }

  function base64ToArrayBuffer(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    return bytes.buffer;
  }

  function addClip(name, arrayBuffer) {
    var parsed = parseWav(arrayBuffer);
    if (!parsed) return;
    pcm[name] = parsed;
    if (ctx) makeBuffer(name);
  }

  function makeBuffer(name) {
    if (buffers[name] || !pcm[name]) return;
    try {
      var b = ctx.createBuffer(1, pcm[name].samples.length, pcm[name].rate);
      b.getChannelData(0).set(pcm[name].samples);
      buffers[name] = b;
    } catch (e) { /* clip stays silent */ }
  }

  function loadClips() {
    var embedded = window.VOICE_TIMER_CLIPS;   // optional built-in clips; normally the files in audio/ are used
    CLIP_NAMES.forEach(function (name) {
      if (embedded && embedded[name]) {
        addClip(name, base64ToArrayBuffer(embedded[name]));
      } else {
        fetch('audio/' + name + '.wav')
          .then(function (r) { if (!r.ok) throw new Error('missing clip'); return r.arrayBuffer(); })
          .then(function (ab) { addClip(name, ab); })
          .catch(function () { /* clip stays silent */ });
      }
    });
  }

  // Called from button taps, which is what lets iOS Safari play sound.
  function unlockAudio() {
    if (!AudioCtx) return;
    try {
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);
        buffers = {};
      }
      for (var name in pcm) makeBuffer(name);
      if (ctx.state !== 'running') {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { /* audio unavailable; the timer still works silently */ }
  }

  function track(node) {
    playing.push(node);
    node.onended = function () {
      var idx = playing.indexOf(node);
      if (idx !== -1) playing.splice(idx, 1);
    };
  }

  // Silences everything at once: the current word and anything scheduled.
  function stopAllSound() {
    var nodes = playing;
    playing = [];
    nodes.forEach(function (node) {
      node.onended = null;
      try { node.stop(0); } catch (e) {}
      try { node.disconnect(); } catch (e) {}
    });
  }

  function playClip(name, delaySec) {
    if (!ctx || !buffers[name]) return 0;
    try {
      var src = ctx.createBufferSource();
      src.buffer = buffers[name];
      src.connect(master);
      track(src);
      src.start(ctx.currentTime + (delaySec || 0));
      return buffers[name].duration;
    } catch (e) { return 0; }
  }

  // Speak one clip, cutting off whatever was still sounding, so words never overlap.
  function speak(name) {
    stopAllSound();
    return playClip(name, 0);
  }

  // A soft rising three-note chime.
  function playChime(delaySec) {
    if (!ctx) return;
    var notes = [659.25, 830.61, 987.77, 1318.51];
    var t0 = ctx.currentTime + delaySec;
    notes.forEach(function (freq, n) {
      try {
        var t = t0 + n * 0.13;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (n === notes.length - 1 ? 1.1 : 0.5));
        osc.connect(gain);
        gain.connect(master);
        track(osc);
        osc.start(t);
        osc.stop(t + 1.2);
      } catch (e) {}
    });
  }

  /* ---------- screen wake lock ---------- */
  var wakeLock = null, wakeWanted = false;

  function keepAwake() {
    wakeWanted = true;
    if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      navigator.wakeLock.request('screen').then(function (lock) {
        if (!wakeWanted) { lock.release().catch(function () {}); return; }
        wakeLock = lock;
        lock.addEventListener('release', function () { if (wakeLock === lock) wakeLock = null; });
      }).catch(function () { /* refused (e.g. low power mode) — carry on without it */ });
    } catch (e) { /* not supported */ }
  }

  function allowSleep() {
    wakeWanted = false;
    if (wakeLock) {
      var lock = wakeLock;
      wakeLock = null;
      try { lock.release().catch(function () {}); } catch (e) {}
    }
  }

  /* ---------- rendering ---------- */
  var STATUS = { idle: 'Ready', running: 'Go', paused: 'Paused', done: 'Done' };

  function render() {
    var sec = state === 'done' ? 0 : Math.ceil(remainingMs / 1000);
    var text = format(Math.max(0, sec));
    if (timeEl.textContent !== text) timeEl.textContent = text;

    var fraction = Math.max(0, Math.min(1, remainingMs / (totalSec * 1000)));
    progEl.style.strokeDashoffset = (100 * (1 - fraction)).toFixed(3);
    progEl.style.opacity = fraction > 0.0005 ? '1' : '0';
  }

  function renderState() {
    appEl.setAttribute('data-state', state);
    statusEl.textContent = STATUS[state];
    var busy = state === 'running' || state === 'paused';
    startBtn.disabled = busy;
    pauseBtn.disabled = !busy;
    pauseBtn.textContent = state === 'paused' ? 'Resume' : 'Pause';
    resetBtn.disabled = state === 'idle';
    presetBtns.forEach(function (b) {
      b.disabled = busy;
      b.setAttribute('aria-checked', String(Number(b.getAttribute('data-sec')) === totalSec));
    });
    render();
  }

  /* ---------- countdown ---------- */
  function shouldAnnounce(sec) {
    return sec >= 1 && (sec <= 15 || sec % 10 === 0);
  }

  // Runs many times a second. All timing comes from the clock, never from counting ticks.
  function tick() {
    if (state !== 'running') return;
    var left = endAt - Date.now();
    if (left <= 0) { finish(-left); return; }
    remainingMs = left;

    var sec = Math.ceil(left / 1000);
    if (sec !== lastSec) {
      // Only the second we are in right now is ever spoken; skipped seconds are not replayed.
      if (lastSec === null || sec < lastSec) {
        var lateMs = sec * 1000 - left;
        if (shouldAnnounce(sec) && lateMs <= MAX_LATE_MS) speak('n' + sec);
      }
      lastSec = sec;
    }
    render();
  }

  function frame() {
    tick();
    if (state === 'running') rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    stopLoop();
    rafId = requestAnimationFrame(frame);
    intervalId = setInterval(tick, 100);   // backup for when animation frames are throttled
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    if (intervalId) clearInterval(intervalId);
    rafId = 0;
    intervalId = 0;
  }

  function start() {
    if (state === 'running' || state === 'paused') return;   // one timer at a time
    unlockAudio();
    stopAllSound();
    remainingMs = totalSec * 1000;
    endAt = Date.now() + remainingMs;
    lastSec = totalSec;          // the start announcement covers this second
    state = 'running';
    speak('s' + totalSec);
    keepAwake();
    renderState();
    startLoop();
  }

  function pause() {
    if (state !== 'running') return;
    remainingMs = Math.max(0, endAt - Date.now());
    state = 'paused';
    stopLoop();
    stopAllSound();
    allowSleep();
    renderState();
  }

  function resume() {
    if (state !== 'paused') return;
    unlockAudio();
    endAt = Date.now() + remainingMs;   // lastSec is kept, so nothing already spoken is repeated
    state = 'running';
    keepAwake();
    renderState();
    startLoop();
  }

  function reset() {
    stopLoop();
    stopAllSound();
    allowSleep();
    state = 'idle';
    remainingMs = totalSec * 1000;
    lastSec = null;
    renderState();
  }

  function finish(lateMs) {
    stopLoop();
    state = 'done';
    remainingMs = 0;
    lastSec = null;
    allowSleep();
    if (lateMs <= 1500) {
      var length = speak('done');
      playChime(length + 0.08);
    } else {
      stopAllSound();
    }
    renderState();
  }

  function selectDuration(sec) {
    if (state === 'running' || state === 'paused') return;
    if (DURATIONS.indexOf(sec) === -1) return;
    stopAllSound();
    totalSec = sec;
    save(STORE_DURATION, String(sec));
    state = 'idle';
    remainingMs = totalSec * 1000;
    lastSec = null;
    renderState();
  }

  function setMuted(value) {
    muted = value;
    save(STORE_MUTED, muted ? '1' : '0');
    if (master && ctx) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
      } catch (e) { master.gain.value = muted ? 0 : 1; }
    }
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? 'Unmute voice' : 'Mute voice');
  }

  /* ---------- wiring ---------- */
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', function () { if (state === 'paused') resume(); else pause(); });
  resetBtn.addEventListener('click', reset);
  muteBtn.addEventListener('click', function () { unlockAudio(); setMuted(!muted); });
  presetBtns.forEach(function (b) {
    b.addEventListener('click', function () { selectDuration(Number(b.getAttribute('data-sec'))); });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (state === 'running') {
      if (ctx && ctx.state !== 'running') { try { ctx.resume().catch(function () {}); } catch (e) {} }
      keepAwake();       // the lock is dropped whenever the page is hidden
      tick();
    }
  });

  // Stop pinch and double-tap zoom so the layout stays put during exercise.
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  loadClips();
  setMuted(muted);
  renderState();

  // Offline support: the service worker stores every file on the phone after the first visit.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
    });
  }
})();
