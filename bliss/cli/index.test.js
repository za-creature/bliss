import('chai').then(({assert}) => {
let {spawn} = require('child_process')
let path = require('path')
let fetch = require('node-fetch')
let https = require('https')
let EventEmitter = require('events')


describe('cli', () => {
    it('returns 1 on bad command line argument', next => {
        spawn(process.execPath, [__dirname, '--foo'], {stdio: 'inherit'})
        .once('close', (code, signal) => {
            try {
                assert.equal(code, 1)
                assert.isNull(signal)
            } finally {
                next()
            }
        })
    })

    it('deploys the worker from the config', function(next) {
        this.timeout(10000)
        let pid = spawn(process.execPath, [
            __dirname, '--config',
            path.join(__dirname, '..', '..', 'fixtures', 'bliss.config.js')
        ], {stdio: 'inherit'}).once('close', (code, signal) => {
            try {
                assert.equal(code, 0)
                assert.isNull(signal)
                next()
            } catch(err) {
                next(err)
            }
        })
        let interval = setInterval(async () => {
            let res
            try {
                res = await fetch('http://localhost:8080/')
            } catch(err) {
                return
            }
            clearInterval(interval)
            pid.kill(2)
            assert.equal(await res.text(), 'hello world')
        }, 100)
    })

    let httpsReq
    before(() => httpsReq = https.request)
    after(() => https.request = httpsReq)

    it('deploys to cloudflare', (next) => {
        const JITTER = 10
        https.request = opts => {
            assert.propertyVal(opts, 'method', 'PUT')
            assert.propertyVal(opts, 'path', '/client/v4/accounts/1337/workers/scripts/test-worker')
            assert.propertyVal(opts, 'host', 'api.cloudflare.com')
            assert.nestedPropertyVal(opts, 'headers.Authorization', 'Bearer test-token')
            assert.nestedProperty(opts, 'headers.Content-Type')
            assert.include(opts.headers['Content-Type'], 'multipart/form-data;boundary=')
            let req = Object.assign(new EventEmitter(), {
                end(body) {
                    body = body.toString()
                    assert.include(body, 'addEventListener')
                    assert.include(body, 'BLISS_DATA')
                    setTimeout(() => {
                        req.emit('response', body = new EventEmitter())
                        setTimeout(() => {
                            body.emit('data', '')
                            setTimeout(() => (body.emit('end'), next()), JITTER)
                        }, JITTER)
                    }, JITTER)
                    return req
                }
            })
            return req
        }
        process.env.CF_ACCOUNT_ID = '1337'
        process.env.CF_WORKER_NAME = 'test-worker'
        process.env.CF_TOKEN = 'test-token'
        require('.')({
            deploy: true,
            config: './fixtures/bliss.config.js'
        })
    })
})
})
