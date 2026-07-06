import { describe, it, expect } from 'vitest'
import { joinPastedLines } from './paste'

describe('joinPastedLines', () => {
  it('returns null for single-line paste (passthrough)', () => {
    expect(joinPastedLines('just one line')).toBeNull()
    expect(joinPastedLines('')).toBeNull()
    expect(joinPastedLines('  \n  ')).toBeNull()
  })

  it('joins multi-line paste with "; ", trimming and dropping blank lines', () => {
    const result = joinPastedLines('cd foo\n\nls -la\r\nnpm test')
    expect(result).not.toBeNull()
    expect(result!.lines).toEqual(['cd foo', 'ls -la', 'npm test'])
    expect(result!.joined).toBe('cd foo; ls -la; npm test')
  })

  it('handles a 500-line paste with exactly 499 separators and no dropped lines', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`)
    const text = lines.join('\n')
    const result = joinPastedLines(text)
    expect(result).not.toBeNull()
    expect(result!.lines).toHaveLength(500)
    expect(result!.joined.split('; ')).toHaveLength(500)
    expect(result!.joined.split('; ')).toEqual(lines)
  })

  it('round-trips UTF-8 Vietnamese text unchanged, byte-for-byte', () => {
    const vi1 = 'Xin chào, đây là tiếng Việt'
    const vi2 = 'Chương trình chạy tốt trên Windows'
    const result = joinPastedLines(`${vi1}\n${vi2}`)
    expect(result).not.toBeNull()
    expect(result!.lines).toEqual([vi1, vi2])
    expect(result!.joined).toBe(`${vi1}; ${vi2}`)
    expect(Buffer.from(result!.joined, 'utf8').toString('utf8')).toBe(result!.joined)
  })

  it('supports \\r, \\n and \\r\\n line endings mixed together', () => {
    const result = joinPastedLines('a\r\nb\nc\rd')
    expect(result).not.toBeNull()
    expect(result!.lines).toEqual(['a', 'b', 'c', 'd'])
  })
})
