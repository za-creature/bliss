import {assert} from 'chai'

import router, {get, reset} from '../router.mjs'
import {sleep} from '../util.mjs'
import rtc from './rtc.mjs'


let call = (path, method='GET') => new Promise((res) => router({
    request: new Request(`http://localhost${path}`, {method}),
    respondWith: res,
    waitUntil: val => void val.catch(err => console.error(err.stack))
}))


describe('rtc', () => {
    let now
    before(() => now = Date.now)
    afterEach(() => {
        Date.now = now
        reset()
    })

    it('exports the registration function', () => {
        assert.isFunction(rtc)
    })

    it('monkey patches Date.now and corrects drift', async () => {
        assert.strictEqual(Date.now, now)
        rtc(true)
        assert.notStrictEqual(Date.now, now)

        // test availability outside request context
        assert.strictEqual(Date.now(), now())

        // test availability inside request context
        get('/', async req => {
            assert.strictEqual(Date.now, req.now)
            let delta = Date.now()

            // drift check; should reset first interval after second triggers
            await sleep(300)
            assert.isAtLeast(Date.now() - delta, 270)
            return 'okay'
        })
        assert.equal(await call('/'), 'okay')

        // test timer shutdown after last request
        let delta = Date.now()
        await sleep(300)
        assert.equal(Date.now(), delta)
    })

    it('adds a timer to the request', async () => {
        assert.strictEqual(Date.now, now)
        rtc()
        assert.strictEqual(Date.now, now)

        // trivial test; check first interval
        get('/', async req => {
            let delta = req.now()
            await sleep(70)
            assert.isAtLeast(req.now() - delta, 50)
            return 'okay'
        })
        assert.equal(await call('/'), 'okay')
    })
})
