import crypto from 'node:crypto';

export class BloomFilter {
  public size: number;
  public hashes: number;
  public bitArray: Buffer;
  public itemsAdded: number;

  constructor(expectedItems: number = 100_000, falsePositiveRate: number = 0.01) {
    this.size = Math.ceil(-(expectedItems * Math.log(falsePositiveRate)) / (Math.log(2) ** 2));
    this.hashes = Math.ceil((this.size / expectedItems) * Math.log(2));
    this.bitArray = Buffer.alloc(Math.ceil(this.size / 8), 0);
    this.itemsAdded = 0;
  }

  _getHashPositions(item: any): number[] {
    const hash = crypto.createHash('md5').update(String(item)).digest();
    const h1 = hash.readUInt32LE(0);
    const h2 = hash.readUInt32LE(4);

    const positions: number[] = [];
    for (let i = 0; i < this.hashes; i++) {
      const pos = Math.abs((h1 + i * h2) % this.size);
      positions.push(pos);
    }
    return positions;
  }

  add(item: any): void {
    if (!item) return;
    const positions = this._getHashPositions(item);
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      this.bitArray[byteIndex] |= (1 << bitIndex);
    }
    this.itemsAdded++;
  }

  has(item: any): boolean {
    if (!item) return false;
    const positions = this._getHashPositions(item);
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      if ((this.bitArray[byteIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  clear(): void {
    this.bitArray.fill(0);
    this.itemsAdded = 0;
  }

  getStats(): any {
    return {
      itemsAdded: this.itemsAdded,
      allocatedBytes: this.bitArray.length,
      hashFunctions: this.hashes,
      bitSize: this.size
    };
  }
}

export default BloomFilter;

// Made by Nikhil Under CodeX Devs
