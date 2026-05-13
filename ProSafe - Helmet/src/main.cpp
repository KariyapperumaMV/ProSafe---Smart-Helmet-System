#include <Arduino.h>
#include <Wire.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <driver/i2s.h>
#include <MAX30105.h>
#include <heartRate.h>
#include <math.h>
#include <freertos/FreeRTOS.h>
#include <esp_task_wdt.h>

// ==============================
// ADDITIONS FROM CODE B (WiFi, HTTP, JSON)
// ==============================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
// ==============================
// WIFI & BACKEND API CONFIG
// ==============================
const char* WIFI_SSID = "Methya";
const char* WIFI_PASS = "Goofy101@*";

const char* HELMET_ID         = "BS-H-001";
const char* NORMAL_API_URL    = "http://172.20.10.3:5000/api/helmet/data";
const char* EMERGENCY_API_URL = "http://172.20.10.3:5000/api/helmet/emergency";
const char* COMMAND_API_BASE  = "http://172.20.10.3:5000/api/helmet/commands/";
const char* BACKEND_HOST      = "172.20.10.3";
const uint16_t BACKEND_PORT   = 5000;

// ==============================
// PIN DEFINITIONS
// ==============================
// Gas Sensor
#define MQ2_PIN 34
// Temperature & Humidity - DHT11
#define DHT_PIN 4
#define DHT_TYPE DHT11

#define I2S_WS 15
#define I2S_SD 32
#define I2S_SCK 14

// Heart Rate Sensor (I2C)
#define I2C_SDA 21
#define I2C_SCL 22

// Body Temperature
#define LM35_PIN 35

// UV Sensor
#define UV_PIN 33

// GPS (UART2)
#define GPS_TX 17
#define GPS_RX 16

// Outputs
#define LED_R 26
#define LED_G 27
#define LED_B 12
#define EMERGENCY_BTN 13

// LED PWM (LEDC) channels
const int LED_R_CH = 0;
const int LED_G_CH = 1;
const int LED_B_CH = 2;
const int LED_PWM_FREQ = 5000;   // Hz
const int LED_PWM_RES = 8;       // 0-255 duty

// ==============================
// SENSOR THRESHOLDS (adjusted to document values)
// ==============================
// Gas Sensor (ppm equivalent)
#define MQ2_SAFE 150
#define MQ2_WARNING 300

// Ambient Temperature (°C)
#define TEMP_SAFE 30
#define TEMP_WARNING 36    // 35 is warning, 36+ critical

// Heart Rate (BPM)
#define HR_MIN_SAFE 88
#define HR_MAX_SAFE 149
#define HR_MIN_WARNING 85
#define HR_MAX_WARNING 175

// Body Temperature (°C)
#define BODY_TEMP_MIN_SAFE 35
#define BODY_TEMP_MAX_SAFE 38
#define BODY_TEMP_WARNING 40
#define BODY_TEMP_CRITICAL_LOW 30
const float BODY_TEMP_CONTACT_DELTA = 1.5f;  // Min difference vs ambient to ensure skin contact
const float BODY_TEMP_FILTER_ALPHA = 0.2f;    // Smoothing factor for LM35 (0-1)

// UV Index
#define UV_SAFE 3
#define UV_WARNING 9    // 8 is warning, 9+ critical

// Noise Levels (dB)
#define NOISE_SAFE 80
#define NOISE_WARNING 85

// DHT11 recovery behavior
const uint8_t DHT_READ_RETRIES = 3;
const uint8_t DHT_MAX_FAILURES_BEFORE_RESET = 5;
const unsigned long DHT_RESET_COOLDOWN_MS = 2000;
const float DHT_FALLBACK_TEMP_C = 34.5f;
const float DHT_FALLBACK_HUMIDITY = 58.0f;

const unsigned long GPS_READ_WINDOW_MS = 20;
const unsigned long EMERGENCY_DEBOUNCE_MS = 50;
const unsigned long EMERGENCY_CLEAR_DELAY_MS = 3000;
const unsigned long GPS_REINIT_INTERVAL_MS = 15000;
const long IR_DYNAMIC_MARGIN = 8000;   // Minimum delta over baseline to treat as finger contact
const float IR_BASELINE_ALPHA = 0.05f; // Baseline update speed when no finger present

// Watchdog Timer (seconds)
#define WDT_TIMEOUT 10

// ==============================
// ADDITIONAL TIMING CONSTANTS (from Code B)
// ==============================
const unsigned long PACKET_INTERVAL_MS = 60000;      // Send normal data every 60 seconds
const unsigned long COMMAND_POLL_INTERVAL_MS = 5000; // Poll backend for commands every 5 seconds
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 30000; // Retry WiFi every 30 seconds if disconnected
const uint16_t HTTP_TIMEOUT_MS = 4000;               // HTTP blocking timeout (ms)
const uint16_t BACKEND_PROBE_TIMEOUT_MS = 500;
const unsigned long BACKEND_PROBE_COOLDOWN_MS = 15000;

// ==============================
// GLOBAL OBJECTS
// ==============================
DHT dht(DHT_PIN, DHT_TYPE);
MAX30105 particleSensor;
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);  // UART2

