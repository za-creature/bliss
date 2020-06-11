# bliss/assets
~~Unlike most of the other modules, I've given this one some thought about the
ethical implications of implementing it, especially now that Cloudflare is
offering workers for free. This implements delivery of static assets, normally a
value-added feature of
[Workers-KV](https://developers.cloudflare.com/workers/reference/storage) which
is only available with commercial plans.~~

~~Ultimately, I went ahead not only because it's a very useful feature to have,
but also because like most of the other limitations imposed by CF-Workers, it
encourages good coding practices. It wasn't all that long ago that downloading
1MiB in order to view a web page was considered unacceptable, and I believe that
there's social good in steering web development back towards that direction.~~

~~While a for-profit company, Cloudflare has been known to stand up for the
little guy at times, and I believe that this bit of hackery sort-of fits in with
that strategy. That being said, regardless of whether or not this solution is
good enough for your use case, if you can afford to pay for their services,
please do: it supports their business, encourages competition, and gives you
leverage.~~

The above is no longer very relevant as cloudflare now includes limited use of
KV in their free plan.

## usage
1. In your `bliss.config.js` file, use the `file()` and `dir()` functions from
   the `bliss-router/bindings` to specify relative paths to the assets you want
   to embed with your application.
2. Use the `asset()` function exported by this module to configure static
   routes that serve the data you embedded above. You can also specify custom
   headers via the third optional argument.
3. Re-deploy your worker whenever you add, update or delete any assets.


### example

`robots.txt`
```
User-agent: *
Disallow: /
```

`bliss.config.js`
```js
let {file} = require('bliss-router/bindings')
module.exports = {
   ROBOTS_TXT: file('./robots.txt')
}
```

`server.mjs`
```js
import router, {get, json} from 'bliss'
import asset from 'bliss-router/util/assets'

// WARNING: the ROBOTS_TXT "binding" is only available after importing bliss-router/assets
asset('/robots.txt', ROBOTS_TXT)
get('/', () => json({error: 'bad robot!'}))

addEventListener('fetch', router)
````


## limits
All static assets are embedded in your worker and their size counts towards the
1MiB quota. This of course means that the more code you have, the less space you
have for assets, and vice-versa. In addition to the 1MiB limit, there is an
encoding overhead of about 15% (base128) if you're embedding files that are not
valid UTF-8.


## reference


### asset
```js
export default function asset(path, data, headers=null) -> undefined`
```
Adds a static route on `path` that serves `data` (`String`, `ArrayBuffer` or
`ArrayBufferView`), optionally with `headers` (plain object or `Headers`).
If `data` is an object, its values are served recursively on `${path}/${key}`.
If `data` exports a `mimetype` property, it will be used as a default
`content-type` header, unless already set.
`headers` can also be a `String` in which case it will be used as the value for
the `content-type` header. Both `data` and `headers` can be Promises
The following headers are automatically populated and cannot be changed:
`content-length: ${data.byteLength}` and `etag: ${sha256(data)}`.

To facilitate more efficient asset delivery, as well as to support resumable
downloads, all requests are stored and served from the default cache. To this
end, only the path segment of the incoming URL is considered, the query string
(if any) as well as the fragment identifier (which should never be sent anyway)
are discarded prior to storing in the cache. This means that tricks like
`?cachebuster=1` will not work, but since all browsers now support conditional
requests with etags for updating caches, such tricks are obsolete anyway.


### asset.headers
```js
asset.headers = new Headers({
   'accept-ranges': 'bytes',
   'cache-control': 'public, max-age=7200',
   'content-type': 'application/octet-stream',
   'content-disposition': 'inline'
})
```
A `Headers` object used to populate default headers for all subsequently defined
assets. A copy is made for each route, so mutating this will have no effect on
already defined routes. Note that the headers defined in `asset()`,
`content-type` in particular, will take precedence over these values.


### unpack
```js
export function unpack(data, dest={}) -> Object
```
Unpacks the header of the bliss archive stored in `data` (`String`), storing
the results in the `dest` object and returning it. The archive contents are
unpacked on demand when the files are awaited on, but the entire recursive
structure will be available after the call to this function. Normally, this is
called for you automatically on module initialization, so there's no need to
use it.


### base128_decode
```js
export function base128_decode(text, start=0, end=text.length) -> Uint8Array
```
Performs a 7bit to 8bit decoding of (a subset of) `text` (`String`), returning
the corresponding Uint8Array. Normally, this is called for you automatically on
module initialization, so there's no need to use it.
