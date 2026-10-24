export default defineEventHandler((event) => {
  setHeader(event, 'x-content-type-options', 'nosniff')
  setHeader(event, 'referrer-policy', 'strict-origin-when-cross-origin')
  setHeader(event, 'x-dns-prefetch-control', 'off')
  setHeader(event, 'permissions-policy', 'camera=(), microphone=(), geolocation=()')
})
