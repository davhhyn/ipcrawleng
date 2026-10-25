import { describe, expect, it } from 'vitest'
import {
  EXPLORE_DEFAULT_PAGE_SIZE,
  EXPLORE_MAX_FILTER_VALUES,
  EXPLORE_MAX_PAGE_SIZE,
  parseExploreQuery,
  toFilterValues,
  toQueryInt
} from '#shared/explore'

describe('toFilterValues', () => {
  it('accepts repeated params and bracketed arrays', () => {
    expect(toFilterValues('a', ['b', 'c'], 'a')).toEqual(['a', 'b', 'c'])
  })

  it('drops empty and non-string entries', () => {
    expect(toFilterValues('', null, undefined, 3, ['', 'ok'])).toEqual(['ok'])
  })

  it('caps the number of filter values', () => {
    const many = Array.from({ length: EXPLORE_MAX_FILTER_VALUES + 25 }, (_, i) => `v${i}`)
    expect(toFilterValues(many)).toHaveLength(EXPLORE_MAX_FILTER_VALUES)
  })
})

describe('toQueryInt', () => {
  it('parses numeric strings', () => {
    expect(toQueryInt('12', 1)).toBe(12)
    expect(toQueryInt('12abc', 1)).toBe(12)
    expect(toQueryInt(7, 1)).toBe(7)
  })

  it('falls back on junk', () => {
    expect(toQueryInt('abc', 5)).toBe(5)
    expect(toQueryInt(undefined, 5)).toBe(5)
    expect(toQueryInt({}, 5)).toBe(5)
  })
})

describe('parseExploreQuery', () => {
  it('applies safe defaults', () => {
    expect(parseExploreQuery({})).toEqual({
      page: 1,
      pageSize: EXPLORE_DEFAULT_PAGE_SIZE,
      sort: 'recent',
      q: '',
      countries: [],
      cities: [],
      vendors: [],
      sources: [],
      kinds: [],
      status: 'any',
      favoritesOnly: false,
      ids: []
    })
  })

  it('clamps paging so a crafted URL cannot ask for the whole table', () => {
    expect(parseExploreQuery({ page: '0' }).page).toBe(1)
    expect(parseExploreQuery({ page: '-4' }).page).toBe(1)
    expect(parseExploreQuery({ pageSize: '100000' }).pageSize).toBe(EXPLORE_MAX_PAGE_SIZE)
    expect(parseExploreQuery({ pageSize: '0' }).pageSize).toBe(1)
  })

  it('whitelists sort and status values', () => {
    expect(parseExploreQuery({ sort: 'favorites' }).sort).toBe('favorites')
    expect(parseExploreQuery({ sort: '; DROP TABLE cams' }).sort).toBe('recent')
    expect(parseExploreQuery({ status: 'live' }).status).toBe('live')
    expect(parseExploreQuery({ status: 'deleted' }).status).toBe('any')
  })

  it('trims and bounds the search term', () => {
    expect(parseExploreQuery({ q: '  tokyo  ' }).q).toBe('tokyo')
    expect(parseExploreQuery({ q: 'x'.repeat(200) }).q).toHaveLength(80)
  })

  it('normalises repeated and bracketed filter params', () => {
    const query = parseExploreQuery({
      country: ['Italy', 'Japan'],
      'city[]': 'Tokyo',
      source: 'tfl,osm',
      kind: 'hls'
    })
    expect(query.countries).toEqual(['Italy', 'Japan'])
    expect(query.cities).toEqual(['Tokyo'])
    // Commas are not split — a literal value may contain one.
    expect(query.sources).toEqual(['tfl,osm'])
    expect(query.kinds).toEqual(['hls'])
  })

  it('reads the favorites flag in its documented spellings', () => {
    expect(parseExploreQuery({ fav: '1' }).favoritesOnly).toBe(true)
    expect(parseExploreQuery({ favorites: '1' }).favoritesOnly).toBe(true)
    expect(parseExploreQuery({ fav: 'true' }).favoritesOnly).toBe(true)
    expect(parseExploreQuery({ fav: '0' }).favoritesOnly).toBe(false)
  })
})
