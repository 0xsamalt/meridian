export const MAX_CACHE_AGE = 3_600_000 // 1 hour in ms

export class SignalCache<T> {
  private readonly _value: T | null
  private readonly _updatedAt: number

  constructor(value: T | null = null, updatedAt = 0) {
    this._value = value
    this._updatedAt = updatedAt
  }

  get(): T | null {
    return this._value
  }

  get ageMs(): number {
    if (this._value === null) return Infinity
    return Date.now() - this._updatedAt
  }

  isStale(maxAgeMs: number = MAX_CACHE_AGE): boolean {
    if (this._value === null) return true
    return this.ageMs > maxAgeMs
  }

  // Returns a new SignalCache — never mutates
  update(value: T): SignalCache<T> {
    return new SignalCache<T>(value, Date.now())
  }
}
