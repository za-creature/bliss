import {aws_rest} from '../aws'
import {empty, raise} from '../util'


// low level interface
export default async function request(method, body, headers={}) {
    let res = await aws_rest('dynamodb', 'POST', body, Object.assign(headers, {
        'x-amz-target': `DynamoDB_20120810.${method}`
    }))
    let data = await res.json()
    if((res.status/100|0) != 2) {
        let name = data.__type.split('#')[1]
        let err = new Error(data.message || name)
        err.name = name
        throw err
    }
    return data
}


// js to dynamo (de)serialization
let b64 = (...a) => btoa(String.fromCharCode(...new Uint8Array(...a)))
function serialize_set(s) {
    let values = Array.from(s.values())
    let first = values[0]
    return (
        typeof first == 'number' ? {NS: values.map(String)}
        : typeof first == 'string' ? {SS: values.map(String)}
        : typeof first == 'object' ? {BS:
            first instanceof ArrayBuffer ? values.map(b64)
            : first.buffer instanceof ArrayBuffer
            ? values.map(x => b64(x.buffer, x.byteOffset, x.byteLength))
            : raise(`unsupported binary set type ${typeof first}`, TypeError)
        }
        : raise(`unsupported set type ${typeof first}`, TypeError)
    )
}
export function serialize_val(val) {
    return (
        typeof val == 'string' ? {S: val}
        : typeof val == 'number' ? {N: String(val)}
        : typeof val =='boolean' ? {BOOL: val}
        : typeof val == 'object' ?
            val == null ? {NULL: true}
            : val instanceof Set ? serialize_set(val)
            : val instanceof Map ? {M: serialize(val)}
            : val instanceof ArrayBuffer ? {B: b64(val)}
            : val.buffer instanceof ArrayBuffer
            ? {B: b64(val.buffer, val.byteOffset, val.byteLength)}
            : Array.isArray(val) ? {L: val.map(serialize_val)}
            : {M: serialize(val)}
        : raise(`unsupported type ${typeof val}`, TypeError)
    )
}
export function serialize(map) {
    let result = {}
    for(let [key, value] of (map.entries || Object.entries)(map))
        result[key] = serialize_val(value)
    return result
}

let b64d = s => new Uint8Array(atob(s).split('').map(s => s.charCodeAt(0)))
let defined = x => typeof x != 'undefined'
export function unserialize_val(val) {
    return (
        defined(val.S) ? val.S
        : defined(val.B) ? b64d(val.B)
        : defined(val.N) ? Number(val.N)
        : defined(val.BOOL) ? val.BOOL
        : defined(val.NULL) ? null
        : defined(val.M) ? unserialize(val.M)
        : defined(val.L) ? unserialize(val.L)
        : defined(val.NS) ? new Set(val.NS.map(Number))
        : defined(val.SS) ? new Set(val.SS)
        : defined(val.BS) ? new Set(val.BS.map(b64d))
        : raise(`unsupported value ${val}`, RangeError)
    )
}
export function unserialize(value) {
    if(Array.isArray(value))
        return value.map(unserialize_val)
    else {
        let result = {}
        for(let key in value)
            result[key] = unserialize_val(value[key])
        return result
    }
}


// query expression language
class Term {
    constructor(toString) {
        this.toString = toString
    }
}
let combine = (args, separator='') => enc => args.map(
    arg => arg instanceof Term ? arg.toString(enc) : arg
).join(separator)
let term = (...args) => new Term(combine(args))

class Const extends Term {
    constructor(val) {
        super(([,v]) => v(val))
    }
}
let const_val = (val) => val instanceof Term ? val : new Const(val)

class BooleanExpression extends Term {
    and(other) {
        return bool('(', this, ')and(', other, ')')
    }
    or(other) {
        return bool('(', this, ')or(', other, ')')
    }
    negate() {
        return bool('not(', this, ')')
    }
}
let bool = (...args) => new BooleanExpression(combine(args))

class SortableExpression extends Term {
    between(low, high) {
        return bool(this, ' between ', const_val(low), ' and ', const_val(high))
    }
    in(...values) {
        if(Array.isArray(values[0]))
            values = values[0]
        return bool(this, ' in(', new Term(combine(values.map(const_val), ',')), ')')
    }
}
for(let [key, sep] of Object.entries({
    eq: '=', ne: '<>', lt: '<', lte: '<=', gt: '>', gte: '>='
}))
    SortableExpression.prototype[key] = function(other) {
        return bool(this, sep, const_val(other))
    }


