import {assert} from 'chai'
import router, {
    route, routes,
    response, redirect, json, render,
    head, get, post, put, del, patch
} from '..'


let call = (path, method='GET') => new Promise((res) => router({
    request: new Request(`http://localhost${path}`, {method}),
    respondWith: res
}))


describe('bliss', () => {
    describe('router', () => {
        afterEach(() => routes.clear())

        it('adds entries to the routing table', () => {
            assert(routes.size == 0)
            route('GET', '/', () => {})
            assert(routes.size == 1)
        })

        it('throws on duplicate route', () => {
            route('GET', '/', () => {})
            assert.throws(route.bind(null, 'GET', '/', () => {}), 'duplicate')
        })

        it('routes and forwards response', async () => {
            route('GET', '/foo', () => 'hello world')
            assert(await call('/foo') == 'hello world')
        })

        it('supports promises', async () => {
            route('GET', '/foo', async () => 'hello world')
            assert(await call('/foo') == 'hello world')
        })

        it('handles exceptions', async () => {
            let old_err = console.error
            try {
                let error
                console.error = e => error = e
                route('GET', '/foo', async () => {
                    throw new Error('oops')
                })

                let response = await call('/foo')
                assert(!response.ok)
                assert(response.body == 'internal error')
                assert(error.startsWith('Error: oops'))
            } finally {
                console.error = old_err
            }
        })

        it('favors nested paths', async () => {
            route('GET', '/foo', () => 'nope')
            route('GET', '/foo/bar', () => 'ok')
            assert(await call('/foo/bar') == 'ok')
        })

        it('supports url parameters', async () => {
            let that
            route('GET', '/route', async function() {
                that = this
                return 'ok'
            })
            assert(await call('/route?foo=bar') == 'ok')
            assert(that instanceof URL)
            assert(that.searchParams.get('foo') == 'bar')
        })

        it('is invariant to trailing separator', async () => {
            route('GET', '/foo', () => 'first')
            route('GET', '/bar/', () => 'second')
            assert(await call('/foo/') == 'first')
            assert(await call('/foo') == 'first')
            assert(await call('/bar') == 'second')
            assert(await call('/bar/') == 'second')
        })

        it('supports wildcard paths', async () => {
            let path
            route('GET', '/*', (req, arg) => {
                path = arg
                return 'first'
            })
            route('GET', '/foo', () => 'second')
            assert(await call('/foo') == 'second')
            assert(await call('/bar') == 'first')
            assert(path == 'bar')
        })

        it('supports nested wildcards', async () => {
            let user
            route('GET', '/users/*/about', (req, arg) => {
                user = arg
                return 'about'
            })
            route('GET', '/users/*/friends', (req, arg) => {
                user = arg
                return 'friends'
            })
            route('GET', '/users/*', (req, arg) => {
                user = arg
                return 'profile'
            })
            assert(await call('/users/alice') == 'profile')
            assert(user == 'alice')
            assert(await call('/users/bob/about') == 'about')
            assert(user == 'bob')
            assert(await call('/users/eve/friends') == 'friends')
            assert(user == 'eve')
        })
    })


    describe('response', () => {
        it('returns a Response', () => {
            let res = response('hello world')
            assert(res instanceof Response)
            assert(res.body == 'hello world')
        })

        it('forwards status', () => {
            assert(response('', 204).status == 204)
        })

        it('forwards headers', () => {
            let res = response('hello world', {test: 'hi'})
            assert(res.ok)
            assert(res.headers.get('test') == 'hi')
            assert(res.body == 'hello world')
        })

        it('forwards status and headers', () => {
            let res = response('hello world', 123, {test: 'hi'})
            assert(res.status == 123)
            assert(res.headers.get('test') == 'hi')
            assert(res.body == 'hello world')
        })
    })


    describe('redirect', () => {
        it('returns a redirect Response', () => {
            let res = redirect('/test')
            assert(res instanceof Response)
            assert(res.status == 301)
            assert(res.headers.get('location') == '/test')
        })

        it('sets custom response status', () => {
            assert(redirect('/test', 321).status == 321)
        })
    })


    describe('json', () => {
        it('serializes a json object', () => {
            let res = json({foo: 'bar'})
            assert(res instanceof Response)
            assert(res.status == 200)
            assert(res.headers.get('content-type').includes('/json'))
            assert(JSON.parse(res.body).foo == 'bar')
        })

        it('sets custom response status', () => {
            assert(json({}, 400).status == 400)
        })
    })


    describe('render', () => {
        afterEach(() => render.defaults = {})
        it('returns a html response', () => {
            let res = render(() => 'hello world')
            assert(res.status == 200)
            assert(res.headers.get('content-type').includes('/html'))
            assert(res.body == 'hello world')
        })

        it('invokes the template with default context', () => {
            render(ctx => assert(Object.keys(ctx).length == 0))
            render.defaults.foo = 'bar'
            render(ctx => assert(ctx.foo == 'bar'))
        })

        it('prefers local context over global', () => {
            render.defaults.foo = 'bar'
            render.defaults.bar = 'qux'
            render(ctx => {
                assert(ctx.foo == 'baz')
                assert(ctx.bar == 'qux')
                return ''
            }, {foo: 'baz'})
        })
    })


    describe('shortcuts', () => {
        let called = false
        let fn = () => (called = true, response('hello'))
        afterEach(() => (routes.clear()), called = false)

        it('head', async () => {
            head('/', fn)
            assert((await call('/', 'head').body) == null)
            assert(called)
        })

        it('get+head', async () => {
            get('/', fn)
            assert((await call('/', 'head').body) == null)
            assert(called)
        })

        let common = (method, name) => it(name, async () => {
            method('/', fn)
            assert(routes.get('').get(name) == fn)
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
