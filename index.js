/*
I don't want them to look back when the future was written
And know we've killed ourselves with nuclear fission and stupid decisions
*/
let segmentate = (method, path) => {
    if(!path.startsWith('/'))
        throw new Error('routes must start with /')
    if(!path.endsWith('/'))
        path += '/'
    return (method.toLowerCase() + path).split('/').map(decodeURIComponent)
}


export default async function router(ev) {
    let req = ev.request
    let url = new URL(req.url)
    let args = [req]
    let node = routes
    for(let segment of segmentate(req.method, url.pathname))
        if(!(node = node.get(segment) || (args.push(segment), node.get('*'))))
            return ev.respondWith(response(`not found: ${req.url}`, 404))

    try {
        ev.respondWith(await node.apply(url, args))
    } catch(err) {
        ev.respondWith(response('internal error', 500))
        console.error(err)
    }
}

// route builder
export let routes = new Map()
export function route(method, path, fn) {
    let node = routes
    let parent, segment
    for(segment of segmentate(method, path)) {
        parent = node
        if(!(node = node.get(segment)))
            parent.set(segment, node = new Map())
    }
    if(typeof node == 'function')
        throw new Error(`duplicate route, ${method + path}`)
    parent.set(segment, fn)
}

// helpers
export function response(body, status=200, headers={}) {
    if(typeof status === 'object') {
        headers = status
        status = 200
    }
    return new Response(body, {status, headers})
}

export let redirect = (url, status) => new Response(null, {
    status: status || 301,
    headers: {
        link: `<${url}>; rel=preload`,
        location: url
    }
})

export let json = (body, status) => response(JSON.stringify(body), status, {
    'content-type': 'application/json'
})

export let render = (fn, ctx) => response(fn(Object.assign(render.defaults, ctx)), {
    'content-type': 'text/html'
})
render.defaults = {}

export let head = route.bind(null, 'head')
export let get = (path, fn) => { route('get', path, fn); head(path, fn) }
export let post = route.bind(null, 'post')
export let put = route.bind(null, 'put')
export let del = route.bind(null, 'delete')
export let patch = route.bind(null, 'patch')
