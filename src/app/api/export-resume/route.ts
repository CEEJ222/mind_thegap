import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuthedUser } from "@/lib/api-auth";
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
      // Strip any ** markers and render as single blue bold line
      const cleanText = trimmed.replace(/\*\*/g, "");
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cleanText,
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
    const auth = await requireAuthedUser(request);
    if (auth instanceof NextResponse) return auth;
    const userId = auth.userId;

    const body = await request.json();
    const file_path = body.file_path as string;
    const format = (body.format as string) || "docx";
    const file_name = (body.file_name as string) || "resume";

    if (!file_path) {
      return NextResponse.json({ error: "Missing file_path" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Ownership check — fetch the resume row scoped to the authed user so a
    // caller can't download another user's resume by passing their file_path.
    let markdownContent = "";

    const { data: resumeRecords } = await supabase
      .from("generated_resumes")
      .select("editorial_notes, user_id")
      .eq("file_path", file_path)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    const resumeRecord = resumeRecords?.[0];
    if (!resumeRecord) {
      // Either the file_path doesn't exist or it belongs to another user.
      // Same response either way to avoid leaking existence.
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    // editorial_notes may come back as a string or object
    let notes = resumeRecord.editorial_notes;
    if (typeof notes === "string") {
      try { notes = JSON.parse(notes); } catch { notes = null; }
    }

    if (notes?.resume_content) {
      markdownContent = notes.resume_content;
    } else {
      // Fallback: download the markdown from storage.
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
      const uint8 = new Uint8Array(buffer);

      return new NextResponse(uint8, {
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
