import { DISCLAIMER } from "@/constants/options";
import {
  Profile,
  Reading,
  ReportExportPart,
  ReportExportPlan,
  ReportHistoryItem,
  ReportRange,
  ReportRangeType,
} from "@/types/domain";
import { formatGlucose, readingRangeLabel } from "@/utils/glucose";

const MAX_PDF_ROWS_PER_FILE = 120;
const PDF_ROWS_PER_PAGE = 18;

type ResolvedRange = {
  rangeType: ReportRangeType;
  rangeDays: ReportRange | 1;
  startDate: Date;
  endDate: Date;
  rangeLabel: string;
};

export type ReportModel = {
  title: string;
  rangeType: ReportRangeType;
  rangeDays: ReportRange | 1;
  rangeLabel: string;
  startDate: string;
  endDate: string;
  profile: Profile;
  readings: Reading[];
  readingCount: number;
  inRangeCount: number;
  averageMgdl: number | null;
  averageLabel: string;
  highestLabel: string;
  lowestLabel: string;
  fastingTrendLabel: string;
  afterMealTrendLabel: string;
  missedReadingDays: number;
  summaryBullets: string[];
};

export type ReportExportJob = ReportExportPart & {
  report: ReportModel;
};

export type PlannedReportExport = ReportExportPlan & {
  jobs: ReportExportJob[];
};

export function daysAgo(now: Date, days: number): Date {
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date): Date {
  const end = startOfLocalDay(date);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}