class Source extends Term {
    concat(other) {
        return term('list_append(', this, ',', const_val(other), ')')
    }
    plus(other) {
        return term(this, '+', const_val(other))
    }
    minus(other) {
        return term(this, '-', const_val(other))
    }
}
class Defaultable extends Source {
    default(val) {
        return new Source(combine(['if_not_exists(', this, ',', const_val(val), ')']))
    }
}
class Mutator extends Term {
    constructor(method, toString) {
        super(toString)
        this.method = method
    }
}
let mutate = (method, ...args) => new Mutator(method, combine(args))

class Attribute extends Defaultable {
    constructor(name) {
        super(([key=identity,]=[]) => key(name))
    }
    exists() { return bool('attribute_exists(', this, ')') }
    is(type) { return typeof type === 'undefined'
        ? bool('attribute_not_exists(', this, ')')
        : bool('attribute_type(', this, ',', const_val(
            type == String ? 'S'
            : type == Number ? 'N'
            : type == Boolean ? 'BOOL'
            : type == null ? 'NULL'
            : type == ArrayBuffer ? 'B'
            : type == Array ? 'L'
            : type == Object || type == Map ? 'M'
            : Array.isArray(type) ?
                type.length == 0 ? 'L'
                : type[0] == String ? 'SS'
                : type[0] == Number ? 'NS'
                : type[0] == ArrayBuffer ? 'BS'
                : raise('unsupported set type', RangeError)
                : typeof type == 'object' && empty(type) ? 'M'
            : raise('unsupported type', TypeError)
        ), ')')
    }
    startsWith(prefix) {
        return bool('begins_with(', this, ',', const_val(prefix) ,')')
    }
    includes(substr) {
        return bool('contains(', this, ',', const_val(substr) ,')')
    }
    size() {
        return new SortableExpression(combine(['size(', this, ')']))
    }
    get length() {
        return this.size()
    }
    set(val) {
        if(typeof val === 'undefined')
            return mutate('UNSET', this)
        return mutate('SET', this, '=', const_val(val))
    }
    unset() {
        return this.set()        
    }
    // list mutators
    push(...vals) {
        return this.set(this.default([]).concat(vals))
    }
    unshift(...vals) {
        return this.set(term('list_append(', const_val(vals), ',', this.default([]), ')'))
    }
    // set mutators
    add(...val) {
        return mutate('ADD', this, ' ', const_val(val))
    }
    delete(...val) {
        return mutate('DELETE', this, ' ', const_val(val))
    }
    // number mutators
    inc(offset=1) {
        return this.set(this.default(0).plus(offset))
    }
    dec(offset=1) {
        return this.set(this.default(0).minus(offset))
    }
}
Attribute.prototype.has = Attribute.prototype.includes
Object.defineProperties(Attribute.prototype,
    Object.getOwnPropertyDescriptors(SortableExpression.prototype)
)
export let attr = name => new Attribute(name)
export let not = expr => expr.negate()


// query builder
export function id_generator(dict='abcdefghijklmnopqrstuvwxyz') {
    let count = 0
    return () => {
        let result = []
        let next = count++
        do {
            result.push(dict[next%dict.length])
            next = next/(dict.length)|0
        } while(next)
        return result.join('')
    }
}
export function entity_encoder(keys, vals) {
    let next = id_generator()
    let key_map = {}
    let val_map = {}
    return [key => key.split('.').map(piece => {
        if(!key_map[piece]) {
            let id = `#${next()}`
            key_map[piece] = id
            keys[id] = piece
        }
        return key_map[piece]
    }).join('.'), val => {
        val = serialize_val(val)
        let str = JSON.stringify(val)
        if(!val_map[str]) {
            let id = `:${next()}`
            val_map[str] = id
            vals[id] = val
        }
        return val_map[str]
    }]
}

let identity = x => x
let already_sent = raise.bind(null, 'query already sent', SyntaxError)


function Query(method, table, query, extra={}, parse_response=identity) {
    query.TableName = table
    query.ReturnConsumedCapacity = 'TOTAL'
    let keys = {}
    let values = {}
    let enc = entity_encoder(keys, values)

    let self = Promise.resolve().then(() => {
        if(!empty(keys))
            query.ExpressionAttributeNames = keys
        if(!empty(values))
            query.ExpressionAttributeValues = values
        let temp = request(method, query)
        // disable custom methods
        for(let key in extra)
            self[key] = already_sent
        return temp.then(parse_response)
    })
    // bind custom methods
    for(let key in extra)
        self[key] = (...args) => (extra[key](query, enc, ...args), self)
    return self
}

