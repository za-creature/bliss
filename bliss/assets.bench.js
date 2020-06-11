/* global crypto */
Object.assign(global, require('cf-emu/runtime'))
let {base128_encode} = require('./cli/bar.js')
let {base128_decode} = require('./assets.mjs')


let [size, iter] = process.argv.slice(2).map(Number)
let sum = 0, max = -Infinity
for(let i=0; i<iter; i++) {
    let input = crypto.getRandomValues(new Uint8Array(size<<10))
    let archive = Buffer.from(base128_encode(input), 'ascii').toString()

    let start = process.hrtime()
    let output = base128_decode(archive)
    let runtime = process.hrtime(start)
    let run = runtime[0] * 1e5 + runtime[1] / 1e4
    sum += run
    max = Math.max(max, run)

    if(input.length != output.length)
        throw new Error('length mismatch')
    for(let i=0; i<input.length; i++)
        if(input[i] != output[i])
            throw new Error('mismatch at index ' + i)
}
max = Math.ceil(max)

console.log('|  %d KB  |  %s  |  %d ms  |  %d ms  |   %d KB/ms  |   %d KB/ms  |',
            size,
            process.versions.v8.substring(0, 5),
            (max|0) / 1e2,
            (sum / iter|0) / 1e2,
            1e2 * size / max|0,
            1e2 * iter * size / sum|0)
