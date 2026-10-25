/**
 * Ports worth checking on a camera network.
 *
 * Deliberately small: this is an inventory tool for networks you control, not a
 * mass port scanner. Anything outside this list needs `--ports`.
 */

export interface PortHint {
  port: number
  label: string
  family: 'http' | 'https' | 'rtsp' | 'other'
}

export const CAMERA_PORTS: PortHint[] = [
  { port: 80, label: 'HTTP', family: 'http' },
  { port: 443, label: 'HTTPS', family: 'https' },
  { port: 554, label: 'RTSP', family: 'rtsp' },
  { port: 8554, label: 'RTSP (alt)', family: 'rtsp' },
  { port: 8080, label: 'HTTP (alt)', family: 'http' },
  { port: 8081, label: 'HTTP (alt)', family: 'http' },
  { port: 8000, label: 'HTTP (alt)', family: 'http' },
  { port: 8443, label: 'HTTPS (alt)', family: 'https' },
  { port: 8888, label: 'HTTP (alt)', family: 'http' },
  { port: 1935, label: 'RTMP', family: 'other' }
]

export const DEFAULT_PORTS: number[] = CAMERA_PORTS.map(hint => hint.port)

export const MAX_PORTS = 32

/** Parse and validate a `--ports` value like `80,554,8080`. */
export function parsePortList(value: string): number[] {
  const parts = value
    .split(/[\s,;]+/)
    .map(part => part.trim())
    .filter(Boolean)

  if (!parts.length) throw new Error('No ports given')

  const ports = parts.map((part) => {
    if (!/^\d{1,5}$/.test(part)) throw new Error(`"${part}" is not a port number`)
    const port = Number(part)
    if (port < 1 || port > 65535) throw new Error(`Port ${port} is out of range`)
    return port
  })

  const unique = [...new Set(ports)]
  if (unique.length > MAX_PORTS) {
    throw new Error(`${unique.length} ports requested, above the ${MAX_PORTS} limit`)
  }
  return unique.sort((a, b) => a - b)
}

export function portHint(port: number): PortHint['family'] {
  return CAMERA_PORTS.find(hint => hint.port === port)?.family ?? 'other'
}
