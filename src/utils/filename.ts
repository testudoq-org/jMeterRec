export function safeFilename(value: string, fallback = 'Untitled-Plan'): string {
  const filename = value.trim().replace(/[^a-z0-9._-]+/gi, '-')

  return filename.length > 0 ? filename : fallback
}
