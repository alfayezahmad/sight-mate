/**
 * GemmaLens • Real-Time Environmental Vision & Speech Controller
 * Handles IP Webcam streaming, WebRTC device camera, Gemma 4 Vision AI inference,
 * Web Speech TTS readout with waveform animation, and hands-free voice trigger STT.
 */

// Application State
const state = {
  currentSource: 'ipcam', // 'ipcam' | 'device' | 'presets'
  currentScene: 'livingroom',
  deviceStream: null,
  cameraFacingMode: 'environment', // rear camera preferred for assistive vision
  isAnalyzing: false,
  autoIntervalHandle: null,
  speechSynth: window.speechSynthesis || null,
  speechVoices: [],
  selectedVoice: null,
  speechRate: 1.0,
  autoSpeak: true,
  speechRecognition: null,
  isListeningSTT: false,
  history: [],
  config: {
    provider: localStorage.getItem('gl_provider') || 'auto',
    apiKey: localStorage.getItem('gl_apiKey') || '',
    ollamaUrl: localStorage.getItem('gl_ollamaUrl') || 'http://localhost:11434',
    model: localStorage.getItem('gl_model') || 'gemma 4'
  }
};

// DOM References
const DOM = {
  // ESP32-CAM Ingestion Banner
  espCodeSnippet: document.getElementById('esp-code-snippet'),
  btnCopyEspCode: document.getElementById('btn-copy-esp-code'),
  btnTestEspUpload: document.getElementById('btn-test-esp-upload'),

  // Tabs
  tabIpcam: document.getElementById('tab-ipcam'),
  tabDevice: document.getElementById('tab-device'),
  tabPresets: document.getElementById('tab-presets'),

  // Config Bars
  ipcamBar: document.getElementById('ipcam-config-bar'),
  deviceBar: document.getElementById('device-config-bar'),
  presetsBar: document.getElementById('presets-config-bar'),

  // IP Cam controls
  ipcamUrlInput: document.getElementById('ipcam-url'),
  btnConnectIpcam: document.getElementById('btn-connect-ipcam'),
  presetPills: document.querySelectorAll('.preset-pill'),

  // Device Cam controls
  btnToggleCameraFacing: document.getElementById('btn-toggle-camera-facing'),
  cameraResolutionLabel: document.getElementById('camera-resolution-label'),

  // Demo Scenes
  sceneButtons: document.querySelectorAll('.scene-btn'),

  // Viewfinder
  viewfinder: document.getElementById('viewfinder'),
  deviceVideo: document.getElementById('device-video'),
  viewfinderImg: document.getElementById('viewfinder-img'),
  captureCanvas: document.getElementById('capture-canvas'),
  scanline: document.getElementById('scanline'),
  shutterFlash: document.getElementById('shutter-flash'),
  hudStreamMode: document.getElementById('hud-stream-mode'),
  hudTelemetry: document.getElementById('hud-telemetry'),
  hudModelName: document.getElementById('hud-model-name'),

  // Capture & Actions
  btnCapture: document.getElementById('btn-capture'),
  autoIntervalSelect: document.getElementById('auto-interval-select'),
  intervalCountdown: document.getElementById('interval-countdown'),
  countdownCircle: document.getElementById('countdown-circle'),
  countdownNumber: document.getElementById('countdown-number'),
  btnVoiceTrigger: document.getElementById('btn-voice-trigger'),
  voiceTriggerText: document.getElementById('voice-trigger-text'),

  // Perception Output
  resultDisplayArea: document.getElementById('result-display-area'),
  perceptionText: document.getElementById('perception-text'),
  analyzingSkeleton: document.getElementById('analyzing-skeleton'),
  latencyTag: document.getElementById('latency-tag'),
  latencyText: document.getElementById('latency-text'),

  // Speech & Audio
  btnReadAloud: document.getElementById('btn-read-aloud'),
  readAloudText: document.getElementById('read-aloud-text'),
  audioWaveContainer: document.getElementById('audio-wave-container'),
  autoSpeakCheckbox: document.getElementById('auto-speak-checkbox'),
  voiceSelect: document.getElementById('voice-select'),
  speechRateInput: document.getElementById('speech-rate'),
  rateValue: document.getElementById('rate-value'),

  // Speech-to-Text Feedback
  sttLiveBox: document.getElementById('stt-live-box'),
  sttTranscript: document.getElementById('stt-transcript'),

  // History
  historyList: document.getElementById('history-list'),
  btnClearHistory: document.getElementById('btn-clear-history'),

  // Modals & Navigation
  btnPhoneConnect: document.getElementById('btn-phone-connect'),
  btnSettings: document.getElementById('btn-settings'),
  modalPhone: document.getElementById('modal-phone'),
  modalSettings: document.getElementById('modal-settings'),
  btnClosePhoneModal: document.getElementById('btn-close-phone-modal'),
  btnCloseSettingsModal: document.getElementById('btn-close-settings-modal'),
  networkQrImage: document.getElementById('network-qr-image'),
  networkUrlInput: document.getElementById('network-url-input'),
  btnCopyUrl: document.getElementById('btn-copy-url'),

  // Settings Form
  aiProviderSelect: document.getElementById('ai-provider-select'),
  geminiApiKeyInput: document.getElementById('gemini-api-key'),
  ollamaUrlInput: document.getElementById('ollama-url-input'),
  modelNameInput: document.getElementById('model-name-input'),
  btnSaveSettings: document.getElementById('btn-save-settings')
};

