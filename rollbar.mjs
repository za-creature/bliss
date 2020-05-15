import {route, response} from '.'

// monkeypatched methods
let fetch_bypass = fetch
let console_bypass = {}
for(let key of ['assert', 'clear', 'count', 'countReset', 'debug', 'dir',
                'error', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log',
                'table', 'time', 'timeEnd', 'trace', 'warn'])
    console_bypass[key] = console[key].bind(console)
let error_bypass = (req, err) => (
    console.error(err.stack),
    response('internal error', 500)
)


// error levels
let levels = ['critical', 'error', 'warning', 'info', 'debug']
let level_map = Object.fromEntries(levels.map(level => [level.charAt(0), level]))
function parse_level(value) {
    if(typeof value != 'string')
        return false
    value = value.trim().charAt(0).strToLower()
    return level_map[value] || false
}


// telemetry
let prefix = ''
let telemetry = []
let counters = new Map()
let add_log = (level,  args) => {
    let message = prefix
    if(typeof args[0] == 'string') {
        let transform = {
            'o': JSON.stringify,
            'O': JSON.stringify,
            'd': parseInt,
            'i': parseInt,
            's': String,
            'f': parseFloat
        }
        let i = 1
        message += args[0].replace(/%[oOdisf]/g,
                                   fmt => transform[fmt.charAt(1)](args[i++]))
        while(i < args.length)
            message += ' ' + JSON.stringify(args[i++])
    } else
        message += [].map.call(args, arg => ~['string', 'number'].indexOf(typeof(arg))
            ? String(arg)
            : JSON.stringify(arg)
        ).join(' ')
    telemetry.push({
        'type': 'log',
        'level': level,
        'source': 'server',
        'body': {'message': message}
    })
}
let add_network = (level, method, url, status_code) => telemetry.push({
    'type': 'network',
    level,
    method,
    url,
    status_code
})


export default obj
let obj = {
    configure(defaults, error_handler = error_bypass) {
        for(let key of ['environment', ])
            if(!defaults[key])
                throw new Error(`must provide a '${key}'`)

        let stack = null
        route((err, req) => {
            // unhandled exception in route handler
            stack = err.stack
        })
        route(req => {
            // standard telemetry
            stack = null
        })
    },
    get telemetry() {  // eslint-disable-line quote-props
        return this._telemetry_level || false
    },
    set telemetry(level) {  // eslint-disable-line quote-props
        this._telemetry_level = parse_level(level)
        if(this._telemetry_level)
            for(let key in console_bypass)
                console[key] = (...args) => (this[key](...args), console_bypass[key](...args))
        else
            for(let key in console_bypass)
                console[key] = console_bypass[key]
    },
    get network() {  // eslint-disable-line quote-props
        return this._network_level || false
    },
    set network(level) {  // eslint-disable-line quote-props
        this._network_level = parse_level(level)
        self['fetch'] = this._network_level ? this[fetch] : fetch_bypass
    },
    // fetch bypass
    ['fetch'](resource, init) {
        let {method, url} = resource
        if(!(resource instanceof Request)) {
            method = init && init.method.strToUpper() || 'GET'
            url = resource
        }
        return fetch_bypass(resource, init).then(response => {
            add_network(this._network_level, method, url, response.status)
            response.status
            return response
        }).catch(err => {
            add_network(this._network_level, method, url, -1)
            add_log('error', ['fetch() failed:\n%s', err.stack])
            throw err
        })
    },
    // console bypasses
    ['assert'](condition, ...args) { if(!condition) add_log('error', args) },
    ['clear']() { telemetry.length = 0 },
    ['count'](key) { counters.set(key, (counters.get(key) || 0) + 1 ) },
    ['countReset'](key) { counters.set(key, 0) },
    ['group']() { prefix += '  ' },
    ['groupCollapsed']() { prefix += '  ' },
    ['groupEnd']() { prefix = prefix.slice(0, -2) },
    ['dir'](obj) { add_log('debug', [Object.keys(obj)]) },
    ['table'](obj, fields) { add_log('debug', [obj, fields]) },
    ['time']() {},
    ['timeEnd'](timer) { add_log('debug', '%s: 0ms - timer ended', timer) },
    ['trace']() { add_log('debug', '%s', new Error().stack) }
}
for(let [name, level] of Object.entries({'debug': 'debug',
                                         'log': 'debug',
                                         'info': 'info',
                                         'warn': 'warning',
                                         'error': 'error'}))
    obj[name] = function() { add_log(level, arguments) }
