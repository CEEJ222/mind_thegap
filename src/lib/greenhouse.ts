export interface GreenhouseFormField {
  id: string
  label: string
  required: boolean
  fields: Array<{
    name: string
    type: string
    values?: Array<{ label: string; value: string | number }>
  }>
}

export interface GreenhouseJob {
  title: string
  location: string | null
  descriptionPlain: string
  descriptionHtml: string
  absoluteUrl: string
  questions: GreenhouseFormField[]
}

export interface GreenhousePayload {
  firstName: string
  lastName: string
  email: string
  phone?: string
  linkedinUrl?: string
  websiteUrl?: string
  coverLetter?: string
  resumeFile?: Blob
  customAnswers?: Record<string, string | boolean>
}

export function parseGreenhouseUrl(url: string): { boardToken: string; jobId: string } | null {
  const match = url.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/?]+)\/jobs\/(\d+)/i)
  if (!match) return null
  return { boardToken: match[1], jobId: match[2] }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function fetchGreenhouseJob(boardToken: string, jobId: string): Promise<GreenhouseJob> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}?questions=true`
  )
  if (!res.ok) throw new Error(`Greenhouse API error: ${res.status}`)
  const data = await res.json()

  return {
    title: data.title,
    location: data.location?.name || null,
    descriptionHtml: data.content || '',
    descriptionPlain: stripHtml(data.content || ''),
    absoluteUrl: data.absolute_url || `https://boards.greenhouse.io/${boardToken}/jobs/${jobId}`,
    questions: (data.questions || []).map((q: Record<string, unknown>) => ({
      id: String(q.id),
      label: q.label,
      required: q.required,
      fields: ((q.fields as Array<Record<string, unknown>>) || []).map((f) => ({
        name: f.name,
        type: f.type,
        values: f.values,
      })),
    })),
  }
}

function buildGreenhouseFormData(jobId: string, payload: GreenhousePayload, extra?: Record<string, string>): FormData {
  const fd = new FormData()
  fd.append('id', jobId)
  fd.append('first_name', payload.firstName)
  fd.append('last_name', payload.lastName)
  fd.append('email', payload.email)
  if (payload.phone) fd.append('phone', payload.phone)
  if (payload.linkedinUrl) fd.append('linkedin_profile', payload.linkedinUrl)
  if (payload.websiteUrl) fd.append('website', payload.websiteUrl)
  if (payload.coverLetter) fd.append('cover_letter_text', payload.coverLetter)
  if (payload.resumeFile) fd.append('resume', payload.resumeFile, 'resume.docx')
  for (const [k, v] of Object.entries(payload.customAnswers || {})) fd.append(k, String(v))
  for (const [k, v] of Object.entries(extra || {})) fd.append(k, v)
  return fd
}

export async function submitGreenhouseApplication(
  boardToken: string,
  jobId: string,
  payload: GreenhousePayload
): Promise<{ ok: boolean; error?: string }> {
  // Approach A: scrape the hosted apply page for hidden tokens, then POST to its form action
  try {
    const pageRes = await fetch(`https://boards.greenhouse.io/${boardToken}/jobs/${jobId}`)
    const html = await pageRes.text()

    // Extract ALL hidden input values from the application form
    const hiddenFields: Record<string, string> = {}
    const hiddenRe = /name="([^"]+)"\s+(?:type="hidden"\s+)?value="([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = hiddenRe.exec(html)) !== null) {
      hiddenFields[m[1]] = m[2]
    }

    // Find form action — prefer the apply/application form, not nav forms
    const formActionMatch = html.match(/<form[^>]+id="[^"]*application[^"]*"[^>]*action="([^"]+)"/i)
      || html.match(/<form[^>]+action="([^"]*apply[^"]*)"/i)
      || html.match(/<form[^>]+action="([^"]+)"[^>]*method="post"/i)

    const rawAction = formActionMatch?.[1]
    if (rawAction) {
      const formAction = rawAction.startsWith('http') ? rawAction : `https://boards.greenhouse.io${rawAction}`
      const fd = buildGreenhouseFormData(jobId, payload, hiddenFields)
      const res = await fetch(formAction, { method: 'POST', body: fd })
      console.log('[Greenhouse] Approach A response:', res.status, res.redirected)
      if (res.ok || res.redirected) return { ok: true }
      console.error('[Greenhouse] Approach A failed:', res.status)
    } else {
      console.warn('[Greenhouse] Approach A: no form action found')
    }
  } catch (err) {
    console.error('[Greenhouse] Approach A error:', err)
  }

  // Approach B: POST directly to boards-api (public endpoint, no auth required)
  try {
    const fd = buildGreenhouseFormData(jobId, payload)
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`,
      { method: 'POST', body: fd }
    )
    const body = await res.text().catch(() => '')
    console.log('[Greenhouse] Approach B response:', res.status, body.slice(0, 500))
    if (res.ok) return { ok: true }
    return { ok: false, error: `Greenhouse submit error ${res.status}: ${body.slice(0, 300)}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Greenhouse submit failed: ${msg}` }
  }
}
