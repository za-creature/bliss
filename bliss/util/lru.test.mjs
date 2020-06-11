import {assert} from 'chai'
import lru from './lru.mjs'


describe('lru', () => {
    it('caches the result', () => {
        let calls = 0
        let cache = lru(1, () => `hello ${calls++}`)
        assert.equal(cache('x'), 'hello 0')
        assert.equal(cache('x'), 'hello 0')
    })

    it('respects the maximum capacity, evicting lru element', () => {
        let calls = 0
        let cache = lru(2, () => `hello ${calls++}`)
        assert.equal(cache('x'), 'hello 0')
        assert.equal(cache('y'), 'hello 1')
        assert.equal(cache('z'), 'hello 2')
        assert.equal(cache('y'), 'hello 1')
        assert.equal(cache('x'), 'hello 3')
        assert.equal(cache('y'), 'hello 1')
        assert.equal(cache('z'), 'hello 4')
    })

    it('propagates exceptions', async () => {
        assert.throws(lru(1, () => {
            throw new Error('oops')
        }).bind(null, 'x'), 'oops')

        let err
        try {
            await lru(1, () => Promise.reject('async-oops'))('x')
        } catch(e) {
            err = e
        }
        assert.equal(err, 'async-oops')
    })

    it('deduplicates async calls', async () => {
        let resolve
        let cache = lru(1, () => new Promise(res => resolve = res))

        let a = cache(1, 2)
        let b = cache(1, 2)
        resolve('x')
        assert.equal(await a, 'x')
        assert.equal(await b, 'x')
    })

    it('removes from cache on async error', async () => {
        let resolve, reject
        let cache = lru(1, () => new Promise((...a) => [resolve, reject] = a))

        let a = cache(1, 2)
        reject(new Error('y'))
        let err
        try {
            await a
        } catch(e) {
            err = e
        }
        assert.equal(err.message, 'y')

        let b = cache(1, 2)
        assert.notEqual(a, b)

        let c = cache(1, 2)
        resolve('z')
        assert.equal(await b, 'z')
        assert.equal(await c, 'z')
    })
})
