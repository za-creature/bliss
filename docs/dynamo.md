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

1. you want to reduce the size[^1] of your code segment and:
   * you use DynamoDB sparingly
   * you're comfortable with the inner workings of the AWS REST API
2. you want to call methods not exported by the high level interface

[^1]: the minified size of the high level API is about 6KiB

Access it by importing the `default` export from the module, which follows
the following prototype:

`request(method: String, body: Object, [headers: Object]) -> Promise<Object>`

### Usage
```javascript
import config from 'bliss/aws'
import request from 'bliss/aws/dynamo'

config.key = 'AKIAIOSFODNN7EXAMPLE'
config.secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
config.region = 'us-east-1'

async function main() {
    let response = await request('GetItem', {
        'TableName': 'Pets',
        'Key': {
            'AnimalType': {'S': 'Dog'},
            'Name': {'S': 'Fido'}
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
main().catch(e => console.error(e.stack))
```

For a fistful of bytes more, importing `{serialize, unserialize}` might make
your life a little easier:
```javascript
import request, {serialize, unserialize} from 'bliss/aws/dynamo'

let fido = unserialize({'M': (await request('GetItem', {
    'TableName': 'Pets',
    'Key': serialize({
        'AnimalType': 'Dog',
        'Name': 'Fido'
    })['M']
}))['Item']})

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
```



## High-level interface
The high-level interface is a opinionated API that transparently supports CRUD
operations on top of dynamo. It does not implement data definition operations,
so you must create your tables and indices externally or using the low-level
API. You can however query and update records from existing tables by using the
DSL, with most operations supported.

**Warning** while in the author's opinion the best serverless database currently
available on the market, DynamoDB has a number of design decisions that may be
at odds from what you'd expect. To avoid performance bottlenecks and runaway
costs, please thoroughly read through the
[official documentation](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/Welcome.html)
, and make sure that you understand the billing mechanisms and underlying
performance limitations thereof.



### Table(name: String, consistent: Boolean = false)
A `Table` is an abstraction over a dynamo table. It is the only method used to
interact with tables in the high level interface. By default, all reads are
eventually consistent, but this can be changed using the second argument. If a
table is created with strongly consistent reads, all exported read methods will
be strongly consistent unless explicitly overriden.

```javascript
import {Table} from 'bliss/aws/dynamo'
let Pets = Table('pets')
```
A table exports the following methods:


#### Table.get(key: Object, consistent: Boolean = Table.consistent) -> Promise<Object>
Returns the (projectable) record bound to a key.
```javascript
let fido = await Pets.get({
    'AnimalType': 'Dog',
    'Name': 'Fido'
})
```

You may
[limit the number of fields](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ProjectionExpressions.html)
returned by chaining the `.project(...attribute_names)` method on the result:
```javascript
let {Age, Vaccinations} = await Pets.get({
    'AnimalType': 'Dog',
    'Name': 'Fido'
}).project('Age', 'Vaccinations.Rabies')
```
[See also](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.html)


#### Table.put(item: Object) -> ConditionalUpdate extends Promise
(Conditionally) creates or replaces an existing record (based on key) in a 
table, (optionally) returning the old record with the same key, if any:
```javascript
await Pets.put({
    'AnimalType': 'Cat',
    'Name': 'Garfield'
})
```
[See also](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html)


#### Table.delete(key: Object) -> ConditionalUpdate extends Promise
(Conditionally) deletes the record based on key from a table, (optionally)
returning the deleted record, if any:
```javascript
await Pets.delete({
    'AnimalType': 'Cat',
    'Name': 'Garfield'
})
```
[See also](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_DeleteItem.html)


#### Table.update(key: Object) -> ConditionalUpdate extends Promise
(Conditionally) updates a record based on key from a table, (optionally)
returning the old record, if any. To perform updates, the `.set()` method
must be called (chaining is allowed) with one or more `Mutator` arguments.
[See also](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateItem.html)


#### Table.query(condition: Condition, consistent: Boolean = Table.consistent) -> Cursor
Returns a `Cursor` over the keys matching `condition` from the table. An index
may be used instead of the table by calling `.index(name)` on the result.
```javascript
let dogs = await Pets.query({'AnimalType': 'Dog'})
````
[See also](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html)


#### Table.scan(consistent: Boolean = Table.consistent) -> Cursor
Returns a iterable `Cursor` over all the records from the table. An index may be
used instead of the table by calling `.index(name)` on the result.
```javascript
let pets = await Pets.scan()
````
[See also](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Scan.html)



### ConditionalUpdate
A `ConditionalUpdate` is returned by one of the `Table` methods that mutates
data. In addition to being a Promise that can be awaited upon, it also provides
a few methods to alter the update operation or the result:


#### ConditionalUpdate.when(condition: Condition)
Makes the update conditional on `condition`. If it is not fulfilled, an error
is raised instead:
```javascript
await Pets.update({
    'AnimalType': 'Dog',
    'Name': 'Fido'
})
.set({'age': 9})
.when(attr('age').eq(8))
```
[See also](#Mutator.inc)


#### ConditionalUpdate.fresh() -> ConditionalUpdate
Makes the operation to return the state of the new (updated) object instead of
the old (before update) version. Calling this on the result of a `.delete()`
operation will produce undefined results.


#### ConditionalUpdate.discard() -> ConditionalUpdate
Ensures that the operation does not return any object data (old or new), saving
some bandwidth.




### Expressions
The bliss dynamo client implements a javascript query language used to query
tables and indices (by primary / sort keys) as well as to filter the results
of queries and scans. The primitives for this query language are `attr` and
optionally `not` and are exported by this module by name:
```javascript
import {attr, not} from 'bliss/aws/dynamo'
```



#### Attribute
An `Attribute` is an expression that references a field in a DynamoDB document,
uniquely identified by its path. It is created using the `attr` function and
is the starting point of a query. An attribute is also `Sortable` and exports
all of the methods of the `Sortable` interface. In fact, almost all `Sortable`s
are attributes, with the only notable exception being `Attribute.length`


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
A `Sortable` is an expression that has a total ordering which can be accessed
via one of the following operations:


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
A `Condition` is an expression that evaluates to a Boolean `true` or `false` for
the purpose of filtering the results returned by a `scan` or a `query`.

Conditions can be combined or negated by using their exported methods, described
below:

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
