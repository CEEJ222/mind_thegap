export interface LeverFormField {
  name: string
  type: string
  required: boolean
  label: string
  options?: Array<{ label: string; value: string }>
}

export interface LeverJob {
  title: string
  company: string
  location: string | null
  descriptionPlain: string
  descriptionHtml: string
  absoluteUrl: string
  formFields: LeverFormField[]
}

export interface LeverPayload {
  name: string
  email: string
  phone?: string
  org?: string
  linkedin?: string
  github?: string
  portfolio?: string
  coverLetter?: string
  resumeFile?: Blob
  customAnswers?: Record<string, string>
}

export function parseLeverUrl(url: string): { company: string; jobId: string } | null {
  const match = url.match(/jobs\.(eu\.)?lever\.co\/([^/?]+)\/([a-f0-9-]{36})/i)
  if (!match) return null
  return { company: match[2], jobId: match[3] }
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

export async function fetchLeverJob(company: string, jobId: string): Promise<LeverJob> {
  const res = await fetch(`https://api.lever.co/v0/postings/${company}/${jobId}`)
  if (!res.ok) throw new Error(`Lever API error: ${res.status}`)
  const data = await res.json()

  // Fetch form fields from the apply endpoint
  const applyRes = await fetch(`https://api.lever.co/v0/postings/${company}/${jobId}/apply`)
  const applyData = applyRes.ok ? await applyRes.json() : null

  const formFields: LeverFormField[] = []

  // Standard Lever fields always present
  formFields.push({ name: 'name', type: 'text', required: true, label: 'Full Name' })
  formFields.push({ name: 'email', type: 'email', required: true, label: 'Email' })
  formFields.push({ name: 'phone', type: 'tel', required: false, label: 'Phone' })
  formFields.push({ name: 'org', type: 'text', required: false, label: 'Current Company' })
  formFields.push({ name: 'linkedin', type: 'url', required: false, label: 'LinkedIn Profile' })
  formFields.push({ name: 'github', type: 'url', required: false, label: 'GitHub' })
  formFields.push({ name: 'portfolio', type: 'url', required: false, label: 'Portfolio / Website' })
  formFields.push({ name: 'resume', type: 'file', required: false, label: 'Resume' })
  formFields.push({ name: 'coverLetter', type: 'textarea', required: false, label: 'Cover Letter' })

  // Add custom questions from posting
  if (applyData?.forms) {
    for (const form of applyData.forms) {
      for (const field of form.fields || []) {
        if (['name', 'email', 'phone', 'org', 'linkedin', 'github', 'portfolio', 'resume', 'coverLetter'].includes(field.name)) continue
        formFields.push({
          name: field.name,
          type: field.type || 'text',
          required: !!field.required,
          label: field.text || field.name,
          options: field.options,
        })
      }
    }
  }

  return {
    title: data.text || 'Untitled Position',
    company,
    location: data.categories?.location || null,
    descriptionPlain: stripHtml(data.descriptionPlain || data.description || ''),
    descriptionHtml: data.description || '',
    absoluteUrl: data.hostedUrl || `https://jobs.lever.co/${company}/${jobId}`,
    formFields,
  }
}

export async function submitLeverApplication(
  company: string,
  jobId: string,
  payload: LeverPayload
): Promise<{ ok: boolean; applicationId?: string; error?: string }> {
  const formData = new FormData()

  formData.append('name', payload.name)
  formData.append('email', payload.email)
  if (payload.phone) formData.append('phone', payload.phone)
  if (payload.org) formData.append('org', payload.org)
  if (payload.linkedin) formData.append('urls[LinkedIn]', payload.linkedin)
  if (payload.github) formData.append('urls[GitHub]', payload.github)
  if (payload.portfolio) formData.append('urls[Portfolio]', payload.portfolio)
  if (payload.coverLetter) formData.append('comments', payload.coverLetter)
  if (payload.resumeFile) formData.append('resume', payload.resumeFile, 'resume.pdf')

  for (const [key, value] of Object.entries(payload.customAnswers || {})) {
    formData.append(key, value)
  }

  const res = await fetch(
    `https://api.lever.co/v0/postings/${company}/${jobId}/apply`,
    { method: 'POST', body: formData }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, error: `Lever submit error ${res.status}: ${body}` }
  }

  const result = await res.json().catch(() => ({}))
  return { ok: true, applicationId: result.applicationId }
}
