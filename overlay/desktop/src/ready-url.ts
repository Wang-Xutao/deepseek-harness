/**
 * Parse the web-app readiness line. The LAN suffix is ignored; the window
 * always loads the loopback URL, including the auth token query when present.
 */
export function parseWebReadyUrl(line: string): string | undefined {
  const match = line.trim().match(
    /^dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/[^ \t]*)?)/,
  )
  return match?.[1]
}
