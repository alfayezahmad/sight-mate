#include <Arduino.h>
#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>

// ── WiFi & Server Configuration ─────────────────────────────────────────────
const char* ssid = "AlfayezHotspot";
const char* password = "123456789";
const char* serverUrl = "http://10.171.137.99:5000/upload"; // Target server

// ── Hardware Pins ───────────────────────────────────────────────────────────
#define BUTTON_PIN 3 // Push button between GPIO 3 and GND

// Camera pin map (ESP32-S3-N16R8-CAM)
#define PWDN_GPIO_NUM -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 15
#define SIOD_GPIO_NUM 4
#define SIOC_GPIO_NUM 5
#define Y9_GPIO_NUM 16
#define Y8_GPIO_NUM 17
#define Y7_GPIO_NUM 18
#define Y6_GPIO_NUM 12
#define Y5_GPIO_NUM 10
#define Y4_GPIO_NUM 8
#define Y3_GPIO_NUM 9
#define Y2_GPIO_NUM 11
#define VSYNC_GPIO_NUM 6
#define HREF_GPIO_NUM 7
#define PCLK_GPIO_NUM 13

bool isBusy = false;
bool isHardwareJpeg = false;

void setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.fb_count = 1;
  config.grab_mode = CAMERA_GRAB_LATEST;

  // 1. Try Hardware JPEG first (instant 0ms compression if sensor supports it)
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA; // 640x480
  config.jpeg_quality = 12; // 10-15 is clear and fast

  esp_err_t err = esp_camera_init(&config);
  if (err == ESP_OK) {
    isHardwareJpeg = true;
    Serial.println("✓ Camera initialized with Hardware JPEG (Fastest, zero lag!)");
    return;
  }

  // 2. Fallback to RGB565 with optimized software conversion if sensor lacks hardware JPEG
  Serial.println("Hardware JPEG not supported by sensor; using optimized RGB565...");
  config.pixel_format = PIXFORMAT_RGB565;
  config.frame_size = psramFound() ? FRAMESIZE_VGA : FRAMESIZE_QVGA;
  config.jpeg_quality = 12;

  err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("ERROR: Camera init failed with code 0x%x\n", err);
    return;
  }
  Serial.println("✓ Camera initialized with RGB565 (PSRAM enabled).");
}

void captureAndSendImage() {
  if (isBusy) return;
  isBusy = true;

  unsigned long startTime = millis();

  // Fast Wi-Fi check
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi dropped! Reconnecting...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);
    unsigned long reconnectStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - reconnectStart < 4000) {
      delay(100);
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Reconnect failed.");
      isBusy = false;
      return;
    }
  }

  Serial.println("\n[Button Pressed] Capturing frame...");

  // 1. Capture frame
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("ERROR: Frame capture failed!");
    isBusy = false;
    return;
  }

  uint8_t *send_buf = NULL;
  size_t send_len = 0;
  bool need_free = false;

  // 2. Process image buffer (Hardware JPEG is 0ms; software conversion uses fast quality 25)
  if (fb->format == PIXFORMAT_JPEG) {
    send_buf = fb->buf;
    send_len = fb->len;
  } else {
    uint8_t *jpg_buf = NULL;
    size_t jpg_buf_len = 0;
    // Quality 25: 5x faster than quality 80, sharp clarity for Gemma 4
    bool converted = frame2jpg(fb, 25, &jpg_buf, &jpg_buf_len);
    if (!converted || !jpg_buf || jpg_buf_len == 0) {
      Serial.println("ERROR: Software JPEG conversion failed.");
      esp_camera_fb_return(fb);
      isBusy = false;
      return;
    }
    send_buf = jpg_buf;
    send_len = jpg_buf_len;
    need_free = true;
  }

  Serial.printf("Image ready in %lu ms (%u bytes). Sending to server...\n", millis() - startTime, send_len);

  // 3. Send to Server via HTTP POST
  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(6000); // Fast 6 second timeout
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("Connection", "close");

  int httpCode = http.POST(send_buf, send_len);

  if (httpCode > 0) {
    Serial.printf(">>> SUCCESS: HTTP %d in %lu ms total!\n", httpCode, millis() - startTime);
    String resp = http.getString();
    Serial.println("Gemma 4 Perception: " + resp);
  } else {
    Serial.printf(">>> FAILED: Error %d (%s)\n", httpCode, http.errorToString(httpCode).c_str());
  }
  http.end();

  // 4. Clean up buffers
  if (need_free && send_buf) {
    free(send_buf);
  }
  esp_camera_fb_return(fb);

  isBusy = false;
  Serial.println("Ready for next button press.\n");
}

void setup() {
  Serial.begin(115200);

  // Non-blocking wait for serial monitor
  unsigned long startWait = millis();
  while (!Serial && (millis() - startWait < 1500)) {
    delay(10);
  }
  delay(100);

  Serial.println("\n=============================================");
  Serial.println("   ESP32-S3 Camera (Ultra-Low Latency Mode)  ");
  Serial.println("=============================================");

  // Set up button on GPIO 3 with internal pull-up
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Connect to Wi-Fi
  Serial.printf("Connecting to: %s ...\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(300);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    // Disable Wi-Fi modem sleep to prevent latency spikes and connection drops
    WiFi.setSleep(false);

    Serial.println("\n✓ Wi-Fi Connected!");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
    Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("\n✗ Wi-Fi failed. Check hotspot band (2.4 GHz).");
  }

  // Initialize camera hardware
  setupCamera();

  Serial.println("\n✓ Ready! Press button on GPIO 3 to capture and send.");
}

void loop() {
  // Check button on GPIO 3 (Active LOW)
  if (digitalRead(BUTTON_PIN) == LOW && !isBusy) {
    delay(40); // Fast debounce
    if (digitalRead(BUTTON_PIN) == LOW) {
      captureAndSendImage();

      // Wait until button is released
      while (digitalRead(BUTTON_PIN) == LOW) {
        delay(20);
      }
      delay(80);
    }
  }

  delay(10);
}