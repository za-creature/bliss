# router
At its core, `bliss` is an `on('fetch')` callback function that does path
segmentation, route matching, handler invocation and error handling, all of
which are described in the following chapters. It is the default export of the
'bliss' module, and should be added as a `fetch` handler in your worker:
```javascript
import router from 'bliss'
addEventListener('fetch', router)
```
To build a website however, you must define one or more `routes`, as described
below.


## paths
A `path` is a string consisting of string `segments` separated by `/`, e.g.
```
/index.html
/stylesheets/landing.css
/accounting/2017/09/balance.pdf
```

Multiple consequent `/`s are collapsed into a single `/`. A path implicitly
starts and ends with a `/`. The following paths are all equivalent:
```
index.html
/index.html
/index.html/
////index.html///
```


## routes
A `route` is a tuple consisting of a `path` coupled with a `method` string and
a `handler` function. Routes are unique: there may not be multiple handlers
registered for the same method and path.

A route's `path` may contain one or more wildcard `*` segments which match any
number of non-`/` characters. The original characters from the wildcard segment
are sent as a string argument to the route handler. Segments are matched left to
right, with no backtracking and exact matches taking precedence over wildcard
matches. This means that given the following routes:
```
A: /foo/bar
B: /foo/*
C: /*/baz
```
The mapping would be:
```
/foo/bar -> A()
/foo/baz -> B('baz')
/qux/baz -> C('qux')
/foo/bar/baz -> not_found
```

Even with wildcards, the number of segments in the route must match the number
of segments in the request URL otherwise a 404 is raised (i.e. there is no `**`
double wildcard):

