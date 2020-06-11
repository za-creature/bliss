export default function LazyPromise(cb) {
    // this used to derive from Promise, but at some point V8 optimized `await`
    // to no longer call the patched methods and rely on internal state instead
    // the spec _probably_ allows for this, though I'm currently at a loss on
    // whether Promise is js-extendable at all in the current version (7.8.279).
    let res, rej
    let dummy = new Promise((ok, err) => (res = ok, rej = err))
    for(let prop of Object.getOwnPropertyNames(Promise.prototype))
        if(prop != 'constructor')
            this[prop] = function() {
                if(cb) {
                    let exec = cb
                    cb = null
                    try {
                        exec(res, rej)
                    } catch(err) {
                        rej(err)
                    }
                }
                return dummy[prop].apply(dummy, arguments)
            }
}