// ============================================================================
// AUDIO SYNTHESIS EFFECTS (Web Audio API for shutter & AI chimes)
// ============================================================================
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Camera Shutter Click Sound
function playShutterSound() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {
    // Audio context may require user interaction
  }
}

// AI Analysis Ready Chime
function playChimeSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.setValueAtTime(659.25, now + 0.08); // E5

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.5, now + 0.12); // C6

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.1);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  } catch (e) {}
}

// ============================================================================
// INITIALIZATION
// ============================================================================
async function initApp() {
  setupSourceTabs();
  setupIPWebcam();
  setupDeviceCameraControls();
  setupDemoScenes();
  setupCaptureAction();
  setupAutoInterval();
  setupSpeechSynthesis();
  setupSpeechRecognition();
  setupModals();
  setupEspBanner();
  setupSSEStream();
  loadNetworkInfo();
  applySettingsToUI();

  // Load initial sample scene
  setSampleScene('livingroom');

  console.log('GemmaLens initialized successfully.');
}

// ============================================================================
// REAL-TIME SSE STREAM (Automatic Ingestion - No Input Needed)
// ============================================================================
function setupSSEStream() {
  const eventSource = new EventSource('/api/events');

  eventSource.onopen = () => {
    console.log('✓ Connected to GemmaLens live events stream');
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'NEW_CAM_FRAME' || data.type === 'INITIAL_STATE') {
        handleIncomingCamFrame(data);
      }
    } catch (e) {
      // keep-alive or comment
    }
  };

  eventSource.onerror = () => {
    console.warn('SSE connection dropped, browser will reconnect automatically...');
  };
}

