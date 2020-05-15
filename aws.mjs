import {enc, hex, hmac, sha256} from './util'


let config = {
    key: '', // eslint-disable-line quote-props
    secret: '', // eslint-disable-line quote-props
    region: '' // eslint-disable-line quote-props
}
export default config


let algo = 'AWS4-HMAC-SHA256'
export function aws_request(service) {
    let datetime = new Date()
        .toISOString()
        .replace(/[:-]|\.\d{3}/g, '')
        .substr(0, 17)
    let date = datetime.substr(0, 8)
    let qual = `${date}/${config.region}/${service}/aws4_request`
    let credential = `${config.key}/${qual}`

    return {algo, credential, date, datetime, qual}
}


export function aws_sign(date, service, message) {
    return hmac(`AWS4${config.secret}`, date)
    .then(_ => hmac(_, config.region))
    .then(_ => hmac(_, service))
    .then(_ => hmac(_, 'aws4_request'))
    .then(_ => hmac(_, message))
    .then(hex)
}


//                             service, method, [url], [body, [headers]]
export async function aws_rest(service, method, url='/', body=null, headers={}) {
    // param juggling
    if(typeof url != 'string') {
        headers = body
        body = url
        url = '/'
    }
    if(body && typeof body != 'string')
        body = JSON.stringify(body)
    if(!headers)
        headers = {}

    // new request
    let {algo, credential, date, datetime, qual} = aws_request(service)
    let host = `${service.replace('ses', 'email')}.${config.region}.amazonaws.com`
    url = new URL(url, `https://${host}`)
    let body_hash = hex(await sha256(body || ''))

    // add required headers
    headers['host'] = headers['host'] || host
    headers['content-type'] = headers['content-type'] || 'application/x-amz-json-1.0'
    headers['x-amz-date'] = datetime
    headers['x-amz-content-sha256'] = body_hash

    // create and sign canonical form request
    let canonical_args = Array.from(url.searchParams.entries()).map(
        ([k, v]) => `${enc(k)}=${enc(v)}`
    ).sort().join('&')

    let canonical_headers = Object.keys(headers).map(
        _ => `${_.toLowerCase()}:${headers[_].trim().replace(/\s+/g, ' ')}`
    ).sort().join('\n') + '\n'

    let signed_headers = Object.keys(headers).map(
        _ => _.toLowerCase()
    ).sort().join(';')

    let canonical_request = [
        method,
        url.pathname,
        canonical_args,
        canonical_headers,
        signed_headers,
        body_hash
    ].join('\n')
    let hash = hex(await sha256(canonical_request))

    // sign request
    let challenge = [algo, datetime, qual, hash].join('\n')
    let signature = await aws_sign(date, service, challenge)
    headers['authorization'] = `${algo} Credential=${credential}, ` +
                               `SignedHeaders=${signed_headers}, ` +
                               `Signature=${signature}`
    return fetch(url.toString(), {method, headers, body})
}