// ==============================
// GLOBAL VARIABLES
// ==============================
// Sensor Readings
int mq2Value = 0;
float ambientTemp = NAN;
float ambientHumidity = NAN;
float noiseLevel = NAN;
float bodyTemp = NAN;
int heartRate = 0;
int uvIndex = 0;
float latitude = 0.0;
float longitude = 0.0;
String location = "Unknown";
const float DEFAULT_LATITUDE = 6.927079f;   // Hard-coded GPS latitude (Colombo)
const float DEFAULT_LONGITUDE = 79.861244f; // Hard-coded GPS longitude (Colombo)
const char* DEFAULT_LOCATION = "6.927079,79.861244";
bool mq2Valid = false;
bool ambientTempValid = false;
bool ambientHumidityValid = false;
bool noiseValid = false;
bool uvIndexValid = false;
bool heartRateValid = false;
bool bodyTempValid = false;
bool sensorDataValid = false;
float bodyTempFiltered = NAN;
bool bodyTempFilterInitialized = false;
int dhtFailureStreak = 0;
unsigned long lastDhtResetAttemptAt = 0;
bool dhtUsingFallback = false;

// Status Flags
bool isEmergency = false;
bool allConditionsGood = true;
bool environmentSafe = false;
bool environmentWarning = false;
bool environmentCritical = false;
bool biometricReady = false;

// Timing
unsigned long lastDisplayTime = 0;
unsigned long emergencyLatchedAt = 0;
unsigned long emergencyReleaseCandidate = 0;
unsigned long lastGpsReinitAttempt = 0;
bool gpsUsePrimaryPins = true;
int gpsCurrentRxPin = GPS_RX;
int gpsCurrentTxPin = GPS_TX;

// Alert tracking
enum AlertLevel { ALERT_NORMAL, ALERT_WARNING, ALERT_CRITICAL, ALERT_EMERGENCY };
AlertLevel currentAlertLevel = ALERT_NORMAL;

// Detection thresholds
const long IR_FINGER_THRESHOLD = 50000;  // MIN IR level to consider a valid finger on MAX30102

// ==============================
// ADDITIONS FROM CODE B (Network & State)
// ==============================
// Wi-Fi connection state
bool wifiConnected = false;
unsigned long lastWifiReconnectAttempt = 0;
bool backendReachable = true;
unsigned long backendProbeSuppressedUntil = 0;

// Packet sending flags
bool emergencyPacketSent = false;
unsigned long lastPacketSentAt = 0;
unsigned long lastCommandCheckAt = 0;

// Sensor warning/critical lists for backend reporting
const int MAX_SENSORS = 10;
String warningSensors[MAX_SENSORS];
String criticalSensors[MAX_SENSORS];
int warningCount = 0;
int criticalCount = 0;

// ==============================
// I2S CONFIGURATION FOR NOISE SENSOR
// ==============================
const i2s_config_t i2s_config = {
    .mode = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 44100,
    .bits_per_sample = i2s_bits_per_sample_t(32),
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_STAND_I2S),
    .intr_alloc_flags = 0,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
};

const i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
};

// ==============================
// FUNCTION PROTOTYPES
// ==============================
void setupSensors();
void setupLEDs();
void readAllSensors();
void checkConditions();
void handleAlerts();
void setLEDColor(int r, int g, int b);
void displayReadings();
void calculateHeartRate();
float calculateNoiseRMS();
void calibrateSensors();
void updateEmergencyButton();
void attemptEmergencyReset();
void readGpsStream();
void configureGpsUart(bool usePrimaryPins = true);
bool validateSensorReadings();
void resetGpsModule();

// ==============================
// NEW FUNCTION PROTOTYPES (from Code B)
// ==============================
void connectWiFi();
void checkWiFiConnection();
void postJSON(const char* url, JsonDocument &doc);
void sendEmergencyPacket();
void sendNormalPacket();
void checkBackendCommand();
String getHelmetStatusString();
String getIsoTimestamp();
bool ensureBackendReachable();

// ==============================
// SETUP FUNCTION
// ==============================
void setup() {
    Serial.begin(115200);
    Serial.println("   SMART CONSTRUCTION HELMET SYSTEM");
    Serial.println("=========================================");
    Serial.println("Initializing sensors...");
    
    // Initialize Watchdog Timer
    esp_task_wdt_init(WDT_TIMEOUT, true);
    esp_task_wdt_add(NULL);
    
    // Initialize I2C
    Wire.begin(I2C_SDA, I2C_SCL);
    
    // Initialize GPIO
    pinMode(EMERGENCY_BTN, INPUT_PULLUP);

    setupLEDs();
    
    // Initialize sensors
    setupSensors();
    
    // Calibrate sensors
    calibrateSensors();
    
    // Connect to Wi-Fi (non‑blocking attempt)
    connectWiFi();
    
    Serial.println("\nSystem Ready!");
    Serial.println("All conditions good");
    setLEDColor(0, 255, 0);  // Green LED
    
    delay(1000);

    // Force the first normal packet to send immediately after initial sensor read
    lastPacketSentAt = millis() - PACKET_INTERVAL_MS;
}

// ==============================
// SETUP SENSORS
// ==============================
void setupSensors() {
    // DHT11
    dht.begin();
    Serial.println("DHT11 initialized");
    
    // MAX30102 Heart Rate - with retry logic
    Serial.print("Initializing MAX30102... ");
    int maxRetries = 3;
    bool max30102Initialized = false;
    
    for(int i = 0; i < maxRetries; i++) {
        if (particleSensor.begin(Wire, I2C_SPEED_FAST)) {
            max30102Initialized = true;
            break;
        }
        Serial.printf("Attempt %d failed, retrying...\n", i+1);
        delay(1000);
    }
    
    if (!max30102Initialized) {
        Serial.println("MAX30102 not found. Check wiring!");
    } else {
        particleSensor.setup();
        particleSensor.setPulseAmplitudeRed(0x0A);
        particleSensor.setPulseAmplitudeGreen(0);
        Serial.println("MAX30102 initialized");
    }
    
    // I2S for Noise Sensor with error checking
    Serial.print("Initializing INMP441 Noise Sensor... ");
    esp_err_t err = i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("I2S driver install failed: %d\n", err);
    } else {
        err = i2s_set_pin(I2S_NUM_0, &pin_config);
        if (err != ESP_OK) {
            Serial.printf("I2S pin config failed: %d\n", err);
        } else {
            Serial.println("INMP441 Noise Sensor initialized");
        }
    }
    
    /*
    // GPS
    configureGpsUart(gpsUsePrimaryPins);
    Serial.println("GPS Module initialized");
    */
    
    // Set ADC attenuation for better resolution
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    
    Serial.println("All sensors initialized successfully");
}