function handleIncomingCamFrame(data) {
  if (!data.imageBase64 || !data.text) return;

  // 1. Update Viewfinder with newly arrived photo
  DOM.viewfinderImg.src = data.imageBase64;
  DOM.deviceVideo.classList.add('hidden');
  DOM.viewfinderImg.classList.remove('hidden');
  DOM.hudStreamMode.textContent = 'IP CAM PUSH';
  DOM.hudTelemetry.textContent = `UPLOAD :5000 • ${data.model || 'Gemma 4'}`;

  // 2. Visual shutter flash effect & audio chime
  playShutterSound();
  DOM.shutterFlash.classList.add('flash');
  setTimeout(() => DOM.shutterFlash.classList.remove('flash'), 120);
  playChimeSound();

  // 3. Update Perception Text Card with Gemma 4 output
  const outputText = data.text;
  const isObscured = outputText.toLowerCase().includes('obscured');
  DOM.perceptionText.textContent = outputText;
  DOM.perceptionText.classList.toggle('obscured', isObscured);
  DOM.perceptionText.style.opacity = '1';

  // 4. Update Latency and Model Tag
  DOM.latencyText.textContent = `${data.model || 'Gemma 4'} • ${data.durationMs || 280}ms`;
  DOM.latencyTag.querySelector('.dot').className = 'dot green';

  // 5. Add to capture history
  addHistoryItem(outputText, data.imageBase64, isObscured);

  // 6. Speak aloud automatically - "the images will arrive we have to process those no input needed on that"
  speakText(outputText);
}

// ============================================================================
// ESP32-CAM INGESTION BANNER CONTROLS
// ============================================================================
function setupEspBanner() {
  if (DOM.btnCopyEspCode && DOM.espCodeSnippet) {
    DOM.btnCopyEspCode.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(DOM.espCodeSnippet.textContent);
        DOM.btnCopyEspCode.textContent = 'Copied!';
        setTimeout(() => DOM.btnCopyEspCode.textContent = 'Copy', 2000);
      } catch (e) {
        DOM.btnCopyEspCode.textContent = 'Copied!';
        setTimeout(() => DOM.btnCopyEspCode.textContent = 'Copy', 2000);
      }
    });
  }

  if (DOM.btnTestEspUpload) {
    DOM.btnTestEspUpload.addEventListener('click', async () => {
      DOM.btnTestEspUpload.textContent = 'Pushing...';
      try {
        // Fetch sample image and POST to /upload
        const sampleScene = state.currentScene || 'kitchen';
        const sampleUrl = `/samples/${sampleScene}.jpg`;
        const imgRes = await fetch(sampleUrl);
        const blob = await imgRes.blob();

        const uploadRes = await fetch('/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob
        });

        const uploadData = await uploadRes.json();
        console.log('Simulated upload response:', uploadData);
        DOM.btnTestEspUpload.textContent = 'Pushed!';
        setTimeout(() => DOM.btnTestEspUpload.textContent = 'Simulate Push', 2000);
      } catch (err) {
        console.error('Test push error:', err);
        DOM.btnTestEspUpload.textContent = 'Error';
        setTimeout(() => DOM.btnTestEspUpload.textContent = 'Simulate Push', 2000);
      }
    });
  }
}

// ============================================================================
// NETWORK INFO & MOBILE QR CODE
// ============================================================================
async function loadNetworkInfo() {
  try {
    const res = await fetch('/api/network-info');
    if (!res.ok) throw new Error('Network info endpoint unavailable');
    const data = await res.json();
    
    if (data.networkUrl) {
      DOM.networkUrlInput.value = data.networkUrl;
      if (DOM.espCodeSnippet && data.cameraCodeSnippet) {
        DOM.espCodeSnippet.textContent = data.cameraCodeSnippet;
      }
      if (!DOM.ipcamUrlInput.value) {
        DOM.ipcamUrlInput.value = `http://${data.localIp}:8080/shot.jpg`;
      }
    }
    if (data.qrCodeDataUrl) {
      DOM.networkQrImage.src = data.qrCodeDataUrl;
    }
  } catch (err) {
    console.warn('Could not load network info:', err.message);
  }
}

// ============================================================================
// CAMERA SOURCE SELECTOR TABS
// ============================================================================
function setupSourceTabs() {
  DOM.tabIpcam.addEventListener('click', () => switchSource('ipcam'));
  DOM.tabDevice.addEventListener('click', () => switchSource('device'));
  DOM.tabPresets.addEventListener('click', () => switchSource('presets'));
}

