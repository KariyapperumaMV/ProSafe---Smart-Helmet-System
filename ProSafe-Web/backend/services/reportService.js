const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const analyticsService = require("./analyticsService");
const periodService = require("./analyticsPeriodService");
const { timezone, siteName } = require("../config/appConfig");
const sensorRanges = require("../config/sensorRanges");

const LOGO_PATH = path.join(__dirname, "..", "assets", "prosafe-logo.png");

const PAGE_MARGIN = 50;
const COLORS = { text: "#1a1a1a", muted: "#6b7280", brand: "#16a34a", border: "#d1d5db", headerBg: "#f0fdf4", danger: "#dc2626", warning: "#d97706" };

// ---------- formatting helpers ----------

// "No data" is a distinct, honest state from 0 — never conflate them (#40).
function fmt(value, suffix = "") {
  return value === null || value === undefined ? "No data" : `${value}${suffix}`;
}

function periodTypeLabel(periodType) {
  return { daily: "Daily", weekly: "Weekly", monthly: "Monthly" }[periodType] || periodType;
}

function humanPeriodRange(analytics) {
  const { period } = analytics;
  if (period.type === "weekly") return `${period.weekStart} to ${period.weekEnd}`;
  if (period.type === "monthly") return period.label;
  return period.date;
}

function buildFilename(analytics) {
  const { period } = analytics;
  if (period.type === "daily") return `ProSafe-Daily-Safety-Report-${period.date}.pdf`;
  if (period.type === "weekly") return `ProSafe-Weekly-Safety-Report-${period.weekStart}_to_${period.weekEnd}.pdf`;
  return `ProSafe-Monthly-Safety-Report-${period.label}.pdf`;
}

function generatedAtLabel() {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
  return `${formatted} (${timezone})`;
}

function comparisonLabel(percent) {
  if (percent === null || percent === undefined) return "New this period (no prior data)";
  if (percent === 0) return "No change vs previous period";
  const direction = percent > 0 ? "more" : "fewer";
  return `${Math.abs(percent)}% ${direction} than previous period`;
}

// ---------- low-level drawing helpers ----------

function ensureSpace(doc, neededHeight) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

// Every drawing helper below explicitly resets doc.x to the left margin
// first — drawTable's cell rendering uses explicit x/y coordinates for each
// column, which otherwise leaves doc.x wherever the last cell happened to
// be, narrowing (and visually shifting) whatever text is drawn next.
function sectionTitle(doc, text) {
  ensureSpace(doc, 40);
  doc.moveDown(0.8);
  doc.x = doc.page.margins.left;
  doc.fontSize(14).fillColor(COLORS.brand).font("Helvetica-Bold").text(text, doc.x, doc.y, { width: contentWidth(doc) });
  doc.x = doc.page.margins.left;
  doc.moveTo(doc.x, doc.y + 2).lineTo(doc.page.width - doc.page.margins.right, doc.y + 2).strokeColor(COLORS.border).stroke();
  doc.moveDown(0.5);
  doc.fillColor(COLORS.text).font("Helvetica");
}

function paragraph(doc, text, opts = {}) {
  doc.x = doc.page.margins.left;
  doc.fontSize(opts.size || 10).fillColor(opts.color || COLORS.text).font(opts.bold ? "Helvetica-Bold" : "Helvetica").text(text, doc.x, doc.y, { width: contentWidth(doc) });
}

// Simple, self-contained table renderer: draws a header row and data rows,
// re-drawing the header whenever a page break is needed (#28 — "repeat
// table headers across pages if practical"). Deliberately minimal — no
// nested tables, no cell wrapping beyond PDFKit's own text wrap.
function drawTable(doc, { columns, rows, emptyMessage = "No data recorded for this period." }) {
  const left = doc.page.margins.left;
  const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidths = columns.map((c) => Math.floor(totalWidth * c.widthPct));
  const rowHeight = 20;

  function drawHeader() {
    const y = doc.y;
    doc.rect(left, y, totalWidth, rowHeight).fill(COLORS.headerBg);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9);
    let x = left;
    columns.forEach((c, i) => {
      doc.text(c.label, x + 4, y + 5, { width: colWidths[i] - 8, align: c.align || "left" });
      x += colWidths[i];
    });
    doc.y = y + rowHeight;
    doc.font("Helvetica").fontSize(9);
  }

  ensureSpace(doc, rowHeight * 2);
  drawHeader();

  if (!rows.length) {
    doc.fillColor(COLORS.muted).font("Helvetica-Oblique").text(emptyMessage, left, doc.y + 4);
    doc.font("Helvetica").fillColor(COLORS.text);
    doc.moveDown(1);
    return;
  }

  rows.forEach((row, idx) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (idx % 2 === 1) doc.rect(left, y, totalWidth, rowHeight).fill("#fafafa");
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(9);
    let x = left;
    row.forEach((cell, i) => {
      doc.text(String(cell), x + 4, y + 5, { width: colWidths[i] - 8, align: columns[i].align || "left" });
      x += colWidths[i];
    });
    doc.y = y + rowHeight;
  });

  doc.moveDown(1);
}

