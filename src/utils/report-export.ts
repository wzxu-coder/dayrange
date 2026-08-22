import { DISCLAIMER } from "@/constants/options";
import { ReportExportPart } from "@/types/domain";
import { formatGlucose, readingRangeLabel } from "@/utils/glucose";
import { createReportCsv, formatDateTime, PlannedReportExport } from "@/utils/reports";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 40;
const TOP = 760;
const BOTTOM = 40;

type PdfLine = {
  text: string;
  x: number;
  y: number;
  size: number;
};

export async function exportReportPdf(plan: PlannedReportExport): Promise<ReportExportPart[]> {
  for (const job of plan.jobs) {
    const bytes = createPdfBytes(job.report);
    const pdfData = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(pdfData).set(bytes);
    downloadBlob(new Blob([pdfData], { type: "application/pdf" }), job.fileName);
  }
  return plan.parts;
}

export async function exportReportCsv(plan: PlannedReportExport): Promise<ReportExportPart[]> {
  for (const job of plan.jobs) {
    downloadBlob(new Blob([createReportCsv(job.report)], { type: "text/csv;charset=utf-8" }), job.fileName);
  }
  return plan.parts;
}

function downloadBlob(blob: Blob, fileName: string) {
  if (typeof document === "undefined") {
    throw new Error("Downloads are only available in a browser.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function createPdfBytes(report: PlannedReportExport["jobs"][number]["report"]): Uint8Array {
  const pages = buildPdfPages(report);
  const fontObjectNumber = 3 + pages.length * 2;
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`
  );

  pages.forEach((lines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const stream = lines
      .map((line) => `BT /F1 ${line.size} Tf ${line.x} ${line.y} Td ${pdfText(line.text)} Tj ET`)
      .join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(body);
}

function buildPdfPages(report: PlannedReportExport["jobs"][number]["report"]): PdfLine[][] {
  const pages: PdfLine[][] = [[]];
  let y = TOP;

  const addLine = (text: string, size = 10, x = LEFT, leading = 14) => {
    if (y < BOTTOM) {
      pages.push([]);
      y = TOP;
    }
    pages[pages.length - 1].push({ text, x, y, size });
    y -= leading;
  };

  const addWrapped = (text: string, size = 10, x = LEFT, maxChars = 92) => {
    wrapText(text, maxChars).forEach((line) => addLine(line, size, x));
  };

  addLine(report.title, 18, LEFT, 24);
  addWrapped(report.rangeLabel, 11);
  addWrapped("Target range shown is the user/care-team setting in DayRange by WZXU.", 10, LEFT, 78);
  y -= 6;
  addLine(`Average: ${report.averageLabel}`, 11);
  addLine(`Highest: ${report.highestLabel}`, 11);
  addLine(`Lowest: ${report.lowestLabel}`, 11);
  addLine(`In range: ${report.inRangeCount}/${report.readingCount}`, 11);
  y -= 6;
  addLine("Summary", 14, LEFT, 20);
  report.summaryBullets.forEach((bullet) => addWrapped(`- ${bullet}`, 10, LEFT + 10, 78));
  y -= 8;
  addLine("Detailed Reading Log", 14, LEFT, 20);

  if (!report.readings.length) {
    addLine("No readings in this date range.", 10);
  }

  report.readings.forEach((reading, index) => {
    const primary = [
      `${index + 1}. ${formatDateTime(reading.recordedAt)}`,
      formatGlucose(reading.glucoseMgdl, report.profile.unit),
      reading.timing.replace("_", " "),
      readingRangeLabel(reading.glucoseMgdl, report.profile.targetLow, report.profile.targetHigh),
    ].join(" | ");
    const context = [
      reading.mealLabel ? `Meal: ${reading.mealLabel}` : "",
      reading.carbsGrams === null ? "" : `Carbs: ${reading.carbsGrams}g`,
      reading.medicationNote ? `Medication: ${reading.medicationNote}` : "",
      reading.activityNote ? `Activity: ${reading.activityNote}` : "",
      reading.tags.length ? `Tags: ${reading.tags.join(", ")}` : "",
      reading.symptoms.length ? `Symptoms: ${reading.symptoms.join(", ")}` : "",
      reading.mood ? `Mood: ${reading.mood}` : "",
      reading.notes ? `Notes: ${reading.notes}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    addWrapped(primary, 10, LEFT, 78);
    if (context) {
      addWrapped(context, 9, LEFT + 12, 78);
    }
    y -= 4;
  });

  y -= 8;
  addWrapped(DISCLAIMER, 9, LEFT, 78);

  return pages;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    if (`${current} ${word}`.length > maxChars) {
      lines.push(current);
      current = word;
      return;
    }
    current = `${current} ${word}`;
  });

  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

function pdfText(value: string): string {
  // The built-in Helvetica font uses PDF's single-byte encoding. Escape the
  // literal string instead of writing UTF-16 bytes that Helvetica cannot read.
  const ascii = value.replaceAll(/[^ -~]/g, "?");
  return `(${ascii.replaceAll(/([\\()])/g, "\\$1")})`;
}
