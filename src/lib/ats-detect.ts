export type ATSType = 'lever' | 'greenhouse' | 'ashby' | 'unknown'

export function detectATS(url: string): {
  type: ATSType
  company: string
  jobId: string
} | null {
  // Lever
  // https://jobs.lever.co/company/job-id
  // https://jobs.eu.lever.co/company/job-id
  const leverMatch = url.match(
    /jobs\.(eu\.)?lever\.co\/([^/?]+)\/([a-f0-9-]{36})/i
  )
  if (leverMatch) return {
    type: 'lever',
    company: leverMatch[2],
    jobId: leverMatch[3],
  }

  // Greenhouse
  // https://boards.greenhouse.io/company/jobs/12345678
  // https://job-boards.greenhouse.io/company/jobs/12345678
  const ghMatch = url.match(
    /(?:boards|job-boards)\.greenhouse\.io\/([^/?]+)\/jobs\/(\d+)/i
  )
  if (ghMatch) return {
    type: 'greenhouse',
    company: ghMatch[1],
    jobId: ghMatch[2],
  }

  // Ashby
  // https://jobs.ashbyhq.com/company/job-id
  // https://jobs.ashbyhq.com/company/job-id/application
  const ashbyMatch = url.match(
    /jobs\.ashbyhq\.com\/([^/?]+)\/([a-f0-9-]{36})/i
  )
  if (ashbyMatch) return {
    type: 'ashby',
    company: ashbyMatch[1],
    jobId: ashbyMatch[2],
  }

  return null
}
