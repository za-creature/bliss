# dynamo

The `bliss/aws/dynamo` module exports two interfaces used to interact with
Amazon's Dynamo DBaaS

It uses the configuration from the core `bliss/aws` module to establish
connections and exports two interfaces:


## Low-level interface

This is a lightweight wrapper on top of the
[low-level API](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.LowLevelAPI.html)
that exports a naive RPC interface. Authorization is handled for you and errors
are raised as exceptions, but you are responsible for constructing valid
request bodies and interpreting responses. Use this interface if:

1. you want to reduce the size* of your code segment and:
  * you use DynamoDB sparingly
  * you're comfortable with the inner workings of the AWS API
2. you want to call methods not exported by the high level interface

`*` the minified size of the high level API is about 6KiB

Access it by importing the `default` export from the module, which follows
the following prototype:

`request(method: String, body: Object, [headers: Object]) -> Promise<Object>`

### Usage

```javascript
import config from `bliss/aws`
import request from `bliss/aws/dynamo`

config.key = 'AKIAIOSFODNN7EXAMPLE'
config.secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
config.region = 'us-east-1'

async function main() {
    let response = await request('GetItem', {
        TableName: 'Pets',
        Key: {
            AnimalType: {S: 'Dog'},
            Name: {S: 'Fido'}
        }
    })

    /*assert.deepEqual(response, {
        Item: {
            Age: {N: '8'},
            Colors: {L: [
                {S: 'White'},
                {S: 'Brown'},
                {S: 'Black'}
            ]},
            Name: {S: 'Fido'},
            Vaccinations: {M: {
                Rabies: {L: [
                    {S: '2009-03-17'},
                    {S: '2011-09-21'},
                    {S: '2014-07-08'}
                ]},
                Distemper: {S: '2015-10-13'}
            }},
            Breed: {S: 'Beagle'},
            AnimalType: {S: 'Dog'}
        }
    })*/
}
main().catch(e => console.error(e))
```

For a fistful of bytes more, importing `{serialize, unserialize}` might make
your life a little easier:

```javascript
async function main() {
    let fido = unserialize({M: await request('GetItem', {
        TableName: 'Pets',
        Key: serialize({
            AnimalType: 'Dog',
            Name: 'Fido'
        }).M
    }).Item})

    /*assert.deepEqual(fido, {
        Age: 8,
        Colors: ['White', 'Brown', 'Black'],
        Name: 'Fido',
        Vaccinations: {
            Rabies: ['2009-03-17', '2011-09-21', '2014-07-08']
            Distemper: '2015-10-13'
        },
        Breed: 'Beagle',
        AnimalType: 'Dog'
    })*/
}
```


## High-level interface

The high-level interface is a opinionated API that transparently supports CRUD
operations on top of dynamo. It does not implement data definition operations,
so you must create your tables and indices externally or using the low-level
API.

### Table

A `Table` is an abstraction over a dynamo table. It is the only method used to
interact with tables in the high level interface.

```
import Table from 'bliss/aws/dynamo'
let Pets = Table('pets')
```

### Expressions

The bliss dynamo client implements a javascript query language used to query
tables and indices (by primary / sort keys) as well as to filter the results
of queries and scans. The primitives for this query language are `attr` and
optionally `not` and are exported by this module by name.


#### Attribute

An `Attribute` is a reference over a attribute in a Dynamo table uniquely
identified by its path. They are created using the `attr` function and are the
starting point of queries. An attribute is also `Sortable` and exports all of
the methods of the `Sortable` interface. In fact, almost all `Sortable`s are
attributes, with the only notable exception being `Attribute.length`

##### Attribute.exists() -> Condition

Returns a `Condition` that evaluates to `true` if an attribute with a certain
name exists on a document in a table, otherwise `false`.

Example:

```javascript
let purebreeds = await Pets.scan().filter(attr('Breed').exists())
```

##### Attribute.is(type: any) -> Condition

Returns a `Condition` that evaluates to `true` if the attribute exists in a
document and contains a value of a certain type, otherwise `false`.

Valid values for the `type` argument are:

* `String`, `Number`, `Boolean`, `ArrayBuffer`, `null`,
  `ArrayBuffer`, `Array`, `Map` which map to their primitive type in DynamoDB
