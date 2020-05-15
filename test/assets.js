import {assert} from 'chai'
import router, {routes} from '..'
import {utf8_encode} from '../util'
import asset, {static_assets} from '../util/assets'
import {base128_encode} from '../util/base128'


let call = (path, headers={}, method='GET') => new Promise((res, rej) => router({
    request: new Request(`http://localhost${path}`, {headers, method}),
    respondWith: val => Promise.resolve(val).then(res, rej)
}))


describe('assets', () => {
    after(() => routes.clear())
    describe('asset', () => {
        afterEach(() => {
            routes.clear()
            for(let key of static_assets.keys()) {
                delete self[`BLISS_ASSET_BINARY_${key}`]
                delete self[`BLISS_ASSET_${key}`]
            }
            delete self['BLISS_ASSET_ETAGS']
            static_assets.clear()
            caches.default.data.clear()
        })

        it('adds entries to the routing table', () => {
            assert(routes.size == 0)
            asset('foo')
            assert(routes.size == 1)
            assert(typeof routes.get('assets').get('foo').get('').get('*') == 'function')
        })

        it('uses the configured prefix', async () => {
            assert(asset.prefix == '/assets/')
            asset.prefix = '/'
            try {
                await asset('foo')
                assert(typeof routes.get('foo').get('').get('*') == 'function')
            } finally {
                asset.prefix = '/assets/'
            }
        })

        it('uses the prefix dir for files', async () => {
            let key = await asset('foo')
            assert(static_assets.get(key) == 'assets/foo')
            asset.source = ''
            try {
                key = await asset('bar')
                assert(static_assets.get(key) == 'bar')
            } finally {
                delete asset.source
            }
        })

        it('supports binding to custom paths', () => {
            asset('foo', null, '/assets/bar')
            assert(typeof routes.get('assets').get('bar').get('').get('*') == 'function')
        })

        it.skip('supports variants', async () => {
            let key = await asset('foo', {gzip: 'bar'})
            assert(static_assets.get(key) == 'assets/foo')
            assert(static_assets.get(`${key}gzip`) == 'assets/bar')
        })

        it('performs base128 decoding and caches the result', async () => {
            let data = utf8_encode('hello world')
            let key = await asset('test')
            self['BLISS_ASSET_ETAGS'] = {[key]: '"tag"'}
            self[`BLISS_ASSET_${key}`] = String.fromCharCode(...base128_encode(data))
            let result = await call('/assets/test')
            assert(self[`BLISS_ASSET_BINARY_${key}`].length == data.length)
            assert(data.every((v, i) => v == self[`BLISS_ASSET_BINARY_${key}`][i]))
            assert(await result.text() == 'hello world')
        })

        it('ignores encoded version when already cached', async () => {
            let key = await asset('test')
            self[`BLISS_ASSET_${key}`] = String.fromCharCode(...base128_encode('nope'))
            self['BLISS_ASSET_ETAGS'] = {[key]: '"some_etag"'}
            let data = self[`BLISS_ASSET_BINARY_${key}`] = utf8_encode('hello world')
            let response = await call('/assets/test')
            assert(self[`BLISS_ASSET_BINARY_${key}`] == data)
            assert(await response.text() == 'hello world')
        })
    })

    describe('serve', () => {
        before(async () => {
            asset.prefix = '/'
            let key = await asset('test', {
                'content-type': 'not/mime',
                'content-disposition': 'attachment; filename=hi.txt'
            }, /*{
                'gzip': 'test1',
                'br': 'test2'
            },*/ '')
            self[`BLISS_ASSET_BINARY_${key}`] = utf8_encode('hello world')
            self['BLISS_ASSET_ETAGS'] = {[key]: '"etag1234"'}
            //self[`BLISS_ASSET_BINARY_${key}br`] = utf8_encode('bruh')
            //self[`BLISS_ASSET_ETAG_${key}br`] = 'etag1235'
            //self[`BLISS_ASSET_BINARY_${key}gzip`] = utf8_encode('gzipped')
            //self[`BLISS_ASSET_ETAG_${key}gzip`] = 'etag1236'
        })

        it('supports get', async () => {
            let res = await call('/', {})
            assert(res.status == 200)
            assert(await res.text() == 'hello world')
        })

        it('supports head', async () => {
            let res = await call('/', {}, 'HEAD')
            assert(res.status == 200)
            assert(await res.text() == '')
        })

        it('throws 405 on bad method', async () => {
            assert((await call('/', {}, 'POST')).status == 405)
        })

        it('sets default headers', async () => {
            let key = await asset('default')
            self[`BLISS_ASSET_BINARY_${key}`] = utf8_encode('test')
            self['BLISS_ASSET_ETAGS'][key] = '"etag"'
            let {headers} = await call('/default')
            assert(headers.get('content-type') == 'application/octet-stream')
            assert(headers.get('content-disposition') == 'inline')
            assert(headers.get('cache-control').startsWith('public'))
        })

        it('sets custom headers', async () => {
            let {headers} = await call('/')
            assert(headers.get('content-type') == 'not/mime')
            assert(headers.get('content-length') == 11)
            assert(headers.get('content-disposition') == 'attachment; filename=hi.txt')
            assert(headers.get('etag') == '"etag1234"')
        })

        it('supports custom headers', async () => {
            let old = asset.headers.get('cache-control')
            asset.headers.set('cache-control', 'no-store')
            asset.headers.set('x-foo', 'bar')
            try {
                let key = await asset('custom')
                self[`BLISS_ASSET_BINARY_${key}`] = 'foo'
                self['BLISS_ASSET_ETAGS'] = {[key]: '"a"'}
                let {headers} = await call('/custom')
                assert(headers.get('cache-control') == 'no-store')
                assert(headers.get('x-foo') == 'bar')
            } finally {
                asset.headers.set('cache-control', old)
                asset.headers.delete('x-foo')
            }
        })

        it.skip('supports content negotiation', async () => {
            let res = await call('/')
            assert(!res.headers.has('content-encoding'))
            assert(res.headers.get('etag') == '"etag1234"')
            assert(res.headers.get('content-length') == 11)
            assert(await res.text() == 'hello world')

            res = await call('/', {'accept-encoding': 'br'})
            assert(res.headers.get('content-encoding') == 'br')
            assert(res.headers.get('etag') == '"etag1235"')
            assert(res.headers.get('content-length') == 4)
            assert(await res.text() == 'bruh')

            res = await call('/', {'accept-encoding': 'gzip'})
            assert(res.headers.get('content-encoding') == 'gzip')
            assert(res.headers.get('etag') == '"etag1236"')
            assert(res.headers.get('content-length') == 7)
            assert(await res.text() == 'gzipped')

            assert(!(await call('/', {'accept-encoding': 'lzma'}, 'HEAD'))
                   .headers.has('content-encoding'))
            assert((await call('/', {'accept-encoding': 'lzma,\tbr,gzip'}))
                   .headers.get('content-encoding') == 'gzip')
            assert((await call('/', {'accept-encoding': 'lzma,br;q=2 ,gzip'}))
                   .headers.get('content-encoding') == 'br')
            assert((await call('/', {'accept-encoding': ' gzip=0.5\t, br'}))
                   .headers.get('content-encoding') == 'br')
        })

        it('supports caching', async () => {
            let res = await call('/', {'if-none-match': '"etag1234"'})
            assert(res.status == 304)
            assert(await res.text() == '')

            assert((await call('/', {'if-none-match': '"blah"'})).status == 200)
            assert((await call('/', {'if-none-match': '"etag", "etag1234"\t, wat'}))
                   .status == 304)
        })

        it('supports resumable downloads', async () => {
            assert((await call('/', {'range': 'qubits=1024'})).status == 200)

            let res = await call('/', {'range': 'bytes=6-'})
            assert(res.status == 206)
            assert(res.headers.get('content-length') == 5)
            assert(res.headers.get('content-range') == 'bytes 6-10/11')
            assert(await res.text() == 'world')

            res = await call('/', {'range': 'bytes=-5'})
            assert(res.status == 206)
            assert(res.headers.get('content-length') == 5)
            assert(res.headers.get('content-range') == 'bytes 6-10/11')
            assert(await res.text() == 'world')

            res = await call('/', {'range': 'bytes=3-7'})
            assert(res.status == 206)
            assert(res.headers.get('content-length') == 5)
            assert(res.headers.get('content-range') == 'bytes 3-7/11')
            assert(await res.text() == 'lo wo')

            res = await call('/', {'range': 'bytes=20-30'})
            assert(res.status == 416)
            assert(res.headers.get('content-length') == 11)
            assert(res.headers.get('content-range') == 'bytes */11')
            assert(await res.text() == '')

            assert((await call('/', {'if-range': '"foo"',
                                     'range': 'bytes=0-4'})).status == 200)
            assert((await call('/', {'if-range': '"foo", bar',
                                     'range': 'bytes=0-4'})).status == 200)
            assert((await call('/', {'if-range': '"etag1234"',
                                     'range': 'bytes=0-4'})).status == 206)

            // only first range
            res = await call('/', {'range': 'bytes=0-4,-5'})
            assert(res.status == 206)
            assert(res.headers.get('content-length') == 5)
            assert(res.headers.get('content-range') == 'bytes 0-4/11')
            assert(await res.text() == 'hello')
        })
    })
})
