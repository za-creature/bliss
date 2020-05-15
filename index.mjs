/*
I don't want them to look back when the future was written
And know we've killed ourselves with nuclear fission and stupid decisions
*/
export default function router(ev) {
    let req = ev.request
    let url = new URL(req.url)
    let args = [req]
    let node = routes
    for(let segment of split_segments(req.method, url.pathname))
        if(!(node = node.get(segment) || (args.push(segment), node.get('*')))) {
            node = not_found, args = [req]
            break
        }

    let tasks = init_tasks(req)
    ev.respondWith(_try.then(() => node.apply(url, args))
                       .catch(err => error(req, err))
                       .finally(() => ev.waitUntil(flush_tasks(tasks)))
    )
}
let _try = Promise.resolve()
let not_found = req => response(`not found: ${req.url}`, 404)
let error = (req, err) => (console.error(err.stack), response('internal error', 500))
let telemetry = null


let split_segments = (method, path) => {
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
    if(typeof method == 'function') {
        if(method.length == 2)
            error = method
        else if(method.length == 1)
            telemetry = method
        else
            not_found = method
        return
    }
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
    return Promise.resolve(fn(...arguments)).then(res => new Response(null, res))
})
export let get = (path, fn) => (head(path, fn), route('get', path, fn))
export let post = route.bind(null, 'post')
export let put = route.bind(null, 'put')
export let del = route.bind(null, 'delete')
export let patch = route.bind(null, 'patch')


// background tasks
let init_tasks = req => {
    let tasks = []
    req.enqueue = tasks.push.bind(tasks)
    return tasks
}
let flush_tasks = tasks => Promise.allSettled(tasks).then(results => (
    results.forEach(({reason}) => reason && console.warn(reason.stack || reason)),
    (tasks.length = 0),
    telemetry && telemetry()
))


// helpers
export function response(body, status=200, headers={}) {
    if(typeof status == 'object') {
        headers = status
        status = 200
    }
    return new Response(body, {status, headers})
}
export let redirect = (url, status=303) => response(null, status, {'location': url})
export let json = (object, status) => response(JSON.stringify(object), status, {
    'content-type': 'application/json'
})

export let render = (fn, ctx) => response(fn(Object.assign({}, render.defaults, ctx)), {
    'content-type': 'text/html'
})
render.defaults = {}
