export default function list() {
    let head, tail
    return [(item, before, after) => {
        after ? before = after[1] : after = before ? before[2] : tail
        let node = [item, before, after]
        after ? after[1] = node : head = node
        before ? before[2] = node : tail = node
        return node
    }, item => {
        item[1] ? item[1][2] = item[2] : tail = item[2]
        item[2] ? item[2][1] = item[1] : head = item[1]
        item[1] = item[2] = undefined
        return item[0]
    }, () => head, () => tail]
}
