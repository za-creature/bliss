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
export default function(date, mask, utc=false) {
    if(arguments.length == 1 && Object.prototype.toString.call(date) == '[object String]' && !/\d/.test(date)) {
        mask = date
        date = new Date()
    }
    if(isNaN(date = new Date(date)))
        throw TypeError('invalid date')
    mask = String(mask || 'ddd mmm dd yyyy HH:MM:ss')
    utc = utc && 'UTC' || ''

    let d = date[`get${utc}Date`]()
    let D = date[`get${utc}Day`]()
    let m = date[`get${utc}Month`]()
    let y = date[`get${utc}FullYear`]()
    let H = date[`get${utc}Hours`]()
    let M = date[`get${utc}Minutes`]()
    let s = date[`get${utc}Seconds`]()
    let L = date[`get${utc}Milliseconds`]()
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
        'L':    pad(L > 99 ? Math.round(L / 10) : L),
        't':    H < 12 ? 'a'  : 'p',
        'tt':   H < 12 ? 'am' : 'pm',
        'T':    H < 12 ? 'A'  : 'P',
        'TT':   H < 12 ? 'AM' : 'PM',
        'Z':    (String(date).match(timezone) || ['']).pop().replace(timezoneClip, ''),
        'o':    (o > 0 ? '-' : '+') + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
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


let token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|'[^']*'|'[^']*'/g
let timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g
let timezoneClip = /[^-+\dA-Z]/g
let pad = (val, len=2) => {
    val = String(val)
    while(val.length < len)
        val = '0' + val
    return val
}
