import test from "node:test";
import assert from "node:assert/strict";
import { readStandingsGoals, readStandingsPosition, readStandingsStat } from "../src/lib/iddaaStandings.ts";

test("Gismo underscore-prefixed total standings fields are normalized", () => {
  const row = {
    _pos: 1,
    team: { _id: 10, _name: "Galatasaray" },
    _played: 12,
    _win: 10,
    _draw: 1,
    _loss: 1,
    _goalsfor: 29,
    _goalsagainst: 16,
    _goalsdiff: 13,
    _points: 31
  };
  assert.equal(readStandingsPosition(row, 99), 1);
  assert.equal(readStandingsStat(row, "total", ["played", "matches", "matchplayed", "_played", "_matches"], "O"), 12);
  assert.equal(readStandingsStat(row, "total", ["won", "wins", "win"], "G"), 10);
  assert.equal(readStandingsStat(row, "total", ["drawn", "draws", "draw"], "B"), 1);
  assert.equal(readStandingsStat(row, "total", ["lost", "losses", "loss"], "M"), 1);
  assert.deepEqual(readStandingsGoals(row, "total"), [29, 16]);
  assert.equal(readStandingsStat(row, "total", ["goalsdiff", "goaldifference", "goal_diff"], "+/-"), 13);
  assert.equal(readStandingsStat(row, "total", ["points", "pts"], "P"), 31);
});

test("Gismo nested home and away stats are read independently", () => {
  const row = {
    total: { _played: 12, _points: 31 },
    home: { _played: 6, _points: 16, _goalsfor: 18, _goalsagainst: 7 },
    away: { _played: 6, _points: 15, _goalsfor: 11, _goalsagainst: 9 }
  };
  assert.equal(readStandingsStat(row, "home", ["played", "matches"], "O"), 6);
  assert.equal(readStandingsStat(row, "home", ["points", "pts"], "P"), 16);
  assert.deepEqual(readStandingsGoals(row, "home"), [18, 7]);
  assert.equal(readStandingsStat(row, "away", ["played", "matches"], "O"), 6);
  assert.equal(readStandingsStat(row, "away", ["points", "pts"], "P"), 15);
  assert.deepEqual(readStandingsGoals(row, "away"), [11, 9]);
});

test("standings normalizer keeps explicit zero values", () => {
  const row = { _played: 0, _win: 0, _draw: 0, _loss: 0, _goalsfor: 0, _goalsagainst: 0, _points: 0 };
  assert.equal(readStandingsStat(row, "total", ["played"], "O"), 0);
  assert.deepEqual(readStandingsGoals(row, "total"), [0, 0]);
  assert.equal(readStandingsStat(row, "total", ["points"], "P"), 0);
});
