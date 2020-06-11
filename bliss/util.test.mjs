import {assert} from 'chai'
import {url_encode, url_decode,
        json_encode, json_decode,
        hex_encode, hex_decode,
        utf8_encode, utf8_decode,
        hmac, sha1, sha256, sha384, sha512,
        range, identity, random, uuid,
        raise, sleep, bytes,
        is_type, is_instance, is_array, is_binary, is_object,
        is_plain_object, is_empty_object, is_promise,
        is_undefined, is_null, is_string, is_number, is_bigint, is_boolean,
        is_function, is_symbol} from './util.mjs'


describe('util', () => {
    // encoding and decoding
    it('url_encode', () => {
        // alias
        assert.strictEqual(url_encode, encodeURIComponent)
    })

    it('url_decode', () => {
        // alias
        assert.strictEqual(url_decode, decodeURIComponent)
    })

    it('json_encode', () => {
        // alias
        assert.strictEqual(json_encode, JSON.stringify)
    })

    it('json_decode', () => {
        // alias
        assert.strictEqual(json_decode, JSON.parse)
    })

    it('hex_encode', () => {
        // zero padding
        assert.equal(hex_encode([1, 10, 160, 255]), '010aa0ff')
    })

    it('hex_decode', () => {
        // discards last nibble
        assert.deepEqual(hex_decode('010aa0ffd'), Buffer.from([1, 10, 160, 255]))
    })

    it('utf8_encode', () => {
        assert.equal(hex_encode(utf8_encode('țșțș')), 'c89bc899c89bc899')
    })

    it('utf8_decode', () => {
        assert.equal(utf8_decode(Buffer.from([196, 131, 195, 174])), 'ăî')
    })

    // digests
    describe('hmac', () => {
        it('uses sha256 by default', async () => {
            assert.equal(hex_encode(await hmac('key', 'data')),
                         '5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0')
        })

        it('composes with hash functions', async () => {
            assert.equal(hex_encode(await hmac('key', 'data', sha1)),
                         '104152c5bfdca07bc633eebd46199f0255c9f49d')
        })

        it('accepts string names', async () => {
            assert.deepEqual(await hmac('key', 'data', 'sha384'),
                             await hmac('key', 'data', sha384))
            assert.deepEqual(await hmac('key', 'data', 'sha512'),
                             await hmac('key', 'data', sha512))
        })
    })

    describe('sha256', () => {
        it('treats text as utf-8', async () => assert(
            hex_encode(await sha256('ăîăî')) ==
            '0811584173991d6a57c03ee4fc73c3aab375eb56647773a09ae5d027b0e0a863'
        ))

        it('supports buffers', async () => assert(
            hex_encode(await sha256([1, 2, 3, 4])) ==
            '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a'
        ))
    })

    // general purpose
    describe('range', () => {
        it('is a generator', () => {
            assert.isFunction(range(5).next)
        })

        let test = (val, expected) => {
            assert.deepEqual(Array.from(val), expected)
        }

        it('defaults', () => {
            test(range(), [])
            test(range(-1), [])
            test(range(5), [0, 1, 2, 3, 4])
            test(range(1, 3), [1, 2])
        })

        it('zero step', () => {
            assert.throws(() => Array.from(range(1, 5, 0)), 'step')
        })

        it('negative step', () => {
            test(range(5, 0, -1), [5, 4, 3, 2, 1])
        })

        it('floating point step', () => {
            test(range(1, 3, 0.5), [1, 1.5, 2, 2.5])
        })
    })

    it('identity', () => {
        for(let x of [true, 'test', 1234, undefined, {}])
            assert.strictEqual(identity(x), x)
    })

    describe('random', () => {
        it('respects count', () => {
            assert(random(4).length == 4)
            assert(random(10).length == 10)
        })

        it('is not constant', () => assert(
            hex_encode(random(16)) != hex_encode(random(16))
        ))
    })

    it('uuid', () => {
        // uuid in canonical representation
        assert(uuid().match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/))
    })

    it('raise', () => {
        assert.throws(raise)
        assert.throws(() => raise('message'), 'message')
        assert.throws(() => raise('message', TypeError), TypeError, 'message')
    })

    describe('sleep', () => {
        it('simple', async () => {
            let start = Date.now()
            await sleep(10)
            assert.isAtLeast(Date.now() - start, 9) // never trust a wall clock
        })

        it('raise', async () => {
            try {
                let start = Date.now()
                await sleep(10, true)
                assert.isAtLeast(Date.now() - start, 9)
                throw new Error('invalid')
            } catch(err) {
                assert.equal(err.message, 'timeout')
            }
        })

        it('raise custom', async () => {
            try {
                let start = Date.now()
                await sleep(10, new Error('user'))
                assert.isAtLeast(Date.now() - start, 9)
                throw new Error('invalid')
            } catch(err) {
                assert.equal(err.message, 'user')
            }
        })

        it('cancel', async () => {
            let start = Date.now()
            let timer = sleep(10000)
            setTimeout(timer.cancel, 30)
            await timer
            assert.isBelow(Date.now() - start, 100)
        })
    })

    describe('bytes', () => {
        it('utf8 strings', () => {
            assert.deepEqual(bytes('ăî'), Buffer.from([196, 131, 195, 174]))
        })

        it('array buffers', () => {
            assert.deepEqual(bytes(Uint8Array.from([1, 2]).buffer), Buffer.from([1, 2]))
        })

        it('buffer views', () => {
            assert.deepEqual(bytes(Uint16Array.from([1, 2])), Buffer.from([1, 0, 2, 0]))
        })
    })

    describe('typing', () => {
        it('is_type', () => {
            assert(is_type('foo', 'string'))
            assert(is_type(new String('foo'), 'object'))
            assert(!is_type(new String('foo'), 'string'))
        })

        it('is_instance', () => {
            assert(is_instance({}, Object))
            assert(is_instance(() => {}, Function))
            assert(is_instance(new String('foo'), String))
            assert(!is_instance({}, Function))
        })

        it('is_array', () => {
            assert(is_array([]))
            assert(is_array(['foo']))
            assert(!is_array('foo'))
        })

        it('is_binary', () => {
            assert(is_binary(Buffer.alloc(1).buffer))
            assert(is_binary(Uint32Array.from([1, 2, 3])))
            assert(!is_binary('foo'))
        })

        it('is_object', () => {
            assert(is_object({}))
            assert(is_object(new TextEncoder()))
            assert(!is_object(null))
            assert(Symbol())
        })

        it('is_plain_object', () => {
            assert(is_plain_object({foo: 'bar'}))
            assert(!is_plain_object(5))
            assert(!is_plain_object(new TextEncoder()))
        })

        it('is_empty_object', () => {
            assert(is_empty_object({}))
            assert(!is_empty_object(null))
            assert(!is_empty_object({foo: 'bar'}))
            assert(!is_empty_object(5))
            assert(!is_empty_object(new TextEncoder()))
        })

        it('is_promise', () => {
            assert(is_promise(Promise.resolve(true)))
            assert(is_promise({then() {}}))
            assert(!is_promise({}))
        })

        it('is_undefined', () => {
            assert(is_undefined(void 0))
            assert(!is_undefined(null))
        })

        it('is_null', () => {
            assert(is_null(null))
            assert(!is_null({}))
            assert(!is_null(undefined))
        })

        it('is_string', () => {
            assert(is_string(''))
            assert(is_string('foo'))
            assert(is_string(new String('bar')))
            assert(!is_string({}))
            assert(!is_string(5))
        })

        it('is_number', () => {
            assert(is_number(3))
            assert(is_number(new Number(4)))
            assert(!is_number('5'))
            assert(!is_number(null))
        })

        it('is_bigint', () => {
            if(typeof BigInt == 'undefined') {
                assert.throws(() => is_bigint(5), 'runtime')
            } else {
                assert(is_bigint(BigInt(5))) // avoid 5n in case of syntax error
                assert(!is_bigint(5))
            }
        })

        it('is_boolean', () => {
            assert(is_boolean(true))
            assert(is_boolean(false))
            assert(!is_boolean(0))
            assert(!is_boolean(''))
        })

        it('is_function', () => {
            assert(is_function(() => {}))
            assert(is_function(Math.floor))
            assert(!is_function({}))
        })

        it('is_symbol', () => {
            assert(is_symbol(Symbol.for('foo')))
            assert(is_symbol(Symbol.iterator))
            assert(!is_symbol('foo'))
        })
    })
})
