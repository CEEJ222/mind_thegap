import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { detectATS } from '@/lib/ats-detect'
import { fetchLeverJob } from '@/lib/lever'
import { fetchGreenhouseJob } from '@/lib/greenhouse'
import { fetchAshbyJob } from '@/lib/ashby'
import {
  prefillLeverPayload,
  prefillGreenhousePayload,
  prefillAshbyPayload,
  type UserContactInfo,
} from '@/lib/prefill'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const url = body.url as string
    const user_id = body.user_id as string

    if (!url || !user_id) {
      return NextResponse.json({ error: 'Missing url or user_id' }, { status: 400 })
    }

    const detected = detectATS(url)
    if (!detected) {
      return NextResponse.json(
        { error: 'URL not recognized as Lever, Greenhouse, or Ashby' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Fetch user contact info for prefill
    const { data: settings } = await supabase
      .from('user_settings')
      .select('full_name, email, phone, linkedin_url, location')
      .eq('user_id', user_id)
      .single()

    const { data: userRow } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', user_id)
      .single()

    const contact: UserContactInfo = {
      fullName: settings?.full_name || userRow?.full_name || null,
      email: settings?.email || userRow?.email || null,
      phone: settings?.phone || null,
      linkedinUrl: settings?.linkedin_url || null,
      location: settings?.location || null,
    }

    // Fetch job data and form fields based on ATS type
    let job, formFields, prefilled, jdText

    if (detected.type === 'lever') {
      const leverJob = await fetchLeverJob(detected.company, detected.jobId)
      job = leverJob
      formFields = leverJob.formFields
      jdText = leverJob.descriptionPlain
      prefilled = prefillLeverPayload(contact)
    } else if (detected.type === 'greenhouse') {
      const ghJob = await fetchGreenhouseJob(detected.company, detected.jobId)
      job = ghJob
      formFields = ghJob.questions
      jdText = ghJob.descriptionPlain
      prefilled = prefillGreenhousePayload(contact)
    } else if (detected.type === 'ashby') {
      const ashbyJob = await fetchAshbyJob(detected.company, detected.jobId)
      job = ashbyJob
      formFields = ashbyJob.formFields
      jdText = ashbyJob.descriptionPlain
      prefilled = prefillAshbyPayload(contact)
    } else {
      return NextResponse.json({ error: 'Unsupported ATS type' }, { status: 400 })
    }

    // Create a draft applications row
    const { data: appRow, error: appError } = await supabase
      .from('applications')
      .insert({
        user_id,
        jd_text: jdText || ' ',
        company_name: (job as { company?: string }).company || detected.company,
        job_title: job.title || null,
        source_url: url,
        source_type: detected.type,
        ats_job_id: detected.jobId,
        ats_board_token: detected.company,
        form_answers: prefilled as Record<string, unknown>,
        ats_status: 'draft',
      })
      .select('id, company_name, job_title')
      .single()

    if (appError) {
      console.error('[apply/parse] Failed to create application:', appError)
      return NextResponse.json({ error: 'Failed to save application draft' }, { status: 500 })
    }

    return NextResponse.json({
      atsType: detected.type,
      applicationId: appRow.id,
      job: {
        ...job,
        company: (job as { company?: string }).company || detected.company,
      },
      formFields,
      prefilled,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[apply/parse] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
