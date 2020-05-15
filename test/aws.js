import {assert} from 'chai'
import config, {aws_sign, aws_rest} from '../aws'

config.key = 'AKIAIOSFODNN7EXAMPLE'
config.secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
config.region = 'us-east-1'


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

        assert(await aws_sign('20151229', 's3', text) == '8afdbf4008c03f22c2' +
            'cd3cdb72e4afbb1f6a588f3255ac628749a66d7f09699e')
    })


    it('implements the v4 request spec', async () => {
        let old_fetch = self.fetch
        let old_date = self.Date
        try {
            let url, init
            self.fetch = (_url, _init) => {
                url = _url
                init = _init
                return 'mock'
            }
            self.Date = function() {
                return new old_date(2019, 2, 10, 19, 46, 12)
            }
            assert(await aws_rest('s3', 'GET') == 'mock')
            assert(new URL(url).href == 'https://s3.us-east-1.amazonaws.com/')
            assert(init.method == 'GET')
            assert(init.headers.host == 's3.us-east-1.amazonaws.com')
            assert(init.headers['x-amz-content-sha256'] == 'e3b0c44298fc1c14' +
                '9afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
            assert(init.headers.authorization == 'AWS4-HMAC-SHA256 Credentia' +
                'l=AKIAIOSFODNN7EXAMPLE/20190310/us-east-1/s3/aws4_request, ' +
                'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-' +
                'date, Signature=7d850b2e6005cf3f15b454d7245b8443c6bfa915ea5' +
                'aac792c33195466433481')
        } finally {
            self.fetch = old_fetch
            self.Date = old_date
        }
    })
})