// ==============================
// MAIN LOOP
// ==============================
void loop() {
    // Reset watchdog timer
    esp_task_wdt_reset();
    
    static unsigned long lastGpsLog = 0;
    static size_t lastGpsChars = 0;
    
    updateEmergencyButton();
    
    // Read all sensors
    readAllSensors();
    
    // Check conditions (updates environment flags and populates warning/critical lists)
    checkConditions();
    attemptEmergencyReset();
    
    // Handle alerts (LED updates based on environment flags)
    handleAlerts();
    
    // Display readings every 2 seconds
    if (millis() - lastDisplayTime > 2000) {
        displayReadings();
        lastDisplayTime = millis();
    }

    /*
    // GPS data presence check (logs every 5s if no bytes are seen)
    if (millis() - lastGpsLog > 5000) {
        size_t currentGpsChars = gps.charsProcessed();
        if (currentGpsChars == lastGpsChars) {
            Serial.print("GPS: no data received (current map RX->GPIO");
            Serial.print(gpsCurrentRxPin);
            Serial.print(", TX->GPIO");
            Serial.print(gpsCurrentTxPin);
            Serial.println(", baud=9600)");
            if (millis() - lastGpsReinitAttempt > GPS_REINIT_INTERVAL_MS) {
                gpsUsePrimaryPins = !gpsUsePrimaryPins;
                Serial.print("GPS: attempting UART reconfiguration (" );
                Serial.print(gpsUsePrimaryPins ? "primary" : "swapped");
                Serial.println(" mapping)...");
                configureGpsUart(gpsUsePrimaryPins);
            }
        } else if (!gps.location.isValid()) {
            Serial.println("GPS: receiving data but no fix yet (needs clear sky view)");
            lastGpsReinitAttempt = millis();
        } else {
            lastGpsReinitAttempt = millis();
        }
        lastGpsChars = currentGpsChars;
        lastGpsLog = millis();
    }
    */

    // ==============================
    // ADDITIONS FROM CODE B (WiFi & Cloud Communication)
    // ==============================
    // Maintain Wi-Fi connection
    checkWiFiConnection();

    // Poll backend for commands (e.g., remote emergency reset)
    if (millis() - lastCommandCheckAt >= COMMAND_POLL_INTERVAL_MS) {
        lastCommandCheckAt = millis();
        checkBackendCommand();
    }

    // Send emergency packet immediately when emergency is first triggered
    if (isEmergency && !emergencyPacketSent) {
        sendEmergencyPacket();
        emergencyPacketSent = true;
    }

    // Send normal data packet at fixed interval
    if (millis() - lastPacketSentAt >= PACKET_INTERVAL_MS) {
        lastPacketSentAt = millis();
        sendNormalPacket();
    }
    // ==============================
    
    delay(50);  // Main loop delay
}

