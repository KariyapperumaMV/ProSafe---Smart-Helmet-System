/**
 * Components shown on the 3D helmet (V4 thesis Table 2.1, Section 2.3 and
 * Figure 2.4).
 *
 * Coordinates are in the model's own space: +Y is up, +Z is the front of the
 * helmet and +X is the wearer's left. Positions follow the four prototype
 * views in Figure 2.4 approximately; they are not measured. The ESP32 is not
 * visible in any photograph, so its placement inside the crown is
 * illustrative only.
 */

export const helmetModelNote =
  'Conceptual 3D reconstruction based on the prototype photographs (thesis Figure 2.4) and component list (Table 2.1). Component positions are approximate; the ESP32 is not visible in the photographs, so its position is illustrative.';

export const helmetComponents = [
  {
    id: 'esp32',
    n: 1,
    name: 'ESP32 Controller',
    part: 'ESP32',
    group: 'Core',
    position: [0, 0.5, -0.15],
    normal: [0, -1, 0],
    measures: 'Main microcontroller with built-in Wi-Fi, ADC, I2C and I2S interfaces.',
    role: 'Reads every sensor, creates one timestamped observation per second, buffers up to 120 samples and uploads them about every five seconds. It never calculates risk itself.',
    approximate: true,
  },
  {
    id: 'dht11',
    n: 2,
    name: 'Temperature Sensor',
    part: 'DHT11',
    group: 'Environmental',
    position: [-0.97, 0.2, -0.38],
    normal: [-1, 0.1, -0.15],
    measures: 'Ambient air temperature around the worker. Humidity is read but not transmitted.',
    role: 'Feeds heat-exposure features such as rolling averages and time spent above reference levels. Laboratory MAE: 0.35 °C.',
  },
  {
    id: 'guva',
    n: 3,
    name: 'UV Sensor',
    part: 'GUVA-S12SD',
    group: 'Environmental',
    position: [0, 0.83, -0.42],
    normal: [0, 1, -0.35],
    measures: 'An approximate UV index converted from an analogue output; an estimate, not a validated measurement.',
    role: 'Tracks sustained solar UV exposure, an easily underestimated risk for outdoor workers.',
  },
  {
    id: 'mq2',
    n: 4,
    name: 'Gas Sensor',
    part: 'MQ-2',
    group: 'Environmental',
    position: [0.98, 0.2, 0.22],
    normal: [1, 0.1, 0.15],
    measures: 'A relative combustible-gas and smoke response in sensor units, not verified ppm concentrations.',
    role: 'Gas readings are compared with the session baseline (a ratio), so changes in exposure are tracked without claiming concentrations.',
  },
  {
    id: 'inmp441',
    n: 5,
    name: 'Sound Sensor',
    part: 'INMP441',
    group: 'Environmental',
    position: [-0.98, 0.2, 0.3],
    normal: [-1, 0.1, 0.2],
    measures: 'An approximate, unweighted and uncalibrated sound level from a MEMS microphone.',
    role: 'Used for noise trends and an approximate daily noise dose based on the NIOSH criterion.',
  },
  {
    id: 'lm35',
    n: 6,
    name: 'Skin Temperature Sensor',
    part: 'LM35',
    group: 'Physiological',
    position: [0.66, -0.02, 0.05],
    normal: [-1, -0.4, 0],
    measures: 'Skin-surface temperature through contact with the wearer. It does not measure core body temperature.',
    role: 'Read as a deviation from the worker’s own skin-temperature baseline. Laboratory MAE: 0.15 °C.',
  },
  {
    id: 'max30102',
    n: 7,
    name: 'Heart Rate Sensor',
    part: 'MAX30102',
    group: 'Physiological',
    position: [-0.66, -0.02, 0.1],
    normal: [1, -0.4, 0],
    measures: 'Heart rate from an optical sensor that needs skin contact; reported as missing when contact is lost.',
    role: 'Interpreted relative to a worker-specific heart-rate baseline as part of the safety assessment. Laboratory MAE: 3.5 bpm.',
  },
  {
    id: 'led',
    n: 8,
    name: 'Status LED',
    part: 'RGB LED',
    group: 'Feedback',
    position: [0, 0.62, 0.97],
    normal: [0, 0.45, 1],
    measures: 'Shows the status sent by the backend: green SAFE, amber WARNING, red CRITICAL, blue UNCERTAIN.',
    role: 'Gives the worker immediate feedback. It shows blue after 30 s without a valid command, so a lost connection is never shown as green.',
  },
  {
    id: 'button',
    n: 9,
    name: 'Emergency Button',
    part: 'Push button',
    group: 'Feedback',
    position: [0.98, 0.18, -0.42],
    normal: [1, 0.1, -0.2],
    measures: 'Manual emergency activation, debounced for 50 ms.',
    role: 'Sends an EMERGENCY message independently of the ML model. Only an administrator reset, acknowledged by the helmet, ends it.',
  },
];

/** Present on the prototype but not part of the final data path. */
export const inactiveComponents = [
  {
    id: 'gps',
    name: 'GPS module (inactive)',
    note: 'A Neo-6M GPS module from an earlier design is still mounted on top. GPS reading is disabled in the final firmware and no location is transmitted.',
    position: [0, 0.86, 0.32],
  },
];
