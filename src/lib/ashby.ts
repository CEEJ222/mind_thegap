export interface AshbyFormField {
  path: string
  label: string
  type: string
  required: boolean
  options: Array<{ label: string; value: string }>
}

export interface AshbyJob {
  title: string
  location: string | null
  isRemote: boolean
  department: string | null
  team: string | null
  descriptionHtml: string
  descriptionPlain: string
  formFields: AshbyFormField[]
}

export interface AshbyPayload {
  name: string
  email: string
  phone?: string
  linkedinUrl?: string
  websiteUrl?: string
  coverLetter?: string
  resumeFile?: Blob
  customAnswers?: Record<string, string | boolean>
}

export function parseAshbyUrl(url: string): { company: string; jobId: string } | null {
  const match = url.match(/jobs\.ashbyhq\.com\/([^/?]+)\/([a-f0-9-]{36})/i)
  if (!match) return null
  return { company: match[1], jobId: match[2] }
}

export async function fetchAshbyJob(company: string, jobId: string): Promise<AshbyJob> {
  const res = await fetch('https://api.ashbyhq.com/posting-api/jobPosting.info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobPostingId: jobId }),
  })
  if (!res.ok) throw new Error(`Ashby API error: ${res.status}`)
  const data = await res.json()
  const posting = data.results

  const formFields: AshbyFormField[] = (posting.applicationFormDefinition?.sections || [])
    .flatMap((s: Record<string, unknown>) => (s.fields as Array<Record<string, unknown>>) || [])
    .map((f: Record<string, unknown>) => ({
      path: f.path as string,
      label: f.title as string,
      type: f.type as string,
      required: !!f.isRequired,
      options: (f.selectableValues as Array<{ label: string; value: string }>) || [],
    }))

  return {
    title: posting.title,
    location: posting.location || null,
    isRemote: !!posting.isRemote,
    department: posting.department || null,
    team: posting.team || null,
    descriptionHtml: posting.descriptionHtml || '',
    descriptionPlain: posting.descriptionPlain || '',
    formFields,
  }
}

async function uploadAshbyFile(file: Blob): Promise<string | null> {
  try {
    const formData = new FormData()
    formData.append('file', file, 'resume.pdf')

    const res = await fetch('https://api.ashbyhq.com/posting-api/file.upload', {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      console.error('[Ashby] File upload failed:', res.status)
      return null
    }
    const data = await res.json()
    return data.results?.fileHandle || null
  } catch (err) {
    console.error('[Ashby] File upload error:', err)
    return null
  }
}

export async function submitAshbyApplication(
  jobId: string,
  payload: AshbyPayload
): Promise<{ ok: boolean; applicationId?: string; resumeWarning?: boolean; error?: string }> {
  const fieldSubmissions: Array<{ path: string; value: unknown }> = []

  if (payload.name) fieldSubmissions.push({ path: '_systemfield_name', value: payload.name })
  if (payload.email) fieldSubmissions.push({ path: '_systemfield_email', value: payload.email })
  if (payload.phone) fieldSubmissions.push({ path: '_systemfield_phone', value: payload.phone })
  if (payload.linkedinUrl) fieldSubmissions.push({ path: '_systemfield_linkedin', value: payload.linkedinUrl })
  if (payload.websiteUrl) fieldSubmissions.push({ path: '_systemfield_website', value: payload.websiteUrl })
  if (payload.coverLetter) fieldSubmissions.push({ path: '_systemfield_cover_letter', value: payload.coverLetter })

  for (const [path, value] of Object.entries(payload.customAnswers || {})) {
    fieldSubmissions.push({ path, value })
  }

  let resumeWarning = false
  if (payload.resumeFile) {
    const fileHandle = await uploadAshbyFile(payload.resumeFile)
    if (fileHandle) {
      fieldSubmissions.push({ path: '_systemfield_resume', value: fileHandle })
    } else {
      resumeWarning = true
    }
  }

  const res = await fetch('https://api.ashbyhq.com/posting-api/applicationForm.submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobPostingId: jobId, fieldSubmissions }),
  })

  const result = await res.json().catch(() => ({}))
  console.log('[Ashby] Submit response:', res.status, JSON.stringify(result).slice(0, 500))

  if (result.success === true) {
    return { ok: true, applicationId: result.results?.applicationId, resumeWarning }
  }

  return {
    ok: false,
    resumeWarning,
    error: result.errors ? JSON.stringify(result.errors) : `Ashby submit error ${res.status}`,
  }
}