async function switchSource(source) {
  state.currentSource = source;

  // Update tab buttons
  DOM.tabIpcam.classList.toggle('active', source === 'ipcam');
  DOM.tabDevice.classList.toggle('active', source === 'device');
  DOM.tabPresets.classList.toggle('active', source === 'presets');

  // Toggle sub-config bars
  DOM.ipcamBar.classList.toggle('hidden', source !== 'ipcam');
  DOM.deviceBar.classList.toggle('hidden', source !== 'device');
  DOM.presetsBar.classList.toggle('hidden', source !== 'presets');

  // Stop device camera if switching away
  if (source !== 'device' && state.deviceStream) {
    stopDeviceCamera();
  }

  // Handle specific source activation
  if (source === 'device') {
    DOM.deviceVideo.classList.remove('hidden');
    DOM.viewfinderImg.classList.add('hidden');
    DOM.hudStreamMode.textContent = 'DEVICE WEBCAM';
    await startDeviceCamera();
  } else if (source === 'ipcam') {
    DOM.deviceVideo.classList.add('hidden');
    DOM.viewfinderImg.classList.remove('hidden');
    DOM.hudStreamMode.textContent = 'IP CAM PROXY';
    connectIPWebcam();
  } else if (source === 'presets') {
    DOM.deviceVideo.classList.add('hidden');
    DOM.viewfinderImg.classList.remove('hidden');
    DOM.hudStreamMode.textContent = 'DEMO PRESET';
    setSampleScene(state.currentScene);
  }
}

// ============================================================================
// IP WEBCAM MANAGEMENT
// ============================================================================
function setupIPWebcam() {
  DOM.btnConnectIpcam.addEventListener('click', () => {
    connectIPWebcam();
  });

  DOM.ipcamUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectIPWebcam();
  });

  // Preset pill clickers
  DOM.presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const format = pill.dataset.format;
      const currentVal = DOM.ipcamUrlInput.value || 'http://192.168.1.18:8080/shot.jpg';
      let baseUrl = currentVal.replace(/(\/shot\.jpg|\/video|\/capture|\/mjpeg)$/, '');

      if (format === 'android-shot') {
        DOM.ipcamUrlInput.value = `${baseUrl}/shot.jpg`;
      } else if (format === 'android-video') {
        DOM.ipcamUrlInput.value = `${baseUrl}/video`;
      } else if (format === 'esp32') {
        DOM.ipcamUrlInput.value = `${baseUrl}/capture`;
      }
      connectIPWebcam();
    });
  });
}

function connectIPWebcam() {
  const rawUrl = DOM.ipcamUrlInput.value.trim();
  if (!rawUrl) return;

  DOM.hudTelemetry.textContent = 'Connecting IP Cam...';
  
  // Use our backend proxy to avoid browser CORS / mixed-content blocks
  const proxiedUrl = `/api/cam/proxy?url=${encodeURIComponent(rawUrl)}&t=${Date.now()}`;
  
  const tempImg = new Image();
  tempImg.onload = () => {
    DOM.viewfinderImg.src = proxiedUrl;
    DOM.hudTelemetry.textContent = `${tempImg.naturalWidth}×${tempImg.naturalHeight} • IP CAM`;
  };
  tempImg.onerror = () => {
    DOM.hudTelemetry.textContent = 'Cam Offline / Retrying...';
    // Fall back to sample scene if unreachable
    DOM.viewfinderImg.src = `/samples/${state.currentScene}.jpg`;
  };
  tempImg.src = proxiedUrl;
}

// ============================================================================
// DEVICE CAMERA (Phone / Laptop Front & Back Webcams)
// ============================================================================
function setupDeviceCameraControls() {
  DOM.btnToggleCameraFacing.addEventListener('click', async () => {
    state.cameraFacingMode = state.cameraFacingMode === 'environment' ? 'user' : 'environment';
    await startDeviceCamera();
  });
}

