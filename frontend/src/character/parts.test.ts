import { expect, test } from 'vitest'
import { groupParts, partSlot, partStyle } from './parts.ts'

test('partSlot reads the slot prefix', () => {
  expect(partSlot('body-01')).toBe('body')
  expect(partSlot('hairstyle-12-04')).toBe('hairstyle')
  expect(partSlot('accessory-19-02')).toBe('accessory')
})

test('partStyle reads the style number, empty for body/eyes', () => {
  expect(partStyle('hairstyle-12-04')).toBe('12')
  expect(partStyle('body-01')).toBe('')
})

test('body/eyes are one style with every variant under it', () => {
  const cat = groupParts(['body-01', 'body-02', 'body-03', 'eyes-01', 'eyes-02'])
  expect(cat.body).toHaveLength(1)
  expect(cat.body[0].parts).toEqual(['body-01', 'body-02', 'body-03'])
  expect(cat.eyes).toHaveLength(1)
  expect(cat.eyes[0].parts).toEqual(['eyes-01', 'eyes-02'])
})

test('multi-style slots group variants by style, in order', () => {
  const cat = groupParts([
    'hairstyle-01-01', 'hairstyle-01-02',
    'hairstyle-02-01',
    'outfit-31-05', 'outfit-31-01',
  ])
  expect(cat.hairstyle).toHaveLength(2)
  expect(cat.hairstyle[0].style).toBe('01')
  expect(cat.hairstyle[0].parts).toEqual(['hairstyle-01-01', 'hairstyle-01-02'])
  expect(cat.hairstyle[1].style).toBe('02')
  // variants keep numeric order even when input is shuffled
  expect(cat.outfit[0].parts).toEqual(['outfit-31-01', 'outfit-31-05'])
})

test('unknown slots and premades are dropped', () => {
  const cat = groupParts(['premade-01', 'body-01', 'junk'])
  expect(cat.body).toHaveLength(1)
  expect(cat.eyes).toEqual([])
})
