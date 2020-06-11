# bliss/util
This module contains utility functions, categorized below. Many of them are
one-liners, and the intent behind their implementation is to standardize
frequently used code patterns in order to make the generated code
minifier-friendly. For example, the following code:
```js
if(typeof a == 'string') {
    // A
} else if(typeof b == 'string') {
    // B
}
```
...is very difficult to compress beyond whitespace and bracket removal, however:
```js
import is_string from 'bliss-router/util'
if(is_string(a)) {
    // A
} else if(is_string(b)) {
    // B
}
```
...can be reduced to:
```js
// minified code
if(S(a))/*A*/else if(S(b))/*B*/

// one time overhead (half of which is shared with most other is_* functions)
var T=(x,t)=>typeof x==t,I=(x,t)=>x instanceof t,S=x=>T(x,'string')||I(x,String)
```

Since some `bliss` modules internally import these functions for their argument
checks, you might not have to pay for any overhead at all, depending on which
modules you use in your application.


## reference
The following categories of functions are currently exported:


### type checking
This family of functions are used for standardized
[duck-type](https://en.wikipedia.org/wiki/Duck_typing) checking.

They all take exactly one argument which is the variable that should be tested
and always return `true` / `false` depending on whether the condition was met.


#### is_array
```js
export function is_array(value) {
    return Array.isArray(value)
}
```
Returns `true` if `value` is an `Array`.


#### is_binary
```js
export function is_binary(value) {
    return value instanceof ArrayBuffer || ArrayBuffer.isView(value)
}
```
Returns `true` if `value` contains binary data, e.g. if it is an `ArrayBuffer`
or an `ArrayBufferView`.


#### is_boolean
```js
export function is_boolean(value) {
    return 'boolean' == typeof value || value instanceof Boolean
}
```
Returns `true` if `value` is a `Boolean` primitive or object.


#### is_empty_object
```js
export function is_empty_object(value) {
    return is_plain_object(value) && Object.keys(value).length == 0
}
```
Returns `true` if `value` is `{}`, i.e. a plain `Object` that does not contain
any properties.


#### is_function
```js
export function is_function(value) {
    return 'function' == typeof value
}
```
Returns `true` if `value` is a `Function` or a callable `Proxy`.


#### is_function
```js
export function is_function(value, Type) {
    return value instanceof Type
}
```
Returns `true` if `value` is an instance of `Type`.


#### is_null
```js
export function is_null(value) {
    return value === null
}
```
Returns `true` if `value` is `null`.


#### is_number
```js
export function is_number(value) {
    return 'number' == typeof value || value instanceof Number
}
```
Returns `true` if `value` is a `Number` primitive or object.


#### is_object
```js
export function is_null(value) {
    return 'object' == typeof value && !is_null(value)
}
```
Returns `true` if `value` is a non-`null` `Object`.


#### is_plain_object
```js
export function is_plain_object(value) {
    return is_object(value) && Object.getPrototypeOf(v) === Object.prototype
}
```
Returns `true` if `value` is a 'plain' `Object`, i.e. an object that is not an
instance of a class.


#### is_promise
```js
export function is_promise(value) {
    return object instanceof Promise
}
```
Returns `true` if `value` is an instance of the global `Promise` class. Use of
this function is discouraged in favor of awaiting on `Promise.resolve(value)`
which is safe to call with any value.


#### is_string
```js
export function is_string(value) {
    return 'string' == typeof value || value instanceof String
}
```
Returns `true` if `value` is a `String` primitive or object.


#### is_symbol
```js
export function is_symbol(value) {
    return 'symbol' == typeof value
}
```
Returns `true` if `value` is a `Symbol` primitive.


#### is_undefined
```js
export function is_undefined(value) {
    return 'undefined' == typeof value
}
```
Returns `true` if `value` is `undefined`.


### encoding and decoding
This family of functions deals with the transformation of strings and bytes:


#### base64_decode
```js
export function base64_decode(string) -> Uint8Array
```
Returns the `bytes` that correspond to the base64-encoded `string`, assuming it
is using `+` and `/` as extra chars and `=` as padding.

#### base64_encode
```js
export function base64_encode(binary) -> string
```
Returns the base64 representation of `binary`, using `+` and `/` as extra chars
and `=` as padding.

*Warning*: If a `String` is provided, it returns the base64 encoding of its
UTF-8 encoding. This differs from the builtin `btoa` function which assumes
8-bit encoding.


#### hex_decode
```js
export function hex_decode(string) -> Uint8Array
```
Returns the `bytes` that correspond to the hex-encoded `string`.

#### hex_encode
```js
export function hex_encode(bytes) -> string
```
Returns the hexadecimal representation of `bytes`. If a `String` is provided,
it instead returns the hexadecimal representation of its UTF-8 encoding.


#### json_decode
```js
export function json_decode(string, [reviver]) -> value
```
A minifier-friendly alias of `JSON.parse(...args)`, returns the `value` that
corresponds to the provided JSON-encoded `string`.

#### json_encode
```js
export function json_encode(value, [replacer, [space]]) -> string
```
A minifier-friendly alias of `JSON.stringify(...args)`, returns the JSON
representation of `value` as a `String`


#### url_decode
```js
export function url_decode(string) -> string
```
A minifier-friendly alias of `decodeURIComponent(string)`, decodes a
percent-encoded `string` and returns the original value.

#### url_encode
```js
export function url_encode(string) -> string
```
A minifier-friendly alias of `encodeURIComponent(string)`, returns the
reversible percent-encoding of a `string` so that it may be used as an URL
component.


#### utf8_decode
```js
export function utf8_decode(bytes) -> string
```
Minifier-friendly alias of `new TextDecoder().decode(bytes)`. Decodes `bytes`
into a string assuming it contains valid `UTF-8` data.

#### utf8_encode
```js
export function utf8_encode(string) -> Uint8Array
```
Minifier-friendly alias of `new TextEncoder().encode(string)`. Returns the
`bytes` that represent the `UTF-8` encoding of a `string`.


### hashing
These functions deal with the irreversible transformation of data using the
cryptographically-secure hash functions exported by the javascript
[`crypto API`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto).


#### hmac
```js
export async function hmac(key, data, algo=sha256) -> Uint8Array
```
Returns the `bytes` that correspond to the
[HMAC](https://en.wikipedia.org/wiki/HMAC) signature of `data` using `key` with
`algo`. Both `key` and `data` must be binary, and their UTF-8 representations
will used instead if they are `Strings`. `algo` is the hash function that should
be used, it can either be a string like `SHA-256` or one of the exported hash
functions described below:


#### sha1
```js
export async function sha1(data) -> Uint8Array
```
Returns the 20 `bytes` that correspond to the
[SHA-1](https://en.wikipedia.org/wiki/SHA-1) hash of `data` or its UTF-8
encoded if passed as `String`.


#### sha256
```js
export async function sha256(data) -> Uint8Array
```
Returns the 32 `bytes` that correspond to the
[SHA-256](https://en.wikipedia.org/wiki/SHA-2) hash of `data` or its UTF-8
encoded if passed as `String`.


#### sha384
```js
export async function sha384(data) -> Uint8Array
```
Returns the 48 `bytes` that correspond to the
[SHA-384](https://en.wikipedia.org/wiki/SHA-2) hash of `data` or its UTF-8
encoded if passed as `String`.


#### sha512
```js
export async function sha512(data) -> Uint8Array
```
Returns the 64 `bytes` that correspond to the
[SHA-512](https://en.wikipedia.org/wiki/SHA-2) hash of `data` or its UTF-8
encoded if passed as `String`.


### general purpose
These are frequently used by various `bliss` modules and are syntactic sugar:


#### bytes
```js
export function bytes(binary) -> Uint8Array
```
Returns the `bytes` from the underlying representation of `binary`:
* if `binary` is a string, its UTF-8 representation will be returned
* if `binary` is an `ArrayBufferView`, a sub-view will be created from its
  `buffer`, with respect to `offset` and `length`
* otherwise, it returns the result of `new Uint8Array(data)`


#### identity
```js
export let identity = x => x
```
The [identity function](https://en.wikipedia.org/wiki/Identity_function) which
always returns the first argument it is called with. Useful as a default value
for transformer functions that are sent as optional arguments.


#### raise
```js
export function raise(message, type=Error) {
    throw new type(message)
}
```
When called, immediately throws an exception with the specified message and
optionally of a custom class. Useful when you want to throw an error inside the
body of an expression:
```js
import {raise} from 'bliss-router/util'

function validate_form(form) {
    let filename = form.get('filename') || raise('missing filename', TypeError)
    // ...    
}
```


#### random
```js
export function random(count) -> Uint8Array
```
Returns `count` random `bytes`


#### sleep
```js
export async function sleep(duration, [error]) -> undefined
```
Returns a `Promise` that resolves after `duration` milliseconds:
```js
import {sleep} from 'bliss-router/util'

async function fetch_with_retry(req, max_tries, time_between_tries) {
    let i, res
    for(i=0; i<max_tries; i++) {
        try {
            res = fetch(req)
            if(!res.ok)
                throw new Error(`bad status code: ${res.status}`)
            return res
        } catch(err) {
            console.error(err)
            // this is just a basic example, please use exponential backoff
            // with jitter to avoid DDoS-ing your own backend services
            await sleep(time_between_tries)
        }
    }
}
```

If `error` is provided, the promise is instead rejected with that value:
```js
import {sleep} from 'bliss-router/util'

function fetch_with_timeout(req, max_duration) {
    return Promise.race([
        fetch(req),
        sleep(max_duration, new Error('request timed out'))
    ])
}
```


#### uuid
```js
export function uuid() -> String
```
Returns the canonical textual representation of a
[v4 UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier),
e.g.: `123e4567-e89b-12d3-a456-426614174000`

*Warning*: this function is not optimized, so if you don't care about the result
contaiing a well-formed UUID (with '-' characters) and only want a random
`String`, consider using `hex(random(16))` instead as it will be faster.
