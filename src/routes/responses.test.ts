import { describe, it, expect } from 'vitest'
import { generateResponseId, generateItemId, generateCallId } from './responses.js'

describe('ID generation', () => {
  it('generateResponseId returns resp_ + 50 hex chars', () => {
    const id = generateResponseId()
    expect(id).toMatch(/^resp_[0-9a-f]{50}$/)
    expect(id.length).toBe(55)
  })

  it('generateItemId returns prefix + 50 hex chars', () => {
    const id = generateItemId('msg')
    expect(id).toMatch(/^msg_[0-9a-f]{50}$/)
    expect(id.length).toBe(54)

    const fc = generateItemId('fc')
    expect(fc).toMatch(/^fc_[0-9a-f]{50}$/)
  })

  it('generateCallId returns call_ + 24 base64url chars', () => {
    const id = generateCallId()
    expect(id).toMatch(/^call_[A-Za-z0-9_-]{24}$/)
    expect(id.length).toBe(30)
  })
})
