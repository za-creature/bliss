// text digests
export let enc = encodeURIComponent


let encoder = new TextEncoder()
let decoder = new TextDecoder()
export let utf8_encode = encoder.encode.bind(encoder)
export let utf8_decode = decoder.decode.bind(decoder)


let binary_passthrough = bin =>
    typeof bin == 'string' ? utf8_encode(bin)
    : bin.buffer instanceof ArrayBuffer
    ? new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength)
    : new Uint8Array(bin)


export function base64_encode(bin) {
    let data = binary_passthrough(bin)
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


export function hex(bin) {
    return [].map.call(binary_passthrough(bin),
                       x => `00${x.toString(16)}`.slice(-2)).join('')
}
export function bin(hex) {
    let result = new Uint8Array(hex.length / 2)
    for(let i=0; i<result.length; i++)
        result[i] = parseInt(hex.substring(i<<1, 2), 16)
    return result    
}


export function hmac(key, data) {
    return crypto.subtle.importKey('raw', binary_passthrough(key),
                                   {'name': 'HMAC', 'hash': {'name': 'SHA-256'}},
                                   false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, binary_passthrough(data)))
}


export function sha256(data) {
    return crypto.subtle.digest('SHA-256', binary_passthrough(data))
}


// general purpoe
export function random(count) {
    return crypto.getRandomValues(new Uint8Array(count))
}


export let uuid = () => hex(random(16))
export let defined = v => typeof v != 'undefined'
export let empty = obj => Object.keys(obj).length == 0
export let raise = (message, type=Error) => {throw new type(message)}


// structures
export function list() {
    let head, tail
    return [(item, before, after) => {
        after ? before = after[1] : after = before ? before[2] : tail
        let node = [item, before, after]
        after ? after[1] = node : head = node
        before ? before[2] = node : tail = node
        return node
    }, item => {
        item[1] ? item[1][2] = item[2] : tail = item[2]
        item[2] ? item[2][1] = item[1] : head = item[1]
        item[1] = item[2] = null
        return item[0]
    }, () => head, () => tail]
}


export function lru(capacity, getter) {
    let map = new Map()
    let [add, pop, oldest] = list()

    return (...args) => {
        let key = args.length > 1 ? args.join('/') : args[0]
        let old = map.get(key)
        if(old) {
            pop(old[1])
            map.set(key, [old[0], add(key)])
            return old[0]
        }

        let result = getter(...args)
        let pos = add(key)

        if(capacity > 0)
            capacity--
        else
            map.delete(pop(oldest()))
        map.set(key, [result, pos])

        if(result && result.then)
            result = result.then(val => (map.set(key, [val, pos]), val), err => {
                capacity++
                map.delete(pop(pos))
                throw err
            })
        return result
    }
}


/*
// allows the use of async functions in sync templates
import router from '..'
let calls = null
export function async_filter(fn) {
    if(calls == null) {
        calls = []
        router.filters.push(async (response) => {
            let body = await (await response).text()
            for(let [search, replace] of calls)
                body = body.replace(search, await replace)
            calls = []
            return new Response(body, response)
        })
    }

    return function() {
        let marker = uuid()
        calls.add([marker, fn(...arguments)])
        return marker
    }
}
*/
