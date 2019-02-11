import {assert} from 'chai'
import router, {route, routes} from '../'


let call = (path, method='GET') => new Promise((res) => router({
    request: new Request(`http://localhost${path}`, {method}),
    respondWith: res
}))


describe('router', () => {
    afterEach(() => routes.clear())


    it('adds entries to the routing table', () => {
        assert(routes.size == 0)
        route('GET', '/', () => {})
        assert(routes.size == 1)
    })


    it('throws on bad or duplicate route', () => {
        route('GET', '/', () => {})
        assert.throws(route.bind(null, 'GET', '/', () => {}), 'duplicate')
        assert.throws(route.bind(null, 'GET', 'foo', () => {}), '/')
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
            assert(error instanceof Error)
            assert(error.toString().startsWith('Error: oops'))
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
