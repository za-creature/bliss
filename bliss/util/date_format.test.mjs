import {assert} from 'chai'
import date_format, {days, months} from './date_format.mjs'


describe('date_format', () => {
        let ts = 1621069454976
    it('default arguments', () => {
        let date = new Date()
        assert.equal(new Date(date_format(date)).toString(), date)
        assert.equal(date_format(ts, null, true), 'Sat May 15 2021 09:04:14')
        assert.isAbove(Number(date_format('yyyy')), 2020)
        assert.throws(() => date_format('blah', 'yyyy'), 'invalid date')
    })

    it('english suffix', () => {
        assert.equal(date_format('2021-05-01', 'S'), 'st')
        assert.equal(date_format('2021-05-02', 'S'), 'nd')
        assert.equal(date_format('2021-05-03', 'S'), 'rd')
        assert.equal(date_format('2021-05-04', 'S'), 'th')
    })

    it('masked character passthrough', () => {
        assert.equal(date_format('2021-05-01', "'on the 'dS' day of 'mmmm' of the year 'yyyy"),
                     'on the 1st day of May of the year 2021')
    })

    it('stress test', () => {
        assert.equal(date_format(ts, 'yy-m-d-H-M-s', true), '21-5-15-9-4-14')
        assert.equal(date_format(ts, 'yyyymmddHHMMssl', true), '20210515090414976')
        let h3 = 10800000
        assert.equal(date_format(ts + h3, 'h:MM TT', true), '12:04 PM')
        assert.equal(date_format(ts + h3, 'h:MM TT', true), '12:04 PM')
    })

    it('i18n', () => {
        days[13] = 'Sâmbătă'
        months[16] = 'Mai'
        assert.equal(date_format(ts, 'ddd mmm', true), 'Sat May')
        assert.equal(date_format(ts, 'dddd mmmm', true), 'Sâmbătă Mai')
    })

    after(() => {
        days[13] = 'Saturday'
        months[16] = 'May'
    })
})
