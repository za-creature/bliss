import list from './list.mjs'


export default function lru(capacity, getter) {
    let map = new Map()
    let [add, pop, oldest] = list()

    let {name} = getter
    return {[name]() {
        let key = arguments.length > 1 ? [].join.call(arguments, '/') : arguments[0]
        let old = map.get(key)
        if(old) {
            pop(old[1])
            map.set(key, [old[0], add(key)])
            return old[0]
        }

        let result = getter.apply(this, arguments)
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
    }}[name]
}
