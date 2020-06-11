import {assert} from 'chai'
import list from './list.mjs'


describe('list', () => {
    it('returns a (add, pop, head, tail) tuple', () => assert.equal(
        list().map(fn => assert.isFunction(fn)).length, 4
    ))

    it('head and tail are undefined on empty list', () => {
        let [,, head, tail] = list()
        assert.isUndefined(head())
        assert.isUndefined(tail())
    })

    it('head and tail are defined when list contains items', () => {
        let [add, pop, head, tail] = list()
        let x = add('x')
        assert.equal(head(), x)
        assert.equal(tail(), x)
        assert.equal(pop(x), 'x')
        assert.isUndefined(head())
        assert.isUndefined(tail())
    })

    it('add appends to the end of the list', () => {
        let [add, , head, tail] = list()
        let x = add('x')
        assert.equal(head(), x)
        assert.equal(tail(), x)
        let y = add('y')
        assert.equal(head(), x)
        assert.equal(tail(), y)
        let z = add('z')
        assert.equal(head(), x)
        assert.equal(tail(), z)
    })

    it('add can insert before', () => {
        let [add, , head, tail] = list()
        let x = add('x')
        assert.equal(head(), x)
        assert.equal(tail(), x)
        let y = add('y', x)
        assert.equal(head(), y)
        assert.equal(tail(), x)
        let z = add('z', y)
        assert.equal(head(), z)
        assert.equal(tail(), x)
    })

    it('add can insert after', () => {
        let [add, , head, tail] = list()
        let x = add('x')
        assert.equal(head(), x)
        assert.equal(tail(), x)
        let y = add('y')
        assert.equal(head(), x)
        assert.equal(tail(), y)
        add('z', null, x)
        assert.equal(head(), x)
        assert.equal(tail(), y)
    })

    it('pop can clear the list', () => {
        let [add, pop, head, tail] = list()
        let x = add('x')
        let y = add('y')
        let z = add('z')
        assert.equal(head(), x)
        assert.equal(tail(), z)
        assert.equal(pop(y), 'y')
        assert.equal(head(), x)
        assert.equal(tail(), z)
        assert.equal(pop(z), 'z')
        assert.equal(head(), x)
        assert.equal(tail(), x)
        assert.equal(pop(z), 'z')
        assert.isUndefined(head())
        assert.isUndefined(tail())
    })
})
