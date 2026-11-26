import test from "node:test";
import assert from "node:assert/strict";
import { readStandingsGoals, readStandingsPosition, readStandingsStat } from "../src/lib/iddaaStandings.ts";

test("actual Iddaa Gismo standings row maps every total column", () => {
  const row = {
    pos: 1,
    team: { _id: 10, name: "Galatasaray" },
    total: 12,
    winTotal: 10,
    drawTotal: 1,
    lossTotal: 1,
    goalsForTotal: 29,
    goalsAgainstTotal: 16,
    goalDiffTotal: 13,
    pointsTotal: 31
  };
  assert.equal(readStandingsPosition(row, 99), 1);
  assert.equal(readStandingsStat(row, "total", ["played", "matches", "matchplayed"], "O"), 12);
  assert.equal(readStandingsStat(row, "total", ["won", "wins", "win"], "G"), 10);
  assert.equal(readStandingsStat(row, "total", ["drawn", "draws", "draw"], "B"), 1);
  assert.equal(readStandingsStat(row, "total", ["lost", "losses", "loss"], "M"), 1);
  assert.deepEqual(readStandingsGoals(row, "total"), [29, 16]);
  assert.equal(readStandingsStat(row, "total", ["goalsdiff", "goaldifference", "goal_diff"], "+/-"), 13);
  assert.equal(readStandingsStat(row, "total", ["points", "pts"], "P"), 31);
});

test("actual Iddaa Gismo home and away columns use mode suffixes", () => {
  const row = {
    total: 12, home: 6, away: 6,
    winHome: 5, drawHome: 1, lossHome: 0,
    goalsForHome: 18, goalsAgainstHome: 7, goalDiffHome: 11, pointsHome: 16,
    winAway: 5, drawAway: 0, lossAway: 1,
    goalsForAway: 11, goalsAgainstAway: 9, goalDiffAway: 2, pointsAway: 15
  };
  assert.equal(readStandingsStat(row, "home", ["played", "matches"], "O"), 6);
  assert.equal(readStandingsStat(row, "home", ["win"], "G"), 5);
  assert.equal(readStandingsStat(row, "home", ["draw"], "B"), 1);
  assert.equal(readStandingsStat(row, "home", ["loss"], "M"), 0);
  assert.deepEqual(readStandingsGoals(row, "home"), [18, 7]);
  assert.equal(readStandingsStat(row, "home", ["goalsdiff"], "+/-"), 11);
  assert.equal(readStandingsStat(row, "home", ["points"], "P"), 16);
  assert.equal(readStandingsStat(row, "away", ["played"], "O"), 6);
  assert.deepEqual(readStandingsGoals(row, "away"), [11, 9]);
  assert.equal(readStandingsStat(row, "away", ["points"], "P"), 15);
});

test("legacy underscore fields and nested mode groups remain supported", () => {
  const row = {
    _pos: 1, _played: 12, _win: 10, _draw: 1, _loss: 1,
    _goalsfor: 29, _goalsagainst: 16, _goalsdiff: 13, _points: 31
  };
  assert.equal(readStandingsPosition(row, 99), 1);
  assert.equal(readStandingsStat(row, "total", ["played"], "O"), 12);
  assert.deepEqual(readStandingsGoals(row, "total"), [29, 16]);
  assert.equal(readStandingsStat(row, "total", ["points"], "P"), 31);
  const split = { home: { _played: 6, _points: 16, _goalsfor: 18, _goalsagainst: 7 } };
  assert.equal(readStandingsStat(split, "home", ["played"], "O"), 6);
  assert.deepEqual(readStandingsGoals(split, "home"), [18, 7]);
});

test("standings normalizer preserves explicit zero values", () => {
  const row = { total: 0, winTotal: 0, drawTotal: 0, lossTotal: 0, goalsForTotal: 0, goalsAgainstTotal: 0, pointsTotal: 0 };
  assert.equal(readStandingsStat(row, "total", ["played"], "O"), 0);
  assert.equal(readStandingsStat(row, "total", ["win"], "G"), 0);
  assert.deepEqual(readStandingsGoals(row, "total"), [0, 0]);
  assert.equal(readStandingsStat(row, "total", ["points"], "P"), 0);
});
