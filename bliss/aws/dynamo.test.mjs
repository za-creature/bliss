import {assert} from 'chai'
import {json_decode, sleep, utf8_encode, is_object, is_promise} from '../util.mjs'
import request, {
    serialize_val, unserialize_val,
    EntityEncoder, IDGenerator,
    attr, not, Table
} from '../aws/dynamo.mjs'


describe('dynamo', () => {
    let old_fetch, req, res, method, status
    before(() => (old_fetch = global.fetch, global.fetch = async (...a) => {
        let r = new Request(...a)
        req = json_decode(a[1].body)
        method = r.headers.get('x-amz-target').split('.')[1]
        return {status, json: async () => res}
    }))
    after(() => global.fetch = old_fetch)
    beforeEach(() => (status = 200, req = null, res = null))


    describe('request', () => {
        it('sends the method and serialized body', async () => {
            res = {}
            await request('FooBar', {Baz: 'Qux'})
            assert.equal(method, 'FooBar')
            assert.deepEqual(req, {Baz: 'Qux'})
        })

        it('raises on error', async () => {
            status = 400
            res = {__type: 'common#oopsie', message: 'no can do'}
            try {
                await request('method', {})
                throw new Error('bad error')
            } catch(err) {
                assert.equal(err.name, 'oopsie')
                assert.equal(err.message, 'no can do')
            }
        })

        it('raises on unspecified error', async () => {
            status = 400
            res = {__type: 'common#oopsie'}
            try {
                await request('method', {})
                throw new Error('bad error')
            } catch(err) {
                assert.equal(err.name, 'oopsie')
                assert.equal(err.message, 'oopsie')
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
            assert.throws(() => serialize_val(undefined), 'unsupported')
        })

        it('handles binary data', () => {
            assert.deepEqual(serialize_val(utf8_encode('hi')), {B: 'aGk='})
            assert.deepEqual(serialize_val(new Uint8Array([104, 105])), {B: 'aGk='})
        })

        it('handles lists and maps', () => {
            assert.deepEqual(serialize_val([1, 'a']), {L: [{N: '1'}, {S: 'a'}]})
            assert.deepEqual(serialize_val([{x: 1}]), {L: [{M: {x: {N: '1'}}}]})
            assert.deepEqual(serialize_val([new Map().set('x', 1)]), {L: [{M: {x: {N: '1'}}}]})
        })

        it('supports sets', () => {
            assert.deepEqual(serialize_val(new Set(['a', 'b'])), {SS: ['a', 'b']})
            assert.deepEqual(serialize_val(new Set([1, 2])), {NS: ['1', '2']})
            assert.deepEqual(serialize_val(new Set([utf8_encode('hi')])), {BS: ['aGk=']})
            assert.deepEqual(serialize_val(new Set([new Uint8Array([104, 105])])), {BS: ['aGk=']})
            assert.throws(() => serialize_val(new Set([{}])), 'unsupported')
            assert.throws(() => serialize_val(new Set([false])), 'unsupported')
        })
    })


    describe('unserialize', () => {
        it('handles primitives', () => {
            assert.equal(unserialize_val({N: '1'}), 1)
            assert.equal(unserialize_val({N: '3.14'}), 3.14)
            assert.equal(unserialize_val({BOOL: true}), true)
            assert.equal(unserialize_val({BOOL: false}), false)
            assert.equal(unserialize_val({S: 'hi'}), 'hi')
            assert.equal(unserialize_val({NULL: true}), null)
            assert.throws(() => unserialize_val({EXT: true}), 'unsupported')
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


    describe('IDGenerator', () => {
        let iter = IDGenerator()

        it('iterates through the alphabet', () => {
            assert.equal(iter(), 'a')
            for(let i=0; i<24; i++)
                iter()
            assert.equal(iter(), 'z')
        })

        it('changes magnitude', () => {
            assert.equal(iter(), 'ab')
            for(let i=0; i<24; i++)
                iter()
            assert.equal(iter(), 'zb')
            for(let i=0; i<24*26; i++)
                iter()
            assert.equal(iter(), 'aab')
            assert.equal(iter(), 'bab')
        })
    })


    describe('EntityEncoder', () => {
        it('encodes keys', () => {
            let res = {}
            let [enc,] = EntityEncoder(res)
            assert.equal(enc('foo'), '#a')
            assert.equal(res['#a'], 'foo')
        })

        it('supports nested keys', () => {
            let res = {}
            let [enc,] = EntityEncoder(res)
            assert.equal(enc('foo.bar'), '#a.#b')
            assert.equal(res['#a'], 'foo')
            assert.equal(res['#b'], 'bar')
        })

        it('encodes values', () => {
            let res = {}
            let [,enc] = EntityEncoder(undefined, res)
            assert.equal(enc('bar'), ':a')
            assert.deepEqual(res[':a'], {S: 'bar'})
        })

        it('shares and reuses the keyspaces', () => {
            let keys = {}
            let vals = {}
            let [key, val] = EntityEncoder(keys, vals)
            assert.equal(key('foo'), '#a')
            assert.equal(key('foo'), '#a')
            assert.equal(val('foo'), ':b')
            assert.equal(val('foo'), ':b')
            assert.equal(keys['#a'], 'foo')
            assert.deepEqual(vals[':b'], {S: 'foo'})
        })
    })


    describe('attr', () => {
        let enc = [x => `#${x}`, x => `:${x}`]
        it('encodes keys', () => {
            assert.equal(attr('k').toString(), 'k')
            assert.equal(attr('a.path').toString(enc), '#a.path')
        })

        it('supports arithmetic', () => {
            assert.equal(attr('k').eq('v').toString(enc), '#k=:v')
            assert.equal(attr('k').ne('v').toString(enc), '#k<>:v')
            assert.equal(attr('k').lt(1).toString(enc), '#k<:1')
            assert.equal(attr('k').lte(2).toString(enc), '#k<=:2')
            assert.equal(attr('k').gt(3).toString(enc), '#k>:3')
            assert.equal(attr('k').gte(4).toString(enc), '#k>=:4')
        })

        it('handles range', () => {
            assert.equal(attr('k').between(5, 6).toString(enc),
                         '#k between :5 and :6')
            assert.equal(attr('k').in(5, 6, 7).toString(enc),
                         '#k in(:5,:6,:7)')
            assert.equal(attr('k').in([5, 6, 7]).toString(enc),
                         '#k in(:5,:6,:7)')
        })

        it('exposes logical operations', () => {
            assert.equal(attr('a').eq('a')
                         .and(attr('b').eq('b'))
                         .toString(enc), '(#a=:a)and(#b=:b)')
            assert.equal(attr('a').eq('a')
                         .or(attr('b').eq('b'))
                         .toString(enc), '(#a=:a)or(#b=:b)')
            assert.equal(not(attr('k').gt('v')).toString(enc), 'not(#k>:v)')
            assert.equal(attr('a').eq('a')
                         .and(attr('b').eq('b'))
                         .or(attr('c').eq('c'))
                         .toString(enc), '((#a=:a)and(#b=:b))or(#c=:c)')
            assert.equal(attr('a').eq('a')
                         .and(attr('b').eq('b').or(attr('c').eq('c')))
                         .toString(enc), '(#a=:a)and((#b=:b)or(#c=:c))')
            assert.equal(attr('a').eq('a')
                         .and(attr('b').eq('b'))
                         .or(attr('c').eq('c')).negate()
                         .toString(enc), 'not(((#a=:a)and(#b=:b))or(#c=:c))')
            assert.equal(attr('a').eq('a')
                         .and(attr('b').eq('b').or(attr('c').eq('c')).negate())
                         .toString(enc), '(#a=:a)and(not((#b=:b)or(#c=:c)))')
            assert.equal(attr('a').eq('a').negate()
                         .and(attr('b').eq('b'))
                         .or(attr('c').eq('c'))
                         .toString(enc), '((not(#a=:a))and(#b=:b))or(#c=:c)')
        })

        it('handles types correctly', () => {
            assert.equal(attr('k').exists().toString(enc), 'attribute_exists(#k)')
            assert.equal(attr('k').is(String).toString(enc), 'attribute_type(#k,:S)')
            assert.equal(attr('k').is(Number).toString(enc), 'attribute_type(#k,:N)')
            assert.equal(attr('k').is(Boolean).toString(enc), 'attribute_type(#k,:BOOL)')
            assert.equal(attr('k').is(undefined).toString(enc), 'attribute_not_exists(#k)')
            assert.equal(attr('k').is(null).toString(enc), 'attribute_type(#k,:NULL)')
            assert.equal(attr('k').is(ArrayBuffer).toString(enc), 'attribute_type(#k,:B)')
            assert.equal(attr('k').is(Array).toString(enc), 'attribute_type(#k,:L)')
            assert.equal(attr('k').is([]).toString(enc), 'attribute_type(#k,:L)')
            assert.equal(attr('k').is(Object).toString(enc), 'attribute_type(#k,:M)')
            assert.equal(attr('k').is(Map).toString(enc), 'attribute_type(#k,:M)')
            assert.equal(attr('k').is({}).toString(enc), 'attribute_type(#k,:M)')
            assert.equal(attr('k').is([String]).toString(enc), 'attribute_type(#k,:SS)')
            assert.equal(attr('k').is([Number]).toString(enc), 'attribute_type(#k,:NS)')
            assert.equal(attr('k').is([ArrayBuffer]).toString(enc), 'attribute_type(#k,:BS)')
            assert.throws(() => attr('k').is([5]), 'set type')
            assert.throws(() => attr('k').is('foo'), 'type')
        })

        it('supports substring / set operations', () => {
            assert.equal(attr('k').startsWith('p').toString(enc), 'begins_with(#k,:p)')
            assert.equal(attr('k').includes('s').toString(enc), 'contains(#k,:s)')
            assert.equal(attr('k').length.gt(0).toString(enc), 'size(#k)>:0')
        })
    })


    describe('Table', () => {
        let table = Table('test')
        beforeEach(() => res = {Item: {}})
        describe('get', async () => {
            it('returns a promise', () => {
                assert(is_promise(table.get({id: 1})))
            })

            it.skip('batches queries from the same ioloop iteration', async () => {
                table.get({id: 1})
                table.get({id: 2})
                await sleep(100)
                assert(is_object(req.RequestItems))
            })

            it('only triggers after await', async () => {
                table.get({id: 1})
                assert(req == null)
                await sleep(100)
                assert.equal(method, 'GetItem')
                assert.equal(req.TableName, 'test')
                assert.equal(req.Key.id.N, '1')
                assert.equal(req.ReturnConsumedCapacity, 'TOTAL')
            })

            it('respects consistency', async () => {
                await table.get({id: 1})
                assert(!req.ConsistentRead)
                await table.get({id: 1}, true)
                assert(req.ConsistentRead)
                await Table('test', true).get({id: 1}, false)
                assert(!req.ConsistentRead)
                await Table('test', true).get({id: 1})
                assert(req.ConsistentRead)
            })

            it('is projectable', async () => {
                await table.get({id: 1}).project('bar')
                assert.equal(req.ProjectionExpression, '#a')
                assert.equal(req.ExpressionAttributeNames['#a'], 'bar')
            })

            it('returns the deserialized the response', async () => {
                res = {Item: {id: {N: '1'}}}
                assert.deepEqual(await table.get({id: 1}), {id: 1})
            })
        })


        describe('scan', () => {
            it('only triggers after await', async () => {
                table.scan().filter(attr('id').eq(1))
                assert.isNull(req)
                await sleep(100)
                assert.equal(method, 'Scan')
                assert.equal(req.FilterExpression, '#a=:b')
            })

            it('respects consistency', async () => {
                table.scan()
                await sleep(100)
                assert(!req.ConsistentRead)
                table.scan(true)
                await sleep(100)
                assert(req.ConsistentRead)
                Table('test', true).scan(false)
                await sleep(100)
                assert(!req.ConsistentRead)
                Table('test', true).scan()
                await sleep(100)
                assert(req.ConsistentRead)
            })

            it('is iterable', async () => {
                assert.isFunction(table.scan()[Symbol.iterator])

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
                    assert.equal(item.id, ++c)
                    if(c > 3)
                        assert.equal(req.ExclusiveStartKey, 'foo')
                }
                assert.equal(c, 6)
            })

            it('throws on iterator backpressure', () => {
                res = {Items: [
                    {id: {N: '1'}},
                    {id: {N: '2'}},
                    {id: {N: '3'}}
                ], LastEvaluatedKey: 'foo'}
                let c = 0
                assert.throws(() => {
                    for(let item of table.scan()) // eslint-disable-line
                        c++
                }, 'await')
                assert.equal(c, 1)
            })

            it('turns into a promise when counting', async () => {
                res = {Count: 6}
                assert.equal(await table.scan().count(), 6)
            })

            it('is indexable', async () => {
                res = {Count: 3.14}
                assert.equal(await table.scan().index('foo').count(), 3.14)
                assert.equal(req.IndexName, 'foo')
            })
        })


        describe('query', () => {
            it('rejects non-boolean conditions', () => {
                assert.throws(() => table.query('foo'), 'invalid query')
                assert.throws(() => table.query(attr('foo')), 'invalid query')
                assert.throws(() => table.query(attr('foo').length), 'invalid query')
                assert.throws(() => table.query(attr('foo').eq('bar')).filter('test'), 'invalid filter')
            })

            it('implements first()', async () => {
                res = {Items: [{id: {N: '1'}}], LastEvaluatedKey: 'foo'}
                let item = await table.query(attr('foo').eq('bar')).first()
                assert.equal(item.id, 1)
            })

            it('is async-iterable', async () => {
                res = {Items: [{id: {N: '1'}}], LastEvaluatedKey: 'foo'}
                let c = 0
                for await(let item of table.query(attr('foo').eq('bar'))) {
                    res = {Items: [{id: {N: '2'}}]}
                    assert.equal(item.id, ++c)
                    if(c > 1)
                        assert.equal(req.ExclusiveStartKey, 'foo')
                }
                assert.equal(req.KeyConditionExpression, '#a=:b')
                assert.equal(c, 2)
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
                assert.equal(method, 'Query')
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
                assert.throws(() => table.put({foo: 'bar'}).when('foo'), 'condition')
                res = {Attributes: {foo: {S: 'bar'}, baz: {S: 'qux'}}}
                assert.deepEqual(
                    await table.put({foo: 'bar'}).when(attr('baz').eq('qux')),
                    {foo: 'bar', baz: 'qux'}
                )
                assert.equal(method, 'PutItem')
                assert.equal(req.ConditionExpression, '#a=:b')
            })

            it('is discardable', async () => {
                res = {}
                assert.isUndefined(await table.put({foo: 'bar'}).discard())
                assert.equal(req.ReturnValues, 'NONE')
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
                assert.equal(method, 'DeleteItem')
                assert.equal(req.ConditionExpression, '#a=:b')
            })

            it('is discardable', async () => {
                res = {}
                assert.isUndefined(await table.delete({foo: 'bar'}).discard())
                assert.equal(req.ReturnValues, 'NONE')
            })
        })


        describe('update', () => {
            it('requires objects as keys', () => {
                assert.throws(() => table.update('hello'), 'object expected')
            })

            it('integration test', async () => {
                res = {}
                assert.isUndefined(await (
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
                        attr('w').dec(10),
                        attr('x').unset()
                    )
                    .when(attr('y').gt(0))
                    .fresh()
                ))
                assert.equal(req.ReturnValues, 'ALL_NEW')

                let unshuffle = x =>
                    x.replace(/#[a-z]+/g,
                              x => req.ExpressionAttributeNames[x])
                     .replace(/:[a-z]+/g,
                              x => unserialize_val(req.ExpressionAttributeValues[x]))

                assert.equal(unshuffle(req.ConditionExpression), 'y>0')
                assert.equal(unshuffle(req.UpdateExpression),
                    'SET c=d,' +
                        'e=if_not_exists(f,1)+2,' +
                        'g=if_not_exists(h,2)-if_not_exists(i,3),' +
                        'j=list_append(if_not_exists(k,l),m),' +
                        'n=list_append(if_not_exists(n,),1),' +
                        'o=list_append(2,if_not_exists(o,)),' +
                        'v=if_not_exists(v,0)+1,' +
                        'w=if_not_exists(w,0)-10 ' +
                    'ADD r s ' +
                    'DELETE t u ' +
                    'UNSET x'
                )
            })
        })
    })
})
