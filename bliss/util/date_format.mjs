/*
 * Date Format 1.2.3
 * (c) 2007-2009 Steven Levithan <stevenlevithan.com>
 * MIT license
 *
 * Includes enhancements by Scott Trenda <scott.trenda.net>
 * and Kris Kowal <cixar.com/~kris.kowal/>
 *
 * Further modified for use in bliss, original taken from
 * http://stevenlevithan.com/assets/misc/date.format.js
 *
 * Accepts a date, a mask, or a date and a mask.
 * Returns a formatted version of the given date.
 * The date defaults to the current date/time.
 */
let token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[loS]|'[^']*'/g
let pad = (val, len=2) => {
    val = String(val)
    while(val.length < len)
        val = '0' + val
    return val
}
export default function(date, mask, utc=false) {
    if(arguments.length == 1 && Object.prototype.toString.call(date) == '[object String]' && !/\d/.test(date)) {
        mask = date
        date = new Date()
    }
    if(isNaN(date = new Date(date)))
        throw TypeError('invalid date')
    mask = String(mask || 'ddd mmm dd yyyy HH:MM:ss')
    utc = utc && 'getUTC' || 'get'

    let d = date[`${utc}Date`]()
    let D = date[`${utc}Day`]()
    let m = date[`${utc}Month`]()
    let y = date[`${utc}FullYear`]()
    let H = date[`${utc}Hours`]()
    let M = date[`${utc}Minutes`]()
    let s = date[`${utc}Seconds`]()
    let L = date[`${utc}Milliseconds`]()
    let o = date.getTimezoneOffset()
    let map = {
        'd':    d,
        'dd':   pad(d),
        'ddd':  days[D],
        'dddd': days[D + 7],
        'm':    m + 1,
        'mm':   pad(m + 1),
        'mmm':  months[m],
        'mmmm': months[m + 12],
        'yy':   String(y).slice(2),
        'yyyy': y,
        'h':    H % 12 || 12,
        'hh':   pad(H % 12 || 12),
        'H':    H,
        'HH':   pad(H),
        'M':    M,
        'MM':   pad(M),
        's':    s,
        'ss':   pad(s),
        'l':    pad(L, 3),
        't':    H < 12 ? 'a'  : 'p',
        'tt':   H < 12 ? 'am' : 'pm',
        'T':    H < 12 ? 'A'  : 'P',
        'TT':   H < 12 ? 'AM' : 'PM',
        'o':    (o > 0 /* c8 ignore next */ ? '-' : '+') + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
        'S':    ['th', 'st', 'nd', 'rd'][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
    }

    return mask.replace(token, _ => _ in map ? map[_] : _.slice(1, _.length-1))
}


// Internationalization strings
export let days = [
    // short
    'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',

    // long
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
    'Saturday'
]

export let months = [
    // short
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct',
    'Nov', 'Dec',

    // long
    'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'
]
