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

export async function submitGreenhouseApplication(
  boardToken: string,
  jobId: string,
  payload: GreenhousePayload
): Promise<{ ok: boolean; error?: string }> {
  // Approach A: web form POST (no API key required)
  try {
    const applyPageRes = await fetch(
      `https://boards.greenhouse.io/${boardToken}/jobs/${jobId}`
    )
    const html = await applyPageRes.text()

    const mappedUrlToken = html.match(/name="mapped_url_token" value="([^"]+)"/)?.[1]
    const rawAction = html.match(/<form[^>]+action="([^"]+)"/)?.[1]

    if (rawAction) {
      const formAction = rawAction.startsWith('http')
        ? rawAction
        : `https://boards.greenhouse.io${rawAction}`

      const formData = new FormData()
      formData.append('id', jobId)
      if (mappedUrlToken) formData.append('mapped_url_token', mappedUrlToken)
      formData.append('first_name', payload.firstName)
      formData.append('last_name', payload.lastName)
      formData.append('email', payload.email)
      formData.append('phone', payload.phone || '')
      if (payload.linkedinUrl) formData.append('linkedin_profile', payload.linkedinUrl)
      if (payload.websiteUrl) formData.append('website', payload.websiteUrl)
      if (payload.coverLetter) formData.append('cover_letter_text', payload.coverLetter)
      if (payload.resumeFile) formData.append('resume', payload.resumeFile, 'resume.pdf')

      for (const [fieldName, value] of Object.entries(payload.customAnswers || {})) {
        formData.append(fieldName, String(value))
      }

      const res = await fetch(formAction, { method: 'POST', body: formData })
      if (res.ok || res.redirected) return { ok: true }

      console.error('[Greenhouse] Approach A failed:', res.status)
    }
  } catch (err) {
    console.error('[Greenhouse] Approach A error:', err)
  }

  // Approach B: Basic Auth with board_token as username
  try {
    const credentials = btoa(`${boardToken}:`)
    const formData = new FormData()
    formData.append('first_name', payload.firstName)
    formData.append('last_name', payload.lastName)
    formData.append('email', payload.email)
    if (payload.phone) formData.append('phone', payload.phone)
    if (payload.linkedinUrl) formData.append('linkedin_profile', payload.linkedinUrl)
    if (payload.coverLetter) formData.append('cover_letter_text', payload.coverLetter)
    if (payload.resumeFile) formData.append('resume', payload.resumeFile, 'resume.pdf')

    for (const [fieldName, value] of Object.entries(payload.customAnswers || {})) {
      formData.append(fieldName, String(value))
    }

    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}` },
        body: formData,
      }
    )

    const body = await res.text().catch(() => '')
    console.log('[Greenhouse] Approach B response:', res.status, body.slice(0, 500))

    if (res.ok) return { ok: true }
    return { ok: false, error: `Greenhouse submit error ${res.status}: ${body.slice(0, 200)}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Greenhouse submit failed: ${msg}` }
  }
}
