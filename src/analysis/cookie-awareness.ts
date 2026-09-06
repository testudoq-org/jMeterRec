const MANAGED_COOKIE_PATTERN = /^(?:JSESSIONID|PHPSESSID|connect\.sid|sessionid|session_id)$/i

export function isManagedSessionCookie(name: string): boolean {
  const cookieName = name.split('=')[0]?.trim() ?? name
  return MANAGED_COOKIE_PATTERN.test(cookieName)
}

export function cookieManagerPenalty(_name: string): number {
  return -0.3
}
