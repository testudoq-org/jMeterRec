import type { CapturedRequest } from '../models/captured-request'

export function getCapturedRequestDomains(requests: CapturedRequest[]): string[] {
  const domains = new Set<string>()

  for (const request of requests) {
    const domain = getDomainFromUrl(request.url)

    if (domain !== undefined) {
      domains.add(domain)
    }
  }

  return [...domains].sort((left, right) => left.localeCompare(right))
}

export function filterRequestsByDomains(
  requests: CapturedRequest[],
  domains: string[]
): CapturedRequest[] {
  if (domains.length === 0) {
    return []
  }

  const normalizedDomains = domains
    .map(normalizeDomain)
    .filter((domain): domain is string => domain.length > 0)

  if (normalizedDomains.length === 0) {
    return []
  }

  return requests.filter((request) => {
    const domain = getDomainFromUrl(request.url)

    if (domain === undefined) {
      return false
    }

    return normalizedDomains.some((selectedDomain) => matchesDomain(domain, selectedDomain))
  })
}

function getDomainFromUrl(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl)

    return normalizeDomain(url.hostname)
  } catch {
    return undefined
  }
}

function matchesDomain(domain: string, selectedDomain: string): boolean {
  return domain === selectedDomain || domain.endsWith(`.${selectedDomain}`)
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase()
}
