import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { safeStyleText, sanitizeRichHtml } from '@/lib/sanitize-html'

describe('sanitizeRichHtml', () => {
  it('keeps normal formatting, links, images and video embeds', () => {
    const html = '<h2 class="title">Who we are</h2><p>We <strong>deliver</strong> <a href="/shop">everything</a>.</p><img src="/api/media/a.png" alt="team"><iframe src="https://www.youtube.com/embed/abc"></iframe>'
    const out = sanitizeRichHtml(html)
    for (const kept of ['<h2 class="title">', '<strong>deliver</strong>', '<a href="/shop">', '<img src="/api/media/a.png" alt="team">', 'src="https://www.youtube.com/embed/abc"']) assert.ok(out.includes(kept), kept)
  })
  it('removes scripts, event handlers, javascript: links and foreign iframes', () => {
    const out = sanitizeRichHtml('<p onclick="steal()">hi</p><script>steal()</script><img src=x onerror="steal()"><a href="javascript:steal()">x</a><iframe src="https://evil.example/x"></iframe><svg onload="steal()"></svg>')
    assert.ok(!/steal|<script|onerror|onclick|onload|javascript:|evil\.example/i.test(out), out)
    assert.ok(out.includes('<p>hi</p>'))
  })
  it('handles empty input', () => {
    assert.equal(sanitizeRichHtml(null), '')
  })
})

describe('safeStyleText', () => {
  it('cannot close the style element', () => {
    const out = safeStyleText('.a{color:red}</style><script>alert(1)</script>')
    assert.ok(!out.includes('</style'), out)
    assert.ok(out.startsWith('.a{color:red}'))
  })
})
