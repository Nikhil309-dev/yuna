import type BetterSqlite3Database from 'better-sqlite3';
export class EconomyRepo {
  public db: BetterSqlite3Database.Database;
  public _getCoins: BetterSqlite3Database.Statement;
  public _addCoins: BetterSqlite3Database.Statement;
  public _updateCoins: BetterSqlite3Database.Statement;
  public _getTopUsers: BetterSqlite3Database.Statement;

  constructor(db: BetterSqlite3Database.Database) {
    this.db = db;
    this._getCoins = this.db.prepare('SELECT coins FROM user_economy WHERE user_id = ?');
    this._addCoins = this.db.prepare(`
      INSERT INTO user_economy (user_id, coins) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET coins = user_economy.coins + excluded.coins
    `);
    this._updateCoins = this.db.prepare('UPDATE user_economy SET coins = ? WHERE user_id = ?');
    this._getTopUsers = this.db.prepare('SELECT user_id, coins FROM user_economy ORDER BY coins DESC LIMIT ?');
  }

  getCoins(userId: string) {
    const data = this._getCoins.get(userId);
    return data ? data.coins : 0;
  }

  getBalance(userId: string) {
    return this.getCoins(userId);
  }

  addCoins(userId: string, amount: number) {
    this._addCoins.run(userId, amount);
    return this.getCoins(userId);
  }

  removeCoins(userId: string, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid amount');
    let newAmount;
    this.db.transaction(() => {
      const current = this.getCoins(userId);
      if (current < amount) {
        newAmount = false;
        return;
      }
      newAmount = current - amount;
      this._updateCoins.run(newAmount, userId);
    })();
    return newAmount;
  }

  getTopUsers(limit = 10) {
    return this._getTopUsers.all(limit);
  }

  transfer(fromUserId: string, toUserId: string, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      return { ok: false, reason: 'invalid_amount' };
    }
    if (fromUserId === toUserId) {
      return { ok: false, reason: 'self_transfer' };
    }

    const tx = this.db.transaction((from: string, to: string, amt: number) => {
      const fromRow = this._getCoins.get(from);
      const fromBalance = fromRow ? fromRow.coins : 0;
      if (fromBalance < amt) {
        return { ok: false, reason: 'insufficient_funds' as const };
      }
      this._updateCoins.run(fromBalance - amt, from);
      this._addCoins.run(to, amt);
      return {
        ok: true as const,
        fromBalance: fromBalance - amt,
        toBalance: this.getCoins(to),
      };
    });

    return tx(fromUserId, toUserId, amount);
  }
}

// Made by Nikhil Under CodeX Devs
