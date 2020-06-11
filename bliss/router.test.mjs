import {assert} from 'chai'
import router, {
    route, use, routes, reset,
    response, redirect, json, render,
    head, get, post, put, del, patch
} from './router.mjs'
import {raise, sleep, is_empty_object, json_decode} from './util.mjs'


let call = (path, method='GET') => new Promise((res) => router({
    request: new Request(`http://localhost${path}`, {method}),
    respondWith: res,
    waitUntil: val => void val.catch(err => console.error(err.stack))
}))


describe('bliss', () => {
    beforeEach(reset)
    describe('route', () => {
        it('adds entries to the routing table', () => {
            assert(routes.size == 0)
            route('GET', '/', () => {})
            assert.equal(routes.size, 1)
        })

        it('throws on duplicate route', () => {
            route('GET', '/', () => {})
            assert.throws(route.bind(null, 'GET', '/', () => {}), 'duplicate')
        })

        it('routes and forwards response', async () => {
            route('GET', '/foo', () => 'hello world')
            assert.equal(await call('/foo'), 'hello world')
        })

        it('supports promises', async () => {
            route('GET', '/foo', async () => 'hello world')
            assert.equal(await call('/foo'), 'hello world')
        })

        it('logs exceptions', async () => {
            let old_err = console.error
            try {
                let error
                console.error = e => error = e
                route('GET', '/foo', async () => raise('oops'))

                let response = await call('/foo')
                assert(!response.ok)
                assert.equal(response.body, 'internal error')
                assert.include(error.toString(), 'Error: oops')
            } finally {
                console.error = old_err
            }
        })

        it('favors nested paths', async () => {
            route('GET', '/foo', () => 'nope')
            route('GET', '/foo/bar', () => 'ok')
            assert.equal(await call('/foo/bar'), 'ok')
        })

        it('supports url parameters', async () => {
            let ctx
            route('GET', '/route', async function() {
                ctx = this
                return 'ok'
            })
            assert.equal(await call('/route?foo=bar'), 'ok')
            assert.instanceOf(ctx, URL)
            assert.equal(ctx.searchParams.get('foo'), 'bar')
        })

        it('is invariant to trailing separator', async () => {
            route('GET', '/foo', () => 'first')
            route('GET', '/bar/', () => 'second')
            assert.equal(await call('/foo/'), 'first')
            assert.equal(await call('/foo'), 'first')
            assert.equal(await call('/bar'), 'second')
            assert.equal(await call('/bar/'), 'second')
        })

        it('supports wildcard paths', async () => {
            let path
            route('GET', '/*', (req, arg) => ((path = arg), 'first'))
            route('GET', '/foo', () => 'second')
            assert.equal(await call('/foo'), 'second')
            assert.equal(await call('/bar'), 'first')
            assert(path == 'bar')
        })

        it('supports nested wildcards', async () => {
            let user
            route('GET', '/users/*/about', (req, arg) => ((user = arg), 'about'))
            route('GET', '/users/*/friends', (req, arg) => ((user = arg), 'friends'))
            route('GET', '/users/*', (req, arg) => ((user = arg), 'profile'))
            assert.equal(await call('/users/alice'), 'profile')
            assert.equal(user, 'alice')
            assert.equal(await call('/users/bob/about'), 'about')
            assert.equal(user, 'bob')
            assert.equal(await call('/users/eve/friends'), 'friends')
            assert.equal(user, 'eve')
        })

        it('throws on duplicate route', () => {
            route('GET', '/', () => '')
            assert.throws(route.bind(null, 'GET', '/', () => ''), 'duplicate')
        })

        it('returns 404', async () => {
            route('GET', '/', () => '')
            let res = await call('/foo')
            assert.equal(res.status, 404)
        })

        it('supports custom 404 handlers', async () => {
            route((req) => {
                assert.equal(req.url, 'http://localhost/nomatch')
                return 'custom'
            })
            assert.equal(await call('/nomatch'), 'custom')
        })

        it('supports custom 500 handlers', async () => {
            route('GET', '/', async () => 'okay')
            route('GET', '/bad', async () => raise('bad'))
            route((req, err) => {
                assert.equal(err.message, 'bad')
                return 'custom error'
            })
            assert.equal(await call('/'), 'okay')
            assert.equal(await call('/bad'), 'custom error')
        })
    })


    describe('use', () => {
        it('registers a middleware handler', async () => {
            get('/', () => 'bar')
            assert.equal(await call('/'), 'bar')
            use(() => 'foo')
            assert.equal(await call('/'), 'foo')
        })

        it('calls handlers in registration order', async () => {
            use(async next => 'foo' + await next())
            use(async next => 'bar' + await next())
            get('/', () => 'baz')
            assert.equal(await call('/'), 'foobarbaz')
        })

        it('invokes handlers in the request / url context', async () => {
            let ctx
            use(function(next) {
                ctx = this
                return next.call({}, 1234)
            })
            use(function(next, arg) {
                assert.strictEqual(ctx, this)
                assert.equal(arg, 1234)
                return next.call({}, 'test')
            })
            get('/', function(req) {
                assert.instanceOf(this, URL)
                assert.instanceOf(req, Request)
                assert.strictEqual(ctx, req)
                return 'foo'
            })
            assert.equal(await call('/'), 'foo')
        })

        it('calls finalizers outside the request flow', async () => {
            let ctx
            let called = ''
            route('get', '/', req => ((ctx = req), 'foo'))
            use(null, async function(next) {
                called += '1in '
                assert.strictEqual(ctx, this)
                called += '1sleep '
                await sleep(5)
                called += '1wakeup '
                await next.call({})
                called += '1out '
            })
            use(null, async function(next) {
                called += '2in '
                assert.strictEqual(ctx, this)
                called += '2sleep '
                await sleep(5)
                called += '2wakeup '
                await next()
                called += '2out '
            })
            assert.equal(await call('/'), 'foo')
            assert.equal(called, '1in 1sleep ')
            await sleep(20)
            assert.equal(called, '1in 1sleep 1wakeup 2in 2sleep 2wakeup 2out 1out ')
        })

        it('ignores finalizer errors', async () => {
            get('/', () => 'bar')
            use(async next => 'foo' + await next(), () => raise('bad cleanup'))
            assert.equal(await call('/'), 'foobar')
        })
    })


    describe('response', () => {
        it('returns a Response', () => {
            let res = response('hello world')
            assert(res instanceof Response)
            assert.equal(res.body, 'hello world')
        })

        it('forwards status', () => {
            assert.equal(response('', 204).status, 204)
        })

        it('forwards headers', () => {
            let res = response('hello world', {test: 'hi'})
            assert(res.ok)
            assert.equal(res.headers.get('test'), 'hi')
            assert.equal(res.body, 'hello world')
        })

        it('forwards status and headers', () => {
            let res = response('hello world', 123, {test: 'hi'})
            assert.equal(res.status, 123)
            assert.equal(res.headers.get('test'), 'hi')
            assert.equal(res.body, 'hello world')
        })
    })


    describe('redirect', () => {
        it('returns a redirect Response', () => {
            let res = redirect('/test')
            assert.instanceOf(res, Response)
            assert.equal(res.status, 303)
            assert.equal(res.headers.get('location'), '/test')
        })

        it('sets custom response status', () => {
            assert.equal(redirect('/test', 321).status, 321)
        })
    })


    describe('json', () => {
        it('serializes a json object', () => {
            let res = json({foo: 'bar'})
            assert.instanceOf(res, Response)
            assert.equal(res.status, 200)
            assert.include(res.headers.get('content-type'), '/json')
            assert.equal(json_decode(res.body).foo, 'bar')
        })

        it('sets custom response status', () => {
            assert.equal(json({}, 400).status, 400)
        })
    })


    describe('render', () => {
        it('returns a html response', () => {
            let res = render(() => 'hello world')
            assert.equal(res.status, 200)
            assert.include(res.headers.get('content-type'), '/html')
            assert.equal(res.body, 'hello world')
        })

        it('invokes the template with default context', () => {
            render(ctx => assert(is_empty_object(ctx)))
            render.defaults.foo = 'bar'
            render(ctx => assert.equal(ctx.foo, 'bar'))
        })

        it('prefers local context over global', () => {
            render.defaults.foo = 'bar'
            render.defaults.bar = 'qux'
            render(ctx => {
                assert.equal(ctx.foo, 'baz')
                assert.equal(ctx.bar, 'qux')
                return ''
            }, {foo: 'baz'})
        })
    })


    describe('shortcuts', () => {
        let called
        beforeEach(() => called = false)
        let fn = () => (called = true, response('hello'))

        it('head', async () => {
            head('/', fn)
            assert.isNull((await call('/', 'head')).body)
            assert(called)
        })

        it('get+head', async () => {
            get('/', fn)
            assert.isNull((await call('/', 'head')).body)
            assert(called)
        })

        let common = (method, name) => it(name, async () => {
            method('/', fn)
            assert.equal(routes.get('').get(name), fn)
            await call('/', name)
            assert(called)
        })
        common(get, 'get')
        common(post, 'post')
        common(put, 'put')
        common(del, 'delete')
        common(patch, 'patch')
    })
})