* `undefined` evaluates to true if an attribute does not exist, and is
  equivalent to `not(attr('name').exists())`
* `[]` is an alias to `Array` and `Object` and `{}` alias to `Map`
* `[String]`, `[Number]`, `[ArrayBufer]` represent sets of strings, number and
  binary values respectively

Example:

```javascript
let multirabies = await Pets.scan().filter(attr('Vaccinations.Rabies').is(Array))
```

##### Attribute.startsWith(prefix: String) -> Condition

Returns a `Condition` that evaluates to `true` if the attribute exists in a
document and contains a string that begins with a spcified substring, otherwise
`false`.

Example:

```javascript
let distemper2015 = await Pets.scan().filter(attr('Vaccinations.Distemper').startsWith('2015-'))
```

##### Attribute.includes(substring: String) -> Condition

Returns a `Condition` that evaluates to `true` if the attribute exists in a
document and contains a string that includes a spcified substring, otherwise
`false`.

Example:

```javascript
let fidos = await Pets.scan().filter(attr('Name').includes('id'))
```

##### Attribute.length: Sortable

A `Sortable` that evaluates to a number of characters in a string or the
number of entries contained in a list, or `0` if the attribute does not exist.

Example:

```javascript
let four_letter_dogs = await Pets.scan().filter(attr('Name').length.eq(4))
```

##### Attribute.has(item: [String | Number | ArrayBuffer]) -> Condition

Returns a `Condition` that evaluates to `true` if the attribute exists in a
document and contains a set that includes a spcified item, otherwise `false`.

Internally, this is just an alias to `includes`, as DynamoDB is type-aware.

##### Attribute.size() -> Sortable

Returns a `Condition` that evaluates to the number of items contained in a map
or set, or `0` if the attribute does not exist.

Internally, this returns `Attribute.length` as DynamoDB is type-aware.


#### Sortable

A `Sortable` is a operand that has a total ordering which can be accessed via
one of the following operations:

##### Sortable['eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'](val) -> Condition

Returns a `Condition` that evaluates to `true` if the value of the sortable 
expression is equal, not equal, less than, less than or equal, greater than 
respectively greater than or equal to(than) `val`, otherwise `false`.

Example:

```javascript
let old_dogs = await Pets.scan().filter(attr('Age').gt(10))
```

##### Sortable.between(low: any, high: any) -> Condition

Returns a `Condition` that evaluates to `true` if the value of the sortable
expression is greater than or equal to `low` and less than or equal to `high`,
otherwise `false`.

Example:

```javascript
let middle_age_dogs = await Pets.scan().filter(attr('Age').between(5, 10))
```

##### Sortable.in(...args: [any]) -> Condition

Returns a `Condition` that evaluates to `true` if the value of the sortable
expression is one of the values specified as arguments, otherwise `false`.


#### Condition

A `Condition` is a expression that evaluates to `true` or `false` for the
purpose of filtering the results returned by a `scan` or a `query`.

Conditions can be combined or negated by using their exported methods:

**Warning**: Unlike their underlying logical operators, function calls in the
builder pattern have the same precedence and are strictly left-associative.

Examples:

* `a.or(b).and(c).negate()` translates to `not((a or b) and c)`
* `a.negate().or(b.and(c))` translates to `not(a) or (b and c)`
* `a.or(b.and(c.negate()))` translates to `(a or (b and not c)`

##### Condition.and(condition: Condition) -> Condition

Returns a condition that evaluates to `true` if both the initial condition and
the other condition evaluate to `true`, otherwise `false`.

Example:

```javascript
let old_beagles = await Pets.scan().filter(attr('Breed').eq('Beagle')
                                           .and(attr('Age').gt(10)))
```

##### Condition.or(condition: Condition) -> Condition

Returns a condition that evaluates to `true` if either the initial condition or
the other condition evaluate to `true`, and `false` if both are `false`.

Example:

```javascript
let small_dogs = await Pets.scan().filter(attr('Breed').includes('Terrier')
                                          .or(attr('Breed').eq('Beagle')))
```

##### Condition.negate() -> Condition

Returns a condition that evaluates to `true` if the initial condition is
`false`, otherwise `true`. This is equivalent to calling `not()` on the initial
condition.

Example:

```javascript
let not_beagles = await Pets.scan().filter(attr('Breed').eq('Beagle').negate())
```
