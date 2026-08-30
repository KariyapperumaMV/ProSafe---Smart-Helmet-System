const sensorRanges = require("../config/sensorRanges");

describe("classifyAmbientTemperature", () => {
  test.each([
    [26.9, "SAFE"],
    [27.0, "WARNING"],
    [35.0, "WARNING"],
    [35.1, "CRITICAL"],
  ])("%s -> %s", (value, expected) => {
    expect(sensorRanges.classifyAmbientTemperature(value)).toBe(expected);
  });
});

describe("classifyGas", () => {
  test.each([
    [149, "SAFE"],
    [150, "WARNING"],
    [300, "WARNING"],
    [301, "CRITICAL"],
  ])("%s -> %s", (value, expected) => {
    expect(sensorRanges.classifyGas(value)).toBe(expected);
  });
});

describe("classifyNoise", () => {
  test.each([
    [79, "SAFE"],
    [80, "WARNING"],
    [84.9, "WARNING"],
    [85, "CRITICAL"],
    [95, "CRITICAL"],
  ])("%s -> %s", (value, expected) => {
    expect(sensorRanges.classifyNoise(value)).toBe(expected);
  });
});

describe("classifyUv", () => {
  test.each([
    [2.9, "SAFE"],
    [3, "WARNING"],
    [8, "WARNING"],
    [8.1, "CRITICAL"],
  ])("%s -> %s", (value, expected) => {
    expect(sensorRanges.classifyUv(value)).toBe(expected);
  });
});

describe("classify (dispatch + missing-value handling)", () => {
  test("dispatches to the right classifier by sensor key", () => {
    expect(sensorRanges.classify("noise", 90)).toBe("CRITICAL");
    expect(sensorRanges.classify("gas", 100)).toBe("SAFE");
    expect(sensorRanges.classify("uv", 5)).toBe("WARNING");
    expect(sensorRanges.classify("ambientTemperature", 20)).toBe("SAFE");
  });

  test.each([null, undefined, NaN, "83", Infinity])("returns null for non-finite/invalid value %p", (value) => {
    expect(sensorRanges.classify("noise", value)).toBeNull();
  });

  test("returns null for an unknown sensor key", () => {
    expect(sensorRanges.classify("notASensor", 50)).toBeNull();
  });
});

describe("getRangeMetadata", () => {
  test("returns label/unit/standard/displayRanges for each environmental sensor", () => {
    for (const key of ["noise", "gas", "uv", "ambientTemperature"]) {
      const meta = sensorRanges.getRangeMetadata(key);
      expect(meta).toMatchObject({
        label: expect.any(String),
        unit: expect.any(String),
        standard: expect.any(String),
        displayRanges: {
          safe: { label: expect.any(String) },
          warning: { label: expect.any(String) },
          critical: { label: expect.any(String) },
        },
      });
    }
  });

  test("noise range labels match the OSHA PEL source table wording", () => {
    const meta = sensorRanges.getRangeMetadata("noise");
    expect(meta.standard).toBe("OSHA PEL");
    expect(meta.displayRanges.critical.label).toBe("≥ 85 dB");
  });
});
