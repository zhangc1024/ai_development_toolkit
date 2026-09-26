import { describe, expect, it } from 'vitest'
import { analyzeSql, tokenize } from '../src/tools/sql/analyzer'
import { parseExplain } from '../src/tools/sql/explain'
import { formatSql } from '../src/tools/sql/core'
describe('MySQL static analysis', () => {
  it('extracts clauses, qualified tables and index fields', () => {
    const [r] = analyzeSql("SELECT u.id, count(o.id) AS total FROM app.users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.status=1 AND o.created_at>'2026-01-01' GROUP BY u.id ORDER BY total DESC LIMIT 10000,20")
    expect(r.tables).toEqual(['app.users','orders'])
    expect(r.fields).toBe('u.id, count(o.id) AS total')
    expect(r.joins).toEqual(['o.user_id=u.id'])
    expect(r.indexes[0].fields).toEqual(['u.status','o.created_at'])
    expect(r.indexes[1].fields).toEqual(['o.user_id','u.id'])
    expect(r.groupBy).toBe('u.id')
    expect(r.limit).toBe('10000,20')
    expect(r.risks.some(s=>s.includes('offset'))).toBe(true)
  })
  it('ignores keywords in strings, quoted identifiers and comments', () => {
    const [r] = analyzeSql("SELECT 'WHERE OR OR OR SELECT *', `order` FROM t WHERE note='LIKE %hello%' /* OR OR OR */")
    expect(r.risks).toEqual([])
    expect(r.indexes[0].fields).toEqual(['note'])
    expect(analyzeSql("DELETE FROM t /* WHERE id=1 */")[0].risks[0]).toContain('未发现 WHERE')
    expect(analyzeSql("DELETE FROM t WHERE note=';'; SELECT 1").length).toBe(2)
  })
  it.each(['SELECT* FROM t','SELECT t.* FROM t','SELECT DISTINCT * FROM t'])('flags wildcard %s', sql => {
    expect(analyzeSql(sql)[0].risks[0]).toContain('SELECT *')
  })
  it('does not flag count(*) or multiplication', () => {
    expect(analyzeSql('SELECT count(*), a * b FROM t')[0].risks).toEqual([])
  })
  it('detects functions, LIKE, OR and offset without treating functions as fields', () => {
    const [r] = analyzeSql("SELECT name FROM t WHERE DATE(created_at)='2026-01-01' OR name LIKE '%abc%' OR id=1 OR id=2 LIMIT 20 OFFSET 10000")
    expect(r.risks).toHaveLength(4)
    expect(r.indexes[0].fields).toEqual(['created_at','name','id'])
    expect(analyzeSql('SELECT id FROM t WHERE id=ABS(2)')[0].risks).toEqual([])
  })
  it('supports DML and scopes missing WHERE per statement', () => {
    const r = analyzeSql("INSERT INTO t (id) VALUES (1); UPDATE t SET name='WHERE'; DELETE FROM t WHERE id=1")
    expect(r.map(x=>x.type)).toEqual(['INSERT','UPDATE','DELETE'])
    expect(r[1].risks[0]).toContain('UPDATE 未发现 WHERE')
    expect(r[2].risks).toEqual([])
    expect(analyzeSql('UPDATE LOW_PRIORITY IGNORE a,b SET a.x=1 WHERE a.id=b.id')[0].tables).toEqual(['a','b'])
  })
  it.each(['','SELECT','SELECT * FROM','SELECT * FROM t WHERE','SELECT * FROM WHERE x=1','SELECT * FROM t WHERE id=','UPDATE t','DELETE t','INSERT INTO t','SELECT * FROM (SELECT * FROM x) y','WITH x AS (SELECT 1) SELECT * FROM x','SELECT 1 UNION SELECT 2',"SELECT 'oops",'SELECT (id FROM t','SELECT 1 /*! + 1 */'])('rejects incomplete or unsupported analysis: %s', sql => {
    expect(()=>analyzeSql(sql)).toThrow()
  })
  it('handles comma tables, USING, backticks and nested conditions', () => {
    expect(analyzeSql('SELECT a.id FROM a,b WHERE (a.id=b.id AND a.x=1)')[0].tables).toEqual(['a','b'])
    const r = analyzeSql('SELECT a.id FROM a JOIN b USING (id) WHERE `where`=1')[0]
    expect(r.indexes[1].fields).toEqual(['id'])
    expect(r.where).toBe('`where`=1')
  })
  it('bounds input and nesting', () => {
    expect(()=>tokenize('x'.repeat(100001))).toThrow()
    expect(()=>tokenize('('.repeat(101))).toThrow()
  })
  it('retains formatting separately for complex statements', () => {
    expect(formatSql('SELECT * FROM (SELECT id FROM t) x',{indent:'2',keywordCase:'upper'})).toContain('SELECT')
  })
})
const row = {table:'t',type:'ALL',possible_keys:'idx_a,idx_b',key:null,rows:50000,filtered:10,Extra:'Using filesort; Using temporary'}
describe('EXPLAIN input', () => {
  it('reads row arrays and highlights all five signals', () => {
    const [r] = parseExplain(JSON.stringify([row]))
    expect(r.warnings).toHaveLength(5)
    expect(r.values.possible_keys).toBe('idx_a,idx_b')
  })
  it('reads TSV including an empty trailing Extra', () => {
    const [r] = parseExplain('type\tpossible_keys\tkey\trows\tfiltered\tExtra\nref\tidx\tidx\t2\t100\t')
    expect(r.warnings).toEqual([])
  })
  it('reads quoted CSV, MySQL and Markdown tables', () => {
    expect(parseExplain('type,possible_keys,key,rows,filtered,Extra\nALL,"idx_a,idx_b",NULL,50000,10,Using filesort')[0].warnings).toHaveLength(4)
    const table = '| type | possible_keys | key | rows | filtered | Extra |\n| ALL | NULL | NULL | 10 | 100 | |'
    expect(parseExplain('+------+\n'+table+'\n+------+\n1 row in set (0.01 sec)')[0].warnings).toHaveLength(2)
    expect(parseExplain(table.replace('\n','\n| --- | --- | --- | --- | --- | --- |\n'))).toHaveLength(1)
  })
  it.each(['','{}','[]','[null]','[{"query_block":{}}]','type\trows\nALL\t10','type,key,rows,filtered,possible_keys,Extra\nALL,NULL,oops,100,NULL,','type,key,rows,filtered,possible_keys,Extra\nALL,NULL,1,101,NULL,'])('rejects invalid data: %s', value => {
    expect(()=>parseExplain(value)).toThrow()
  })
})
