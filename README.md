# Gemma 4 AI Assistive Walking Stick

A student prototype combining local obstacle alerts with AI-assisted scene descriptions. An ESP32 reads two VL53L8CX multi-zone (8×8) distance sensors and an acoustic (ultrasonic) sensor, controlling an active buzzer. A separate camera/backend subsystem can send an image to Gemma 4 and speak the returned scene description.

> **Safety notice:** This is an experimental prototype, not a certified mobility aid. It does not replace a white cane, orientation-and-mobility training, or established mobility tools. Sensors can miss obstacles, including drop-offs, overhead objects, moving objects, and objects outside their field of view. Never rely on an AI description to decide whether a route is safe. Test in a controlled environment with a sighted helper.

## Current prototype scope

- ESP32 firmware framework for two VL53L8CX multi-zone time-of-flight sensors and an acoustic ranging sensor.
- Local buzzer patterns based on the nearest valid reading across optical and acoustic sensors.
- Button press event reported over Serial for a future camera/AI capture workflow.
- **Gemma 4 integration is not implemented in the ESP32 firmware.** The camera, companion backend, Wi-Fi transport, and speech output are separate future tasks.

## Hardware

- ESP32 DevKit V1 (adapt pins for your exact board)
- 2 × VL53L8CX multi-zone ToF breakout boards
- 1 × Acoustic (ultrasonic) distance sensor (e.g., 3.3V-compatible RCWL-1601 / US-100, or HC-SR04 with voltage divider)
- Active buzzer with suitable supply rating
- 2N2222 or equivalent NPN transistor and 1 kΩ base resistor if required by buzzer current
- Momentary pushbutton
- USB power bank / USB supply, wires, mounting hardware, stick frame

### Example pin map

| Function | ESP32 pin |
|---|---:|
| I²C SDA (both VL53L8CX sensors) | GPIO 21 |
| I²C SCL (both VL53L8CX sensors) | GPIO 22 |
| Front ToF sensor LPn / XSHUT | GPIO 16 |
| Lower ToF sensor LPn / XSHUT | GPIO 17 |
| Acoustic sensor Trigger (TRIG) | GPIO 18 |
| Acoustic sensor Echo (ECHO) | GPIO 19 |
| Buzzer driver control | GPIO 25 |
| Scene-request button | GPIO 27 |

Pin assignments are examples. Check your exact board and module documentation.

### Wiring notes

- Both sensors' SDA pins connect to GPIO 21; both SCL pins connect to GPIO 22.
- Connect grounds together. Power each breakout only at a voltage its documentation supports; not all breakout boards are identical.
- Both VL53L8CX sensors commonly start at 7-bit I²C address `0x29` (0x52 in 8-bit). The firmware starts the front sensor first and assigns `0x30`, then starts the lower sensor and assigns `0x31` using LPn / XSHUT. Confirm your board/library supports this.
- Acoustic sensor: Connect TRIG to GPIO 18 and ECHO to GPIO 19. Ensure the ECHO pin voltage does not exceed 3.3 V into the ESP32 (use a 3.3V-compatible module or a resistor divider if using a 5 V sensor like HC-SR04).
- Example buzzer driver: GPIO 25 → 1 kΩ resistor → NPN base; emitter → GND; collector → buzzer negative; buzzer positive → its rated supply. A flyback diode is for inductive loads, not normally a piezo buzzer.
- Button connects GPIO 27 to GND; firmware enables the internal pull-up.
- Power ESP32 through USB. Never connect 5 V directly to ESP32 GPIO or a 3.3 V-only sensor pin.

## Firmware setup

1. Install Arduino IDE or PlatformIO.
2. Install the **SparkFun VL53L8CX** (or **STM32duino VL53L8CX**) library using Arduino Library Manager.
3. Open `firmware/assistive_stick.ino`.
4. Select your ESP32 board and serial port; verify the pin map.
5. Upload and open Serial Monitor at **115200 baud**.
6. Test each sensor individually, then both together, at known distances in a controlled environment.

## Example buzzer behavior

- More than 100 cm or no valid reading: buzzer off.
- 30–100 cm: slower beeps.
- 30 cm or closer: faster beeps.

These are development values, not validated safety thresholds. Tune only after controlled testing. Firmware uses non-blocking timing for buzzer patterns.

## Gemma 4 companion subsystem

The button currently prints `SCENE_REQUEST` to Serial. A future companion app can listen for this event, capture an image, send it to a configured Gemma 4 model using the Google Gen AI API, and optionally read the response aloud. Keep API keys on the companion computer in environment variables, never in ESP32 firmware or GitHub. Verify API/model access before the demo and document the exact model ID used.

## Suggested repository layout

```text
.
├── README.md
├── LICENSE
├── .gitignore
├── .env.example
├── firmware/assistive_stick.ino
├── backend/README.md
├── hardware/bill-of-materials.md
├── hardware/assembly-guide.md
└── tests/README.md
```

## Testing checklist

- [ ] Test each sensor independently and both together.
- [ ] Confirm distinct I²C addresses for optical sensors.
- [ ] Test acoustic sensor on transparent/clear obstacles (glass doors, transparent acrylic) and soft absorbent surfaces.
- [ ] Measure readings at known distances, angles, and surface types.
- [ ] Verify buzzer patterns respond to distance changes.
- [ ] Confirm local alerts do not depend on Wi-Fi or AI.
- [ ] Confirm button prints `SCENE_REQUEST` in Serial Monitor.
- [ ] Document test conditions, failures, and limitations honestly.

## Open source

Choose a license that matches the code and assets you own. MIT is common for original code, but check licenses for third-party code, diagrams, photos, and dependencies. An open-source repository does not make third-party models or services open-source automatically.

## Disclaimer

For learning and demonstration only. Not a medical device or substitute for established mobility aids. Sensors and AI can fail or provide incomplete information. The device does not guarantee obstacle avoidance or safe routes.
