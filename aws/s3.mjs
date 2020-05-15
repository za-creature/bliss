import {aws_request, aws_sign} from '../aws'


export async function client_upload(fields, timeout=3600*1000) {
    let {algo, date, datetime, credential} = aws_request('s3')

    // add required arguments
    fields['x-amz-algorithm'] = algo
    fields['x-amz-credential'] = credential
    fields['x-amz-date'] = datetime

    // create policy
    let conditions = []
    for(let name in fields)
        conditions.push({[name]: fields[name]})
    fields.policy = btoa(JSON.stringify({
        'expiration': new Date(Date.now() + timeout).toISOString(),
        conditions
    }))

    // sign it
    fields['x-amz-signature'] = await aws_sign(date, 's3', fields.policy)
    return fields
}