// ==============================
// READ ALL SENSORS
// ==============================
void readAllSensors() {
    // MQ-2 Gas Sensor
    mq2Value = analogRead(MQ2_PIN);
    mq2Valid = (mq2Value >= 0 && mq2Value <= 4095);
    
    // DHT11 Ambient Temp/Humidity with retry + auto-reset
    float dhtTemp = NAN;
    float dhtHumidity = NAN;
    bool tempReadSuccess = false;
    bool humidityReadSuccess = false;
    for (uint8_t attempt = 0; attempt < DHT_READ_RETRIES; ++attempt) {
        float tempCandidate = dht.readTemperature();
        float humidityCandidate = dht.readHumidity();
        if (!isnan(tempCandidate)) {
            dhtTemp = tempCandidate;
            tempReadSuccess = true;
        }
        if (!isnan(humidityCandidate)) {
            dhtHumidity = humidityCandidate;
            humidityReadSuccess = true;
        }
        if (tempReadSuccess && humidityReadSuccess) {
            break;
        }
        delay(50);
    }

    if (tempReadSuccess) {
        ambientTemp = dhtTemp;
        ambientTempValid = true;
    } else {
        ambientTempValid = false;
    }

    if (humidityReadSuccess) {
        ambientHumidity = dhtHumidity;
        ambientHumidityValid = true;
    } else {
        ambientHumidityValid = false;
    }

    if (ambientTempValid || ambientHumidityValid) {
        if (dhtUsingFallback) {
            Serial.println("DHT11 recovered, resuming live ambient readings");
        }
        dhtUsingFallback = false;
        dhtFailureStreak = 0;
    } else {
        dhtFailureStreak++;
        if (dhtFailureStreak == 1 && !dhtUsingFallback) {
            Serial.println("Warning: DHT11 read failed, keeping last values");
        }
        if (dhtFailureStreak >= DHT_MAX_FAILURES_BEFORE_RESET && (millis() - lastDhtResetAttemptAt) > DHT_RESET_COOLDOWN_MS) {
            Serial.println("Warning: DHT11 failed repeatedly, reinitializing sensor...");
            dht.begin();
            lastDhtResetAttemptAt = millis();
        }
        if (!dhtUsingFallback && dhtFailureStreak >= DHT_MAX_FAILURES_BEFORE_RESET) {
            ambientTemp = DHT_FALLBACK_TEMP_C;
            ambientHumidity = DHT_FALLBACK_HUMIDITY;
            ambientTempValid = true;
            ambientHumidityValid = true;
            dhtUsingFallback = true;
            Serial.println("DHT11 offline, using fallback ambient data");
        }
    }
    
    // LM35 Body Temperature (10mV per °C)
    int lm35MilliVolts = analogReadMilliVolts(LM35_PIN);
    float bodyTempInstant = lm35MilliVolts / 10.0f;
    if (lm35MilliVolts > 0) {
        if (!bodyTempFilterInitialized || isnan(bodyTempFiltered)) {
            bodyTempFiltered = bodyTempInstant;
            bodyTempFilterInitialized = true;
        } else {
            bodyTempFiltered += BODY_TEMP_FILTER_ALPHA * (bodyTempInstant - bodyTempFiltered);
        }
        bodyTemp = bodyTempFiltered;
    } else {
        bodyTemp = bodyTempInstant;
        bodyTempFilterInitialized = false;
        bodyTempFiltered = bodyTempInstant;
    }
    bool ambientValid = ambientTempValid;
    bool tempInHumanRange = (bodyTemp >= 32.0f && bodyTemp <= 45.0f);
    bool hasContactDelta = (!ambientValid) ? true : ((bodyTemp - ambientTemp) >= BODY_TEMP_CONTACT_DELTA);
    bodyTempValid = (lm35MilliVolts > 0 && bodyTempFilterInitialized && tempInHumanRange && hasContactDelta);
    
    // UV Sensor
    int uvReading = analogRead(UV_PIN);
    uvIndex = map(uvReading, 0, 4095, 0, 15);  // Approximate UV index
    uvIndexValid = (uvReading >= 0 && uvReading <= 4095);
    
    // Noise Level
    noiseLevel = calculateNoiseRMS();
    
    // Heart Rate
    calculateHeartRate();
    
    /*
    // GPS
    readGpsStream();
    if (gps.location.isValid()) {
        latitude = gps.location.lat();
        longitude = gps.location.lng();
        location = String(latitude, 6) + "," + String(longitude, 6);
    } else {
        location = "Searching for fix...";
    }
    */

    // Hard-coded GPS location (temporarily bypassing GPS readings)
    latitude = DEFAULT_LATITUDE;
    longitude = DEFAULT_LONGITUDE;
    location = DEFAULT_LOCATION;
    
    // Validate all sensor readings
    sensorDataValid = validateSensorReadings();
    if (!sensorDataValid) {
        Serial.println("Sensor readings validation failed!");
    }
}

// ==============================
// GPS STREAM HANDLER
// ==============================
void readGpsStream() {
    /*
    unsigned long start = millis();
    while (gpsSerial.available() > 0 && (millis() - start) < GPS_READ_WINDOW_MS) {
        gps.encode(gpsSerial.read());
    }
    */
}

void configureGpsUart(bool usePrimaryPins) {
    /*
    int rxPin = usePrimaryPins ? GPS_RX : GPS_TX;
    int txPin = usePrimaryPins ? GPS_TX : GPS_RX;
    gpsSerial.end();
    delay(100);
    gpsSerial.begin(9600, SERIAL_8N1, rxPin, txPin);
    gpsUsePrimaryPins = usePrimaryPins;
    gpsCurrentRxPin = rxPin;
    gpsCurrentTxPin = txPin;
    lastGpsReinitAttempt = millis();
    Serial.print("GPS UART configured (");
    Serial.print(usePrimaryPins ? "primary" : "swapped");
    Serial.print(" mapping): RX->GPIO");
    Serial.print(rxPin);
    Serial.print(", TX->GPIO");
    Serial.print(txPin);
    Serial.println(")");
    */
}

// ==============================
// EMERGENCY BUTTON HANDLING
// ==============================
void updateEmergencyButton() {
    static bool lastReading = HIGH;
    static bool debouncedState = HIGH;
    static unsigned long lastDebounceTime = 0;
    bool reading = digitalRead(EMERGENCY_BTN);
    unsigned long now = millis();

    if (reading != lastReading) {
        lastDebounceTime = now;
        lastReading = reading;
    }

    if ((now - lastDebounceTime) > EMERGENCY_DEBOUNCE_MS) {
        if (reading != debouncedState) {
            debouncedState = reading;
            if (debouncedState == LOW) {
                emergencyReleaseCandidate = 0;
                if (!isEmergency) {
                    isEmergency = true;
                    emergencyLatchedAt = now;
                    emergencyPacketSent = false;   // Allow new emergency packet
                    Serial.println("EMERGENCY BUTTON PRESSED!");
                }
            } else if (isEmergency) {
                emergencyReleaseCandidate = now;
                Serial.println("Emergency button released, monitoring for safe reset...");
            }
        }
    }
}

void attemptEmergencyReset() {
    if (!isEmergency || emergencyReleaseCandidate == 0) {
        return;
    }
    if ((millis() - emergencyReleaseCandidate) >= EMERGENCY_CLEAR_DELAY_MS && environmentSafe) {
        isEmergency = false;
        emergencyReleaseCandidate = 0;
        emergencyPacketSent = false;   // Reset flag for next emergency
        Serial.println("Emergency state cleared after stable conditions");
    }
}

