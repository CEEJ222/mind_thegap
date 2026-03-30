import type { LeverPayload } from './lever'
import type { AshbyPayload } from './ashby'

export interface UserContactInfo {
  fullName: string | null
  preferredName: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  githubUrl: string | null
  websiteUrl: string | null
  location: string | null
  // Application preferences
  workAuthorization: string | null
  requiresSponsorship: string | null
  openToRelocation: string | null
  availableStartDate: string | null
  desiredCompensation: string | null
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export function prefillLeverPayload(contact: UserContactInfo): Partial<LeverPayload> {
  return {
    name: contact.fullName || undefined,
    email: contact.email || undefined,
    phone: contact.phone || undefined,
    linkedin: contact.linkedinUrl || undefined,
    github: contact.githubUrl || undefined,
    portfolio: contact.websiteUrl || undefined,
  }
}

export function prefillGreenhousePayload(contact: UserContactInfo): Record<string, string> {
  const { firstName, lastName } = contact.fullName
    ? splitName(contact.fullName)
    : { firstName: '', lastName: '' }

  // Keys must match Greenhouse field names (snake_case)
  const result: Record<string, string> = {}
  if (firstName) result['first_name'] = firstName
  if (lastName) result['last_name'] = lastName
  if (contact.email) result['email'] = contact.email
  if (contact.phone) result['phone'] = contact.phone
  if (contact.linkedinUrl) result['linkedin_profile'] = contact.linkedinUrl
  if (contact.websiteUrl) result['website'] = contact.websiteUrl
  return result
}

export function prefillAshbyPayload(contact: UserContactInfo): Partial<AshbyPayload> {
  return {
    name: contact.fullName || undefined,
    email: contact.email || undefined,
    phone: contact.phone || undefined,
    linkedinUrl: contact.linkedinUrl || undefined,
    websiteUrl: contact.websiteUrl || undefined,
  }
}

/**
 * Smart-match a form field label against known question patterns.
 * Returns a prefilled value string, or null if no match.
 */
export function smartPrefillAnswer(
  label: string,
  contact: UserContactInfo
): string | null {
  const l = label.toLowerCase()

  // Referral questions → blank (skip)
  if (
    l.includes('referral') ||
    l.includes('referred by') ||
    l.includes('who referred') ||
    l.includes('employee referral') ||
    l.includes("share their name")
  ) {
    return ''
  }

  // "How did you hear/learn/find out about" → Other
  if (
    l.includes('how did you hear') ||
    l.includes('how did you learn') ||
    l.includes('how did you find') ||
    l.includes('how did you discover') ||
    l.includes('where did you hear') ||
    l.includes('source of')
  ) {
    return 'Other'
  }

  // Work authorization
  if (
    l.includes('legally authorized') ||
    l.includes('authorized to work') ||
    l.includes('work authorization') ||
    l.includes('work in the u')
  ) {
    return contact.workAuthorization || null
  }

  // Sponsorship
  if (
    l.includes('sponsorship') ||
    l.includes('visa status') ||
    l.includes('work visa')
  ) {
    return contact.requiresSponsorship || null
  }

  // Relocation
  if (l.includes('relocation') || l.includes('relocate') || l.includes('willing to move')) {
    return contact.openToRelocation || null
  }

  // Start date
  if (
    l.includes('start date') ||
    l.includes('available to start') ||
    l.includes('when are you able') ||
    l.includes('earliest start') ||
    l.includes('when can you start')
  ) {
    return contact.availableStartDate || null
  }

  // Compensation
  if (
    l.includes('compensation') ||
    l.includes('salary') ||
    l.includes('desired pay') ||
    l.includes('expected pay') ||
    l.includes('pay expectation')
  ) {
    return contact.desiredCompensation || null
  }

  // LinkedIn
  if (l.includes('linkedin')) {
    return contact.linkedinUrl || null
  }

  // GitHub
  if (l.includes('github')) {
    return contact.githubUrl || null
  }

  // Website / portfolio
  if (
    l.includes('website') ||
    l.includes('portfolio') ||
    l.includes('personal site')
  ) {
    return contact.websiteUrl || null
  }

  // Preferred name
  if (l.includes('preferred') && (l.includes('name') || l.includes('first'))) {
    return contact.preferredName || (contact.fullName ? splitName(contact.fullName).firstName : null)
  }

  // Location / city
  if (l.includes('city') || l.includes('location') || l.includes('where are you based')) {
    return contact.location || null
  }

  return null
}

/**
 * Build a full set of pre-filled answers for a normalized form field list.
 * Each field has { key, label, options? }.
 * For select fields, resolves label strings to their option value (e.g. "Yes" → "1").
 */
export function buildSmartAnswers(
  fields: Array<{ key: string; label: string; options?: Array<{ label: string; value: string }> }>,
  contact: UserContactInfo,
  base: Record<string, string>
): Record<string, string> {
  const answers: Record<string, string> = { ...base }

  for (const field of fields) {
    // Don't overwrite already-prefilled values
    if (answers[field.key]) continue
    const smart = smartPrefillAnswer(field.label, contact)
    if (smart === null) continue

    if (field.options && field.options.length > 0 && smart !== '') {
      // Resolve the human-readable label to the option's value
      const match = field.options.find(
        (o) => o.label.toLowerCase() === smart.toLowerCase()
      )
      answers[field.key] = match ? match.value : smart
    } else {
      answers[field.key] = smart
    }
  }

  return answers
}
