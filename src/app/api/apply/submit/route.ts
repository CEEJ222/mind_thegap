import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { submitLeverApplication, type LeverPayload } from '@/lib/lever'
import { submitGreenhouseApplication, type GreenhousePayload } from '@/lib/greenhouse'
import { submitAshbyApplication, type AshbyPayload } from '@/lib/ashby'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { applicationId, confirmed, form_answers } = body as {
      applicationId: string
      confirmed: boolean
      form_answers: Record<string, unknown>
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

    let result: { ok: boolean; applicationId?: string; resumeWarning?: boolean; error?: string }

    if (atsType === 'lever') {
      result = await submitLeverApplication(boardToken, jobId, form_answers as unknown as LeverPayload)
    } else if (atsType === 'greenhouse') {
      result = await submitGreenhouseApplication(boardToken, jobId, form_answers as unknown as GreenhousePayload)
    } else if (atsType === 'ashby') {
      result = await submitAshbyApplication(jobId, form_answers as unknown as AshbyPayload)
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
      } as Record<string, unknown>)
      .eq('id', applicationId)

    if (!result.ok) {
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