function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSameLocalDay(value: string, date: Date): boolean {
  const source = new Date(value);
  return startOfLocalDay(source).getTime() === startOfLocalDay(date).getTime();
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDateOnly(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatIsoDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trendLabel(readings: Reading[], profile: Profile): string {
  if (readings.length < 2) {
    return "Not enough readings yet";
  }
  const sorted = [...readings].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  const midpoint = Math.floor(sorted.length / 2);
  const first = average(sorted.slice(0, midpoint).map((reading) => reading.glucoseMgdl));
  const second = average(sorted.slice(midpoint).map((reading) => reading.glucoseMgdl));
  if (first === null || second === null) {
    return "Not enough readings yet";
  }
  const difference = second - first;
  if (Math.abs(difference) < 5) {
    return "About the same";
  }
  return difference > 0
    ? `Trending higher by about ${formatGlucose(Math.abs(difference), profile.unit)}`
    : `Trending lower by about ${formatGlucose(Math.abs(difference), profile.unit)}`;
}

function resolveRange(range: ReportRange | 1 | ReportRangeType, now: Date): ResolvedRange {
  if (range === "day") {
    const startDate = startOfLocalDay(now);
    const endDate = endOfLocalDay(now);
    return {
      rangeType: "day",
      rangeDays: 1,
      startDate,
      endDate,
      rangeLabel: `Day report for ${formatDateOnly(now)}`,
    };
  }

  if (range === "week") {
    const startDate = daysAgo(now, 7);
    const endDate = endOfLocalDay(now);
    return {
      rangeType: "week",
      rangeDays: 7,
      startDate,
      endDate,
      rangeLabel: `Week report, ${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`,
    };
  }

  if (range === "month") {
    const startDate = startOfLocalMonth(now);
    const endDate = endOfLocalMonth(now);
    return {
      rangeType: "month",
      rangeDays: 30,
      startDate,
      endDate,
      rangeLabel: `Month report, ${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`,
    };
  }

  const startDate = daysAgo(now, range);
  const endDate = endOfLocalDay(now);
  const rangeType: ReportRangeType = range === 1 ? "day" : range === 30 ? "month" : "week";
  return {
    rangeType,
    rangeDays: range,
    startDate,
    endDate,
    rangeLabel: `${range}-day report ending ${formatDateOnly(now)}`,
  };
}

function countCalendarDays(startDate: Date, endDate: Date): number {
  let count = 0;
  for (let cursor = startOfLocalDay(startDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
    count += 1;
  }
  return count;
}

function buildReportForResolvedRange(
  allReadings: Reading[],
  profile: Profile,
  resolvedRange: ResolvedRange
): ReportModel {
  const readings = allReadings
    .filter((reading) => {
      const recordedAt = new Date(reading.recordedAt);
      return recordedAt >= resolvedRange.startDate && recordedAt <= resolvedRange.endDate;
    })
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  const glucoseValues = readings.map((reading) => reading.glucoseMgdl);
  const averageMgdl = average(glucoseValues);
  const highest = glucoseValues.length ? Math.max(...glucoseValues) : null;
  const lowest = glucoseValues.length ? Math.min(...glucoseValues) : null;
  const inRangeCount = readings.filter(
    (reading) => reading.glucoseMgdl >= profile.targetLow && reading.glucoseMgdl <= profile.targetHigh
  ).length;
  const fasting = readings.filter((reading) => reading.timing === "fasting");
  const afterMeal = readings.filter((reading) => reading.timing === "after_meal");
  const taggedMeals = readings.filter((reading) => reading.mealLabel || reading.carbsGrams !== null).length;
  const daysWithReadings = new Set(readings.map((reading) => formatIsoDate(reading.recordedAt))).size;
  const missedReadingDays = Math.max(0, countCalendarDays(resolvedRange.startDate, resolvedRange.endDate) - daysWithReadings);

  const summaryBullets = [
    `${readings.length} readings logged in this range.`,
    `${inRangeCount} readings were within the target range set in the profile.`,
    `Fasting trend: ${trendLabel(fasting, profile)}.`,
    `After-meal trend: ${trendLabel(afterMeal, profile)}.`,
    `${taggedMeals} readings include meal or carbohydrate context.`,
    `${missedReadingDays} days in this range have no readings logged.`,
  ];

  return {
    title: "DayRange by WZXU Glucose Report",
    rangeType: resolvedRange.rangeType,
    rangeDays: resolvedRange.rangeDays,
    rangeLabel: resolvedRange.rangeLabel,
    startDate: resolvedRange.startDate.toISOString(),
    endDate: resolvedRange.endDate.toISOString(),
    profile,
    readings,
    readingCount: readings.length,
    inRangeCount,
    averageMgdl,
    averageLabel: averageMgdl === null ? "--" : formatGlucose(averageMgdl, profile.unit),
    highestLabel: highest === null ? "--" : formatGlucose(highest, profile.unit),
    lowestLabel: lowest === null ? "--" : formatGlucose(lowest, profile.unit),
    fastingTrendLabel: trendLabel(fasting, profile),
    afterMealTrendLabel: trendLabel(afterMeal, profile),
    missedReadingDays,
    summaryBullets,
  };
}

export function buildReportModel(
  allReadings: Reading[],
  profile: Profile,
  range: ReportRange | 1 | ReportRangeType,
  now: Date
): ReportModel {
  return buildReportForResolvedRange(allReadings, profile, resolveRange(range, now));
}

export function buildReportModelForDateRange(
  allReadings: Reading[],
  profile: Profile,
  rangeType: ReportRangeType,
  startDate: Date,
  endDate: Date
): ReportModel {
  return buildReportForResolvedRange(allReadings, profile, {
    rangeType,
    rangeDays: rangeType === "day" ? 1 : rangeType === "week" ? 7 : 30,
    startDate: startOfLocalDay(startDate),
    endDate: endOfLocalDay(endDate),
    rangeLabel: `${capitalize(rangeType)} report, ${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`,
  });
}

export function createReportCsv(report: ReportModel): string {
  const rows = [
    [
      "recorded_at",
      "glucose_mgdl",
      "display_value",
      "display_unit",
      "timing",
      "range_label",
      "meal",
      "carbs_grams",
      "medication",
      "activity",
      "tags",
      "symptoms",
      "mood",
      "notes",
    ],
    ...report.readings.map((reading) => [
      reading.recordedAt,
      String(Math.round(reading.glucoseMgdl)),
      String(reading.displayValue),
      reading.displayUnit,
      reading.timing,
      readingRangeLabel(reading.glucoseMgdl, report.profile.targetLow, report.profile.targetHigh),
      reading.mealLabel,
      reading.carbsGrams === null ? "" : String(reading.carbsGrams),
      reading.medicationNote,
      reading.activityNote,
      reading.tags.join("|"),
      reading.symptoms.join("|"),
      reading.mood ?? "",
      reading.notes,
    ]),
  ];
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function createReportHtml(report: ReportModel): string {
  const readingRows = report.readings
    .map((reading) => {
      const context = [
        reading.mealLabel ? `Meal: ${escapeHtml(reading.mealLabel)}` : "",
        reading.carbsGrams === null ? "" : `Carbs: ${reading.carbsGrams}g`,
        reading.medicationNote ? `Medication: ${escapeHtml(reading.medicationNote)}` : "",
        reading.activityNote ? `Activity: ${escapeHtml(reading.activityNote)}` : "",
      ]
        .filter(Boolean)
        .join("<br />");
      return `
        <tr>
          <td>${formatDateTime(reading.recordedAt)}</td>
          <td>${formatGlucose(reading.glucoseMgdl, report.profile.unit)}</td>
          <td>${reading.timing.replace("_", " ")}</td>
          <td>${escapeHtml(readingRangeLabel(reading.glucoseMgdl, report.profile.targetLow, report.profile.targetHigh))}</td>
          <td>${context || "-"}</td>
          <td>${escapeHtml(reading.tags.join(", ") || "-")}</td>
          <td>${escapeHtml(reading.symptoms.join(", ") || "-")}</td>
          <td>${escapeHtml(reading.mood ?? "-")}</td>
          <td>${escapeHtml(reading.notes || "-")}</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { color: #172420; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 28px; }
        h1 { font-size: 26px; margin-bottom: 4px; }
        h2 { font-size: 17px; margin-top: 26px; }
        .muted { color: #5A6E67; }
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
        .metric { border: 1px solid #DCE7E2; border-radius: 10px; padding: 12px; }
        .label { color: #5A6E67; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
        .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th, td { border-bottom: 1px solid #DCE7E2; font-size: 10px; padding: 7px; text-align: left; vertical-align: top; }
        th { background: #EEF5F2; }
        .notice { background: #E6EEF9; border-radius: 10px; padding: 12px; margin-top: 22px; }
      </style>
    </head>
    <body>
      <h1>${report.title}</h1>
      <p class="muted">${report.rangeLabel}</p>
      <p class="muted">Target range shown is the user/care-team setting in DayRange.</p>
      <div class="metrics">
        <div class="metric"><div class="label">Average</div><div class="value">${report.averageLabel}</div></div>
        <div class="metric"><div class="label">Highest</div><div class="value">${report.highestLabel}</div></div>
        <div class="metric"><div class="label">Lowest</div><div class="value">${report.lowestLabel}</div></div>
        <div class="metric"><div class="label">In range</div><div class="value">${report.inRangeCount}/${report.readingCount}</div></div>
      </div>
      <h2>Summary</h2>
      <ul>${report.summaryBullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
      <h2>Detailed Reading Log</h2>
      <table>
        <thead>
          <tr>
            <th>Time</th><th>Glucose</th><th>Timing</th><th>Range</th><th>Context</th>
            <th>Tags</th><th>Symptoms</th><th>Mood</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>${readingRows || "<tr><td colspan='9'>No readings in this date range.</td></tr>"}</tbody>
      </table>
      <div class="notice">${DISCLAIMER}</div>
    </body>
  </html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function estimatePdfPages(readingCount: number): number {
  return Math.max(1, 1 + Math.ceil(readingCount / PDF_ROWS_PER_PAGE));
}

export function reportFileName(report: ReportModel, extension: "pdf" | "csv", partIndex?: number): string {
  const start = formatIsoDate(report.startDate);
  const end = formatIsoDate(report.endDate);
  const rangeSegment = report.rangeType === "day" ? start : `${start}-to-${end}`;
  const partSegment = partIndex === undefined ? "" : `-part-${partIndex}`;
  return `dayrange-${report.rangeType}-${rangeSegment}${partSegment}.${extension}`;
}

export function planReportExport(report: ReportModel, extension: "pdf" | "csv"): PlannedReportExport {
  const shouldSplit = extension === "pdf" && report.readingCount > MAX_PDF_ROWS_PER_FILE;
  const jobs = shouldSplit ? splitReportJobs(report, extension) : [createJob(report, extension, 1, 1)];

  return {
    rangeType: report.rangeType,
    startDate: report.startDate,
    endDate: report.endDate,
    estimatedPages: estimatePdfPages(report.readingCount),
    shouldSplit,
    parts: jobs.map(({ report: _report, ...part }) => part),
    jobs,
  };
}

function splitReportJobs(report: ReportModel, extension: "pdf" | "csv"): ReportExportJob[] {
  if (report.rangeType === "month") {
    return splitByDays(report, extension, 7);
  }
  if (report.rangeType === "week") {
    return splitByDays(report, extension, 1);
  }
  return splitByRowCount(report, extension, MAX_PDF_ROWS_PER_FILE);
}

function splitByDays(report: ReportModel, extension: "pdf" | "csv", daysPerPart: number): ReportExportJob[] {
  const start = startOfLocalDay(new Date(report.startDate));
  const end = endOfLocalDay(new Date(report.endDate));
  const partReports: ReportModel[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, daysPerPart)) {
    const partStart = new Date(cursor);
    const partEnd = endOfLocalDay(addDays(cursor, daysPerPart - 1));
    const cappedEnd = partEnd > end ? end : partEnd;
    const partReport = buildReportModelForDateRange(report.readings, report.profile, report.rangeType, partStart, cappedEnd);
    if (partReport.readingCount > 0) {
      partReports.push(partReport);
    }
  }
  return partReports.length
    ? partReports.map((partReport, index) => createJob(partReport, extension, index + 1, partReports.length))
    : [createJob(report, extension, 1, 1)];
}

function splitByRowCount(report: ReportModel, extension: "pdf" | "csv", rowsPerPart: number): ReportExportJob[] {
  const partReports: ReportModel[] = [];
  for (let index = 0; index < report.readings.length; index += rowsPerPart) {
    const readings = report.readings.slice(index, index + rowsPerPart);
    partReports.push({ ...report, readings, readingCount: readings.length });
  }
  return partReports.map((partReport, index) => createJob(partReport, extension, index + 1, partReports.length));
}

function createJob(
  report: ReportModel,
  extension: "pdf" | "csv",
  partIndex: number,
  partCount: number
): ReportExportJob {
  return {
    report,
    fileName: reportFileName(report, extension, partCount > 1 ? partIndex : undefined),
    rangeType: report.rangeType,
    startDate: report.startDate,
    endDate: report.endDate,
    readingCount: report.readingCount,
    partIndex,
    partCount,
  };
}

export function createReportHistoryItems(
  parts: ReportExportPart[],
  platform: "native" | "web",
  generatedAt = new Date().toISOString()
): ReportHistoryItem[] {
  return parts.map((part) => ({
    id: `report-${generatedAt}-${part.partIndex}-${part.fileName}`.replaceAll(/[^a-zA-Z0-9._-]/g, "-"),
    fileName: part.fileName,
    rangeType: part.rangeType,
    startDate: part.startDate,
    endDate: part.endDate,
    generatedAt,
    readingCount: part.readingCount,
    partIndex: part.partIndex,
    partCount: part.partCount,
    platform,
  }));
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
