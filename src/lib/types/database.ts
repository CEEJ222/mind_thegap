export type EntryType = "job" | "project" | "education" | "award" | "certification";
export type EntrySource = "resume_upload" | "url_scrape" | "manual_entry" | "gap_fill";
export type OutputFormat = "docx" | "pdf";
export type ResumeLength = "1_page" | "1_5_pages" | "2_pages" | "no_max";
export type ThemeMode = "light" | "dark";
export type InterviewStatus = "pending" | "yes" | "no";
export type ScoreTier = "strong" | "weak" | "none";
export type DocumentType = "resume" | "project_writeup" | "biz_case" | "award" | "certification" | "performance_review" | "other";
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
        };
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          output_format: OutputFormat;
          include_summary: boolean;
          resume_length: ResumeLength;
          theme: ThemeMode;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          output_format?: OutputFormat;
          include_summary?: boolean;
          resume_length?: ResumeLength;
          theme?: ThemeMode;
        };
        Update: {
          output_format?: OutputFormat;
          include_summary?: boolean;
          resume_length?: ResumeLength;
          theme?: ThemeMode;
        };
      };
      profile_entries: {
        Row: {
          id: string;
          user_id: string;
          entry_type: EntryType;
          company_name: string | null;
          job_title: string | null;
          description: string | null;
          date_start: string | null;
          date_end: string | null;
          industry: string | null;
          domain: string | null;
          source: EntrySource;
          user_confirmed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          entry_type: EntryType;
          company_name?: string | null;
          job_title?: string | null;
          description?: string | null;
          date_start?: string | null;
          date_end?: string | null;
          industry?: string | null;
          domain?: string | null;
          source?: EntrySource;
          user_confirmed?: boolean;
        };
        Update: {
          entry_type?: EntryType;
          company_name?: string | null;
          job_title?: string | null;
          description?: string | null;
          date_start?: string | null;
          date_end?: string | null;
          industry?: string | null;
          domain?: string | null;
          source?: EntrySource;
          user_confirmed?: boolean;
        };
      };
      profile_chunks: {
        Row: {
          id: string;
          user_id: string;
          entry_id: string;
          chunk_text: string;
          embedding: number[] | null;
          company_name: string | null;
          job_title: string | null;
          date_start: string | null;
          date_end: string | null;
          industry: string | null;
          domain: string | null;
          entry_type: EntryType | null;
          source: EntrySource | null;
          user_confirmed: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          entry_id: string;
          chunk_text: string;
          embedding?: number[] | null;
          company_name?: string | null;
          job_title?: string | null;
          date_start?: string | null;
          date_end?: string | null;
          industry?: string | null;
          domain?: string | null;
          entry_type?: EntryType | null;
          source?: EntrySource | null;
          user_confirmed?: boolean;
        };
        Update: {
          chunk_text?: string;
          embedding?: number[] | null;
          company_name?: string | null;
          job_title?: string | null;
          industry?: string | null;
          domain?: string | null;
          user_confirmed?: boolean;
        };
      };
      uploaded_documents: {
        Row: {
          id: string;
          user_id: string;
          file_name: string;
          file_path: string;
          file_type: string;
          document_type: DocumentType | null;
          processing_status: ProcessingStatus;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          file_name: string;
          file_path: string;
          file_type: string;
          document_type?: DocumentType | null;
          processing_status?: ProcessingStatus;
        };
        Update: {
          document_type?: DocumentType | null;
          processing_status?: ProcessingStatus;
          error_message?: string | null;
        };
      };
      scraped_urls: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          url_type: string | null;
          processing_status: ProcessingStatus;
          scraped_content: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          url: string;
          url_type?: string | null;
          processing_status?: ProcessingStatus;
        };
        Update: {
          url_type?: string | null;
          processing_status?: ProcessingStatus;
          scraped_content?: string | null;
          error_message?: string | null;
        };
      };
      applications: {
        Row: {
          id: string;
          user_id: string;
          company_name: string | null;
          job_title: string | null;
          jd_text: string;
          fit_score: number | null;
          interview_converted: InterviewStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          jd_text: string;
          company_name?: string | null;
          job_title?: string | null;
          fit_score?: number | null;
          interview_converted?: InterviewStatus;
        };
        Update: {
          company_name?: string | null;
          job_title?: string | null;
          jd_text?: string;
          fit_score?: number | null;
          interview_converted?: InterviewStatus;
        };
      };
      application_themes: {
        Row: {
          id: string;
          application_id: string;
          theme_name: string;
          theme_weight: number;
          score_tier: ScoreTier;
          score_numeric: number;
          explanation: string | null;
          evidence_chunk_ids: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          application_id: string;
          theme_name: string;
          theme_weight?: number;
          score_tier?: ScoreTier;
          score_numeric?: number;
          explanation?: string | null;
          evidence_chunk_ids?: string[];
        };
        Update: {
          theme_name?: string;
          theme_weight?: number;
          score_tier?: ScoreTier;
          score_numeric?: number;
          explanation?: string | null;
          evidence_chunk_ids?: string[];
        };
      };
      generated_resumes: {
        Row: {
          id: string;
          application_id: string;
          user_id: string;
          file_path: string | null;
          format: OutputFormat;
          length_setting: ResumeLength;
          summary_included: boolean;
          editorial_notes: Record<string, unknown>;
          version: number;
          created_at: string;
        };
        Insert: {
          application_id: string;
          user_id: string;
          file_path?: string | null;
          format?: OutputFormat;
          length_setting?: ResumeLength;
          summary_included?: boolean;
          editorial_notes?: Record<string, unknown>;
          version?: number;
        };
        Update: {
          file_path?: string | null;
          format?: OutputFormat;
          length_setting?: ResumeLength;
          summary_included?: boolean;
          editorial_notes?: Record<string, unknown>;
          version?: number;
        };
      };
    };
    Functions: {
      match_profile_chunks: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
          filter_user_id?: string;
          filter_company?: string;
          filter_entry_type?: EntryType;
        };
        Returns: {
          id: string;
          entry_id: string;
          chunk_text: string;
          company_name: string | null;
          job_title: string | null;
          date_start: string | null;
          date_end: string | null;
          industry: string | null;
          domain: string | null;
          entry_type: EntryType;
          source: EntrySource;
          similarity: number;
        }[];
      };
    };
  };
}
