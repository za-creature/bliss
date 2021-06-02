import {assert} from 'chai'
import router, {reset, routes} from './router.mjs'
import asset, {unpack, base128_decode} from './assets.mjs'


let call = (path, headers={}, method='GET') => new Promise((res, rej) => router({
    request: new Request(`http://localhost${path}`, {headers, method}),
    respondWith: val => Promise.resolve(val).then(res, rej),
    waitUntil: val => val.catch(err => console.error(err.stack))
}))


describe('assets', () => {
    after(() => reset())
    describe('asset', () => {
        afterEach(() => {
            reset()
            caches.default.data.clear()
        })

        it('adds entries to the routing table', () => {
            assert.equal(routes.size, 0)
            asset('foo', 'bar')
            assert.equal(routes.size, 1)
            assert.isFunction(routes.get('foo').get('').get('*'))
        })

        it('mounts folders', async () => {
            asset('foo', {'bar': 'baz'})
            let res = await call('/foo/bar', {})
            assert.equal(res.status, 200)
            assert.equal(await res.text(), 'baz')
        })

        it('supports head', async () => {
            asset('', 'nonempty string')
            let res = await call('/', {}, 'HEAD')
            assert(res.status == 200)
            assert(await res.text() == '')
        })

        it('throws 405 on bad method', async () => {
            asset('', 'nonempty string')
            for(let method of ['PUT', 'POST', 'PATCH', 'DELETE'])
                assert((await call('/', {}, method)).status == 405)
        })

        it('sets default headers', async () => {
            asset('baz', 'qux')
            let res = await call('/baz', {})
            assert.equal(res.status, 200)
            assert.equal(res.headers.get('accept-ranges'), 'bytes')
            assert.equal(res.headers.get('content-type'), 'application/octet-stream')
            assert.equal(res.headers.get('content-disposition'), 'inline')
            assert.equal(res.headers.get('content-length'), '3')
        })

        it('sets custom content-type', async () => {
            asset('qux', 'hi', 'text/plain')
            let res = await call('/qux', {})
            assert.equal(res.status, 200)
            assert.equal(res.headers.get('accept-ranges'), 'bytes')
            assert.equal(res.headers.get('content-type'), 'text/plain')
            assert.equal(res.headers.get('content-disposition'), 'inline')
            assert.equal(await res.text(), 'hi')
        })

        it('sets custom and non-standard headers', async () => {
            asset('foo', Object.assign(new String('asd'), {'mimetype': 'text/plain'}), {
                'content-disposition': 'attachment; filename="test.txt"',
                'x-powered-by': 'bliss'
            })
            let res = await call('/foo', {})
            assert.equal(res.status, 200)
            assert.equal(res.headers.get('accept-ranges'), 'bytes')
            assert.equal(res.headers.get('content-type'), 'text/plain')
            assert.equal(res.headers.get('content-disposition'), 'attachment; filename="test.txt"')
            assert.equal(res.headers.get('x-powered-by'), 'bliss')
            assert.equal(await res.text(), 'asd')
        })

        it('rejects content-length and etag overrides', async () => {
            asset('bar', 'baz', {
                'content-length': '1234',
                'etag': 'some_random_string'
            })
            let res = await call('/bar', {})
            assert.equal(res.status, 200)
            assert.equal(res.headers.get('content-length'), '3')
            assert.notEqual(res.headers.get('etag'), 'some_random_string')
            assert.equal(await res.text(), 'baz')
        })

        it('supports promises', async () => {
            asset('foo', Promise.resolve('bar'), Promise.resolve('text/css'))
            let res = await call('/foo', {})
            assert.equal(res.status, 200)
            assert.equal(res.headers.get('content-type'), 'text/css')
            assert.equal(await res.text(), 'bar')
        })

        it('uses the mimtype property', async () => {
            let body = new String('hello world')
            body.mimetype = 'application/javascript'
            asset('foo', body)
            let res = await call('/foo', {})
            assert.equal(res.status, 200)
            assert.equal(res.headers.get('content-type'), 'application/javascript')
            assert.equal(await res.text(), 'hello world')
        })

        it.skip('supports content negotiation', async () => {
            let res = await call('/')
            assert.isFalse(res.headers.has('content-encoding'))
            assert.equal(res.headers.get('etag'), '"etag1234"')
            assert.equal(res.headers.get('content-length'), 11)
            assert.equal(await res.text(), 'hello world')

            res = await call('/', {'accept-encoding': 'br'})
            assert.equal(res.headers.get('content-encoding'), 'br')
            assert.equal(res.headers.get('etag'), '"etag1235"')
            assert.equal(res.headers.get('content-length'), 4)
            assert.equal(await res.text(), 'bruh')

            res = await call('/', {'accept-encoding': 'gzip'})
            assert.equal(res.headers.get('content-encoding'), 'gzip')
            assert.equal(res.headers.get('etag'), '"etag1236"')
            assert.equal(res.headers.get('content-length'), 7)
            assert.equal(await res.text(), 'gzipped')

            res = await call('/', {'accept-encoding': 'lzma'}, 'HEAD')
            assert.isFalse(res.headers.has('content-encoding'))

            res = await call('/', {'accept-encoding': 'lzma,\tbr,gzip'})
            assert.equal(res.headers.get('content-encoding'), 'gzip')

            res = await call('/', {'accept-encoding': 'lzma,br;q=2 ,gzip'})
            assert.equal(res.headers.get('content-encoding'), 'br')

            res = await call('/', {'accept-encoding': ' gzip=0.5\t, br'})
            assert.equal(res.headers.get('content-encoding'), 'br')
        })
    })


    describe('unpack', () => {
        it('supports utf8 encoding', async () => {
            let files = unpack('hello["text/plain",5,{"key.txt":1}]AAAe')
            assert.property(files, 'key.txt')
            let file = files['key.txt']
            assert.equal(file.mimetype, 'text/plain')
            assert.deepEqual(await file, Buffer.from('hello'))
        })

        it('supports 7 bit encoding', async () => {
            let files = unpack('@\x00["application/octet-stream",-2,{"key.bin":1}]AAAt')
            assert.property(files, 'key.bin')
            let file = files['key.bin']
            assert.equal(file.mimetype, 'application/octet-stream')
            assert.deepEqual(await file, Buffer.from([128]))
        })

        it('supports 0 length files', async () => {
            let files = unpack('["application/octet-stream",0,{"key.bin":1}]AAAs')
            assert.property(files, 'key.bin')
            let file = files['key.bin']
            assert.equal(file.mimetype, 'application/octet-stream')
            assert.deepEqual(await file, Buffer.alloc(0))
        })

        it('supports folders structures and RLE mimetypes', () => {
            let files = unpack(' @\x00@\x00["text/plain",1,"application/octet-stream",-2,2,{"usr":{"bin":{"bash":3,"ld":4},"etc":{"motd":1}}}]AABj')
            assert.equal(files['usr']['bin']['bash'].mimetype, 'application/octet-stream')
            assert.equal(files['usr']['bin']['ld'].mimetype, 'application/octet-stream')
            assert.equal(files['usr']['etc']['motd'].mimetype, 'text/plain')
        })

        it('globally exports BLISS_DATA', async () => {
            // defined in conftest because the es6 import cache seems to be immutable
            assert.deepEqual(await self.test_global_file_binding, Buffer.from(' '))
        })
    })


    describe('base128_decode', () => {
        let str = bytes => String.fromCharCode(...bytes)
        it('unrolled loop', () => {
            assert.equal(str(base128_decode('\x1E\x1A\fVc1^>')), '<hello>')
        })

        it('supports binary data', () => {
            assert.deepEqual(base128_decode('`\x00'), Buffer.from([192]))
        })

        it('handles padding', () => {
            assert.equal(str(base128_decode('4\x19-Fc<@w7\\MF ')), 'hello world')
        })

        it('sustained throughput (slow)', () => {
            let input = Buffer.alloc(800000).toString()
            let start = process.hrtime()
            let output = base128_decode(input)
            let [sec, nsec] = process.hrtime(start)
            let runtime = sec + nsec / 1e6
            assert.isBelow(runtime, 100)
            assert.equal(output.length, 700000) // make sure the call isn't optimized away
        })
    })
})
