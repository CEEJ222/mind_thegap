import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";

// Parse markdown-ish resume content into docx paragraphs
function markdownToDocxParagraphs(content: string): Paragraph[] {
  const lines = content.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: "" }));
      continue;
    }

    // H1: # Header
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.replace(/^#\s+/, ""),
              bold: true,
              size: 28,
              font: "Calibri",
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        })
      );
      continue;
    }

    // H2: ## Header
    if (trimmed.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.replace(/^##\s+/, ""),
              bold: true,
              size: 22,
              font: "Calibri",
              color: "1C1C1E",
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 1,
              color: "CCCCCC",
            },
          },
        })
      );
      continue;
    }

    // H3: ### Header
    if (trimmed.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.replace(/^###\s+/, ""),
              bold: true,
              size: 20,
              font: "Calibri",
            }),
          ],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 120, after: 40 },
        })
      );
      continue;
    }

    // Bullet points: - item or * item or • item
    if (/^[-*•]\s/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[-*•]\s+/, "");
      // Handle **bold** within bullets
      const runs = parseBoldText(bulletText);
      paragraphs.push(
        new Paragraph({
          children: runs,
          bullet: { level: 0 },
          spacing: { after: 40 },
        })
      );
      continue;
    }

    // Regular text — handle **bold**
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

// Parse **bold** markers into TextRun arrays
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
        });
      }
      return new TextRun({
        text: part,
        size: 20,
        font: "Calibri",
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

    // Try getting resume content from the database first (most reliable)
    let markdownContent = "";

    const { data: resumeRecord } = await supabase
      .from("generated_resumes")
      .select("editorial_notes")
      .eq("file_path", file_path)
      .single();

    if (resumeRecord?.editorial_notes?.resume_content) {
      markdownContent = resumeRecord.editorial_notes.resume_content;
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
                  top: 720, // 0.5 inch
                  bottom: 720,
                  left: 1080, // 0.75 inch
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

    // PDF fallback: return markdown as text for now
    // Full PDF generation would need puppeteer or similar
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
