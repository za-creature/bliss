# bliss/util/lazy
This module exports a `Promise.resolve`-compatible `thenable` object that is
lazily evaluated. Unlike the standard Promise constructor, the `executor`
function is only called once just before the first method from the Promise
prototype is called (e.g. `lazypromise.then(...)`). Used by the assets module
to defer archive unpacking.

## usage
```javascript
import LazyPromise from 'bliss-router/util/lazy'

let a, b

let eager = id => new Promise(res => {
    console.log(id)
    res()
})
let lazy = id => new LazyPromise(res => {
    console.log(id)
    res()
})

a = eager('a') // prints 'a'
b = eager('b') // prints 'b'
b.then()
await a

// ---

a = lazy('a')
b = lazy('b')
b.then() // prints 'b
await a // prints 'a'
```

## extensions
By default, all properties of `Promise.prototype` (per spec, those are `then`,
`catch` and `finally`) are used as transparent hooks that trigger the callback
function. If you patch additional functionality to `Promise.prototype`, all
`LazyPromise`s created afterwards will respect that:
```javascript
import LazyPromise from 'bliss-router/util/lazy'
Promise.prototype.tap = function(fn) {
    return this.then(value => (fn(value), value))
}
new LazyPromise(res => {
    console.log('called')
    res('hello world')
}).tap(message => console.log(message)) // prints 'called', 'hello world'
```
