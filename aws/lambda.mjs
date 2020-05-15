import {aws_rest} from '../aws'
import {enc} from '../util'


export default (name, version, context=null) => {
    let path = `/2015-03-31/functions/${enc(name)}/invocations`
    if(version)
        path += `?Qualifier=${enc(version)}`
    let headers = {'x-amz-log-type': 'Tail'}
    if(context) {
        if(typeof context != 'string')
            context = JSON.stringify(context)
        headers['x-amz-client-context'] = context
    }

    let raise = (message, res) => {
        let log = res.headers.get('x-amz-log-result')
        if(log)
            message += `\n\nLog: ${atob(log)}`
        res.text().then(_ => console.log(_))
        throw Object.assign(new Error(message), {res, log})
    }

    let factory = (type) => async (args) => {
        headers['x-amz-invocation-type'] = type
        let res = await aws_rest('lambda', 'POST', path, args, headers)
        if(!res.ok)
            raise(res.statusText, res)
        if(res.headers.has('x-amz-function-error'))
            raise('call failed', res)
        return res.json()
    }

    let fn = factory('RequestResponse') 
    fn.enqueue = factory('Event')
    return fn
}