async function startDeviceCamera() {
  if (state.deviceStream) {
    stopDeviceCamera();
  }

  try {
    DOM.cameraResolutionLabel.textContent = 'Initializing Camera...';
    const constraints = {
      video: {
        facingMode: { ideal: state.cameraFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.deviceStream = stream;
    DOM.deviceVideo.srcObject = stream;
    
    DOM.deviceVideo.onloadedmetadata = () => {
      DOM.deviceVideo.play();
      const w = DOM.deviceVideo.videoWidth;
      const h = DOM.deviceVideo.videoHeight;
      DOM.hudTelemetry.textContent = `${w}×${h} • 30 FPS`;
      DOM.cameraResolutionLabel.textContent = `${state.cameraFacingMode === 'environment' ? 'Rear' : 'Front'} Camera (${w}×${h})`;
    };
  } catch (err) {
    console.error('Device camera error:', err);
    DOM.cameraResolutionLabel.textContent = 'Camera Access Blocked';
    DOM.hudTelemetry.textContent = 'Camera Permission Denied';
    alert('Could not access device camera. Please allow camera permissions in your browser, or use IP Webcam / Demo Scenes.');
  }
}

function stopDeviceCamera() {
  if (state.deviceStream) {
    state.deviceStream.getTracks().forEach(track => track.stop());
    state.deviceStream = null;
    DOM.deviceVideo.srcObject = null;
  }
}

// ============================================================================
// DEMO PRESETS
// ============================================================================
function setupDemoScenes() {
  DOM.sceneButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.sceneButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setSampleScene(btn.dataset.scene);
    });
  });
}

function setSampleScene(sceneName) {
  state.currentScene = sceneName;
  const samplePath = `/samples/${sceneName}.jpg`;
  DOM.viewfinderImg.src = samplePath;

  const sceneTitles = {
    livingroom: 'Living Room (1280×960)',
    hallway: 'Hallway Corridor (1280×960)',
    kitchen: 'Kitchen Area (1280×960)',
    obscured: 'Obscured Lens View'
  };

  DOM.hudTelemetry.textContent = sceneTitles[sceneName] || 'Sample Scene';
}

