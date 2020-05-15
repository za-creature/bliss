import {route, response} from '..'
import {hex, sha256} from '../util'
import {base128_decode} from './base128'

export let static_assets = new Map()
export default function asset(filename, headers={}, /*variants=null,*/ path=null) {
    if(typeof headers == 'string')
        headers = {'content-type': headers}

    let prefix = asset.source === null || typeof asset.source != 'undefined'
        ? asset.source
        : asset.prefix.slice(1)

    headers = new Headers(headers)
    for(let [key, value] of asset.headers.entries())
        if(!headers.has(key))
            headers.set(key, value)

    if(typeof path != 'string')
        path = asset.prefix + filename
    let setup = sha256(path).then(hash => {
        let offset = hex(hash).slice(0, 8)
        static_assets.set(offset, prefix + filename)
        /*if(variants && Object.keys(variants).length)
            for(let encoding in variants)
                static_assets.set(offset + encoding, prefix + variants[encoding])
        else
            variants = null*/
        return offset
    })

    route('*', path, async function(req, method) {
        let offset = await setup
        // content negotiation - disabled because CF overwrites pretty much 
        // everything here:
        // the 'accept-encoding' request header is hardcoded to gzip regardless
        // of what the client sends
        // the 'content-encoding' response header might be overwritten to 'br'
        // without decoding first, causing a brotli-encoded gzip file to be
        // served to the browser that was expecting uncompressed content
        /*if(variants) {
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
                offset += best
            }
        }*/

        // unpack and cache binary asset body (technically pack, but w/e)
        let body = self[`BLISS_ASSET_BINARY_${offset}`]
        if(!body)
            body = self[`BLISS_ASSET_BINARY_${offset}`] =
                   base128_decode(self[`BLISS_ASSET_${offset}`])
        headers.set('content-length', body.length)

        // unpack etags
        let etags = self['BLISS_ASSET_ETAGS']
        if(typeof etags != 'object')
            etags = self['BLISS_ASSET_ETAGS'] = JSON.parse(etags)
        headers.set('etag', etags[offset])
        headers.set('last-modified', etags['deployed'])
 
        if(method == 'head')
            return response(null, 200, headers)
        else if(method != 'get')
            return response('method not allowed', 405)

        // directly sending a large response triggers transfer buffering and
        // rewrites headers (also switches to chunked transfer when http-1.1),
        // but the cache api supports range requests so return that if
        // possible, even though it will delay the response
        let res, cache = caches.default
        req = new Request(this, {'headers': req.headers})
        if(res = await cache.match(req))
            return res
        res = response(body, 200, headers)
        await cache.put(req, res)
        return (await cache.match(req)) || res
    })
    return setup
}
asset.headers = new Headers({
    'accept-ranges': 'bytes',
    'cache-control': 'public,max-age=120',
    'content-type': 'application/octet-stream',
    'content-disposition': 'inline'
})
asset.prefix = '/assets/'
