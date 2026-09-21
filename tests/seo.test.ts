import { describe, it, expect } from 'vitest'
import { pageMeta, routeFromPath, toolPath, siteOrigin } from '../src/seo/site'
import { tools } from '../src/tools/registry'
import { guides } from '../src/seo/guides'

describe('public tool routes and metadata', () => {
  it('maps direct entries and directory index aliases', () => {
    for (const tool of tools.filter(tool => tool.status === 'ready')) {
      expect(routeFromPath(toolPath(tool.id))).toBe(tool.id)
      expect(routeFromPath(toolPath(tool.id) + 'index.html')).toBe(tool.id)
      expect(routeFromPath(toolPath(tool.id).slice(0, -1))).toBe(tool.id)
      expect(guides[tool.id]?.length).toBeGreaterThan(0)
    }
  })
  it('does not treat arbitrary paths or nested files as home', () => {
    expect(routeFromPath('/')).toBe('home')
    expect(routeFromPath('/index.html')).toBe('home')
    for (const path of ['/missing', '/404.html', '/tools/json/foo', '/tools/json.js', '/tools/%2e%2e/']) {
      expect(routeFromPath(path)).toBe('not-found')
    }
  })
  it('gives each ready tool a distinct production canonical and title', () => {
    const ready = tools.filter(tool => tool.status === 'ready')
    const metadata = ready.map(tool => pageMeta(tool))
    expect(new Set(metadata.map(meta => meta.canonical)).size).toBe(ready.length)
    expect(new Set(metadata.map(meta => meta.title)).size).toBe(ready.length)
    metadata.forEach(meta => {
      expect(meta.canonical).toMatch(/^https:\/\/tools\.zhangc\.net\/tools\/[a-z0-9-]+\/$/)
      expect(meta.description.length).toBeGreaterThan(20)
    })
    expect(pageMeta(undefined, true).canonical).toBe(siteOrigin + '/')
    expect(pageMeta().canonical).toBe('')
    expect(pageMeta(ready.find(tool => tool.id === 'ai-chat')).description).toContain('发送到该服务')
  })
})
