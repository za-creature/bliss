import {assert} from 'chai'
import {
    response, redirect, json, render,
    routes, head, get, post, put, del, patch
} from '../'


describe('helpers', () => {
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

        it('attempts to preload', () => {
            assert(redirect('/test').headers.get('link').includes('</test>'))
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
        after(() => routes.clear())

        let fn = () => ''
        let common = (method, name) => it(name, () => {
            method('/', fn)
            assert(routes.get(name).get('') == fn)
        })
        common(head, 'head')

        it('get', () => {
            get('/foo', fn)
            assert(routes.get('head').get('foo').get('') == fn)
            assert(routes.get('get').get('foo').get('') == fn)
        })

        common(post, 'post')
        common(put, 'put')
        common(del, 'delete')
        common(patch, 'patch')
    })

})
