import {assert} from 'chai'
//import config from '../aws'
import {utf8} from '../util'
import request, {
    serialize_val, unserialize_val,
    entity_encoder, id_generator,
    attr, not, Table
} from '../aws/dynamo'


describe('dynamo', () => {
    let old_fetch, req, res, method, status
    before(() => (old_fetch = global.fetch, global.fetch = async (...a) => {
        let r = new Request(...a)
        req = JSON.parse(r.body)
        method = r.headers.get('x-amz-target').split('.')[1]
        return {status, json: async () => res}
    }))
    after(() => global.fetch = old_fetch)
    beforeEach(() => (status = 200, req = null, res = null))


    describe('request', () => {
        it('sends the method and serialized body', async () => {
            res = {}
            await request('FooBar', {Baz: 'Qux'})
            assert(method == 'FooBar')
            assert.deepEqual(req, {Baz: 'Qux'})
        })

        it('raises on error', async () => {
            status = 400
            res = {__type: 'common#oopsie', message: 'no can do'}
            try {
                await request('method', {})
                throw new Error('bad error')
            } catch(err) {
                assert(err.name == 'oopsie')
                assert(err.message == 'no can do')
            }
        })
    })


    describe('serialize', () => {
        it('supports primitives', () => {
            assert.deepEqual(serialize_val(1), {N: '1'})
            assert.deepEqual(serialize_val(3.14), {N: '3.14'})
            assert.deepEqual(serialize_val(true), {BOOL: true})
            assert.deepEqual(serialize_val(false), {BOOL: false})
            assert.deepEqual(serialize_val('hi'), {S: 'hi'})
            assert.deepEqual(serialize_val(null), {NULL: true})
        })

        it('handles binary data', () => {
            assert.deepEqual(serialize_val(utf8('hi')), {B: 'aGk='})
            assert.deepEqual(serialize_val(new Uint8Array([104, 105])), {B: 'aGk='})
        })

        it('handles lists and maps', () => {
            assert.deepEqual(serialize_val([1, 'a']), {L: [{N: '1'}, {S: 'a'}]})
            assert.deepEqual(serialize_val([{x: 1}]), {L: [{M: {x: {N: '1'}}}]})
        })

        it('supports sets', () => {
            assert.deepEqual(serialize_val(new Set(['a', 'b'])), {SS: ['a', 'b']})
            assert.deepEqual(serialize_val(new Set([1, 2])), {NS: ['1', '2']})
            assert.deepEqual(serialize_val(new Set([utf8('hi')])), {BS: ['aGk=']})
            assert.deepEqual(serialize_val(new Set([new Uint8Array([104, 105])])), {BS: ['aGk=']})
            assert.throws(() => serialize_val(new Set([{}])), 'binary set type')
            assert.throws(() => serialize_val(new Set([false])), 'set type')
        })
    })


    describe('unserialize', () => {
        it('handles primitives', () => {
            assert(unserialize_val({N: '1'}) == 1)
            assert(unserialize_val({N: '3.14'}) == 3.14)
            assert(unserialize_val({BOOL: true}) == true)
            assert(unserialize_val({BOOL: false}) == false)
            assert(unserialize_val({S: 'hi'}) == 'hi')
            assert(unserialize_val({NULL: true}) == null)
        })

        it('supports binary data', () => {
            assert.deepEqual(unserialize_val({B: 'aGk='}), new Uint8Array([104, 105]))
        })

        it('supports lists and maps', () => {
            assert.deepEqual(unserialize_val({L: [{N: '1'}, {S: 'a'}]}), [1, 'a'])
            assert.deepEqual(unserialize_val({L: [{M: {x: {N: '1'}}}]}), [{x: 1}])
        })

        it('handles sets', () => {
            assert.deepEqual(unserialize_val({SS: ['a', 'b']}), new Set(['a', 'b']))
            assert.deepEqual(unserialize_val({NS: ['1', '2']}), new Set([1, 2]))
            assert.deepEqual(unserialize_val({BS: ['aGk=']}), new Set([new Uint8Array([104, 105])]))
        })
    })


    describe('id_generator', () => {
        let iter = id_generator()

        it('iterates through the alphabet', () => {
            assert(iter() == 'a')
            for(let i=0; i<24; i++)
                iter()
            assert(iter() == 'z')
        })

        it('changes magnitude', () => {
            assert(iter() == 'ab')
            for(let i=0; i<24; i++)
                iter()
            assert(iter() == 'zb')
            for(let i=0; i<24*26; i++)
                iter()
            assert(iter() == 'aab')
            assert(iter() == 'bab')
        })
    })


    describe('entity_encoder', () => {
        it('encodes keys', () => {
            let res = {}
            let [enc,] = entity_encoder(res)
            assert(enc('foo') === '#a')
            assert(res['#a'] === 'foo')
        })

        it('supports nested keys', () => {
            let res = {}
            let [enc,] = entity_encoder(res)
            assert(enc('foo.bar') === '#a.#b')
            assert(res['#a'] === 'foo')
            assert(res['#b'] === 'bar')
        })

        it('encodes values', () => {
            let res = {}
            let [,enc] = entity_encoder(undefined, res)
            assert(enc('bar') === ':a')
            assert.deepEqual(res[':a'], {S: 'bar'})
        })

        it('shares and reuses the keyspaces', () => {
            let keys = {}
            let vals = {}
            let [key, val] = entity_encoder(keys, vals)
            assert(key('foo') === '#a')
            assert(key('foo') === '#a')
            assert(val('foo') === ':b')
            assert(val('foo') === ':b')
            assert(keys['#a'] === 'foo')
            assert.deepEqual(vals[':b'], {S: 'foo'})
        })
    })


    describe('attr', () => {
        let enc = [x => `#${x}`, x => `:${x}`]
        it('encodes keys', () => {
            assert(attr('k').toString() == 'k')
            assert(attr('a.path').toString(enc) == '#a.path')
        })

        it('supports arithmetic', () => {
            assert(attr('k').eq('v').toString(enc) == '#k=:v')
            assert(attr('k').ne('v').toString(enc) == '#k<>:v')
            assert(attr('k').lt(1).toString(enc) == '#k<:1')
            assert(attr('k').lte(2).toString(enc) == '#k<=:2')
            assert(attr('k').gt(3).toString(enc) == '#k>:3')
            assert(attr('k').gte(4).toString(enc) == '#k>=:4')
        })

        it('handles range', () => {
            assert(attr('k').between(5, 6)
                   .toString(enc) == '#k between :5 and :6')
            assert(attr('k').in(5, 6, 7)
                   .toString(enc) == '#k in(:5,:6,:7)')
        })

        it('exposes logical operations', () => {
            assert(attr('a').eq('a')
                   .and(attr('b').eq('b'))
                   .toString(enc) == '(#a=:a)and(#b=:b)')
            assert(attr('a').eq('a')
                   .or(attr('b').eq('b'))
                   .toString(enc) == '(#a=:a)or(#b=:b)')
            assert(not(attr('k').gt('v')).toString(enc) === 'not(#k>:v)')
            assert(attr('a').eq('a')
                   .and(attr('b').eq('b'))
                   .or(attr('c').eq('c'))
                   .toString(enc) == '((#a=:a)and(#b=:b))or(#c=:c)')
            assert(attr('a').eq('a')
                   .and(attr('b').eq('b')
                        .or(attr('c').eq('c')))
                   .toString(enc) == '(#a=:a)and((#b=:b)or(#c=:c))')
            assert(attr('a').eq('a')
                   .and(attr('b').eq('b'))
                   .or(attr('c').eq('c'))
                   .negate()
                   .toString(enc) == 'not(((#a=:a)and(#b=:b))or(#c=:c))')
            assert(attr('a').eq('a')
                   .and(attr('b').eq('b')
                        .or(attr('c').eq('c'))
                        .negate())
                   .toString(enc) == '(#a=:a)and(not((#b=:b)or(#c=:c)))')
            assert(attr('a').eq('a')
                   .negate()
                   .and(attr('b').eq('b'))
                   .or(attr('c').eq('c'))
                   .toString(enc) == '((not(#a=:a))and(#b=:b))or(#c=:c)')
        })

        it('handles types correctly', () => {
            assert(attr('k').exists().toString(enc) == 'attribute_exists(#k)')
            assert(attr('k').is(String).toString(enc) == 'attribute_type(#k,:S)')
            assert(attr('k').is(Number).toString(enc) == 'attribute_type(#k,:N)')
            assert(attr('k').is(Boolean).toString(enc) == 'attribute_type(#k,:BOOL)')
            assert(attr('k').is(undefined).toString(enc) == 'attribute_not_exists(#k)')
            assert(attr('k').is(null).toString(enc) == 'attribute_type(#k,:NULL)')
            assert(attr('k').is(ArrayBuffer).toString(enc) == 'attribute_type(#k,:B)')
            assert(attr('k').is(Array).toString(enc) == 'attribute_type(#k,:L)')
            assert(attr('k').is([]).toString(enc) == 'attribute_type(#k,:L)')
            assert(attr('k').is(Object).toString(enc) == 'attribute_type(#k,:M)')
            assert(attr('k').is(Map).toString(enc) == 'attribute_type(#k,:M)')
            assert(attr('k').is({}).toString(enc) == 'attribute_type(#k,:M)')
            assert(attr('k').is([String]).toString(enc) == 'attribute_type(#k,:SS)')
            assert(attr('k').is([Number]).toString(enc) == 'attribute_type(#k,:NS)')
            assert(attr('k').is([ArrayBuffer]).toString(enc) == 'attribute_type(#k,:BS)')
            assert.throws(() => attr('k').is([5]), 'set type')
            assert.throws(() => attr('k').is('foo'), 'type')
        })

        it('supports substring / set operations', () => {
            assert(attr('k').startsWith('p').toString(enc) == 'begins_with(#k,:p)')
            assert(attr('k').includes('s').toString(enc) == 'contains(#k,:s)')
            assert(attr('k').length.gt(0).toString(enc) == 'size(#k)>:0')
        })
    })


    describe('Table', () => {
        let table = Table('test')
        beforeEach(() => res = {Item: {}})
        describe('get', async () => {
            it('returns a promise', () => {
                assert(typeof table.get({id: 1}).then == 'function')
            })

            it.skip('batches queries in the same ioloop iteration', async () => {
                table.get({id: 1})
                table.get({id: 2})
                await new Promise(r => setTimeout(r, 1))
                assert(typeof req.RequestItems == 'object')
            })

            it('only triggers after await', async () => {
                table.get({id: 1})
                assert(req == null)
                await new Promise(r => setTimeout(r, 1))
                assert(method == 'GetItem')
                assert(req.TableName == 'test')
                assert(req.Key.id.N == '1')
                assert(req.ReturnConsumedCapacity == 'TOTAL')
            })

            it('respects consistency', async () => {
                await table.get({id: 1})
                assert(req.ConsistentRead == false)
                await table.get({id: 1}, true)
                assert(req.ConsistentRead == true)
                await Table('test', true).get({id: 1}, false)
                assert(req.ConsistentRead == false)
                await Table('test', true).get({id: 1})
                assert(req.ConsistentRead == true)
            })

            it('is projectable', async () => {
                await table.get({id: 1}).project('bar')
                assert(req.ProjectionExpression == '#a')
                assert(req.ExpressionAttributeNames['#a'] == 'bar')
            })

            it('returns the deserialized the response', async () => {
                res = {Item: {id: {N: '1'}}}
                assert.deepEqual(await table.get({id: 1}), {id: 1})
            })
        })


        describe('scan', () => {
            it('only triggers after await', async () => {
                table.scan().filter(attr('id').eq(1))
                assert(req == null)
                await new Promise(r => setTimeout(r, 1))
                assert(method == 'Scan')
                assert(req.FilterExpression == '#a=:b')
            })

            it('respects consistency', async () => {
                table.scan()
                await new Promise(r => setTimeout(r, 1))
                assert(req.ConsistentRead == false)
                table.scan(true)
                await new Promise(r => setTimeout(r, 1))
                assert(req.ConsistentRead == true)
                Table('test', true).scan(false)
                await new Promise(r => setTimeout(r, 1))
                assert(req.ConsistentRead == false)
                Table('test', true).scan()
                await new Promise(r => setTimeout(r, 1))
                assert(req.ConsistentRead == true)
            })

            it('is iterable', async () => {
                assert(typeof table.scan()[Symbol.iterator] == 'function')

                res = {Items: [
                    {id: {N: '1'}},
                    {id: {N: '2'}},
                    {id: {N: '3'}}
                ], LastEvaluatedKey: 'foo'}
                let c = 0
                for(let item of table.scan()) {
                    item = await item
                    res = {Items: [
                        {id: {N: '4'}},
                        {id: {N: '5'}},
                        {id: {N: '6'}}
                    ]}
                    assert(item.id == ++c)
                    if(c > 3) {
                        assert(req.ExclusiveStartKey == 'foo')
                    }
                }
                assert(c == 6)
            })

            it('turns into a promise when counting', async () => {
                res = {Count: 6}
                assert(await table.scan().count() == 6)
            })

            it('is indexable', async () => {
                res = {Count: 3.14}
                assert(await table.scan().index('foo').count() == 3.14)
                assert(req.IndexName == 'foo')
            })
        })


        describe('query', () => {
            it('rejects non-boolean conditions', () => {
                assert.throws(() => table.query('foo'), 'invalid query')
                assert.throws(() => table.query(attr('foo')), 'invalid query')
                assert.throws(() => table.query(attr('foo').length), 'invalid query')
            })

            it('is async-iterable', async () => {
                res = {Items: [{id: {N: '1'}}], LastEvaluatedKey: 'foo'}
                let c = 0
                for await(let item of table.query(attr('foo').eq('bar'))) {
                    res = {Items: [{id: {N: '2'}}]}
                    assert(item.id == ++c)
                    if(c > 1)
                        assert(req.ExclusiveStartKey == 'foo')
                }
                assert(req.KeyConditionExpression == '#a=:b')
                assert(c == 2)
            })

            it('integration test', async () => {
                res = {Items: []}
                await (table
                    .query(attr('foo').eq('bar')
                           .and(attr('bar').gt(5)))
                    .index('idx', true)
                    .filter(attr('baz').in('qux', 'asd'))
                    .project('x', 'y', 'z')
                    .limit(666)
                )[Symbol.iterator]().next().value
                assert(method == 'Query')
                assert.deepEqual(req, {
                    ConsistentRead: false,
                    TableName: 'test',
                    ReturnConsumedCapacity: 'TOTAL',
                    KeyConditionExpression: '(#a=:b)and(#c>:d)',
                    ScanIndexForward: false,
                    IndexName: 'idx',
                    FilterExpression: '#e in(:f,:g)',
                    ProjectionExpression: '#h,#i,#j',
                    Limit: 666,
                    ExpressionAttributeNames: {
                        '#a': 'foo',
                        '#c': 'bar',
                        '#e': 'baz',
                        '#h': 'x',
                        '#i': 'y',
                        '#j': 'z',
                    },
                    ExpressionAttributeValues: {
                        ':b': {S: 'bar'},
                        ':d': {N: '5'},
                        ':f': {S: 'qux'},
                        ':g': {S: 'asd'}
                    }
                })

                // count
                await table
                    .query(attr('foo').eq('bar')
                           .and(attr('bar').gt(5)))
                    .index('idx')
                    .filter(attr('baz').in('qux', 'asd'))
                    .limit(666)
                    .count()
                assert.deepEqual(req, {
                    ConsistentRead: false,
                    TableName: 'test',
                    ReturnConsumedCapacity: 'TOTAL',
                    KeyConditionExpression: '(#a=:b)and(#c>:d)',
                    ScanIndexForward: true,
                    IndexName: 'idx',
                    FilterExpression: '#e in(:f,:g)',
                    Limit: 666,
                    ExpressionAttributeNames: {
                        '#a': 'foo',
                        '#c': 'bar',
                        '#e': 'baz',
                    },
                    ExpressionAttributeValues: {
                        ':b': {S: 'bar'},
                        ':d': {N: '5'},
                        ':f': {S: 'qux'},
                        ':g': {S: 'asd'}
                    },
                    Select: 'COUNT'
                })
            })
        })


        describe('put', () => {
            it('requires objects as item', () => {
                assert.throws(() => table.put('hello'), 'object expected')
            })

            it('is whenable', async () => {
                res = {Attributes: {foo: {S: 'bar'}, baz: {S: 'qux'}}}
                assert.deepEqual(
                    await table.put({foo: 'bar'}).when(attr('baz').eq('qux')),
                    {foo: 'bar', baz: 'qux'}
                )
                assert(method == 'PutItem')
                assert(req.ConditionExpression == '#a=:b')
            })

            it('is discardable', async () => {
                res = {}
                assert(typeof await table.put({foo: 'bar'}).discard() == 'undefined')
                assert(req.ReturnValues == 'NONE')
            })
        })


        describe('delete', () => {
            it('requires objects as keys', () => {
                assert.throws(() => table.delete('hello'), 'object expected')
            })

            it('is whenable', async () => {
                res = {Attributes: {foo: {S: 'bar'}, baz: {S: 'qux'}}}
                assert.deepEqual(
                    await table.delete({foo: 'bar'}).when(attr('baz').eq('qux')),
                    {foo: 'bar', baz: 'qux'}
                )
                assert(method == 'DeleteItem')
                assert(req.ConditionExpression == '#a=:b')
            })

            it('is discardable', async () => {
                res = {}
                assert(typeof await table.delete({foo: 'bar'}).discard() == 'undefined')
                assert(req.ReturnValues == 'NONE')
            })
        })


        describe('update', () => {
            it('requires objects as keys', () => {
                assert.throws(() => table.update('hello'), 'object expected')
            })

            it('integration test', async () => {
                res = {}
                assert(typeof await (
                    table
                    .update({a: 'b'})
                    .set({
                        c: 'd',
                        e: attr('f').default(1).plus(2),
                        g: attr('h').default(2).minus(attr('i').default(3)),
                        j: attr('k').default(['l']).concat(attr('m'))
                    },
                        attr('n').push(1),
                        attr('o').unshift(2),

                        attr('r').add('s'),
                        attr('t').delete('u'),

                        attr('v').inc(),
                        attr('w').dec(10)
                    )
                    .when(attr('x').gt(0))
                    .discard()
                ) == 'undefined')

                assert(req.ReturnValues == 'NONE')
                let unshuffle = x => x
                    .replace(/#[a-z]+/g,
                             x => req.ExpressionAttributeNames[x])
                    .replace(/:[a-z]+/g,
                             x => unserialize_val(req.ExpressionAttributeValues[x]))

                assert(unshuffle(req.ConditionExpression) == 'x>0')
                assert(unshuffle(req.UpdateExpression) ==
                    'SET c=d,' +
                        'e=if_not_exists(f,1)+2,' +
                        'g=if_not_exists(h,2)-if_not_exists(i,3),' +
                        'j=list_append(if_not_exists(k,l),m),' +
                        'n=list_append(if_not_exists(n,),1),' +
                        'o=list_append(2,if_not_exists(o,)),' +
                        'v=if_not_exists(v,0)+1,' +
                        'w=if_not_exists(w,0)-10 ' +
                    'ADD r s ' +
                    'DELETE t u'
                )
            })
        })
    })
})
