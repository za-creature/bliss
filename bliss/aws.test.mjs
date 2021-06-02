import {assert} from 'chai'
import aws_config, {aws_sign, aws_rest} from './aws.mjs'

aws_config.key = 'AKIAIOSFODNN7EXAMPLE'
aws_config.secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
aws_config.region = 'us-east-1'


describe('aws', () => {
    it('signs requests', async ()=> {
        // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-post-example.html
        let text = 'eyAiZXhwaXJhdGlvbiI6ICIyMDE1LTEyLTMwVDEyOjAwOjAwLjAwMFoi' +
        'LA0KICAiY29uZGl0aW9ucyI6IFsNCiAgICB7ImJ1Y2tldCI6ICJzaWd2NGV4YW1wbGV' +
        'idWNrZXQifSwNCiAgICBbInN0YXJ0cy13aXRoIiwgIiRrZXkiLCAidXNlci91c2VyMS' +
        '8iXSwNCiAgICB7ImFjbCI6ICJwdWJsaWMtcmVhZCJ9LA0KICAgIHsic3VjY2Vzc19hY' +
        '3Rpb25fcmVkaXJlY3QiOiAiaHR0cDovL3NpZ3Y0ZXhhbXBsZWJ1Y2tldC5zMy5hbWF6' +
        'b25hd3MuY29tL3N1Y2Nlc3NmdWxfdXBsb2FkLmh0bWwifSwNCiAgICBbInN0YXJ0cy1' +
        '3aXRoIiwgIiRDb250ZW50LVR5cGUiLCAiaW1hZ2UvIl0sDQogICAgeyJ4LWFtei1tZX' +
        'RhLXV1aWQiOiAiMTQzNjUxMjM2NTEyNzQifSwNCiAgICB7IngtYW16LXNlcnZlci1za' +
        'WRlLWVuY3J5cHRpb24iOiAiQUVTMjU2In0sDQogICAgWyJzdGFydHMtd2l0aCIsICIk' +
        'eC1hbXotbWV0YS10YWciLCAiIl0sDQoNCiAgICB7IngtYW16LWNyZWRlbnRpYWwiOiA' +
        'iQUtJQUlPU0ZPRE5ON0VYQU1QTEUvMjAxNTEyMjkvdXMtZWFzdC0xL3MzL2F3czRfcm' +
        'VxdWVzdCJ9LA0KICAgIHsieC1hbXotYWxnb3JpdGhtIjogIkFXUzQtSE1BQy1TSEEyN' +
        'TYifSwNCiAgICB7IngtYW16LWRhdGUiOiAiMjAxNTEyMjlUMDAwMDAwWiIgfQ0KICBd' +
        'DQp9'

        assert.equal('8afdbf4008c03f22c2cd3cdb72e4afbb1f6a588f3255ac628749a6' +
                     '6d7f09699e', await aws_sign('20151229', 's3', text))
    })


    it('implements the v4 request spec', async () => {
        let old_fetch = global.fetch
        let old_date = global.Date
        try {
            let url, init
            global.fetch = (_url, _init) => {
                url = _url
                init = _init
                return 'mock'
            }
            global.Date = function() {
                return new old_date(1552239972000)
            }
            assert.equal(await aws_rest('s3', 'GET'), 'mock')
            assert.equal(new URL(url).href, 'https://s3.us-east-1.amazonaws.com/')
            assert.equal(init.method, 'GET')
            assert.equal(init.headers.host, 's3.us-east-1.amazonaws.com')
            assert.equal('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca4' +
                         '95991b7852b855', init.headers['x-amz-content-sha256'])
            assert.equal('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/2' +
                         '0190310/us-east-1/s3/aws4_request, SignedHeaders=c' +
                         'ontent-type;host;x-amz-content-sha256;x-amz-date, ' +
                         'Signature=7d850b2e6005cf3f15b454d7245b8443c6bfa915' +
                         'ea5aac792c33195466433481', init.headers.authorization)
        } finally {
            global.fetch = old_fetch
            global.Date = old_date
        }
    })
})
