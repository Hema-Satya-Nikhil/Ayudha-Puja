(() => {
  'use strict';

  /* ====================================================================
     DOM ELEMENTS
  ==================================================================== */
  const introOverlay     = document.getElementById('introOverlay');
  const curtainStage     = document.getElementById('curtainStage');
  const startButton      = document.getElementById('startExperience');
  const experience       = document.querySelector('.experience');
  const soundToggle      = document.getElementById('soundToggle');
  const soundLabel       = document.getElementById('soundLabel');
  const loopToggle       = document.getElementById('autoLoopToggle');
  const loopLabel        = document.getElementById('loopLabel');
  const posterButton     = document.getElementById('posterButton');
  const posterPreview    = document.getElementById('posterPreview');
  const replayButton     = document.getElementById('replayButton');
  const resetButton      = document.getElementById('resetButton');
  const bellButton       = document.getElementById('bellButton');
  const devotionalTrack  = document.getElementById('devotionalTrack');
  const posterModal      = document.getElementById('posterModal');
  const closeModal       = document.getElementById('closeModal');
  const modalBackdrop    = document.getElementById('modalBackdrop');
  const drawingSvg       = document.getElementById('durgaDrawing');
  const durgaArt         = document.getElementById('durgaArt');
  const durgaSketch      = document.getElementById('durgaSketch');

  /* ====================================================================
     CONSTANTS & STATE
  ==================================================================== */
  const DEVOTIONAL_TRACK_PATH = 'assets/durga-devotional.mp3';
  const BELL_COOLDOWN_MS      = 3500;
  const HOLD_DURATION_MS      = 10000;

  const STATE = Object.freeze({
    INTRO:              'intro',
    CURTAINS_OPENING:   'curtains-opening',
    DRAWING:            'drawing',
    COLOUR_REVEAL:      'colour-reveal',
    HOLD:               'hold',
    CURTAINS_CLOSING:   'curtains-closing',
    CURTAINS_REOPENING: 'curtains-reopening',
    RESETTING:          'resetting'
  });

  let currentState    = STATE.INTRO;
  let started         = false;
  let autoLoopEnabled = false;
  let musicEnabled    = false;
  let musicMode       = 'off';

  let audioContext   = null;
  let masterGain     = null;
  let ambientNodes   = [];
  let bellCooldownAt = 0;
  let bellUiTimer    = null;

  let curtainTimer   = null;
  let drawingRAF     = null;
  let drawingStartMs = 0;
  let pathLengths    = [];
  let autoLoopTimer  = null;
  let holdTimer      = null;

  let reducedMotion  = false;

  function detectMotion() {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  detectMotion();
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', detectMotion);

  /* ====================================================================
     AUDIO
  ==================================================================== */
  function ensureAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) {
      audioContext = new AudioContextClass();
      masterGain   = audioContext.createGain();
      masterGain.gain.value = 0.0001;
      masterGain.connect(audioContext.destination);
    }
    return audioContext;
  }

  function setSoundUi(enabled, mode = 'off') {
    musicEnabled = enabled;
    musicMode    = mode;
    soundToggle.classList.toggle('is-playing', enabled);
    soundToggle.setAttribute('aria-pressed', String(enabled));
    soundLabel.textContent = !enabled
      ? 'MUSIC OFF'
      : (mode === 'song' ? 'SONG ON' : 'AMBIENT ON');
    soundToggle.setAttribute('aria-label',
      !enabled ? 'Turn music on'
      : mode === 'song' ? 'Devotional song playing'
      : 'Original ambient sound playing');
    soundToggle.title = soundLabel.textContent;
  }

  function addDroneTone(frequency, volume, type, detune = 0) {
    const oscillator = audioContext.createOscillator();
    const gain       = audioContext.createGain();
    const filter     = audioContext.createBiquadFilter();
    oscillator.type          = type;
    oscillator.frequency.value = frequency;
    oscillator.detune.value    = detune;
    filter.type           = 'lowpass';
    filter.frequency.value = 750;
    gain.gain.value = volume;
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    oscillator.start();
    ambientNodes.push({ oscillator, gain });
  }

  function ensureAmbientTones() {
    if (ambientNodes.length) return;
    addDroneTone(110,    0.095, 'sine',     -2);
    addDroneTone(164.81, 0.034, 'triangle',  2);
    addDroneTone(220,    0.018, 'sine',      0);
  }

  function fadeAmbientIn() {
    if (!audioContext || !masterGain) return;
    ensureAmbientTones();
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.0001), now);
    masterGain.gain.setTargetAtTime(0.58, now, 1.25);
  }

  function fadeAmbientOut() {
    if (!audioContext || !masterGain) return;
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(0.0001, now, 0.28);
  }

  async function startMusic() {
    try {
      const context = ensureAudioContext();
      if (context) await context.resume();

      let trackAvailable = false;
      try {
        const response = await fetch(DEVOTIONAL_TRACK_PATH, { method: 'HEAD', cache: 'no-store' });
        trackAvailable = response.ok;
      } catch (_) {
        trackAvailable = false;
      }

      if (trackAvailable) {
        devotionalTrack.src  = DEVOTIONAL_TRACK_PATH;
        devotionalTrack.volume = 0.78;
        try {
          await devotionalTrack.play();
          fadeAmbientOut();
          setSoundUi(true, 'song');
          return true;
        } catch (error) {
          console.warn('The local devotional track could not play; using built-in ambience instead.', error);
        }
      }

      if (!context || !masterGain) {
        soundLabel.textContent = 'AUDIO UNAVAILABLE';
        return false;
      }
      await context.resume();
      fadeAmbientIn();
      setSoundUi(true, 'ambient');
      return true;
    } catch (error) {
      console.warn('Audio could not start:', error);
      soundLabel.textContent = 'AUDIO UNAVAILABLE';
      return false;
    }
  }

  async function stopMusic() {
    try {
      devotionalTrack.pause();
      if (devotionalTrack.currentTime) devotionalTrack.currentTime = 0;
    } catch (_) { /* nothing to stop */ }
    fadeAmbientOut();
    setSoundUi(false, 'off');
  }

  async function toggleMusic() {
    if (musicEnabled) await stopMusic();
    else              await startMusic();
  }

  /* ====================================================================
     BELL
  ==================================================================== */
  async function ringBellSound() {
    const context = ensureAudioContext();
    if (!context) return;
    const now = performance.now();
    if (now < bellCooldownAt) return;
    bellCooldownAt = now + BELL_COOLDOWN_MS;

    try {
      await context.resume();
      const baseTime = context.currentTime;

      /* Bell bus connects directly to destination — bypasses the music master gain
         so the bell rings clearly even when the devotional track is playing. */
      const bellBus = context.createGain();
      bellBus.gain.setValueAtTime(0.0001, baseTime);
      bellBus.gain.exponentialRampToValueAtTime(0.38, baseTime + 0.012);
      bellBus.gain.exponentialRampToValueAtTime(0.0001, baseTime + 4.8);
      bellBus.connect(context.destination);

      /* Inharmonic partials typical of a bronze temple bell.
         Frequency ratios approximate the natural modes of a bell:
         nominal, major third, perfect fourth, fifth,
         minor seventh, brilliance, and sparkle partials. */
      const partials = [
        { freq: 440,  vol: 1.0,  decay: 4.8 },
        { freq: 588,  vol: 0.65, decay: 4.5 },
        { freq: 733,  vol: 0.45, decay: 4.2 },
        { freq: 1100, vol: 0.30, decay: 4.0 },
        { freq: 1466, vol: 0.18, decay: 3.7 },
        { freq: 2200, vol: 0.10, decay: 3.4 },
        { freq: 3100, vol: 0.05, decay: 3.0 }
      ];

      partials.forEach((partial, index) => {
        const oscillator  = context.createOscillator();
        const partialGain = context.createGain();
        oscillator.type = 'sine';
        /* Subtle detuning creates natural beating between partials */
        const detune = (index % 2 === 0 ? -1 : 1) * (3 + index * 1.5);
        oscillator.frequency.setValueAtTime(partial.freq, baseTime);
        oscillator.detune.setValueAtTime(detune, baseTime);

        /* Sharp attack, long exponential decay */
        partialGain.gain.setValueAtTime(0.0001, baseTime);
        partialGain.gain.exponentialRampToValueAtTime(partial.vol, baseTime + 0.02);
        partialGain.gain.exponentialRampToValueAtTime(0.0001, baseTime + partial.decay);

        oscillator.connect(partialGain);
        partialGain.connect(bellBus);
        /* Staggered start for a richer attack transient */
        oscillator.start(baseTime + index * 0.003);
        oscillator.stop(baseTime + partial.decay + 0.2);
      });

      /* Initial clapper strike — a brief noise burst that gives
         the bell its characteristic "ping" attack. */
      const strike = context.createBufferSource();
      const bufferSize = context.sampleRate * 0.03;
      const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      strike.buffer = buffer;
      const strikeGain = context.createGain();
      strikeGain.gain.setValueAtTime(0.18, baseTime);
      strikeGain.gain.exponentialRampToValueAtTime(0.0001, baseTime + 0.35);
      strike.connect(strikeGain);
      strikeGain.connect(bellBus);
      strike.start(baseTime);
      strike.stop(baseTime + 0.35);

    } catch (error) {
      console.warn('The bell sound could not start:', error);
    }
  }

  function animateBell() {
    bellButton.classList.remove('is-ringing');
    void bellButton.offsetWidth;
    bellButton.classList.add('is-ringing');
    if (bellUiTimer) window.clearTimeout(bellUiTimer);
    bellUiTimer = window.setTimeout(() => bellButton.classList.remove('is-ringing'), 1150);
    void ringBellSound();
  }

  /* ====================================================================
     POSTER MODAL
  ==================================================================== */
  let lastFocusedElement = null;

  function openPoster() {
    lastFocusedElement = document.activeElement;
    posterModal.classList.add('is-open');
    posterModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    closeModal.focus();
  }

  function closePoster() {
    posterModal.classList.remove('is-open');
    posterModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
  }

  /* ====================================================================
     DRAWING ENGINE
  ==================================================================== */
  function hasDrawingPaths() {
    return typeof window.DRAWING_PATHS !== 'undefined'
        && window.DRAWING_PATHS
        && window.DRAWING_PATHS.length > 0;
  }

  function renderPathsToSVG() {
    if (!drawingSvg || !hasDrawingPaths()) return;
    drawingSvg.innerHTML = '';
    pathLengths = [];
    window.DRAWING_PATHS.forEach((path) => {
      const pathEl = document.createElement('path');
      pathEl.setAttribute('d', path.data);
      pathEl.setAttribute('data-layer', path.layer);
      pathEl.style.strokeDasharray = '0.001';
      pathEl.style.strokeDashoffset = '0.001';
      pathEl.style.opacity = '0';
      drawingSvg.appendChild(pathEl);
      try {
        pathLengths.push(pathEl.getTotalLength());
      } catch (_) {
        pathLengths.push(0);
      }
    });
  }

  function startDrawing() {
    if (reducedMotion || !hasDrawingPaths()) {
      experience.classList.add('colour-revealed');
      onDrawingComplete();
      return;
    }
    renderPathsToSVG();
    drawingStartMs = performance.now();
    experience.classList.add('drawing');
    drawingRAF = requestAnimationFrame(animateDrawing);
  }

  function animateDrawing() {
    if (!drawingStartMs) return;
    const elapsedSec = (performance.now() - drawingStartMs) / 1000;
    const config    = window.DRAWING_CONFIG || {};
    const total     = config.totalDuration || 42.1;
    const paths     = window.DRAWING_PATHS || [];

    for (let i = 0; i < paths.length; i++) {
      const pathEl  = drawingSvg.children[i];
      if (!pathEl) continue;
      const path    = paths[i];
      const progress = Math.min(1, Math.max(0, (elapsedSec - path.startTime) / path.duration));
      const len     = pathLengths[i] || 0;
      if (progress <= 0) {
        pathEl.style.strokeDasharray = '0.001';
        pathEl.style.strokeDashoffset = '0.001';
        pathEl.style.opacity = '0';
      } else {
        pathEl.style.strokeDasharray = len;
        pathEl.style.strokeDashoffset = len * (1 - progress);
        pathEl.style.opacity = '1';
      }
    }

    if (elapsedSec < total) {
      drawingRAF = requestAnimationFrame(animateDrawing);
    } else {
      drawingRAF = null;
      onDrawingComplete();
    }
  }

  function onDrawingComplete() {
    experience.classList.remove('drawing');
    transitionToState(STATE.COLOUR_REVEAL);
    window.setTimeout(() => {
      experience.classList.add('colour-revealed');
      transitionToState(STATE.HOLD);
      scheduleHoldExit();
    }, 200);
  }

  function resetDrawingPaths() {
    if (drawingRAF) {
      cancelAnimationFrame(drawingRAF);
      drawingRAF = null;
    }
    drawingStartMs = 0;
    experience.classList.remove('drawing', 'colour-revealed');
    if (drawingSvg) {
      const paths = drawingSvg.children;
      for (const pathEl of paths) {
        pathEl.style.strokeDasharray = '0.001';
        pathEl.style.strokeDashoffset = '0.001';
        pathEl.style.opacity = '0';
      }
    }
  }

  /* ====================================================================
     STATE MACHINE
  ==================================================================== */
  function transitionToState(newState) {
    const prev = currentState;
    currentState = newState;
    if (currentState !== STATE.INTRO && currentState !== STATE.RESETTING) {
      experience.classList.add('is-active');
    }
  }

  function beginOpening() {
    transitionToState(STATE.CURTAINS_OPENING);
    curtainStage.classList.add('is-opening');
    window.setTimeout(() => curtainStage.classList.add('is-open'), 1950);

    /* Curtain open duration from CSS custom property (default 18s) */
    const openDur = 18000;
    curtainTimer = window.setTimeout(() => {
      transitionToState(STATE.DRAWING);
      startDrawing();
    }, openDur);
  }

  function beginClosing() {
    transitionToState(STATE.CURTAINS_CLOSING);
    curtainStage.classList.remove('is-open');
    curtainStage.classList.add('is-closing');

    const closeDur = 10000;
    curtainTimer = window.setTimeout(() => {
      transitionToState(STATE.CURTAINS_REOPENING);
      curtainStage.classList.remove('is-closing');
      curtainStage.classList.add('is-opening');

      window.setTimeout(() => curtainStage.classList.add('is-open'), 1950);

      const reopenDur = 18000;
      curtainTimer = window.setTimeout(() => {
        transitionToState(STATE.RESETTING);
        resetDrawingPaths();
        transitionToState(STATE.DRAWING);
        startDrawing();
      }, reopenDur);
    }, closeDur);
  }

  function scheduleHoldExit() {
    if (holdTimer) window.clearTimeout(holdTimer);
    if (!autoLoopEnabled || !started) return;
    holdTimer = window.setTimeout(() => {
      beginClosing();
    }, HOLD_DURATION_MS);
  }

  /* ====================================================================
     PUBLIC CONTROLS
  ==================================================================== */
  async function startExperience(withMusic = true) {
    if (started) {
      if (withMusic && !musicEnabled) void startMusic();
      return;
    }
    started = true;
    introOverlay.classList.add('is-dismissed');
    beginOpening();
    if (withMusic && !musicEnabled) void startMusic();
  }

  function replayReveal() {
    if (!started) {
      startExperience(false);
      return;
    }
    /* Quick restart: reset drawing and replay immediately without curtain animation */
    resetDrawingPaths();
    experience.classList.add('drawing');
    drawingStartMs = performance.now();
    drawingRAF = requestAnimationFrame(animateDrawing);
  }

  function resetExperience() {
    if (drawingRAF) {
      cancelAnimationFrame(drawingRAF);
      drawingRAF = null;
    }
    if (curtainTimer)   { window.clearTimeout(curtainTimer);   curtainTimer = null; }
    if (holdTimer)      { window.clearTimeout(holdTimer);      holdTimer = null; }
    if (bellUiTimer)    { window.clearTimeout(bellUiTimer);    bellUiTimer = null; }

    drawingStartMs = 0;
    experience.classList.remove('is-active', 'drawing', 'colour-revealed');
    curtainStage.classList.remove('is-opening', 'is-closing', 'is-open');
    resetDrawingPaths();
    transitionToState(STATE.INTRO);
  }

  function toggleAutoLoop() {
    autoLoopEnabled = !autoLoopEnabled;
    loopToggle.classList.toggle('is-enabled', autoLoopEnabled);
    loopToggle.setAttribute('aria-pressed', String(autoLoopEnabled));
    loopLabel.textContent = autoLoopEnabled ? 'AUTO LOOP ON' : 'AUTO LOOP OFF';
    loopToggle.setAttribute('aria-label', autoLoopEnabled ? 'Turn automatic ceremony loop off' : 'Turn automatic ceremony loop on');
    if (autoLoopEnabled && started && currentState === STATE.HOLD) {
      scheduleHoldExit();
    }
  }

  /* ====================================================================
     PARTICLE SYSTEM
  ==================================================================== */
  const canvas    = document.getElementById('petalCanvas');
  const ctx       = canvas.getContext('2d', { alpha: true });
  let width       = 0;
  let height      = 0;
  let dpr         = 1;
  let particles   = [];
  let lastFrameAt = 0;
  const petalColors = [
    'rgba(214,70,67,0.78)',  'rgba(244,166,58,0.82)',
    'rgba(255,231,190,0.66)', 'rgba(163,36,54,0.76)',
    'rgba(238,193,93,0.72)'
  ];
  const flowerColors = [
    'rgba(245,160,42,0.86)', 'rgba(235,82,70,0.78)',
    'rgba(255,220,136,0.78)', 'rgba(215,75,128,0.7)'
  ];

  function makeParticle(randomY = true) {
    const roll  = Math.random();
    const kind  = roll < 0.15 ? 'flower' : (roll < 0.33 ? 'dust' : 'petal');
    return {
      x:           Math.random() * width,
      y:           randomY ? Math.random() * height : -25 - Math.random() * 80,
      size:        kind === 'flower' ? 5.5 + Math.random() * 6 : 3.2 + Math.random() * 6.5,
      speed:       0.22 + Math.random() * (kind === 'dust' ? 0.38 : 0.75),
      drift:       0.3 + Math.random() * 1.1,
      phase:       Math.random() * Math.PI * 2,
      spin:        (Math.random() - 0.5) * 0.045,
      rotation:    Math.random() * Math.PI,
      color:       (kind === 'flower' ? flowerColors : petalColors)[
                     Math.floor(Math.random() * (kind === 'flower' ? flowerColors.length : petalColors.length))
                   ],
      centerColor: kind === 'flower' ? 'rgba(255,225,137,0.96)' : null,
      kind
    };
  }

  function resizeCanvas() {
    dpr   = Math.min(window.devicePixelRatio || 1, 1.65);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width  = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const density = width <= 650
      ? 38
      : Math.max(65, Math.min(142, Math.floor(width / 13)));
    particles = Array.from({ length: density }, () => makeParticle(true));
  }

  function drawFlowerParticle(particle) {
    const petalCount = 6;
    for (let i = 0; i < petalCount; i += 1) {
      const angle  = (Math.PI * 2 * i) / petalCount;
      const radius = particle.size * 0.38;
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, -radius, particle.size * 0.25, particle.size * 0.49, 0, 0, Math.PI * 2);
      ctx.fillStyle = particle.color;
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, particle.size * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = particle.centerColor;
    ctx.fill();
  }

  function drawParticles(time) {
    if (document.hidden) {
      window.requestAnimationFrame(drawParticles);
      return;
    }
    if (time - lastFrameAt < 14) {
      window.requestAnimationFrame(drawParticles);
      return;
    }
    lastFrameAt = time;
    ctx.clearRect(0, 0, width, height);
    for (const particle of particles) {
      particle.y += particle.speed;
      particle.x += Math.sin(time * 0.00045 + particle.phase) * particle.drift;
      particle.rotation += particle.spin;
      if (particle.y > height + 25) Object.assign(particle, makeParticle(false));
      if (particle.x < -24)         particle.x = width + 12;
      if (particle.x > width + 24) particle.x = -12;
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      if (particle.kind === 'dust') {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,220,153,0.74)';
        ctx.arc(0, 0, Math.max(0.85, particle.size * 0.2), 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.kind === 'flower') {
        drawFlowerParticle(particle);
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, particle.size * 0.48, particle.size * 1.12, 0, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -particle.size * 0.7);
        ctx.lineTo(0, particle.size * 0.75);
        ctx.strokeStyle = 'rgba(255,237,195,0.34)';
        ctx.lineWidth = 0.55;
        ctx.stroke();
      }
      ctx.restore();
    }
    window.requestAnimationFrame(drawParticles);
  }

  /* ====================================================================
     EVENT LISTENERS
  ==================================================================== */
  startButton.addEventListener('click', () => startExperience(true));
  soundToggle.addEventListener('click',   toggleMusic);
  loopToggle.addEventListener('click',   toggleAutoLoop);
  posterButton.addEventListener('click', openPoster);
  posterPreview.addEventListener('click', openPoster);
  replayButton.addEventListener('click', replayReveal);
  resetButton.addEventListener('click', resetExperience);
  bellButton.addEventListener('click',  animateBell);
  closeModal.addEventListener('click',  closePoster);
  modalBackdrop.addEventListener('click', closePoster);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && posterModal.classList.contains('is-open')) closePoster();
    if (event.key.toLowerCase() === 'r' && !posterModal.classList.contains('is-open')
        && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      replayReveal();
    }
    if (event.code === 'Space' && !posterModal.classList.contains('is-open')
        && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      event.preventDefault();
      animateBell();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && musicEnabled && audioContext) audioContext.suspend();
    else if (!document.hidden && musicEnabled && audioContext) audioContext.resume();
  });

  /* ====================================================================
     INIT
  ==================================================================== */
  window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas();
  window.requestAnimationFrame(drawParticles);
})();
