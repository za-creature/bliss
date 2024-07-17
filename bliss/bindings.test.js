import('chai').then(({assert}) => {
let bindings = require('./bindings')


describe('bindings', () => {
    let spec = (name, type) => describe(name, () => {
        let fn = bindings[name]

        it('is a function', () => {
            assert.isFunction(fn)
        })

        it('returns an object', () => {
            assert.instanceOf(fn(), Object)
        })

        it(`sets type to '${type}'`, () => {
            assert.equal(fn().type, type)
        })

        it('includes the argument', () => {
            let arg = Math.random().toString()
            assert.include(JSON.stringify(fn(arg)), arg)
        })
    })

    spec('text', 'plain_text')
    spec('secret', 'secret_text')
    spec('kv', 'kv_namespace')
    spec('wasm', 'wasm_module')
    spec('file', 'bliss_asset')
    spec('dir', 'bliss_asset')
})
})