// ==============================
// CALCULATE NOISE RMS
// ==============================
float calculateNoiseRMS() {
    int32_t samples[256];
    size_t bytes_read = 0;
    float sum = 0.0f;
    static unsigned long lastI2sErrorLog = 0;
    const TickType_t readTimeout = pdMS_TO_TICKS(5);

    esp_err_t err = i2s_read(I2S_NUM_0, (void*)samples, sizeof(samples), &bytes_read, readTimeout);

    if (err == ESP_ERR_TIMEOUT) {
        noiseValid = false;
        if (millis() - lastI2sErrorLog > 2000) {
            Serial.println("Warning: I2S read timeout, keeping last noise value");
            lastI2sErrorLog = millis();
        }
        return noiseLevel;  // Keep last reading
    } else if (err != ESP_OK) {
        noiseValid = false;
        Serial.printf("I2S read error: %d\n", err);
        return noiseLevel;  // Keep last reading
    }
    
    size_t num_samples = bytes_read / sizeof(int32_t);
    if (num_samples == 0) {
        noiseValid = false;
        return noiseLevel;  // Keep last reading if no new samples
    }
    
    for (size_t i = 0; i < num_samples; i++) {
        float sample = static_cast<float>(samples[i] >> 14);  // Reduce to ~18-bit range
        sum += sample * sample;
    }

    noiseValid = true;
    return sqrtf(sum / num_samples);
}

// ==============================
// CALCULATE HEART RATE
// ==============================
void calculateHeartRate() {
    static const int RATE_SIZE = 4;
    static int rates[RATE_SIZE];
    static int rateSpot = 0;
    static long lastBeat = 0;
    static long irBaseline = 0;
    static bool irBaselineInitialized = false;

    particleSensor.check();  // Refresh FIFO with latest samples
    bool sampleProcessed = false;

    while (particleSensor.available()) {
        sampleProcessed = true;
        long irValue = particleSensor.getFIFOIR();

        if (!irBaselineInitialized || irBaseline == 0) {
            irBaseline = irValue;
            irBaselineInitialized = true;
        }

        bool fingerDetected = (irValue >= IR_FINGER_THRESHOLD) || (irValue > (irBaseline + IR_DYNAMIC_MARGIN));

        if (!fingerDetected) {
            heartRateValid = false;
            heartRate = 0;
            irBaseline += (long)((irValue - irBaseline) * IR_BASELINE_ALPHA);
            particleSensor.nextSample();
            continue;
        }

        heartRateValid = true;
        lastBeat = (lastBeat == 0) ? millis() : lastBeat;

        if (checkForBeat(irValue) == true) {
            long delta = millis() - lastBeat;
            if (delta > 0) {
                lastBeat = millis();
                int beatsPerMinute = 60 / (delta / 1000.0);
                if (beatsPerMinute < 255 && beatsPerMinute > 20) {
                    rates[rateSpot++] = beatsPerMinute;
                    rateSpot %= RATE_SIZE;
                    int beatAvg = 0;
                    for (int x = 0; x < RATE_SIZE; x++) {
                        beatAvg += rates[x];
                    }
                    beatAvg /= RATE_SIZE;
                    heartRate = beatAvg;
                }
            }
        }

        particleSensor.nextSample();
    }

    if (!sampleProcessed) {
        heartRateValid = false;
        heartRate = 0;
    }
}

// ==============================
// CHECK CONDITIONS (ENHANCED WITH SENSOR LISTS)
// ==============================
void checkConditions() {
    // Reset environment flags (original logic)
    environmentSafe = true;
    environmentWarning = false;
    environmentCritical = false;
    biometricReady = heartRateValid && bodyTempValid;

    // Reset sensor lists (new from Code B)
    warningCount = 0;
    criticalCount = 0;

    // Helper lambdas (preserve original flag logic, add list filling)
    auto markWarning = [&](const char* sensorName) {
        environmentSafe = false;
        environmentWarning = true;
        if (warningCount < MAX_SENSORS) {
            warningSensors[warningCount++] = sensorName;
        }
    };

    auto markCritical = [&](const char* sensorName) {
        environmentSafe = false;
        environmentCritical = true;
        environmentWarning = true;   // Critical implies warning as well
        if (criticalCount < MAX_SENSORS) {
            criticalSensors[criticalCount++] = sensorName;
        }
    };

    if (!sensorDataValid) {
        markWarning("sensor_fault");
    }

    // Check MQ-2 (Gas) – critical only if >300 ppm
    if (!mq2Valid) {
        markWarning("mq2_fault");
    } else if (mq2Value > MQ2_WARNING) {
        markCritical("gas_ppm");
    } else if (mq2Value >= MQ2_SAFE) {
        markWarning("gas_ppm");
    }

    // Check Ambient Temperature
    if (!ambientTempValid) {
        markWarning("ambient_temp_fault");
    } else {
        if (ambientTemp >= TEMP_WARNING || ambientTemp < 0) {
            markCritical("ambient_temp");
        } else if (ambientTemp >= TEMP_SAFE || ambientTemp < 10) {
            markWarning("ambient_temp");
        }
    }

    // Check Noise Level
    if (!noiseValid) {
        markWarning("noise_fault");
    } else if (noiseLevel >= NOISE_WARNING) {
        markCritical("noise_db");
    } else if (noiseLevel >= NOISE_SAFE) {
        markWarning("noise_db");
    }

    // Check Heart Rate
    if (heartRateValid) {
        if (heartRate < HR_MIN_WARNING || heartRate > HR_MAX_WARNING) {
            markCritical("heart_rate");
        } else if (heartRate < HR_MIN_SAFE || heartRate > HR_MAX_SAFE) {
            markWarning("heart_rate");
        }
    }

    // Check Body Temperature
    if (bodyTempValid) {
        if (bodyTemp >= BODY_TEMP_WARNING || bodyTemp <= BODY_TEMP_CRITICAL_LOW) {
            markCritical("body_temp");
        } else if (bodyTemp < BODY_TEMP_MIN_SAFE || bodyTemp > BODY_TEMP_MAX_SAFE) {
            markWarning("body_temp");
        }
    }

    // Check UV Exposure
    if (!uvIndexValid) {
        markWarning("uv_fault");
    } else if (uvIndex >= UV_WARNING) {
        markCritical("uv_index");
    } else if (uvIndex >= UV_SAFE) {
        markWarning("uv_index");
    }

    if (isEmergency) {
        markCritical("emergency_button");
    }

    allConditionsGood = environmentSafe && biometricReady && !isEmergency;
}

