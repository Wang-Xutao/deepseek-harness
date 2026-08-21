/**
 * Parse the web-app readiness line. The LAN suffix is ignored; the window
 * always loads the loopback URL.
 */
export function parseWebReadyUrl(line: string): string | undefined {
  const match = line.trim().match(/^dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
  return match?.[1]
}