function search_query(method, table, consistent, cond) {
    let enc
    let query = {ConsistentRead: consistent}
    let req = Query(method, table, query, {_: (q, e) => enc = e})
    req._()
    delete req._
    if(cond) {
        cond instanceof BooleanExpression || raise('invalid query', TypeError)
        query.KeyConditionExpression = cond.toString(enc)
    }

    let self = {
        index: (index, reverse=false) => (
            query.ScanIndexForward = !reverse,
            query.IndexName = index,
            self
        ),
        filter: (cond) => (
            cond instanceof BooleanExpression || raise('invalid filter', TypeError),
            query.FilterExpression = cond.toString(enc),
            self
        ),
        project: (...attrs) => (
            query.ProjectionExpression = attrs.map(enc[0]).join(','),
            self
        ),
        limit: (val) => (query.Limit = val, self),
        count: () => (
            delete query.ProjectionExpression,
            query.Select = 'COUNT',
            cleanup(),
            req.then(res => res.Count)
        ),
        [Symbol.iterator]: function*() {
            cleanup()
            let res
            do {
                if(res) {
                    query.ExclusiveStartKey = res.LastEvaluatedKey
                    req = Query(method, table, query)
                }
                let chunk = null
                yield req.then(r => (res = r, chunk = r.Items.map(unserialize), chunk[0]))
                if(!res)
                    raise('previous entry not awaited on', SyntaxError)
                for(let i=1; i<chunk.length; i++)
                    yield Promise.resolve(chunk[i])
            } while(res.LastEvaluatedKey)
        },
        [Symbol.asyncIterator]: () => {
            let iter = self[Symbol.iterator]()
            return {next: () => {
                let {value} = iter.next()
                return value
                    ? value.then(value => ({value}))
                    : Promise.resolve({done: true})
            }}
        }
    }
    let cleanup = () => {
        for(let key in self)
            self[key] = already_sent
    }
    return self
}

let update_query = (result={}) => (
    result.discard = query => query.ReturnValues = 'NONE',
    result.when = (query, enc, cond) => (
        cond instanceof BooleanExpression || raise('invalid filter', TypeError),
        query.ConditionExpression = cond.toString(enc)
    ),
    [result, res => res.Attributes && unserialize(res.Attributes) || undefined]
)


let is_obj = val => typeof val == 'object' && val || raise('object expected', TypeError)
export let Table = (name, consistent=false) => ({
    // getters
    get: (key, _consistent=consistent) => Query('GetItem', name, {
        ConsistentRead: _consistent,
        Key: serialize(is_obj(key))
    }, {project: (query, enc, ...attrs) =>
        query.ProjectionExpression = attrs.map(enc[0]).join(',')
    }, res => unserialize(res.Item)),
    query: (condition, _consistent=consistent) =>
        search_query('Query', name, _consistent, condition),
    scan: (_consistent=consistent) =>
        search_query('Scan', name, _consistent),
    // mutators
    put: item => Query('PutItem', name, {
        Item: serialize(is_obj(item)),
        ReturnValues: 'ALL_OLD'
    }, ...update_query()),
    delete: key => Query('DeleteItem', name, {
        Key: serialize(is_obj(key)),
        ReturnValues: 'ALL_OLD'
    }, ...update_query()),
    update: key => {
        let expr = new Map()
        return Query('UpdateItem', name, {
            Key: serialize(is_obj(key)),
            ReturnValues: 'ALL_OLD',
            get UpdateExpression() {
                return Array.from(expr.entries())
                            .map(([k, v]) => k + ' ' + v.join(','))
                            .join(' ')
            }
        }, ...update_query({
            set(query, enc, ...expressions) {
                let add = ({method, toString}) => {
                    let dest = expr.get(method)
                    if(!dest)
                        expr.set(method, dest = [])
                    dest.push(toString(enc))
                }
                for(let expression of expressions) {
                    if(expression instanceof Mutator)
                        add(expression)
                    else for(let [key, value] of Object.entries(expression))
                        add(attr(key).set(value))
                }
            }
        }))
    }
})
