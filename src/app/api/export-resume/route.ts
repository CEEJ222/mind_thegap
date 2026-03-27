import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
} from "docx";

const BLUE = "1F4E79";
const BLACK = "1C1C1E";
const GRAY = "666666";

function markdownToDocxParagraphs(content: string): Paragraph[] {
  const lines = content.split("\n");
  const paragraphs: Paragraph[] = [];
  let isFirstLine = true;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines but add small spacing
    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 40 } }));
      continue;
    }

    // First line = contact header (Name | email | phone | etc.)
    if (isFirstLine) {
      isFirstLine = false;
      // Check if it looks like a contact header (contains | separators)
      if (trimmed.includes("|")) {
        const parts = trimmed.split("|").map((p) => p.trim());
        const name = parts[0] || "";
        const rest = parts.slice(1).join("  |  ");

        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: name,
                bold: true,
                size: 28,
                font: "Calibri",
                color: BLACK,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
          })
        );
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: rest,
                size: 18,
                font: "Calibri",
                color: GRAY,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
          })
        );
        // Add a thin line separator
        paragraphs.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            },
            spacing: { after: 120 },
          })
        );
        continue;
      }
      // If not a contact header, treat as H1
    }

    // H1: # Header — Section titles (SUMMARY, EXPERIENCE, SKILLS)
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.replace(/^#\s+/, ""),
              bold: true,
              size: 24,
              font: "Calibri",
              color: BLUE,
            }),
          ],
          spacing: { before: 240, after: 80 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: BLUE },
          },
        })
      );
      continue;
    }

    // H2: ## Header — Section titles (alternative)
    if (trimmed.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.replace(/^##\s+/, ""),
              bold: true,
              size: 24,
              font: "Calibri",
              color: BLUE,
            }),
          ],
          spacing: { before: 240, after: 80 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: BLUE },
          },
        })
      );
      continue;
    }

    // H3: ### Header — Job titles (Company | Role | Dates)
    if (trimmed.startsWith("### ")) {
      const text = trimmed.replace(/^###\s+/, "");
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: true,
              size: 20,
              font: "Calibri",
              color: BLUE,
            }),
          ],
          spacing: { before: 160, after: 40 },
        })
      );
      continue;
    }

    // H4: #### Header
    if (trimmed.startsWith("#### ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.replace(/^####\s+/, ""),
              bold: true,
              size: 20,
              font: "Calibri",
              color: BLACK,
            }),
          ],
          spacing: { before: 120, after: 40 },
        })
      );
      continue;
    }

    // Bullet points
    if (/^[-*•]\s/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[-*•]\s+/, "");
      const runs = parseBoldText(bulletText);
      paragraphs.push(
        new Paragraph({
          children: runs,
          bullet: { level: 0 },
          spacing: { after: 30 },
        })
      );
      continue;
    }

    // Lines that look like job titles: "Role | Company | Dates" or "**Role** | Company"
    if (trimmed.includes("|") && !trimmed.startsWith("#")) {
      const runs = parseBoldText(trimmed);
      paragraphs.push(
        new Paragraph({
          children: runs.map((r) => {
            // Make the whole line bold and blue if it looks like a job header
            if (!trimmed.startsWith("*")) {
              return new TextRun({
                text: r.text || "",
                bold: true,
                size: 20,
                font: "Calibri",
                color: BLUE,
              });
            }
            return r;
          }),
          spacing: { before: 160, after: 40 },
        })
      );
      continue;
    }

    // Regular text
    const runs = parseBoldText(trimmed);
    paragraphs.push(
      new Paragraph({
        children: runs,
        spacing: { after: 40 },
      })
    );
  }

  return paragraphs;
}

function parseBoldText(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((p) => p)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return new TextRun({
          text: part.slice(2, -2),
          bold: true,
          size: 20,
          font: "Calibri",
          color: BLACK,
        });
      }
      return new TextRun({
        text: part,
        size: 20,
        font: "Calibri",
        color: BLACK,
      });
    });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const file_path = body.file_path as string;
    const format = (body.format as string) || "docx";
    const file_name = (body.file_name as string) || "resume";

    if (!file_path) {
      return NextResponse.json({ error: "Missing file_path" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Try getting resume content from the database first
    let markdownContent = "";

    const { data: resumeRecords } = await supabase
      .from("generated_resumes")
      .select("editorial_notes")
      .eq("file_path", file_path)
      .order("created_at", { ascending: false })
      .limit(1);

    const resumeRecord = resumeRecords?.[0];

    // editorial_notes may come back as a string or object
    let notes = resumeRecord?.editorial_notes;
    if (typeof notes === "string") {
      try { notes = JSON.parse(notes); } catch { notes = null; }
    }

    if (notes?.resume_content) {
      markdownContent = notes.resume_content;
    } else {
      // Fallback: try downloading from storage
      const { data: fileData, error } = await supabase.storage
        .from("resumes")
        .download(file_path);

      if (error || !fileData) {
        console.error("Storage download error:", error, "file_path:", file_path);
        return NextResponse.json({ error: "Resume content not found" }, { status: 500 });
      }
      markdownContent = await fileData.text();
    }

    if (format === "docx") {
      const paragraphs = markdownToDocxParagraphs(markdownContent);

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 720,
                  bottom: 720,
                  left: 1080,
                  right: 1080,
                },
              },
            },
            children: paragraphs,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${file_name}.docx"`,
        },
      });
    }

    return new NextResponse(markdownContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="${file_name}.md"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
