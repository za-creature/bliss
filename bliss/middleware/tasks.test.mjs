import {assert} from 'chai'

import router, {get, reset} from '../router.mjs'
import {sleep} from '../util.mjs'
import tasks from './tasks.mjs'


let call = (path, method='GET') => new Promise((res) => router({
    request: new Request(`http://localhost${path}`, {method}),
    respondWith: res,
    waitUntil: val => void val.catch(err => console.error(err.stack))
}))


describe('tasks', () => {
    let now, warn
    before(() => {
        now = Date.now
        warn = console.warn
    })
    afterEach(() => {
        Date.now = now
        console.warn = warn
        reset()
    })

    it('exports the registration function', () => {
        assert.isFunction(tasks)
    })

    it('runs enqueued tasks outside the request flow', async () => {
        tasks()

        let message = 'okay'
        get('/', async req => {
            req.enqueue(async () => {
                await sleep(100)
                message = 'nope'
            })
            return message
        })
        assert.equal(await call('/'), 'okay')
        await sleep(100)
        assert.equal(message, 'nope')
    })

    it('logs exceptions', async () => {
        tasks()
        let message
        console.warn = msg => message = msg

        get('/', async req => {
            req.enqueue(() => {throw 'whatever'})
            return 'okay'
        })
        assert.equal(await call('/'), 'okay')
        assert.include(message, 'background task 0 failed: whatever')
    })

    it('respects the timeout', async () => {
        tasks(100)

        let message
        get('/', async req => {
            req.enqueue(sleep(200))
            req.warn = msg => message = msg
            return 'okay'
        })
        assert.equal(await call('/'), 'okay')
        await sleep(100)
        assert.include(message, 'background task 0 failed: \nError: max time limit of 100ms exceeded')
    })
})
