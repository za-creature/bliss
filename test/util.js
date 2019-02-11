import {assert} from 'chai'
import {enc, hex, hmac, sha256, utf8, random, uuid, list, lru} from '../util'


describe('utils', () => {
    describe('enc', () => it('is an alias of encodeURIComponent', () =>
        assert(enc == encodeURIComponent)
    ))


    describe('hex', () => it('performs hex encoding with padding', () => 
        assert(hex([1, 10, 160, 255]) == '010aa0ff')
    ))


    describe('hmac', () => it('performs hmac-sha256', async () => assert(
        hex(await hmac('key', 'data')) ==
        '5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0'
    )))


    describe('sha256', () => {
        it('handles text as utf8', async () => assert(
            hex(await sha256('ăîăî')) ==
            '0811584173991d6a57c03ee4fc73c3aab375eb56647773a09ae5d027b0e0a863'
        ))

        it('supports buffers', async () => assert(
            hex(await sha256([1, 2, 3, 4])) ==
            '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a'
        ))
    })


    describe('utf8', () => it('encodes according to spec', () => assert(
        hex(utf8('țșțș')) == 'c89bc899c89bc899'
    )))


    describe('random', () => {
        it('respects count', () => {
            assert(hex(random(4)).length == 8)
            assert(hex(random(10)).length == 20)
        })

        it('is not constant', () => assert(
            hex(random(16)) != hex(random(16))
        ))
    })


    describe('uuid', () => it('is a 32 character lowercase hex', () => {
        assert(uuid().match(/^[a-f0-9]{32}$/))
    }))


    describe('list', () => {
        it('returns a (add, pop, head, tail) tuple', () => assert(
            list()
            .map(fn => assert(typeof fn == 'function'))
            .length == 4
        ))

        it('head and tail are null on empty list', () => {
            let [,, head, tail] = list()
            assert(head() == null)
            assert(tail() == null)
        })

        it('head and tail are not-null when list contains items', () => {
            let [add, pop, head, tail] = list()
            let x = add('x')
            assert(head() == x)
            assert(tail() == x)
            assert(pop(x) == 'x')
            assert(head() == null)
            assert(tail() == null)
        })

        it('add appends to the end of the list', () => {
            let [add, , head, tail] = list()
            let x = add('x')
            assert(head() == x)
            assert(tail() == x)
            let y = add('y')
            assert(head() == x)
            assert(tail() == y)
            let z = add('z')
            assert(head() == x)
            assert(tail() == z)
        })

        it('add can insert before', () => {
            let [add, , head, tail] = list()
            let x = add('x')
            assert(head() == x)
            assert(tail() == x)
            let y = add('y', x)
            assert(head() == y)
            assert(tail() == x)
            let z = add('z', y)
            assert(head() == z)
            assert(tail() == x)
        })

        it('add can insert after', () => {
            let [add, , head, tail] = list()
            let x = add('x')
            assert(head() == x)
            assert(tail() == x)
            let y = add('y')
            assert(head() == x)
            assert(tail() == y)
            add('z', null, x)
            assert(head() == x)
            assert(tail() == y)
        })

        it('pop can clear the list', () => {
            let [add, pop, head, tail] = list()
            let x = add('x')
            let y = add('y')
            let z = add('z')
            assert(head() == x)
            assert(tail() == z)
            assert(pop(y) == 'y')
            assert(head() == x)
            assert(tail() == z)
            assert(pop(z) == 'z')
            assert(head() == x)
            assert(tail() == x)
            assert(pop(z) == 'z')
            assert(head() == null)
            assert(tail() == null)
        })
    })

    describe('lru', () => {
        it('caches the result', () => {
            let calls = 0
            let cache = lru(1, () => `hello ${calls++}`)
            assert(cache('x') == 'hello 0')
            assert(cache('x') == 'hello 0')
        })

        it('respects the maximum capacity, evicting lru element', () => {
            let calls = 0
            let cache = lru(2, () => `hello ${calls++}`)
            assert(cache('x') == 'hello 0')
            assert(cache('y') == 'hello 1')
            assert(cache('z') == 'hello 2')
            assert(cache('y') == 'hello 1')
            assert(cache('x') == 'hello 3')
            assert(cache('y') == 'hello 1')
            assert(cache('z') == 'hello 4')
        })

        it('propagates exceptions', async () => {
            assert.throws(lru(1, () => {
                throw new Error('oops')
            }).bind(null, 'x'), 'oops')

            await assert.isRejected(lru(1, () => new Promise((res, rej) => {
                setTimeout(rej.bind(null, new Error('async-oops')))
            }))('x'), 'async-oops')
        })

        it('bundles async calls', async () => {
            let resolve
            let cache = lru(1, () => new Promise(res => resolve = res))

            let a = cache(1, 2)
            let b = cache(1, 2)
            resolve('x')
            assert(await a, 'x')
            assert(await b, 'x')
        })

        it('removes from cache on async error', async () => {
            let resolve, reject
            let cache = lru(1, () => new Promise((...a) => [resolve, reject] = a))

            let a = cache(1, 2)
            reject(new Error('y'))
            await assert.isRejected(a, 'y')

            let b = cache(1, 2)
            assert(a != b)

            let c = cache(1, 2)
            resolve('z')
            assert(await b == 'z')
            assert(await c == 'z')
        })
    })
})
