import type { CapturedRequest } from '../models/captured-request'

/**
 * Base interface for all JMeter XML element representations.
 * Every emitted element must carry these core JMeter attributes.
 */
export interface JmxElement {
  readonly type: string
  readonly testClass: string
  readonly guiClass: string
  readonly name: string
  readonly enabled: boolean
}

/**
 * Represents a <ConfigTestElement> for HTTP Request Defaults.
 *
 * JMeter uses this as an inheritance layer: if a sampler's domain,
 * port, or protocol property is empty, it falls back to the value
 * defined here. This reduces JMX verbosity for multi-request
 * recordings to the same host.
 */
export interface JmxHTTPRequestDefaults extends JmxElement {
  readonly type: 'HTTPRequestDefaults'
  readonly testClass: 'org.apache.jmeter.config.ConfigTestElement'
  readonly guiClass: 'org.apache.jmeter.protocol.http.config.gui.HttpDefaultsGui'
  readonly name: string
  readonly domain: string
  readonly port: string
  readonly protocol: string
}

/**
 * Factory constants for JMeter-required class names and GUI classes.
 * Centralising these prevents typos and keeps the serializer aligned
 * with JMeter's expected XML structure.
 */
export const ElementDefaults = {
  HTTPRequestDefaults: {
    testClass: 'org.apache.jmeter.config.ConfigTestElement',
    guiClass: 'org.apache.jmeter.protocol.http.config.gui.HttpDefaultsGui',
  },
} as const

/**
 * Factory interface for creating JMX element instances with
 * JMeter-compliant defaults.
 */
export interface JmxElementFactory {
  createHTTPRequestDefaults(
    domain: string,
    port: string,
    protocol: string,
    name?: string
  ): JmxHTTPRequestDefaults
}

/**
 * Creates a JmxHTTPRequestDefaults element with validated defaults.
 *
 * @param domain - Hostname (e.g. "api.example.com"). Empty string = no default.
 * @param port - Port number as string (e.g. "443", "80", ""). Empty string = no default.
 * @param protocol - Protocol name without colon (e.g. "https", "http"). Empty string = no default.
 * @param name - Display name in JMeter GUI. Defaults to "HTTP Request Defaults".
 * @returns A fully populated JmxHTTPRequestDefaults instance.
 */
export function createHTTPRequestDefaults(
  domain: string,
  port: string,
  protocol: string,
  name = 'HTTP Request Defaults'
): JmxHTTPRequestDefaults {
  return {
    type: 'HTTPRequestDefaults',
    testClass: ElementDefaults.HTTPRequestDefaults.testClass,
    guiClass: ElementDefaults.HTTPRequestDefaults.guiClass,
    name,
    enabled: true,
    domain,
    port,
    protocol,
  }
}

/**
 * Analyzes a set of captured requests to determine the most frequent
 * host, protocol, and port. The result is used to populate
 * HTTPRequestDefaults so individual samplers can inherit common
 * connection properties instead of repeating them.
 *
 * @param requests - Array of captured HTTP requests.
 * @returns Object containing the primary domain, port, and protocol.
 *   Returns empty strings for all fields when no valid requests are present
 *   or all URLs are malformed.
 */
export function analyzeRequestDefaults(requests: CapturedRequest[]): {
  primaryDomain: string
  primaryPort: string
  primaryProtocol: string
} {
  const hostCounts = new Map<
    string,
    { count: number; domain: string; port: string; protocol: string }
  >()

  for (const req of requests) {
    try {
      const url = new URL(req.url)
      const protocol = url.protocol.replace(':', '')
      const defaultPort = protocol === 'https' ? '443' : '80'
      const port = url.port || defaultPort
      const hostKey = `${url.hostname}:${port}`

      const existing = hostCounts.get(hostKey)
      if (existing !== undefined) {
        existing.count += 1
      } else {
        hostCounts.set(hostKey, {
          count: 1,
          domain: url.hostname,
          port,
          protocol,
        })
      }
    } catch {
      // Malformed URL — skip
    }
  }

  if (hostCounts.size === 0) {
    return { primaryDomain: '', primaryPort: '', primaryProtocol: '' }
  }

  // Find the most frequent host; break ties by first-encountered order
  let bestEntry = { count: 0, domain: '', port: '', protocol: '' }
  for (const entry of hostCounts.values()) {
    if (entry.count > bestEntry.count) {
      bestEntry = entry
    }
  }

  return {
    primaryDomain: bestEntry.domain,
    primaryPort: bestEntry.port,
    primaryProtocol: bestEntry.protocol,
  }
}
