import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { submitLeverApplication, type LeverPayload } from '@/lib/lever'
import { submitGreenhouseApplication, type GreenhousePayload } from '@/lib/greenhouse'
import { submitAshbyApplication, type AshbyPayload } from '@/lib/ashby'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { applicationId, confirmed, form_answers, resume_id } = body as {
      applicationId: string
      confirmed: boolean
      form_answers: Record<string, unknown>
      resume_id?: string
    }

    if (!applicationId || !confirmed) {
      return NextResponse.json(
        { error: 'applicationId and confirmed:true are required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Load the draft application
    const { data: app, error: loadErr } = await supabase
      .from('applications')
      .select('id, user_id, source_url, source_type, ats_job_id, ats_board_token, ats_status')
      .eq('id', applicationId)
      .single()

    if (loadErr || !app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if (app.ats_status === 'submitted') {
      return NextResponse.json({ error: 'Already submitted' }, { status: 409 })
    }

    // Save final form_answers before attempting submit
    await supabase
      .from('applications')
      .update({ form_answers: form_answers as Record<string, unknown> })
      .eq('id', applicationId)

    const atsType = app.source_type
    const jobId = app.ats_job_id
    const boardToken = app.ats_board_token

    if (!atsType || !jobId || !boardToken) {
      return NextResponse.json({ error: 'Missing ATS metadata on application' }, { status: 400 })
    }

    // Download resume file from Supabase Storage if resume_id provided
    let resumeBlob: Blob | undefined
    if (resume_id) {
      const { data: resumeRow } = await supabase
        .from('generated_resumes')
        .select('file_path')
        .eq('id', resume_id)
        .single()

      if (resumeRow?.file_path) {
        const { data: fileData } = await supabase.storage
          .from('resumes')
          .download(resumeRow.file_path)
        if (fileData) resumeBlob = fileData
      }
    }

    const fa = form_answers as Record<string, string>
    let result: { ok: boolean; applicationId?: string; resumeWarning?: boolean; error?: string }

    if (atsType === 'lever') {
      // form_answers keys match LeverPayload field names; extras go into customAnswers
      const systemKeys = new Set(['name', 'email', 'phone', 'org', 'linkedin', 'github', 'portfolio', 'coverLetter'])
      const payload: LeverPayload = {
        name: fa.name || '',
        email: fa.email || '',
        phone: fa.phone || undefined,
        org: fa.org || undefined,
        linkedin: fa.linkedin || undefined,
        github: fa.github || undefined,
        portfolio: fa.portfolio || undefined,
        coverLetter: fa.coverLetter || undefined,
        customAnswers: Object.fromEntries(Object.entries(fa).filter(([k]) => !systemKeys.has(k))),
        resumeFile: resumeBlob,
      }
      result = await submitLeverApplication(boardToken, jobId, payload)
    } else if (atsType === 'greenhouse') {
      // form_answers uses snake_case Greenhouse field names; map to GreenhousePayload
      const systemKeys = new Set(['first_name', 'last_name', 'email', 'phone', 'linkedin_profile', 'website', 'cover_letter_text'])
      const payload: GreenhousePayload = {
        firstName: fa.first_name || '',
        lastName: fa.last_name || '',
        email: fa.email || '',
        phone: fa.phone || undefined,
        linkedinUrl: fa.linkedin_profile || undefined,
        websiteUrl: fa.website || undefined,
        coverLetter: fa.cover_letter_text || undefined,
        customAnswers: Object.fromEntries(Object.entries(fa).filter(([k]) => !systemKeys.has(k))),
        resumeFile: resumeBlob,
      }
      console.log('[apply/submit] Greenhouse payload firstName/lastName:', payload.firstName, payload.lastName)
      result = await submitGreenhouseApplication(boardToken, jobId, payload)
    } else if (atsType === 'ashby') {
      // form_answers uses camelCase Ashby field names; extras are custom field paths
      const systemKeys = new Set(['name', 'email', 'phone', 'linkedinUrl', 'websiteUrl', 'coverLetter'])
      const payload: AshbyPayload = {
        name: fa.name || '',
        email: fa.email || '',
        phone: fa.phone || undefined,
        linkedinUrl: fa.linkedinUrl || undefined,
        websiteUrl: fa.websiteUrl || undefined,
        coverLetter: fa.coverLetter || undefined,
        customAnswers: Object.fromEntries(Object.entries(fa).filter(([k]) => !systemKeys.has(k))),
        resumeFile: resumeBlob,
      }
      result = await submitAshbyApplication(jobId, payload)
    } else {
      return NextResponse.json({ error: `Unsupported ATS type: ${atsType}` }, { status: 400 })
    }

    // Update application status
    const now = new Date().toISOString()
    await supabase
      .from('applications')
      .update({
        ats_status: result.ok ? 'submitted' : 'failed',
        ats_submitted_at: result.ok ? now : null,
        ats_submission_response: result as unknown as Record<string, unknown>,
        ats_error_message: result.ok ? null : (result.error || 'Unknown error'),
        ...(result.ok ? { interview_converted: 'applied' } : {}),
      } as Record<string, unknown>)
      .eq('id', applicationId)

    if (!result.ok) {
      console.error(`[apply/submit] ATS submission failed (${atsType}):`, result.error)
      return NextResponse.json(
        { error: result.error || 'Submission failed', resumeWarning: result.resumeWarning },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      atsApplicationId: result.applicationId,
      resumeWarning: result.resumeWarning,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[apply/submit] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