// ============================================================================
// CAPTURE FRAME TO BASE64
// ============================================================================
function captureCurrentFrameBase64() {
  const canvas = DOM.captureCanvas;
  const ctx = canvas.getContext('2d');

  if (state.currentSource === 'device' && state.deviceStream) {
    const video = DOM.deviceVideo;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } else {
    // From Image element (IP Camera or Preset)
    const img = DOM.viewfinderImg;
    canvas.width = img.naturalWidth || 640;
    canvas.height = img.naturalHeight || 480;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  // Return base64 JPEG
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ============================================================================
// GEMMA 4 VISION INFERENCE CALL
// ============================================================================
function setupCaptureAction() {
  DOM.btnCapture.addEventListener('click', () => {
    performCaptureAndAnalysis();
  });
}

async function performCaptureAndAnalysis() {
  if (state.isAnalyzing) return;
  state.isAnalyzing = true;

  // Audio & Visual Effects
  playShutterSound();
  DOM.shutterFlash.classList.add('flash');
  setTimeout(() => DOM.shutterFlash.classList.remove('flash'), 120);

  // Trigger Scanning Laser
  DOM.scanline.classList.add('active');

  // UI skeleton state
  DOM.analyzingSkeleton.classList.remove('hidden');
  DOM.perceptionText.style.opacity = '0.3';
  DOM.latencyText.textContent = 'Gemma 4 Analyzing...';
  DOM.latencyTag.querySelector('.dot').className = 'dot orange';

  try {
    const base64Data = captureCurrentFrameBase64();

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64Data,
        provider: state.config.provider,
        apiKey: state.config.apiKey,
        model: state.config.model,
        ollamaUrl: state.config.ollamaUrl,
        sampleHint: state.currentSource === 'presets' ? state.currentScene : null
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const outputText = data.text || "Camera view obscured.";
    const isObscured = outputText.toLowerCase().includes('obscured');

    // Update Perception Card
    DOM.perceptionText.textContent = outputText;
    DOM.perceptionText.classList.toggle('obscured', isObscured);
    DOM.perceptionText.style.opacity = '1';

    // Update Latency & Provider tag
    DOM.latencyText.textContent = `${data.provider || 'Gemma 4'} • ${data.durationMs || 350}ms`;
    DOM.latencyTag.querySelector('.dot').className = 'dot green';

    // Play chime
    playChimeSound();

    // Log to History
    addHistoryItem(outputText, base64Data, isObscured);

    // Automatic Speech Readout
    if (state.autoSpeak && DOM.autoSpeakCheckbox.checked) {
      speakText(outputText);
    }

  } catch (err) {
    console.error('Vision analysis error:', err);
    DOM.perceptionText.textContent = "Camera view obscured.";
    DOM.perceptionText.classList.add('obscured');
    DOM.perceptionText.style.opacity = '1';
    DOM.latencyText.textContent = 'Analysis Failed';
    DOM.latencyTag.querySelector('.dot').className = 'dot orange';

    if (state.autoSpeak && DOM.autoSpeakCheckbox.checked) {
      speakText("Camera view obscured.");
    }
  } finally {
    state.isAnalyzing = false;
    DOM.scanline.classList.remove('active');
    DOM.analyzingSkeleton.classList.add('hidden');
  }
}

// ============================================================================
// CONTINUOUS AUTO-INTERVAL
// ============================================================================
function setupAutoInterval() {
  let intervalSec = 0;
  let remainingSec = 0;

  DOM.autoIntervalSelect.addEventListener('change', () => {
    const val = parseInt(DOM.autoIntervalSelect.value, 10);
    clearInterval(state.autoIntervalHandle);
    state.autoIntervalHandle = null;

    if (val <= 0) {
      DOM.intervalCountdown.classList.add('hidden');
      return;
    }

    intervalSec = val / 1000;
    remainingSec = intervalSec;
    DOM.intervalCountdown.classList.remove('hidden');
    DOM.countdownNumber.textContent = remainingSec;

    state.autoIntervalHandle = setInterval(() => {
      remainingSec--;
      if (remainingSec <= 0) {
        remainingSec = intervalSec;
        performCaptureAndAnalysis();
      }
      DOM.countdownNumber.textContent = remainingSec;
      const progress = ((intervalSec - remainingSec) / intervalSec) * 100;
      DOM.countdownCircle.setAttribute('stroke-dasharray', `${progress}, 100`);
    }, 1000);
  });
}

// ============================================================================
// TEXT-TO-SPEECH (TTS) & AUDIO WAVEFORM VISUALIZER
// ============================================================================
function setupSpeechSynthesis() {
  if (!state.speechSynth) {
    console.warn('Web Speech API synthesis not supported in this browser.');
    DOM.btnReadAloud.style.display = 'none';
    return;
  }

  // Populate Voices
  function populateVoices() {
    state.speechVoices = state.speechSynth.getVoices().filter(v => v.lang.startsWith('en'));
    DOM.voiceSelect.innerHTML = '<option value="">System Default</option>';
    
    state.speechVoices.forEach((voice, index) => {
      const opt = document.createElement('option');
      opt.value = index;
      opt.textContent = `${voice.name} (${voice.lang})`;
      DOM.voiceSelect.appendChild(opt);
    });
  }

  populateVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }

  // Voice Select Change
  DOM.voiceSelect.addEventListener('change', () => {
    const idx = DOM.voiceSelect.value;
    state.selectedVoice = idx !== "" ? state.speechVoices[idx] : null;
  });

  // Speed Slider
  DOM.speechRateInput.addEventListener('input', () => {
    state.speechRate = parseFloat(DOM.speechRateInput.value);
    DOM.rateValue.textContent = `${state.speechRate.toFixed(1)}x`;
  });

  // Read Aloud Button
  DOM.btnReadAloud.addEventListener('click', () => {
    const text = DOM.perceptionText.textContent.trim();
    if (text) {
      speakText(text);
    }
  });

  // Auto-speak checkbox
  DOM.autoSpeakCheckbox.addEventListener('change', () => {
    state.autoSpeak = DOM.autoSpeakCheckbox.checked;
  });
}

function speakText(text) {
  if (!state.speechSynth) return;

  // Cancel any ongoing speech
  state.speechSynth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  if (state.selectedVoice) {
    utterance.voice = state.selectedVoice;
  }
  utterance.rate = state.speechRate || 1.0;
  utterance.pitch = 1.0;

  // Visualizer Animation
  utterance.onstart = () => {
    DOM.audioWaveContainer.classList.add('active');
    DOM.btnReadAloud.classList.add('speaking');
    DOM.readAloudText.textContent = 'Speaking...';
  };

  utterance.onend = () => {
    DOM.audioWaveContainer.classList.remove('active');
    DOM.btnReadAloud.classList.remove('speaking');
    DOM.readAloudText.textContent = 'Read Description';
  };

  utterance.onerror = () => {
    DOM.audioWaveContainer.classList.remove('active');
    DOM.btnReadAloud.classList.remove('speaking');
    DOM.readAloudText.textContent = 'Read Description';
  };

  state.speechSynth.speak(utterance);
}

// ============================================================================
// SPEECH-TO-TEXT (STT) VOICE COMMAND TRIGGER
// ============================================================================
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    DOM.btnVoiceTrigger.title = 'Speech Recognition not supported in this browser.';
    DOM.btnVoiceTrigger.style.opacity = '0.5';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    state.isListeningSTT = true;
    DOM.btnVoiceTrigger.classList.add('listening');
    DOM.voiceTriggerText.textContent = 'Listening...';
    DOM.sttLiveBox.classList.remove('hidden');
    DOM.sttTranscript.textContent = 'Say "Capture" or "Describe"...';
  };

  recognition.onresult = (event) => {
    const lastResultIndex = event.results.length - 1;
    const transcript = event.results[lastResultIndex][0].transcript.trim().toLowerCase();
    DOM.sttTranscript.textContent = `"${transcript}"`;

    // Voice trigger phrases
    if (
      transcript.includes('capture') ||
      transcript.includes('analyze') ||
      transcript.includes('describe') ||
      transcript.includes('take photo') ||
      transcript.includes('what do you see')
    ) {
      DOM.sttTranscript.textContent = `⚡ Triggered: "${transcript}"`;
      performCaptureAndAnalysis();
    } else if (
      transcript.includes('repeat') ||
      transcript.includes('read again') ||
      transcript.includes('say again')
    ) {
      speakText(DOM.perceptionText.textContent.trim());
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech Recognition error:', event.error);
    if (event.error !== 'no-speech') {
      stopVoiceListening();
    }
  };

  recognition.onend = () => {
    // If still supposed to be listening, restart (keeps listening hands-free)
    if (state.isListeningSTT) {
      try {
        recognition.start();
      } catch (e) {
        stopVoiceListening();
      }
    }
  };

  state.speechRecognition = recognition;

  DOM.btnVoiceTrigger.addEventListener('click', () => {
    if (state.isListeningSTT) {
      stopVoiceListening();
    } else {
      startVoiceListening();
    }
  });
}

