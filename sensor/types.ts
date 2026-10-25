/**
 * Local sensor — shared types.
 *
 * A "detection" is one camera-like service the sensor observed. It is
 * deliberately close to, but not identical with, `RawCam`: detections carry
 * evidence (open ports, protocol hints, auth challenges) that never gets
 * published to the catalogue verbatim.
 */

export type DetectionKind =
  | 'snapshot'
  | 'mjpeg'
  | 'hls'
  | 'video'
  | 'iframe'
  | 'page'
  | 'unknown'

export type DetectionProtocol = 'http' | 'https' | 'rtsp' | 'tcp'

export interface DetectionEvidence {
  /** Ports that answered a TCP connect. */
  openPorts: number[]
  /** Protocol family that produced the frame/document URL. */
  protocol: DetectionProtocol | null
  /** HTTP status of the winning request, when applicable. */
  httpStatus: number | null
  /** `Server:` header, trimmed. */
  server: string | null
  /** `WWW-Authenticate` realm — cameras often announce themselves here. */
  realm: string | null
  /** `<title>` of the HTTP response, if it had one. */
  title: string | null
  /** RTSP `Public:` methods, when the service spoke RTSP. */
  rtspMethods: string[] | null
  /** A response required authentication. We never attempt credentials. */
  authRequired: boolean
  /** Path that produced the best evidence. */
  sourcePath: string | null
}

export interface Detection {
  /** IP address or hostname, exactly as scanned. */
  host: string
  port: number
  protocol: DetectionProtocol
  kind: DetectionKind
  /** Strongest URL we can hand to the catalogue (may be null for bare RTSP). */
  url: string | null
  /** Free-text label built from evidence. */
  title: string
  /** Hints the server-side normalizer turns into a vendor. */
  vendorHints: string[]
  evidence: DetectionEvidence
  /** Milliseconds the winning probe took. */
  latencyMs: number
}

export interface ScanTarget {
  host: string
  ports: number[]
}

export interface ScanOptions {
  targets: string[]
  ports: number[]
  timeoutMs?: number
  concurrency?: number
  /** Hard cap on addresses expanded from the target list. */
  maxHosts?: number
  budgetMs?: number
  /** Called for each detection as it lands. */
  onDetection?: (detection: Detection) => void
  /** Progress hook for the CLI. */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

export interface ScanSummary {
  hosts: number
  ports: number
  attempts: number
  openPorts: number
  detections: Detection[]
  durationMs: number
  /** Set when the scan stopped early (budget, abort, cap). */
  truncated: boolean
}