// One deliberately simple bar chart (Warning/Critical/Emergency counts) —
// per the approved v1 scope, no attempt to reproduce the web page's
// interactive line/trend charts in PDFKit.
function drawDistributionBarChart(doc, distribution) {
  const chartHeight = 110;
  ensureSpace(doc, chartHeight + 30);

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const baseline = doc.y + chartHeight;
  const bars = [
    { label: "Warning", value: distribution.warning, color: COLORS.warning },
    { label: "Critical", value: distribution.critical, color: COLORS.danger },
    { label: "Emergency", value: distribution.emergency, color: "#991b1b" },
  ];
  const maxValue = Math.max(1, ...bars.map((b) => b.value));
  const barWidth = 60;
  const gap = (width - bars.length * barWidth) / (bars.length + 1);

  let x = left + gap;
  for (const bar of bars) {
    const barHeight = Math.round((bar.value / maxValue) * (chartHeight - 30));
    doc.rect(x, baseline - barHeight, barWidth, barHeight).fill(bar.color);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11).text(String(bar.value), x, baseline - barHeight - 16, { width: barWidth, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text(bar.label, x, baseline + 4, { width: barWidth, align: "center" });
    x += barWidth + gap;
  }
  doc.moveTo(left, baseline).lineTo(left + width, baseline).strokeColor(COLORS.border).stroke();
  doc.y = baseline + 20;
  doc.fillColor(COLORS.text);
}

// ---------- section builders ----------

function drawCoverHeader(doc, analytics) {
  const top = doc.page.margins.top;
  const left = doc.page.margins.left;
  const logoWidth = 60;
  const logoHeight = logoWidth * (1024 / 1536); // preserve the source PNG's aspect ratio

  let logoBottom = top;
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, left, top, { width: logoWidth });
    logoBottom = top + logoHeight;
  }
  doc.fontSize(20).font("Helvetica-Bold").fillColor(COLORS.brand).text("ProSafe", left + logoWidth + 15, top + 2, { lineBreak: false });
  doc.fontSize(10).font("Helvetica").fillColor(COLORS.muted).text("Smart Helmet Safety System", left + logoWidth + 15, top + 27, { lineBreak: false });

  doc.x = left;
  doc.y = Math.max(logoBottom, top + 27 + 14) + 15;
  doc.fontSize(16).font("Helvetica-Bold").fillColor(COLORS.text).text(`${periodTypeLabel(analytics.period.type)} Safety Report`);
  doc.fontSize(10).font("Helvetica").fillColor(COLORS.muted);
  doc.text(`Site: ${siteName}`);
  doc.text(`Reporting period: ${humanPeriodRange(analytics)}`);
  doc.text(`Generated: ${generatedAtLabel()}`);
  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(COLORS.brand).lineWidth(2).stroke();
  doc.lineWidth(1);
  doc.moveDown(1);
}

function drawExecutiveSummary(doc, analytics) {
  sectionTitle(doc, "Executive Summary");
  const { summary, comparison } = analytics;

  drawTable(doc, {
    columns: [
      { label: "Metric", widthPct: 0.4 },
      { label: "This Period", widthPct: 0.3, align: "right" },
      { label: "vs Previous Period", widthPct: 0.3, align: "right" },
    ],
    rows: [
      ["Workers with activity", fmt(summary.workersWithActivity), comparisonLabel(comparison.workersWithActivity)],
      ["Total safety alerts", fmt(summary.totalAlerts), comparisonLabel(comparison.totalAlerts)],
      ["Warning alerts", fmt(summary.warningAlerts), comparisonLabel(comparison.warningAlerts)],
      ["Critical alerts", fmt(summary.criticalAlerts), comparisonLabel(comparison.criticalAlerts)],
      ["Emergency events", fmt(summary.emergencyAlerts), comparisonLabel(comparison.emergencyAlerts)],
      ["Avg. acknowledgement time", fmt(summary.avgAcknowledgementMinutes, " min"), "—"],
      ["Helmet reporting rate", fmt(summary.helmetReportingRate, "%"), "—"],
    ],
  });

  paragraph(doc, "Comparisons describe the change in volume only and are not a judgement of whether safety improved — fewer recorded alerts can also reflect lower helmet reporting.", { size: 8, color: COLORS.muted });
}

