import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
const svg = readFileSync(process.argv[2], 'utf8')
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
const png = resvg.render().asPng()
writeFileSync(process.argv[3], png)
console.log('rendered', png.length, 'bytes')
