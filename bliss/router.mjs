export default function router(ev) {
    const req = ev.request
    const url = new URL(req.url)
    let args = [req]
    let node = routes
    for(let segment of split_segments(req.method, url.pathname))
        if(!(node = node.get(segment) || (args.push(segment), node.get('*')))) {
            node = not_found, args = [req]
            break
        }

    let res = _try(() => middleware.call(req, () => node.apply(url, args)))
              .catch(err => error(req, err)); ev.respondWith(finalizer && res
              .finally(() => ev.waitUntil(finalizer.call(req, () => {}))) || res)
}
const _try = Promise.prototype.then.bind(Promise.resolve()) // Promise.resolve().then

function split_segments(method, path) {
    let segments = []
    for(let segment of path.split('/'))
        if(segment)
            segments.push(decodeURIComponent(segment))
    segments.push('', method.toLowerCase())
    return segments
}


// route builder
export let routes = new Map()
export function route(method, path, fn) {
    if(typeof method == 'function')
        return void (method.length == 2 ? error = method : not_found = method)
    let node = routes
    let parent, segment
    for(segment of split_segments(method, path)) {
        parent = node
        if(!(node = node.get(segment)))
            parent.set(segment, node = new Map())
    }
    if(typeof node == 'function')
        throw new Error(`duplicate route: ${method} ${path}`)
    parent.set(segment, fn)
}
export let head = (path, fn) => route('head', path, function() {
    return Promise.resolve(fn.apply(this, arguments)).then(res => new Response(null, res))
})
export let get = (path, fn) => (head(path, fn), route('get', path, fn))
export let post = route.bind(null, 'post')
export let put = route.bind(null, 'put')
export let patch = route.bind(null, 'patch')
export let del = route.bind(null, 'delete')


// middleware
export function use(handler, cleanup=null) {
    if(handler) {
        let prev = middleware
        middleware = function(next) { return prev.call(this, handler.bind(this, next)) }
    }
    if(cleanup) {
        let prev = finalizer || _try
        finalizer = function(next) { return prev.call(this, cleanup.bind(this, next)) }
    }
}


// helpers
export function response(body, status=200, headers={}) {
    if(typeof status == 'object')
        headers = status, status = 200
    return new Response(body, {status, headers})
}
export let redirect = (url, status=303) => Response.redirect(url, status)
export let json = (object, status) => response(JSON.stringify(object), status, {
    'content-type': 'application/json'
})
export let render = (fn, ctx) => response(fn({...render.defaults, ...ctx}), {
    'content-type': 'text/html'
})


// state machine
let not_found, error, middleware, finalizer
export function reset() {
    routes.clear()
    not_found = req => response(`not found: ${req.url}`, 404)
    error = (req, err) => (console.error(err), response('internal error', 500))
    middleware = _try
    finalizer = void 0
    render.defaults = {}
}
reset()