function drawSafetyEventSummary(doc, analytics) {
  sectionTitle(doc, "Safety Event Summary");
  drawDistributionBarChart(doc, analytics.alertDistribution);
  drawTable(doc, {
    columns: [{ label: "Event Type", widthPct: 0.5 }, { label: "Count", widthPct: 0.5, align: "right" }],
    rows: [
      ["Warning", analytics.alertDistribution.warning],
      ["Critical", analytics.alertDistribution.critical],
      ["Emergency", analytics.alertDistribution.emergency],
    ],
  });
}

function drawWorkersRequiringAttention(doc, analytics) {
  sectionTitle(doc, "Workers Requiring Attention");
  drawTable(doc, {
    columns: [
      { label: "Worker", widthPct: 0.34 },
      { label: "Warning", widthPct: 0.16, align: "right" },
      { label: "Critical", widthPct: 0.16, align: "right" },
      { label: "Emergency", widthPct: 0.17, align: "right" },
      { label: "Total", widthPct: 0.17, align: "right" },
    ],
    rows: analytics.workersRequiringAttention
      .slice(0, 10)
      .map((w) => [w.workerName, w.warning, w.critical, w.emergency, w.totalAlerts]),
  });
}

function drawEnvironmentalConditions(doc, analytics) {
  sectionTitle(doc, "Environmental Conditions");
  const rows = Object.entries(analytics.environment.summary).map(([key, s]) => {
    const meta = sensorRanges.getRangeMetadata(key);
    return [
      meta ? `${meta.label} (${meta.unit})` : key,
      fmt(s.avg), fmt(s.min), fmt(s.max),
      fmt(s.warningReadings), fmt(s.criticalReadings), fmt(s.totalReadings),
    ];
  });
  drawTable(doc, {
    columns: [
      { label: "Sensor", widthPct: 0.28 },
      { label: "Avg", widthPct: 0.12, align: "right" },
      { label: "Min", widthPct: 0.12, align: "right" },
      { label: "Max", widthPct: 0.12, align: "right" },
      { label: "Warning", widthPct: 0.12, align: "right" },
      { label: "Critical", widthPct: 0.12, align: "right" },
      { label: "Readings", widthPct: 0.12, align: "right" },
    ],
    rows,
  });
}

function drawHealthDeviations(doc, analytics) {
  sectionTitle(doc, "Worker Health Deviations");
  const { heartRate, bodyTemperature } = analytics.health;
  drawTable(doc, {
    columns: [
      { label: "Metric", widthPct: 0.34 },
      { label: "Avg Abs Dev.", widthPct: 0.2, align: "right" },
      { label: "Max Abs Dev.", widthPct: 0.2, align: "right" },
      { label: "Significant Events", widthPct: 0.26, align: "right" },
    ],
    rows: [
      ["Heart Rate", fmt(heartRate.avgAbsDeviationPct, "%"), fmt(heartRate.maxAbsDeviationPct, `% (${heartRate.maxDeviationDirection || "-"} baseline)`), fmt(heartRate.significantEvents)],
      [
        "Body Temperature",
        fmt(bodyTemperature.avgAbsDeviationPct, "%"),
        fmt(bodyTemperature.maxAbsDeviationPct, `% (${bodyTemperature.maxDeviationDirection || "-"} baseline)`),
        bodyTemperature.thresholdConfigured ? fmt(bodyTemperature.significantEvents) : "Not configured",
      ],
    ],
  });
}

function drawExposureAnalysis(doc, analytics) {
  sectionTitle(doc, "Exposure Analysis");
  paragraph(doc, "Longest continuous abnormal exposure streak recorded per worker (not a cumulative total across separate streaks).", { size: 8, color: COLORS.muted });
  doc.moveDown(0.3);

  const noiseRows = analytics.exposure.noise.topWorkers.slice(0, 5).map((w) => [w.workerName, `${w.longestStreakSeconds}s`]);
  const hrRows = analytics.exposure.heartRate.topWorkers.slice(0, 5).map((w) => [w.workerName, `${w.longestStreakSeconds}s`]);

  doc.x = doc.page.margins.left;
  doc.font("Helvetica-Bold").fontSize(10).text("Longest Noise Exposure Streak", doc.x, doc.y, { width: contentWidth(doc) });
  doc.font("Helvetica");
  drawTable(doc, { columns: [{ label: "Worker", widthPct: 0.7 }, { label: "Streak", widthPct: 0.3, align: "right" }], rows: noiseRows });

  doc.x = doc.page.margins.left;
  doc.font("Helvetica-Bold").fontSize(10).text("Longest Heart Rate Deviation Streak", doc.x, doc.y, { width: contentWidth(doc) });
  doc.font("Helvetica");
  drawTable(doc, { columns: [{ label: "Worker", widthPct: 0.7 }, { label: "Streak", widthPct: 0.3, align: "right" }], rows: hrRows });
}

