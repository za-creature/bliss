import {use} from '../router.mjs'


let START = 50
let FACTOR = 3.465002966126506045441146853
let LENGTH = 10
let DEFAULT_PERIOD = new Array(LENGTH)
for(let i=0,v=START; i<LENGTH; i++,v*=FACTOR)
    DEFAULT_PERIOD[i] = v|0

const DATE_NOW = Date.now.bind(Date)
let current
let now = () => current || DATE_NOW()
let pending = new Set()
export default function register(patch=false, period=DEFAULT_PERIOD) {
    if(patch)
        Date.now = now

    let stop = i => timer[i] && (timer[i] = clearInterval(timer[i]))
    let restart = i => (stop(i), time[i] = current, timer[i] = setInterval(tick[i], period[i]))

    let len = period.length
    let timer = new Array(len)
    let time = new Array(len)
    let tick = new Array(len)
    for(let i=0; i<len; i++)
        tick[i] = () => {
            let now = time[i] += period[i]
            if(now > current) {
                current = now
                for(let j=0; j<i; j++)
                    restart(j)
            }
        }

    use(function(next) {
        pending.add(this)
        current = DATE_NOW()
        this.now = now
        for(let i=0; i<len; i++)
            restart(i)
        return next()

    }, async function(next) {
        try {
            return await next()
        } finally {
            pending.delete(this)
            if(!pending.size)
                for(let i=0; i<len; i++)
                    stop(i)
        }
    })
}