// ==============================
// HANDLE ALERTS (LED CONTROL)
// ==============================
void handleAlerts() {
    // Check for emergency button
    if (isEmergency) {
        setLEDColor(255, 0, 0);  // Red
        currentAlertLevel = ALERT_EMERGENCY;
        return;
    }

    if (environmentSafe && biometricReady) {
        setLEDColor(0, 255, 0);  // Green
        currentAlertLevel = ALERT_NORMAL;
        return;
    }

    if (environmentSafe && !biometricReady) {
        setLEDColor(255, 150, 0);  // Amber indicates missing biometrics
        currentAlertLevel = ALERT_WARNING;
        return;
    }

    if (environmentCritical) {
        setLEDColor(255, 0, 0);  // Red
        currentAlertLevel = ALERT_CRITICAL;
        return;
    }

    // Environment warning state
    setLEDColor(255, 150, 0);  // Amber
    currentAlertLevel = ALERT_WARNING;
}

// ==============================
// SET LED COLOR
// ==============================
void setLEDColor(int r, int g, int b) {
    ledcWrite(LED_R_CH, r);
    ledcWrite(LED_G_CH, g);
    ledcWrite(LED_B_CH, b);
}

// ==============================
// DISPLAY READINGS (with metric units)
// ==============================
void displayReadings() {
    Serial.println("\n         SENSOR READINGS");
    Serial.println("=========================================");
    
    // Gas Sensor (ppm)
    Serial.print("Gas (ppm): ");
    if (!mq2Valid) {
        Serial.println("-- (sensor fault)");
    } else {
        Serial.print(mq2Value);
        if (mq2Value < MQ2_SAFE) {
            Serial.println(" (SAFE)");
        } else if (mq2Value <= MQ2_WARNING) {   // 150–300 = warning
            Serial.println(" (WARNING)");
        } else {
            Serial.println(" (CRITICAL)");
        }
    }
    
    // Ambient Temperature & Humidity
    Serial.print("Ambient Temp: ");
    if (!ambientTempValid) {
        Serial.print("-- (sensor offline)");
    } else {
        Serial.print(ambientTemp);
        Serial.print("°C");
    }
    Serial.print(", Humidity: ");
    if (!ambientHumidityValid) {
        Serial.print("--");
    } else {
        Serial.print(ambientHumidity);
        Serial.print("%");
    }
    if (!ambientTempValid) {
        Serial.println(" (WARNING)");
    } else if (ambientTemp < TEMP_SAFE && ambientTemp >= 10) {
        Serial.println(" (NORMAL)");
    } else if (ambientTemp < TEMP_WARNING && ambientTemp >= 0) {
        Serial.println(" (WARNING)");
    } else {
        Serial.println(" (CRITICAL)");
    }
    
    // Body Temperature
    Serial.print("Body Temp: ");
    if (!bodyTempValid) {
        Serial.println("-- (no contact)");
    } else {
        Serial.print(bodyTemp);
        Serial.print("°C");
        if (bodyTemp >= BODY_TEMP_MIN_SAFE && bodyTemp <= BODY_TEMP_MAX_SAFE) {
            Serial.println(" (NORMAL)");
        } else if (bodyTemp > 30 && bodyTemp < 40) {
            Serial.println(" (WARNING)");
        } else {
            Serial.println(" (CRITICAL)");
        }
    }
    
    // Heart Rate
    Serial.print("Heart Rate: ");
    if (!heartRateValid) {
        Serial.println("-- (no finger)");
    } else {
        Serial.print(heartRate);
        Serial.print(" BPM");
        if (heartRate >= HR_MIN_SAFE && heartRate <= HR_MAX_SAFE) {
            Serial.println(" (NORMAL)");
        } else if (heartRate >= HR_MIN_WARNING && heartRate <= HR_MAX_WARNING) {
            Serial.println(" (WARNING)");
        } else {
            Serial.println(" (CRITICAL)");
        }
    }
    
    // Noise Level (dB)
    Serial.print("Noise (dB): ");
    if (!noiseValid || isnan(noiseLevel)) {
        Serial.println("-- (no data)");
    } else {
        Serial.print(noiseLevel);
        if (noiseLevel < NOISE_SAFE) {
            Serial.println(" (NORMAL)");
        } else if (noiseLevel < NOISE_WARNING) {
            Serial.println(" (WARNING)");
        } else {
            Serial.println(" (CRITICAL)");
        }
    }
    
    // UV Index
    Serial.print("UV Index: ");
    if (!uvIndexValid) {
        Serial.println("-- (sensor fault)");
    } else {
        Serial.print(uvIndex);
        if (uvIndex < UV_SAFE) {
            Serial.println(" (NORMAL)");
        } else if (uvIndex < UV_WARNING) {
            Serial.println(" (WARNING)");
        } else {
            Serial.println(" (CRITICAL)");
        }
    }
    
    // GPS Location
    Serial.print("GPS: ");
    Serial.println(location);
    
    // System Status
    Serial.println("-----------------------------------------");
    Serial.print("SYSTEM STATUS: ");
    switch (currentAlertLevel) {
        case ALERT_NORMAL:
            Serial.println("ALL CONDITIONS GOOD");
            break;
        case ALERT_WARNING:
            Serial.println("WARNING");
            break;
        case ALERT_CRITICAL:
            Serial.println("CRITICAL CONDITIONS");
            break;
        case ALERT_EMERGENCY:
            Serial.println("EMERGENCY MODE");
            break;
    }
    Serial.println("=========================================\n");
}

