// Maiden nylo freeze drill — pure round logic (no DOM), so it can be tested in node.
//
// Rules (one round = freezing the top-priority crab)
// - Positions: S1 (top-left), S2 (bottom-left), N1 (top-right), N2 (bottom-right).
// - Priority S1 → S2 → N1 → N2 among the crabs that spawned
// - Ice Rush is queued when the crabs spawn. Your first click uses it up and it
//   is NOT re-queued:
//   · click a crab → Rush lands on it 0.6s later, unless any other click comes
//     within that 0.6s (then the first click only acted as the cancel);
//   · click the floor → Rush cancelled.
// - After the Rush is gone, clicking a crab casts the autocast Ice Barrage on it.
// - The round ends when a spell lands on a crab. Pass = right crab, right spell
//   (S2 → Rush, S1/N1/N2 → Barrage), and the deciding crab click (the S2 click,
//   or the Barrage click) came within 0.6s of the crabs appearing.

const POSITIONS = ['S1', 'S2', 'N1', 'N2'];
const PRIORITY = ['S1', 'S2', 'N1', 'N2'];
const SPELL_NAME = { rush: 'Ice Rush', barrage: 'Ice Barrage' };

function expectedOrder(present) {
  return PRIORITY.filter(p => present.includes(p)).map(pos => ({ pos, spell: pos === 'S2' ? 'rush' : 'barrage' }));
}

class Wave {
  constructor(present, t0, opts = {}) {
    this.present = [...present];
    this.pairMs = opts.pairMs ?? 600;
    this.expected = expectedOrder(this.present);
    this.target = this.expected[0];
    this.t0 = t0;
    this.status = 'active';   // active | pass | fail
    this.reason = null;
    this.endT = null;
    this.rushQueued = true;
    this.pending = null;      // { pos, t } — Rush about to land unless another click comes
    this.cancelledBy = null;  // 'floor' | 'override' — how the Rush was used up without landing
    this.firstClickT = null;
    this.extraFloor = 0;
    this.clicks = [];         // { target, t }
    this.casts = [];          // the cast that ended the round: { pos, spell, t, clickMs }
    this.frozen = new Set();
    this.ignored = [];
  }

  // target: 'S1' | 'S2' | 'N1' | 'N2' for a crab, null for the floor
  click(target, t) {
    if (this.status !== 'active') return;
    this.update(t);
    if (this.status !== 'active') return;
    this.clicks.push({ target, t });
    if (this.firstClickT === null) this.firstClickT = t;

    if (target === null) {
      if (this.rushQueued) { this.rushQueued = false; this.cancelledBy = 'floor'; }
      else if (this.pending) { this.pending = null; this.cancelledBy = 'override'; }
      else this.extraFloor++;
      return;
    }
    if (this.rushQueued) {
      this.rushQueued = false;
      this.pending = { pos: target, t };
      return;
    }
    if (this.pending) this.cancelledBy = 'override';
    this.pending = null;
    this.finish(target, 'barrage', t, t);
  }

  // call every frame and before each click
  update(now) {
    if (this.status === 'active' && this.pending && now - this.pending.t > this.pairMs) {
      const p = this.pending;
      this.pending = null;
      this.finish(p.pos, 'rush', p.t + this.pairMs, p.t);
    }
  }

  // t: when the spell lands; clickT: the crab click that decided it
  finish(pos, spell, t, clickT) {
    const clickMs = clickT - this.t0;
    this.casts = [{ pos, spell, t, clickMs }];
    this.endT = t;
    const want = this.target;
    if (pos !== want.pos) {
      this.fail(`${SPELL_NAME[spell]} on ${pos} — ${want.pos} was the priority`);
    } else if (spell !== want.spell) {
      if (want.spell === 'barrage') this.fail(`Ice Rush landed on ${pos} — cancel it first`);
      else if (this.cancelledBy === 'floor') this.fail('S2 needs the Rush — click S2 directly, no cancel');
      else this.fail(`A click within ${this.pairMs}ms of S2 overrode the Rush`);
    } else if (clickMs > this.pairMs) {
      this.fail(`Too slow: ${pos} clicked ${Math.round(clickMs)}ms after spawn (> ${this.pairMs}ms)`);
    } else {
      this.status = 'pass';
      this.frozen.add(pos);
    }
  }

  fail(reason) {
    this.status = 'fail';
    this.reason = reason;
  }

  get cast() { return this.casts[0] || null; }
  get reaction() { return this.firstClickT === null ? null : this.firstClickT - this.t0; }
  get total() { return this.endT === null ? null : this.endT - this.t0; }
  // time from spawn to the deciding crab click
  get clickMs() { return this.casts.length ? this.casts[0].clickMs : null; }
  get minClicks() { return this.target.spell === 'rush' ? 1 : 2; }
}

// pick min..max crabs from the allowed spawn positions
function randomPresent(min, max, pool = POSITIONS) {
  const allowed = POSITIONS.filter(p => pool.includes(p));
  if (!allowed.length) allowed.push(...POSITIONS);
  const hi = Math.min(max, allowed.length), lo = Math.min(min, hi);
  const n = lo + Math.floor(Math.random() * (hi - lo + 1));
  return allowed.sort(() => Math.random() - 0.5).slice(0, n);
}

if (typeof module !== 'undefined') module.exports = { Wave, expectedOrder, randomPresent, POSITIONS, SPELL_NAME };
