import {use} from '../router.mjs'
import {sleep} from '../util.mjs'


export default function register(timeout=30000) {
    let contexts = new Map()
    use(function(next) {
        let tasks = [], names = []
        contexts.set(this, [tasks, names])
        this.enqueue = (task, name) => {
            tasks.push(task)
            names.push(name)
        }
        return next()
    }, async function(next) {
        let limit = sleep(timeout, `max time limit of ${timeout}ms exceeded`)
        try {
            return await next()
        } finally {
            let [tasks, names] = contexts.get(this)
            for(let i=0; i<tasks.length; i++) {
                let task = tasks[i]
                let name = names[i] || i
                try {
                    if(typeof task == 'function')
                        task = task()
                    await Promise.race([task, limit])
                } catch(err) {
                    let reason = err.stack ? '\n' + err.stack : err
                    let message = `background task ${name} failed: ${reason}`
                    this.warn ? this.warn(message) : console.warn(message)
                }
            }
            limit.cancel()
            contexts.delete(this)
        }
    })
}
