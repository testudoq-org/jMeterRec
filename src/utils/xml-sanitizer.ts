/**
 * XML character sanitization utilities.
 *
 * The implementation is stricter than XML 1.0 because strict validators
 * like BlazeMeter also reject characters that XML 1.0 technically allows:
 *   - DEL (0x7F)
 *   - C1 controls (0x80-0x9F)
 *
 * Stripping rather than replacing preserves payload length predictability
 * and avoids inserting replacement characters that could alter protocol semantics.
 */

/**
 * Removes characters that are illegal in XML 1.0 and additionally strips
 * DEL and C1 controls so generated JMX passes strict validators like BlazeMeter.
 *
 * This is the shared boundary sanitizer used by the capture pipeline,
 * HAR import, and JMX serializer to guarantee that no illegal code points
 * escape into generated XML.
 */
export function sanitizeForXml(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
}
