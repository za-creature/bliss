// text digests
export let enc = encodeURIComponent


export function hex(buffer) {
    return Array.prototype.map.call(
        new Uint8Array(buffer),
        x => `00${x.toString(16)}`.slice(-2)
    ).join('')
}


const TEXT = new TextEncoder('utf-8')
export function hmac(key, data) {
    return crypto.subtle.importKey('raw', utf8(key),
                                   {name: 'HMAC', hash: {name: 'SHA-256'}},
                                   false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, utf8(data)))
}


export function sha256(data) {
    return crypto.subtle.digest('SHA-256', utf8(data))
}


export function utf8(data) {
    return(typeof data == 'string' ? TEXT.encode(data) : new Uint8Array(data))
}


// general purpoe
export function random(count) {
    let buff = new Uint8Array(count)
    crypto.getRandomValues(buff)
    return buff
}


export let uuid = () => hex(random(16))
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
import router from '../'
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
