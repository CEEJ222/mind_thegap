import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type EvidenceChunkRow = Pick<
  Database["public"]["Tables"]["profile_chunks"]["Row"],
  | "id"
  | "chunk_text"
  | "company_name"
  | "job_title"
  | "entry_type"
  | "date_start"
  | "date_end"
>;

export type ThemeForEvidence = {
  theme_name: string;
  theme_weight?: number;
  score_tier?: string;
  explanation?: string | null;
  evidence_chunk_ids?: string[] | null;
};

/**
 * Loads `profile_chunks` for each theme's `evidence_chunk_ids` (in rank order)
 * and formats a prompt block for resume generation.
 */
export async function formatThemeEvidenceForPrompt(
  supabase: SupabaseClient,
  userId: string,
  themes: ThemeForEvidence[]
): Promise<string> {
  const allIds = Array.from(
    new Set(themes.flatMap((t) => t.evidence_chunk_ids ?? []))
  );
  if (allIds.length === 0) return "";

  const { data: chunks, error } = await supabase
    .from("profile_chunks")
    .select(
      "id, chunk_text, company_name, job_title, entry_type, date_start, date_end"
    )
    .eq("user_id", userId)
    .in("id", allIds);

  if (error) {
    console.error("[formatThemeEvidenceForPrompt] fetch failed:", error);
    return "";
  }

  const byId = new Map(
    (chunks ?? []).map((c) => [c.id, c as EvidenceChunkRow])
  );

  const blocks = themes
    .map((t) => {
      const ids = t.evidence_chunk_ids ?? [];
      const ordered = ids
        .map((id) => byId.get(id))
        .filter((c): c is EvidenceChunkRow => c != null);
      if (ordered.length === 0) return null;
      const lines = ordered.map(
        (c) =>
          `[${c.entry_type} | ${c.company_name ?? "Unknown"} | ${c.job_title ?? "Unknown"} | ${c.date_start ?? "?"} – ${c.date_end ?? "Present"}]\n${c.chunk_text}`
      );
      return `### ${t.theme_name} (weight: ${t.theme_weight ?? "—"}, ${t.score_tier ?? "—"})\n${lines.join("\n\n")}`;
    })
    .filter(Boolean);

  if (blocks.length === 0) return "";

  return `## Theme-ranked evidence (vector similarity to each JD theme — prioritize when aligning with the JD)

${blocks.join("\n\n")}`;
}
