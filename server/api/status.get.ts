import { readCatalogStatus } from '~~/server/utils/catalogStore'

export default defineEventHandler(() => readCatalogStatus())