**Warning!** No backtracking inside the router means that route matching is
[context-sensitive](https://en.wikipedia.org/wiki/Noam_Chomsky), with the
following _potentially surprising_ situation being _expected_ behavior:
```
X: /foo/bar/baz
Y: /*/bar

/foo/bar/baz -> X()
/qux/bar -> Y('qux')
/foo/bar -> not_found  (this would be Y('foo') if X did not exist)
```

A route's `method` is the incoming request's HTTP method, lowercased. As with
segments, the `*` wildcard route may be used to match all methods with the
original (lowercased) method being sent as the last argument to the handler.

To define a route, you can use the `route()` function:
```javascript
import {route} from 'bliss'
route('get', '/', () => new Response('hello world'))
```

For convenience, helper functions for frequently used methods are also exported:
```javascript
import {head, get, post, put, del, patch} from 'bliss'
post('/', () => new Response('this resource is read-only', {status: 405}))
```

**Warning!**

The `head()` helper function ignores the response body from the handler. If for
whatever reason you want to return a body from a `HEAD` request, use
`route('head')` instead.

The `get()` helper function also calls the `head()` helper for the same handler.
If you want a route that _only_ matches `GET` requests, use `route('get')`.

The root of the routing tree is exported as `routes` and can be dynamically
inspected or modified (for example, this is the only way to drop a route). Each
node is a [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
that binds route segments to other Maps or handlers. At any depth within the
routing tree, any invocable handler function is bound to the lowercased method
name which itself belongs to a `Map` bound to an empty `''` segment, for example
the following configuration:
```javascript
import {get, post} from 'bliss'

post('/foo/bar', handler1)
get('/foo/bar/baz', handler2)
```
Results in the following routing tree:
```javascript
import {routes} from 'bliss'

routes == {
    'foo': {
        'bar': {
            '': {
                'post': handler1
            }
            'baz': {
                '': {
                    'head': discard_body(handler2),
                    'get': handler2
                }
            }
        }
    }
}
```


## invocation
A route `handler` is invoked with the appropriate
[`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object as
the first argument. If the route contains `*` wildcard segments, their original
values are appended as additional arguments, in their natural order.

The handler must return a
[`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) object,
or a [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) that resolves to a `Response` (hint: `async function` does the latter).
Unhandled (eventual) exceptions are converted into a
[`500 internal error`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/500)
text response, but this can be configured by setting an error handler.

Note: If your handler is an old-school `[async] function() {}`, then `this` is
bound to a [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) object
created from `req.url` where `req` is the first argument. Feel free to use this
if you want to save yourself a couple of CPU cycles.


## error handling
An error handler is a handler that is invoked in special circumstances. They
come in three flavours, are defined by registering a route with no method or
path and at any time, only one handler can be defined for a specific purpose:


### not found
A `not found` error handler is invoked whenever a request is made that does not
match any of the defined routes, including wildcards. It is defined by
registering a route with no method or path and a handler function that takes
**no arguments**:
```javascript
import {response, route} from 'bliss'
route(() => new Response(`not found`, {status: 404}))
```
Registering a new `not found` handler replaces the previous one, and the default
is equivalent to the above example.

_Hint:_ the request is intentionally[^1] not passed to the `not_found` handler,
however you can get the calling `URL` by registering a regular `function() {}`
as a handler, and accessing `this`.


### error
An `error` handler is invoked whenever a `handler`, including the `not found`
handler described above, (
[eventually](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
) throws an exception. It is defined by registering a route with no method or
path and a handler function that takes exactly **two arguments**:
```javascript
import {response, route} from 'bliss'
route((req, err) => {
    console.error(err.stack)
    return new Response('internal error', {status: 500})
})
```
Registering a new `error` handler replaces the previous one, and the default is
equivalent to the above example.

**Warning:** if your `error` handler (eventually) throws an exception, it's up
to cloudflare to decide what happens. Depending on your configuration, your
request might be forwarded to the origin server or converted into a 503 error
message template. Make sure you don't throw from the error handler if you want
to maintain control over output.


### telemetry
A `telemetry` handler, if defined, is always invoked just before the termination
of the routing process, and after any `not found` or `error` handlers as well as
all background tasks have been invoked. The primary use case for a telemetry
handler is submitting logs to a centralized logging and analytics system. It is
defined by registering a route with no method or path and a handler function
that takes exactly **one argument**:
```javascript
import {route} from 'bliss'
route()
```
Registering a new `telemetry` handler replaces the previous one, and there is no
default.


## background tasks
A `background` task is a `Promise` that should complete alongside the `Request`,
but should not block the `Response` from being delivered to the client, for
example updating caches, sending telemetry and finishing non-critical uploads.
Registering a Promise as a background task is at least a hint to the server that
the worker should not be evicted from memory until the task is completed, though
there are no guarantees. Background tasks should only be used for operations
where eventual consistency is sufficient; when strong consistency is required,
you must wait for the promise yourself before returning the response.

You can register background tasks by using an incoming request's `enqueue`
method:
```javascript
import {post} from 'bliss'

post('/resources', async req => {
    let id = await create_resource(req)

    req.enqueue(update_caches(id))

    return new Response('resource created', {status: 201})
})
```


## helpers
The following helper functions and objects are exported for convenience:


### response(body, [status: Number = 200], [headers = {}])
A shorthand for `new Response(body, {status, headers})`:
```javascript
response('hello world')
response(Uint8Array.from([1, 2, 3, 4]), 202)
response(null, 304, {'location': 'https://example.com/'})
response('😎', {'content-type': 'text/plain;encoding=utf-8'})
````


### redirect(url, status=303)
Returns a 3xx response with `url` as the `location` header.


### json(object, status=200)
Returns a `application/json` `Response` with the stringified representation of
`object` as the response body.


### render(fn, ctx)
A helper for template rendering, returns a `text/html` response using the body
returned by `fn(ctx)`, where `ctx` is optionally enriched with properties from
`render.defaults`. Designed for [`rollup`](https://rollupjs.org/guide/en/) and
[`rollup-plugin-pug`](https://github.com/aMarCruz/rollup-plugin-pug) or
compatible interfaces:
```javascript
import template from './home.pug'
import site_data from './data.yaml'

import router, {route, render, redirect} from 'bliss'


render.defaults = site_data
addEventListener('fetch', router)


route('*', '/', async req => {
    let form, errors
    if(method == 'post') {
        form = await req.formData()
        errors = form.validate()
        if(!errors) {
            // do something with `form`
            return redirect('/success')
        }
    }
    return render(template, {form, errors})
})
```
