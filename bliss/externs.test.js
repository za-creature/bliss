let {assert} = require('chai')
let externs = require('./externs')


describe('externs', () => {
    let include = name => {
        it(name, () => assert.include(externs, name))
    }
    // google closure compiler requires these
    include('addEventListener')
    include('removeEventListener')
    include('caches')
})