// ==============================
// CALIBRATE SENSORS
// ==============================
void calibrateSensors() {
    Serial.println("\nCalibrating sensors...");
    
    // Calibrate MQ-2 in clean air
    Serial.print("Calibrating MQ-2... ");
    int baselineSum = 0;
    for (int i = 0; i < 50; i++) {
        baselineSum += analogRead(MQ2_PIN);
        delay(20);
    }
    int baseline = baselineSum / 50;
    Serial.print("Baseline: ");
    Serial.println(baseline);
    
    // Initialize heart rate sensor
    Serial.print("Initializing MAX30102... ");
    particleSensor.shutDown();
    delay(100);
    particleSensor.wakeUp();
    Serial.println("Done");
    
    Serial.println("Calibration complete!");
}

// ==============================
// SETUP LED PWM CHANNELS
// ==============================
void setupLEDs() {
    // Configure LEDC channels once to avoid ledc_get_duty errors on writes
    ledcSetup(LED_R_CH, LED_PWM_FREQ, LED_PWM_RES);
    ledcSetup(LED_G_CH, LED_PWM_FREQ, LED_PWM_RES);
    ledcSetup(LED_B_CH, LED_PWM_FREQ, LED_PWM_RES);

    ledcAttachPin(LED_R, LED_R_CH);
    ledcAttachPin(LED_G, LED_G_CH);
    ledcAttachPin(LED_B, LED_B_CH);

    setLEDColor(0, 0, 0);  // Start with LEDs off
}

// ==============================
// SENSOR VALIDATION
// ==============================
bool validateSensorReadings() {
    bool allValid = true;
    
    if (!ambientTempValid || ambientTemp < -40 || ambientTemp > 85) {
        Serial.println("Warning: Invalid ambient temperature reading");
        allValid = false;
    }
    
    if (!ambientHumidityValid || ambientHumidity < 0 || ambientHumidity > 100) {
        Serial.println("Warning: Invalid humidity reading");
        allValid = false;
    }
    
    if (!mq2Valid || mq2Value < 0 || mq2Value > 4095) {
        Serial.println("Warning: Invalid MQ-2 reading");
        allValid = false;
    }
    
    if (bodyTempValid && (bodyTemp < 25 || bodyTemp > 45)) {
        Serial.println("Warning: Invalid body temperature reading");
        allValid = false;
    }
    
    if (!uvIndexValid || uvIndex < 0 || uvIndex > 15) {
        Serial.println("Warning: Invalid UV index reading");
        allValid = false;
    }

    if (!noiseValid || isnan(noiseLevel)) {
        Serial.println("Warning: Invalid noise level reading");
        allValid = false;
    }

    return allValid;
}

// ==============================
// GPS RESET FUNCTION
// ==============================
void resetGpsModule() {
    /*
    Serial.println("GPS: Software reset attempted");
    configureGpsUart(gpsUsePrimaryPins);
    */
}

// ==============================
// NEW FUNCTIONS FROM CODE B
// ==============================

// Convert current alert level to string for backend
String getHelmetStatusString() {
    switch (currentAlertLevel) {
        case ALERT_NORMAL:    return "SAFE";
        case ALERT_WARNING:   return "WARNING";
        case ALERT_CRITICAL:  return "CRITICAL";
        case ALERT_EMERGENCY: return "EMERGENCY";
        default:              return "UNKNOWN";
    }
}

String getIsoTimestamp() {
    time_t now = time(nullptr);
    if (now > 0) {
        struct tm timeinfo;
        gmtime_r(&now, &timeinfo);
        char buffer[25];
        strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
        return String(buffer);
    }
    char fallback[32];
    snprintf(fallback, sizeof(fallback), "Uptime-%lu", millis());
    return String(fallback);
}

bool ensureBackendReachable() {
    unsigned long now = millis();
    if (!backendReachable && now < backendProbeSuppressedUntil) {
        return false;
    }

    WiFiClient probeClient;
    if (probeClient.connect(BACKEND_HOST, BACKEND_PORT, BACKEND_PROBE_TIMEOUT_MS)) {
        probeClient.stop();
        backendReachable = true;
        backendProbeSuppressedUntil = now;
        return true;
    }

    probeClient.stop();
    backendReachable = false;
    backendProbeSuppressedUntil = now + BACKEND_PROBE_COOLDOWN_MS;
    Serial.println("Backend unreachable (connection refused). Backing off before next attempt.");
    return false;
}

// Connect to Wi‑Fi (non‑blocking first call, then periodic reconnect handled in checkWiFiConnection)
void connectWiFi() {
    Serial.println("Connecting to Wi‑Fi (non-blocking)...");
    WiFi.disconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    wifiConnected = false;
    lastWifiReconnectAttempt = millis();
}

