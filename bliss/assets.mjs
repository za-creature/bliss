import {route, response} from './router.mjs'
import {bytes, hex_encode, identity, is_number, is_plain_object, is_string,
        json_decode, sha256, utf8_encode} from './util.mjs'
import LazyPromise from './util/lazy.mjs'


export default function asset(path, data, headers=null/*, variants=null,*/) {
    if(is_plain_object(data)) {
        for(let key in data)
            asset(path + '/' + key, data[key], headers)
        return
    }
    let hash

    /*
    if(is_plain_object(variants) && !is_empty_object(variants))
        for(let encoding in variants)
            variants[encoding] = Promise.resolve(variants[encoding])
    else
        variants = null
    */
    route('*', path, async function(req, method) {
        if(!hash) {
            headers = await headers
            if(is_string(headers))
                headers = {'content-type': headers}
            headers = new Headers(headers || {})
            if(data.mimetype && !headers.has('content-type'))
                headers.set('content-type', data.mimetype)
            for(let [key, value] of asset.headers.entries())
                if(!headers.has(key))
                    headers.set(key, value)

            data = await data
            data = bytes(data)
            hash = hex_encode(await sha256(data))

            headers.set('content-length', data.byteLength)
            headers.set('etag', hash)
        }
        /*
        // content negotiation - disabled because CF overwrites pretty much
        // everything here:
        // the 'accept-encoding' request header is hardcoded to gzip regardless
        // of what the client sends [bad]
        // the 'content-encoding' response header might be overwritten to 'br'
        // without decoding first, causing a brotli-encoded gzip file to be
        // served to the browser that was expecting uncompressed content [worse]
        //
        // alternatives:
        // * images, video and audio already support better compression when
        //   used correctly:
        //   * https://github.com/google/zopfli/blob/master/README.zopflipng
        //   * https://github.com/mozilla/mozjpeg
        //   * https://ffmpeg.org/
        // * for fonts, use woff (gzip) & woff2 (brotli):
        //   * https://github.com/bramstein/sfnt2woff-zopfli
        //   * https://github.com/google/woff2
        //   for even better compression, subset your fonts to only include the
             characters you need: https://github.com/fonttools/fonttools (this
             comes with brotli and zopfli compression builtin)
        // * ~~for svg files, gzip and change extension to .svgz~~: NO LONGER WORKS
        //   https://github.com/google/zopfli
        // * for other text, cloudflare usually compresses everything below a
        //   certain size when serving from their cache, and it's very likely
        //   that said threshold increases with hits so you probably don't need
        //   to handle this at all

        let body = data
        let etag = hash
        if(variants) {
            headers.set('vary', 'accept-encoding')
            let best = null, best_qual = 0
            let accepted = req.headers.has('accept-encoding')
                ? req.headers.get('accept-encoding').split(',').map(s => s.trim())
                : []
            for(let encoding of accepted) {
                let pos, qual = 1.0
                if(~(pos = encoding.lastIndexOf(';q='))) {
                    qual = parseFloat(encoding.slice(pos + 3)) || 1.0
                    encoding = encoding.slice(0, pos)
                }
                if(encoding in variants && qual >= best_qual) {
                    best = encoding
                    best_qual = qual
                }
            }
            if(best) {
                headers.set('content-encoding', best)
                let val = variants[best]
                if(is_promise(val)) {
                    val = await val
                    let hash = sha256(val).then(hex)
                    val = variants[best] = [val, hash]
                }
                [body, etag] = val
            }
        }
        */
        if(method == 'head')
            return response(null, 200, headers)
        else if(method != 'get')
            return response('method not allowed', 405)

        // normalize request and query cache
        let cache = caches.default
        this.search = this.hash = ''
        req = new Request(this.href, {'headers': req.headers})

        return await cache.match(req) || ( // cache miss
            // add to cache
            (req.enqueue || identity)(cache.put(req, response(data, headers))),
            // return cloned response (cache will consume response body)
            response(data, headers)
        )
    })
}
asset.headers = new Headers({
    'accept-ranges': 'bytes',
    'cache-control': 'public,max-age=7200',
    'content-type': 'application/octet-stream',
    'content-disposition': 'inline'
    // 'last-modified': Date.now()
})


/*Bliss ARchive unpacker; packer is defined in cli/bar, used by cli/bundler*/
export function unpack(data, patch={}) {
    // read meta length
    let char = ''.charCodeAt.bind(atob(data.slice(-4)))
    let len = char(0)<<16 | char(1)<<8 | char(2)

    // unpack meta
    let meta = json_decode(data.slice(-len-4, -4))
    let [root] = meta.splice(-1)
    let bin = false, mime = null, offset = 0
    meta = meta.map(len => {
        if(is_number(len)) {
            if(len < 0)
                bin = true, len = -len
            return [bin, mime, offset, offset += len]
        }
        mime = len
    })

    // unpack tree
    let unpack = (obj, dest) => {
        let key, val
        for(key in obj)
            if(is_number(val = obj[key])) {
                let [bin, mime, start, end] = meta[val]
                dest[key] = new LazyPromise(res => res(
                    bin ? base128_decode(data, start, end)
                        : utf8_encode(data.slice(start, end))))
                dest[key].mimetype = mime
            } else unpack(val, dest[key] = {})
    }
    unpack(root, patch)
    return patch
}
let key = 'BLISS_DATA'
if(self[key]) {
    unpack(self[key], self)
    delete self[key]
}


