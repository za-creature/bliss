import {aws_rest} from '../aws.mjs'
import {base64_encode, base64_decode,
        is_binary, is_string, json_encode, url_encode} from '../util.mjs'


export default (name, context=null) => {
    let path = `/2015-03-31/functions/${url_encode(name)}/invocations`
    let headers = {'x-amz-log-type': 'Tail'}
    if(context) {
        if(!is_string(context) && !is_binary(context))
            context = json_encode(context)
        headers['x-amz-client-context'] = base64_encode(context)
    }

    let factory = (type) => async (args) => {
        headers['x-amz-invocation-type'] = type
        let res = await aws_rest('lambda', 'POST', path, args, headers)
        let err = res.headers('x-amz-function-error') || !res.ok && res.statusText
        if(err) {
            let log = res.headers.get('x-amz-log-result')
            if(log)
                err += `\n\nLog: ${base64_decode(log)}`
            throw Object.assign(new Error(err), {res, log})
        }
        return res.json()
    }

    let fn = factory('RequestResponse')
    fn.enqueue = factory('Event')
    return fn
}