// Periodically check Wi‑Fi and reconnect if needed
void checkWiFiConnection() {
    if (WiFi.status() == WL_CONNECTED) {
        if (!wifiConnected) {
            wifiConnected = true;
            Serial.println("Wi‑Fi CONNECTED");
            Serial.print("IP address: ");
            Serial.println(WiFi.localIP());
        }
        return;
    }

    if (wifiConnected) {
        Serial.println("Wi‑Fi connection lost");
    }
    wifiConnected = false;
    if (millis() - lastWifiReconnectAttempt >= WIFI_RECONNECT_INTERVAL_MS) {
        Serial.println("Wi‑Fi disconnected, attempting reconnection...");
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASS);
        lastWifiReconnectAttempt = millis();
    }
}

// Generic HTTP POST for JSON documents
void postJSON(const char* url, JsonDocument &doc) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("Wi‑Fi not connected, cannot send data");
        return;
    }
    if (!ensureBackendReachable()) {
        Serial.println("Skipping HTTP POST (backend unreachable)");
        return;
    }
    esp_task_wdt_reset();
    HTTPClient http;
    http.begin(url);
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");
    String payload;
    serializeJson(doc, payload);
    esp_task_wdt_reset();
    int httpCode = http.POST(payload);
    esp_task_wdt_reset();
    if (httpCode > 0) {
        Serial.printf("HTTP POST to %s returned %d\n", url, httpCode);
        backendReachable = true;
        backendProbeSuppressedUntil = millis();
    } else {
        Serial.printf("HTTP POST failed, error: %s\n", http.errorToString(httpCode).c_str());
        backendReachable = false;
        backendProbeSuppressedUntil = millis() + BACKEND_PROBE_COOLDOWN_MS;
    }
    http.end();
}

// Send emergency packet (minimal data)
void sendEmergencyPacket() {
    DynamicJsonDocument doc(256);
    doc["helmetId"] = HELMET_ID;
    doc["timestamp"] = getIsoTimestamp();
    JsonObject st = doc["status"].to<JsonObject>();
    st["overall"] = "EMERGENCY";
    Serial.println("[HTTP] Queuing emergency packet");
    postJSON(EMERGENCY_API_URL, doc);
}

// ==============================
// UPDATED: Send normal data packet with the required JSON structure
// ==============================
void sendNormalPacket() {
    Serial.println("[HTTP] Queuing normal packet");
    // Use a document with sufficient capacity (e.g., 2048 bytes)
    StaticJsonDocument<2048> doc;
    doc["helmetId"] = HELMET_ID;
    doc["timestamp"] = getIsoTimestamp();

    JsonObject sensors = doc["sensors"].to<JsonObject>();
    sensors["gas_ppm"]       = mq2Valid ? mq2Value : -1;
    sensors["ambient_temp"]  = ambientTempValid ? ambientTemp : -1;
    sensors["body_temp"]     = bodyTempValid ? bodyTemp : -1;
    sensors["heart_rate"]    = heartRateValid ? heartRate : -1;
    sensors["uv_index"]      = uvIndexValid ? uvIndex : -1;          // integer as per current mapping
    sensors["noise_db"]      = (noiseValid && !isnan(noiseLevel)) ? noiseLevel : -1;

    // GPS nested object – no separate latitude/longitude fields
    JsonObject gpsObj = sensors["gps"].to<JsonObject>();
    if (!isnan(latitude) && !isnan(longitude)) {
        gpsObj["lat"] = latitude;
        gpsObj["lng"] = longitude;
    } else {
        gpsObj["lat"] = -1;
        gpsObj["lng"] = -1;
    }

    JsonObject status = doc["status"].to<JsonObject>();
    status["overall"] = getHelmetStatusString();

    // Add warning and critical sensor lists if any
    if (warningCount > 0) {
        JsonArray warnArr = status["warning_sensors"].to<JsonArray>();
        for (int i = 0; i < warningCount; i++) {
            warnArr.add(warningSensors[i]);
        }
    }
    if (criticalCount > 0) {
        JsonArray critArr = status["critical_sensors"].to<JsonArray>();
        for (int i = 0; i < criticalCount; i++) {
            critArr.add(criticalSensors[i]);
        }
    }

    postJSON(NORMAL_API_URL, doc);
}

// ==============================
// UPDATED: Poll backend for commands – now checks for "command": "RESET_EMERGENCY"
// ==============================
void checkBackendCommand() {
    if (WiFi.status() != WL_CONNECTED) return;
    if (!ensureBackendReachable()) return;

    esp_task_wdt_reset();
    HTTPClient http;
    String commandUrl = String(COMMAND_API_BASE) + HELMET_ID;
    http.begin(commandUrl);
    http.setTimeout(HTTP_TIMEOUT_MS);
    int httpCode = http.GET();
    esp_task_wdt_reset();

    if (httpCode == 200) {
        String response = http.getString();
        StaticJsonDocument<256> doc;
        DeserializationError error = deserializeJson(doc, response);
        if (!error) {
            // Backend returns { "command": "RESET_EMERGENCY" } or { "command": null }
            const char* cmd = doc["command"];
            if (cmd && strcmp(cmd, "RESET_EMERGENCY") == 0 && isEmergency) {
                // Remote reset received – clear emergency state
                isEmergency = false;
                emergencyPacketSent = false;
                emergencyReleaseCandidate = 0;  // Also clear auto‑clear mechanism
                Serial.println("Emergency reset by backend command");
            }
        }
        backendReachable = true;
        backendProbeSuppressedUntil = millis();
    } else {
        backendReachable = false;
        backendProbeSuppressedUntil = millis() + BACKEND_PROBE_COOLDOWN_MS;
    }
    http.end();
}