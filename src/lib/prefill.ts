import type { LeverPayload } from './lever'
import type { GreenhousePayload } from './greenhouse'
import type { AshbyPayload } from './ashby'

export interface UserContactInfo {
  fullName: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  location: string | null
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')
  return { firstName, lastName }
}

export function prefillLeverPayload(contact: UserContactInfo): Partial<LeverPayload> {
  return {
    name: contact.fullName || undefined,
    email: contact.email || undefined,
    phone: contact.phone || undefined,
    linkedin: contact.linkedinUrl || undefined,
  }
}

export function prefillGreenhousePayload(contact: UserContactInfo): Partial<GreenhousePayload> {
  const { firstName, lastName } = contact.fullName
    ? splitName(contact.fullName)
    : { firstName: '', lastName: '' }

  return {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email: contact.email || undefined,
    phone: contact.phone || undefined,
    linkedinUrl: contact.linkedinUrl || undefined,
  }
}

export function prefillAshbyPayload(contact: UserContactInfo): Partial<AshbyPayload> {
  return {
    name: contact.fullName || undefined,
    email: contact.email || undefined,
    phone: contact.phone || undefined,
    linkedinUrl: contact.linkedinUrl || undefined,
  }
}
