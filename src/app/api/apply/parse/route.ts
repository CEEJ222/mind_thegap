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
  buildSmartAnswers,
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

    // Fetch full user settings for prefill
    const { data: settings } = await supabase
      .from('user_settings')
      .select('full_name, preferred_name, email, phone, linkedin_url, github_url, website_url, location, work_authorization, requires_sponsorship, open_to_relocation, available_start_date, desired_compensation')
      .eq('user_id', user_id)
      .single()

    const { data: userRow } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', user_id)
      .single()

    const contact: UserContactInfo = {
      fullName: settings?.full_name || userRow?.full_name || null,
      preferredName: settings?.preferred_name || null,
      email: settings?.email || userRow?.email || null,
      phone: settings?.phone || null,
      linkedinUrl: settings?.linkedin_url || null,
      githubUrl: settings?.github_url || null,
      websiteUrl: settings?.website_url || null,
      location: settings?.location || null,
      workAuthorization: settings?.work_authorization || null,
      requiresSponsorship: settings?.requires_sponsorship || null,
      openToRelocation: settings?.open_to_relocation || null,
      availableStartDate: settings?.available_start_date || null,
      desiredCompensation: settings?.desired_compensation || null,
    }

    // Fetch job data and form fields based on ATS type
    let job, formFields, baseAnswers, jdText
    let normalizedFields: Array<{ key: string; label: string }> = []

    if (detected.type === 'lever') {
      let leverJob
      try {
        leverJob = await fetchLeverJob(detected.company, detected.jobId)
      } catch (fetchErr) {
        const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        // If the posting is gone from the API, fall back to cached data + standard fields
        if (fetchMsg.includes('not found') || fetchMsg.includes('404')) {
          console.warn(`[apply/parse] Lever posting 404 — using fallback for ${detected.company}/${detected.jobId}`)
          // Try to find cached job description in jobs table by apply_url
          const { data: cachedJob } = await supabase
            .from('jobs')
            .select('title, company_name, description_text')
            .eq('apply_url', url)
            .maybeSingle()
          const standardFields = [
            { name: 'name', type: 'text', required: true, label: 'Full Name' },
            { name: 'email', type: 'email', required: true, label: 'Email' },
            { name: 'phone', type: 'tel', required: false, label: 'Phone' },
            { name: 'org', type: 'text', required: false, label: 'Current Company' },
            { name: 'linkedin', type: 'url', required: false, label: 'LinkedIn Profile' },
            { name: 'github', type: 'url', required: false, label: 'GitHub' },
            { name: 'portfolio', type: 'url', required: false, label: 'Portfolio / Website' },
            { name: 'resume', type: 'file', required: false, label: 'Resume' },
            { name: 'coverLetter', type: 'textarea', required: false, label: 'Cover Letter' },
          ]
          leverJob = {
            title: cachedJob?.title || 'Position',
            company: cachedJob?.company_name || detected.company,
            location: null,
            descriptionPlain: cachedJob?.description_text || '',
            descriptionHtml: '',
            absoluteUrl: url,
            formFields: standardFields,
            _postingUnavailable: true,
          }
        } else {
          throw fetchErr
        }
      }
      job = leverJob
      formFields = leverJob.formFields
      jdText = leverJob.descriptionPlain
      baseAnswers = prefillLeverPayload(contact) as Record<string, string>
      normalizedFields = leverJob.formFields.map((f) => ({ key: f.name!, label: f.label! }))
    } else if (detected.type === 'greenhouse') {
      const ghJob = await fetchGreenhouseJob(detected.company, detected.jobId)
      job = ghJob
      formFields = ghJob.questions
      jdText = ghJob.descriptionPlain
      baseAnswers = prefillGreenhousePayload(contact) as Record<string, string>
      normalizedFields = ghJob.questions.flatMap((q) =>
        (q.fields || []).map((f) => ({
          key: f.name,
          label: q.label || f.name,
          options: f.values?.map((v) => ({ label: String(v.label), value: String(v.value) })),
        }))
      )
    } else if (detected.type === 'ashby') {
      const ashbyJob = await fetchAshbyJob(detected.company, detected.jobId)
      job = ashbyJob
      formFields = ashbyJob.formFields
      jdText = ashbyJob.descriptionPlain
      baseAnswers = prefillAshbyPayload(contact) as Record<string, string>
      normalizedFields = ashbyJob.formFields.map((f) => ({ key: f.path!, label: f.label || f.path! }))
    } else {
      return NextResponse.json({ error: 'Unsupported ATS type' }, { status: 400 })
    }

    // Merge base prefill with smart question matching
    const prefilled = buildSmartAnswers(normalizedFields, contact, baseAnswers || {})

    const companyName = (job as { company?: string }).company || detected.company
    const jobTitle = job.title || null

    // Reuse existing row: check by ats_job_id first, then fall back to company+title match
    // (analyze route creates rows by company+title; we want to share the same row)
    const { data: existingByAts } = await supabase
      .from('applications')
      .select('id, company_name, job_title')
      .eq('user_id', user_id)
      .eq('ats_job_id', detected.jobId)
      .limit(1)
      .maybeSingle()

    const { data: existingByName } = !existingByAts && jobTitle
      ? await supabase
          .from('applications')
          .select('id, company_name, job_title')
          .eq('user_id', user_id)
          .ilike('company_name', companyName)
          .ilike('job_title', jobTitle)
          .limit(1)
          .maybeSingle()
      : { data: null }

    const existing = existingByAts || existingByName

    let appRow: { id: string; company_name: string | null; job_title: string | null }

    if (existing) {
      await supabase
        .from('applications')
        .update({
          jd_text: jdText || ' ',
          form_answers: prefilled as Record<string, unknown>,
          source_url: url,
          source_type: detected.type,
          ats_job_id: detected.jobId,
          ats_board_token: detected.company,
          ...(existing.company_name ? {} : { company_name: companyName }),
          ...(existing.job_title ? {} : { job_title: jobTitle }),
        })
        .eq('id', existing.id)
      appRow = existing
    } else {
      const { data: inserted, error: appError } = await supabase
        .from('applications')
        .insert({
          user_id,
          jd_text: jdText || ' ',
          company_name: companyName,
          job_title: jobTitle,
          source_url: url,
          source_type: detected.type,
          ats_job_id: detected.jobId,
          ats_board_token: detected.company,
          form_answers: prefilled as Record<string, unknown>,
          ats_status: 'draft',
        })
        .select('id, company_name, job_title')
        .single()

      if (appError || !inserted) {
        console.error('[apply/parse] Failed to create application:', appError)
        return NextResponse.json({ error: 'Failed to save application draft' }, { status: 500 })
      }
      appRow = inserted
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
      postingUnavailable: !!(job as { _postingUnavailable?: boolean })._postingUnavailable,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[apply/parse] Error:', message)
    // Surface 404s from ATS APIs as 404, not 500
    const status = message.includes('not found') || message.includes('404') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
