import type { CamKind, CamStatus } from './explore'

export const KIND_LABELS: Record<CamKind, string> = {
  snapshot: 'Snapshot',
  mjpeg: 'MJPEG stream',
  hls: 'HLS stream',
  video: 'Video',
  iframe: 'Embedded page',
  page: 'Documented page',
  unknown: 'Unknown'
}

export const KIND_SHORT: Record<CamKind, string> = {
  snapshot: 'JPG',
  mjpeg: 'MJPEG',
  hls: 'HLS',
  video: 'VIDEO',
  iframe: 'IFRAME',
  page: 'PAGE',
  unknown: '—'
}

export const STATUS_LABELS: Record<CamStatus, string> = {
  live: 'Live / verified',
  offline: 'Offline',
  unknown: 'Unverified',
  page: 'Page only'
}

export const STATUS_SHORT: Record<CamStatus, string> = {
  live: 'LIVE',
  offline: 'OFFLINE',
  unknown: 'UNVERIFIED',
  page: 'PAGE'
}

export const STATUS_DESCRIPTION: Record<CamStatus, string> = {
  live: 'A frame was fetched from this camera during the last probe round.',
  offline: 'The last probe could not fetch a frame. The document may still exist.',
  unknown: 'Not probed yet. The location comes from public documentation, not a scan.',
  page: 'This entry links to a documented public camera page; no frame endpoint is published.'
}