function startVoiceListening() {
  if (!state.speechRecognition) return;
  try {
    state.isListeningSTT = true;
    state.speechRecognition.start();
  } catch (e) {
    console.warn('Speech recognition start failed:', e);
  }
}

function stopVoiceListening() {
  state.isListeningSTT = false;
  if (state.speechRecognition) {
    state.speechRecognition.stop();
  }
  DOM.btnVoiceTrigger.classList.remove('listening');
  DOM.voiceTriggerText.textContent = 'Voice Trigger';
  DOM.sttLiveBox.classList.add('hidden');
}

// ============================================================================
// CAPTURE HISTORY TIMELINE
// ============================================================================
function addHistoryItem(text, thumbnailBase64, isObscured) {
  const item = {
    id: Date.now(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    text: text,
    thumb: thumbnailBase64,
    isObscured: isObscured
  };

  state.history.unshift(item);
  if (state.history.length > 20) state.history.pop();
  renderHistory();
}

function renderHistory() {
  DOM.historyList.innerHTML = '';
  
  if (state.history.length === 0) {
    DOM.historyList.innerHTML = '<p style="color: var(--text-dim); font-size: 0.8rem; text-align: center; padding: 10px;">No captures yet.</p>';
    return;
  }

  state.history.forEach(item => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <img src="${item.thumb}" class="history-thumb" alt="thumbnail">
      <div class="history-details">
        <p class="history-desc" style="${item.isObscured ? 'color: #fda4af;' : ''}">${item.text}</p>
        <span class="history-time">${item.time}</span>
      </div>
      <div class="history-play-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </div>
    `;

    el.addEventListener('click', () => {
      DOM.perceptionText.textContent = item.text;
      DOM.perceptionText.classList.toggle('obscured', item.isObscured);
      speakText(item.text);
    });

    DOM.historyList.appendChild(el);
  });
}

DOM.btnClearHistory.addEventListener('click', () => {
  state.history = [];
  renderHistory();
});

// ============================================================================
// MODALS (PHONE CONNECT & SETTINGS)
// ============================================================================
function setupModals() {
  // Phone Connect Modal
  DOM.btnPhoneConnect.addEventListener('click', () => {
    DOM.modalPhone.classList.remove('hidden');
    loadNetworkInfo();
  });

  DOM.btnClosePhoneModal.addEventListener('click', () => {
    DOM.modalPhone.classList.add('hidden');
  });

  DOM.btnCopyUrl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(DOM.networkUrlInput.value);
      DOM.btnCopyUrl.textContent = 'Copied!';
      setTimeout(() => DOM.btnCopyUrl.textContent = 'Copy', 2000);
    } catch (e) {
      DOM.networkUrlInput.select();
      document.execCommand('copy');
      DOM.btnCopyUrl.textContent = 'Copied!';
      setTimeout(() => DOM.btnCopyUrl.textContent = 'Copy', 2000);
    }
  });

  // Settings Modal
  DOM.btnSettings.addEventListener('click', () => {
    DOM.modalSettings.classList.remove('hidden');
  });

  DOM.btnCloseSettingsModal.addEventListener('click', () => {
    DOM.modalSettings.classList.add('hidden');
  });

  // Close modals on clicking backdrop
  [DOM.modalPhone, DOM.modalSettings].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Settings Save
  DOM.btnSaveSettings.addEventListener('click', () => {
    state.config.provider = DOM.aiProviderSelect.value;
    state.config.apiKey = DOM.geminiApiKeyInput.value.trim();
    state.config.ollamaUrl = DOM.ollamaUrlInput.value.trim();
    state.config.model = DOM.modelNameInput.value.trim();

    localStorage.setItem('gl_provider', state.config.provider);
    localStorage.setItem('gl_apiKey', state.config.apiKey);
    localStorage.setItem('gl_ollamaUrl', state.config.ollamaUrl);
    localStorage.setItem('gl_model', state.config.model);

    DOM.hudModelName.textContent = (state.config.model || 'GEMMA 4').toUpperCase();
    DOM.modalSettings.classList.add('hidden');
  });
}

function applySettingsToUI() {
  DOM.aiProviderSelect.value = state.config.provider;
  DOM.geminiApiKeyInput.value = state.config.apiKey;
  DOM.ollamaUrlInput.value = state.config.ollamaUrl;
  DOM.modelNameInput.value = state.config.model;
  DOM.hudModelName.textContent = (state.config.model || 'GEMMA 4').toUpperCase();
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