function drawHelmetReliability(doc, analytics) {
  sectionTitle(doc, "Helmet Reporting / Reliability");
  const r = analytics.helmetReliability;
  drawTable(doc, {
    columns: [{ label: "Metric", widthPct: 0.6 }, { label: "Value", widthPct: 0.4, align: "right" }],
    rows: [
      ["Registered active helmets", r.registeredActiveHelmets],
      ["Reported data during period", r.reportingDuringPeriod],
      ["No data during period", r.noDataDuringPeriod.length],
      ["Currently online (as of report generation)", r.currentlyOnline],
      ["Currently offline (as of report generation)", r.currentlyOffline],
    ],
  });
  if (r.noDataDuringPeriod.length) {
    paragraph(doc, `Helmets with no data this period: ${r.noDataDuringPeriod.join(", ")}`, { size: 9 });
    doc.moveDown(0.5);
  }
}

function drawAlertResponse(doc, analytics) {
  sectionTitle(doc, "Alert Response");
  const a = analytics.alertResponse;
  drawTable(doc, {
    columns: [{ label: "Metric", widthPct: 0.6 }, { label: "Value", widthPct: 0.4, align: "right" }],
    rows: [
      ["Total alerts", a.total],
      ["Acknowledged", a.acknowledged],
      ["Unacknowledged", a.unacknowledged],
      ["Acknowledgement rate", fmt(a.acknowledgementRate, "%")],
      ["Avg. acknowledgement time", fmt(a.avgAcknowledgementMinutes, " min")],
      ["Median acknowledgement time", fmt(a.medianAcknowledgementMinutes, " min")],
      ["Resolved emergencies", a.resolvedEmergencies],
      ["Unresolved emergencies", a.unresolvedEmergencies],
      ["Avg. resolution time", a.resolutionSamples ? `${fmt(a.avgResolutionMinutes, " min")} (based on ${a.resolutionSamples} emergenc${a.resolutionSamples === 1 ? "y" : "ies"})` : "No data"],
    ],
  });
}

function drawHighRiskTimes(doc, analytics) {
  sectionTitle(doc, "High-Risk Times");
  drawTable(doc, {
    columns: [
      { label: "Time Window", widthPct: 0.3 },
      { label: "Total Alerts", widthPct: 0.2, align: "right" },
      { label: "Warning", widthPct: 0.17, align: "right" },
      { label: "Critical", widthPct: 0.17, align: "right" },
      { label: "Emergency", widthPct: 0.16, align: "right" },
    ],
    rows: analytics.highRiskTimes.map((h) => [h.label, h.totalAlerts, h.warning, h.critical, h.emergency]),
  });
}

function drawKeyInsights(doc, analytics) {
  sectionTitle(doc, "Key Insights");
  if (!analytics.insights.length) {
    paragraph(doc, "No notable patterns were identified for this period.", { color: COLORS.muted });
    return;
  }
  for (const insight of analytics.insights) {
    ensureSpace(doc, 20);
    doc.x = doc.page.margins.left;
    doc.fontSize(10).fillColor(COLORS.text).font("Helvetica").text(`•  ${insight}`, doc.x, doc.y, { width: contentWidth(doc) });
    doc.moveDown(0.3);
  }
}

function drawFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - doc.page.margins.bottom + 15;
    doc.fontSize(8).fillColor(COLORS.muted).font("Helvetica").text(`Page ${i + 1} of ${range.count}`, doc.page.margins.left, bottom, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: "center",
    });
  }
}

// ---------- entry point ----------

// Uses the exact same analyticsService.getAnalytics(...) result the web
// Analytics page renders — page and PDF can never disagree (#23/#30).
async function generateReportPdf(periodType, dateStr) {
  const analytics = await analyticsService.getAnalytics(periodType, dateStr);

  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  drawCoverHeader(doc, analytics);
  drawExecutiveSummary(doc, analytics);
  drawSafetyEventSummary(doc, analytics);
  drawWorkersRequiringAttention(doc, analytics);
  drawEnvironmentalConditions(doc, analytics);
  drawHealthDeviations(doc, analytics);
  drawExposureAnalysis(doc, analytics);
  drawHelmetReliability(doc, analytics);
  drawAlertResponse(doc, analytics);
  drawHighRiskTimes(doc, analytics);
  drawKeyInsights(doc, analytics);
  drawFooters(doc);

  doc.end();
  const buffer = await done;
  return { buffer, filename: buildFilename(analytics), analytics };
}

module.exports = { generateReportPdf, buildFilename };
