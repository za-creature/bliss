// encoding
export let url_encode = encodeURIComponent
export let url_decode = decodeURIComponent

// JSON
export let json_encode = JSON.stringify
export let json_decode = JSON.parse

// utf-8
let encoder = new TextEncoder()
let decoder = new TextDecoder()
export let utf8_encode = v => encoder.encode(v)
export let utf8_decode = v => decoder.decode(v)

// base64
export function base64_encode(bin) {
    let data = bytes(bin)
    let len = data.length
    let result = [], i = 0, j
    do {
        j = Math.min(len, i + 16383)
        result.push(btoa(String.fromCharCode(...data.slice(i, j))))
        i = j
    } while(i < len)
    return result.join('')
}
export function base64_decode(str) {
    let data = atob(str)
    let len = data.length
    let result = new Uint8Array(len)
    for(let i=0; i<len; i++)
        result[i] = data.charCodeAt(i)
    return result
}

// hex
export function hex_encode(bin) {
    return [].map.call(bytes(bin),
                       x => `00${x.toString(16)}`.slice(-2)).join('')
}
export function hex_decode(hex) {
    let result = new Uint8Array(hex.length>>1)
    for(let i=0; i<result.length; i++)
        result[i] = parseInt(hex.substr(i<<1, 2), 16)
    return result
}

// text digests
function hash(algo) {
    let fn = data => crypto.subtle.digest(algo, bytes(data))
    fn._ = algo
    return fn
}
export let sha1 = hash('SHA-1')
export let sha256 = hash('SHA-256')
export let sha384 = hash('SHA-384')
export let sha512 = hash('SHA-512')
export let hmac = (key, data, algo=sha256) => crypto.subtle.importKey(
    'raw', bytes(key), {
        'name': 'HMAC',
        'hash': {'name': is_function(algo) ? algo._ : algo}
    }, false, ['sign']
).then(key => crypto.subtle.sign('HMAC', key, bytes(data)))


// general purpose
export function* range(start=0, end, step=1) {
    if(is_undefined(end)) {
        end = start
        start = 0
    }
    if(!step)
        throw new Error('step must not be 0')

    while(step > 0 ? start < end : start > end) {
        yield start
        start += step
    }
}
export let identity = x => x
export let random = count => crypto.getRandomValues(new Uint8Array(count))
export let uuid = () => [random(4), random(2), random(2), random(2), random(6)]
                        .map(hex_encode)
                        .join('-')
export let raise = (message='', type=Error) => {throw new type(message)}
export let sleep = (timeout, raise=false) => {
    if(raise && !is_instance(raise, Error))
        raise = new Error(is_string(raise) ? raise : 'timeout')
    let id, done
    return Object.assign(
        new Promise((res, rej) => id = setTimeout(done = raise ? rej.bind(null, raise)
                                                               : res, timeout)),
        {cancel() { clearTimeout(id), done() }}
    )
}
export let bytes = bin =>
    is_string(bin) ? utf8_encode(bin)
    : ArrayBuffer.isView(bin)
    ? new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength)
    : new Uint8Array(bin)


// typeof shortcuts
export let is_type = (v, t) => typeof v == t
export let is_instance = (v, t) => v instanceof t
// objects
export let is_array = v => Array.isArray(v)
export let is_binary = v => is_instance(v, ArrayBuffer) || ArrayBuffer.isView(v)
export let is_object = v => is_type(v, 'object') && !is_null(v)
export let is_plain_object = v => is_object(v) && Object.getPrototypeOf(v) === Object.prototype
export let is_empty_object = v => is_plain_object(v) && !Object.keys(v).length
export let is_promise = v => is_object(v) && is_function(v.then)
// primitives
export let is_undefined = v => is_type(v, 'undefined')
export let is_null = v => v === null
export let is_string = v => is_type(v, 'string') || is_instance(v, String)
export let is_number = v => is_type(v, 'number') || is_instance(v, Number)
export let is_bigint = typeof BigInt == 'undefined'
    /* c8 ignore next */
    ? raise.bind('runtime does not support BigInt', TypeError)
    : v => is_type(v, 'bigint') || is_instance(v, BigInt)
export let is_boolean = v => is_type(v, 'boolean') || is_instance(v, Boolean)
export let is_function = v => is_type(v, 'function')
export let is_symbol = v => is_type(v, 'symbol')
