export type EntryType = "job" | "project" | "education" | "award" | "certification" | "skills";
export type EntrySource = "resume_upload" | "url_scrape" | "manual_entry" | "gap_fill";
export type OutputFormat = "docx" | "pdf";
export type ResumeLength = "1_page" | "1_5_pages" | "2_pages" | "no_max";
export type ThemeMode = "light" | "dark";
export type InterviewStatus = "pending" | "yes" | "no";
export type ScoreTier = "strong" | "weak" | "none";
export type DocumentType = "resume" | "project_writeup" | "biz_case" | "award" | "certification" | "performance_review" | "other";
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";
export type JobStatus = "unseen" | "saved" | "dismissed" | "applied";
export type ApiKeyType = "apify" | "openrouter";

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
          source_url: string | null;
          source_type: string | null;
          jd_summary: string | null;
          ats_job_id: string | null;
          ats_board_token: string | null;
          form_answers: Record<string, unknown> | null;
          ats_status: string | null;
          ats_submitted_at: string | null;
          ats_submission_response: Record<string, unknown> | null;
          ats_error_message: string | null;
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
          source_url?: string | null;
          source_type?: string | null;
          jd_summary?: string | null;
          ats_job_id?: string | null;
          ats_board_token?: string | null;
          form_answers?: Record<string, unknown> | null;
          ats_status?: string | null;
          ats_submitted_at?: string | null;
          ats_submission_response?: Record<string, unknown> | null;
          ats_error_message?: string | null;
        };
        Update: {
          company_name?: string | null;
          job_title?: string | null;
          jd_text?: string;
          fit_score?: number | null;
          interview_converted?: InterviewStatus;
          source_url?: string | null;
          source_type?: string | null;
          jd_summary?: string | null;
          ats_job_id?: string | null;
          ats_board_token?: string | null;
          form_answers?: Record<string, unknown> | null;
          ats_status?: string | null;
          ats_submitted_at?: string | null;
          ats_submission_response?: Record<string, unknown> | null;
          ats_error_message?: string | null;
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
      jobs: {
        Row: {
          id: string;
          title: string | null;
          company_name: string | null;
          company_linkedin_url: string | null;
          company_logo: string | null;
          company_description: string | null;
          company_website: string | null;
          company_employees_count: number | null;
          location: string | null;
          salary_info: Record<string, unknown> | null;
          posted_at: string | null;
          employment_type: string | null;
          seniority_level: string | null;
          job_function: string | null;
          industries: string[] | null;
          description_text: string | null;
          description_html: string | null;
          apply_url: string | null;
          applicants_count: number | null;
          job_poster_name: string | null;
          job_poster_title: string | null;
          job_poster_profile_url: string | null;
          raw_data: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          title?: string | null;
          company_name?: string | null;
          company_linkedin_url?: string | null;
          company_logo?: string | null;
          company_description?: string | null;
          company_website?: string | null;
          company_employees_count?: number | null;
          location?: string | null;
          salary_info?: Record<string, unknown> | null;
          posted_at?: string | null;
          employment_type?: string | null;
          seniority_level?: string | null;
          job_function?: string | null;
          industries?: string[] | null;
          description_text?: string | null;
          description_html?: string | null;
          apply_url?: string | null;
          applicants_count?: number | null;
          job_poster_name?: string | null;
          job_poster_title?: string | null;
          job_poster_profile_url?: string | null;
          raw_data?: Record<string, unknown> | null;
        };
        Update: {
          title?: string | null;
          company_name?: string | null;
          company_linkedin_url?: string | null;
          company_logo?: string | null;
          company_description?: string | null;
          company_website?: string | null;
          company_employees_count?: number | null;
          location?: string | null;
          salary_info?: Record<string, unknown> | null;
          posted_at?: string | null;
          employment_type?: string | null;
          seniority_level?: string | null;
          job_function?: string | null;
          industries?: string[] | null;
          description_text?: string | null;
          description_html?: string | null;
          apply_url?: string | null;
          applicants_count?: number | null;
          job_poster_name?: string | null;
          job_poster_title?: string | null;
          job_poster_profile_url?: string | null;
          raw_data?: Record<string, unknown> | null;
        };
      };
      search_cache: {
        Row: {
          id: string;
          search_url_hash: string;
          search_url: string;
          job_ids: string[];
          result_count: number;
          scraped_at: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          search_url_hash: string;
          search_url: string;
          job_ids: string[];
          result_count?: number;
          scraped_at?: string;
          expires_at: string;
        };
        Update: {
          search_url_hash?: string;
          search_url?: string;
          job_ids?: string[];
          result_count?: number;
          scraped_at?: string;
          expires_at?: string;
        };
      };
      user_saved_searches: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          search_url: string;
          search_url_hash: string;
          is_active: boolean;
          last_notified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          search_url: string;
          search_url_hash: string;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          search_url?: string;
          search_url_hash?: string;
          is_active?: boolean;
          last_notified_at?: string | null;
        };
      };
      user_jobs: {
        Row: {
          id: string;
          user_id: string;
          job_id: string;
          search_id: string | null;
          status: JobStatus;
          fit_score: number | null;
          resume_id: string | null;
          application_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          job_id: string;
          search_id?: string | null;
          status?: JobStatus;
          fit_score?: number | null;
          resume_id?: string | null;
          application_id?: string | null;
        };
        Update: {
          search_id?: string | null;
          status?: JobStatus;
          fit_score?: number | null;
          resume_id?: string | null;
          application_id?: string | null;
        };
      };
      user_api_keys: {
        Row: {
          id: string;
          user_id: string;
          key_type: ApiKeyType;
          encrypted_value: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          key_type: ApiKeyType;
          encrypted_value: string;
        };
        Update: {
          key_type?: ApiKeyType;
          encrypted_value?: string;
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
