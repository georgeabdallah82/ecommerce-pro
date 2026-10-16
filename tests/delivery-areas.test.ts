import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pickZone, zoneAreas } from '@/lib/pricing'

const zone = (name: string, countries: string, regions: string | null = null) => ({ name, countries, regions })
const beirut = zone('Beirut', 'Lebanon', 'Beirut, Achrafieh')
const north = zone('North', 'Lebanon', 'North, Akkar')
const lebanon = zone('Rest of Lebanon', 'Lebanon')
const world = zone('World', '*')

describe('delivery price by area', () => {
  it('reads the areas a zone covers', () => {
    assert.deepEqual(zoneAreas(' Beirut, Metn ,\nNorth '), ['beirut', 'metn', 'north'])
    assert.deepEqual(zoneAreas(null), [])
  })
  it('uses the zone listing the customer\'s area, else the country\'s zone with no areas', () => {
    const zones = [lebanon, beirut, north, world]
    assert.equal(pickZone(zones, 'Lebanon', 'Beirut')?.name, 'Beirut')
    assert.equal(pickZone(zones, 'LB', 'beirut')?.name, 'Beirut')
    assert.equal(pickZone(zones, 'Lebanon', 'Akkar')?.name, 'North')
    assert.equal(pickZone(zones, 'Lebanon', 'Metn')?.name, 'Rest of Lebanon')
    assert.equal(pickZone(zones, 'Lebanon', '')?.name, 'Rest of Lebanon')
    assert.equal(pickZone(zones, 'France', 'Paris')?.name, 'World')
  })
  it('keeps the old price when the only zone of the country lists areas', () => {
    assert.equal(pickZone([beirut, world], 'Lebanon', 'Metn')?.name, 'Beirut')
    assert.equal(pickZone([beirut], 'Cyprus', 'Limassol'), undefined)
  })
})