export function base128_decode(text, s=0, e=text.length) {
    /*
    I did a couple of iterations on this, experimenting with:
    * Binding text.charCodeAt to a local function
      [much slower]
    * Using text.codePointAt instead of charCodeAt
      [slower]
    * Updating the first 3 shorts with DataView.setUint16 (Uint32 is promoted
      to a float so that would have been even slower than the trivial decoder)
      [much slower]
    * Different buffer flushing strategies with precomputed constants
      [mixed results depending on V8 version]

    On my machine (Intel 8700-3.2GHz, DDR4-3GHz, Darwin 19.2), the benchmark is:
    |  Output  |    V8   |  Runtime  |  Runtime  |  Throughput  |  Throughput  |
    |   Size   | version |  (worst)  |   (avg)   |    (worst)   |     (avg)    |
    |---------:|--------:|----------:|----------:|-------------:|-------------:|
    |   24 KB  |  6.2.4  |  2.86 ms  |  0.19 ms  |     8 KB/ms  |   123 KB/ms  |
    |   24 KB  |  6.8.2  |  1.93 ms  |  0.10 ms  |    12 KB/ms  |   219 KB/ms  |
    |   24 KB  |  7.8.2  |  4.07 ms  |  0.17 ms  |     5 KB/ms  |   135 KB/ms  |
    |   24 KB  |  8.4.3  |  4.39 ms  |  0.17 ms  |     5 KB/ms  |   134 KB/ms  |
    |  192 KB  |  6.2.4  |  4.39 ms  |  1.24 ms  |    43 KB/ms  |   154 KB/ms  |
    |  192 KB  |  6.8.2  |  4.52 ms  |  0.53 ms  |    42 KB/ms  |   359 KB/ms  |
    |  192 KB  |  7.8.2  |  5.80 ms  |  0.62 ms  |    33 KB/ms  |   307 KB/ms  |
    |  192 KB  |  8.4.3  |  6.47 ms  |  0.63 ms  |    29 KB/ms  |   301 KB/ms  |
    |  512 KB  |  6.2.4  |  6.54 ms  |  3.24 ms  |    78 KB/ms  |   157 KB/ms  |
    |  512 KB  |  6.8.2  |  5.35 ms  |  1.34 ms  |    95 KB/ms  |   379 KB/ms  |
    |  512 KB  |  7.8.2  |  6.60 ms  |  1.43 ms  |    77 KB/ms  |   357 KB/ms  |
    |  512 KB  |  8.4.3  |  6.93 ms  |  1.39 ms  |    73 KB/ms  |   367 KB/ms  |
    |  896 KB  |  6.2.4  |  9.04 ms  |  5.50 ms  |    99 KB/ms  |   162 KB/ms  |
    |  896 KB  |  6.8.2  |  6.28 ms  |  2.39 ms  |   142 KB/ms  |   374 KB/ms  |
    |  896 KB  |  7.8.2  |  6.43 ms  |  2.18 ms  |   139 KB/ms  |   410 KB/ms  |
    |  896 KB  |  8.4.3  |  6.77 ms  |  2.45 ms  |   132 KB/ms  |   364 KB/ms  |

    Unfortunately, it's not possible to remotely measure performance because
    CF disables Date.now() for security reasons and at max 10ms per invocation,
    you're basically measuring network latency.

    Assuming the worst case throughput (usually the first time the function is
    called before the JIT has had a chance to optimize) and assuming that
    cloudflare runs older machines which can only sustain half of what my local
    box does on a old version of V8, it should only be possible to reliably
    crunch through about 200KiB in one 10ms request. To work around this,
    `bliss` only calls this function on demand (e.g. when an individual
    resource must be served) and caches its output however, this is a band-aid:
    if you are serving larger resources, your mileage may vary depending on the
    validity of the above assumptions.
    */
    let e_s = e - s
    let data = new Uint8Array(7*e_s>>3)
    let d = 0, b = 0, bs = 0

    // decode blocks of 8 characters into 7 bytes
    let l = s + e_s>>3<<3
    while(s < l) {
        b = b<<7|text.charCodeAt(s)
        b = b<<7|text.charCodeAt(s+1)
        // `data[d] = b >> 6` here instead is faster on node 14...
        b = b<<7|text.charCodeAt(s+2)
        data[d] = b >> 13 // ... but slower for previous versions
        data[d+1] = b >> 5 & 255
        b &= 31
        b = b<<7|text.charCodeAt(s+3)
        b = b<<7|text.charCodeAt(s+4)
        data[d+2] = b >> 11
        data[d+3] = b >> 3 & 255
        b &= 7
        b = b<<7|text.charCodeAt(s+5)
        b = b<<7|text.charCodeAt(s+6)
        // `data[d+4] = b >> 9` here instead is faster on node 14...
        b = b<<7|text.charCodeAt(s+7)
        data[d+4] = b >> 16 // ... but slower for previous versions
        data[d+5] = b >> 8 & 255
        data[d+6] = b & 255

        // xoring this to itself is slightly faster than setting it to 0 and
        // for some reason the JIT likes the `b<<7|charCodeAt(s)` pattern
        b ^= b

        // this reduces data dependencies which gives the JIT more leeway
        // without increasing overall ADD count, and makes the code friendlier
        // towards the cache as it converts a read + write into a read + read
        d += 7
        // furthermore, on some architectures (e.g. x86), the second read is
        // free as it can be encoded in the instruction itself (LEA address +
        // offset * stride), which is stored in the instruction cache
        s += 8
    }

    // decode the last at-most 7 characters (i.e. trivial decoder)
    while(s < e) {
        b = b<<7|text.charCodeAt(s++)
        bs += 7
        if(bs>=8) {
            bs -= 8
            data[d++] = b >> bs
            b &= (1<<bs)-1
        }
    }
    if(bs)
        data[d] = b << (8-bs)
    return data
}
