import {assert} from 'chai'
import LazyPromise from './lazy.mjs'


describe('LazyPromise', () => {
    it('delays execution until first await', async () => {
        let called = 0
        let promise = new LazyPromise((res) => {
            called = 1
            res()
        })
        assert.equal(called, 0)
        await promise
        assert.equal(called, 1)
    })

    it('propagates errors', async () => {
        let promise = new LazyPromise(() => {
            throw new Error('thrown')
        })
        try {
            await promise
            throw new Error('returned')
        } catch(err) {
            assert.equal(err.message, 'thrown')
        }
    })
})
