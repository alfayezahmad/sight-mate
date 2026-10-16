# 🦯 SightMate AI — Smart Assistive Walking Stick 

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Hacktoberfest 26](https://img.shields.io/badge/Hacktoberfest-2026-orange.svg)](https://hacktoberfest.com/)
[![Built with Gemma](https://img.shields.io/badge/Built_with-Gemma_4-blue.svg)](https://ai.google.dev/gemma)
[![Hardware](https://img.shields.io/badge/Hardware-ESP32--S3--CAM-success.svg)](#hardware-bom)

**Team:** TECK  
**Project Type:** Assistive Technology Hardware Prototype  
**Target Users:** Visually impaired individuals and older adults  
**Hackathon Categories:** Best Use of Gemma 4 (Google), Best Open-Source AI Project (DigitalOcean)

SightMate AI is a standalone, smart walking-stick prototype that bridges edge-based proximity sensing with powerful cloud-based visual understanding. It provides instant, local buzzer alerts for immediate physical obstacles, and on-demand, AI-generated spoken descriptions of the user's surroundings utilizing Google's **Gemma 4** vision-language model.

> **⚠️ Safety Notice:** SightMate AI is a hardware prototype built for a hackathon, not a certified mobility or medical device. It does not guarantee safe navigation and must not replace a traditional white cane, a guide dog, or professional orientation-and-mobility training. 

---

## 🏆 Hackathon Spotlight 

### Best Use of Gemma 4 (Google DeepMind)
We replaced standard generic text models with Google's latest multimodal model to act as the core spatial-reasoning engine. 
* **Model Identified:** `gemma-4-9b-it` via the **Gemini API**.
* **True Multimodal Edge-to-Cloud:** By upgrading to the ESP32-S3-CAM, the walking stick itself captures the visual environment directly. The device posts JPEG frames straight to our backend, which interfaces with Gemma 4 using the `google-genai` SDK.
* **Prompt Engineering for Safety:** To prevent AI hallucinations (crucial for assistive tech), we pass this strict system prompt alongside the captured image:
  > *"Describe useful, clearly visible environmental details in one short sentence. Do not invent distances, directions, or state that a path is safe. If the image is unclear, reply with 'Camera view obscured'."*

### Best Open-Source AI Project (DigitalOcean)
SightMate AI is entirely open-source. The hardware schematics, edge firmware, and Python backend are publicly available under the **MIT License**, encouraging the developer community to build upon, refine, and deploy open-weight AI in physical hardware.

---

## 🧠 The Architecture: Dual-Pathway Reliability

Because AI can experience latency or network drops, relying *only* on cloud AI for an assistive device is a safety flaw. SightMate AI uses a dual-pathway architecture:

#### ⚡ Path 1: Offline Edge Alerting (Immediate Safety)
* **How it works:** Time-of-Flight (ToF) and ultrasonic sensors constantly scan the immediate < 2m area.
* **Action:** If an object breaches the safety threshold, the ESP32-S3 triggers a localized haptic/audio buzzer. **Zero internet required.** Latency: < 50ms.

#### 🌐 Path 2: Gemma 4 Scene Understanding (Contextual Awareness)
* **How it works:** The user presses the tactile **Scene Request Button** on the handle.
* **Action:** The ESP32-S3 snaps a photo, buffers it in its 8MB PSRAM, and sends it via mobile Wi-Fi hotspot to our FastAPI backend. The backend queries `gemma-4-9b-it` via the Gemini API, and the resulting description is spoken to the user via Bluetooth audio/TTS.

---

## 🛠️ Hardware Bill of Materials (BOM)

* **Main Controller & Vision:** 1 × ESP32-S3-N16R8-CAM (16MB Flash, 8MB PSRAM, OV2640 camera module)
* **Proximity Sensing:** 2 × VL53L8CX multi-zone Time-of-Flight (ToF) sensors (I2C)
* **Backup Sensing:** 1 × HC-SR04 Ultrasonic distance sensor
* **Actuators:** 1 × Active 5V Buzzer (with 2N2222 transistor driver circuit)
* **Inputs:** 1 × Momentary push button (Scene Request)
* **Power:** 1 × 18650 Li-ion battery with TP4056 USB-C charging module
* **Mounting:** Custom 3D-printed cane attachments

*See `docs/wiring_diagram.md` for complete I2C, SPI, and GPIO pinouts.*

---

## 💻 Repository Structure

```text
SightMate-AI/
├── firmware/
│   └── esp32s3_cam_main/   # C++ source for ESP32-S3, camera buffer, & sensors
├── backend/
│   ├── main.py             # FastAPI server & Gemini API integration
│   └── requirements.txt    # Python dependencies
├── docs/
│   ├── wiring_diagram.png  # Schematic and assembly instructions
│   └── demo_video.mp4      # Hacktoberfest submission video
├── .env.example            # Environment variables template
├── LICENSE                 # MIT License
└── README.md
```

---

## 🚀 Quickstart & Deployment

### 1. Set Up the AI Backend

You will need a Gemini API key. Get one from [Google AI Studio](https://aistudio.google.com/).

```bash
# Clone the repository
git clone https://github.com/TeamTECK/SightMate-AI.git
cd SightMate-AI/backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure API Keys
cp ../.env.example .env
```

Edit the `.env` file:
```env
GEMINI_API_KEY="your_actual_api_key_here"
```

Start the Uvicorn server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Flash the ESP32-S3 Firmware
1. Open `firmware/esp32s3_cam_main/` in the Arduino IDE or PlatformIO.
2. Select board: **ESP32S3 Dev Module** (Enable PSRAM: OPI PSRAM).
3. Update the `WIFI_SSID`, `WIFI_PASS`, and `BACKEND_URL` in `config.h`.
4. Upload to the board. 

### 3. Test the Gemma Endpoint Locally (Without Hardware)
Send a test image directly to your running FastAPI server:
```bash
curl -X POST "http://localhost:8000/describe" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@../docs/test_scene.jpg"
```
*Expected JSON Output:*
```json
{
  "status": "success", 
  "model": "gemma-4-9b-it",
  "description": "There is a park bench directly ahead on a paved path.", 
  "audio_url": "/audio/output_123.mp3"
}
```

---

## 📈 Performance Benchmarks

*   **Edge Latency:** Physical object detection to buzzer activation: **< 50ms**.
*   **AI Vision Pipeline:** Camera Capture ➔ FastAPI ➔ Gemini API (Gemma 4) ➔ TTS Output: **~1.8 - 2.2 seconds** (on standard 4G/Wi-Fi).
*   **Memory Efficiency:** Utilizing ESP32-S3's 8MB PSRAM prevents heap fragmentation during high-res JPEG capture and HTTP POST operations.

## 🔮 Future Roadmap

- [ ] **On-Device LLM:** Implement an offline, quantized version of Gemma (e.g., using `gemma.cpp`) directly on a Raspberry Pi Zero 2 W to eliminate cloud dependency entirely.
- [ ] **Custom PCB:** Migrate from breadboards/jumpers to a unified PCB to reduce weight on the cane.
- [ ] **Multi-lingual TTS:** Add localized language support based on GPS coordinates.
- [ ] **O&M Testing:** Conduct closed-course testing with Orientation and Mobility (O&M) specialists.

## 🤝 Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**. Please read our contribution guidelines. *Never commit `.env` files or hardcode API keys.*

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---
*Built with ❤️ by Team TECK for Hacktoberfest 2026.*