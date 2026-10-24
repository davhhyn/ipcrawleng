import type { FunChannel } from '#shared/fun'
import { apiExploreFramePath } from '#shared/routes'
import { rowToCard, type CamRow } from './camRow'

export function rowToFunChannel(row: CamRow, total: number): FunChannel {
  const card = rowToCard(row)
  return {
    id: card.id,
    title: card.title,
    frame: apiExploreFramePath(card.id),
    thumb: card.thumb,
    location: card.location,
    country: card.country,
    countryCode: card.countryCode,
    city: card.city,
    region: card.region,
    lat: card.lat,
    lon: card.lon,
    vendor: card.vendor,
    source: card.source,
    sourceLabel: card.sourceLabel,
    kind: card.kind,
    status: card.status,
    isLive: card.isLive,
    favCount: card.favCount,
    total
  }
}
